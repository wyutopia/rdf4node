/**
 * Create by Eric on 2021/12/24
 */
const EventEmitter = require('events');
const {createClient} = require('redis');
const theApp = require('../../bootstrap');
const eRetCodes = require('../../include/retcodes');
const pubdefs = require('../../include/sysdefs');
const {redis: config} = require('../base/config');
const mntService = require('../base/prom.wrapper');
const {WinstonLogger} = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'redis');

const MODULE_NAME = 'REDIS_MNG';

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

class RedisClient extends EventEmitter {
    constructor(options) {
        super(options);
        //
        this.id = options.id;
        this.state = eClientState.Init;
        this._client = null;
        //
        
        (() => {

        })();
    }
}

class RedisWrapper {
    constructor() {
        this.name = MODULE_NAME;
        this.type = pubdefs.eModuleType.PLATFORM;
        this._clients = {};
        //
        this.createClient = (options, callback) => {
            logger.info(`${this.name}: new client with options`)
            let prefix = options.prefix === undefined? 'def' : options.prefix;
            let db = options.db === undefined? 0 : options.db;
            let mode = options.mode === undefined? 'pub' : options.mode;
            let clientId = prefix + db + mode;
            if (this._clients[clientId] !== undefined) {
                return callback(null, this._clients[clientId]);
            }
            let clientCfg = Object.assign(config.connection, {
                prefix: prefix,
                db: db
            });
            let client = createClient(clientCfg);
            client.on('error', (err) => {
                let msg = `${this.name}: Create client error! - ${err.message}`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.REDIS_CONNECT_ERR,
                    message: msg
                });
            });
            client.on('ready', () => {
                this._clients[clientId] = client;
                metricCollector[eMetricNames.activeConnection].inc();
                logger.info(`${this.name}: redis connected.`);
                return callback(null, client);
            });
            client.on('end', _onConnectionEnd.bind(this, clientId, options.parent));
        }
        this.dispose = (callback) => {
            this._clients.forEach(client => {
                client.close();
            });
            return callback();
        }
        //
        (() => {
            theApp.regModule(this);
        })();
    }
}

const redisWrapper = new RedisWrapper();
module.exports = redisWrapper;