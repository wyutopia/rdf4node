/**
 * Created by Eric on 2023/02/07
 */
const Types = require('../include/types');
// System libs
const async = require('async');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const util = require('util');
const appRoot = require('app-root-path');
const ObjectId = require('mongoose').Types.ObjectId;
// Framework libs
const sysdefs = require('../include/sysdefs')
const _MODULE_NAME = sysdefs.eFrameworkModules.REPOSITORY;
const eRetCodes = require('../include/retcodes');
const { EventModule, EventObject, sysEvents } = require('../include/events');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');
//
const { eDataType, eLoadPolicy, initCacheSpec } = require('./cache');

function _packCacheSafeSelect(origSelect, allowCache, cacheSpec) {
    if (!origSelect || allowCache === false || !cacheSpec.select) {
        return origSelect;
    }
    const origSelKeys = typeof origSelect === 'string' ? origSelect.split(' ') : Object.keys(origSelect || {});
    if (origSelKeys[0].slice(0, 1) === '-') { // The original select is an exclusion projection, using cacheSpec.select instead
        return cacheSpec.select;
    }
    cacheSpec.select.split(' ').forEach(key => {
        if (origSelKeys.indexOf(key) === -1) {
            origSelKeys.push(key);
        }
    });
    return origSelKeys.join(' ');
}

function _packCacheSafePopulate(origPopulate, allowCache, cacheSpec) {
    if (allowCache === false || !cacheSpec.populate) {
        return origPopulate;
    }
    const origArr = origPopulate ? (tools.isTypeOfArray(origPopulate) ? origPopulate : [origPopulate]) : [];
    const cacheArr = tools.isTypeOfArray(cacheSpec.populate) ? cacheSpec.populate : [cacheSpec.populate];
    return origArr.concat(cacheArr);
}

/**
 * 
 * @param {Object} query - The query promise 
 * @param {Types.QueryOptions} options - The additional query options 
 * @param {function} callback 
 */
