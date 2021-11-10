/**
 * Created by eric on 2021/09/09
 */
 const assert = require('assert');
 const ObjectId = require('mongoose').Types.ObjectId;
 const request = require('request');
 const spawn = require('child_process').spawn;
 const util = require("util");
 const {v4: uuidv4} = require('uuid');
 
 const pubdefs = require('./pubdefs');
 const eRetCodes = require('../common/retcodes');
 const {WinstonLogger} = require('../libs/winston.wrapper');
 const {networkInterfaces} = require("os");
 const logger = WinstonLogger(process.env.SRV_ROLE || 'sign');
 
 function _inspect(obj) {
     return util.inspect(obj, {showHidden: false, depth: null});
 }
 exports.inspect = _inspect;
 
 exports.execCli = (program, args, options, callback) => {
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
         logger.error('Execute command error!', err);
         error.push(err.toString());
     });
     proc.stdout.on('data', (data) => {
         logger.info('stdout:', data);
         if (data) {
             info.push(data.toString());
         }
     });
     proc.stderr.on('data', (data) => {
        logger.error(`stderr: ${data}`);
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
 
 function _isTypeOfArray (obj) {
     return '[object Array]' === Object.prototype.toString.call(obj);
 }
 exports.isTypeOfArray = _isTypeOfArray;
 
 exports.isTypeOfDate = function(obj) {
     return '[object Date]' === Object.prototype.toString.call(obj);
 };
 
 exports.uuidv4 = function() {
     return uuidv4().replace(/-/g, '');
 };
 
 exports.safeGetJsonValue = (json, path) => {
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
 
 exports.packUri = function(url, data) {
     let uri = url;
     if (data) {
         let params = [];
         let keys = Object.keys(data);
         keys.forEach(function(key){
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
         let val = caseSense? args[key] : args[key].toLowerCase();
         if (urlEncode) {
             val = _specialUrlEncode(val);
         }
         kvItems.push(`${key}=${val}`);
     }
     return kvItems.join('&');
 }
 exports.getSortedString = _getSortedString;
 
 exports.defaultBodyParser = (body, callback) => {
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
 
 exports.invokeHttpRequest = (options, bodyParser, callback) => {
     logger.debug(`Request options: ${_inspect(options)}`);
     if (options.timeout === undefined) {
         options.timeout = pubdefs.eInterval._3_SEC;
     }
     request(options, (err, rsp, body) => {
         if (err) {
             logger.error(err.code, err.message);
             return callback({
                 code: eRetCodes.INTERNAL_SERVER_ERR,
                 message: `Http invoke error! - ${err.message}`
             });
         }
         if (rsp.statusCode !== eRetCodes.SUCCESS) {
             logger.error(`Http response status: ${rsp.statusCode} ${rsp.statusMessage}`);
             return callback({
                 code: rsp.statusCode,
                 message: rsp.statusMessage
             });
         }
         logger.debug(`Body: ${_inspect(body)}`);
         if (typeof bodyParser === 'function') {
             return bodyParser(body, callback);
         }
         return callback(null, body);
     });
 };
 
 exports.checkParameters = (parameters, pList, callback) => {
     let args = Object.assign({}, parameters);
     logger.info(`Input parameters: ${_inspect(args)}`);
     for (let i in pList) {
         let key = pList[i];
         if (args[key] === undefined) {
             let msg = `Missing parameter: ${key}`;
             logger.error(msg);
             return callback({
                 code: 400,
                 message: msg
             });
         }
     }
     return callback(null, args);
 };
 
 exports.parseParameters = (params, options, callback) => {
     logger.info(`Input parameters: ${_inspect(params)}`);
     if (typeof options === 'function') {
         callback = options;
         options = {};
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
     for (let i in options.mandatory) {
         let key = options.mandatory[i];
         if (!params[key]) {
             errMsg = `Missing parameter(s): ${key}`;
             break;
 
         } else if (key === '_id' && !ObjectId.isValid(params[key])) {
             errMsg = `Invalid ObjectId value: ${params[key]}`;
             break;
         }
         args[key] = params[key];
     }
     if (errMsg !== null) {
         logger.error(errMsg);
         return callback({
             code: 400,
             message: errMsg
         });
     }
     for (let j in options.optional) {
         let key = options.optional[j];
         if (options.mandatory.indexOf(key) === -1 && params[key] !== undefined) {
             if (key === '_id' && !ObjectId.isValid(params[key])) {
                 errMsg = `Invalid ObjectId value format: ${params[key]}`;
                 break;
             }
             args[key] = params[key];
         }
     }
     return callback(errMsg, args);
 };
 
 exports.getClientIp = function(req) {
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
 
 exports.parseArgs = function (source, target, keys) {
     keys.forEach(key => {
         if (source[key] !== undefined) {
             target[key] = source[key];
         }
     });
 }
 
 