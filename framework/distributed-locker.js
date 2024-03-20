/**
 * Created by Eric on 2023/10/19
 */
const async = require('async');
const path = require('path');
const EventEmitter = require('events');
const util = require('util');
// Framework libs
const tools = require('../utils/tools');
const sysdefs = require('../include/sysdefs');
const _MODULE_NAME = sysdefs.eFrameworkModules.DLOCKER;
const {distLocker: config} = require('../include/config');
const { CommonObject } = require('../include/base');
const eRetCodes = require('../include/retcodes');
// Create logger
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);

const _DEFAULT_TTL = sysdefs.eInterval._5_MIN;

/**
 * @typedef { Object } LockEntity
 * @prop { ObjectId } id - The entity id
 * @prop { string } modelName - The model name
 * @prop { string } dsName  - The dataSource name
 */

/**
 * @typedef { Object } LockEntityWrapper
 * @prop { ObjectId[] } ids - The entity ids
 * @prop { string } modelName - The model name
 * @prop { string } dsName - The dataSource name
 */

/**
 * @typedef { Object } LockOptions
 * @prop { boolean } auto - Clean up flag, default value is false.
 * @prop { number } ttl - The locker TTL value
 * @prop { string } owner - The entity who owns the locker
 */


/**
 * Pack lock key from entity
 * @param { LockEntity } entity - The entity object
 * @returns { string }
 */
function _packKey (entity) {
    return `${entity.dsName}:${entity.modelName}:${entity.id}`;
}

/**
 * Transfer EntityWrapper to LockEntity array
 * @param { LockEntityWrapper } ettWrapper
 */
function _parseLockEntities(ettWrapper) {
    const entities = [];
    ettWrapper.ids.forEach(id => {
        entities.push({
            id,
            modelName: ettWrapper.modelName,
            dsName: ettWrapper.dsName
        })
    })
    return entities;
}

function _createLock (options) {
    let lock = {
        caller: options.caller || 'Anonymous'
    };
    if (options.auto === true) {
        lock.ttl = options.ttl || _DEFAULT_TTL;
        lock.hTimeout = setTimeout(_ttlRemoveLock.bind(this, key), lock.ttl);
    }
    return lock;
}

function _ttlRemoveLock (key) {
    delete this._locks[key];
}

// The class
class DistributedEntityLocker extends CommonObject {
    constructor(appCtx, props) {
        super(props);
        //
        this._appCtx = appCtx;
        this._state = sysdefs.eModuleState.INIT;
        this._LastError = null;
        //
        this._persistant = props.persistant !== undefined? props.persistant : false;
        this._locks = {};
        this._redisClient = null;
    }
    async init (config) {
        if (this._state !== sysdefs.eModuleState.INIT) {
            logger.warn(`[${this.$name}]: already initialized.`)
            return true;
        }
        this._engine = config.engine || sysdefs.eCacheEngine.Native;
        if (this._engine === sysdefs.eCacheEngine.Native) {
            this._state = sysdefs.eModuleState.ACTIVE;
            return true;
        }
        // Init redis client
        try {
            this._redisClient = this._appCtx.redisManager.createClient(`def@${this.$name}`, 'default', config.options);
            this._state = sysdefs.eModuleState.ACTIVE;
            return true;
        } catch (ex) {
            logger.error(`[${this.$name}]: Create redis-client error! - ${ex.message}`);
            this.lastError = ex.message;
            return false;
        }
    }
    // Implement methods
    /**
     * Lock single domain entity
     * @param { LockEntity } entity
     * @param { LockOptions? } options
     * @param { function } callback
     */
    lockOne (entity, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        if (this._state !== sysdefs.eModuleState.ACTIVE) {
            return callback({
                code: eRetCodes.SERVICE_UNAVAILABLE,
                message: this.lastError
            })
        }
        let key = _packKey(entity);
        if (this._engine === sysdefs.eCacheEngine.Native) {
            if (this._locks[key] !== undefined) {
                this.lastError = `Specified entity has been locked by ${this._locks[key].caller}`;
                return callback({
                    code: eRetCodes.CONFLICT,
                    message: this.lastError
                })
            }
            this._locks[key] = _createLock.call(this, options);
            return callback(null, key);
        }
        this._redisClient.execAsync('set', key, 1, 'EX', 5, 'NX')
            .then(r => { 
                if (r === 1) {
                    return callback(null, true);
                }
                return callback({
                    code: eRetCodes.CONFLICT,
                    message: `locked!`
                }); 
            })
            .catch(err => {return callback(err); })
    }
    lockOneAsync = util.promisify(this.lockOne)
    /**
     * Unlock single domain entity 
     * @param { string } key - The key of a lock
     */
    unlockOne (key, callback) {
        let locker = this._locks[key];
        if (locker.hTimeout) {
            clearTimeout(locker.hTimeout);
        }
        delete this._locks[key];
        return callback(null, key);
    }
    unlockOneAsync = util.promisify(this.unlockOne)

    /**
     * Lock multiple domain entities
     * @param { (LockEntity[]|LockEntityWrapper) } args - The domain entities array
     * @param { LockOptions } options
     * @param { function } callback
     */
    lockMany (args, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        const entities = tools.isTypeOfArray(args)? args : _parseLockEntities(args);
        // Check all entites
        let locks = {};
        let err = null;
        for (let i = 0; i < entities.length && !err; i++) {
            let key = _packKey(entities[i]);
            if (this._locks[key] !== undefined) {
                err = {
                    code: eRetCodes.CONFLICT,
                    message: `One of the specified entity: ${key} has beed locked by ${this._locks[key].caller}}`
                }
            } else {
                locks[key] = _createLock.call(this, options);
            }
        }
        if (err) {
            return callback(err);
        }
        let keys = Object.keys(locks);
        keys.forEach(key => {
            this._locks[key] = locks[key];
        });
        return callback(null, keys);
    }
    lockManyAsync = util.promisify(this.lockMany);
    /**
     * Unlock multiple domain entities
     * @param { string[] } keys - The keys of all lock 
     * @param { function } callback 
     * @returns 
     */
    unlockMany (keys, callback) {
        keys.forEach(key => {
            let lock = this._locks[key];
            if (lock.hTimeout) { // Stop timer if exists
                clearTimeout(lock.hTimeout);
            }
            delete this._locks[key];
        });
        return callback(null, keys);
    }
    unlockManyAsync = util.promisify(this.unlockMany);
    
    /**
     * Pagination list lockers - list all currently
     * @param {*} param0 
     * @param {*} callback 
     * @returns 
     */
    list ({pageSize, pageNum, page}, callback) {
        return callback(null, Object.keys(this._locks));
    }
    listAsync = util.promisify(this.list);
}

module.exports = exports = {
    DistributedEntityLocker
};
