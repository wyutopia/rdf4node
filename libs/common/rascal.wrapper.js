/**
 * Created by Eric on 2022/01/02
 * To replace amqp.wrapper in the future
 */
const util = require('util');
const _MODULE_NAME = 'AMQP_MNG';
// System libs
const async = require('async');
const assert = require('assert');
const { Broker } = require('rascal');
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
        
    }
    // Implementing member methods
    /**
     * 
     * @param {string} name 
     * @param {vhost, connection, params} options 
     * @returns 
     */
    getClient(name, options) {
        if (this._clients[name] === undefined) {
            this._clients[name] = new RascalClient({
                $parent: this,
                $name: name,
                //
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
function _assembleClientConfig(vhost, connection, params) {
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
function _initClientEntity({ vhost, connection, params }) {
    assert(vhost !== undefined);
    assert(connection !== undefined);
    assert(params !== undefined);
    //
    const self = this;
    const clientConf = _assembleClientConfig(vhost, connection, params);
    logger.debug(`${this.$name}: Create new RacalClient with ${tools.inspect(clientConf)}`);
    self.state = eClientState.Init;
    //
    Broker.create(clientConf, function (err, broker) {
        if (err) {
            logger.error(`${self.$name}[${self.state}]: Creating broker error! - ${err.message}`);
            self.state = eClientState.Null;
            return null;
        }
        self.state = eClientState.Conn0;
        logger.info(`${self.$name}[${self.state}]: broker created.`);
        broker.on('error', function (err) {
            logger.error(`${self.$name}[${self.state}]: Broker error! - ${err.message}`);
            self.state = eClientState.Null;
            self.$parent.emit('client-end', self.$name, err);
        });
        // Perform subscribe and store publication keys
        async.parallel([
            // Perform subscription
            function (callback) {
                // Perform subscriptions
                if (params.subscriptions === undefined) {
                    return process.nextTick(callback);
                }
                let keys = Object.keys(params.subscriptions);
                logger.info(`${self.$name}[${self.state}]: Subscription keys= ${tools.inspect(keys)}`);
                async.each(keys, (key, next) => {
                    broker.subscribe(key, (err, sub) => {
                        if (err) {
                            let msg = `${self.$name}[${self.state}]: Subscribe key=${key} error! - ${err.message}`;
                            logger.error(msg);
                            return next();
                        }
                        sub.on('message', (message, content, ackOrNack) => {
                            logger.debug(`${self.$name}[${self.state}]: Content= ${tools.inspect(content)}`);
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
                                    logger.error(`${self.$name}[${self.state}]: Parsing content error! - Should be json - ${content}`);
                                }
                            } else if (message.properties.contentType === 'application/json') {
                                evt.content = content
                            } else {
                                logger.error(`${self.$name}[${self.state}]: Unrecognized contentType! Should be text/plain or application/json`);
                            }
                            // Processing message
                            global._$ebus.emit('message', evt, ackOrNack);
                        }).on('error', (err) => {
                            logger.error(`${self.$name}[${self.state}]: Handle message error! - ${err.code}#${err.message}`);
                        });
                        return next();
                    });
                }, () => {
                    return callback();
                });
            },
            // Register publications keys
            function (callback) {
                if (params.publications !== undefined) {
                    self._pubKeys = Object.keys(params.publications);
                }
                return process.nextTick(callback);
            }
        ], function () {
            // Save broker and activate client
            self._broker = broker;
            self.state = eClientState.Conn;
            logger.debug(`${self.$name}[${self.state}]: broker created.`);
        });
    });
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
        _initClientEntity.call(this, props.options);
        // Declaring member variables
        this.$parent = props.$parent;
        this.$name = props.$name;
        //
        this.state = eClientState.Null;
        this._broker = null;
        this._pubKeys = [];
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
}


// Define module
module.exports = exports = {
    RascalManager
};