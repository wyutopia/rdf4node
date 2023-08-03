/**
 * Created by Eric on 2023/07/27
 */
// System libs
const assert = require('assert');
const async = require('async');
const path = require('path');
const EventEmitter = require('events');
// Framework libs
const tools = require('../utils/tools');
const sysdefs = require('../include/sysdefs');
const {eventBus: config} = require('../include/config');
const _MODULE_NAME = sysdefs.eFrameworkModules.EBUS;
const { initObject, initModule } = require('../include/base');
const { eSysEvents, EventModule } = require('../include/events');
const eRetCodes = require('../include/retcodes');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const rascalWrapper = require('../libs/common/rascal.wrapper');

// Define the eventLogger instance
class EventLogger extends EventEmitter {
    constructor(props) {
        super(props);
        initObject.call(this, props);
        // Implenting member methods
        this._execPersistent = (options, callback) => {
            return callback();
        };
        this.pub = (evt, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            let src = tools.safeGetJsonValue(evt, 'headers.source');
            if (process.env.NODE_ENV === 'production') {
                logger.info(`Publish event: ${evt.code} - ${src}`);
            } else {
                logger.debug(`Publish event: ${evt.code} - ${src} - ${tools.inspect(evt.body)}`);
            }
            return this._execPersistent({
                publisher: src,
                code: evt.code,
                headers: evt.headers,
                body: evt.body,
                options: options
            }, callback);
        };
        this.con = (evt, consumer, callback) => {
            let src = tools.safeGetJsonValue(evt, 'headers.source');
            logger.info(`Consume event: ${evt.code} - ${src} - ${consumer}`);
            return this._execPersistent({
                consumer: consumer,
                code: evt.code,
                headers: evt.headers,
                body: evt.body
            }, callback);
        };
    }
}
global._$eventLogger = new EventLogger({
    $name: sysdefs.eFrameworkModules.EVTLOGGER
});


const _typeEventBusProps = {
    engine: sysdefs.eCacheEngine.RESIDENT,
    lo: true,
    persistent: true,
    disabledEvents: [],
    rabbitmq: {}
};

function _initEventBusProps(props) {
    initModule.call(this, props);
    //
    Object.keys(_typeEventBusProps).forEach(key => {
        let propKey = `_${key}`;
        this[propKey] = props[key] !== undefined ? props[key] : _typeEventBusProps[key];
    });
    //
    this._eventLogger = global._$eventLogger;
}

function _consumeEvent(event, callback) {
    logger.debug(`${this.$name}: Perform consuming event: ${tools.inspect(event)}`);
    let subscribers = this._subscribers[event.code];
    if (tools.isTypeOfArray(subscribers)) {
        subscribers.forEach(moduleName => {
            let registry = this._registries[moduleName];
            if (!registry || registry.status !== sysdefs.eStatus.ACTIVE) {
                logger.info(`Ignore non-active module! - ${moduleName}`);
            } else {
                try {
                    registry.moduleRef.emit('message', event);
                } catch (ex) {
                    logger.error(`Emit app-event error for module: ${moduleName} - ${tools.inspect(ex)}`);
                }
            }
        });
    }
    return callback();
}

const _typeMqPubOptions = {
    pubKey: 'string',
    sender: 'string?'
};
/**
 * 
 * @param {*} event 
 * @param {_typeMqPubOptions} options 
 * @param {*} callback 
 * @returns 
 */
function _extMqPub(event, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (options.pubKey === undefined) {
        return callback({
            code: eRetCodes.MQ_PUB_ERR,
            message: 'Bad request! - options.pubKey is required.'
        });
    }
    let sender = options.sender || tools.safeGetJsonValue(event, 'headers.source');
    let client = this._clients[sender];
    if (!client) {
        return callback({
            code: eRetCodes.MQ_PUB_ERR,
            message: `Invalid client! - sender=${sender}`
        })
    }
    client.publish(options.pubKey, event, { routingKey: event.code }, callback);
}

const _typeRegisterOptions = {
    engine: 'string',
    subEvents: 'Array<String>', // Conditional on engine = 'resident'
    pubKey: 'string', // The default pubKey when engine = 'rabbitmq'
    channel: 'string',
    mqConfig: 'Object' // Conditional engine != 'resident'
};
const _DEFAULT_CHANNEL = 'default';

// Define the EventBus class
class EventBus extends EventEmitter {
    constructor(props) {
        super(props);
        //
        _initEventBusProps.call(this, Object.assign({}, props, config));
        //
        // For icp
        this._registries = {};
        this._subscribers = {};
        // For external MQ
        this._clients = {};
        // Implementing methods
        /**
         * 
         * @param {object} moduleRef 
         * @param {_typeRegisterOptions} options 
         * @param {*} callback 
         * @returns 
         */
        this.register = (moduleRef, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            //
            if (!(moduleRef instanceof EventModule)) {
                logger.error(`Error: should be EventModule!`);
                return callback();
            }
            let moduleName = moduleRef.$name;
            if (this._registries[moduleName] === undefined) {
                this._registries[moduleName] = {
                    name: moduleName,
                    status: sysdefs.eStatus.ACTIVE,
                    moduleRef: moduleRef
                }
            }
            // Update subscriptions
            let allEvents = Object.values(eSysEvents).concat(options.subEvents || []);
            allEvents.forEach(code => {
                if (this._subscribers[code] === undefined) {
                    this._subscribers[code] = [];
                }
                if (this._subscribers[code].indexOf(moduleName) === -1) {
                    this._subscribers[code].push(moduleName);
                }
            });
            let engineOpt = options.engine || this._engine;
            if (engineOpt === sysdefs.eEventBusEngine.RESIDENT) {
                return callback();
            }
            let engineConfig = config[engineOpt];
            // Create rabbitmq-client
            let channel = options.channel || _DEFAULT_CHANNEL;
            if (this._clients[channel] === undefined) {
                this._clients[channel] = rascalWrapper.createClient({
                    id: channel,
                    $parent: this,
                    $name: `rascal@${clientId}`,
                    config: {
                        vhost: engineConfig.vhost,
                        conn: engineConfig.connection,
                        params: engineConfig[channel]
                    }
                });
            }
            return callback(null, this._clients[channel]);
        };
        this.on('message', (evt, callback) => {
            return _consumeEvent.call(this, evt, callback);
        });
        this.on('client-end', clientId => {
            logger.error(`Client#${clientId} end.`);
        });

        this.pause = (moduleName, callback) => {
            // TODO: Stop publish and consume events
        };
        this.resume = (moduleName) => {
            // TODO: Resume publish and consume events
        };
        /**
         * 
         * @param {Object: {code, headers, body}} event 
         * @param {*} options 
         * @param {Error, Result} callback 
         * @returns 
         */
        this.publish = (event, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            //
            if (this._disabledEvents.indexOf(event.code) !== -1) {
                logger.debug(`Ignore event: ${event.code}`);
                return callback();
            }
            return this._eventLogger.pub(event, options, () => {
                //
                let engineOpt = options.engine || this._engine;
                if (engineOpt === sysdefs.eCacheEngine.RESIDENT) {
                    return _consumeEvent.call(this, event, callback);
                }
                return _extMqPub.call(this, event, options, callback);
            });
        }
    }
}

// Define module
module.exports = exports = {
    EventBus
};