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
const eRetCodes = require('./retcodes');
const {initObject, initModule, CommonModule, CommonObject} = require('./base');
const {WinstonLogger} = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'events');
const tools = require('../utils/tools');

//
const _DEFAULT_CHANNEL_ = 'default';
const _DEFAULT_PUBKEY_ = 'pubEvents';
const _DEFAULT_DEST_ = 'local';

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
    constructor(props) {
        super(props);
        initModule.call(this, props);
        // Save event properties
        this._eventHandlers = props.eventHandlers || {};
        this._triggers = props.triggers || {};
        // Auto wire ebus instance
        this._eventOptions = {
            engine: props.engine || sysdefs.eEventBusEngine.Resident,
            channel: props.channel || _DEFAULT_CHANNEL_,
            pubKey: props.pubKey || _DEFAULT_PUBKEY_
        }
        this._ebus = props.ebus || global._$ebus || null;
        //
        this.pubEvent = (event, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = this._eventOptions;
            }
            //
            if (!this._ebus) {
                return callback({
                    code: eRetCodes.INTERNAL_SERVER_ERR,
                    message: 'Initialize EventBus before using!'
                })
            }
            return this._ebus.publish(event, options, err => {
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
        // Perform initiliazing codes...
        (() => {
            if (this._ebus) {
                let options = Object.assign({
                    subEvents: Object.keys(this._eventHandlers)
                }, this._eventOptions);
                this._ebus.register(this, options, tools.noop);
            }
        })();
    }
}

// Declaring module exports
module.exports = exports = {
    EventObject: EventObject,
    EventModule: EventModule,
    eSysEvents: sysEvents,
    _DEFAULT_CHANNEL_, _DEFAULT_PUBKEY_, _DEFAULT_DEST_
};
