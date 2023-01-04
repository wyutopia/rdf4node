/**
 * Created by Eric on 2021/09/09
 */
const assert = require('assert');
const crypto = require('crypto');
const ObjectId = require('mongoose').Types.ObjectId;
const request = require('request');
const spawn = require('child_process').spawn;
const util = require("util");
const { networkInterfaces } = require("os");
const { v4: uuidv4 } = require('uuid');

const pubdefs = require('../include/sysdefs');
const eRetCodes = require('../include/retcodes.js');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'tools');

function _inspect(obj) {
    return util.inspect(obj, { showHidden: false, depth: null });
}
exports.inspect = _inspect;

exports.execCli = function (program, args, options, callback) {
    assert(program !== undefined);
    assert(args !== undefined);
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    //
    logger.info('Execute command:', program, args, options);
    let info = [];
    let error = [];
    let proc = spawn(program, args);
    proc.on('error', (err) => {
        logger.error(`Execute command error! - ${err.message}`);
        error.push(err.toString());
    });
    proc.stdout.on('data', (data) => {
        logger.info(`stdout: ${tools.inspect(data)}`);
        if (data) {
            info.push(data.toString());
        }
    });
    proc.stderr.on('data', (data) => {
        logger.error(`stderr: ${tools.inspect(data)}`);
        info.push(data.toString());
    });
    proc.on('close', (code, signal) => {
        logger.info('Process exit.', code, signal, _inspect(error), _inspect(info));
        if (code === 0) {
            return callback(null, info.join('-'));
        }
        let msg = [].concat(error, info);
        return callback({
            code: code,
            message: `Execute error or abort! ${msg.join('-')}`
        });
    });
}

function _isTypeOfArray(obj) {
    return '[object Array]' === Object.prototype.toString.call(obj);
}
exports.isTypeOfArray = _isTypeOfArray;

exports.isTypeOfDate = function (obj) {
    return '[object Date]' === Object.prototype.toString.call(obj);
};

exports.uuidv4 = function () {
    return uuidv4().replace(/-/g, '');
};

exports.safeGetJsonValue = function (json, path) {
    if (typeof json !== 'object' || typeof path !== 'string') {
        return null;
    }
    if (path.length === 0) {
        return json;
    }
    let keys = path.split('.');
    let data = json;
    let i = 0;
    while (data !== undefined && i < keys.length) {
        data = data[keys[i++]];
    }
    return data;
};

exports.getValueByPath = function (json, path) {
    if (typeof json !== 'object') {
        return null;
    }
    let keys = Object.keys(json);
    if (keys.indexOf(path) === -1) {
        return null;
    }
    let paths = path.split('.');
    let val = json;
    let i = 0;
    while (val !== undefined && i < paths.length) {
        val = val[paths[i++]];
    }
    return val;
};

exports.packUri = function (url, data) {
    let uri = url;
    if (data) {
        let params = [];
        let keys = Object.keys(data);
        keys.forEach(function (key) {
            params.push(key + '=' + data[key]);
        });
        uri += '?' + params.join('&');
    }
    return uri;
};


function _specialUrlEncode(origStr) {
    return encodeURIComponent(origStr)
        .replace('+', '%20')
        .replace('*', '%2A')
        .replace('%7E', '~');
}
exports.specialUrlEncode = _specialUrlEncode;

function _getSortedString(args, caseSense = true, urlEncode = true) {
    let keys = Object.keys(args).sort();
    let kvItems = [];
    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];
        let val = caseSense ? args[key] : args[key].toLowerCase();
        if (urlEncode) {
            val = _specialUrlEncode(val);
        }
        kvItems.push(`${key}=${val}`);
    }
    return kvItems.join('&');
}
exports.getSortedString = _getSortedString;

/**
 * The default parser for RESTful API's response body
 * @param {*} body 
 * @param {*} callback 
 * @returns 
 */
exports.defaultBodyParser = function (body, callback) {
    if (!body) {
        return callback();
    }
    if (body.code !== eRetCodes.SUCCESS) {
        return callback({
            code: body.code,
            message: body.message
        });
    }
    return callback(null, body.data);
}

function _getFlowToken(options, callback) {
    let fnFlowCtl = options.flowController;
    if (typeof fnFlowCtl === 'function') {
        delete options.flowController;
    } else {
        fnFlowCtl = null;
    }
    if (!fnFlowCtl) {
        return callback(null, 1);
    }
    return fnFlowCtl.call(null, callback);
}

/**
 * The http request wrapper based on request@2.88.2
 * @param {*} options 
 * @param {*} callback 
 */
