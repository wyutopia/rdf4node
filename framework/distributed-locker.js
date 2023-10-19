/**
 * Created by Eric on 2023/10/19
 */
const async = require('async');
const path = require('path');
const EventEmitter = require('events');
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

const _typeEntity = {
    dsName: 'String',      // Name of DataSource
    modelName: 'String',   // Name of DataModel
    id: 'ObjectId'         // ObjectId of entity
};

const _typeCallOptions = {
    auto: 'Boolean',       // Clean up flag, default value is false.
    ttl: 'Number',         // TTL of the locker in mileseconds
    caller: 'String'
};

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
        this.unlockOne = (key, callback) => {
            let locker = this._locks[key];
            if (locker.hTimeout) {
                clearTimeout(locker.hTimeout);
            }
            delete this._locks[key];
            return callback(null, key);
        },
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
        //
        this.listPartial = ({pageSize, pageNum, page}, callback) => {
            return callback(null, Object.keys(this._locks));
        }
    }
}

module.exports = new DistributedEntityLocker({
    $name: _MODULE_NAME
});
