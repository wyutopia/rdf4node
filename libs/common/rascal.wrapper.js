/**
 * Created by Eric on 2022/01/02
 * To replace amqp.wrapper in the future
 */
// System libs
const async = require('async');
const assert = require('assert');
const { Broker } = require('rascal');
// Framework libs
const theApp = require('../../app');
const sysdefs = require('../../include/sysdefs');
const eClientState = sysdefs.eClientState;
const {EventModule} = require('../../include/events');
const tools = require('../../utils/tools');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf');

const _MODULE_NAME = 'AMQP_CONN';

class RascalClientMangager extends EventModule {
    constructor(props) {
        super(props);
        //
        this._clients = {};
        // Implementing member methods
        this.createClient = (options) => {
            options.parent = this;
            let client = new RascalClient(options);
            this._clients[client.id] = client;
            return client;
        }
        this.dispose = (callback) => {
            logger.info(`${this.$name}: Destroy all amqp clients ...`);
            let ids = Object.keys(this._clients);
            async.eachLimit(ids, 4, (id, next) => {
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
        this.on('end', (clientId, err) => {
            logger.info(`${this.$name}: On client [END] - ${clientId} - ${tools.inspect(err)}`);
            delete this._clients[clientId];
        });
        //         
        (() => {
            theApp.regModule(this);
        })();
    }
}

function assembleTotalConfig({ vhost, conn, params }) {
    assert(conn !== undefined);
    assert(params !== undefined);
    let conf = {
        connection: conn
    };
    ['exchanges', 'queues', 'bindings', 'publications', 'subscriptions'].forEach((key) => {
        if (params[key] !== undefined) {
            conf[key] = params[key];
        }
    });
    let vhosts = {};
    vhosts[vhost] = conf;
    return {
        vhosts: vhosts
    };
}

function onMessage(content = {}) {
    logger.debug(`${this.$name}: Content = ${tools.inspect(content)}`);
}

const _typeClientProps = {
    id: 'string',
    $name: 'string',
    $parent: 'object'
};

class RascalClient {
    constructor(props) {
        // Declaring member variables
        this.id = props.id || tools.uuidv4();
        this.$name = props.$name || `rascalClient#${this.id}`;
        this.$parent = props.$parent;
        //
        this.broker = null;
        this.state = eClientState.Null;
        this.pubKeys = [];
        //
        this.onMessageImpl = typeof props.onMessage === 'function'? props.onMessage : onMessage;
        this.onMessage = evt => {
            setImmediate(this.onMessageImpl.bind(this, evt));
        };

        // Implementing methods
        this.dispose = (callback) => {
            if (this.broker === null || this.state !== eClientState.Conn) {
                return process.nextTick(callback);
            }
            this.state = eClientState.Closing;
            this.broker.shutdown(err => {
                if (err) {
                    logger.error(`${this.$name}[${this.state}]: shutdown error! - ${err.message}`);
                } else {
                    logger.info(`${this.$name}[${this.state}]: shutdown succeed.`);
                    this.state = eClientState.Null;
                }
                return callback();
            });
        };
        // Perform publish
        this.publish = (pubKey, data, options, callback) => {
            logger.info(`${this.$name}[${this.state}]: Publish - ${pubKey}, ${tools.inspect(data)}, ${tools.inspect(options)}`);
            if (this.state !== eClientState.Conn) {
                let msg = `${this.$name}[${this.state}]: Please execute initializing before use.`
                logger.error(msg);
                return callback({
                    code: 6666,
                    message: msg
                });
            }
            if (this.pubKeys.indexOf(pubKey) === -1) {
                let msg = `${this.$name}[${this.state}]: Invalid publication configure! - key=${pubKey}`;
                logger.error(msg);
                return callback({
                    code: 6666,
                    message: msg
                });
            }
            this.broker.publish(pubKey, data, options, (err, pubSession) => {
                if (err) {
                    let msg = `${this.$name}[${this.state}]: Publish error! - ${err.message}`;
                    logger.error(msg);
                    return callback({
                        code: 6666,
                        messaeg: msg
                    });
                }
                pubSession.on('error', err => {
                    logger.error(`${this.$name}[${this.state}]: PubSession on [ERROR]! - ${err.message}`);
                });
                pubSession.on('success', (msgId) => {
                    logger.debug(`${this.$name}[${this.state}]: PubSession on [SUCCESS] - ${msgId}`);
                    return callback(null, pubSession);
                });
                pubSession.on('return', (message) => {
                    logger.debug(`${this.$name}[${this.state}]: PubSession on [RETURN] - ${tools.inspect(message)}`);
                    //TODO: 
                });
            });
        }
        // Implementing event handlers

        //
        (() => {
            let config = props.config;
            let realCfg = assembleTotalConfig(config);
            logger.info(`${this.$name}: Create new RacalClient with ${tools.inspect(realCfg)}`);
            this.state = eClientState.Init;
            let self = this;
            Broker.create(realCfg, (err, broker) => {
                if (err) {
                    logger.error(`${self.name}[${self.state}]: Create broker error! - ${err.message}`);
                    self.state = eClientState.Null;
                    return null;
                }
                broker.on('error', (err) => {
                    logger.error(`${self.name}[${self.state}]: Broker error! - ${err.message}`);
                    self.state = eClientState.Null;
                    self.broker = null;
                    self.parent.emit('end', err);
                });
                // Perform subscribe and store publication keys
                let params = config.params;
                async.parallel({
                    // Subscription
                    sub: (callback) => {
                        // Perform subscriptions
                        let subscriptions = params.subscriptions;
                        if (subscriptions === undefined) {
                            return process.nextTick(callback);
                        }
                        let keys = Object.keys(subscriptions);
                        logger.info(`${self.name}[${self.state}]: Subscription keys= ${tools.inspect(keys)}`);
                        async.each(keys, (key, next) => {
                            broker.subscribe(key, (err, sub) => {
                                if (err) {
                                    let msg = `${self.name}[${self.state}]: Subscribe key=${key} error! - ${err.message}`;
                                    logger.error(msg);
                                    return next();
                                }
                                sub.on('message', (message, content, ackOrNack) => {
                                    logger.debug(`${self.name}[${self.state}]: Content= ${tools.inspect(content)}`);
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
                                            logger.error(`${self.name}[${self.state}]: Parsing content error! - ${ex.message} - ${content}`);
                                        }
                                    } else if (message.properties.contentType === 'application/json') {
                                        evt.content = content
                                    } else {
                                        logger.error(`${self.name}[${self.state}]: Unrecognized contentType! Should be text/plain or application/json`);
                                    }
                                    // Handle message
                                    self.onMessage(evt);
                                    // if (evt) {
                                    //     if (evt.uuid && evt.msg) {
                                    //         if (evt.body === undefined) {
                                    //             evt.body = {};
                                    //         }
                                    //
                                    //     } else {
                                    //         logger.error(`${self.name}[${self.state}]: Bad message format! uuid or msg missing`)
                                    //     }
                                    // }
                                    ackOrNack();
                                }).on('error', (err) => {
                                    logger.error(`${self.name}[${self.state}]: Handle message error! - ${err.code}#${err.message}`);
                                });
                                return next();
                            });
                        }, () => {
                            return callback();
                        });
                    },
                    // Publication
                    pub: (callback) => {
                        let publications = params.publications;
                        if (publications !== undefined) {
                            self.pubKeys = Object.keys(publications);
                        }
                        return process.nextTick(callback);
                    }
                }, () => {
                    // Save broker and activate client
                    self.broker = broker;
                    self.state = eClientState.Conn;
                });
            });
        })();
    }
}

module.exports = exports = new RascalClientMangager({
    $name: _MODULE_NAME,
    mandatory: true,
    state: sysdefs.eModuleState.ACTIVE,
    type: sysdefs.eModuleType.CONN
});