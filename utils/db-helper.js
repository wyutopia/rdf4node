/**
 * Create by eric 2021/11/15
 */
 const assert = require('assert');
 //
 const pubdefs = require('../include/sysdefs');
 const eRetCodes = require('../include/retcodes.js');
 const tools = require('./tools');
 const {WinstonLogger} = require('../libs/base/winston.wrapper');
 const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf');

 //
 function _unifiedFind(db, options, callback) {
     logger.info(`${db.modelName} - options: ${tools.inspect(options)}`);
     let filter = options.filter || {};
     let query = options.multi === true? db.find(filter) : db.findOne(filter);
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
 
 exports.findMany = (db, options, callback) => {
     assert(Object.getPrototypeOf(db).name === 'Model');
     //
     return _unifiedFind(db, options, callback);
 };
 
 /**
  *
  * @param db
  * @param options
  * @param callback
  */
 exports.findPartial = (db, options, callback) => {
     assert(Object.getPrototypeOf(db).name === 'Model');
     //
     let name = db.modelName;
     let ps = parseInt(options.pageSize || '10');
     let pn = parseInt(options.page || '1');
     let filter = options.filter || {};
 
     logger.info(`Query ${name} with filter: ${tools.inspect(filter)}`);
     db.countDocuments(filter, (err, total) => {
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
             query.sort();
         }
         if (options.populate) {
             query.populate();
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
 }
 
 exports.updateOne = (db, params, callback) => {
     assert(Object.getPrototypeOf(db).name === 'Model');
     //
     let filter = params.filter || {};
     let updates = params.updates || {};
     let options = params.options || {};
     if (Object.keys(updates).length === 0) {
         let msg = `Empty updates! - ${tools.inspect(updates)}`;
         logger.info(msg);
         return callback({
             code: eRetCodes.OP_FAILED,
             message: msg
         });
     }
     if (options.new === undefined) {
         options.new = true;
     }
     logger.info(`Update: ${db.modelName} - ${tools.inspect(filter)} - ${tools.inspect(updates)} - ${tools.inspect(options)}`)
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
 };
 