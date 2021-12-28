/**
* Create by Eric on 2021/12/28
*/
const {Connection, Request} = require('tedious');
const theApp = require('../../bootstrap');
const tools = require('../../utils/tools');
const mntService = require('../base/prom.wrapper');
const {WinstonLogger} = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'redis');

const MODULE_NAME = "TDS_CONN";

class TdsConnection {
    constructor() {
        this.id = tools.uuidv4(),
        this.connection = null,
        // Implementing methods
        this.createConnection = (config, callback) => {
            let conn = new Connection(config);
            conn.on('connect', (err) => {
                if (err) {
                    logger.error(`${this.name}: connect error! - ${err.message}`);
                    return callback(err);
                }
                this.connection = conn;
                return this;
            });
            conn.on('end', () => {
                if (this.connection === null) {
                    logger.info(`${this.name}: disconnected.`);
                } else {
                    logger.error(`${this.name}: Server closed or network error!`);
                    this.connection = null;
                }
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
    }
}

class TdsConnectionPool {
    constructor() {
        this.name = MODULE_NAME;
        this.connections = {};
        //
        this.createConnection = (options) => {

        },
        this.dispose = (callback) => {
            logger.info(`${this.name}: Disconnect from server...`);
            if (this.connection !== null) {
                this.connection.close();
                this.connection = null;
            }
            return process.nextTick(callback);
        }
    }
}

const tdsWrapper = {
    name: MODULE_NAME,
    connections: {},
    createConnection: () => {

    },
    dispose: (callback) => {

    }
}
theApp.regModule(tdsWrapper);

module.exports = exports = tdsWrapper;