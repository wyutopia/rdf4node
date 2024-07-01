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
const { eSysEvents, EventObject, EventModule, _DEFAULT_ROUTINGKEY_, _DEFAULT_PUBKEY_, _DEST_LOCAL_ } = require('../include/events');
const tools = require('../utils/tools');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);

const _defaultPubOptions = {
    pubKey: _DEFAULT_PUBKEY_,
    routingKey: _DEFAULT_ROUTINGKEY_,
    dest: _DEST_LOCAL_
};

// Define the eventLogger instance
class EventLogger extends EventObject {
    constructor(appCtx, props) {
        super(props);
        this._appCtx = appCtx;
        initObject.call(this, props);
        // Implenting member methods
        this._persistentAsync = async (options) => {
            return true;
        }
    }
    // Followings are async methods
    async onPublish(evt, options) {
        return await this._persistentAsync({
            publisher: tools.safeGetJsonValue(evt, 'headers.source') || 'Unknown',
            //
            code: evt.code,
            headers: evt.headers,
            body: evt.body,
            options: options
        })
    }
    async onConsume(evt, consumer) {
        return await this._persistentAsync({
            consumer: consumer,
            code: evt.code,
            headers: evt.headers,
            body: evt.body
        })
    }
}

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

const _typeEventBusProps = {
    lo: true,         // Indicate local-loop. default is true: all events consumed localy.
    persistent: true,
    disabledEvents: [],
    chainEvents: [],
    engine: sysdefs.eEventBusEngine.Native,
    channel: 'app.default'
};

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
            body: chainEvent.select ? _buildChainEventBody(evt.body, chainEvent.select) : evt.body
        }
        logger.debug(`Chained event: ${chainEvent.code} triggered for ${evt.code}`);
        return this.publish(event, evt.headers.triggerOptions || options, next);
    }, () => {
        return callback();
    });
}

const _typeRegisterOptions = {
    subEvents: 'Array<String>', // Conditional on engine = 'native'
    // For message queue
    engine: 'native',
    channel: 'default',
    pubKey: 'pubEvent'
};


function _parseEvent(message, content) {
    let event = null;
    // Parsing content to JSON
    if (message.properties.contentType === 'text/plain') {
        event = JSON.parse(content);
    } else if (message.properties.contentType === 'application/json') {
        event = content
    } else {
        throw new Error('Unrecognized contentType! Should be text/plain or application/json.');
    }
    return event;
}

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
        // For external MQs, identified by channel
        this._mqClient = null;
        // Define event handler
        this.on('client-end', clientId => {
            logger.error(`Client#${clientId} end.`);
        });
    }
    async init(config) {
        if (this.state !== sysdefs.eModuleState.INIT) {
            logger.warn(`>>> Already initialized!`);
            return false;
        }
        _initEventBus.call(this, config);
        if (this._engine !== sysdefs.eEventBusEngine.RabbitMQ) { // Using native engine
            this._engine === sysdefs.eEventBusEngine.Native; // Set to native!!!
            this.state = sysdefs.eModuleState.ACTIVE;
            return true;
        }
        // Create rabbitmq client if configed <<<
        try {
            let clientOptions = Object.assign({
                event: 'rmq-msg'
            }, config.options);
            this._mqClient = await this._appCtx.rascalFactory.getClient(clientOptions);
            this._mqClient.on('rmq-msg', async (message, content) => {
                try {
                    let evt = _parseEvent(message, content);
                    const results = await _consumeAsync.call(this, evt);
                    logger.debug(`>>> Handle ${evt.code} results - ${tools.inspect(results)}`);
                } catch(ex) {
                    logger.error(`*** Handle ${evt.code} error! - ${ex.message}`);
                }
            })
            logger.info(`>>> rabbitmq client: ${config.channel} created.`);
            return true;
        } catch (ex) {
            logger.error(`*** Initialize rabbitmq(rascal lib) error! - ${ex.message}`);
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
     * @param { Types.PublishOptions? } options 
     */
    async pubAsync(event, options) {
        let pubOpt = Object.assign({}, _defaultPubOptions, options || {});
        logger.debug(`*** Publish event: ${tools.inspect(event)} - ${tools.inspect(pubOpt)}`);
        if (this._disabledEvents.includes(event.code)) {
            logger.warn(`****** Ignore disabled event: ${event.code}`);
            return true;
        }
        if (this._persistent && this._eventLogger) {
            try {
                await this._eventLogger.onPublish(event, pubOpt);
            } catch (err) {
                logger.error(`***! Persistent publish event error! - ${err.message}`);
            }
        }
        try {
            let nextFn = (this._lo === true || this._engine === sysdefs.eEventBusEngine.Native || pubOpt.dest === _DEST_LOCAL_) ? _consumeAsync : _publishAsync;
            const original = await nextFn.call(this, event, pubOpt);
            const chain = await _triggerChainEvents.call(this, event, pubOpt);
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
 * * @param { Types.PublishOptions? } options 
 */
async function _consumeAsync(event, options) {
    let subscribers = this._subscribers[event.code] || [];
    if (!Array.isArray(subscribers) || subscribers.length === 0) {
        logger.warn(`### No consumers.`);
        return -1;
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

/**
 * 
 * @param { Object } originBody 
 * @param { string } select - The key list string. ex: 'key1 key2'
 * @returns 
 */
function _buildChainEventBody(originBody, select) {
    let body = {};
    select.split(' ').forEach(key => {
        if (originBody[key] !== undefined) {
            body[key] = originBody[key];
        }
    })
    return body;
}

/**
 * 
 * @param { Types.EventWrapper } originEvent 
 * @param { Types.PublishOptions } options 
 * @returns 
 */
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
                body: chainEvent.select ? _buildChainEventBody(originEvent.body, chainEvent.select) : originEvent.body
            }
            return await this.pubAsync(event, options);
        } catch (ex) {
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
    let pubKey = options.pubKey || _defaultPubOptions.pubKey;
    // Check client
    if (!this._mqClient) {
        throw new Error(`*** Invalid mqClient!`);
    }
    // Set triggerOptions for publishing triggerEvents
    //event.headers.triggerOptions = { engine, channel, pubKey };
    // Invoke publishing
    return await this._mqClient.pubAsync(pubKey, event, { routingKey: options.routingKey || event.code });
}

// Define module
module.exports = exports = {
    EventBus,
    EventLogger
};