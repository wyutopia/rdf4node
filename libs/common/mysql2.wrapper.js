/**
 * Created by Eric on 2021/11/15
 */
 const async = require('async');
 const mysql = require('mysql2');
 //
 const pubdefs = require('../../include/sysdefs');
 const theApp = require('../../bootstrap');
 const {EventModule} = require('../event-module');
 const tools = require('../../utils/tools');
 
 const {WinstonLogger} = require('../base/winston.wrapper');
 const logger = WinstonLogger(process.env.SRV_ROLE || 'mysql2');
 
 const mntService = require('../base/prom.wrapper');
 
 const MODULE_NAME = 'MYSQL_CM';  //
 /*********************************************
  * Set monitor metrics
  *********************************************/
 const eMetricsName = {
     connTotal: 'connection_total',
     connActive: 'connection_active',
     queryAttempt: 'query_attempt',
     querySuccess: 'query_success',
     queryFailed: 'query_failed'
 };
 
 const metricsCollector = mntService.regMetrics({
     moduleName: MODULE_NAME,
     metrics: [{
         name: eMetricsName.connTotal,
         type: pubdefs.eMetricType.COUNTER
     }, {
         name: eMetricsName.connActive,
         type: pubdefs.eMetricType.GAUGE
     }, {
         name: eMetricsName.queryAttempt,
         type: pubdefs.eMetricType.COUNTER
     }, {
         name: eMetricsName.querySuccess,
         type: pubdefs.eMetricType.COUNTER
     }, {
         name: eMetricsName.queryFailed,
         type: pubdefs.eMetricType.COUNTER
     }]
 });
 
 const eStatus = {
     INIT            : 'init',
     CONN_WAIT       : 'conn_wait',
     CONNECTED       : 'connected',
     CLOSE_PENDING   : 'close_pending'
 }
 function oops () {}
 
 function onTtlTimeout(callback) {
     logger.debug(__file, __line, this.id, this.refCount, 'Ttl timeout...');
     if (this.refCount > 0) { // Restart ttl timer
         this.tm = setTimeout(onTtlTimeout.bind(this, oops), this.ttl);
         return callback();
     }
     this.parent.emit('end', this.id);
     this.tm = null;
     _closeConnection.call(this, () => {
         this.parent.emit('close', this.id);
         return callback();
     });
 }
 
 class MySqlConnection {
     constructor(parent, id, options) {
         this.id = id;
         this.parent = parent;
         this.connection = mysql.createConnection(options);
         this.refCount = 1;
         this.ttl = options.ttl || pubdefs.eInterval._1_MIN;
         this.tm = null;
         this.status = eStatus.INIT;
         //
         this.end = (callback) => {
             this.refCount--;
             if (callback) {
                 callback();
             }
         }
         this.connect = (callback) => {
             if (this.status !== eStatus.INIT) {  // Already connected
                 return callback();
             }
             this.status = eStatus.CONN_WAIT;
             return this.connection.connect((err) => {
                 if (err) {
                     this.end();
                     this.tatus = eStatus.INIT;
                 } else {
                     this.status = eStatus.CONNECTED;
                 }
                 return callback(err);
             });
         }
         this.query = (stmt, callback) => {
             metricsCollector[eMetricsName.queryAttempt].inc(1);
             return this.connection.query(stmt, (err, rows) => {
                 if (err) {
                     metricsCollector[eMetricsName.queryFailed].inc(1);
                     this.end();
                 } else {
                     metricsCollector[eMetricsName.querySuccess].inc(1);
                 }
                 return callback(err, rows);
             });
         };
         //
         (() => {
             // Start TTL timer
             this.tm = setTimeout(onTtlTimeout.bind(this, oops), this.ttl);
         })();
     }
 }
 
 function _incRefCount() {
     this.refCount++;
     clearTimeout(this.tm);
     this.tm = setTimeout(onTtlTimeout.bind(this, oops), this.ttl);
 }
 
 function _closeConnection(callback) {
     try {
         this.status = eStatus.CLOSE_PENDING;
         this.connection.destroy();
     } catch (err) {
         logger.error(__file, __line, this.id, err.message);
     }
     this.status = eStatus.INIT;
     metricsCollector[eMetricsName.connActive].dec(1);
     return callback();
 }
 
 // The class
 class MysqlWrapper extends EventModule {
     constructor(options) {
         super(options);
         //
         this._clients = {};
         this._closePendings = {};
         // Implementing methods
         /**
          * @param options = {db = {host, port, user, password, database, charset}, ttl}
          */
         this.createConnection = (options) => {
             if (this.state !== pubdefs.eModuleState.ACTIVE) {
                 return null;
             }
             let key = tools.genSign(`${options.host}:${options.port}:${options.database}`);
             let client = this._clients[key];
             if (client !== undefined) { // Connection exists
                 _incRefCount.call(client);
             } else {
                 // Create new
                 client = new MySqlConnection(this, key, options);
                 this._clients[key] = client;
                 metricsCollector[eMetricsName.connTotal].inc(1);
                 metricsCollector[eMetricsName.connActive].inc(1);
             }
             return client;
         }
         this.dispose = (callback) => {
             logger.info(__file, __line, this.name, 'Perform clean-up ...');
             if (this.state !== pubdefs.eModuleState.ACTIVE) {
                 logger.warn(__file, __line, this.name, 'method re-entry!');
                 return callback();
             }
             this.state = pubdefs.eModuleState.STOP_PENDING;
             let keys = Object.keys(this._clients);
             logger.info(__file, __line, this.name, `Close ${keys.length} mysql connections...`);
             // Step 1: Stop all timers
             keys.forEach(key => {
                 clearTimeout(this._clients[key].tm);
             });
             // Step 2: End all connections
             async.eachLimit(keys, 6, (key, next) => {
                 let client = this._clients[key];
                 _closeConnection.call(client, next);
             }, () => {
                 this.state = pubdefs.eModuleState.INIT;
                 logger.info(__file, __line, this.name, 'All connection closed.');
                 return callback();
             });
         }
         //
         this.on('end', (id) => {
             if (this.state === pubdefs.eModuleState.ACTIVE) {
                 this._closePendings[id] = this._clients[id];
                 delete this._clients[id];
             }
         });
         this.on('close', (id) => {
             if (this.state === pubdefs.eModuleState.ACTIVE) {
                 delete this._closePendings[id];
             }
         });
         // Register module
         (() => {
             theApp.regModule(this);
         })();
     }
 }
 
 const mysqlWrapper = new MysqlWrapper({
     name: MODULE_NAME,
     type: pubdefs.eModuleType.CONN,
     mandatory: true,
     state: pubdefs.eModuleState.ACTIVE
 });
 module.exports = exports = mysqlWrapper;