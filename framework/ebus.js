/**
 * Created by Eric on 2023/07/27
 */
// System libs
const assert = require('assert');
const async = require('async');
const path = require('path');
// Framework libs
const tools = require('../utils/tools');
const sysdefs = require('../include/sysdefs');
const _MODULE_NAME = sysdefs.eFrameworkModules.EBUS;
const { initObject, initModule } = require('../include/base');
const { eSysEvents, EventObject, EventModule, _DEFAULT_CHANNEL_, _DEFAULT_PUBKEY_, _DEFAULT_DEST_ } = require('../include/events');
const eRetCodes = require('../include/retcodes');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
//
const { RascalFactory } = require('../libs/common/rascal.wrapper');

/**
 * The event headers
 * @typedef { Object } EventHeaders
 * @property { string } dsName
 */

/**
 * The event object
 * @typedef { Object } Event
 * @property { string } code - The event code
 * @property { EventHeaders } headers - The header options
 * @property { Object } body - The event body
 */

// Define the eventLogger instance
class EventLogger extends EventObject {
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
            // if (process.env.NODE_ENV === 'production') {
            //     logger.info(`Publish event: ${evt.code} - ${src}`);
            // } else {
            //     logger.debug(`Publish event: ${evt.code} - ${src} - ${tools.inspect(evt.body)} - ${tools.inspect(options)}`);
            // }
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
            logger.debug(`Consume event: ${evt.code} - ${src} - ${consumer}`);
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
    lo: true,         // Indicate local-loop. default is true: all events consumed localy.
    persistent: true,
    disabledEvents: [],
    triggerEvents: [],
    engine: sysdefs.eEventBusEngine.Native
};

function _parseTriggerEvents(triggersConf) {
    const triggerEvents = [];
    triggersConf.forEach(item => {
        triggerEvents.push({
            pattern: new RegExp(item.match),
            code: item.code,
            ignore: item.ignore || [],
            select: item.select || null
        })
    });
    return triggerEvents;
}

function _initEventBus(props) {
    // Init module base
    initModule.call(this, props);
    // 
    Object.keys(_typeEventBusProps).forEach(key => {
        let propKey = `_${key}`;
        if (key === 'triggerEvents') {
            this[propKey] = _parseTriggerEvents(props[key]);
        } else {
            this[propKey] = props[key] !== undefined ? props[key] : _typeEventBusProps[key];
        }
    });
    //
    this._eventLogger = global._$eventLogger;
}

/**
 * 
 * @param { Event } rawEvent 
 * @param { Object } options 
 * @param { string } options.engine
 * @param { * } callback 
 */
function _consumeEvent(rawEvent, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    logger.debug(`Perform consuming event: ${tools.inspect(rawEvent)} - ${tools.inspect(options)}`);
    let event = (this._lo === true || options.engine === sysdefs.eCacheEngine.Native) ? rawEvent : rawEvent.content;
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
    setTimeout(_pubTriggerEvents.bind(this, event, options, callback), 5);
}

/**
 * @typedef { Object} TriggerEvent - The TriggerEvent Class
 * @property { String } pattern - The RegExp pattern for matching original event code
 * @property { String } code - The new event code
 * @property { String[] } ignore - The ignored original event code list
 * @property { String } select - The selected values from original event body, 
 */
const _typeTriggerEvent = {
    pattern: 'regexp',
    code: 'string',
    ignore: 'string',
    select: 'string'
};

function _parseTriggerEventBody(origBody, select) {
    let body = {};
    select.split(' ').forEach(key => {
        if (origBody[key] !== undefined) {
            body[key] = origBody[key];
        }
    })
    return body;
}

function _pubTriggerEvents(evt, options, callback) {
    if (!this._triggerEvents || this._triggerEvents.length === 0) {
        return callback();
    }
    async.eachLimit(this._triggerEvents, 3, (triggerEvent, next) => {
        if (triggerEvent.ignore.indexOf(evt.code) !== -1) {
            return process.nextTick(next);
        }
        let result = triggerEvent.pattern.exec(evt.code);
        if (!result) {
            return process.nextTick(next);
        }
        let event = {
            code: triggerEvent.code,
            headers: evt.headers,
            body: triggerEvent.select ? _parseTriggerEventBody(evt.body, triggerEvent.select) : evt.body
        }
        logger.debug(`Chained event: ${triggerEvent.code} triggered for ${evt.code}`);
        return this.publish(event, evt.headers.triggerOptions || options, next);
    }, () => {
        return callback();
    });
}

const _typePubOptions = {
    // 
    engine: sysdefs.eEventBusEngine.Native,
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
    let engine = options.engine || sysdefs.eEventBusEngine.RabbitMQ;
    let channel = options.channel || _typePubOptions.channel;
    let pubKey = options.pubKey || _typePubOptions.pubKey;
    // Find client
    let clientId = `${channel}@${engine}`;
    let client = this._clients[clientId];
    if (!client) {
        return callback({
            code: eRetCodes.MQ_PUB_ERR,
            message: `Invalid client! - id=${clientId}`
        })
    }
    // Set triggerOptions for publishing triggerEvents
    event.headers.triggerOptions = { engine, channel, pubKey };
    // Invoke publishing
    return client.publish(pubKey, event, { routingKey: event.code }, callback);
}

