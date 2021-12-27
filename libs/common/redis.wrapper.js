/**
 * Create by Eric on 2021/12/24
 */
const {createClient} = require('redis');
const theApp = require('../../bootstrap');
const {redis: config} = require('../base/config');
const mntService = require('../base/prom.wrapper');
const {WinstonLogger} = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'redis');

const MODULE_NAME = 'REDIS_CONN';
function _onConnectionEnd(clientId, parent) {
    logger.info(`${this.name}: Redis connection closed. - ${clientId}.`);
    let client = this._clients[clientId];
    if (client !== undefined) {
        client.close();
        delete this._clients[clientId];
    }
}

let redisWrapper = {
    name: MODULE_NAME,
    _clients : {},
    dispose: (callback) => {
        
    },
    createClient: (options) => {
        logger.info(`${this.name}: new client with options`)
        let prefix = options.prefix === undefined? 'def' : options.prefix;
        let db = options.db === undefined? 0 : options.db;
        let mode = options.mode === undefined? 'pub' : options.mode;
        let clientId = prefix + db + mode;
        if (this._clients[clientId] !== undefined) {
            return this._clients[clientId];
        }
        let clientCfg = Object.assign(config.connection, {
            prefix: prefix,
            db: db
        });
        let client = createClient(clientCfg);
        client.on('error', (err) => {
            logger.error(`${this.name}: Create client error! - ${err.message}`);
            return null;
        });
        client.on('ready', () => {
            this._clients[clientId] = client;
            logger.info(`${this.name}: redis connected.`);
            return client;
        });
        client.on('end', _onConnectionEnd.bind(this, clientId, options.parent));
    }
}
theApp.regModule(redisWrapper);

module.exports = redisWrapper;