/**
 * All callback methods have the following signature function(err, data, res).
 * err (Error, optional): set if there was an error, otherwise falsy
 * data (Object, optional): response data if any, otherwise undefined
 * res (http.IncomingMessage, optional): HTTP response object with additional body property. This might
 *   not exist when err is set. The body property can be a decoded object, string, or Buffer.
 */
 const async = require('async');

 const pubdefs = require('../common/pubdefs');
 const {consul: config} = require('../common/config');
 const tools = require('../utils/tools');
 const {WinstonLogger} = require('./winston.wrapper');
 const logger = WinstonLogger(process.env.SRV_ROLE || 'consul');


 
 // Create local client
 const consul = require('consul')({
     host: config.host,    // String: agent address
     port: config.port     // Integer: agent port
 });
 
 /**
  * consul.agent.service  methods
  */
 // List
 exports.listServices = (callback) => {
     consul.agent.service.list((err, result) => {
         if (err) {
             logger.error('agent.service.list: ', err.code, err.message);
             return callback(err);
         }
         logger.info(`List services: ${tools.inspect(result)}`);
         return callback(null, result);
     });
 }
 // Register
 exports.regService = (options, callback) => {
     logger.info('Reg service:', tools.inspect(options));
     consul.agent.service.register(options, err => {
         if (err) {
             logger.error('service.register: ', err.code, err.message);
             return callback(err);
         }
         return callback();
     });
 };
 // Deregister
 exports.deregService = (options, callback) => {
     logger.info('De-register service:', tools.inspect(options));
     if (options.id === undefined) {
         return callback({
             code: eRetCodes.OP_FAILED,
             message: 'Unrecognized service ID'
         });
     }
     consul.agent.service.deregister(options, (err, data, result) => {
         if (err) {
             logger.error('service.deregister: ', err.code, err.message);
             return callback(err);
         }
         logger.info('De-register service succeed.');
         return callback(null, data, result);
     })
 };
 // Maintenance
 exports.maintainService = (options, callback) => {
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
 exports.setKv = (key, val, callback) => {
     return consul.kv.set(key, val, callback);
 };
 
 exports.getKv = (key, callback) => {
     let options = {
         key: key,
         raw: true
     }
     return consul.kv.get(options, callback);
 };
 
 