const _typeRegisterOptions = {
    subEvents: 'Array<String>', // Conditional on engine = 'native'
    // For message queue
    engine: 'native',
    channel: 'default',
    pubKey: 'pubEvent'
};

// Define the EventBus class
class EventBus extends EventModule {
    constructor(appCtx, props) {
        super(props);
        //
        this._appCtx = appCtx;
        _initEventBus.call(this, props);
        //
        this._registries = {};
        this._subscribers = {};
        // For external MQ
        this._clients = {};
        // Define event handler
        this.on('message', (evt, callback) => {
            return _consumeEvent.call(this, evt, callback);
        });
        this.on('client-end', clientId => {
            logger.error(`Client#${clientId} end.`);
        });
    }
    init () {
        this._rascalFactory = new RascalFactory(this._appCtx, {
            $name: _MODULE_NAME,
            $type: sysdefs.eModuleType.CM,
            mandatory: true,
            state: sysdefs.eModuleState.ACTIVE
        });
    }
    // Implementing methods
    /**
     * 
     * @param {instanceof EventModule} moduleRef 
     * @param {_typeRegisterOptions} options 
     * @returns 
     */
    register(moduleRef, options) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        //
        if (!(moduleRef instanceof EventModule)) {
            logger.error(`Error: should be EventModule!`);
            return null;
        }
        let moduleName = moduleRef.$name;
        //logger.debug(`Register ${moduleName} with options - ${tools.inspect(options)}`);
        if (this._registries[moduleName] === undefined) {
            this._registries[moduleName] = {
                name: moduleName,
                status: sysdefs.eStatus.ACTIVE,
                moduleRef: moduleRef
            }
        }
        // Update subscriptions
        let sumEvents = Object.values(eSysEvents).concat(options.subEvents || []);
        sumEvents.forEach(code => {
            if (this._subscribers[code] === undefined) {
                this._subscribers[code] = [];
            }
            if (this._subscribers[code].indexOf(moduleName) === -1) {
                this._subscribers[code].push(moduleName);
            }
        });
        // TODO: Append eventTriggers
        // let engine = options.engine || sysdefs.eEventBusEngine.Native;
        // if (engine === sysdefs.eEventBusEngine.Native) {
        //     return null;
        // }
        // // Create mq client
        // let engineConf = config[engine];  // {vhost, connection, ...channelParameters}
        // // Create rabbitmq-client
        // let channel = options.channel || _DEFAULT_CHANNEL_;
        // let clientId = `${channel}@${engine}`;
        // if (this._clients[clientId] === undefined) {
        //     // getClient(name, options: {vhost, connection, params})
        //     this._clients[clientId] = rascalWrapper.getClient(clientId, {
        //         vhost: engineConf.vhost,
        //         connection: engineConf.connection,
        //         params: tools.deepAssign({}, engineConf.base, engineConf[channel] || {})
        //     });
        // }
        return null;
    };

    pause (moduleName, callback) {
        // TODO: Stop publish and consume events
    };

    resume (moduleName) {
        // TODO: Resume publish and consume events
    };
    /**
     * 
     * @param {Object: {code, headers, body}} event 
     * @param {_typePubOptions} options 
     * @param {Error, Result} callback 
     * @returns 
     */
    publish(event, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = _typePubOptions;
        }
        logger.debug(`Publish event - ${tools.inspect(event)} - ${tools.inspect(options)}`)
        //
        if (this._disabledEvents.indexOf(event.code) !== -1) {
            logger.debug(`Ignore disabled event: ${event.code}`);
            return callback();
        }
        return this._eventLogger.pub(event, options, () => {
            //
            if (this._lo === true || options.engine === sysdefs.eEventBusEngine.Native) {
                return process.nextTick(_consumeEvent.bind(this, event, options, callback));
            }
            return _extMqPub.call(this, event, options, callback);
        });
    }
    // Initializing the rabbitmq clients channels
    init(config) {
        if (config.engine !== sysdefs.eEventBusEngine.RabbitMQ) {
            return null;
        }
        let mqConf = config[config.engine] || {};
        //
        let vhost = mqConf.vhost;
        let connection = mqConf.connection;
        Object.keys(mqConf.channels).forEach(chn => {
            let clientId = `${chn}@${config.engine}`;
            let options = {
                vhost: vhost,
                connection: connection,
                params: mqConf.channels[chn]
            }
            this._clients[clientId] = rascalWrapper.getClient(clientId, options);
        });
        logger.info(`${this.$name}: rabbitmq clients - ${tools.inspect(Object.keys(this._clients))}`);
    }
}

// Define module
module.exports = exports = {
    EventBus,
    EventLogger
};