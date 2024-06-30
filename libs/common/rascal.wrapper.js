/**
 * Created by Eric on 2022/01/02
 * To replace amqp.wrapper in the future
 */
const async = require('async');
const util = require('util');
const _MODULE_NAME = 'AMQP_MNG';
// System libs
const assert = require('assert');
const Broker = require('rascal').BrokerAsPromised;
// Framework libs

const sysdefs = require('../../include/sysdefs');
const eRetCodes = require('../../include/retcodes');
const eClientState = sysdefs.eClientState;
const { EventObject, EventModule } = require('../../include/events');
const tools = require('../../utils/tools');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf4node');

function _getClientConfig({vhost, connection, channel}) {
    return {
        vhost, 
        connection: tools.safeGetJsonValue(this._config, `connections.${connection}`), 
        params: tools.safeGetJsonValue(this._config, `channels.${channel}`)
    }
}

// The rascal client factory 
class RascalFactory extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        // The member variables
        this._idGen = 0;
        this._config = {};
        this._clients = {};
        // Define event handler
        this.on('client-error', (id, err) => {

        })
        this.on('client-end', (id, reason) => {
            logger.info(`${this.$name}: On client [END] - ${name} - ${tools.inspect(err)}`);
            delete this._clients[name];
        });
    }
    async init(config) {
        // Save config
        this._config = config;
        return true;
    }
    // Implementing member methods
    /**
     * 
     * @param { Object } options 
     * @param { string } options.vhost
     * @param { string } options.connection
     * @param { string } options.channel
     * @param { string } options.event - The event code while emitting received messages to subscribers
     * @returns {RascalClient}
     */
    async getClient(options) {
        let vhost = options.vhost || '/';
        let connection = options.connection || 'app';
        let channel = options.channel || 'default';
        const clientId = `${vhost}:${connection}:${channel}`;
        if (this._clients[clientId] !== undefined) {
            return this._clients[clientId];
        }
        let config = _getClientConfig.call(this, {vhost, connection, channel});
        this._clients[clientId] = new RascalClient({
            $name: clientId,
            //
            config,
            event: options.event || 'rmq-msg'
        })
        this._clients[clientId].on('client-error', (clientId, err) => {
            logger.info(`!!! TODO: Handle client-error event ...`);
        })
        await this._clients[clientId].init();
        return this._clients[clientId];
    }
    async dispose() {
        const clientKeys = Object.keys(this._clients);
        logger.info(`${this.$name}: Dispose ${clientKeys.length} rascal clients ...`);

        const asyncItrs = {};
        clientKeys.forEach(key => {
            let client = this._clients[key];
            asyncItrs[client.$name] = client.dispose.bind(client);
        })
        const result = {
            rascal: await async.parallel(asyncItrs)
        }
        return result;
    }
}


const _configKeys = ['exchanges', 'queues', 'bindings', 'publications', 'subscriptions'];
function _assembleClientConfig({ vhost, connection, params }) {
    let vhosts = {};
    vhosts[vhost] = {
        connection: connection
    };
    _configKeys.forEach(key => {
        if (params[key] !== undefined) {
            vhosts[vhost][key] = params[key];
        }
    });
    return {
        vhosts: vhosts
    };
}

/**
 * 
 * @param {string} vhost 
 * @param {*} connection
 * @param {exchanges, queues, bindings, publications, subscriptions} params 
 */
async function _initRascalClient() {
    this.state = eClientState.Init;
    //
    const clientConfig = _assembleClientConfig(this._config);
    logger.debug(`${this.$name}: Init client with config - ${tools.inspect(this._config)}`);
    const broker = await Broker.create(clientConfig);
    this.state = eClientState.Conn0;
    broker.on('error', err => {
        logger.error(`${this.$name}[${this.state}]: Broker error! - ${err.message}`);
        this.state = eClientState.Null;
        this.emit('client-error', this.$name, err);
    });
    // Parse and save publication keys
    let publications = tools.safeGetJsonValue(this._config, 'params.publications');
    if (publications !== undefined) {
        this._pubKeys = Object.keys(publications);
    }
    // Do subscriptions
    let subscriptions = tools.safeGetJsonValue(this._config, 'params.subscriptions');
    if (subscriptions !== undefined) {
        await _doSubscribe.call(this, broker, subscriptions);
    }
    this._broker = broker;
    this.state = eClientState.Conn;
    logger.debug(`${this.$name}[${this.state}]: broker created.`);
    return 'ok'
}


