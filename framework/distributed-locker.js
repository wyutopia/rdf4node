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
 * @prop { ObjectId } id - the entity id
 * @prop { string } modelName - The model name
 * @prop { string } dsName  - The dataSource name
 */

/**
 * @typedef { Object } LockOptions
 * @prop { boolean } auto - Clean up flag, default value is false.
 * @prop { number } ttl - The locker TTL value
 * @prop { string } owner - The entity who owns the locker
 */


function _packKey (entity) {
    return `${entity.modelName}:${entity.id}`;
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
    constructor(props) {
        super(props);
        //
        this._persistant = props.persistant !== undefined? props.persistant : false;
        this._locks = {};
        // Implement methods
        /**
         * Lock single domain entity
         * @param { LockEntity } entity
         * @param { LockOptions } options
         * @param { function } callback
         */
        this.lockOne = (entity, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            let key = _packKey(entity);
            if (this._locks[key] !== undefined) {
                return callback({
                    code: eRetCodes.CONFLICT,
                    message: `Specified entity has been locked by ${this._locks[key].caller}`
                })
            }
            this._locks[key] = _createLock.call(this, options);
            return callback(null, key);
        },
        this.lockOneAsync = util.promisify(this.lockOne);
        
        /**
         * Unlock single domain entity 
         * @param { string } key - The key of a lock
         */
        this.unlockOne = (key, callback) => {
            let locker = this._locks[key];
            if (locker.hTimeout) {
                clearTimeout(locker.hTimeout);
            }
            delete this._locks[key];
            return callback(null, key);
        },
        this.unlockOneAsync = util.promisify(this.unlockOne);

        /**
         * Lock multiple domain entities
         * @param { LockEntity[] } entities - The domain entities array
         * @param { LockOptions } options
         * @param { function } callback
         */
        this.lockMany = (entities, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
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
        },
        this.lockManyAsync = util.promisify(this.lockMany);
        /**
         * Unlock multiple domain entities
         * @param { string[] } keys - The keys of all lock 
         * @param { function } callback 
         * @returns 
         */
        this.unlockMany = (keys, callback) => {
            keys.forEach(key => {
                let lock = this._locks[key];
                if (lock.hTimeout) { // Stop timer if exists
                    clearTimeout(lock.hTimeout);
                }
                delete this._locks[key];
            });
            return callback(null, keys);
        }
        this.unlockManyAsync = util.promisify(this.unlockMany);
        //
        this.list = ({pageSize, pageNum, page}, callback) => {
            return callback(null, Object.keys(this._locks));
        },
        this.listAsync = util.promisify(this.listPartial);
    }
}

module.exports = new DistributedEntityLocker({
    $name: _MODULE_NAME
});
