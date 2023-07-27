/**
 * Created by Eric on 2023/07/27
 */
// System libs
const assert = require('assert');
const async = require('async');
const fs = require('fs');
const path = require('path');
const os = require('os');
// Framework libs
const { objectInit, moduleInit, CommonModule, CommonObject } = require('../include/common');

const _defaultProps = {
    engine: 'RESIDENT',
    persistent: false,
    disabledEvents: []
};

function _initSelf(props) {
    Object.keys(_defaultProps).forEach(key => {
        let propKey = `_${key}`;
        this[propKey] = props[key] !== undefined? props[key] : _defaultProps[key];
    });
}

// Define the EventBus class
class EventBus extends CommonObject {
    constructor(props) {
        super(props);
        //
        _initSelf.call(this, props);
        //
        // Define member variables
        this._registries = {};
        this._subscribers = {};
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
        this.subscribe = (eventCodes, moduleName, callback) => {
            let err = null;
            eventCodes.forEach(code => {
                if (this._subscribers[code] === undefined) {
                    this._subscribers[code] = [];
                }
                if (this._subscribers[code].indexOf(moduleName) === -1) {
                    this._subscribers[code].push(moduleName);
                }
            });
            //
            if (typeof callback === 'function') {
                return callback(err);
            }
            return err;
        };
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
            return eventLogger.publish(event, options, () => {
                let err = null;
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
                } // Discard event if no subscribers
                //
                if (typeof callback === 'function') {
                    return callback(err);
                }
                return err;
            });
        }
    }
}

// Define module
module.exports = exports = {
    EventBus: EventBus
};