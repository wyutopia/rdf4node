/**
 * Created by Eric on 2023/02/25
 */
const path = require('path');
const appRoot = require('app-root-path');
//
const Types = require('../include/types');
const sysdefs = require('../include/sysdefs')
const eRetCodes = require('../include/retcodes');
const { EventModule, EventObject, sysEvents } = require('../include/events');
const sysConf = require('../include/config');
const _MODULE_NAME = sysdefs.eFrameworkModules.CACHE;
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');

const _CACHE_DEFAULT = 'default';
const eDataType = {
    Kv: 'kv',
    List: 'ls',
    Set: 'set',
    Map: 'map'
};

const eLoadPolicy = {
    Bootstrap: 'bootstrap',
    SetAfterFound: 'setAfterFound'
};


function _setValue(key, val, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    let realKey = this._prefix ? `${this._prefix}:${key}` : key;
    this._dataRepo[realKey] = val;
    // TODO: Start timer if necessary
    return callback(null, 1);
}

function _unsetValue(key, callback) {
    let realKey = this._prefix ? `${this._prefix}:${key}` : key;
    if (this._dataRepo[realKey] === undefined) {
        return callback(null, 0);
    }
    // TODO: Stop timer
    delete this._dataRepo[realKey];
    return callback(null, 1);
}

function _getvalue(key, callback) {
    let realKey = this._prefix ? `${this._prefix}:${key}` : key;
    return callback(null, this._dataRepo[realKey]);
}

const _fakeClient = {
    execute: function (method, ...args) {
        let callback = args[args.length - 1];
        return callback({
            code: eRetCodes.BAD_REQUEST,
            message: 'Returned from fakeClient!'
        });
    }
}

const _sampleCacheSpec = {
    allowCache: true,
    // Default value is 'native'. enum: 'native', 'redis'
    engine: 'redis',
    server: 'default',
    database: 0,
    // Default value is 'kv'.
    dataType: 'kv',
    loadPolicy: 'setAfterFound',
    // Default keyName is '_id'
    keyName: '_id',
    keyNameTemplate: 'user:project:group:tenant',
    populate: [
        {
            path: 'role',
            select: 'name permissions',
            populate: { path: 'permissions', select: 'resource operations' }
        }
    ],
    select: 'user project group tenant role',
    valueKeys: 'user project group tenant role'
};



const _defaultCacheProps = {
    logLevel: 'error',
    engine: sysdefs.eCacheEngine.Native,   // Set default cache to local process memory
    server: 'default',
    database: 0,
    prefix: null,                       // No default key prefix
    ttl: 0,
    json: true,
}

/**
 * Initializing the cache instance with default and specififed properties
 * @param {Object} ett 
 * @param {Types.CacheProperties} props 
 */
function _initCacheEntity(ett, props) {
    Object.keys(_defaultCacheProps).forEach(key => {
        let propKey = `_${key}`;
        ett[propKey] = props[key] !== undefined ? props[key] : _defaultCacheProps[key];
    });
}

// The cache class
class Cache extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        // Define cache-entity properties
        _initCacheEntity(this, props.cacheProps);
        this._dataRepo = {};
        this._client = null;
        //
        if (this._engine == sysdefs.eCacheEngine.Redis) {
            let options = {};
            if (this._prefix) {
                options.prefix = this._prefix;
            }
            if (this._database) {
                options.database = this._database;
            }
            try {
                this._client = appCtx.redisManager.createClient(props.$name, this._server, options);
            } catch (err) {
                logger.error(err.message);
            }
        }
    }
    // Implementing all the cache operation methods
    /**
     * Set the key-value
     * @param { string } key 
     * @param { string | Object} val 
     * @param { Object } options - Set options
     * @param { Number } options.ttl - The ttl value in milesecond 
     * @param { * } callback 
     * @returns 
     */
    set(key, val, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = undefined;
        }
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _setValue.call(this, key, val, options, callback);
        }
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            });
        }
        return this._client.execute('set', key, this._json ? JSON.stringify(val) : val, callback);
    }
    get(key, callback) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _getvalue.call(this, key, callback);
        }
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            });
        }
        this._client.execute('get', key, (err, result) => {
            if (err) {
                return callback(err);
            }
            return callback(null, this._json ? JSON.parse(result) : result);
        });
    }
    unset(key, callback) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _unsetValue.call(this, key, callback);
        }
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            });
        }
        return this._client.execute('unset', key, callback);
    }
    /**
     * Set multiply KVs
     * @param { Object } data - The JSON value
     * @param {*} options 
     * @param {*} callback 
     * @returns 
     */
    mset(data, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _setMultiValues.call(this, data, options, callback);
        }
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            });
        }
        let args = [];
        Object.keys(data).forEach(key => {
            args.push(key);
            args.push(data[key].toString());
        });
        args.push(callback);
        return this._client.invokeApply('mset', args);
    };
    mget(keys, callback) {
        return callback({
            code: eRetCodes.REDIS_METHOD_NOTEXISTS,
            message: 'Method not available!'
        });
    }
}

const _typeCacheProps = {
    shareConnection: false,
    shareDatabase: false
}
// The cache factory class
class CacheFactory extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this._caches = {};
        this._redisFactory = null;
        this._state = sysdefs.eModuleState.INIT;
    }
    init(config) {
        Object.keys(_typeCacheProps).forEach(key => {
            const propKey = '_' + key;
            this[propKey] = config[key] !== undefined ? config[key] : _typeCacheProps[key];
        });
        if (config.redis) {
            this._redisFactory = new RedisFactory(this, {
                $name: `redis@${this.$name}`,
                config: config.redis
            });
        }
        this._state = sysdefs.eModuleState.ACTIVE;
    }
    /**
     * 
     * @param {string} name - The repository name
     * @param {Types.CacheProperties} cacheProps 
     * @returns 
     */
    getCache(name, cacheProps) {
        if (this._caches[name] === undefined) {
            this._caches[name] = new Cache(this._appCtx, {
                $name: `${name}@${cacheProps.server || _CACHE_DEFAULT}`,
                cacheProps
            });
            logger.info(`Create new CacheEntity <${name}> with client config: ${tools.inspect(cacheProps)}.`);
        }
        return this._caches[name];
    }
}


const _defaultCacheSpec = {
    dataType: eDataType.Kv,
    loadPolicy: eLoadPolicy.SetAfterFound,
    keyName: '_id',
    keyNameTemplate: null,
    populate: null,
    select: null,
    valueKeys: null,
    // The cache entity properties holder
    props: null
}

/**
 * 
 * @param {Types.CacheSpecOptions} options 
 * @returns 
 */
function _initCacheSpec(options) {
    let spec = {};
    Object.keys(_defaultCacheSpec).forEach(key => {
        spec[key] = options[key] !== undefined ? options[key] : _defaultCacheSpec[key];
    });
    return spec;
}

// Declaring cache singleton and set module exports
module.exports = exports = {
    _CACHE_DEFAULT_: _CACHE_DEFAULT,
    eDataType: eDataType,
    eLoadPolicy: eLoadPolicy,
    initCacheSpec: _initCacheSpec,
    CacheFactory
};