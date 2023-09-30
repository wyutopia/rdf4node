/**
 * Created by Eric on 2023/02/25
 */
const path = require('path');
const appRoot = require('app-root-path');
//
const sysdefs = require('../include/sysdefs')
const eRetCodes = require('../include/retcodes');
const {EventModule, EventObject, sysEvents} = require('../include/events');
const sysConf = require('../include/config');
const _MODULE_NAME = sysdefs.eFrameworkModules.CACHE;
const {WinstonLogger} =  require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');
const redisWrapper = require('../libs/common/redis.wrapper');

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

const _sampleCacheSpec = {
    // Default value is 'native'. enum: 'native', 'redis'
    engine: 'redis',
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
    valueKeys: 'user project group tenant role',
    allowCache: true,
    //
    server: 'default',
    database: 0
};

// model.cacheSpec + config.caches[modelName] + config.redis.servers[serverName];
const _defaultCacheProps = {
    allowCache: false,
    logLevel: 'error',
    //
    engine: sysdefs.eCacheEngine.Native,   // Set default cache to local process memory
    server: 'default',
    database: 0,
    prefix: null,                       // No default key prefix
    ttl: 0, 
    //
    dataType: eDataType.Kv,
    json: true,
    loadPolicy: eLoadPolicy.SetAfterFound,
    keyName: '_id',
    keyNameTemplate: null,
    populate: null,
    select: null,
    valueKeys: 'username name title',
};

function _initCache (props, workMode = 0) { // 0: init cache object  1: init cacheSpec variable
    Object.keys(_defaultCacheProps).forEach( key => {
        let propKey = workMode === 0? `_${key}` : key;
        this[propKey] = props[key] !== undefined? props[key] : _defaultCacheProps[key];
    });
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
            if (this._engine === sysdefs.eCacheEngine.Native) {
                return _setValue.call(this, key, val, options, callback);
            }
            return this._client.execute('set', key, this._json? JSON.stringify(val) : val, callback);
        };
        this.get = (key, callback) => {
            if (this._engine === sysdefs.eCacheEngine.Native) {
                return _getvalue.call(this, key, callback);
            }
            this._client.execute('get', key, (err, result) => {
                if (err) {
                    return callback(err);
                }
                return callback(null, this._json? JSON.parse(result) : result);
            });
        };
        this.unset = (key, callback) => {
            if (this._engine === sysdefs.eCacheEngine.Native) {
                return _unsetValue.call(this, key, callback);
            }
            return this._client.execute('unset', key, callback);
        };
        //
        this.mset = (data, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            if (this._engine === sysdefs.eCacheEngine.Native) {
                return _setMultiValues.call(this, data, options, callback);
            }
            let args = [];
            Object.keys(data).forEach(key => {
                args.push(key);
                args.push(data[key].toString());
            });
            args.push(callback);
            return this._client.invokeApply('mset', args);
        };
        this.mget = (keys, callback) => {
            return callback({
                code: eRetCodes.REDIS_METHOD_NOTEXISTS,
                message: 'Method not available!'
            });
        };
        //
        (() => {
            if (this._engine !== sysdefs.eCacheEngine.Native) {
                let options = {};
                if (this._prefix) {
                    options.prefix = this._prefix;
                }
                if (this._database) {
                    options.database = this._database;
                }
                this._client = redisWrapper.createClient(props.$name, this._server, options);
                //this._client = _fakeClient;
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
                    $name: `${name}@${cacheSpecOptions.server || _CACHE_DEFAULT_}`,
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
    initCacheSpec: _initCache,
    cacheFactory: new CacheFactory({
        $name: _MODULE_NAME
    })
};