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
const { eventBus: config } = require('./config');
const {initObject, initModule, CommonModule, CommonObject} = require('./base');
const {WinstonLogger} = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'events');
const tools = require('../utils/tools');

const _DEFAULT_CLIENT = 'project';
const _DEFAULT_PUB_KEY = 'pubPrjEvent';

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
        // Bind ebus
        this._ebus = global._$ebus !== undefined? global._$ebus : null;
        this._eventHandlers = props.eventHandlers || {};
        //
        this.pubEvent = (event, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {
                    routingKey: event.code
                }
            }
            //
            if (!this._ebus) {
                return callback({
                    code: eRetCodes.INTERNAL_SERVER_ERR,
                    message: 'Create EventBus before using!'
                })
            }
            return this._ebus.publish(event, callback);
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
                let options = {
                    engine: props.engine || sysdefs.eEventBusEngine.RESIDENT,
                    subEvents: Object.keys(this._eventHandlers),
                    clientName: props.clientName || _DEFAULT_CLIENT,
                    pubKey: props.pubKey || _DEFAULT_PUB_KEY
                };
                options.mqConfig = tools.safeGetJsonValue(config, `rabbitmq.${options.clientName}`);
                logger.debug(`${this.$name}: Register to EventBus with - ${tools.inspect(options)}`);
                this._ebus.register(this, options, tools.noop);
            }
        })();
    }
}

// Declaring module exports
module.exports = exports = {
    EventObject: EventObject,
    EventModule: EventModule,
    eSysEvents: sysEvents
};
