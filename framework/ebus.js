/**
 * Created by Eric on 2023/07/27
 */
// System libs
const assert = require('assert');
const async = require('async');
const fs = require('fs');
const path = require('path');
// Framework libs
const tools = require('../utils/tools');
const sysdefs = require('../include/sysdefs');
const _MODULE_NAME = sysdefs.eFrameworkModules.EBUS;
const { CommonObject, CommonModule } = require('../include/base');
const { eSysEvents, EventModule } = require('../include/events');
const eRetCodes = require('../include/retcodes');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const rascalWrapper = require('../libs/common/rascal.wrapper');

// Define the eventLogger instance
class EventLogger extends CommonObject {
    constructor(props) {
        super(props);
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
    persistent: false,
    disabledEvents: []
};

function _initProps(props) {
    Object.keys(_typeEventBusProps).forEach(key => {
        let propKey = `_${key}`;
        this[propKey] = props[key] !== undefined ? props[key] : _typeEventBusProps[key];
    });
    //
    this._eventLogger = global._$eventLogger;
}

function _residentSub(eventCodes, moduleName, callback) {
    eventCodes.forEach(code => {
        if (this._subscribers[code] === undefined) {
            this._subscribers[code] = [];
        }
        if (this._subscribers[code].indexOf(moduleName) === -1) {
            this._subscribers[code].push(moduleName);
        }
    });
    //
    return callback();
}

/**
 * 
 * @param {*} options 
 * @param {*} callback 
 * @returns 
 */
function _extMqSub(options, callback) {
    if (!options) {
        return callback({
            code: eRetCodes.MQ_ERR,
            message: 'Subscribe options not provided!'
        });
    }

}

function _residentPub(event, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    //
    let subscribers = this._subscribers[event.code];
    if (tools.isTypeOfArray(subscribers)) {
        subscribers.forEach(moduleName => {
            let registry = this._registries[moduleName];
            if (!registry || registry.status !== sysdefs.eStatus.ACTIVE) {
                logger.info(`Ignore non-active module! - ${moduleName}`);
                return;
            }
            try {
                registry.moduleRef.emit('message', event);
            } catch (ex) {
                logger.error(`Emit app-event error for module: ${moduleName} - ${tools.inspect(ex)}`);
            }
        });
    }
    return callback();
}

function _extMqPub(event, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    let sender = tools.safeGetJsonValue(options, 'headers.source');
    if (!sender) {
        return callback({

        })
    }
    return callback();
}

const _typeRegisterOptions = {
    engine: 'string',
    subEvents: 'Array<String>', // Conditional on engine = 'resident'
    mqConfig: 'Object{}' // Conditional engine != 'resident'
};

// Define the EventBus class
class EventBus extends CommonModule {
    constructor(props) {
        super(props);
        //
        _initProps.call(this, props);
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
        this.register2 = (moduleRef, options, callback) => {
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
            //
            let engineOpt = options.engine || this._engine;
            if (engineOpt === sysdefs.eEventBusEngine.RESIDENT) {
                let allEvents = Object.values(eSysEvents).concat(options.subEvents || []); // 
                return _residentSub.call(this, allEvents, moduleName, callback);
            }
            // Create rabbitmq-client
            if (this._clients[moduleName] === undefined) {
                this._clients[moduleName] = rascalWrapper.createClient({
                    $name: `rascal@${moduleName}`,
                    $parent: moduleRef,
                    config: options.mqConfig || {}
                });
            } 
            return callback();
        };

        this.register = (moduleName, instRef, callback) => {
            let err = null;
            if (this._registries[moduleName] === undefined) {
                this._registries[moduleName] = {
                    name: moduleName,
                    status: sysdefs.eStatus.ACTIVE,
                    instRef: instRef
                }
            } else {
                err = {
                    code: eRetCodes.CONFLICT,
                    message: 'ModuleName exists!'
                }
            }
            if (typeof callback === 'function') {
                return callback(err);
            }
            return err;
        };
        this.pause = (moduleName, callback) => {
            // TODO: Stop publish and consume events
        };
        this.resume = (moduleName) => {
            // TODO: Resume publish and consume events
        };
        /**
         * 
         * @param {Array<String>} eventCodes 
         * @param {String} moduleName 
         * @param {Object: {engine, spec}} options 
         * @param {Error, Result} callback 
         * @returns 
         */
        this.subscribe = (eventCodes, moduleName, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            let engineOpt = options.engine || this._engine;
            if (engineOpt === sysdefs.eEventBusEngine.RESIDENT) {
                return _residentSub.call(this, eventCodes, moduleName, callback);
            }
            return _extMqSub.call(this, moduleName, options.spec, callback);
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
                    return _residentPub.call(this, event, options, callback);
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