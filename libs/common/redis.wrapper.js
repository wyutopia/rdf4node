/**
 * Created by Eric on 2021/12/24
 */
const util = require('util');
const async = require('async');
const { createClient } = require('redis');
// Framework libs
const eRetCodes = require('../../include/retcodes');
const sysdefs = require('../../include/sysdefs');
const eClientState = sysdefs.eClientState;
const sysconf = require('../../include/config');

const { EventObject, EventModule } = require('../../include/events');

const tools = require('../../utils/tools');
const mntService = require('../base/prom.monitor');
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

function _reconnectStrategy(retries) {
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
        this.lastError = null;
        this.state = eClientState.Null;
        this._client = null;
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
    isConnected () {
        return this.state === eClientState.Conn;
    }
    getClient () {
        return this._client;
    }
    execute (method, ...args) {
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
        return this._client[method](...args);
    }
    async execAsync(method, ...args) {
        if (!this.isConnected()) {
            this.lastError = `${this.$name}[${this.state}]: client disconnected.`;
            logger.error(this.lastError);
            return Promise.reject({
                code: eRetCodes.REDIS_CONN_ERR,
                message: this.lastError
            });
        }
        let func = this._client[method];
        if (typeof func !== 'function') {
            this.lastError = `${this.$name}[${this.state}]: Invalid method - ${method}`;
            logger.error(this.lastError);
            return Promise.reject({
                code: eRetCodes.REDIS_METHOD_NOTEXISTS,
                message: this.lastError
            });
        }
        return await this._client[method](...args);
    }
    async dispose () {
        if (this.isConnected()) {
            logger.info(`${this.$name}[${this.state}]: disconnecting...`);
            this.state = eClientState.Closing;
            this._client.disconnect();
            this._client = null;
        }
        return `${this.$name} closed.`;
    }
}

function _genClientId(config) {
    if (!this._shareConnection) { // Always create new connection
        return tools.uuidv4();
    }
    let endpoint = `${config.host}:${config.port}`;
    let seed = this._shareDatabase ? endpoint : `${config.database}@${endpoint}`;
    return tools.md5Sign(seed);
}

const _defaultRedisManagerProps = {
    shareConnection: false,
    shareDatabase: false,
    servers: {}
};

/**
 * Client type definition
 * @typedef { Object } ClientOptions
 * @property { string } engine
 * @property { number } database
 * @property { string } host
 * @property { string } port
 * @property { string } user
 * @property { string } password
 */

// The wrapper class
class RedisManager extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props)
        // Define member variable
        this._clients = {};
        this._state = sysdefs.eModuleState.INIT;
        // Implementing event handlers
        this.on('client-end', clientId => {
            logger.info(`${this.$name}: On client end. - ${clientId}`);
            if (this.isActive()) {
                delete this._clients[clientId];
            }
        });
    }
    init(config) {
        if (this._state !== sysdefs.eModuleState.INIT) {
            logger.error(`!!! Already initialzied.`)
            return null;
        }
        Object.keys(_defaultRedisManagerProps).forEach(key => {
            let propKey = '_' + key;
            this[propKey] = config[key] !== undefined? config[key] : _defaultRedisManagerProps[key];
        })
        this._state = sysdefs.eModuleState.ACTIVE;
    }
    // Implementing member methods
    /**
     * 
     * @param { string } name - The client name
     * @param { string } server - The server config key
     * @param { Object } options
     * @param { number } options.database - The database number
     * @param { string } options.host - The host ip
     * @param { number } options.port - The host port
     * @param { string } options.user - The username
     * @param { string } options.password - The password
     * @returns 
     */
    createClient(name, server, options) {
        if (this._state !== sysdefs.eModuleState.ACTIVE) {
            throw new Error(`!!! Initialize before using.`);
        }
        let config = tools.deepAssign({}, this._servers[server], options);
        logger.info(`${this.$name}: Create client with ${name} - ${tools.inspect(config)}`);
        //
        let clientId = _genClientId.call(this, config);
        if (this._clients[clientId] === undefined) {
            this._clients[clientId] = new RedisClient({
                $id: clientId,
                $name: name,
                parent: this,
                //
                config: config,
            });
        }
        return this._clients[clientId];
    }
    async dispose() {
        if (this._state !== sysdefs.eModuleState.ACTIVE) {
            return `inactive.`;
        }
        this.state = sysdefs.eModuleState.STOP_PENDING;
        let keys = Object.keys(this._clients);
        const promises = [];
        keys.forEach(key => {
            promises.push(this._clients[key].dispose());
        });
        logger.info(`Closing ${keys.length} client connections ...`);
        try {
            return await Promise.all(promises);
        } catch (ex) {
            logger.error(`Dispose client error! - ${ex.message}`);
            return ex;
        }
    }
}

module.exports = {
    RedisManager
}