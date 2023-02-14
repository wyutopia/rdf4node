/**
 * Created by Eric on 2021/11/15
 */
 const async = require('async');
 const mysql = require('mysql2');
 //
 const theApp = require('../../bootstrap');
 const sysdefs = require('../../include/sysdefs');
 const eState = sysdefs.eConnectionState;
 const eRetCodes = require('../../include/retcodes');
 const {EventEmitter, EventModule} = require('../../include/events');
 const tools = require('../../utils/tools');
 const {mysql: config} = require('../../framework/config');
 const {WinstonLogger} = require('../base/winston.wrapper');
 const logger = WinstonLogger(process.env.SRV_ROLE || 'mysql2');
 
 const mntService = require('../base/prom.wrapper');
 
 const MODULE_NAME = 'MYSQL_CM';  //
 /*********************************************
  * Set monitor metrics
  *********************************************/
const eMetricsName = {
    poolActive: 'pool_active',
    connTotal: 'conn_total',
    connRefused: 'conn_refused',
    connActive: 'conn_active',
    queryAttempt: 'query_attempt',
    querySuccess: 'query_succ',
    queryFailure: 'query_fail'
};

const metricsCollector = mntService.regMetrics({
    moduleName: MODULE_NAME,
    metrics: [{
        name: eMetricsName.poolActive,
        type: sysdefs.eMetricType.GAUGE
    }, {
        name: eMetricsName.connTotal,
        type: sysdefs.eMetricType.COUNTER
    }, {
        name: eMetricsName.connRefused,
        type: sysdefs.eMetricType.COUNTER
    }, {
        name: eMetricsName.connActive,
        type: sysdefs.eMetricType.GAUGE
    }, {
        name: eMetricsName.queryAttempt,
        type: sysdefs.eMetricType.COUNTER
    }, {
        name: eMetricsName.querySuccess,
        type: sysdefs.eMetricType.COUNTER
    }, {
        name: eMetricsName.queryFailure,
        type: sysdefs.eMetricType.COUNTER
    }]
});
 
// The connection class
class MySqlConnection {
    constructor(props) {
        this._id = props.id;
        this._parent = props.parent;
        this._state = eState.Closed;
        this._lastError = null;
        this._ttlTimer = null;
        this._conn = mysql.createConnection(props.dbConf);
        if (this._conn) {
            this._conn.on('error', err => {
                let msg = `[${this._id}]: Connection error! - ${err.code}#${err.message} - state#${this._state}`;
                logger.error(msg);
                this._lastError = {
                    code: eRetCodes.DB_QUERY_ERR,
                    message: msg
                };
                if (this._state === eState.Conn) {
                    this._parent.emit('conn_closed', this._id);
                }
                this._state = eState.PClosing;
            });
        }
        this.query = (stmt, callback) => {
            logger.debug(`MySqlConn[${this._id}]: query() called. - ${stmt}`);
            if (this._state !== eState.Closed && this._state !== eState.Conn) {
                let msg = `MySqlConn[${this._id}]: Query is not allowed in state#${this._state}!`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.METHOD_NOT_ALLOWED,
                    message: msg
                });
            }
            this._state = eState.Querying;
            this._lastError = null;
            metricsCollector[eMetricsName.queryAttempt].inc(1);
            return this._conn.query(stmt, (err, rows) => {
                if (this._state !== eState.Querying) {  // In case connection error occurred.
                    return callback(this._lastError || {
                        code: eRetCodes.DB_QUERY_ERR,
                        message: `Connection error while querying! - state#${this._state}`
                    });
                }
                if (err) {
                    let msg = `MySqlConn[${this._id}]: Query error! - ${err.syscall} - ${err.errno}#${err.code}`;
                    logger.error(msg);
                    this._lastError = err;
                    if (err.code === 'ECONNREFUSED') {
                        metricsCollector[eMetricsName.connRefused].inc(1);
                        this._state = eState.Closed;
                    } else {
                        this._state = eState.ClosePending;
                    }
                    metricsCollector[eMetricsName.queryFailure].inc(1);
                } else {
                    metricsCollector[eMetricsName.querySuccess].inc(1);
                    this._state = eState.Conn;
                }
                return callback(this._lastError, rows);
            });
        };
        this.end = (callback) => {
            logger.debug(`MySqlConn[${this._id}]: Querying end. - state#${this._state}`);
            this._parent.emit('query_end', this._id, this._state);
            // Remove connection from BUSY queue
            if (callback) {
                callback();
            }
        };
        this.dispose = (callback) => {
            logger.debug(`MySqlConn[${this._id}]: Dispose connection called. - state#${this._state}`);
            this.clearTtlTimer();
            if (this._state === eState.Closed || this._state === eState.Closing) { // Already in closing status
                return callback();
            }
            this._state = eState.Closing;
            try {
                this._conn.end((err) => {
                    if (err) {
                        logger.error(`MySqlConn[${this._id}]: End connection error! - ${err.code}#${err.message}`);
                    }
                    this._state = eState.Closed;
                });
            } catch (ex) {
                logger.error(`MySqlConn[${this._id}]: Closing connection exception! - ${ex.message}.`);
            } finally {
                logger.debug(`MySqlConn[${this._id}]: Connection disposed.`);
                if (callback) {
                    callback();
                }
            }
        };
        this.clearTtlTimer = () => {
            if (this._ttlTimer !== null) {
                clearTimeout(this._ttlTimer);
                this._ttlTimer = null;
            }
        }
        this.startTtlTimer = (itv = sysdefs.eInterval._1_MIN) => {
            if (this._ttlTimer === null) {
                this._ttlTimer = setTimeout(() => {
                    this._ttlTimer = null;
                    this._parent.emit('ttl_timeout', this._id, this._state);
                }, itv);
            }
        }
    }
}