function _uniQuery(query, options, callback) {
    const select = _packCacheSafeSelect(options.select, this.allowCache || false, this.cacheSpec);
    if (select) {
        query.select(select)
    }
    const populate = _packCacheSafePopulate(options.populate, this.allowCache || false, this.cacheSpec);
    if (populate) {
        query.populate(populate);
    }
    // 
    ['sort', 'skip', 'limit'].forEach(method => {
        if (options[method]) {
            query[method](options[method]);
        }
    });
    return query.exec((err, result) => {
        if (err) {
            let msg = `Query error! - ${err.message}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.DB_QUERY_ERR,
                message: msg
            });
        }
        if (options.allowEmpty || result) {
            return callback(null, result);
        }
        return callback({
            code: eRetCodes.NOT_FOUND,
            message: `${this.$name}: Specified document not exists!`
        });
    });
}

/**
 * 
 * @param {Types.UpdateOptions} params 
 * @callback
 */
function _updateOne(params, callback) {
    if (typeof params === 'function') {
        callback = params;
        params = {};
    }
    if (!this._model) {
        return callback({
            code: eRetCodes.DB_ERROR,
            message: 'Model should be initialized before using!'
        });
    }
    //
    let filter = params.filter || {};
    let updates = params.updates || {};
    let options = params.options || { new: true };
    if (Object.keys(updates).length === 0) {
        let msg = `Empty updates! - ${tools.inspect(updates)}`;
        logger.debug(msg);
        return callback({
            code: eRetCodes.OP_FAILED,
            message: msg
        });
    }
    if (options.new === undefined) {
        options.new = true;
    }
    if (this.$name && this.$name.split('@').includes('Diagram')) {
        logger.debug(`Update: ${this.$name} - ${tools.inspect(filter)}`);
    } else {
        logger.debug(`Update: ${this.$name} - ${tools.inspect(filter)} - ${tools.inspect(updates)} - ${tools.inspect(options)}`);
    }
    //
    const query = this._model.findOneAndUpdate(filter, updates, options);
    const select = _packCacheSafeSelect(params.select, this.allowCache || false, this.cacheSpec);
    if (select) {
        query.select(select)
    }
    const populate = _packCacheSafePopulate(params.populate, this.allowCache || false, this.cacheSpec);
    if (populate) {
        query.populate(populate);
    }
    if (params.sort) {
        query.sort(params.sort);
    }
    query.exec((err, doc) => {
        if (err) {
            let msg = `Update ${this.$name} error! - ${err.message}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.DB_UPDATE_ERR,
                message: msg
            });
        }
        if (!doc) {
            if (params.allowEmpty) {
                return callback(null, null);
            }
            let msg = `Specified ${this.$name} not found! - ${tools.inspect(filter)}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.NOT_FOUND,
                message: msg
            });
        }
        // Append cache
        _appendCache.call(this, doc, { updates: updates }, () => {
            return callback(null, doc);
        });
    });
}

/**
 * Get cacheKey from data by cacheSpec
 * @param {(string|Object)} data 
 * @param {Types.CacheSpecOptions} cacheSpec 
 * @returns {string}
 */
function _parseCacheKey(data, cacheSpec) {
    //logger.debug(`Parse cacheKey: ${tools.inspect(data)} - ${tools.inspect(cacheSpec)}`);
    if (tools.isTypeOfPrimitive(data)) {
        return data;
    }
    if (cacheSpec.keyNameTemplate) {
        let keyNameArray = [];
        cacheSpec.keyNameTemplate.split(':').forEach(field => {
            keyNameArray.push(data[field] === undefined ? '*' : tools.purifyObjectId(data[field]));
        });
        const cacheKey = keyNameArray.join(':');
        //logger.debug(`Parse cacheKey: ${tools.inspect(data)} - ${cacheKey}`);
        logger.debug(`The cacheKey: ${cacheKey}`);
        return cacheKey;
    }
    if (cacheSpec.keyName) {
        let cacheKey = data[cacheSpec.keyName];
        return typeof cacheKey === 'string' ? cacheKey : cacheKey.toString();
    }
    return data['_id'];
}

/**
 * Parsing the cache value from original document
 * @param {Object} doc - The document
 * @param {string} valueKeys - The value keys joined with space. ex: '_id username role'
 * @returns The real cache value
 */
function _parseCacheValue(doc, valueKeys) {
    if (!valueKeys) {
        return doc;
    }
    let cv = {};
    valueKeys.split(' ').forEach(key => {
        if (doc[key]) {
            cv[key] = doc[key];
        }
    })
    return cv;
}

const _checkPaths = ['$set', '$push', '$pull', '$addToSet', '$unset'];
function _cacheValueUpdated(valueKeys, { mandatory, updates }) {
    logger.debug(`Check cache value updates: ${valueKeys} - ${mandatory} - ${tools.inspect(updates)}`);
    if (mandatory === true || !valueKeys) {
        return true;
    }
    let result = false;
    if (!updates) {
        return result;
    }
    const cacheKeys = valueKeys.split(' ');
    for (let i = 0; i < _checkPaths.length && !result; i++) {
        const chkPath = _checkPaths[i];
        if (updates[chkPath]) {
            const chkPathKeys = Object.keys(updates[chkPath]);
            for (let j = 0; j < chkPathKeys.length && !result; j++) {
                if (cacheKeys.indexOf(chkPathKeys[j]) !== -1) {
                    result = true;
                }
            }
        }
    }
    return result;
}

function _appendCache(data, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = { mandatory: true };
    }
    if (this.allowCache === false || !data || !_cacheValueUpdated(this.cacheSpec.valueKeys, options)) {
        logger.debug(`Ignore cache updating dur no cacheValue changed!`);
        return callback(null, data);
    }
    logger.debug(`${this.$name}: Update cache with data ${tools.inspect(data)} ...`);
    let cacheValues = [];
    let docs = Array.isArray(data) ? data : [data];
    //
    async.eachLimit(docs, 3, (doc, next) => {
        let cacheKey = _parseCacheKey(doc, this.cacheSpec);
        let cacheVal = _parseCacheValue(doc.toObject(), this.cacheSpec.valueKeys);
        cacheValues.push(cacheVal);
        return this._cache.set(cacheKey, cacheVal, next);
    }, (err) => {
        if (err) {
            logger.error(`Set cache error! - ${err.message}`);
        }
        return callback(null, tools.isTypeOfArray(data) ? cacheValues : cacheValues[0]);
    });
}

/**
 * Build query filter from document data with cacheSpec
 * @param {Object} data 
 * @param {Types.CacheSpecOptions} cacheSpec 
 * @returns 
 */
function _buildQueryFilter(data, cacheSpec) {
    let filter = {};
    if (cacheSpec.keyNameTemplate) {
        cacheSpec.keyNameTemplate.split(':').forEach(key => {
            if (data[key] !== undefined) {
                filter[key] = data[key];
            }
        });
    } else if (cacheSpec.keyName) {
        filter[cacheSpec.keyName] = tools.isTypeOfPrimitive(data) ? data : data[cacheSpec.keyName];
    } else {
        filter._id = tools.isTypeOfPrimitive(data) ? data : data._id;
    }
    return filter;
}

// The repository class
class Repository extends EventObject {
    constructor(appCtx, props) {
        super(props);
        // Wire up the framework components
        this.dsFactory = appCtx.dsFactory;
        this.cacheFactory = appCtx.cacheFactory;
        this.distLocker = appCtx.distLocker;
        //
        // Set model property and declaring member variable
        this.modelName = props.modelName || 'User';
        this.modelSchema = props.modelSchema || {};
        this.modelRefs = props.modelRefs || [];
        this.dsName = props.dsName || 'default';
        this._model = null;
        this.getModel = () => {
            return this._model;
        };
        // Set cache property and declaring member variable
        this.allowCache = props.cacheOptions.enabled || false;
        this.cacheSpec = initCacheSpec(props.cacheOptions.spec || {});
        this._cache = null;
        this.getCache = () => {
            return this._cache;
        };
        // Implementing cache methods
        this.cacheGet = (keyOpt, callback) => {
            if (this.allowCache === false) {
                return callback({
                    code: eRetCodes.METHOD_NOT_ALLOWED,
                    message: 'Set allowCache=true before using.'
                });
            }
            let cacheKey = _parseCacheKey(keyOpt, this.cacheSpec);
            this._cache.get(cacheKey, (err, v) => {
                if (err) {
                    logger.error(`cacheGet error! - ${err.message}`);
                }
                if (v !== undefined || this.cacheSpec.loadPolicy !== eLoadPolicy.SetAfterFound) {
                    return callback(null, v);
                }
                logger.debug(`Cache not hit! Fetch ${this.modelName} data from database...`);
                let filter = _buildQueryFilter(keyOpt, this.cacheSpec);
                logger.debug(`The query filter: ${tools.inspect(filter)}`);
                if (Object.keys(filter).length === 0) {
                    return callback({
                        code: eRetCodes.BAD_REQUEST,
                        message: 'Invalid cache key!'
                    });
                }
                let options = {};
                if (this.cacheSpec.populate) {
                    options.populate = this.cacheSpec.populate;
                }
                if (this.cacheSpec.select) {
                    options.select = this.cacheSpec.select;
                }
                let query = this._model.findOne(filter);
                return _uniQuery.call(this, query, options, (err, doc) => {
                    if (err) {
                        return callback(err);
                    }
                    logger.debug(`Document found: ${tools.inspect(doc)}`);
                    _appendCache.call(this, doc, (err, cacheVal) => {
                        return callback(err, cacheVal);
                    });
                });
            });
        };
        this.cacheGetAsync = util.promisify(this.cacheGet);
        // Create one or many documents
        this.create = (data, callback) => {
            if (typeof data === 'function') {
                callback = data;
                data = {};
            }
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Model should be initialized before using!'
                });
            }
            //logger.debug(`Create ${this.modelName} with data: ${tools.inspect(data)}`);
            this._model.create(data, (err, result) => {
                if (err) {
                    let msg = `Create ${this.modelName} error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_INSERT_ERR,
                        message: err.code === 11000 ? `Create failed, ${this.modelName} Already exists!` : msg
                    });
                }
                // Do not append cache in case the created data is not sufficient
                return callback(null, result);
            });
        };
        this.createAsync = util.promisify(this.create);
        // Create one document by findAndUpdateOne
        this.insert = (params, callback) => {
            if (typeof params === 'function') {
                callback = params;
                params = {};
            }
            if (!params.filter || !params.updates) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Bad request! filter and updates are mandatory.'
                });
            }
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Model should be initialized before using!'
                });
            }
            logger.debug(`findOneAndUpdate with params: ${tools.inspect(params)}`);
            const options = Object.assign({
                upsert: true,
                setDefaultsOnInsert: true,
                new: true
            }, params.options || {});
            return this._model.findOneAndUpdate(params.filter, params.updates, options, (err, doc) => {
                if (err) {
                    let msg = `Insert error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_ERROR,
                        message: msg
                    })
                }
                // Append cache
                _appendCache.call(this, doc, {
                    updates: params.updates
                }, () => {
                    return callback(null, doc);
                });
            });
        };
        this.insertAsync = util.promisify(this.insert);
        // Find one document
        this.findOne = (options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Model should be initialized before using!'
                });
            }
            logger.debug(`${this.modelName} - options: ${tools.inspect(options)}`);
            //
            let query = this._model.findOne(options.filter || {});
            return _uniQuery.call(this, query, options, (err, doc) => {
                _appendCache.call(this, doc, () => {
                    return callback(err, doc);
                });
            });
        };
        this.findOneAsync = util.promisify(this.findOne);
        // Find all documents
        this.findMany = (options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Model should be initialized before using!'
                });
            }
            logger.debug(`${this.$name} - options: ${tools.inspect(options)}`);
            //
            let query = this._model.find(options.filter || {});
            return _uniQuery.call(this, query, options, (err, docs) => {
                _appendCache.call(this, docs, () => {
                    return callback(err, docs);
                });
            });
        };
        this.findManyAsync = util.promisify(this.findMany);
        // Paginating find documents
        this.findPartial = (options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Model should be initialized before using!'
                });
            }
            //
            let filter = options.filter || {};
            let ps = parseInt(options.pageSize || '10');
            let pn = parseInt(options.page || '1');

            logger.debug(`Query ${this.$name} with filter: ${tools.inspect(filter)}`);
            //
            let countMethod = options.allowRealCount === true ? 'countDocuments' : 'estimatedDocumentCount';
            this._model[countMethod](filter, (err, count) => {
                if (err) {
                    let msg = `${countMethod} for ${this.$name} error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_QUERY_ERR,
                        message: msg
                    });
                }
                const result = {
                    total: count,
                    pageSize: ps,
                    page: pn
                };
                if (count === 0) {
                    result.values = [];
                    return callback(null, result);
                }
                // Assemble query promise
                const query = this._model.find(filter).skip((pn - 1) * ps).limit(ps);
                const select = _packCacheSafeSelect(options.select, this.allowCache || false, this.cacheSpec);
                if (select) {
                    query.select(select)
                }
                const populate = _packCacheSafePopulate(options.populate, this.allowCache || false, this.cacheSpec);
                if (populate) {
                    query.populate(populate);
                }
                ['sort', 'allowDiskUse'].forEach(method => {
                    if (options[method]) {
                        query[method](options[method]);
                    }
                });
                return query.exec((err, docs) => {
                    if (err) {
                        let msg = `Query ${this.$name} error! - ${err.message}`;
                        logger.error(msg);
                        return callback({
                            code: eRetCodes.DB_QUERY_ERR,
                            message: msg
                        });
                    }
                    result.values = docs;
                    // Append cache
                    _appendCache.call(this, docs, () => {
                        return callback(null, result);
                    });
                });
            });
        };
        this.findPartialAsync = util.promisify(this.findPartial);
        /**
         * Find one document by id
         * @param {(string|Object)} id - The document id
         * @param {Types.QueryOptions} options - The query options
         * @param {function} callback
         */
        this.findById = (id, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Model should be initialized before using!'
                });
            }
            logger.debug(`${this.$name} - options: ${id} ${tools.inspect(options)}`);
            //
            let query = this._model.findById(id);
            return _uniQuery.call(this, query, options, callback);
        };
        this.findByIdAsync = util.promisify(this.findById);
        // Update one
        this.updateOne = _updateOne.bind(this);
        this.updateOneAsync = util.promisify(this.updateOne);
        // Update many
        this.updateMany = (options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Model should be initialized before using!'
                });
            }
            let filter = options.filter || {
                _id: new Object(),
                isUpdateProtection: true
            };
            let updates = options.updates || {};
            logger.debug(`UpdateMany ${this.$name} with filter: ${tools.inspect(filter)} - updates: ${tools.inspect(updates)}`);
            this._model.updateMany(filter, updates, (err, result) => {
                if (err) {
                    logger.error(`${this.$name}: updateMany error! - ${err.message}`);
                    return callback({
                        code: eRetCodes.DB_UPDATE_ERR,
                        message: 'updateMany error!'
                    });
                }
                return callback(null, result);
            });
        };
        this.updateManyAsync = util.promisify(this.updateMany);
        /**
         * Aggregate documents by specific pipeline
         * @param {Object[]} pipeline 
         * @param {Object} options - The query options
         * @param {boolean} allowEmpty - Whether treating empty result as error. Default is false: empty result as error.
         * @param {function} callback
         * @callback
         */
        this.aggregate = (pipeline, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: `Model: ${this.$name} should be initialized before using!`
                });
            }
            //
            return this._model.aggregate(pipeline).allowDiskUse(true).exec((err, results) => {
                if (err) {
                    let msg = `Aggregate ${this.$name} with pipeline: ${tools.inspect(pipeline)} error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_AGGREGATE_ERR,
                        message: msg
                    });
                }
                if (!results || results.length === 0) {
                    if (options.allowEmpty) {
                        return callback(null, []);
                    }
                    let msg = 'Empty data set.';
                    logger.error(`Aggregate ${this.$name} with ${tools.inspect(pipeline)} results: ${msg}`);
                    return callback({
                        code: eRetCodes.NOT_FOUND,
                        message: msg
                    });
                }
                logger.debug(`Aggregate ${this.$name} results: ${tools.inspect(results)}`);
                return callback(null, results);
            });
        };
        this.aggregateAsync = util.promisify(this.aggregate);
        /**
         * Count documents
         * @param {Types.CountOptions} options 
         * @param {*} callback 
         * @returns 
         */
        this.count = (options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Model should be initialized before using!'
                });
            }
            let filter = options.filter || {};
            let methodName = options.allowRealCount === true ? 'countDocuments' : 'estimatedDocumentCount';
            logger.debug(`Count ${this.$name} by ${methodName} with filter: ${tools.inspect(filter)}`);
            this._model[methodName](filter, (err, count) => {
                if (err) {
                    logger.error(`${this.$name}: count by ${tools.inspect(filter)} error! - ${err.message}`);
                    return callback({
                        code: eRetCodes.DB_QUERY_ERR,
                        message: 'Count error!'
                    });
                }
                return callback(null, count);
            });
        };
        this.countAsync = util.promisify(this.count);
        /**
         * Delete one or many documents
         * @param {Types.DeleteOptions} options 
         * @param {*} callback 
         * @returns 
         */
        this.delete = (options, callback) => {
            assert(options !== undefined);
            assert(typeof callback === 'function');
            //
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Model should be initialized before using!'
                });
            }
            //
            let filter = options.filter || { // Fill-in specififc _id for disaster protection
                _id: new ObjectId(),
                isDeleteProtection: true
            };
            let methodName = options.multi === true ? 'deleteMany' : 'findOneAndDelete';
            logger.debug(`Remove ${this.$name} by ${methodName} with filter: ${tools.inspect(filter)}`);
            this._model[methodName](filter, (err, result) => {
                if (err) {
                    let msg = `${this.$name}: delete with options: ${tools.inspect(options)} error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_DELETE_ERR,
                        message: msg
                    });
                }
                return callback(null, result);
            });
        };
        this.deleteAsync = util.promisify(this.delete);
        this.remove = (options, callback) => {
            logger.warn(`${this.$name}: The remove method will be deprecated soon, please use delete instead`);
            return this.delete(options, callback);
        };
        // Initialize data model and cache
        (() => {
            let ds = this.dsFactory.getDataSource(this.dsName);
            if (ds) {
                this._model = ds.getModel(this.modelName, this.modelSchema);
            }
            if (this.allowCache === true) {
                this._cache = this.cacheFactory.getCache(this.modelName, props.cacheOptions.props);
            }
        })();
    }
}

