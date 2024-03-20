/**
 * Created by Eric on 2023/02/12
 */
// System libs
const assert = require('assert');
const async = require('async');
const path = require('path');
const EventEmitter = require('events');
const util = require('util');
// Framework libs
const sysdefs = require('./sysdefs');
const config = require('./config');
const moduleConf = config.modules = {};
const eRetCodes = require('./retcodes');
const { initObject, initModule, CommonModule, CommonObject } = require('./base');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'events');
const tools = require('../utils/tools');

//
const _DEFAULT_CHANNEL_ = 'default';
const _DEFAULT_PUBKEY_ = 'pubApp';
const _DEST_LOCAL_ = 'local';

const eDomainEvent = {
    // System
    SYS_APP_START: 'app.start',
    SYS_APP_STOP: 'app.stop',
    // Module
    SYS_MODULE_CREATE: 'module.create',
    SYS_MODULE_INIT: 'module.init',
    SYS_MODULE_ACTIVE: 'module.active',
    SYS_MODULE_HALT: 'module.halt',
    SYS_MODULE_RESUME: 'module.resume',
    SYS_MODULE_DESTORY: 'module.destroy',
    // Admin
    SYS_ADMIN_CREATE: 'admin.create',
    SYS_ADMIN_UPDATE: 'admin.update',
    SYS_ADMIN_CHGPWD: 'admin.chgpwd',
    SYS_ADMIN_SUSPEND: 'admin.suspend',
    SYS_ADMIN_DELETE: 'admin.delete',
    // License
    SYS_LIC_CREATE: 'lic.create',
    SYS_LIC_UPDATE: 'lic.update',
    SYS_LIC_DELETE: 'lic.delete',
    // Message
    MSG_CREATE: 'msg.create',
    MSG_UPDATE: 'msg.update',
    MSG_DELETE: 'msg.delete',
    MSG_READ: 'msg.read'
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

const _baseEventOptions = {
    engine: sysdefs.eEventBusEngine.Native,
    channel: _DEFAULT_CHANNEL_,
    pubKey: _DEFAULT_PUBKEY_
}

function _triggerEvent(event, options, callback) {
    return callback();
}

// Declaring the EventModule
class EventModule extends EventObject {
    constructor(appCtx, props) {
        super(props);
        this._appCtx = appCtx;
        this._ebus = appCtx.ebus;
        initModule.call(this, props);
        // Save event properties
        this._eventHandlers = props.eventHandlers || {};
        this._eventOptions = Object.assign({}, _baseEventOptions, props.eventOptions || {});
        this.on('message', (msg) => {
            setTimeout(this.onMessage.bind(this, msg), 5);
        });
        // Register the module
        (() => {
            if (!props.managed) {
                let options = Object.assign({
                    subEvents: Object.keys(this._eventHandlers)
                }, this._eventOptions);
                appCtx.registerModule(this, options);
            }
        })();
    }
    /**
     * 
     * @param { Object } event 
     * @param { string } event.code - The event code
     * @param { Object } options 
     * @callback callback 
     * @returns 
     */
    pubEvent(event, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = this._eventOptions;
        }
        if (event.headers === undefined) {
            event.headers = {
                source: this.$name
            }
        }
        return this._ebus.publish(event, options, err => {
            if (err) {
                return callback(err);
            }
            return _triggerEvent.call(this, event, options, callback);
        });
    }
    async pubAsync(event, options) {
        if (options === undefined) {
            options = this._eventOptions;
        }
        if (event.headers === undefined) {
            event.headers = {
                source: this.$name
            }
        }
        return await this._ebus.pubAsync(event, options);
    }
    // The message process
    async onMessage(msg) {
        let handler = this._eventHandlers[msg.code];
        if (handler === undefined) {
            return false;
        }
        try {
            logger.debug(`>>> [${this.$name}]: Handle ${msg.code} event...`);
            const result = await handler.call(this, msg);
            return result;
        } catch (ex) {
            logger.error(`>>> [${this.$name}]: Handle ${msg.code} error! - ${ex.message}`);
            return false;
        }
    }
}

// Declaring module exports
module.exports = exports = {
    eDomainEvent, _DEFAULT_CHANNEL_, _DEFAULT_PUBKEY_, _DEST_LOCAL_,
    EventObject, EventModule,
};
