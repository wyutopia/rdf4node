/**
 * Created by Eric on 2021/12/24
 */
const async = require('async');
const { createClient } = require('redis');
// Framework libs
const theApp = require('../../app');
const eRetCodes = require('../../include/retcodes');
const sysdefs = require('../../include/sysdefs');
const eClientState = sysdefs.eClientState;
const sysconf = require('../../framework/config');

const { EventObject, EventModule } = require('../../include/events');

const tools = require('../../utils/tools');
const mntService = require('../base/prom.wrapper');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'redis');

const MODULE_NAME = 'REDIS_CONN';

const eMetricNames = {
    activeConnection: 'act_conn'
};

const metricCollector = mntService.regMetrics({
    moduleName: MODULE_NAME,
    metrics: [{
        name: eMetricNames.activeConnection,
        type: sysdefs.eMetricType.GAUGE
    }]
})

function _onConnectionEnd(clientId, parent) {
    logger.info(`${this.$name}: #${clientId} - connection closed.`);
    let client = this._clients[clientId];
    if (client !== undefined) {
        client.close();
        delete this._clients[clientId];
    }
    if (Object.keys(this._clients).length === 0) {
        logger.info(`${this.$name}: All connections closed.`);
    }
}

function _reconnectStrategy (retries) {
    if (this.state === eClientState.Closing || retries > this.maxRetryTimes) {
        logger.error(`${this.$name}: Max retry times (${this.maxRetryTimes}) exceeded.`);
        return false;
    }
    return this.retryInterval;
}

function _assembleRealConfig(rawConf) {
    let config = {
        legacyMode: true
    };
    if (rawConf.url) {
        config.url = rawConf.url;
    } else {
        config.socket = {
            host: rawConf.host || '127.0.0.1',
            port: rawConf.port || 6379,
            reconnectStrategy: _reconnectStrategy.bind(this)
        }
    }
    ['username', 'password', 'database'].forEach(key => {
        if (rawConf[key] !== undefined) {
            config[key] = rawConf[key];
        }
    })
    return config;
}

const gClientConfig = {
    host: '127.0.0.1',
    port: 6379,
    database: 0,            // Optional, default 0
    maxRetryTimes: 100,
    retryInterval: 1000,
    username: 'admin',      // Optional
    password: 'Dev#2022'    // Optional
};
// The class
class RedisClient extends EventObject {
    constructor(props) {
        super(props);
        //
        this.id = props.id;
        this.$parent = props.parent;
        this.$name = props.name || props.id;
        this.config = _assembleRealConfig.call(this, props.config); // Refer to gClientConfig
        this.maxRetryTimes = props.maxRetryTimes || 100;
        this.retryInterval = props.retryInterval || 1000;
        //
        this.state = eClientState.Null;
        this._client = null;
        //
        this.isConnected = () => {
            return this.state === eClientState.Conn;
        }
        this.getClient = () => {
            return this._client;
        }
        this.execute = (method, args, callback) => {
            if (!this.isConnected()) {
                let msg = `${this.$name}[${this.state}]: client disconnected.`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.REDIS_CONN_ERR,
                    message: msg
                });
            }
            if (typeof args === 'function') {
                callback = args;
                args = [];
            }
            if (typeof this._client[method] !== 'function') {
                let msg = `${this.$name}[${this.state}]: Invalid method - ${method}`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.REDIS_METHOD_NOTEXISTS,
                    message: msg
                });
            }
            if (!tools.isTypeOfArray(args)) {
                let msg = `${this.$name}[${this.state}]: Invalid args format! - Should be array.`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.REDIS_BAD_REQUEST,
                    message: msg
                });
            }
            let argc = args.length;
            if (argc === 0) {
                let msg = `${this.$name}[${this.state}]: Empty args!`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.REDIS_BAD_REQUEST,
                    message: msg
                });
            }
            if (argc === 1) {
                return this._client[method](args[0], callback);
            }
            if (argc === 2) {
                return this._client[method](args[0], args[1], callback);
            }
            if (argc === 3) {
                return this._client[method](args[0], args[1], args[2], callback);
            }
            if (argc === 4) {
                return this._client[method](args[0], args[1], args[2], args[3], callback);
            }
            if (argc === 5) {
                return this._client[method](args[0], args[1], args[2], args[3], args[4], callback);
            }
            if (argc === 6) {
                return this._client[method](args[0], args[1], args[2], args[3], args[4], args[5], callback);
            }
            if (argc === 7) {
                return this._client[method](args[0], args[1], args[2], args[3], args[4], args[5], args[6], callback);
            }
            if (argc === 8) {
                return this._client[method](args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], callback);
            }
            if (argc === 9) {
                return this._client[method](args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], callback);
            }
            if (argc === 10) {
                return this._client[method](args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9], callback);
            }
            let msg = `${this.$name}[${this.state}]: Too many parameters - ${method} - ${tools.inspect(args)}`;
            logger.error(msg);
            return callback({
                code: eRetCodes.REDIS_METHOD_TOOMANYPARAMS,
                message: msg
            });
        }
        this.dispose = (callback) => {
            if (this.isConnected()) {
                logger.info(`${this.$name}[${this.state}]: disconnecting...`);
                this.state = eClientState.Closing;
                this._client.disconnect();
                this._client = null;
            }
            return process.nextTick(callback);
        }
        //
        (() => {
            logger.info(`${this.$name}[${this.state}]: Create client ...`);
            let client = createClient(this.config);
            this.state = eClientState.Init;
            client.connect();
            client.on('connect', () => {
                if (this.state === eClientState.Init) {
                    logger.info(`${this.$name}[${this.state}]: Connecting...`);
                } else {
                    logger.error(`${this.$name}[${this.state}]: On [CONNECT] - Invalid state!`);
                }
            });
            client.on('ready', () => {
                this._client = client;
                this.state = eClientState.Conn;
                metricCollector[eMetricNames.activeConnection].inc();
                //
                let hostInfo = tools.safeGetJsonValue(this.config, 'socket.host') || this.config.url;
                logger.info(`${this.$name}[${this.state}]: Server<${hostInfo}> connected.`);
            });
            client.on('error', (err) => {
                switch (this.state) {
                    case eClientState.Init:
                        logger.error(`${this.$name}[${this.state}]: On [ERROR] - Connecting failed! - ${err.message}`);
                        //this.state = eClientState.Closing;
                        break;
                    case eClientState.Conn:
                        logger.error(`${this.$name}[${this.state}]: On [ERROR] - Connection error! - ${err.message}`);
                        this.state = eClientState.PClosing;
                        break;
                    case eClientState.Closing:
                        logger.error(`${this.$name}[${this.state}]: On [ERROR] - Connection closed! - ${err.message}`);
                        break;
                    default:
                        logger.error(`${this.$name}[${this.state}]: On [ERROR] - Invalid state!`);
                        break;
                }
            });
            client.on('reconnection', () => {
                logger.debug(`${this.$name}[${this.state}]: On [RECONNECTION].`);
            });
            client.on('end', () => {
                logger.info(`${this.$name}[${this.state}]: Connection closed!`);
                this.state = eClientState.Pending;
                this.$parent.emit('client-end', this.id);
                this.state = eClientState.Null;
            });
        })();
    }
}

