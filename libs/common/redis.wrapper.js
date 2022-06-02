/**
 * Created by Eric on 2021/12/24
 */
 const async = require('async');
 const {createClient} = require('redis');
 const {CommonModule, EventModule, eClientState, CommonObject} = require('../../include/components');
 const theApp = require('../../bootstrap');
 const eRetCodes = require('../../include/retcodes');
 const pubdefs = require('../../include/sysdefs');
 const tools = require('../../utils/tools');
 const mntService = require('../base/prom.wrapper');
 const {WinstonLogger} = require('../base/winston.wrapper');
 const logger = WinstonLogger(process.env.SRV_ROLE || 'redis');
 
 const MODULE_NAME = 'REDIS_CONN';
 
 const eMetricNames = {
     activeConnection: 'act_conn'
 };
 
 const metricCollector = mntService.regMetrics({
     moduleName: MODULE_NAME,
     metrics: [{
         name: eMetricNames.activeConnection,
         type: pubdefs.eMetricType.GAUGE
     }]
 })
 
 function _onConnectionEnd(clientId, parent) {
     logger.info(`${this.name}: #${clientId} - connection closed.`);
     let client = this._clients[clientId];
     if (client !== undefined) {
         client.close();
         delete this._clients[clientId];
     }
     if (Object.keys(this._clients).length === 0) {
         logger.info(`${this.name}: All connections closed.`);
     }
 }
 
 function _assembleRealConfig(rawConf) {
     let sockConf = {
         host: rawConf.host || '127.0.0.1',
         port: rawConf.port || 6379,
         reconnectStrategy: (retries) => {
             if (retries > this.maxRetryTimes) {
                logger.error(`${this.name}: Max retry times (${this.maxRetryTimes}) exceeded.`);
                return pubdefs.eInterval._5_MIN;
             }
             return this.retryInterval;
         }
     }
     let config = {
         socket: sockConf,
         legacyMode: true
     };
     if (rawConf.username !== undefined) {
         config.username = rawConf.username;
     }
     if (rawConf.password !== undefined) {
         config.password = rawConf.password;
     }
     if (rawConf.database !== undefined) {
         config.database = rawConf.database;
     }
     return config;
 }
 
 const configSample = {
    host: '127.0.0.1',
    port: 6379,
    database: 0,     // Optional, default 0
    maxRetryTimes: 100,
    retryInterval: 1000,
    username: 'admin',      // Optional
    password: 'Dev#2022'    // Optional
 };
 // The class
 class RedisClient extends CommonObject {
     constructor(props) {
         super(props);
         //
         this.id = props.id;
         this.parent = props.parent;
         this.config = _assembleRealConfig(props.config); // Refer to configSample
         //this.maxRetryTimes = props.maxRetryTimes || 100;
         //this.retryInterval = props.retryInterval || 1000;
         //
         this.state = eClientState.Null;
         this._client = null;
         //
         this.isConnected = () => {
             return this.state === eClientState.Conn;
         }
         this.execute = (method, args, callback) => {
             if (!this.isConnected()) {
                 let msg = `${this.name}[${this.state}]: disconnected.`;
                 logger.error(msg);
                 return callback({
                     code: eRetCodes.REDIS_CONN_ERR,
                     message: msg
                 });
             }
             if (typeof args === 'function') {
                 callback = args;
                 args = [];
             }
             if (typeof this._client[method] !== 'function') {
                 let msg = `${this.name}[${this.state}]: Invalid method - ${method}`;
                 logger.error(msg);
                 return callback({
                     code: eRetCodes.REDIS_METHOD_NOTEXISTS,
                     message: msg
                 });
             }
             if (!tools.isTypeOfArray(args)) {
                 let msg = `${this.name}[${this.state}]: Invalid args format! - Should be array.`;
                 logger.error(msg);
                 return callback({
                     code: eRetCodes.REDIS_BAD_REQUEST,
                     message: msg
                 });
             }
             let argc = args.length;
             if (argc === 0) {
                 let msg = `${this.name}[${this.state}]: Empty args!`;
                 logger.error(msg);
                 return callback({
                     code: eRetCodes.REDIS_BAD_REQUEST,
                     message: msg
                 });
             }
             if (argc === 1) {
                 return this._client[method](args[0], callback);
             }
             if (argc === 2) {
                 return this._client[method](args[0], args[1], callback);
             }
             if (argc === 3) {
                 return this._client[method](args[0], args[1], args[2], callback);
             }
             if (argc === 4) {
                 return this._client[method](args[0], args[1], args[2], args[3], callback);
             }
             if (argc === 5) {
                 return this._client[method](args[0], args[1], args[2], args[3], args[4], callback);
             }
             if (argc === 6) {
                 return this._client[method](args[0], args[1], args[2], args[3], args[4], args[5], callback);
             }
             let msg = `${this.name}[${this.state}]: Too many parameters - ${method} - ${tools.inspect(args)}`;
             logger.error(msg);
             return callback({
                 code: eRetCodes.REDIS_METHOD_TOOMANYPARAMS,
                 message: msg
             });
         }
         this.dispose = (callback) => {
             if (this.isConnected()) {
                 this.state = eClientState.Closing;
                 this._client.quit();
                 this._client = null;
             }
             return process.nextTick(callback);
         }
         //
         (() => {
             logger.info(`${this.name}[${this.state}]: Create client ...`);
             let client = createClient(config);
             this.state = eClientState.Init;
             client.connect();
             client.on('connect', () => {
                 if (this.state === eClientState.Init) {
                     logger.info(`${this.name}[${this.state}]: Connecting...`);
                 } else {
                     logger.error(`${this.name}[${this.state}]: On [CONNECT] - Invalid state!`);
                 }
             });
             client.on('ready', () => {
                 this._client = client;
                 this.state = eClientState.Conn;
                 metricCollector[eMetricNames.activeConnection].inc();
                 logger.info(`${this.name}[${this.state}]: Server<${this.config.host}> connected.`);
             });
             client.on('error', (err) => {
                 switch(this.state) {
                     case eClientState.Init:
                         logger.error(`${this.name}[${this.state}]: On [ERROR] - Connecting failed! - ${err.message}`);
                         //this.state = eClientState.Closing;
                         break;
                     case eClientState.Conn:
                         logger.error(`${this.name}[${this.state}]: On [ERROR] - Connection error! - ${err.message}`);
                         this.state = eClientState.PClose;
                         break;
                     default:
                         logger.error(`${this.name}[${this.state}]: On [ERROR] - Invalid state!`);
                         break;
                 }
             });
             client.on('end', () => {
                 logger.info(`${this.name}[${this.state}]: Connection lost!`);
                 this.state = eClientState.Pending;
                 this.parent.emit('end', this.clientId);
             });
         })();
     }
 }
 
 class RedisWrapper extends EventModule {
     constructor(props) {
         super(props)
         //
         this._clients = {};
         /**
          * 
          * @param {mode, db, connection} options 
          * @returns 
          */
         this.createClient = (options) => {
             logger.info(`${this.name}: Create client with options - ${tools.inspect(options)}`)
             let db = options.database || 0;
             let name = options.name === undefined? 'global' : options.name;
             let clientId = `${name}${db}`; //name+db;
             if (this._clients[clientId] !== undefined) {
                 return this._clients[clientId];
             }
             let client = new RedisClient({
                 id: clientId,
                 parent: this,
                 config: options
             });
             this._clients[clientId] = client;
             return client;
         }
         this.dispose = (callback) => {
             this.state = pubdefs.eModuleState.STOP_PENDING;
             logger.info(`${this.name}: Closing all client connections ...`);
             let keys = Object.keys(this._clients);
             async.eachLimit(keys, 4, (key, next) => {
                 let client = this._clients[key];
                 if (client === undefined) {
                     return process.nextTick(next);
                 }
                 return client.dispose(next);
             }, () => {
                 logger.info(`${this.name}: All connections closed.`);
                 return callback();
             });
         }
         this.on('end', (clientId) => {
             logger.info(`${this.name}: On client end. - ${clientId}`);
             if (this.isActive()) {
                 delete this._clients[clientId];
             }
         });
         //
         (() => {
             this.state = pubdefs.eModuleState.ACTIVE;
             theApp.regModule(this);
         })();
     }
 }
 
 const redisWrapper = new RedisWrapper({
     name: MODULE_NAME,
     mandatory: true,
     type: pubdefs.eModuleType.CONN,
     state: pubdefs.eModuleState.ACTIVE
 });
 module.exports = redisWrapper;