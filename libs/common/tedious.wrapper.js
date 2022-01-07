/**
* Create by Eric on 2021/12/28
*/
const async = require('async');
const {Connection, Request, TYPES} = require('tedious');
const theApp = require('../../bootstrap');
const tools = require('../../utils/tools');
const pubdefs = require('../../include/sysdefs');
const eRetCodes = require('../../include/retcodes');
const mntService = require('../base/prom.wrapper');
const {WinstonLogger} = require('../base/winston.wrapper');
const { CommonModule } = require('../../include/components');
const logger = WinstonLogger(process.env.SRV_ROLE || 'redis');

const MODULE_NAME = "TDS_CONN";

const eClientState = {
    Init: 'init',
    Connecting: 'connecting',
    Connected: 'connected',
    Closing: 'closing',
    ServerErr: 'srv-err',
    Pending: 'pending'
};

function _retryConnect() {
    this.hRetry = null;
    this.connect();
}

const eDataTypes = {
    // Exact numberics
    'bit'            : TYPES.Bit,
    'tinyint'        : TYPES.TinyInt,
    'smallint'       : TYPES.SmallInt,
    'int'            : TYPES.Int,
    'bigint'         : TYPES.BigInt,
    'numberic'       : TYPES.Numeric,
    'decimal'        : TYPES.Decimal,
    'smallmoney'     : TYPES.SmallMoney,
    'money'          : TYPES.Money,
    // Approximate numberics
    'float'          : TYPES.Float,
    'real'           : TYPES.Real,
    // Date and Time
    'smalldatetime'  : TYPES.SmallDateTime,
    'datetime'       : TYPES.DateTime,
    'datetime2'      : TYPES.DateTime2,
    'datetimeoffset' : TYPES.DateTimeOffset,
    'time'           : TYPES.Time,
    'date'           : TYPES.Date,
    // Character Strings
    'char'           : TYPES.Char,
    'varchar'        : TYPES.VarChar,
    'text'           : TYPES.Text,
    // Unicoding Strings
    'nchar'          : TYPES.NChar,
    'nvarchar'       : TYPES.NVarChar,
    'ntext'          : TYPES.NText,
    // Binary Strings
    'binary'         : TYPES.Binary,
    'varbinary'      : TYPES.VarBinary,
    'image'          : TYPES.Image,
    // Other Data Types
    'null'           : TYPES.Null,
    'TVP'            : TYPES.TVP,
    'UDT'            : TYPES.UDT,
    'uniqueidentifier' : TYPES.UniqueIdentifier,
    'variant'        : TYPES.Variant,
    'xml'            : TYPES.xml
};
function _convertDataType(t) {
    let dt = eDataTypes[t];
    if (dt === undefined) {
        logger.error(`${this.name}[${this.state}]: Invalid DataType!`);
        dt = TYPES.Null;
    }
    return dt;
}

class TdsClient {
    constructor(options) {
        this.name = options.name,
        this.config = options.config;
        this.connectionRetry = options.connectionRetry !== undefined? options.connectionRetry : true;
        this.connectionRetryInterval = options.connectionRetryInterval? options.connectionRetryInterval : pubdefs.eInterval._10_SEC;
        this.hRetry = null;
        this.state = eClientState.Init;
        this.connection = null;
        // Implementing methods
        this.isConnected = () => {
            return this.state === eClientState.Connected;
        },
        this.connect = () => {
            if (this.state !== eClientState.Init) {
                logger.error(`${this.name}[${this.state}]: Already in active.`)
                return null;
            }
            this.state = eClientState.Connecting;
            let conn = new Connection(this.config);
            conn.on('connect', (err) => {
                if (err) {
                    logger.error(`${this.name}[${this.state}]: ${err.message}`);
                } else {
                    logger.debug(`${this.name}[${this.state}]: connected.`);
                    this.connection = conn;
                    this.state = eClientState.Connected;
                }
            });
            conn.on('end', () => {
                switch(this.state) {
                    case eClientState.Connecting:
                        this.state = eClientState.Init;
                        break;
                    case eClientState.Connected:
                    case eClientState.ServerErr:
                        logger.error(`${this.name}[${this.state}]: Server closed or network error!`);
                        this.connection = null;
                        this.state = eClientState.Init;
                        break;
                    case eClientState.Closing:
                        logger.info(`${this.name}[${this.state}]: Connection closed.`);
                        this.connection = null;
                        this.state = eClientState.Init;
                        break;
                    default:
                        break;
                }
                //
                if (this.connectionRetry && this.hRetry === null) {
                    this.hRetry = setTimeout(_retryConnect.bind(this), this.connectionRetryInterval);
                }
            })
            conn.on('error', (err) => {
                logger.error(`${this.name}[${this.state}]: ${err.message}`);
                this.state = eClientState.ServerErr;
            });
            conn.connect();
        },
        this.execute = (options, callback) => {
            logger.debug(`${this.name}[${this.state}]: ${tools.inspect(options)}`);
            if (this.connection === null) {
                let msg = `Execute error: connection lost! - ${tools.inspect(options)}`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.TEDIOUS_ERROR,
                    message: msg
                });
            }
            let req = new Request(options.statement, (err, rowCount, rows) => {
                if (err) {
                    logger.error(`${this.name}[${this.state}]: ${err.message}`);
                    return callback(err);
                }
                return callback(null, rowCount);
            });
            if (options.parameters) {
                try {
                    let params = JSON.parse(options.parameters);
                    let keys = Object.keys(params)
                    keys.forEach(key => {
                        let p = params[key];
                        req.addParameter(key, _convertDataType.call(this, p.type), p.value);
                    });
                } catch (ex) {
                    logger.error(`${this.name}[${this.state}]: ${ex.message}`);
                }
            }
            this.connection.execSql(req);
        }
        this.dispose = (callback) => {
            if (this.state === eClientState.Connected) {
                logger.info(`${this.name}[${this.state}]: Close connection...`);
                this.state = eClientState.Closing;
                this.connection.close();
            }
            return process.nextTick(callback);
        }
        //
        this.connect();
    }
}

class TdsWrapper extends CommonModule {
    constructor(options) {
        super(options);
        //
        this._clients = [];
        //
        this.createClient = (options) => {
            let client = new TdsClient(options);
            this._clients.push(client);
            return client;
        },
        this.dispose = (callback) => {
            logger.info(`${this.name}: close all connections...`);
            async.eachLimit(this._clients, 4, (client, next) => {
                return client.dispose(next);
            }, () => {
                return callback();
            });
        }
        //
        (() => {
            theApp.regModule(tdsWrapper);
        })();
    }
}
const tdsWrapper = new TdsWrapper({
    name: 'TdsClientManager',
    mandatory: true,
    state: pubdefs.eModuleState.ACTIVE
});

module.exports = exports = tdsWrapper;