function _deepGetModelRefs(modelSpecs, key, totalRefs) {
    let spec = modelSpecs[key];
    if (!spec) {
        // Ignore no spec model
        return;
    }
    if (totalRefs.indexOf(key) === -1) {
        totalRefs.push(key);
    }
    let refs = spec.refs;
    if (!refs || !Array.isArray(refs)) {
        // Ignore no refs model
        return;
    }
    let nextKeys = [];
    refs.forEach(refKey => {
        if (totalRefs.indexOf(refKey) === -1) {
            nextKeys.push(refKey);
        }
    });
    nextKeys.forEach(nextKey => {
        _deepGetModelRefs(modelSpecs, nextKey, totalRefs);
    });
}

function _mergeCacheOptions(resident, config) {
    const options = {};
    options.enabled = config.enabled || resident.enabled || false;
    if (options.enabled) {
        options.spec = Object.assign({}, resident.spec || {}, config.spec || {});
        options.props = Object.assign({}, resident.props || {}, config.props || {});
    }
    return options;
}

const _excludeModelPaths = ['.DS_Store', '_templates'];
function _readModelDirSync(modelDir, loadedModels, options) {
    //logger.debug(`====== Scan directory: ${modelDir}`);
    let entries = fs.readdirSync(modelDir, {
        withFileTypes: true
    });
    entries.forEach(dirent => {
        if (options.excludePaths.indexOf(dirent.name) !== -1) { // Ignore excluded paths
            return null;
        }
        let fullPath = path.join(modelDir, dirent.name);
        if (dirent.isDirectory()) { // Recursive directory
            return _readModelDirSync.call(this, fullPath, loadedModels, options);
        }
        //
        try {
            const modelSpec = require(fullPath);
            const modelName = modelSpec.modelName;
            if (modelName === undefined) {
                throw new Error('Invalid moduleName!');
            }
            if (options.includeModels && options.includeModels.indexOf(modelName) === -1) {
                return null;
            }
            const cacheOptions = _mergeCacheOptions(modelSpec.cacheOptions || {}, options.cacheOptions[modelName] || {});
            this.registerModel(modelName, {
                schema: modelSpec.modelSchema,
                refs: modelSpec.modelRefs || [],
                // Cache options
                cacheOptions
            });
            logger.debug(`Load <${modelName}> with cache options: ${tools.inspect(cacheOptions)}`);
            loadedModels.push(modelName);
        } catch (ex) {
            logger.error(`!!! Load database schema from: ${dirent.name} error! - ${ex.message}`);
        }
    });
}

