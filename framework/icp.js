/**
 * Created by Eric on 2023/02/10
 */
const assert = require('assert');
const async = require('async');
const fs = require('fs');
const path = require('path');
const os = require('os');
// project libs
const _MODULE_NAME = require('../include/sysdefs').eFrameworkModules.ICP
const eRetCodes = require('../include/retcodes');
const {icp: icpConf} = require('./config');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../../utils/tools');

const {CommonModule} = require('./common');
const sysRegistry = require('./registry');

// The Class
class InterCommPlatform extends CommonModule {
    constructor(props) {
        super(props);
        // Declaring properties
        this.internal = props.internal !== undefined? props.internal : true;
        this.persistent = props.persistent !== undefined? props.persistent : false;
        // Declaring member variables
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
            if (tools.isTypeOfArray(subscribers)) {
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
            } // Discard event if no subscribers
            //
            if (typeof callback === 'function') {
                return callback(err);
            }
            return err;
        }
    }
} 
module.exports = exports = new InterCommPlatform({
    name: _MODULE_NAME,
    //
    internal: true,              // Using internal communication
    persistent: false            // No persistence
});