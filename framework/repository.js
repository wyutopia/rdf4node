/**
 * Created by Eric on 2023/02/07
 */
// System libs
const async = require('async');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const appRoot = require('app-root-path');
const bootstrapConf = require(path.join(appRoot.path, 'conf/bootstrap.js'));
// Framework libs
const _MODULE_NAME = require('../include/sysdefs').eFrameworkModules.REPOSITORY;
const eRetCodes = require('../include/retcodes');
const {EventModule, EventObject, sysEvents} = require('../include/events');
const {winstonWrapper: {WinstonLogger}} = require('../libs');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');
//
const dsFactory = require('./data-source');

function _uniQuery (query, options, callback) {
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
            })
        }
        if (!result) {
            return callback({
                code: eRetCodes.NOT_FOUND,
                message: `Specified record not exists!`
            })
        }
        return callback(null, result);
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
    let options = params.options || {new: true};
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
    logger.debug(`Update: ${this.name} - ${tools.inspect(filter)} - ${tools.inspect(updates)} - ${tools.inspect(options)}`);
    //
    let query = this._model.findOneAndUpdate(filter, updates, options);
    ['select', 'populate'].forEach(method => {
        if (params[method]) {
            query[method](params[method]);
        }
    });
    query.exec((err, doc) => {
        if (err) {
            let msg = `Update ${this.name} error! - ${err.message}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.DB_UPDATE_ERR,
                message: msg
            });
        }
        if (!doc) {
            let msg = `Specified ${this.name} not found! - ${tools.inspect(filter)}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.NOT_FOUND,
                message: msg
            });
        }
        return callback(null, doc);
    });
}

// The repository class
class Repository extends EventObject {
    constructor(props) {
        super(props);
        //
        this.modelName = props.modelName || 'User';
        this.modelSchema = props.modelSchema || {};
        this.modelRefs = props.modelRefs || [];
        this.dsName = props.dsName || 'default';
        this.allowCache = props.allowCache === true? true : false;
        this._model = null;
        this._cache = {};
        this.getModel = () => {
            return this._model;
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
            logger.debug(`Create ${this.modelName} with data: ${tools.inspect(data)}`);
            this._model.create(data, (err, doc) => {
                if (err) {
                    let msg = `Create ${this.modelName} error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_INSERT_ERR,
                        message: err.code === 11000? `Create failed, ${this.modelName} Already exists!` : msg
                    });
                }
                return callback(null, doc);
            });
        };
        this.insert = (options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            if (!options.filter || !options.updates) {
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
            logger.debug(`findOneAndUpdate with upsert=true: ${tools.inspect(options)}`);
            return this._model.findOneAndUpdate(options.filter, options.updates, {
                upsert: true,
                setDefaultsOnInsert: true,
                new: true
            }, (err, doc) => {
                if (err) {
                    let msg = `Insert error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_ERROR,
                        message: msg
                    })
                }
                return callback(null, doc);
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
            return _uniQuery(query, options, callback);
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
            logger.debug(`${this.name} - options: ${tools.inspect(options)}`);
            //
            let query = this._model.find(options.filter || {});
            return _uniQuery(query, options, callback);
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

            logger.debug(`Query ${this.name} with filter: ${tools.inspect(filter)}`);
            //
            let countMethod = options.allowRealCount === true ? 'countDocuments' : 'estimatedDocumentCount';
            this._model[countMethod](filter, (err, total) => {
                if (err) {
                    let msg = `${countMethod} for ${this.name} error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_QUERY_ERR,
                        message: msg
                    });
                }
                let results = {
                    total: total,
                    pageSize: ps,
                    page: pn
                };
                if (total === 0) {
                    results.values = [];
                    return callback(null, results);
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
                        let msg = `Query ${this.name} error! - ${err.message}`;
                        logger.error(msg);
                        return callback({
                            code: eRetCodes.DB_QUERY_ERR,
                            message: msg
                        });
                    }
                    results.values = docs;
                    return callback(null, results);
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
            logger.debug(`${this.name} - options: ${id} ${tools.inspect(options)}`);
            //
            let query = this._model.findById(id);
            return _uniQuery(query, options, callback);
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
            let filter = options.filter || {};
            let updates = options.updates || {};
            logger.debug(`UpdateMany ${this.name} with filter: ${tools.inspect(filter)} - updates: ${tools.inspect(updates)}`);
            this._model.updateMany(filter, updates, (err, result) => {
                if (err) {
                    logger.error(`${this.name}: updateMany error! - ${err.message}`);
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
            logger.debug(`Aggregate ${this.name} with pipeline: ${tools.inspect(pipeline)}`);
            return this._model.aggregate(pipeline).allowDiskUse(true).exec((err, results) => {
                if (err) {
                    let msg = `Aggregate ${this.name} error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: eRetCodes.DB_AGGREGATE_ERR,
                        message: msg
                    });
                }
                if (!results || results.length === 0) {
                    let msg = 'Empty data set.';
                    logger.error(`Aggregate ${this.name} with ${tools.inspect(pipeline)} results: ${msg}`);
                    return callback({
                        code: eRetCodes.NOT_FOUND,
                        message: msg
                    });
                }
                logger.debug(`Aggregate ${this.name} results: ${tools.inspect(results)}`);
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
            let methodName = options.allowRealCount === true? 'countDocuments' : 'estimatedDocumentCount';
            logger.debug(`Count ${this.name} by ${methodName} with filter: ${tools.inspect(filter)}`);
            this._model[methodName](filter, (err, count) => {
                if (err) {
                    logger.error(`${this.name}: count by ${tools.inspect(filter)} error! - ${err.message}`);
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
            let filter = options.filter || {bulkDeleteIsNotAllowed: true};
            let methodName = options.multi === true? 'deleteMany' : 'deleteOne';
            logger.debug(`Remove ${this.name} by ${methodName} with filter: ${tools.inspect(filter)}`);
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
        })();
    }
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
            let repoKey = `${modelName}@${dsName}`;
            if (repoKey === 'test@default') {
                logger.error(`Using ${key} repository is not recommended in real project!`);
            }
            let modelSpec = this._modelSpecs[modelName];
            if (!modelSpec) {
                logger.error(`modelSpec: ${modelName} not registered.`);
                return null;
            }
            if (this._repos[repoKey] === undefined) {
                // Create all relative repoes
                [modelName].concat(modelSpec.refs).forEach(name => {
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
            }
            return this._repos[repoKey];
        };
        this.getRepos = (modelNames, dsName = 'default') => {
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
                    } else {
                        docs.forEach(doc => {
                            results[doc._id] = doc;
                        });
                    }
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
            type: 'Number'
        },
        page: {
            type: 'Number'
        }
    },
    repoFactory: new RepositoryFactory({
        name: _MODULE_NAME
    })
}