/**
 * @param { Object } options
 * @param { string[]?} options.excludePaths - The exclude model paths
 * @param { string? } options.modelPath - The 
 * @param { string[]?} options.excludeModels - The exclude model names 
 * @param { string[]?} options.includeModels - The included model names
 * @returns
 */
function loadDataModels(options) {
    options.excludePaths = _excludeModelPaths.concat(options.excludePaths || []);
    logger.info('>>>>>> loadDataModels with options: ', tools.inspect(options));
    //
    const modelDir = path.join(appRoot.path, options.modelPath || 'models');
    const loadedModels = [];
    _readModelDirSync.call(this, modelDir, loadedModels, options);
    logger.info(`>>>>>> Total ${loadedModels.length} database schemas registered. <<<<<<`);
    return loadedModels.length;
}

// The repository-factory
class RepositoryFactory extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this.cacheFactory = appCtx.cacheFactory;
        this._modelSpecs = {};
        this._repos = {};
        this._state = sysdefs.eModuleState.INIT;
    }
    init(config) {
        if (this._state !== sysdefs.eModuleState.INIT) {
            logger.error(`!!! Already initialized.`);
            return 0;
        }
        loadDataModels.call(this, config);
        this._state = sysdefs.eModuleState.ACTIVE;
    }
    // Implementing methods
    /**
     * Register model with modelSpec
     * @param { string } modelName 
     * @param { Types.ModelSpecOptions } modelSpec 
     */
    registerModel(modelName, modelSpec) {
        this._modelSpecs[modelName] = modelSpec;
    }
    getSubSchema(modelName, subSchemaName) {
        return this._modelSpecs[modelName].subSchemas[subSchemaName];
    }
    /**
     * Get one repository by model name
     * @param { string } modelName - The model name
     * @param { string } dsName - The dataSource name
     * @returns 
     */
    getRepo(modelName, dsName = _DS_DEFAULT_) {
        assert(modelName !== undefined);
        //
        let repoKey = `${modelName}@${dsName}`;
        if (repoKey === 'test@default') {
            logger.error(`Using ${key} repository is not recommended in real project!`);
        }
        let modelSpec = this._modelSpecs[modelName];
        if (!modelSpec) {
            logger.error(`modelSpec: ${modelName} not registered.`);
            return null;
        }
        if (this._repos[repoKey]) {
            return this._repos[repoKey];
        }
        let totalRefModels = [];
        _deepGetModelRefs(this._modelSpecs, modelName, totalRefModels);
        totalRefModels.forEach(name => {
            let spec = this._modelSpecs[name];
            let key = `${name}@${dsName}`;
            if (spec !== undefined && this._repos[key] === undefined) {
                this._repos[key] = new Repository(this._appCtx, {
                    $name: key,
                    // model spec
                    modelName: name,
                    modelSchema: spec.schema,
                    dsName: dsName,
                    // cache
                    cacheOptions: spec.cacheOptions
                    //allowCache: spec.allowCache,
                    //cacheSpec: spec.cacheSpec   // _typeCacheOptions
                });
                logger.info(`>>> New repository: ${key} created. <<<`);
            }
        });
        return this._repos[repoKey];
    }
    /**
     * Get multiple repositories by model names
     * @param { string[] } modelNames - The array of model name
     * @param { string } dsName - The dataSource name
     * @returns 
     */
    getMultiRepos(modelNames, dsName = 'default') {
        assert(Array.isArray(modelNames));
        let results = {};
        modelNames.forEach(modelName => {
            let repo = this.getRepo(modelName, dsName);
            results[modelName] = repo;
        });
        return results;
    }
    // entitiesOption[modelName] = {ids, queryOptions};
    findEntities(entitiesOption, dsName, callback) {
        if (typeof dsName === 'function') {
            callback = dsName;
            dsName = 'default'
        }
        logger.debug(`findEntites: ${tools.inspect(entitiesOption)} - ${dsName}`);
        let results = {};
        let modelNames = Object.keys(entitiesOption);
        async.each(modelNames, (modelName, next) => {
            let repo = this.getRepo(modelName, dsName);
            if (!repo) {
                return process.nextTick(next);
            }
            let queryOptions = entitiesOption[modelName];
            repo.findMany(queryOptions, (err, docs) => {
                if (err) {
                    logger.error(`Find ${modelName} entites error! - ${err.message}`);
                    return next();
                }
                docs.forEach(doc => {
                    results[doc._id] = doc;
                });
                return next();
            });
        }, () => {
            return callback(null, results);
        });
    }
    findDistEntites(distEntitiesOption, callback) {
        return callback(null, {});
    }
}

module.exports = exports = {
    _DS_SYSTEM_: 'system',
    _DS_DEFAULT_: 'default',
    paginationVal: {
        pageSize: {
            type: 'String'
        },
        page: {
            type: 'String'
        }
    },
    RepositoryFactory
}