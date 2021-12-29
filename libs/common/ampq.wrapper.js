/**
 * Created by eric 2021/11/10
 */
const assert = require('assert');
const EventEmitter = require('events');
const BrokerPro = require('rascal').BrokerAsPromised;
// Project scope
const pubdefs = require('../../include/sysdefs');
const theApp = require('../../bootstrap');
const tools = require('../../utils/tools');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf');

const MODULE_NAME = 'RMQ_MNG';
class RmqClientManager {
    constructor() {
        //
        this.name = MODULE_NAME;
        this.mandatory = true;
        this.state = pubdefs.eModuleState.ACTIVE;
        this._clients = {};
        // Implementing member methods
        this.regClient = (id, client) => {
            if (this._clients[id] !== undefined) {
                logger.error(`${this.name}: Rmq-client id conflict!`);
                return false;
            }
            this._clients[id] = client;
            return true;
        };
        this.dispose = (callback) => {
            logger.info(`${this.name}: Close all mq-clients...`);
            let keys = Object.keys(this._clients);
            Promise.all(keys.map((key) => {
                let client = this._clients[key];
                client.dispose();
            })).then((results) => {
                logger.info(`${this.name}: All mq-clients closed.`);
                callback(null, results);
            }).catch(callback);
        }
        //
        (() => {
            // Register graceful exit method
            theApp.regModule(this);
        })();
    }
}
const gRmqClientMan = new RmqClientManager();

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

/**
 * options = {parent(m), config = {vhost, conn, params}, id(o), alias(o), methods = {...}}
 * @param options
 * @constructor
 */
class RmqClient extends EventEmitter {
    constructor(options) {
        assert(options !== undefined);
        super(options);
        // Declaring member variables
        this._id = options.id || tools.uuidv4();
        this.alias = options.alias || this._id;
        this.broker = null;
        // Implementing methods
        this.dispose = async () => {
            try {
                logger.info(`${this.alias}: broker shutting down...`);
                return await this.broker.shutdown();
            } catch (err) {
                logger.debug(`${this.alias}: shutdown error! - ${err.message}`);
                return Promise.resolve(-1);
            }
        };
        this.publish = async (pubKey, data, options) => {
            logger.info(`${this.alias}: Publish - ${pubKey}, ${tools.inspect(data)}, ${tools.inspect(options)}`);
            if (this.broker === null) {
                logger.error(`${this.alias}: Please execute initializing before use.`);
                return null;  // Check if this is the proper way
            }
            if (this.pubKeys.indexOf(pubKey) === -1) {
                logger.error(`${this.alias}: Invalid publication configure! - key=${pubKey}`);
                return null;
            }
            let pub = await this.broker.publish(pubKey, data, options);
            pub.on('error', err => {
                logger.error(`${this.alias}: Publishing error! - ${err.message}`);
            });
            return pub;
        }
        // Implementing event handlers
        this.onMessage = (content = {}) => {
            logger.debug(`${this.alias}: Content = ${tools.inspect(content)}`);
        }

        //
        (async () => {
            try {
                let config = options.config;
                let realCfg = assembleTotalConfig(config);
                logger.info(`${this.alias}: New RmqClient= ${tools.inspect(config)}`);
                this.broker = await BrokerPro.create(realCfg);
                this.broker.on('error', (err) => {
                    logger.error(`${this.alias}: Create broker error! - ${err.message}`);
                });
                // Register client
                gRmqClientMan.regClient(this._id, this);
                let params = config.params;
                // Perform subscriptions
                let subscriptions = params.subscriptions;
                if (subscriptions !== undefined) {
                    let keys = Object.keys(subscriptions);
                    logger.info(`${this.alias}: Subscription keys= ${tools.inspect(keys)}`);
                    await Promise.all(keys.map(async (key) => {
                        try {
                            const sub = await this.broker.subscribe(key);
                            sub.on('message', (message, content, ackOrNack) => {
                                logger.debug(`${this.alias}: Content= ${tools.inspect(content)}`);
                                let msg = null;
                                try {
                                    msg = JSON.parse(typeof content === 'string' ? content : content.toString());
                                    
                                } catch (ex) {
                                    logger.error(`${this.alias}: Parsing content error! - ${ex.message}. Content= ${tools.inspect(content)}`);
                                }
                                if (msg) {
                                    this.onMessage(msg);
                                }
                                ackOrNack();
                            }).on('error', (err) => {
                                logger.error(`${this.alias}: Handle message error! - ${err.code}#${err.message}`);
                            });
                        } catch (err) {
                            logger.error(`${this.alias}: Subscribe ${key} failed. - ${err.message}`);
                        }
                    }));
                }
                let publications = params.publications;
                if (publications !== undefined) {
                    this.pubKeys = Object.keys(publications);
                }
            } catch (ex) {
                logger.error(`${this.alias}: ${ex.message}`);
            }
        })();
    }
}

exports.RmqClient = RmqClient;