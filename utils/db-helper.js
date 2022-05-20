/**
 * Created by Eric on 2021/11/15
 * Upgraded by Eric on 2022/05/16
 */
const assert = require('assert');
//
const pubdefs = require('../include/sysdefs');
const eRetCodes = require('../include/retcodes.js');
const tools = require('./tools');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf');

//
function _unifiedFind(query, options, callback) {
    if (options.select) {
        query.select(options.select);
    }
    if (options.sort) {
        query.sort(options.sort);
    }
    if (options.skip) {
        query.skip(options.skip);
    }
    if (options.limit) {
        query.limit(options.limit);
    }
    if (options.populate) {
        query.populate(options.populate);
    }
    return query.exec((err, result) => {
        if (err) {
            let msg = `Query ${db.modelName} error! - ${err.message}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.DB_QUERY_ERR,
                message: msg
            })
        }
        if (!result) {
            return callback({
                code: eRetCodes.NOT_FOUND,
                message: `Specified ${db.modelName} not exists! - ${tools.inspect(filter)}`
            })
        }
        return callback(null, result);
    });
}

exports.findMany = function (db, options, callback) {
    assert(Object.getPrototypeOf(db).name === 'Model');
    logger.debug(`${db.modelName} - options: ${tools.inspect(options)}`);
    //
    let query = db.find(options.filter || {});
    return _unifiedFind(query, options, callback);
};

exports.findOne = function (db, options, callback) {
    assert(Object.getPrototypeOf(db).name === 'Model');
    logger.debug(`${db.modelName} - options: ${tools.inspect(options)}`);
    //
    let query = db.findOne(options.filter || {});
    return _unifiedFind(query, options, callback);
};

exports.findById = function (db, id, options, callback) {
    assert(Object.getPrototypeOf(db).name === 'Model');
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    logger.debug(`${db.modelName} - options: ${tools.inspect(options)}`);
    //
    let query = db.findById(id);
    return _unifiedFind(query, options, callback);
};

/**
 *
 * @param db
 * @param options
 * @param callback
 */
exports.findPartial = function (db, options, callback) {
    assert(Object.getPrototypeOf(db).name === 'Model');
    //
    let name = db.modelName;
    let ps = parseInt(options.pageSize || '10');
    let pn = parseInt(options.page || '1');
    let filter = options.filter || {};

    logger.debug(`Query ${name} with filter: ${tools.inspect(filter)}`);
    let countMethod = options.allowRealCount === true ? 'countDocuments' : 'estimatedDocumentCount';
    db[countMethod](filter, (err, total) => {
        if (err) {
            let msg = `Count ${name} error! - ${err.message}`;
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
        let query = db.find(filter).skip((pn - 1) * ps).limit(ps);
        if (options.sort) {
            query.sort(options.sort);
        }
        if (options.populate) {
            query.populate(options.populate);
        }
        if (options.allowDiskUse) {
            query.allowDiskUse(true);
        }
        return query.exec((err, docs) => {
            if (err) {
                let msg = `Query ${name} error! - ${err.message}`;
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

function _updateOne(db, params, callback) {
    assert(Object.getPrototypeOf(db).name === 'Model');
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
    logger.debug(`Update: ${db.modelName} - ${tools.inspect(filter)} - ${tools.inspect(updates)} - ${tools.inspect(options)}`)
    db.findOneAndUpdate(filter, updates, options, (err, doc) => {
        if (err) {
            let msg = `Update ${db.modelName} error! - ${err.message}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.DB_UPDATE_ERR,
                message: msg
            });
        }
        if (!doc) {
            let msg = `Specified ${db.modelName} not found! - ${tools.inspect(filter)}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.NOT_FOUND,
                message: msg
            });
        }
        return callback(null, doc);
    });
}
exports.updateOne = _updateOne;

exports.aggregate = function (db, pipeline, callback) {
    assert(Object.getPrototypeOf(db).name === 'Model');
    //
    logger.debug(`Aggregate ${db.modelName} with pipeline: ${tools.inspect(pipeline)}`);
    return db.aggregate(pipeline).allowDiskUse(true).exec((err, results) => {
        if (err) {
            let msg = `Aggregate ${db.modelName} error! - ${err.message}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.DB_AGGREGATE_ERR,
                message: msg
            });
        }
        if (!results || results.length === 0) {
            let msg = 'Empty data set.';
            logger.error(`Aggregate ${db.modelName} with ${tools.inspect(pipeline)} results: ${msg}`);
            return callback({
                code: eRetCodes.NOT_FOUND,
                message: msg
            });
        }
        logger.debug(`Aggregate ${db.modelName} results: ${tools.inspect(results)}`);
        return callback(null, results);
    });
};

exports.create = function (db, data, callback) {
    assert(Object.getPrototypeOf(db).name === 'Model');
    //
    db.create(data).then(doc => {
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

exports.remove = function (db, options, callback) {
    assert(Object.getPrototypeOf(db).name === 'Model');
    assert(options.filter !== undefined && Object.keys(options.filter).length > 0);
    //
    db.remove(options.filter, (err, result) => {
        if (err) {
            let msg = `Delete ${db.modelName} error! - ${err.message}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.DB_DELETE_ERR,
                message: msg
            });
        }
        return callback(null, result);
    });
};

exports.removeById = function (db, id, callback) {
    return _updateOne(db, {
        filter: {
            _id: id
        },
        updates: {
            $set: {
                status: pubdefs.eStatus.DELETED,
                updateAt: new Date()
            }
        }
    }, callback);
};

exports.count = function (db, options, callback) {
    assert(Object.getPrototypeOf(db).name === 'Model');
    //
    db.countDocuments(options.filter, (err, count) => {
        if (err) {
            logger.error(`${db.modelName}: count by ${tools.inspect(options.filter)} error! - ${err.message}`);
            return callback({
                code: eRetCodes.DB_QUERY_ERR, 
                message: 'Count error!'
            });
        }
        return callback(null, count);
    });
};

exports.updateMany = function (db, options, callback) {
    assert(Object.getPrototypeOf(db).name === 'Model');
    //
    let filter = options.filter || {};
    let updates = options.updates || {};
    db.updateMany(filter, updates, (err, result) => {
        if (err) {
            logger.error(`${db.modelName}: updateMany error! - ${err.message}`);
            return callback({
                code: eRetCodes.DB_UPDATE_ERR,
                message: 'updateMany error!'
            });
        }
        return callback(null, result);
    });
};
