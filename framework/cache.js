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

function _removeEntry(key) {
    let realKey = this._prefix ? `${this._prefix}:${key}` : key;
    if (this._dataRepo[realKey]) {
        if (this._dataRepo[realKey].ttl) {
            clearTimeout(this._dataRepo[realKey].ttl);
        }
        delete this._dataRepo[realKey];
    }
}

function _setValue(key, val, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    let realKey = this._prefix ? `${this._prefix}:${key}` : key;
    if (this._dataRepo[realKey] && this._dataRepo[realKey].ttl) {
        clearTimeout(this._dataRepo[realKey].ttl);
    }
    this._dataRepo[realKey] = {
        value: val,
        ttl: options.ttl? setTimeout(_removeEntry.bind(this, key), options.ttl * 1000) : null
    }
    return callback(null, 1);
}

function _incrBy(key, n, callback) {
    let realKey = this._prefix ? `${this._prefix}:${key}` : key;
    if (this._dataRepo[realKey] === undefined) {
        this._dataRepo[realKey] = {
            value: n,
            ttl: null
        }
        return callback(null, n);
    }
    if (Number.isNaN(this._dataRepo[realKey].value)) {
        return callback({
            code: eRetCodes.REDIS_ERR_NAN,
            message: `!!! Not number for key: ${key}`
        })        
    }
    this._dataRepo[realKey].value += n;
    return callback(null, this._dataRepo[realKey].value)
}
/**
 * 
 * @param { Object } kvMap 
 * @param {*} options 
 * @param {*} callback 
 */
function _setManyValues(kvMap, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    const keys = Object.keys(kvMap);
    keys.forEach(key => {
        let realKey = this._prefix ? `${this._prefix}:${key}` : key;
        if (this._dataRepo[realKey] && this._dataRepo[realKey].ttl) {
            clearTimeout(this._dataRepo[realKey].ttl);
        }
        this._dataRepo[realKey] = {
            value: kvMap[key],
            ttl: options.ttl? setTimeout(_removeEntry.bind(this, key), options.ttl * 1000) : null
        }
    })
    return callback(null, keys.length);
}

function _delValue(key, callback) {
    _removeEntry.call(this, key);
    return callback(null, 1);
}

function _delManyValues(keys, callback) {
    keys.forEach(key => {
        _removeEntry.call(this, key);
    })
    return callback(null, keys.length);
}

function _getValue(key, callback) {
    let realKey = this._prefix ? `${this._prefix}:${key}` : key;
    let value = this._dataRepo[realKey]? this._dataRepo[realKey].value : undefined;
    return callback(null, value);
}

function _getManyValues(keys, callback) {
    const result = {};
    keys.forEach(key => {
        let realKey = this._prefix ? `${this._prefix}:${key}` : key;
        if (this._dataRepo[realKey]) {
            result[key] = this._dataRepo[realKey].value;
        }
    })
    return callback(null, result);
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
     * @param { * } callback 
     * @returns 
     */
    set(key, val, callback) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _setValue.call(this, key, val, { ttl: this._ttl }, callback);
        }
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            });
        }
        //
        const args = [key, typeof val === 'string'? val : JSON.stringify(val)];
        if (this._ttl) {
            args.push('EX', this._ttl)
        }
        return this._client.execute('SET', args, callback);
    }
    setAsync = util.promisify(this.set);
    /**
     * 
     * @param {*} key 
     * @param {*} n 
     * @param {*} callback 
     */
    incr(key, n, callback) {
        if (typeof n === 'function') {
            callback = n;
            n = 1;
        }
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _incrBy.call(this, key, n, callback);
        }
        // Using redis
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            });
        }
        //
        return this._client.execute('INCRBY', [key, n], callback);
    }
    incrAsync = util.promisify(this.incr);

    /**
     * 
     * @param { string } key - key
     * @param {*} callback 
     * @returns 
     */
    get(key, callback) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _getValue.call(this, key, callback);
        }
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            });
        }
        this._client.execute('GET', [key], (err, result) => {
            if (err) {
                return callback(err);
            }
            return callback(null, this._json ? JSON.parse(result) : result);
        });
    }
    getAsync = util.promisify(this.get)
    /**
     * 
     * @param { string } key 
     * @param {*} callback 
     * @returns 
     */
    del(key, callback) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _delValue.call(this, key, callback);
        }
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            });
        }
        return this._client.execute('DEL', [key], callback);
    }
    delAsync = util.promisify(this.del)
    /**
     * Set multiply KVs
     * @param { Object } kvMap - The JSON value
     * @param {*} callback 
     * @returns 
     */
    setMany(kvMap, callback) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _setManyValues.call(this, kvMap, { ttl: this._ttl }, callback);
        }
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected.'
            });
        }
        // Pack redis command args
        let args = [];
        let keys = Object.keys(kvMap);
        keys.forEach(key => {
            let val = kvMap[key];
            args.push(key);
            args.push(typeof val === 'string'? val : JSON.stringify(val));
        });
        return this._client.execute('MSET', args, (err, result) => {
            if (err) {
                return callback(err);
            }
            return callback(null, result === 'ok'? keys.length : 0)
        })
    };
    setManyAsync = util.promisify(this.setMany);
    /**
     * 
     * @param { string[] } keys 
     * @param {*} callback 
     * @returns 
     */
    getMany(keys, callback) {
        if (keys.length === 0) {
            logger.warn(`*** ${this.$name}: Empty keys!`);
            return callback(null, {});
        }
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _getManyValues.call(this, keys, callback);
        }
        // Retrieve from redis
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected!'
            })
        }
        return this._client.execute('MGET', keys, (err, values) => {
            const result = {};
            for (let i = 0; i < keys.length; i++) {
                let key = keys[i];
                let val = values[i];
                try {
                    result[key] = this._json? JSON.parse(val) : val;
                } catch(ex) {
                    logger.error(`!!! ${this.$name}: parsing value: ${val} error! - ${ex.message}`)
                }
            }
            return callback(null, result);
        })
    }
    getManyAsync = util.promisify(this.getMany)
    /**
     * 
     * @param { string[] } keys 
     * @param { number } callback 
     */
    delMany(keys, callback) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _delManyValues.call(this, keys, callback);
        }
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected!'
            })
        }
        return this._client.execute('DEL', keys, callback);
    }
    delManyAsync = util.promisify(this.delMany);

    /**
     * Delete all cache entries
     * @param {*} callback 
     * @returns 
     */
    clear(callback) {
        if (this._engine === sysdefs.eCacheEngine.Native) {
            return _delManyValues.call(this, Object.keys(this._dataRepo), callback);
        }
        if (!this._client) {
            return callback({
                code: eRetCodes.REDIS_ERR,
                message: 'Redis server not connected!'
            })
        }
        return this._client.execute('FLUSHDB', callback);
    }
    clearAsync = util.promisify(this.clear);
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