function _removeQueueElement (arr, cid) {
    let index = arr.indexOf(cid);
    if (index !== -1) {
        arr.splice(index, 1);
    }
}

function _updateLastActiveTime () {
    this._lastActiveTime = new Date();
}
class MySqlConnectionPool extends EventEmitter{
    /**
     * @param props = {id, connectionLimit, reuse, ttl, dbConf = {host, port, database, user, password, charset}}
     */
    constructor(props) {
        super(props);
        //
        this._name = "MySqlConnPool";
        this._id = props.id;
        this._parent = props.parent;
        this._poolTtl = props.poolTtl;
        this._lastActiveTime = new Date();
        //
        this._connectionLimit = props.connLimit;
        this._reuse = props.connReuse;
        this._ttl = props.connTtl;
        this._dbConf = props.dbConf;
        //
        this._connRepo = {};  // The connection repositories
        this._idle = [];  // The idle queue
        this._busy = [];  // The busy queue
        this._pending = []; // The close-pending queue
        //
        this.alias = `${this._name}[${this._id}]`;
        // Implementing member methods
        this.alloc = () => {
            _updateLastActiveTime.call(this);
            logger.debug(`${this.alias}: Allocate connection...`);
            let conn = null;
            if (this._idle.length > 0) { // Reuse exist IDLE connection
                let cid = this._idle.shift();
                conn = this._connRepo[cid];
                conn.clearTtlTimer();
                this._busy.push(cid);
            } else if (Object.keys(this._connRepo).length < this._connectionLimit) {
                let cid = uuidv4();
                conn = new MySqlConnection({
                    id: cid,
                    parent: this,
                    dbConf: this._dbConf,
                    ttl: this._ttl
                });
                this._connRepo[cid] = conn;
                this._busy.push(cid);
                //
                metricsCollector[eMetricsName.connTotal].inc(1);
                metricsCollector[eMetricsName.connActive].inc(1);
            }
            if (conn) {
                logger.debug(`${this.alias}: connection #${conn._id} allocated.`);
            } else {
                logger.error(`${this.alias}: connection limit exceed.`);
                // TODO: fire alarm
            }
            return conn;
        };
        this.dispose = (callback) => {
            let keys = Object.keys(this._connRepo);
            logger.info(`${this.alias}: Start disposing ${keys.length} connections ...`);
            async.eachLimit(keys, 4, (cid, next) => {
                let conn = this._connRepo[cid];
                return conn.dispose(next);
            }, () => {
                logger.info(`${this.alias}: Total ${keys.length} connections disposed.`);
                return callback();
            })
        };
        this.on('conn_closed', id => {
            _updateLastActiveTime.call(this);
            logger.info(`${this.alias}: On conn_closed - ${id}`);
            let index = this._idle.indexOf(id);
            if (index !== -1) { // Move from Idle to Pending
                logger.info(`${this.alias}: Move ${id} from Idle to Pending`);
                let conn = this._connRepo[id];
                conn.clearTtlTimer();
                this._idle.splice(index, 1);
                this._pending.push(id);
                conn.startTtlTimer(0);
            }
        });
        this.on('ttl_timeout', (id, connState) => {
            _updateLastActiveTime.call(this);
            logger.info(`${this.alias}: On ttl_timeout - ${id} - ${connState}`);
            logger.debug(`${this.alias}: Before - t(${Object.keys(this._connRepo).length}) - i(${this._idle.length}) - b(${this._busy.length}) - p(${this._pending.length})`);
            if (this._reuse && connState === eState.Conn) {
                _removeQueueElement(this._idle, id);
            } else {
                _removeQueueElement(this._pending, id);
            }
            let conn = this._connRepo[id];
            if (!conn) {
                logger.error(`${this.alias}: Specified connection not exists! - ${id}`);
                return;
            }
            conn.dispose(() => {
                delete this._connRepo[id];
                metricsCollector[eMetricsName.connActive].dec(1);
                logger.info(`${this.alias}: After - t(${Object.keys(this._connRepo).length}) - i(${this._idle.length}) - b(${this._busy.length}) - p(${this._pending.length})`);
            });
        });
        this.on('query_end', (id, connState) => {
            _updateLastActiveTime.call(this);
            logger.info(`${this.alias}: On connection #${id} end with state#${tools.inspect(connState)}`);
            let conn = this._connRepo[id];
            if (conn) {
                _removeQueueElement(this._busy, id);
                if (this._reuse && connState === eState.Conn) {
                    this._idle.push(id);
                    conn.startTtlTimer(this._ttl);
                } else {
                    this._pending.push(id);
                    conn.startTtlTimer(0); // Trigger timeout immediately
                }
            } else {
                logger.error(`[${this.alias}]: connection #${id} not found in busy queue.`);
            }
        });
        (() => {
            this._ttlTimer = setInterval(() => {
                let dur = new Date() - this._lastActiveTime;
                if (dur > this._poolTtl && Object.keys(this._connRepo).length === 0) {
                    logger.info(`${this.alias}: idle time - ${dur}`);
                    clearInterval(this._ttlTimer);
                    this._parent.emit('pool_inact', this._id);
                }
            }, sysdefs.eInterval._10_SEC);
        })();
    }
}

