/**
 * Created by Eric on 2021/12/24
 */
const async = require('async');
const { createClient } = require('redis');
// Framework libs
const theApp = require('../../framework/app');
const eRetCodes = require('../../include/retcodes');
const sysdefs = require('../../include/sysdefs');
const eClientState = sysdefs.eClientState;
const sysconf = require('../../include/config');

const { EventObject, EventModule } = require('../../include/events');

const tools = require('../../utils/tools');
const mntService = require('../base/prom.wrapper');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'redis');

const _MODULE_NAME = 'REDIS_CONN';

const eMetricNames = {
    activeConnection: 'act_conn'
};

const metricCollector = mntService.regMetrics({
    moduleName: _MODULE_NAME,
    metrics: [{
        name: eMetricNames.activeConnection,
        type: sysdefs.eMetricType.Gauge
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

const _typeClientConfig = {
    host: '127.0.0.1',
    port: 6379,
    database: 0,            // Optional, default 0
    maxRetryTimes: 100,
    retryInterval: 1000,
    username: 'admin',      // Optional
    password: 'Dev#2022'    // Optional
};

const _typeClientProps = {
    name: 'string',
    parent: 'object',
    config: '_typeClientConfig'
};

// The class
class RedisClient extends EventObject {
    constructor(props) {
        super(props);
        //
        this.$parent = props.parent;
        this.config = _assembleRealConfig.call(this, props.config); // Refer to _typeClientConfig
        this.maxRetryTimes = props.config.maxRetryTimes || 100;
        this.retryInterval = props.config.retryInterval || 1000;
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
        this.execute = (method, ...args) => {
            let callback = args[args.length - 1];
            if (!this.isConnected()) {
                let msg = `${this.$name}[${this.state}]: client disconnected.`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.REDIS_CONN_ERR,
                    message: msg
                });
            }
            let func = this._client[method];
            if (typeof func !== 'function') {
                let msg = `${this.$name}[${this.state}]: Invalid method - ${method}`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.REDIS_METHOD_NOTEXISTS,
                    message: msg
                });
            }
            return func.apply(this._client, args);
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
            this._client = createClient(this.config);
            this._client.on('connect', () => {
                if (this.state === eClientState.Init) {
                    logger.info(`${this.$name}[${this.state}]: Connecting...`);
                } else {
                    logger.error(`${this.$name}[${this.state}]: On [CONNECT] - Invalid state!`);
                }
            });
            this._client.on('ready', () => {
                this.state = eClientState.Conn;
                metricCollector[eMetricNames.activeConnection].inc();
                //
                let hostInfo = tools.safeGetJsonValue(this.config, 'socket.host') || this.config.url;
                logger.info(`${this.$name}[${this.state}]: Server<${hostInfo}> connected.`);
            });
            this._client.on('error', (err) => {
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
            this._client.on('reconnection', () => {
                logger.debug(`${this.$name}[${this.state}]: On [RECONNECTION].`);
            });
            this._client.on('end', () => {
                logger.info(`${this.$name}[${this.state}]: Connection closed!`);
                this.state = eClientState.Pending;
                this.$parent.emit('client-end', this.$id);
                this.state = eClientState.Null;
            });
            // Initializing connection
            this.state = eClientState.Init;
            this._client.connect();
        })();
    }
}

const gClientSpecOptions = {
    name: {
        type: 'String'
    },
    config: {}
};

function _genClientId (config) {
    if (!this.shareClient) {
        return tools.uuidv4();
    }
    let seed = this.shareDatabase? `${config.host}:${config.port}` : `${config.database}@${config.host}:${config.port}`
    return tools.md5Sign(seed);
}

const _typeRedisWrapperProps = {
    name: 'string',
    shareClient: 'boolean',
    shareDatabase: 'boolean'
};

// The wrapper class
class RedisWrapper extends EventModule {
    constructor(props) {
        super(props)
        //
        this.shareClient = props.shareClient !== undefined? props.shareClient : false;
        this.shareDatabase = props.shareDatabase !== undefined? props.shareDatabase : false;
        // Define member variable
        this._clients = {};
        // Implementing event handlers
        this.on('client-end', clientId => {
            logger.info(`${this.$name}: On client end. - ${clientId}`);
            if (this.isActive()) {
                delete this._clients[clientId];
            }
        });
        // Implementing member methods
        /**
         * 
         * @param {mode, db, gClientSpecOptions} options 
         * @returns 
         */
        this.createClient = (name, config) => {
            logger.info(`${this.$name}: Create client with ${name} - ${tools.inspect(config)}`);
            //
            let clientId = _genClientId.call(this, config);
            if (this._clients[clientId] === undefined) {
                this._clients[clientId] = new RedisClient({
                    $id: clientId,
                    $name: name,
                    config: config,
                    //
                    parent: this,
                });
            }
            return this._clients[clientId];
        }
        this.dispose = (callback) => {
            this.state = sysdefs.eModuleState.STOP_PENDING;
            logger.info(`${this.$name}: Closing all client connections ...`);
            let keys = Object.keys(this._clients);
            async.eachLimit(keys, 3, (key, next) => {
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
    $name: _MODULE_NAME,
    $type: sysdefs.eModuleType.CM,
    mandatory: true,
    state: sysdefs.eModuleState.ACTIVE,
    //
    config: sysconf.caches || {}
});
module.exports = redisWrapper;