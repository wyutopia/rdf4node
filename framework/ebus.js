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
const _MODULE_NAME = sysdefs.eFrameworkModules.EBUS;
const {eventBus: config} = require('../include/config');
const { initObject, initModule } = require('../include/base');
const { eSysEvents, EventModule, _DEFAULT_CHANNEL_, _DEFAULT_PUBKEY_, _DEFAULT_DEST_ } = require('../include/events');
const eRetCodes = require('../include/retcodes');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
//
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
        this.publish = this.pub;
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
        this.consume = this.con;
    }
}
global._$eventLogger = new EventLogger({
    $name: sysdefs.eFrameworkModules.EVTLOGGER
});


const _typeEventBusProps = {
    lo: true,
    persistent: true,
    disabledEvents: [],
    triggers: null,
    rabbitmq: {},
    rocketmq: {},
    redis: {}
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

function _consumeEvent(rawEvent, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    logger.debug(`Perform consuming event: ${tools.inspect(rawEvent)} - ${tools.inspect(options)}`);
    let event = options.engine === sysdefs.eCacheEngine.RESIDENT? rawEvent : rawEvent.content;
    let subscribers = this._subscribers[event.code];
    if (tools.isTypeOfArray(subscribers)) {
        subscribers.forEach(moduleName => {
            let registry = this._registries[moduleName];
            if (!registry || registry.status !== sysdefs.eStatus.ACTIVE) {
                logger.info(`Ignore non-active module! - ${moduleName}`);
            } else {
                try {
                    logger.debug(`Emit message for ${registry.moduleRef.$name}`);
                    registry.moduleRef.emit('message', event);
                } catch (ex) {
                    logger.error(`Emit app-event error for module: ${moduleName} - ${tools.inspect(ex)}`);
                }
            }
        });
    }
    return _triggerEvents.call(this, event, options, callback);
}

const _typeTrigger = {
    pattern: 'regexp',
    code: 'string',
    bodyParser: '(event.body) => { return body;}'
};

function _triggerEvents (evt, options, callback) {
    if (!this._triggers || this._triggers.length === 0) {
        return callback();
    }
    async.eachLimit(this._triggers, 3, (trigger, next) => {
        let result = trigger.pattern.exec(evt.code);
        if (!result) {
            return process.nextTick(next);
        }
        let event = {
            code: trigger.code,
            headers: evt.headers,
            body: typeof trigger.bodyParser === 'function'? trigger.bodyParser(evt.body) : evt.body
        }
        logger.debug(`Chained event: ${trigger.code} triggered for ${evt.code}`);
        return this.publish(event, options, next);
    }, () => {
        return callback();
    });
}

const _typePubOptions = {
    // 
    engine: sysdefs.eEventBusEngine.Resident,
    channel: _DEFAULT_CHANNEL_,
    //
    dest: _DEFAULT_DEST_,
    pubKey: _DEFAULT_PUBKEY_,
};
/**
 * 
 * @param {*} event 
 * @param {_typePubOptions} options 
 * @param {*} callback 
 * @returns 
 */
function _extMqPub(event, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = _typePubOptions;
    }
    let pubKey = options.pubKey || _typePubOptions.pubKey;
    let channel = options.channel || _typePubOptions.channel;
    let client = this._clients[channel];
    if (!client) {
        return callback({
            code: eRetCodes.MQ_PUB_ERR,
            message: `Invalid client! - sender=${options.sender}`
        })
    }
    return client.publish(pubKey, event, { routingKey: event.code }, callback);
}

const _typeRegisterOptions = {
    subEvents: 'Array<String>', // Conditional on engine = 'resident'
    channel: 'string'
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
            logger.debug(`Register ${moduleName} with options - ${tools.inspect(options)}`);
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
            // TODO: Append eventTriggers
            let engine = options.engine || sysdefs.eEventBusEngine.Resident;
            if (engine === sysdefs.eEventBusEngine.Resident) {
                return callback();
            }
            let engineConf = config[engine];
            // Create rabbitmq-client
            let channel = options.channel || _DEFAULT_CHANNEL;
            let clientId = `${channel}@${engine}`;
            if (this._clients[clientId] === undefined) {
                this._clients[clientId] = rascalWrapper.createClient({
                    $id: clientId,
                    $parent: this,
                    // the client config
                    config: {
                        vhost: engineConf.vhost,
                        params: tools.deepAssign({}, engineConf.default, engineConf[channel] || {})
                    }
                });
            }
            return callback(null, this._clients[clientId]);
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
         * @param {_typePubOptions} options 
         * @param {Error, Result} callback 
         * @returns 
         */
        this.publish = (event, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = _typePubOptions;
            }
            logger.debug(`Publish event - ${tools.inspect(event)} - ${tools.inspect(options)}`)
            //
            if (this._disabledEvents.indexOf(event.code) !== -1) {
                logger.debug(`Ignore event: ${event.code}`);
                return callback();
            }
            return this._eventLogger.pub(event, options, () => {
                //
                if (options.dest === 'local' || options.channel === undefined || options.engine === sysdefs.eEventBusEngine.Resident) {
                    return _consumeEvent.call(this, event, options, callback);
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