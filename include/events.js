/**
 * Created by Eric on 2023/02/12
 */
// System libs
const assert = require('assert');
const async = require('async');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');
// Framework libs
const sysdefs = require('./sysdefs');
const _MODULE_NAME = sysdefs.eFrameworkModules.ICP
const {objectInit, moduleInit, CommonModule, CommonObject} = require('./common');
const eRetCodes = require('./retcodes');
const {
    sysConf, 
    winstonWrapper: {WinstonLogger}
} = require('../libs');
const icpConf = sysConf.icp || {};
const disabledEvents = icpConf.disabledEvents || [];
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');

const sysEvents = {
    // Module
    SYS_MODULE_CREATE              : '_module.create',
    SYS_MODULE_INIT                : '_module.init',
    SYS_MODULE_ACTIVE              : '_module.active',
    SYS_MODULE_HALT                : '_module.halt',
    SYS_MODULE_RESUME              : '_module.resume',
    SYS_MODULE_DESTORY             : '_module.destroy',
    // Admin
    SYS_ADMIN_CREATE               : '_admin.create',
    SYS_ADMIN_UPDATE               : '_admin.update',
    SYS_ADMIN_CHGPWD               : '_admin.chgpwd',
    SYS_ADMIN_SUSPEND              : '_admin.suspend',
    SYS_ADMIN_DELETE               : '_admin.delete',
    // License
    SYS_LIC_CREATE                 : '_lic.create',
    SYS_LIC_UPDATE                 : '_lic.update',
    SYS_LIC_DELETE                 : '_lic.delete',
    // Message
    MSG_CREATE                     : 'msg.create',
    MSG_UPDATE                     : 'msg.update',
    MSG_DELETE                     : 'msg.delete',
    MSG_READ                       : 'msg.read'
    // Append new events here ...
};

class EventLogger extends CommonObject {
    constructor(props) {
        super(props);
        //
        this._execPersistent = (persistentOptions, callback) => {
            return callback();
        };
        this._pub = (evt, options, callback) => {
            let src = tools.safeGetJsonValue(evt, 'headers.source');
            if (process.env.NODE_ENV === 'production') {
                logger.info(`Publish event: ${evt.code} - ${src}`);
            } else {
                logger.debug(`Publish event: ${evt.code} - ${src} - ${tools.inspect(evt.body)}`);
            }
            return this._execPersistent({
                publisher: src,
                code: evt.code,
                body: evt.body,
                options: options
            }, callback);
        };
        this.publish = this._pub;
        this._con = (evt, consumer, callback) => {
            let src = tools.safeGetJsonValue(evt, 'headers.source');
            logger.info(`Consume event: ${evt.code} - ${src} - ${consumer}`);
            return this._execPersistent({
                consumer: consumer,
                code: evt.code,
                body: evt.body
            }, callback);
        };
        this.consume = this._con;
    }
}
const eventLogger = new EventLogger({
    name: '_EventLogger_'
});

// The Class
class InterCommPlatform extends CommonModule {
    constructor(props) {
        super(props);
        // Declaring properties
        this.internal = props.internal !== undefined? props.internal : true;
        this.persistent = props.persistent !== undefined? props.persistent : false;
        // Declaring member variables
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
            if (disabledEvents.indexOf(event.code) !== -1) {
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
const icp = new InterCommPlatform({
    name: _MODULE_NAME,
    //
    internal: true,              // Using internal communication
    persistent: false            // No persistence
});

// Declaring the EventObject
class EventObject extends EventEmitter {
    constructor(props) {
        super(props);
        objectInit.call(this, props);
        // Additional properties go here ...
    }
}

// Declaring the EventModule
class EventModule extends EventObject {
    constructor(props) {
        super(props);
        moduleInit.call(this, props);
        this._eventHandlers = props.eventHandlers || {};
        //
        this.pubEvent = (event, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {
                    routingKey: event.code
                }
            }
            return icp.publish(event, callback);
        };
        this._msgProc = (msg, ackOrNack) => {
            if (typeof ackOrNack !== 'function') {
                ackOrNack = tools.noop;
            }
            let handler = this._eventHandlers[msg.code];
            if (handler === undefined) {
                return ackOrNack(false);
            }
            eventLogger.consume(msg, `${handler.name}@${this.$name}`, () => {
                return handler.call(this, msg, ackOrNack);
            });
        };
        this.on('message', (msg, ackOrNack) => {
            setTimeout(this._msgProc.bind(this, msg, ackOrNack), 5); // Reduce the interval to increase performnace
        });
        // Perform initiliazing codes...
        (() => {
            icp.register(this.$name, this);
            // Subscribe events
            let allEvents = Object.values(sysEvents).concat(Object.keys(this._eventHandlers));
            icp.subscribe(allEvents, this.$name);
        })();
    }
}

// Declaring module exports
module.exports = exports = {
    icp: icp,
    eventLogger: eventLogger,
    EventObject: EventObject,
    EventModule: EventModule,
    sysEvents: sysEvents
};
