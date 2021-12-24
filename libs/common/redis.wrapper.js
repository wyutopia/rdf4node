/**
 * Create by Eric on 2021/12/24
 */
const redis = require('redis');
const {redis: config} = require('../conf/config');
const theApp = require('../../bootstrap');
const mntService = require('../base/prom.wrapper');
const {WinstonLogger} = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'redis');

const MODULE_NAME = 'REDIS_CONN';
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
        if (clients[clientId] !== undefined) {
            return clients[clientId];
        }
        let clientCfg = Object.assign(config.connection, {
            prefix: prefix,
            db: db
        });
        let client = redis.createClient(clientCfg);
        client.on('error', function(err) {
            console.log(err.code, err.message);
        });
        client.on('ready', function() {
            console.log('Redis connected.');
        });
        client.on('end', () => {
            console.log('Redis connection closed.');
        });
        clients[clientId] = client;
        return client;
    }
}

theApp.regModule()

module.exports = redisWrapper;