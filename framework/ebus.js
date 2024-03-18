/**
 * Created by Eric on 2023/07/27
 */
// System libs
const assert = require('assert');
const async = require('async');
const path = require('path');
// Framework libs
const Types = require('../include/types');
const eRetCodes = require('../include/retcodes');
const sysdefs = require('../include/sysdefs');
const _MODULE_NAME = sysdefs.eFrameworkModules.EBUS;
const { initObject, initModule } = require('../include/base');
const { eSysEvents, EventObject, EventModule, _DEFAULT_CHANNEL_, _DEFAULT_PUBKEY_, _DEST_LOCAL_ } = require('../include/events');
const tools = require('../utils/tools');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);

const _defaultPubOptions = {
    engine: sysdefs.eEventBusEngine.Native,
    pubKey: _DEFAULT_PUBKEY_,
    channel: _DEFAULT_CHANNEL_,
    dest: _DEST_LOCAL_
};

// Define the eventLogger instance
class EventLogger extends EventObject {
    constructor(appCtx, props) {
        super(props);
        this._appCtx = appCtx;
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

const _typeEventBusProps = {
    lo: true,         // Indicate local-loop. default is true: all events consumed localy.
    persistent: true,
    disabledEvents: [],
    chainEvents: [],
    engine: sysdefs.eEventBusEngine.Native
};

function _parseChainEvents(conf) {
    const chainEvents = [];
    conf.forEach(item => {
        chainEvents.push({
            pattern: new RegExp(item.match),
            code: item.code,
            ignore: item.ignore || [],
            select: item.select || null
        })
    });
    return chainEvents;
}

function _initEventBus(props) {
    // Init module base
    initModule.call(this, props);
    // 
    Object.keys(_typeEventBusProps).forEach(key => {
        let propKey = `_${key}`;
        if (key === 'chainEvents') {
            this[propKey] = _parseChainEvents(props[key] || []);
        } else {
            this[propKey] = props[key] !== undefined ? props[key] : _typeEventBusProps[key];
        }
    });
}

/**
 * 
 * @param { Types.EventWrapper } rawEvent 
 * @param { Types.PublishOptions } options 
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

function _pubTriggerEvents(evt, options, callback) {
    if (!this._chainEvents || this._chainEvents.length === 0) {
        return callback();
    }
    async.eachLimit(this._chainEvents, 3, (chainEvent, next) => {
        if (chainEvent.ignore.indexOf(evt.code) !== -1) {
            return process.nextTick(next);
        }
        let result = chainEvent.pattern.exec(evt.code);
        if (!result) {
            return process.nextTick(next);
        }
        let event = {
            code: chainEvent.code,
            headers: evt.headers,
            body: chainEvent.select ? _parseChainEvents(evt.body, chainEvent.select) : evt.body
        }
        logger.debug(`Chained event: ${chainEvent.code} triggered for ${evt.code}`);
        return this.publish(event, evt.headers.triggerOptions || options, next);
    }, () => {
        return callback();
    });
}

/**
 * 
 * @param { Types.EventWrapper } event 
 * @param { Types.PublishOptions } options 
 * @param { function } callback 
 * @returns 
 */
function _extMqPub(event, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = _defaultPubOptions;
    }
    let engine = options.engine || sysdefs.eEventBusEngine.RabbitMQ;
    let channel = options.channel || _defaultPubOptions.channel;
    let pubKey = options.pubKey || _defaultPubOptions.pubKey;
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

/**
 * @typedef RegisterOptions
 * @prop { string[] } subEvents - The 
 * @prop { string } engine 
 * @prop { string } channel
 * @prop { string } pubKey
 */

// Define the EventBus class
class EventBus extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this.state = sysdefs.eModuleState.INIT;
        this.lastError = '';
        this._registries = {};
        this._subscribers = {};
        this._queues = {};
        // For external MQs, identified by channel
        this._clients = {};
        // Define event handler
        this.on('message', (evt, callback) => {
            return _consumeEvent.call(this, evt, callback);
        });
        this.on('client-end', clientId => {
            logger.error(`Client#${clientId} end.`);
        });
    }
    init(config, options) {
        if (this.state !== sysdefs.eModuleState.INIT) {
            logger.warn(`${this.$name}: Already initialized!`);
            return false;
        }
        _initEventBus.call(this, config);
        // Create eventLogger
        const fn = typeof options.fnEventLogger === 'function' ? options.fnEventLogger : EventLogger;
        this._eventLogger = new fn(this._appCtx, {
            $name: sysdefs.eFrameworkModules.EVTLOGGER
        });
        if (config.engine !== sysdefs.eEventBusEngine.RabbitMQ) {
            this.state = sysdefs.eModuleState.ACTIVE;
            return true;
        }
        // >>>  Create rabbitmq if necessary <<<
        try {
            const { RascalFactory } = require('../libs/common/rascal.wrapper');
            this._rascalFactory = new RascalFactory(this._appCtx, {
                $name: _MODULE_NAME,
                $type: sysdefs.eModuleType.CM,
                mandatory: true,
                state: sysdefs.eModuleState.ACTIVE
            });
            // Step 2: Create rascal client
            let mqConf = config[config.engine] || {};
            //
            let vhost = mqConf.vhost;
            let connection = mqConf.connection;
            Object.keys(mqConf.channels).forEach(chn => {
                let clientId = `${chn}@${config.engine}`;
                let clientOptions = {
                    vhost: vhost,
                    connection: connection,
                    params: mqConf.channels[chn]
                }
                this._clients[clientId] = this._rascalFactory.getClient(clientId, clientOptions);
            });
            logger.info(`${this.$name}: rabbitmq clients - ${tools.inspect(Object.keys(this._clients))}`);
            this.state = sysdefs.eModuleState.ACTIVE;
            return true;
        } catch (ex) {
            logger.error(`${this.$name}: Initialize rabbitmq(rascal lib) error! - ${ex.message}`);
            this.state = sysdefs.eModuleState.SUSPEND;
            this.lastError = ex.message;
            return false;
        }
    }

