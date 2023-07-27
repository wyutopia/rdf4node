/**
 * Created by Eric on 2023/02/25
 */
const path = require('path');
const appRoot = require('app-root-path');
//
const sysdefs = require('../include/sysdefs')
const eRetCodes = require('../include/retcodes');
const {EventModule, EventObject, sysEvents} = require('../include/events');
const {sysConf, winstonWrapper: {WinstonLogger}} = require('../libs');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');
const redisWrapper = require('../libs/common/redis.wrapper');

const _MODULE_NAME = sysdefs.eFrameworkModules.CACHE;
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
    logLevel: 'error',
    engine: sysdefs.eCacheEngine.PROCMEM,   // Set default cache to local process memory
    configName: 'default',
    //
    prefix: null,                       // No default key prefix
    dataType: eDataType.Kv,
    json: true,
    loadPolicy: eLoadPolicy.SetAfterFound,
    keyName: '_id',
    KeyNameTemplate: null,
    populate: null,
    select: null,
    valueKeys: null
};

function _initCache (options) {
    Object.keys(_defaultCacheProps).forEach( key => {
        let propKey = `_${key}`;
        this[propKey] = options[key] !== undefined? options[key] : _defaultCacheProps[key];
    });
}

function _setValue (key, val, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
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

const _fakeClient = {
    execute: function(method, ...args) {
        let callback = args[args.length - 1];
        return callback({
            code: eRetCodes.BAD_REQUEST,
            message: 'Returned from fakeClient!'
        });
    }
}
// The cache class
class Cache extends EventModule {
    constructor(props) {
        super(props);
        //
        _initCache.call(this, props.spec);
        this._dataRepo = {};
        this._client = null;
        // Implementing all the cache operation methods
        this.set = (key, val, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = undefined;
            }
            if (this._engine === sysdefs.eCacheEngine.PROCMEM) {
                return _setValue.call(this, key, val, options, callback);
            }
            return this._client.execute('set', key, this._json? JSON.stringify(val) : val, callback);
        };
        this.unset = (key, callback) => {
            if (this._engine === sysdefs.eCacheEngine.PROCMEM) {
                return _unsetValue.call(this, key, callback);
            }
            return this._client.execute('unset', key, callback);
        };
        this.get = (key, callback) => {
            if (this._engine === sysdefs.eCacheEngine.PROCMEM) {
                return _getvalue.call(this, key, callback);
            }
            this._client.execute('get', key, (err, result) => {
                if (err) {
                    return callback(err);
                }
                return callback(null, this._json? JSON.parse(result) : result);
            });
        };
        //
        (() => {
            if (this._engine !== sysdefs.eCacheEngine.PROCMEM) {
                // Extract client config from system configuration
                let clientConfig = tools.safeGetJsonValue(sysConf.caches, `${this._engine}.${this._configName}`);
                if (clientConfig) {
                    this._client = redisWrapper.createClient(props.$name, clientConfig);
                } else {
                    this._client = _fakeClient;
                }
            }
        })()
    }
}

// The cache factory class
class CacheFactory extends EventModule {
    constructor(props) {
        super(props);
        //
        this._caches = {};
        this.getCache = (name, cacheSpecOptions) => {
            if (this._caches[name] === undefined) {
                this._caches[name] = new Cache({
                    $name: name,
                    spec: cacheSpecOptions
                });
                logger.info(`Cache ${name} : ${tools.inspect(cacheSpecOptions)} created.`);
            }
            return this._caches[name];
        };
    }
};

// Declaring cache singleton and set module exports
module.exports = exports = {
    _CACHE_DEFAULT_: 'default',
    eDataType: eDataType,
    eLoadPolicy: eLoadPolicy,
    cacheFactory: new CacheFactory({
        $name: _MODULE_NAME
    })
};