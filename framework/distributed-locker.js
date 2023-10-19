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

const _errConflict = {
    code: eRetCodes.CONFLICT,
    message: ''
}

function _packKey (entity) {
    return `${entity.modelName}:${entity.id}`;
}

function _ttlClearLocker (key) {
    delete this._lockers[key];
}

// The class
class DistributedEntityLocker extends CommonObject {
    constructor(props) {
        super(props);
        //
        this._persistant = props.persistant !== undefined? props.persistant : false;
        this._lockers = {};
        // Implement methods
        this.lockOne = (entity, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            let key = _packKey(entity);
            if (this._lockers[key] !== undefined) {
                return callback({
                    code: eRetCodes.CONFLICT,
                    message: `Specified entity has been locked by ${this._lockers[key].caller}`
                })
            }
            let locker = {
                caller: options.caller || 'Anonymous'
            };
            if (options.auto === true) {
                locker.ttl = options.ttl || _DEFAULT_TTL;
                locker.hTimeout = setTimeout(_ttlClearLocker.bind(this, key), locker.ttl);
            }
            this._lockers[key] = locker;
            return callback(null, key);
        },
        this.unlockOne = (key, callback) => {
            let locker = this._lockers[key];
            if (locker.hTimeout) {
                clearTimeout(locker.hTimeout);
            }
            delete this._lockers[key];
            return callback(null, key);
        },
        this.lockMany = (entities, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            // Check all entites
            let lockers = {};
            let err = null;
            for (let i = 0; i < entities.length && !err; i++) {

            }
            if (err) {
                return callback(err);
            }
            let keys = Object.keys(lockers);
            keys.forEach(key => {
                this._lockers[key] = lockers[key];
            });
            return callback(null, keys);
        },
        this.unlockMany = (keys, callback) => {
            keys.forEach(key => {
                let locker = this._lockers[key];
                if (locker.hTimeout) { // Stop timer if exists
                    clearTimeout(locker.hTimeout);
                    hTimeout = null;
                }
                delete this._lockers[key];
            });
            return callback(null, keys);
        }
    }
}

module.exports = new DistributedEntityLocker({
    $name: _MODULE_NAME
});
