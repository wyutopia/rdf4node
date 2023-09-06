/**
 * Created by Eric on 2022/01/02
 * To replace amqp.wrapper in the future
 */
const _MODULE_NAME = 'AMQP_MNG';
// System libs
const async = require('async');
const assert = require('assert');
const { Broker } = require('rascal');
// Framework libs

const sysdefs = require('../../include/sysdefs');
const eRetCodes = require('../../include/retcodes');
const eClientState = sysdefs.eClientState;
const {CommonObject} = require('../../include/base');
const {EventModule} = require('../../include/events');
const tools = require('../../utils/tools');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf4node');
const theApp = global._$theApp;

class RascalClientMangager extends EventModule {
    constructor(props) {
        super(props);
        //
        this._clients = {};
        // Implementing member methods
        this.createClient = (options) => {
            options.$factory = this; // Add clientManager reference
            let client = new RascalClient(options);
            this._clients[client.id] = client;
            return client;
        }
        this.dispose = (callback) => {
            logger.info(`${this.$name}: Destroy all amqp clients ...`);
            async.eachLimit(Object.keys(this._clients), 3, (id, next) => {
                let client = this._clients[id];
                if (client === undefined) {
                    return process.nextTick(next);
                }
                return client.dispose(next);
            }, () => {
                logger.info(`${this.$name}: All amqp clients have been destroyed.`);
                return callback();
            });
        }
        // Implementing event handle
        this.on('client-end', (clientId, err) => {
            logger.info(`${this.$name}: On client [END] - ${clientId} - ${tools.inspect(err)}`);
            delete this._clients[clientId];
        });
        //         
        (() => {
            theApp.regModule(this);
        })();
    }
}

//const _configKeys = ['connection', 'exchanges', 'queues', 'bindings', 'publications', 'subscriptions'];
function _assembleClientConfig(vhost, params) {
    let vhosts = {};
    vhosts[vhost] = params;
    return {
        vhosts: vhosts
    };
}

/**
 * 
 * @param {string} vhost 
 * @param {connection, exchanges, queues, bindings, publications, subscriptions} params 
 */
function _initClient({vhost, params}) {
    assert(vhost !== undefined);
    assert(params !== undefined);
    let clientConf = _assembleClientConfig(vhost, params);
    logger.debug(`${this.$name}: Create new RacalClient with ${tools.inspect(clientConf)}`);
    this.state = eClientState.Init;
    //
    const self = this;
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
            self.$factory.emit('client-end', self.$id, err);
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
                            self.$parent.emit('message', evt, ackOrNack);
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
        ], () => {
            // Save broker and activate client
            this._broker = broker;
            this.state = eClientState.Conn;
            logger.debug(`${self.$name}[${self.state}]: broker created.`);
        });
    });
}

const _typeClientProps = {
    $id: 'string',
    $name: 'string',
    $parent: 'object',
    $factory: 'object',
    config: 'object'
};

// The client class
class RascalClient extends CommonObject {
    constructor(props) {
        super(props);
        // Declaring member variables
        this.$parent = props.$parent;
        this.$factory = props.$factory;
        //
        this.state = eClientState.Null;
        this._broker = null;
        this._pubKeys = [];
        // Implementing methods
        this.dispose = (callback) => {
            if (this._broker === null || this.state !== eClientState.Conn) {
                return process.nextTick(callback);
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
        };
        // Perform publishing
        this.publish = (pubKey, data, options, callback) => {
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
        // Implementing event handlers
        _initClient.call(this, props.config);
    }
}


// Define module
const rascalWrapper = new RascalClientMangager({
    $name: _MODULE_NAME,
    $type: sysdefs.eModuleType.CM,
    mandatory: true,
    state: sysdefs.eModuleState.ACTIVE
});
module.exports = exports = rascalWrapper;