// The class
class MysqlWrapper extends EventModule {
    constructor(props) {
        logger.info(`Create MySqlWrapper with props: ${tools.inspect(props)}`);
        super(props);
        //
        this._pools = {};
        this._config = props.config || {};
        // Implementing methods
        /**
         * @param dbConf = {host, port, database, user, password, charset, ttl}
         */
        this.createConnection = (dbConf) => {
            let conn = null;
            if (this.state !== sysdefs.eModuleState.ACTIVE) {
                return conn;
            }
            let poolId = tools.genSign(`${dbConf.host}:${dbConf.port}:${dbConf.database}`);
            let pool = this._pools[poolId];
            if (pool === undefined) {
                let options = {
                    id: poolId,
                    parent: this,
                    dbConf: dbConf,
                    //
                    poolTtl: this._config.poolTtl || sysdefs.eInterval._2_MIN,
                    connLimit: this._config.connLimit || 10,
                    connReuse: this._config.connReuse !== undefined? this._config.connReuse : false,
                    connTtl: this._config.connTtl || sysdefs.eInterval._1_MIN,
                };
                logger.debug(`New connection-pool with options: ${tools.inspect(options)}`);
                pool = new MySqlConnectionPool(options);
                this._pools[poolId] = pool;
                metricsCollector[eMetricsName.poolActive].inc(1);
            }
            conn = pool.alloc();
            return conn;
        }
        this.on('pool_inact', id => {
            logger.debug(`${this.name}: On pool_inact - remove inactive pool - ${id}`);
            delete this._pools[id];
            metricsCollector[eMetricsName.poolActive].dec(1);
        });
        this.dispose = (callback) => {
            logger.info(this.name, 'perform cleaning ...');
            if (this.state !== sysdefs.eModuleState.ACTIVE) {
                logger.warn(this.name, 'method re-entry!');
                return callback();
            }
            this.state = sysdefs.eModuleState.STOP_PENDING;
            let keys = Object.keys(this._pools);
            async.eachLimit(keys, 4, (key, next) => {
                let pool = this._pools[key];
                return pool.dispose(next);
            }, () => {
                this.state = sysdefs.eModuleState.INIT;
                logger.info(this.name, 'All connection closed.');
                return callback();
            });
        }
        // Register module
        (() => {
            theApp.regModule(this);
        })();
    }
}
 
 const mysqlWrapper = new MysqlWrapper({
     name: MODULE_NAME,
     type: sysdefs.eModuleType.CONN,
     mandatory: true,
     state: sysdefs.eModuleState.ACTIVE,
     config: config
 });
 module.exports = exports = mysqlWrapper;