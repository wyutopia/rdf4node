/**
 * Created by Eric on 2023/02/25
 */
const path = require('path');
const appRoot = require('app-root-path');
const bootstrapConf = require(path.join(appRoot.path, 'conf/bootstrap.js'));
//
const sysdefs = require('../include/sysdefs')
const _MODULE_NAME = sysdefs.eFrameworkModules.CACHE;
const eRetCodes = require('../include/retcodes');
const {EventModule, EventObject, sysEvents} = require('../include/events');
const {winstonWrapper: {WinstonLogger}} = require('../libs');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');

const eDataType = {
    Kv              : 'kv',
    List            : 'ls',
    Set             : 'set',
    Map             : 'map'
};

const eLoadPolicy = {
    Bootstrap      : 'bootstrap',
    SetAfterFound  : 'setAfterFound'
};

const _defaultCacheProps = {
    type: sysdefs.eCacheType.PROCMEM,   // Set default cache to local process memory
    prefix: null,                       // No default key prefix
};

function _initCache (options) {
    Object.keys(_defaultCacheProps).forEach( key => {
        let propKey = `_${key}`;
        this[propKey] = options[key] !== undefined? options[key] : _defaultCacheProps[key];
    });
}

function _setValue (key, val, ttl = 0, callback) {
    let realKey = this._prefix? `${this._prefix}:${key}` : key;
    this._dataRepo[realKey] = val;
    // TODO: Start timer if necessary
    return callback(null, 1);
}

function _unsetValue (key, callback) {
    let realKey = this._prefix? `${this._prefix}:${key}` : key;
    if (this._dataRepo[realKey] === undefined) {
        return callback(null, 0);
    }
    // TODO: Stop timer
    delete this._dataRepo[realKey];
    return callback(null, 1);
}

function _getvalue (key, callback) {
    let realKey = this._prefix? `${this._prefix}:${key}` : key;
    return callback(null, this._dataRepo[realKey]);
}

// The cache class
class Cache extends EventModule {
    constructor(props) {
        super(props);
        //
        _initCache.call(this, props.specOptions);
        this._dataRepo = {};
        // Implementing all the cache operation methods
        this.set = (key, val, ttl = 0, callback) => {
            if (typeof ttl === 'function') {
                callback = ttl;
                ttl = 0;
            }
            return _setValue.call(this, key, val, ttl, callback);
        };
        this.unset = (key, callback) => {
            return _unsetValue.call(this, key, callback);
        };
        this.get = (key, callback) => {
           return _getvalue.call(this, key, callback);
        };
    }
}

// The cache factory class
class CacheFactory extends EventModule {
    constructor(props) {
        super(props);
        //
        this._caches = {};
        this.getCache = (name, cacheSpecOptions, callback) => {
            let db = cacheSpecOptions.db || 0;
            let bktId = `${name}#${db}`;
            if (this._caches[bktId] === undefined) {
                this._caches[bktId] = new Cache({
                    name: name,
                    specOptions: cacheSpecOptions
                });
            }
            return this._caches[bktId];
        };
    }
};

// Declaring cache singleton and set module exports
module.exports = exports = {
    _CACHE_DEFAULT_: 'default',
    eDataType: eDataType,
    eLoadPolicy: eLoadPolicy,
    cacheFactory: new CacheFactory({
        name: _MODULE_NAME
    })
};