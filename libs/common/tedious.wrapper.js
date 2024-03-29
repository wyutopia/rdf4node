/**
* Created by Eric on 2021/12/28
*/
// System libs
const async = require('async');
const {Connection, Request, TYPES} = require('tedious');
// Framework libs
const sysdefs = require('../../include/sysdefs');
const eClientState = sysdefs.eClientState;
const eRetCodes = require('../../include/retcodes');
const {CommonObject,  CommonModule} = require('../../include/base');
const tools = require('../../utils/tools');
const mntService = require('../base/prom.monitor');
const {WinstonLogger} = require('../base/winston.wrapper');

const logger = WinstonLogger(process.env.SRV_ROLE || 'tedious');

const MODULE_NAME = "TDS_CONN";

function _onRetryTimeout() {
    // Reset timer handle and perform connecting ...
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
        logger.error(`${this.$name}[${this.state}]: Invalid DataType!`);
        dt = TYPES.Null;
    }
    return dt;
}

class TdsClient extends CommonObject {
    constructor(options) {
        super(options);
        //
        this.config = options.config;
        this.connectionRetry = options.connectionRetry !== undefined? options.connectionRetry : true;
        this.connectionRetryInterval = options.connectionRetryInterval? options.connectionRetryInterval : sysdefs.eInterval._10_SEC;
        this.hRetry = null;
        this.state = eClientState.Null;
        this.connection = null;
        // Implementing methods
        this.isConnected = () => {
            return this.state === eClientState.Conn;
        },
        this.connect = () => {
            if (this.state !== eClientState.Null) {
                logger.error(`${this.$name}[${this.state}]: Not idle.`)
                return null;
            }
            this.state = eClientState.Init;
            let conn = new Connection(this.config);
            conn.on('connect', (err) => {
                if (this.state !== eClientState.Init) {
                    logger.error(`${this.$name}[${this.state}]: on <CONNECT> - Invalid state!`);
                    return null;
                }
                if (err) {
                    logger.error(`${this.$name}[${this.state}]: ${err.message}`);
                    this.state = eClientState.Null;
                } else {
                    logger.info(`${this.$name}[${this.state}]: on <CONNECT> - Server connected.`);
                    this.connection = conn;
                    this.state = eClientState.Conn;
                }
                return null;
            });
            conn.on('end', () => {
                logger.info(`${this.$name}[${this.state}]: Connection closed.`);
                switch(this.state) {
                    case eClientState.Init:
                        this.state = eClientState.Null;
                        break;
                    case eClientState.Conn:
                    case eClientState.PClosing:
                    case eClientState.Closing:
                        this.connection = null;
                        this.state = eClientState.Null;
                        break;
                    default:
                        break;
                }
                //
                if (this.connectionRetry && this.hRetry === null) {
                    this.hRetry = setTimeout(_onRetryTimeout.bind(this), this.connectionRetryInterval);
                }
            })
            conn.on('error', (err) => {
                logger.error(`${this.$name}[${this.state}]: ${err.message}`);
                this.state = eClientState.PClosing;
            });
            conn.connect();
        },
        this.execute = (options, callback) => {
            logger.debug(`${this.$name}[${this.state}]: ${tools.inspect(options)}`);
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
                    logger.error(`${this.$name}[${this.state}]: ${err.message}`);
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
                    logger.error(`${this.$name}[${this.state}]: ${ex.message}`);
                }
            }
            this.connection.execSql(req);
        }
        this.dispose = (callback) => {
            if (this.state === eClientState.Conn) {
                logger.info(`${this.$name}[${this.state}]: Close connection...`);
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
            logger.info(`${this.$name}: destroy all clients...`);
            async.eachLimit(this._clients, 4, (client, next) => {
                return client.dispose(next);
            }, () => {
                logger.info(`${this.$name}: all clients destroyed.`);
                return callback();
            });
        }
        //
        (() => {
            theApp.regModule(this);
        })();
    }
}
const tdsWrapper = new TdsWrapper({
    $name: 'TdsClientManager',
    $type: sysdefs.eModuleType.CM,
    //
    mandatory: true,
    state: sysdefs.eModuleState.ACTIVE
});

module.exports = exports = tdsWrapper;