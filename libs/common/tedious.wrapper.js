/**
* Create by Eric on 2021/12/28
*/
const async = require('async');
const {Connection, Request} = require('tedious');
const theApp = require('../../bootstrap');
const tools = require('../../utils/tools');
const mntService = require('../base/prom.wrapper');
const {WinstonLogger} = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'redis');

const MODULE_NAME = "TDS_CONN";

class TdsClient {
    constructor(options) {
        this.name = options.name,
        this.config = options.config;
        this.isConnected = false;
        this.connection = null,
        // Implementing methods
        this.connect = () => {
            if (this.isConnected) {
                return null;
            }
            let conn = new Connection(config);
            conn.on('connect', (err) => {
                if (err) {
                    logger.error(`${this.name}: connect error! - ${err.message}`);
                }
                this.connection = conn;
                this.isConnected = true;
            });
            conn.on('end', () => {
                if (this.isConnected) {
                    logger.error(`${this.name}: Server closed or network error!`);
                    this.isConnected = false;
                } else {
                    logger.info(`${this.name}: disconnected.`);
                }
                this.connection = null;
            })
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
            let req = new Request(options.sql, callback);
            this.connection.execute(req, options.params || {});
        }
        this.dispose = (callback) => {
            if (this.isConnected) {
                logger.info(`${this.id}: Close connection...`);
                this.isConnected = false;
                this.connection.close();
            }
            return process.nextTick(callback);
        }
        //
        this.connect();
    }
}

const tdsWrapper = {
    name: MODULE_NAME,
    _clients: [],
    createClient: (options) => {
        let client = new TdsClient(options);
        this._clients.push(client);
        return client;
    },
    dispose: (callback) => {
        logger.info(`${this.name}: close all connections...`);
        async.eachLimit(_clients, 4, (client, next) => {
            return client.dispose(next);
        }, () => {
            return callback();
        });
    }
}
theApp.regModule(tdsWrapper);

module.exports = exports = tdsWrapper;