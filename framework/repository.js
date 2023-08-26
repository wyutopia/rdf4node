/**
 * Created by Eric on 2023/02/07
 */
// System libs
const async = require('async');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const appRoot = require('app-root-path');
const ObjectId = require('mongoose').Types.ObjectId;
// Framework libs
const _MODULE_NAME = require('../include/sysdefs').eFrameworkModules.REPOSITORY;
const eRetCodes = require('../include/retcodes');
const { EventModule, EventObject, sysEvents } = require('../include/events');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');
//
const {dsFactory} = require('./data-source');
const {eDataType, eLoadPolicy, cacheFactory} = require('./cache');

function _uniQuery(query, options, callback) {
    ['select', 'sort', 'skip', 'limit', 'populate'].forEach(method => {
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
    logger.debug(`Update: ${this.$name} - ${tools.inspect(filter)} - ${tools.inspect(updates)} - ${tools.inspect(options)}`);
    //
    let query = this._model.findOneAndUpdate(filter, updates, options);
    ['select', 'populate'].forEach(method => {
        if (params[method]) {
            query[method](params[method]);
        }
    });
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
            let msg = `Specified ${this.$name} not found! - ${tools.inspect(filter)}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.NOT_FOUND,
                message: msg
            });
        }
        // Append cache
        _appendCache.call(this, doc, () => {
            return callback(null, doc);
        });
    });
}

// Should return string
function _$parseCacheKey (options, cacheSpec) {
    logger.debug(`Parse cacheKey: ${tools.inspect(options)} - ${tools.inspect(cacheSpec)}`);
    if (tools.isTypeOfPrimitive(options)) {
        return options;
    }
    if (cacheSpec.keyName) {
        let cacheKey = options[cacheSpec.keyName];
        return typeof cacheKey === 'string'? cacheKey : cacheKey.toString();
    }
    let template = cacheSpec.keyNameTemplate;
    if (template === undefined) {
        return options['_id'];   // Using _id as default key
    }
    let keyNameArray = [];
    template.split(':').forEach( field => {
        keyNameArray.push(options[field] === undefined? '*' : tools.stringifyDocId(options[field]));
    });
    const cacheKey  = keyNameArray.join(':');
    logger.debug(`cacheKey: ${cacheKey}`);
    return cacheKey;
}

function _parseCacheValue(doc, valueKeys) {
    if (!valueKeys) {
        return doc;
    }
    let keys = typeof valueKeys === 'string'? valueKeys.split(' ') : valueKeys;
    let cv = {};
    keys.forEach (key => {
        if (doc[key]) {
            cv[key] = doc[key];
        }
    })
    return cv;
}

function _appendCache(data, callback) {
    if (this.allowCache === false || !data) {
        return callback(null, data);
    }
    let cacheValues = [];
    let docs = Array.isArray(data)? data : [data];
    //
    async.each(docs, (doc, next) => {
        let cacheKey = _$parseCacheKey(doc, this.cacheSpec);
        let cacheVal = _parseCacheValue(doc.toObject(), this.cacheSpec.valueKeys);
        cacheValues.push(cacheVal);
        return this._cache.set(cacheKey, cacheVal, next);
    }, () => {
        return callback(null, tools.isTypeOfArray(data)? cacheValues : cacheValues[0]);
    });
}

function _$buildQueryFilter(data, cacheSpec) {
    let filter = {};
    if (cacheSpec.keyName !== undefined) {
        filter[cacheSpec.keyName] = tools.isTypeOfPrimitive(data)? data : data[cacheSpec.keyName];
    } else if (cacheSpec.keyNameTemplate !== undefined) {
        cacheSpec.keyNameTemplate.split(':').forEach (key => {
            if (data[key] !== undefined) {
                filter[key] = data[key];
            }
        });
    }
    return filter;
}

// The repository class
class Repository extends EventObject {
    constructor(props) {
        super(props);
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
        this.allowCache = props.allowCache !== undefined? props.allowCache : false;
        this.cacheSpec = props.cacheSpec || {};
        this._cache = null;
        this.getCache = () => {
            return this._cache;
        };
        // Implementing cache methods
        this.cacheGet = (options, callback) => {
            if (this.allowCache === false) {
                return callback({
                    code: eRetCodes.METHOD_NOT_ALLOWED,
                    message: 'Set allowCache=true before using.'
                });
            }
            let cacheKey = _$parseCacheKey(options, this.cacheSpec);
            this._cache.get(cacheKey, (err, v) => {
                if (err) {
                    logger.error(`cacheGet error! - ${err.message}`);
                }
                if (v !== undefined || this.cacheSpec.loadPolicy !== eLoadPolicy.SetAfterFound) {
                    return callback(null, v);
                }
                logger.debug(`Cache not hit! Load ${this.modelName} from database...`);
                let filter = _$buildQueryFilter(options, this.cacheSpec);
                logger.debug(`The query filter: ${tools.inspect(filter)}`);
                if (Object.keys(filter).length === 0) {
                    return callback({
                        code: eRetCodes.BAD_REQUEST,
                        message: 'Invalid cache key!'
                    });
                }
                let queryOptions = {
                    filter: filter
                };
                if (this.cacheSpec.populate) {
                    queryOptions.populate = this.cacheSpec.populate;
                }
                if (this.cacheSpec.select) {
                    queryOptions.select = this.cacheSpec.select;
                }
                this.findOne(queryOptions, (err, doc) => {
                    if (err) {
                        return callback(err);
                    }
                    logger.debug(`Document found: ${tools.inspect(doc)}`);
                    _appendCache.call(this, doc, (err, cacheVal) => {
                        return callback(null, cacheVal);
                    });
                });
            });
        };
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
                // Append cache
                _appendCache.call(this, result, () => {
                    return callback(null, result);
                });
            });
        };
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
            let options = params.options || {
                upsert: true,
                setDefaultsOnInsert: true,
                new: true
            };
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
                _appendCache.call(this, doc, () => {
                    return callback(null, doc);
                });
            });
        };
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
            let ps = parseInt(filter.pageSize || '10');
            let pn = parseInt(filter.page || '1');

            logger.debug(`Query ${this.$name} with filter: ${tools.inspect(filter)}`);
            //
            let countMethod = options.allowRealCount === true ? 'countDocuments' : 'estimatedDocumentCount';
            this._model[countMethod](filter, (err, total) => {
                if (err) {
                    let msg = `${countMethod} for ${this.$name} error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_QUERY_ERR,
                        message: msg
                    });
                }
                let result = {
                    total: total,
                    pageSize: ps,
                    page: pn
                };
                if (total === 0) {
                    result.values = [];
                    return callback(null, result);
                }
                // Assemble query promise
                let query = this._model.find(filter).skip((pn - 1) * ps).limit(ps);
                ['select', 'sort', 'populate', 'allowDiskUse'].forEach(method => {
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
        // Find one document by id
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
        this.updateOne = _updateOne.bind(this);
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
        this.aggregate = (pipeline, callback) => {
            if (typeof pipeline === 'function') {
                callback = pipeline;
                pipeline = [];
            }
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Model should be initialized before using!'
                });
            }
            //
            logger.debug(`Aggregate ${this.$name} with pipeline: ${tools.inspect(pipeline)}`);
            return this._model.aggregate(pipeline).allowDiskUse(true).exec((err, results) => {
                if (err) {
                    let msg = `Aggregate ${this.$name} error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_AGGREGATE_ERR,
                        message: msg
                    });
                }
                if (!results || results.length === 0) {
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
        this.remove = (options, callback) => {
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
            let filter = options.filter || { 
                _id: new ObjectId(),
                isDeleteProtection: true
            };
            let methodName = options.multi === true ? 'deleteMany' : 'deleteOne';
            logger.debug(`Remove ${this.$name} by ${methodName} with filter: ${tools.inspect(filter)}`);
            this._model[methodName](filter, (err, result) => {
                if (err) {
                    let msg = `Delete with options: ${tools.inspect(options)} error! - ${err.code}#${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_DELETE_ERR,
                        message: msg
                    });
                }
                return callback(null, result);
            });
        };
        //
        (() => {
            let ds = dsFactory.getDataSource(this.dsName);
            if (ds) {
                this._model = ds.getModel(this.modelName, this.modelSchema);
            }
            if (this.allowCache === true) {
                this._cache = cacheFactory.getCache(this.$name, this.cacheSpec);
            }
        })();
    }
}

