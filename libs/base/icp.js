#!/usr/bin/env node
/**
 * Created by Eric on 2022/02/15
 */
const assert = require('assert');
const async = require('async');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');
// project libs
const pubdefs = require('../../include/sysdefs');
const eRetCodes = require('../../include/retcodes');
const {CommonModule} = require('../../include/components');

const {icp: config} = require('./config');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE);
const tools = require('../../utils/tools');

const registry = require('./registry');

class IcpRequest extends CommonObject {
    constructor(options) {
        super(options);
        //
        this.host = options.host;
        this.sender = options.sender || {};
        this.hopCount = 0;
        //
        (() => {

        })();
    }
}
// exports.IcpRequest = IcpRequest;

function _invalidateParams(options, callback) {
    let ast = options !== undefined && options.host !== undefined && options.host.mid !== undefined;
    assert(ast);
    if (!ast) {
        return callback({
            code: eRetCodes.BAD_REQUEST,
            message: 'Missing host or host.mid!'
        });
    }
    return callback();
}

function _getLocalHandler(options, callback) {
    let m = registry.getMethod(options.host.mid, options.action);
}

function _invokeRemote(options, callback) {

}

function _setConfig (conf) {
    return {
        internal: conf.internal === undefined? false : conf.internal,
        persistent: conf.persistent === undefined? false : conf.persistent
    }
}

class InterCommPlatform extends CommonModule {
    constructor(props) {
        super(props);
        // Set configurations
        this._config = _setConfig(props.conf || {});
        // Declaring member variables
        this._registries = {};
        this._subscribers = {};        
        // Implementing methods
        this.register = (moduleName, instRef, callback) => {
            let err = null;
            if (this._registries[moduleName] === undefined) {
                this._registries[moduleName] = {
                    name: moduleName,
                    status: pubdefs.eStatus.ACTIVE,
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
            let err = null;
            //
            let subscribers = this._subscribers[event.code];
            subscribers.forEach(moduleName => {
                let registry = this._registries[moduleName];
                if (!registry || registry.status !== pubdefs.eStatus.ACTIVE) {
                    logger.info(`Ignore non-active module! - ${moduleName}`);
                    return;
                }
                try {
                    registry.instRef.emit('message', event);
                } catch (ex) {
                    logger.error(`Emit app-event error for module: ${moduleName} - ${tools.inspect(ex)}`);
                }
            });
            //
            if (typeof callback === 'function') {
                return callback(err);
            }
            return err;
        }
    }
} 
module.exports = exports = new InterCommPlatform({
    name: '_sysIcpSvc',
    conf: {
        internal: true,              // Using internal communication
        persistent: false            // No persistence
    }
});