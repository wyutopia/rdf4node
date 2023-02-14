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
const _MODULE_NAME = require('../include/sysdefs').eFrameworkModules.REPOSITORY_FACTORY;
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
    this.parent.prepareQuery(_retrievePopulateSchemas(options.populate, this._modelSchema), this.dsName,() => {
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
    });
}

function _retrievePopulateSchemas(populate, modelSchema) {
    let modelNames = [];
    if (populate === undefined) {
        return modelNames;
    }
    let populates = Array.isArray(populate)? populate : [populate];
    populates.forEach(p => {
        let options = modelSchema.path(p.path).options;
        let name = options.ref || options.type[0].ref;
        if (modelNames.indexOf(name) === -1) {
            modelNames.push(name);
        }
    });
    logger.debug(`>>> Retrieve populate schemas from ${tools.inspect(populate)}. Result in: ${tools.inspect(modelNames)}.`);
    return modelNames;
}

// The repository class
class Repository extends EventObject {
    constructor(props) {
        super(props);
        this.parent = props.parent;
        //
        this.modelName = props.modelName || 'User';
        this.modelSchema = props.modelSchema || {};
        this.dsName = props.dsName || 'default';
        this._model = null;
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
            this._model.create(data).then(doc => {
                return callback(null, doc);
            }).catch(err => {
                let msg = `Create ${this.modelName} error! - ${err.message}`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.DB_INSERT_ERR,
                    message: msg
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
            this.parent.prepareQuery(_retrievePopulateSchemas(options.populate, this.modelSchema), this.dsName,() => {
                let query = this._model.findOne(options.filter || {});
                return _uniQuery(query, options, callback);
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
            logger.debug(`${this.name} - options: ${tools.inspect(options)}`);
            //
            this.parent.prepareQuery(_retrievePopulateSchemas(options.populate, this.modelSchema), this.dsName,() => {
                let query = this._model.find(options.filter || {});
                return _uniQuery(query, options, callback);
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
            this.parent.prepareQuery(_retrievePopulateSchemas(options.populate, this.modelSchema), this.dsName, () => {
                let filter = options.filter || {};
                let ps = parseInt(filter.pageSize || '10');
                let pn = parseInt(filter.page || '1');

                logger.debug(`Query ${this.name} with filter: ${tools.inspect(filter)}`);
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
            this.parent.prepareQuery(_retrievePopulateSchemas(options.populate, this.modelSchema), this.dsName, () => {
                let query = this._model.findById(id);
                return _uniQuery(query, options, callback);
            });
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
        this.remove = (params, callback) => {
            assert(params !== undefined && params.filter !== undefined && Object.keys(params.filter).length > 0);
            assert(typeof callback === 'function');
            //
            if (!this._model) {
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: 'Model should be initialized before using!'
                });
            }
            //
            let options = params.options || {};
            let methodName = options.multi === true? 'deleteMany' : 'deleteOne';
            this._model[methodName](options.filter, (err, result) => {
                if (err) {
                    let msg = `Delete ${this.name} error! - ${err.code}#${err.message}`;
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

class RepositoryFactory extends EventModule {
    constructor(props) {
        super(props);
        //
        this._schemas = {};
        this._repos = {};
        /**
         *
         * @param {*} options  = {schemas: array, dsName: string, callback: function}
         * @param {*} callback
         */
        this.prepareQuery = (modelNames, dsName, callback) => {
            let self = this;
            async.each(modelNames, (modelName, next) => {
                // sch: {modelname, modelSchema}
                let key = `${modelName}@${dsName}`;
                if (self._repos[key] !== undefined) { // Alread registered
                    return process.nextTick(next);
                }
                let modelSchema = self._schemas[modelName];
                if (modelSchema === undefined) {
                    logger.error(`>>> Schema of ${modelName} not registered! <<< `);
                    return process.nextTick(next);
                }
                this._repos[key] = new Repository({
                    name: key,
                    //
                    modelName: modelName,
                    modelSchema: self._schemas[modelName],
                    dsName: dsName,
                    //
                    parent: self
                });
                return process.nextTick(next);
            }, () => {
                callback();
            });
        };
        this.registerSchema = (modelName, modelSchema) => {
            this._schemas[modelName] = modelSchema;
        };
        this.getRepo = (modelName, modelSchema, dsName = 'default') => {
            assert(modelName !== undefined);
            let key = `${modelName}@${dsName}`;
            if (key === 'test@default') {
                logger.error(`Using ${key} repository is not recommended in real project!`);
            }
            if (this._repos[key] === undefined) {
                this._repos[key] = new Repository({
                    name: key,
                    //
                    modelName: modelName,
                    modelSchema: modelSchema,
                    dsName: dsName,
                    //
                    parent: this
                });
                logger.error(`>>> New repository: ${key} created. <<<`);
            }
            return this._repos[key];
        };
        // Load all database schemas from
        (() => {
            let modelDir = path.join(appRoot.path, bootstrapConf.modelDir);
            logger.info(`Scan database model schemas from ${modelDir} ...`);
            let modelFiles = fs.readdirSync(modelDir);
            modelFiles.forEach(filename => {
                let filePath = path.join(modelDir, filename)
                try {
                    let {modelName, modelSchema} = require(filePath);
                    //
                    this._schemas[modelName] = modelSchema;
                } catch (ex) {
                    logger.error(`Load database schema from: ${filePath} error! - ${ex.message}`);
                }
            });
            logger.info(`>>> Registered database schemas: ${tools.inspect(Object.keys(this._schemas))}`);
        })();
    }
}

module.exports = exports = {
    paginationKeys: {
        pageSize: {
            type: 'Number'
        },
        page: {
            type: 'Number'
        }
    },
    repoFactory: new RepositoryFactory({
        name: '_RepositoryFactory_'
    })
}