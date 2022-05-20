/**
 * All callback methods have the following signature function(err, data, res).
 * err (Error, optional): set if there was an error, otherwise falsy
 * data (Object, optional): response data if any, otherwise undefined
 * res (http.IncomingMessage, optional): HTTP response object with additional body property. This might
 *   not exist when err is set. The body property can be a decoded object, string, or Buffer.
 */
 const async = require('async');
 //
 const {consul: config} = require('./config');
 const pubdefs = require('../../include/sysdefs');
 const tools = require('../../utils/tools');
 const {WinstonLogger} = require('./winston.wrapper');
 const logger = WinstonLogger(process.env.SRV_ROLE || 'consul');

 // Create local client
 const consul = require('consul')({
     host: config.host,    // String: agent address
     port: config.port     // Integer: agent port
 });
 
 /**
  * consul.catalog.service  methods
  */
 // List services
 exports.listServices = function (callback) {
    consul.catalog.service.list((err, result) => {
        if (err) {
            logger.error(`list services error! - ${err.code}#${err.message}`);
            return callback(err);
        }
        logger.debug(`List services: ${tools.inspect(result)}`);
        return callback(null, result);
    });
 }

 // List nodes of service
 exports.listServiceNodes = function (serviceName, callback) {
    consul.catalog.service.nodes(serviceName, (err, result) => {
        if (err) {
            logger.error(`list nodes of service error! - ${err.code}#${err.message}`);
            return callback(err);
        }
        logger.debug(`List service nodes: ${tools.inspect(result)}`);
        return callback(null, result);
    });
}

 // Register
 exports.regService = function (options, callback) {
     logger.info(`Register service: ${tools.inspect(options)}`);
     consul.agent.service.register(options, err => {
         if (err) {
             logger.error(`Register service error! - ${err.code}#${err.message}`);
             return callback(err);
         }
         return callback();
     });
 }

 // Deregister
 exports.deregService = function (options, callback) {
     logger.info(`De-register service: ${tools.inspect(options)}`);
     if (options.id === undefined) {
         return callback({
             code: eRetCodes.OP_FAILED,
             message: 'Unrecognized service ID'
         });
     }
     consul.agent.service.deregister(options, (err, data, result) => {
         if (err) {
             logger.error(`De-register service error! - ${err.code}#${err.message}`);
             return callback(err);
         }
         logger.info(`De-register service succeed.`);
         return callback(null, data, result);
     })
 }

 // Maintenance
 exports.maintainService = function (options, callback) {
     if (options.id === undefined) {
         return callback({
             code: eRetCodes.OP_FAILED,
             message: 'Unrecognized service ID'
         });
     }
     if (options.reason === undefined) {
         options.reason = 'Manual set';
     }
     consul.agent.service.maintenance(options, (err, data, result) => {
         if (err) {
             logger.error('service.maintenance: ', err.code, err.message);
             return callback(err);
         }
         logger.info('service.maintenacne: ', data, result);
         return callback(null, data, result);
     });
 };
 
 /**
  * consul.acl
  */
 //consul.acl.bootstrap(onCallback.bind(null, 'acl.bootstrap'));
 
 /**
  * consul agent
  */
 //consul.agent.members(onCallback.bind(null, 'agent.members'));
 //consul.agent.reload(onCallback.bind(null, 'agent.reload'));
 //consul.agent.self(onCallback.bind(null, 'agent.self'));
 //consul.agent.maintenance(true, onCallback.bind(null, 'agent.maintenance'));
 //consul.agent.join('127.0.0.1', onCallback.bind(null, 'agent.join'));
 //consul.agent.forceLeave('node2', onCallback.bind(null, 'agent.forceLeave'));
 
 
 // Returns the checks the agent is managing
 
 
 // Deregister a check
 //consul.agent.check.deregister('example', onCallback(null, 'agent.check.example'));
 
 // Returns the checks the agent is managing
 //consul.agent.check.list(onCallback.bind(null, 'agent.check.list'));
 
 
 /**
  * consul kv
  */
 exports.setKv = function (key, val, callback) {
     return consul.kv.set(key, val, callback);
 };
 
 exports.getKv = function (key, callback) {
     let options = {
         key: key,
         raw: true
     }
     return consul.kv.get(options, callback);
 };
 
 