    // Implementing methods
    /**
     * 
     * @param {instanceof EventModule} moduleRef 
     * @param { RegisterOptions } options 
     * @returns 
     */
    register(moduleRef, options) {
        if (!(moduleRef instanceof EventModule)) {
            logger.error(`Error: should be EventModule!`);
            return null;
        }
        let moduleName = moduleRef.$name;
        //logger.debug(`${this.$name}: Register ${moduleName} with options - ${tools.inspect(options)}`);
        if (this._registries[moduleName] === undefined) {
            this._registries[moduleName] = {
                name: moduleName,
                status: sysdefs.eStatus.ACTIVE,
                moduleRef: moduleRef
            }
        }
        // Update subscriptions
        //let sumEvents = Object.values(eSysEvents).concat(options.subEvents || []);
        options.subEvents.forEach(code => {
            if (this._subscribers[code] === undefined) {
                this._subscribers[code] = [];
            }
            if (this._subscribers[code].indexOf(moduleName) === -1) {
                this._subscribers[code].push(moduleName);
            }
        });
        return null;
    }

    pause(moduleName, callback) {
        // TODO: Stop publish and consume events
    }

    resume(moduleName) {
        // TODO: Resume publish and consume events
    }
    /**
     * 
     * @param { Types.EventWrapper } event 
     * @param { Types.PublishOptions } options 
     * @param {Error, Result} callback 
     * @returns 
     */
    publish(event, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = _defaultPubOptions;
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
    /**
     * 
     * @param { Types.EventWrapper } event 
     * @param { Types.PublishOptions? } options 
     */
    async pubAsync(event, options) {
        if (options === undefined) {
            options = _defaultPubOptions;
        }
        logger.debug(`*** Publish event: ${tools.inspect(event)} - ${tools.inspect(options)}`);
        if (this._disabledEvents.includes(event.code)) {
            logger.warn(`****** Ignore disabled event: ${event.code}`);
            return true;
        }
        try {
            try {
                await this._eventLogger.onPub(event, options);
            } catch (err) {
                logger.error(`***! Log event error! - ${err.message}`);
            }
            let nextFn = (this._lo === true || options.dest === _DEST_LOCAL_)? _consumeAsync : _publishAsync;
            const original = await nextFn.call(this, event, options);
            const chain = await _triggerChainEvents.call(this, event, options);
            return { original, chain };
        } catch (ex) {
            logger.error(`***! Publish error: ${tools.inspect(event)} - ${ex.message}`);
            return false;
        }
    }
}

/**
 * 
 * @param { Types.EventWrapper } event 
 * @param { Types.PublishOptions } options 
 */
async function _consumeAsync(event, options) {
    let subscribers = this._subscribers[event.code] || [];
    if (!Array.isArray(subscribers) || subscribers.length === 0) {
        throw new Error('No subscribers!');
    }
    const results = {};
    subscribers.forEach(name => {
        let registry = this._registries[name];
        if (!registry || registry.status !== sysdefs.eStatus.ACTIVE) {
            results[name] = 'Invalid subscriber entry.';
        } else {
            try {
                registry.moduleRef.emit('message', event);
                results[name] = 'ok';
            } catch (ex) {
                results[name] = ex.message;
            }
        }
    })
    return results;
}

function _parseChainEventBody(originBody, select) {
    let body = {};
    select.split(' ').forEach(key => {
        if (originBody[key] !== undefined) {
            body[key] = originBody[key];
        }
    })
    return body;
}

async function _triggerChainEvents(originEvent, options) {
    if (!this._chainEvents || this._chainEvents.length === 0) {
        return 'noop';
    }
    const results = await async.eachLimit(this._chainEvents, 3, async (chainEvent) => {
        if (chainEvent.ignore.includes(originEvent.code)) {
            return 'ignored';
        }
        if (!chainEvent.pattern.test(originEvent.code)) {
            return 'NotMatch';
        }
        try {
            let event = {
                code: chainEvent.code,
                headers: originEvent.headers,
                body: chainEvent.select? _parseChainEventBody(originEvent.body, chainEvent.select) : originEvent.body
            }
            logger.debug();
            return await this.pubAsync(event, options);
        } catch(ex) {
            logger.error(`***! Publish chainEvent`)
        }
    })
    return results;
}

/**
 * 
 * @param { Types.EventWrapper } event 
 * @param { Types.PublishOptions } options 
 */
async function _publishAsync(event, options) {
    let engine = options.engine || sysdefs.eEventBusEngine.RabbitMQ;
    let channel = options.channel || _defaultPubOptions.channel;
    let pubKey = options.pubKey || _defaultPubOptions.pubKey;
    // Find client
    let clientId = `${channel}@${engine}`;
    let client = this._clients[clientId];
    if (!client) {
        throw new Error('Invalid client by id: ${clientId}');
    }
    // Set triggerOptions for publishing triggerEvents
    event.headers.triggerOptions = { engine, channel, pubKey };
    // Invoke publishing
    return await client.pubAsync(pubKey, event, { routingKey: event.code });
}

// Define module
module.exports = exports = {
    EventBus,
    EventLogger
};