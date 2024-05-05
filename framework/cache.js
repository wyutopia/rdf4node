/**
 * Created by Eric on 2023/02/25
 */
const appRoot = require('app-root-path');
const path = require('path');
const util = require('util');
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

const _REDIS_OK = 'OK';
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

/**
 * 
 * @param { string } key - The user provided key 
 * @param { boolean } timeout - Indicate whether call from ttl timeout
 */
function _removeEntry(key, timeout = true) {
    let realKey = this._prefix ? `${this._prefix}:${key}` : key;
    if (this._dataRepo[realKey]) {
        if (!timeout && this._dataRepo[realKey].ttl) {
            clearTimeout(this._dataRepo[realKey].ttl);
            this._dataRepo[realKey].ttl = null;
        }
        delete this._dataRepo[realKey];
    }
}

/**
 * 
 * @param {string} key 
 * @param {string|Object} val 
 * @param {Object} options
 * @param {number?} options.ttl
 * @returns 
 */
async function _setValue(key, val, options = {}) {
    let realKey = this._prefix ? `${this._prefix}:${key}` : key;
    if (this._dataRepo[realKey] && this._dataRepo[realKey].ttl) {
        clearTimeout(this._dataRepo[realKey].ttl);
    }
    this._dataRepo[realKey] = {
        value: val,
        ttl: options.ttl? setTimeout(_removeEntry.bind(this, key, true), options.ttl * 1000) : null
    }
    return 1;
}

/**
 * 
 * @param {string} key 
 * @param {number} n 
 * @returns 
 */
async function _incrBy(key, n) {
    let realKey = this._prefix ? `${this._prefix}:${key}` : key;
    if (this._dataRepo[realKey] === undefined) {
        this._dataRepo[realKey] = {
            value: n,
            ttl: null
        }
        return n;
    }
    if (Number.isNaN(this._dataRepo[realKey].value)) {
        return Promise.reject({
            code: eRetCodes.REDIS_ERR_NAN,
            message: `!!! Not number for key: ${key}`
        })        
    }
    this._dataRepo[realKey].value += n;
    return this._dataRepo[realKey].value;
}

/**
 * Set multiple KVs
 * @param { Object } kvMap 
 * @param {*} options
 */
async function _setManyValues(kvMap, options = {}) {
    const keys = Object.keys(kvMap);
    keys.forEach(key => {
        let realKey = this._prefix ? `${this._prefix}:${key}` : key;
        if (this._dataRepo[realKey] && this._dataRepo[realKey].ttl) {
            clearTimeout(this._dataRepo[realKey].ttl);
        }
        this._dataRepo[realKey] = {
            value: kvMap[key],
            ttl: options.ttl? setTimeout(_removeEntry.bind(this, key, true), options.ttl * 1000) : null
        }
    })
    return keys.length;
}

/**
 * 
 * @param {string} key 
 * @returns 
 */
async function _delValue(key) {
    _removeEntry.call(this, key, false);
    return 1;
}

/**
 * 
 * @param {string[]} keys 
 * @returns { Promise<number> }
 */
async function _delManyValues(keys) {
    keys.forEach(key => {
        _removeEntry.call(this, key, false);
    })
    return keys.length;
}

/**
 * 
 * @param {string} key 
 * @returns { Promise<*> }
 */
async function _getValue(key) {
    let realKey = this._prefix ? `${this._prefix}:${key}` : key;
    let value = this._dataRepo[realKey]? this._dataRepo[realKey].value : undefined;
    return value;
}

/**
 * 
 * @param { string[] } keys 
 * @returns { Promise<*> }
 */
