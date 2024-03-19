/**
 * Created by Eric on 2022/01/02
 * To replace amqp.wrapper in the future
 */
const util = require('util');
const _MODULE_NAME = 'AMQP_MNG';
// System libs
const async = require('async');
const assert = require('assert');
const Broker = require('rascal').BrokerAsPromised;
// Framework libs

const sysdefs = require('../../include/sysdefs');
const eRetCodes = require('../../include/retcodes');
const eClientState = sysdefs.eClientState;
const { CommonObject } = require('../../include/base');
const { EventModule } = require('../../include/events');
const tools = require('../../utils/tools');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf4node');

// The rascal client factory 
class RascalManager extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        // The member variables
        this._clients = {};
        // Define event handler
        this.on('client-end', (name, err) => {
            logger.info(`${this.$name}: On client [END] - ${name} - ${tools.inspect(err)}`);
            delete this._clients[name];
        });
    }
    init(config) {
        this._config = config;
    }
    // Implementing member methods
    /**
     * 
     * @param {string} name 
     * @param {vhost, connection, params} options 
     * @returns {RascalClient}
     */
    getClient(name, options) {
        if (this._clients[name] === undefined) {
            this._clients[name] = new RascalClient({
                $name: name,
                //
                parent: this,
                ebus: this._appCtx.ebus,
                options: options
            });
        }
        return this._clients[name];
    }
    async dispose() {
        try {
            const promises = [];
            const clientKeys = Object.keys(this._clients);
            clientKeys.forEach(key => {
                promises.push(this._clients[key].dispose());
            });
            logger.info(`${this.$name}: Destroy ${clientKeys.length} rascal clients ...`);
            return await Promise.all(promises);
        } catch (ex) {
            logger.error(`!!! Dispose client error! - ${ex.message}`);
            return 0;
        }
    }
}


const _configKeys = ['exchanges', 'queues', 'bindings', 'publications', 'subscriptions'];
function _assembleClientConfig({vhost, connection, params}) {
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
    logger.debug(`${this.$name}: Init client with config - ${tools.inspect(this._config)}`);
    this.state = eClientState.Init;
    //
    const broker = await Broker.create(this._config);
    this.state = eClientState.Conn0;
    broker.on('error', err => {
        logger.error(`${this.$name}[${this.state}]: Broker error! - ${err.message}`);
        this.state = eClientState.Null;
        this.$parent.emit('client-end', this.$name, err);
    });
    // Parse publish keys
    if (this._config.publications !== undefined) {
        this._pubKeys = Object.keys(this._config.publications);
    }
    if (this._config.subscriptions !== undefined) {
        await _doSubscribe.call(this, broker, this._config.subscriptions);
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
            const sub = broker.subscribe(confKey);
            sub.on('message', (message, content, ackOrNack) => {
                logger.debug(`${this.$name}[${this.state}]: Content= ${tools.inspect(content)}`);
                let evt = {
                    msgId: message.properties.messageId,
                    primitive: message.fields.routingKey,
                    content: null
                };
                // Parsing content to JSON
                if (message.properties.contentType === 'text/plain') {
                    try {
                        evt.content = JSON.parse(content);
                    } catch (ex) {
                        logger.error(`${this.$name}[${this.state}]: Parsing content error! - Should be json - ${content}`);
                    }
                } else if (message.properties.contentType === 'application/json') {
                    evt.content = content
                } else {
                    logger.error(`${this.$name}[${this.state}]: Unrecognized contentType! Should be text/plain or application/json`);
                }
                // Processing message
                this.$ebus.emit('message', evt, ackOrNack);
            }).on('error', (err) => {
                logger.error(`${this.$name}[${this.state}]: Handle message error! - ${err.code}#${err.message}`);
            });
        } catch(err) {
            let msg = `${this.$name}[${this.state}]: Subscribe key=${confKey} error! - ${err.message}`;
            logger.error(msg);
            return next();
        }
    })
}

const _typeClientProps = {
    $id: 'string',
    $name: 'string',
    $parent: 'object',
    //
    options: 'object'
};


// The client class
class RascalClient extends CommonObject {
    constructor(props) {
        super(props);
        // Declaring member variables
        this.state = eClientState.Null;
        this.$parent = props.parent;
        this.$ebus = props.ebus;
        //
        this._config = _assembleClientConfig(props.options);
        this._broker = null;
        this._pubKeys = [];
    }
    async init() {
        try {
            await _initRascalClient.call(this);
            return this.state;
        } catch (ex) {
            logger.error(`[${this.$name}]: init error! - ${ex.message}`);
            return ex.message;
        }
    }
    // Implementing methods
    async dispose() {
        if (this._broker === null || this.state !== eClientState.Conn) {
            return `${this.$name}: closed.`;
        }
        this.state = eClientState.Closing;
        this._broker.shutdown(err => {
            if (err) {
                logger.error(`${this.$name}[${this.state}]: shutdown error! - ${err.message}`);
            } else {
                logger.info(`${this.$name}[${this.state}]: shutdown succeed.`);
                this.state = eClientState.Null;
            }
            return callback();
        });
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
        logger.debug(`${this.$name}[${this.state}]: Publish - ${pubKey}, ${tools.inspect(data)}, ${tools.inspect(options)}`);
        if (this.state !== eClientState.Conn) {
            throw new Error(`${this.$name}[${this.state}]: Please execute initializing before use.`);
        }
        if (!this._pubKeys.includes(pubKey)) {
            throw new Error(`${this.$name}[${this.state}]: Unrecognized publication - ${pubKey}!`);
        }
        const session = this._broker.publish(pubKey, data, options);
        session.on('error', err => {
            logger.error(`${this.$name}[${this.state}]: PubSession on [ERROR]! - ${err.message}`);
        });
        session.on('success', (msgId) => {
            logger.debug(`${this.$name}[${this.state}]: PubSession on [SUCCESS] - ${msgId}`);
        });
        session.on('return', (message) => {
            logger.debug(`${this.$name}[${this.state}]: PubSession on [RETURN] - ${tools.inspect(message)}`);
            //TODO: 
        });
        return await session();
    }
}


// Define module
module.exports = exports = {
    RascalManager
};