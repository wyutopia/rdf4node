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
const { modules: moduleConf } = require('./config');
const eRetCodes = require('./retcodes');
const {initObject, initModule, CommonModule, CommonObject} = require('./base');
const {WinstonLogger} = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'events');
const tools = require('../utils/tools');

//
const _DEFAULT_CHANNEL_ = 'default';
const _DEFAULT_PUBKEY_ = 'pubEvents';
const _DEFAULT_DEST_ = 'local';

const eDomainEvent = {
    // System
    SYS_APP_START                  : 'app.start',
    SYS_APP_STOP                   : 'app.stop',
    // Module
    SYS_MODULE_CREATE              : 'module.create',
    SYS_MODULE_INIT                : 'module.init',
    SYS_MODULE_ACTIVE              : 'module.active',
    SYS_MODULE_HALT                : 'module.halt',
    SYS_MODULE_RESUME              : 'module.resume',
    SYS_MODULE_DESTORY             : 'module.destroy',
    // Admin
    SYS_ADMIN_CREATE               : 'admin.create',
    SYS_ADMIN_UPDATE               : 'admin.update',
    SYS_ADMIN_CHGPWD               : 'admin.chgpwd',
    SYS_ADMIN_SUSPEND              : 'admin.suspend',
    SYS_ADMIN_DELETE               : 'admin.delete',
    // License
    SYS_LIC_CREATE                 : 'lic.create',
    SYS_LIC_UPDATE                 : 'lic.update',
    SYS_LIC_DELETE                 : 'lic.delete',
    // Message
    MSG_CREATE                     : 'msg.create',
    MSG_UPDATE                     : 'msg.update',
    MSG_DELETE                     : 'msg.delete',
    MSG_READ                       : 'msg.read'
    // Append new events here ...
};

// Declaring the EventObject
class EventObject extends EventEmitter {
    constructor(props) {
        super(props);
        initObject.call(this, props);
        // Additional properties go here ...
    }
}

// Declaring the EventModule
class EventModule extends EventObject {
    constructor(appCtx, props) {
        super(props);
        this._appCtx = appCtx;
        initModule.call(this, props);
        // Save event properties
        this._eventHandlers = props.eventHandlers || {};
        // Set eventOptions
        let eventConf = moduleConf[props.$name] || {};
        this._eventOptions = {
            engine: eventConf.engine || props.engine || sysdefs.eEventBusEngine.Native,
            channel: eventConf.channel || props.channel || _DEFAULT_CHANNEL_,
            pubKey: eventConf.pubKey || props.pubKey || _DEFAULT_PUBKEY_
        };
        /**
         * 
         * @param { Object } event 
         * @param { string } event.code - The event code
         * @param { Object } options 
         * @callback callback 
         * @returns 
         */
        this.pubEvent = (event, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = this._eventOptions;
            }
            if (event.headers === undefined) {
                event.headers = {
                    source: this.$name
                }
            }
            return this._appCtx.ebus.publish(event, options, err => {
                if (err) {
                    return callback(err);
                }
                return this._triggerEvent(event, options, callback);
            });
        };
        this._triggerEvent = (event, options, callback) => {
            return callback();
        };
        this._msgProc = (msg, ackOrNack) => {
            if (typeof ackOrNack !== 'function') {
                ackOrNack = tools.noop;
            }
            let handler = this._eventHandlers[msg.code];
            if (handler === undefined) {
                return ackOrNack(false);
            }
            return handler.call(this, msg, ackOrNack);
            // eventLogger.consume(msg, `${handler.name}@${this.$name}`, () => {
            //     return handler.call(this, msg, ackOrNack);
            // });
        };
        this.on('message', (msg, ackOrNack) => {
            setTimeout(this._msgProc.bind(this, msg, ackOrNack), 1);
        });
        // Register the module
        (() => {
            if (!props.managed) {
                let options = Object.assign({
                    subEvents: Object.keys(this._eventHandlers)
                }, this._eventOptions);
                this._appCtx.registerModule(this, options);
            }
        })();
    }
}

// Declaring module exports
module.exports = exports = {
    eDomainEvent,  _DEFAULT_CHANNEL_, _DEFAULT_PUBKEY_, _DEFAULT_DEST_,
    EventObject, EventModule,
};