async function _getManyValues(keys) {
    const result = {};
    keys.forEach(key => {
        let realKey = this._prefix ? `${this._prefix}:${key}` : key;
        if (this._dataRepo[realKey]) {
            result[key] = this._dataRepo[realKey].value;
        }
    })
    return result;
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
    ttl: null,
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
        this._refCount = 1;
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
    incRef() {
        return ++this._refCount;
    }
    // Implementing all the cache operation methods
    /**
     * Set the key-value
     * @param { string } key 
     * @param { string | Object} val 
     * @param { Object? } options
     * @returns 
     */
    async setAsync(key, val, options = {}) {
        let ttl = options.ttl || this._ttl;
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _setValue.call(this, key, val, { ttl });
        }
        if (!this._client) {
            return Promise.reject({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            });
        }
        //
        const args = [key, typeof val === 'string'? val : JSON.stringify(val)];
        if (ttl) {
            args.push('EX', ttl)
        }
        return this._client.execAsync('SET', args);
    }
    /**
     * 
     * @param { string } key 
     * @param { number } n 
     */
    async incrAsync(key, n = 1) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _incrBy.call(this, key, n);
        }
        // Using redis
        if (!this._client) {
            return Promise.reject({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            })
        }
        //
        return this._client.execAsync('INCRBY', [key, n]);
    }

    /**
     * Get cache value by key
     * @param { string } key - The cache key
     * @returns { Promise<*> }
     */
    async getAsync(key) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _getValue.call(this, key);
        }
        if (!this._client) {
            return Promise.reject({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            })
        }
        const result = await this._client.execAsync('GET', [key]);
        try {
            const json = JSON.parse(result);
            return json;
        } catch(ex) {
            logger.warn(`*** Parse cache-value failed! - ${ex.message}`);
            return result;
        }
    }

    /**
     * Delete cache by key
     * @param { string } key - The cache key
     * @returns { Promise<*> }
     */
    async delAsync(key) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _delValue.call(this, key);
        }
        if (!this._client) {
            return Promise.reject({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            })
        }
        return this._client.execAsync('DEL', [key]);
    }

    /**
     * Set multiply KVs
     * @param { Object } kvMap - The JSON value
     * @returns 
     */
    async setManyAsync(kvMap) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _setManyValues.call(this, kvMap, { ttl: this._ttl });
        }
        if (!this._client) {
            return Promise.reject({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            })
        }
        // Pack redis command args
        let args = [];
        let keys = Object.keys(kvMap);
        keys.forEach(key => {
            let val = kvMap[key];
            args.push(key);
            args.push(typeof val === 'string'? val : JSON.stringify(val));
        });
        const result = await this._client.execAsync('MSET', args);
        return result === _REDIS_OK? keys.length : 0;
    }

    /**
     * Get multiple cache values
     * @param { string[] } keys 
     * @returns { Promise<Object> }
     */
    async getManyAsync(keys) {
        if (keys.length === 0) {
            logger.warn(`*** ${this.$name}: Empty keys!`);
            return {};
        }
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _getManyValues.call(this, keys);
        }
        // Retrieve from redis
        if (!this._client) {
            return Promise.reject({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected!'
            })
        }
        const values = await this._client.execAsync('MGET', keys);
        const result = {};
        for (let i = 0; i < keys.length; i++) {
            let key = keys[i];
            let val = values[i];
            try {
                result[key] = JSON.parse(val);
            } catch(ex) {
                logger.warn(`*** ${this.$name}: parsing cached value: ${val} error! - ${ex.message}`)
                result[key] = val;
            }
        }
        return result;
    }

    /**
     * Delete multiple cache values
     * @param { string[] } keys
     */
    async delManyAsync(keys) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _delManyValues.call(this, keys);
        }
        if (!this._client) {
            return Promise.reject({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected!'
            })
        }
        return this._client.execAsync('DEL', keys);
    }

    /**
     * Delete all cache entries
     * @returns 
     */
    async clearAsync() {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _delManyValues.call(this, Object.keys(this._dataRepo));
        }
        if (!this._client) {
            return Promise.reject({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected!'
            })
        }
        return this._client.execAsync('FLUSHDB');
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
        this._state = sysdefs.eModuleState.INIT;
    }
    async init(config) {
        Object.keys(_typeCacheProps).forEach(key => {
            const propKey = '_' + key;
            this[propKey] = config[key] !== undefined ? config[key] : _typeCacheProps[key];
        });
        this._state = sysdefs.eModuleState.ACTIVE;
        return 'ok';
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
        } else {
            let count = this._caches[name].incRef();
            logger.info(`Cache: ${name} exists. refCount=${count}`);
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