/**
 * Create by Eric on 2021/12/24
 */
 const async = require('async');
 const {createClient} = require('redis');
 const {CommonModule, EventModule, eClientState, CommonObject} = require('../../include/components');
 const theApp = require('../../bootstrap');
 const eRetCodes = require('../../include/retcodes');
 const pubdefs = require('../../include/sysdefs');
 const tools = require('../../utils/tools');
 const {redis: config} = require('../base/config');
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
 
 function _assembleRealConfig() {
     let sockConf = {
         host: this.config.host,
         port: this.config.port,
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
     if (this.config.username !== undefined) {
         config.username = this.config.username;
     }
     if (this.config.password !== undefined) {
         config.password = this.config.password;
     }
     if (this.config.database !== undefined) {
         config.database = this.config.database;
     }
     return config;
 }
 
 class RedisClient extends CommonObject {
     constructor(options) {
         super(options);
         //
         this.parent = options.parent;
         this.config = options.config;
         this.maxRetryTimes = options.maxRetryTimes || 100;
         this.retryInterval = options.retryInterval || 1000;
         //
         this.state = eClientState.Null;
         this._client = null;
         //
         this.isConnected = () => {
             return this.state === eClientState.Conn;
         }
         this.execute = (method, ...args) => {
             if (!this.isConnected()) {
                 let msg = `${this.name}[${this.state}]: disconnected.`;
                 logger.error(msg);
                 return callback({
                     code: eRetCodes.REDIS_CONN_ERR,
                     message: msg
                 });
             }
             if (typeof this._client[method] !== 'function') {
                 let msg = `${this.name}[${this.state}]: Invalid method - ${method}`;
                 logger.error(msg);
                 return callback({
                     code: eRetCodes.REDIS_METHOD_NOTEXISTS,
                     message: msg
                 });
             }
             let argc = args.length;
             if (argc === 1) {
                 return this._client[method](args[0]);
             }
             if (argc === 2) {
                 return this._client[method](args[0], args[1]);
             }
             if (argc === 3) {
                 return this._client[method](args[0], args[1], args[2]);
             }
             if (argc === 4) {
                 return this._client[method](args[0], args[1], args[2], args[3]);
             }
             if (argc === 5) {
                 return this._client[method](args[0], args[1], args[2], args[3], args[4]);
             }
             if (argc === 6) {
                 return this._client[method](args[0], args[1], args[2], args[3], args[4], args[5]);
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
             let config = _assembleRealConfig.call(this);
             logger.info(`${this.name}[${this.state}]: Create client with - ${tools.inspect(config)}`);
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
     constructor(options) {
         super(options)
         //
         this._clients = {};
         //
         this.createClient = (options) => {
             if (!this.isActive()) {
                 return null;
             }
             logger.info(`${this.name}: new client with options - ${tools.inspect(options)}`)
             let db = options.database || 0;
             let mode = options.mode === undefined? 'pub' : options.mode;
             let clientId = db + mode;
             if (this._clients[clientId] !== undefined) {
                 return this._clients[clientId];
             }
             let clientCfg = Object.assign(config.connection, {
                 database: db
             });
             let client = new RedisClient({
                 id: clientId,
                 parent: this,
                 config: clientCfg
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