exports.invokeHttpRequest = function (options, callback) {
    if (options.timeout === undefined) {
        options.timeout = pubdefs.eInterval._5_SEC;
    }
    let bodyParser = options.bodyParser;
    if (typeof bodyParser === 'function') {
        delete options.bodyParser;
    } else {
        bodyParser = null;
    }

    //logger.debug(`Invoke options: ${_inspect(options)}`);
    _getFlowToken(options, (err, token) => {
        if (err) {
            return callback(err);
        }
        request(options, (err, rsp, body) => {
            if (err) {
                logger.error(err.code, err.message);
                return callback({
                    code: eRetCodes.INTERNAL_SERVER_ERR,
                    message: `Http invoke error! - ${err.code}#${err.message}`
                });
            }
            if ([eRetCodes.SUCCESS, eRetCodes.CREATED].indexOf(rsp.statusCode) === -1) {
                let msg = rsp.body || rsp.statusMessage || 'Server error!';
                if (typeof msg !== 'string') {
                    msg = _inspect(msg);
                }
                logger.error(`Http response error! - ${rsp.statusCode} - ${msg}:`);
                return callback({
                    code: rsp.statusCode,
                    message: msg
                });
            }
            //logger.info('Body:', _inspect(body));
            if (bodyParser) {
                return bodyParser(body, callback);
            }
            return callback(null, body);
        });
    });
};

/**
 * The parameter parser for http request
 * @param {json object} params 
 * @param {mandatory, optional} options 
 * @param {*} callback 
 * @returns 
 */
exports.parseParameters = function (params, options, callback) {
    logger.info(`Input parameters: ${_inspect(params)}`);
    // Step 1: Preparing the input parameters
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (!params) {
        return callback({
            code: eRetCodes.BAD_REQUEST,
            message: 'Null parameters'
        });
    }
    if (_isTypeOfArray(options)) {
        options = {
            mandatory: options,
            optional: []
        }
    } else {
        if (!options.mandatory) {
            options.mandatory = [];
        }
        if (!options.optional) {
            options.optional = [];
        }
    }
    let args = {};
    let errMsg = null;
    // Step 2: Parsing mandatory parameters
    for (let i in options.mandatory) {
        let key = options.mandatory[i];
        if (!params[key]) {
            errMsg = `Missing parameter(s): ${key}`;
            break;
        }
        if (options.checkObjectId === true && key === '_id' && !ObjectId.isValid(params[key])) {
            errMsg = `Invalid ObjectId value: ${params[key]}`;
            break;
        }
        args[key] = params[key];
    }
    if (errMsg !== null) {
        logger.error(errMsg);
        return callback({
            code: eRetCodes.BAD_REQUEST,
            message: errMsg
        });
    }
    // Step 3: Parsing optional parameters
    for (let j in options.optional) {
        let key = options.optional[j];
        // Note: Exclude duplicate keys from mandatory
        if (options.mandatory.indexOf(key) === -1 && params[key] !== undefined) {
            if (options.checkObjectId === true && key === '_id' && !ObjectId.isValid(params[key])) {
                errMsg = `Invalid ObjectId value format: ${params[key]}`;
                break;
            }
            args[key] = params[key];
        }
    }
    return callback(errMsg, args);
};

function _validateString (field, validator, argv) {
    let errMsg = null;
    if (validator.minLen !== undefined) {
        if (argv.length <= validator.minLen) {
            errMsg = `Length of ${field} should great than ${validator.minLen} !`;
        }
    }
    if (!errMsg && validator.maxLen !== undefined) {
        if (argv.length > validator.maxLen) {
            errMsg = `Length of ${field} should less than ${validator.maxLen} !`;
        }
    }
    return errMsg;
}

function _validateNumber (field, validator, argv) {
    let errMsg = null;
    if (Number.isNaN(argv)) {
        errMsg = `Should be Number for ${field}!`;
    }
    if (!errMsg && validator.min !== undefined) {
        if (argv < validator.min) {
            errMsg = `${field} should great than ${validator.min} !`;
        }
    }
    if (!errMsg && validator.max !== undefined) {
        if (argv > validator.max) {
            errMsg = `${field} should less than ${validator.max} !`;
        }
    }
    return errMsg;
}