async function _doSubscribe(broker, subscriptions) {
    let keys = Object.keys(subscriptions);
    logger.info(`${this.$name}[${this.state}]: Subscription keys= ${tools.inspect(keys)}`);
    await async.eachLimit(keys, 3, async (confKey) => {
        try {
            const sub = await broker.subscribe(confKey);
            sub.on('message', (message, content, ackOrNack) => {
                //logger.debug(`${this.$name}[${this.state}]: Content= ${tools.inspect(content)}`);
                // Processing message
                try {
                    this.emit(this._emitEvent, message, content);
                    ackOrNack();
                } catch (ex) {
                    logger.error(`*** ${this.$name}[${this.state}]: Parsing content error! - ${ex.message}`);
                    ackOrNack(ex);
                }
            }).on('error', (err) => {
                logger.error(`${this.$name}[${this.state}]: Handle message error! - ${err.code}#${err.message}`);
            });
        } catch (err) {
            let msg = `${this.$name}[${this.state}]: Subscribe key=${confKey} error! - ${err.message}`;
            logger.error(msg);
            return err.message;
        }
    })
}

const _typeClientProps = {
    $id: 'string',
    $name: 'string',
    //
    options: 'object'
};


// The client class
class RascalClient extends EventObject {
    constructor(props) {
        super(props);
        // Declaring member variables
        this.state = eClientState.Null;
        //
        this._config = props.config; // {vhost, connection, params}
        this._emitEvent = props.event;
        this._broker = null;
        this._pubKeys = [];
    }
    async init() {
        if (this.state !== eClientState.Null) {
            logger.warn(`*** ${this.$name}[${this.state}]: already initialized.`);
            return this.state;
        }
        try {
            await _initRascalClient.call(this);
            return this.state;
        } catch (ex) {
            logger.error(`*** [${this.$name}]: init error! - ${ex.message}`);
            return ex.message;
        }
    }
    // Implementing methods
    async dispose() {
        if (this._broker === null || this.state !== eClientState.Conn) {
            return `${this.$name}: already closed.`;
        }
        this.state = eClientState.Closing;
        try {
            await this._broker.shutdown();
            this._broker = null;
            this.state = eClientState.Closed;
            return 'closed';
        } catch (ex) {
            logger.error(`*** ${this.$name}[${this.state}]: shutdown error! - ${ex.message}`);
            return ex.message;
        }
    }
    // Perform publishing
    publish(pubKey, data, options, callback) {
        logger.debug(`${this.$name}[${this.state}]: Publish - ${pubKey}, ${tools.inspect(data)}, ${tools.inspect(options)}`);
        if (this.state !== eClientState.Conn) {
            let msg = `${this.$name}[${this.state}]: Please execute initializing before use.`
            logger.error(msg);
            return callback({
                code: eRetCodes.MQ_PUB_ERR,
                message: msg
            });
        }
        if (this._pubKeys.indexOf(pubKey) === -1) {
            let msg = `${this.$name}[${this.state}]: Unrecognized publication - ${pubKey}!`;
            logger.error(msg);
            return callback({
                code: eRetCodes.MQ_PUB_ERR,
                message: msg
            });
        }
        return this._broker.publish(pubKey, data, options, (err, pubSession) => {
            if (err) {
                let msg = `${this.$name}[${this.state}]: Publish error! - ${err.message}`;
                logger.error(msg);
                return callback({
                    code: MQ_PUB_ERR,
                    messaeg: msg
                });
            }
            pubSession.on('error', err => {
                logger.error(`${this.$name}[${this.state}]: PubSession on [ERROR]! - ${err.message}`);
                return callback(err);
            });
            pubSession.on('success', (msgId) => {
                logger.debug(`${this.$name}[${this.state}]: PubSession on [SUCCESS] - ${msgId}`);
                return callback(null, msgId);
            });
            pubSession.on('return', (message) => {
                logger.debug(`${this.$name}[${this.state}]: PubSession on [RETURN] - ${tools.inspect(message)}`);
                //TODO: 
            });
        });
    }

    /**
     * 
     * @param { string } pubKey 
     * @param { Object } data 
     * @param { Object } options 
     * @returns 
     */
    async pubAsync(pubKey, data, options) {
        logger.debug(`${this.$name}[${this.state}]: Publish - ${pubKey}, ${data.code}, ${tools.inspect(options)}`);
        if (this.state !== eClientState.Conn) {
            throw new Error(`${this.$name}[${this.state}]: Please execute initializing before use.`);
        }
        if (!this._pubKeys.includes(pubKey)) {
            throw new Error(`${this.$name}[${this.state}]: Unrecognized publication - ${pubKey}!`);
        }
        const session = await this._broker.publish(pubKey, data, options);
        session.on('error', err => {
            logger.error(`${this.$name}[${this.state}]: PubSession on [ERROR]! - ${err.message}`);
        });
        session.on('success', (msgId) => {
            logger.debug(`${this.$name}[${this.state}]: PubSession on [SUCCESS] - ${msgId}`);
        });
        session.on('return', (message) => {
            logger.debug(`${this.$name}[${this.state}]: on RETURN - ${tools.inspect(message.fields)} - ${message.properties.contentType} - ${message.properties.messageId}`);
            //TODO: 
        });
    }
}


// Define module
module.exports = exports = {
    RascalFactory
};