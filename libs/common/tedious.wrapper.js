/**
* Create by Eric on 2021/12/28
*/
const async = require('async');
const {Connection, Request} = require('tedious');
const theApp = require('../../bootstrap');
const tools = require('../../utils/tools');
const pubdefs = require('../../include/sysdefs');
const mntService = require('../base/prom.wrapper');
const {WinstonLogger} = require('../base/winston.wrapper');
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
            if (this.connection === null) {
                let msg = `Execute error: connection lost! - ${tools.inspect(options)}`;
                logger.error(msg);
                return callback({
                    code: 1433,
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

class TdsWrapper {
    constructor(options) {
        this.name = options.name;
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
    }
}
const tdsWrapper = new TdsWrapper({
    name: 'TdsClientManager'
})
theApp.regModule(tdsWrapper);

module.exports = exports = tdsWrapper;