const gClientSpecOptions = {
    name: {
        type: 'String'
    },
    config: {}
};

function _genClientId (dbShare, config) {
    let seed = dbShare? `` : ``
}

// The wrapper class
class RedisWrapper extends EventModule {
    constructor(props) {
        super(props)
        //
        let moduleConf = props.config || {};
        this.clientShare = moduleConf.clientShare !== undefined? props.clientShare : false;
        this.dbShare = moduleConf.dbShare !== undefined? props.dbShare : false;
        this.profiles = moduleConf.profiles || {
            default: {
                type: 'procmem',
                config: {}
            }
        }
        this._clients = {};
        this.on('client-end', clientId => {
            logger.info(`${this.$name}: On client end. - ${clientId}`);
            if (this.isActive()) {
                delete this._clients[clientId];
            }
        });
        /**
         * 
         * @param {mode, db, gClientSpecOptions} options 
         * @returns 
         */
        this.createClient = (name, profile = 'default') => {
            logger.info(`${this.$name}: Create client with ${name} - ${profile}`);
            //
            let clientConf = this.profiles[profile].config || {};
            let clientId = this.clientShare? _genClientId(this.dbShare, clientConf) : tools.uuidv4();
            if (this._clients[clientId] === undefined) {
                this._clients[clientId] = new RedisClient({
                    parent: this,
                    //
                    id: clientId,
                    $name: name,
                    config: clientConf
                });
            }
            return this._clients[clientId];
        }
        this.dispose = (callback) => {
            this.state = sysdefs.eModuleState.STOP_PENDING;
            logger.info(`${this.$name}: Closing all client connections ...`);
            let keys = Object.keys(this._clients);
            async.eachLimit(keys, 4, (key, next) => {
                let client = this._clients[key];
                if (client === undefined) {
                    return process.nextTick(next);
                }
                return client.dispose(next);
            }, () => {
                logger.info(`${this.$name}: All connections closed.`);
                return callback();
            });
        }
        //
        (() => {
            this.state = sysdefs.eModuleState.ACTIVE;
            theApp.regModule(this);
        })();
    }
}

const redisWrapper = new RedisWrapper({
    $name: MODULE_NAME,
    mandatory: true,
    type: sysdefs.eModuleType.CONN,
    state: sysdefs.eModuleState.ACTIVE,
    config: sysconf.caches || {}
});
module.exports = redisWrapper;