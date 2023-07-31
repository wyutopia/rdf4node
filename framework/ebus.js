/**
 * Created by Eric on 2023/07/27
 */
const _MODULE_NAME = "ebus";

// System libs
const assert = require('assert');
const async = require('async');
const fs = require('fs');
const path = require('path');
// Framework libs
const sysdefs = require('../include/sysdefs');
const {CommonObject, CommonModule} = require('../include/base');
const eRetCodes = require('../include/retcodes');

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

function _initSelf(props) {
    Object.keys(_typeEventBusProps).forEach(key => {
        let propKey = `_${key}`;
        this[propKey] = props[key] !== undefined? props[key] : _typeEventBusProps[key];
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

function _extMqSub(moduleName, options, callback) {
    if (!options) {
        return callback({
            code: eRetCodes.MQ_ERR,
            message: 'Subscribe options not provided!'
        });
    }

}

function _residentPub() {

}



// Define the EventBus class
class EventBus extends CommonModule {
    constructor(props) {
        super(props);
        //
        _initSelf.call(this, props);
        //
        // Define member variables
        this._registries = {};
        this._subscribers = {};
        this._mqClients = {};
        // Implementing methods
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
            if (engineOpt === sysdefs.eCacheEngine.RESIDENT) {
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
                let subscribers = this._subscribers[event.code];
                if (tools.isTypeOfArray(subscribers)) {
                    subscribers.forEach(moduleName => {
                        let registry = this._registries[moduleName];
                        if (!registry || registry.status !== sysdefs.eStatus.ACTIVE) {
                            logger.info(`Ignore non-active module! - ${moduleName}`);
                            return;
                        }
                        try {
                            registry.instRef.emit('message', event);
                        } catch (ex) {
                            logger.error(`Emit app-event error for module: ${moduleName} - ${tools.inspect(ex)}`);
                        }
                    });
                }
                return callback();
            });
        }
    }
}

// Define module
module.exports = exports = {
    EventBus
};