function _validateParameter(field, validator, argv) {
    let errMsg = null;
    if (validator.enum) {
        let enumValues = _isTypeOfArray(validator.enum)? validator.enum : Object.values(validator.enum);
        if (enumValues.indexOf(argv) === -1) {
            errMsg = `${field} value not allowed! - Should be one of ${_inspect(enumValues)}`;
        }
    }
    if (errMsg !== null) {
        return errMsg;
    }
    switch(validator.type) {
        case 'ObjectId':
            if (!ObjectId.isValid(argv)) {
                errMsg = `Invalid ObjectId value: ${field}!`;
            }
            break;
        case 'Number':
            errMsg = _validateNumber(field, validator, argv);
            break;
        case 'String':
            errMsg = _validateString(field, validator, argv);
            break;
        case 'Boolean':
            if (typeof argv !== 'boolean') {
                errMsg = `Should be Boolean for ${field}`;
            }
            break;
    }
    return errMsg;
}

/**
 * Transfer all optional parameters array to validator fields
 * @param {} validator 
 * @returns 
 */
function _unifyValidator(validator) {
    if (_isTypeOfArray(validator.mandatory)) {
        // Append mandatory fields
        validator.mandatory.forEach(key => {
            if (validator[key] === undefined) {
                validator[key] = {
                    required: true
                };
            }
        });
    }
    if (_isTypeOfArray(validator.optional)) {
        // Append optional fields
        validator.optional.forEach(key => {
            if (validator[key] === undefined) {
                validator[key] = {};
            }
        });
    }
}

exports.parseParameter2 = function (args, validator, callback) {
    logger.debug(`Parsing: ${_inspect(args)}`);
    if (typeof validator === 'function') {
        callback = options;
        validator = {};
    }
    _unifyValidator(validator);
    let fields = Object.keys(validator);
    if (fields.length === 0) {  // No validator provided or all arguments are validated
        return callback(null, args);
    }
    // Only validated arguments will be parsed
    let params = {};
    let errMsg = null;
    for (let i = 0; i < fields.length; i++) {
        let field = fields[i];
        let v = validator[field];
        let argv = args[field];

        if (argv === undefined) {
            if (v.required === true) {
                errMsg = `Missing parameter(s): ${field}!`;
                break;
            }
            continue;
        }
        // Perform validation for exist field ...
        errMsg = _validateParameter(field, v, argv);
        if (errMsg !== null) {
            break;
        }         
        // Copy directly
        params[field] = argv;
    }
    if (errMsg) {
        return callback({
            code: eRetCodes.BAD_REQUEST,
            message: errMsg
        })
    }
    return callback(null, params);
};

exports.checkSign = function (req, res, next) { 
    return next();
};

exports.getClientIp = function (req) {
    let ip = '0.0.0.0';
    let xff = req.headers['x-forwarded-for'];
    if (xff === undefined) {
        if (req.connection) {
            ip = req.connection.remoteAddress;
        }
        if (ip === undefined) {
            if (req.socket) {
                ip = req.socket.remoteAddress;
            }
            if (ip === undefined) {
                if (req.connection && req.connection.socket) {
                    ip = req.connection.socket.remoteAddress;
                }
            }
        }
    } else {
        ip = xff.split(',')[0].trim();
    }
    if (ip) {
        return ip.replace(/::ffff:/, '');
    }
    return ip;
};

exports.getLocalIp = function () {
    const nets = networkInterfaces();
    const results = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-ipv4 and internal addresses
            if (net.family === 'IPv4' && !net.internal) {
                results.push(net.address);
            }
        }
    }
    return results;
}

// Generate random token
function _generateRandom(length, encode) {
    let len = length || 24;   // Set default to 24
    let enc = encode || 'base64';
    return crypto.randomBytes(Math.ceil(len * 3 / 4))
        .toString(enc)
        .slice(0, len);
}
exports.genAKey = function() {
    return _generateRandom(6, 'hex');
};

exports.genToken = function(length = 16, encoding = 'hex') {
    return _generateRandom(length || 16, encoding);
};

exports.genInvitation = function() {
    return _generateRandom(6, 'hex');
};

exports.md5Sign = function() {
    let seed = '';
    for (let i = 0; i < arguments.length; i ++) {
        seed += arguments[i];
    }
    return crypto.createHash('md5').update(seed).digest('hex');
};

exports.sha1Sign = function() {
    let seed = '';
    for (let i = 0; i < arguments.length; i ++) {
        seed += arguments[i];
    }
    return crypto.createHash('sha1').update(seed).digest('hex');
};

function _isEmail (email) {
    let re = new RegExp(/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/);
    return re.test(email);
}
exports.isEmail = _isEmail;

function _isMobile(mobile) {
    let r = new RegExp(/^1[3-9][0-9]\d{8}$/);
    return r.test(mobile);
}
exports.isMobile = _isMobile;

function _isIpAddr (ip) {
    let re = new RegExp(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/);
    return re.test(ip);
}
exports.isIpAddr = _isIpAddr;
