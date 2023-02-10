/**
 * Created by Eric on 2023/02/07
 */
const sysConf = require('./config');
const pubdefs = require('../include/sysdefs');
const eConnState = pubdefe.eConnectionState;
const sysEvents = require('../include/sys-events');
const tools = require('../utils/tools');
const {EventModule, EventObject} = require('./common');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const eRetCodes = require('../include/retcodes');
const logger = WinstonLogger(process.env.SRV_ROLE || 'repo');
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

class Repository extends EventObject {
    constructor(props) {
        super(props);
        //
        this.modelName = props.modelName || 'user';
        this.dsName = props.dsName || 'default';
        this._model = null;
        //
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
                let msg = `Create ${db.modelName} error! - ${err.message}`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.DB_INSERT_ERR,
                    message: msg
                });
            });
        };
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
            logger.debug(`${db.modelName} - options: ${tools.inspect(options)}`);
            //
            let query = db.findOne(options.filter || {});
            return _unifiedFind(query, options, callback);
        };
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
            let query = db.find(options.filter || {});
            return _unifiedFind(query, options, callback);
        };
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
                this._model = ds.getModel(this.modelName);
            }
        })();
    }
}

class RepositoryFactory extends EventModule {
    constructor(props) {
        super(props);
        //
        this._repos = {};
        //
        this.getRepo = (modelName, dsName = 'default') => {
            assert(modelName !== undefined);
            let key = `${modelName}@${dsName}`;
            if (key === 'rest@default') {
                logger.error(`Using ${key} repository is not recommended in real project!`);
            }
            if (this._repos[key] !== undefined) {
                return this._repos[key];
            }
            let repo = new Repository({
                name: key,
                modelName: modelName,
                dsName: dsName
            });
            this._repos[key] = repo;
            logger.error(`New repository: ${key} created.`);
            // let repo = null;
            // try {

            // } catch (ex) {
            //     logger.error(`Create new repository: ${key} error! - ${tools.inspect(ex)}`);
            // }
            return repo;
        };
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