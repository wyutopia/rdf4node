#!/usr/bin/env node
/**
 * Create by Eric on 2022/02/15
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
        this.
        this.hopCount = 0;
        //
        (() => {

        })();
    }
}
exports.IcpRequest = IcpRequest;

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

class InterCommPlatform extends CommonModule {
    constructor(options) {
        super(options);
        // Delcaring member variables here ...
        // Implementing member methods
        this.execute = (options, callback) => {
            options.hopCount = (options.hopCount || 0)++;
            if (options.hopCount > config.maxHopCount) {
                let msg = 'Exceed max hop count!'
                logger.error(`${this.name}: Request - ${tools.inspect(options)} - ${msg}`);
                return callback({
                    code: eRetCodes.METHOD_NOT_ALLOWED,
                    message: msg
                })
            }
            _invalidateParams.call(this, options, (err) => {
                if (err) {
                    return callback(err);
                }
                _getLocalHandler(options, (err, handler) => {
                    if (err) {
                        return callback(err);
                    }
                    if (handler) {
                        return handler(options, callback);
                    }
                    return _invokeRemote.call(options, callback);
                });
            });
        }
    }
} 