function _deepGetRefs(key, totalRefs) {
    let spec = this._modelSpecs[key];
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
    refs.forEach (refKey => {
        if (totalRefs.indexOf(refKey) === -1) {
            nextKeys.push(refKey);
        }
    });
    nextKeys.forEach( nextKey => {
        _deepGetRefs.call(this, nextKey, totalRefs);
    });
}

// The repository-factory
class RepositoryFactory extends EventModule {
    constructor(props) {
        super(props);
        //
        this._modelSpecs = {};
        this._repos = {};
        // Implementing methods
        this.registerSchema = (modelName, modelSpec) => {
            this._modelSpecs[modelName] = modelSpec;
        };
        this.getRepo = (modelName, dsName = 'default') => {
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
            _deepGetRefs.call(this, modelName, totalRefModels);
            totalRefModels.forEach(name => {
                let spec = this._modelSpecs[name];
                let key = `${name}@${dsName}`;
                if (spec !== undefined && this._repos[key] === undefined) {
                    this._repos[key] = new Repository({
                        $name: key,
                        // model spec
                        modelName: name,
                        modelSchema: spec.schema,
                        dsName: dsName,
                        // cache 
                        allowCache: spec.allowCache,
                        cacheSpec: spec.cacheSpec
                    });
                    logger.info(`>>> New repository: ${key} created. <<<`);
                }
            });
            return this._repos[repoKey];
        };
        this._$getRepo = (modelName, dsName = 'default') => {
            assert(modelName !== undefined);
            let repoKey = `${modelName}@${dsName}`;
            if (repoKey === 'test@default') {
                logger.error(`Using ${key} repository is not recommended in real project!`);
            }
            let modelSpec = this._modelSpecs[modelName];
            if (!modelSpec) {
                logger.error(`modelSpec: ${modelName} not registered.`);
                return null;
            }
            // Begin deeply load reference models
            if (this._repos[repoKey]) {
                return this._repos[repoKey];
            }            
            let totalRefModels = [];
            _deepGetRefs.call(this, modelName, totalRefModels);
            totalRefModels.forEach(name => {
            // End 
            // Note: uncomment next line and comment up section between begin and end to init reference models each time get repository
//            [modelName].concat(modelSpec.refs).forEach(name => {
                let spec = this._modelSpecs[name];
                let key = `${name}@${dsName}`;
                if (spec !== undefined && this._repos[key] === undefined) {
                    this._repos[key] = new Repository({
                        name: key,
                        //
                        modelName: name,
                        modelSchema: spec.schema,
                        dsName: dsName
                    });
                    logger.info(`>>> New repository: ${key} created. <<<`);
                }
            });
            return this._repos[repoKey];
        };
        this.getMultiRepos = (modelNames, dsName = 'default') => {
            assert(Array.isArray(modelNames));
            let results = {};
            modelNames.forEach(modelName => {
                let repo = this.getRepo(modelName, dsName);
                results[modelName] = repo;
            });
            return results;
        };
        // entitiesOption[modelName] = {ids, queryOptions};
        this.findEntities = (entitiesOption, dsName, callback) => {
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
        };
        this.findDistEntites = (distEntitiesOption, callback) => {
            return callback(null, {});
        }
    }
}

module.exports = exports = {
    _DS_DEFAULT_: 'default',
    paginationVal: {
        pageSize: {
            type: 'String'
        },
        page: {
            type: 'String'
        }
    },
    repoFactory: new RepositoryFactory({
        $name: _MODULE_NAME
    })
}