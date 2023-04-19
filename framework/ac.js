/**
 * The authentication and authorization module
 */
const jsonwebtoken = require('jsonwebtoken');
const {Types: {ObjectId}} = require('mongoose');
//
const eRetCodes = require('../include/retcodes');
const tools = require('../utils/tools');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE);
//
const sysConf = require('./config');
const config = sysConf.security || {};
const ENCRYPT_KEY = config.encryptKey || 'abcd1234';
const EXPIRES_IN = config.expiresIn || '72h';
const DEFAULT_OPTIONS = config.signOptions || {
    expiresIn: EXPIRES_IN, 
};
logger.info(`>>>>>> The jwt configuration: ${ENCRYPT_KEY} - ${tools.inspect(DEFAULT_OPTIONS)}`);

function _packAdminPayload (aid, admin) {
    return {
        id: aid,
        sub: admin.username
    }
}

function _packUserPayload (user) {
    return {
        id: user._id,
        sub: user.username,
        grp: user.activeGroup._id,
        tnt: user.activeTenant._id
    }
}

function _genJwtToken(payload, signOptions) {
    const jwtSignOptions = Object.assign({}, signOptions, DEFAULT_OPTIONS);
    return jsonwebtoken.sign(payload, ENCRYPT_KEY, jwtSignOptions);
}

function _refreshJwtToken(token, refreshOptions) {
    const payload = jsonwebtoken.verify(token, ENCRYPT_KEY, refreshOptions.verify);
    delete payload.iat;
    delete payload.exp;
    delete payload.nbf;
    delete payload.jti;
    const jwtSignOptions = Object.assign({}, DEFAULT_OPTIONS, {jwtid: refreshOptions.jwtid});
    return jwt.sign(payload, ENCRYPT_KEY, jwtSignOptions);
}

function _validateJwt(req, callback) {
    // Extract JWT from the request header
    const authHeader = req.headers['authorization'];
    const jwt = authHeader && authHeader.split(' ')[1];
    if (!jwt) {
        return callback({
            code: eRetCodes.UNAUTHORIZED,
            message: 'JWT is required!'
        });
    }
    return jsonwebtoken.verify(jwt, ENCRYPT_KEY, (err, token) => {
        if (err) {
            logger.error(`Verfiy JWT error! - ${err.message}`);
            return callback({
                code: eRetCodes.FORBIDDEN,
                message: 'Invalid JWT value!'
            });
        }
        return callback(null, token);
    });
};

function _authenticate(authType, req, callback) {
    if (authType === 'jwt') {
        return _validateJwt(req, (err, token) => {
            if (err && config.enableAuthentication === true) {
                return callback(err);
            }
            // Set decoded jwt into req
            if (req.jwt === undefined) {
                req.jwt = token || {};
            } else {
                req['x-jwt'] = token || {};
            }
            return callback();
        });
    }
    if (authType === 'cookie') {
        // TODO: Add cookie validation here ...
        return callback();
    }
    return callback();
}

const privilegeUrls = config.privilegeUrls || [];
//
// [
//     '/monitor/metrics',
//     '/monitor/health',
//     'admin/login',
//     'admin/logout',
//     'admin/chgpwd',
//     'users/login',
//     'users/logout',
//     'users/chgpwd',
//     'users/update'
// ];
const gVerbsRe = new RegExp(/(add|create|get|find|findby|list|watch|update|patch|modify|push|move|assign|sort|schedule|delete|remove)/);
function _parseUrl(originUrl) {
    let result = {};
    let url = originUrl.replace('\/v1\/', '').split(':')[0].replace(/\/$/, '');
    let found = gVerbsRe.exec(url);
    if (found) {
        result.resource = url.slice(0, found.index).replace(/\/$/, '');
        result.verb = found[0];
    }
    if (privilegeUrls.indexOf(url) !== -1) {
        result.resource = url;
        result.verb = '*';
        return result;
    }
    return result;
}

function _authorize(req, callback) {
    if (config.enableAuthorization !== true) {
        // Ignore AUTHORIZATION
        return callback();
    }
    let acl = _parseUrl(req.url);
    if (!acl.resource) {
        return callback({
            code: eRetCodes.UNAUTHORIZED,
            message: 'Unknown request url'
        });
    }
    //TODO: Add 
    return callback();
};

function _authorize2(req, args, callback) {
    let whoami = req.jwt.id;
    
}

function _accessAuth(authType, req, res, next) {
    _authenticate(authType, req, err => {
        if (err) {
            return res.sendRsp(err.code, err.message);
        }
        _authorize(req, err => {
            if (err) {
                return res.sendStatus(err.code);
            }
            return next();
        });
    });
}

function _validateString (field, validator, argv) {
    let errMsg = null;
    if (!argv && validator.allowEmpty) {
        return errMsg;
    }
    if (validator.regexp && !validator.regexp.test(argv)) {
        errMsg = `Invalid ${field} value!`;
    }
    if (!errMsg && validator.minLen !== undefined) {
        if (argv.length < validator.minLen) {
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


function _validateEmbeddedObject(field, validator, args) {
    let errMsg = null;
    let vals = validator.$embeddedValidators;
    if (!vals) {
        return errMsg;
    }
    let valKeys = Object.keys(vals);
    if (valKeys.length === 0) {
        return errMsg;
    }
    for (let i = 0; i < args.length; i++) {
        for (let j = 0; j < valKeys.length; j++) {
            let valKey = valKeys[j];
            let val = vals[valKey];
            let argv = args[i][valKey];
            //
            if (val.required === true && argv === undefined) {
                errMsg = `${field}.${valKey} is required!`;
                break;
            }
            if (val.enum) {
                let enumValues = tools.isTypeOfArray(val.enum)? val.enum : Object.values(val.enum);
                if (enumValues.indexOf(argv) === -1) {
                    errMsg = `Value of ${field}.${i}.${valKey} is not allowed! - Should be one of ${tools.inspect(enumValues)}`;
                }
            }
            if (!errMsg) {
                switch(val.type) {
                    case 'ObjectID':
                        if (!ObjectId.isValid(argv) && val.allowEmpty !== true) {
                            errMsg = `Invalid ObjectId value: ${field}.${i}.${valKey}!`;
                        }
                        break;
                    case 'Number':
                        errMsg = _validateNumber(valKey, val, argv, {
                            fieldPrefix: `${field}.${i}`
                        });
                        break;
                    case 'String':
                        errMsg = _validateString(valKey, val, argv);
                        break;
                    case 'Boolean':
                        if (typeof argv !== 'boolean') {
                            errMsg = `Should be Boolean for ${field}.${i}.${valKey}`;
                        }
                        break;
                    case 'Date':
                        errMsg = _validateDate(valKey, val, argv, {
                            fieldPrefix: `${field}.${i}`
                        });
                        break;
                }
            }
            if (errMsg) {
                break;
            }
        }
        if (errMsg) {
            break;
        }
    }
    return errMsg;
}

const typeExtractRe = new RegExp("String|Number|ObjectID|EmbeddedObject");
function _validateTypedArray(field, validator, args) {
    let errMsg = null;
    if (!Array.isArray(args)) {
        errMsg = `${field} should be array!`;
        return errMsg;
    }
    let t = typeExtractRe.exec(validator.type)[0];
    for (let i = 0; i < args.length; i++) {
        let argv = args[i];
        switch(t) {
            case 'String':
                if (typeof argv !== 'string') {
                    errMsg = `type of #${i} in ${field} should be ${t}`;
                }
                break;
            case 'ObjectID':
                if(!ObjectId.isValid(argv)) {
                    errMsg = `type of #${i} in ${field} should be ${t}`;
                }
                break;
            case 'Number':
                if (Number.isNaN(argv)) {
                    errMsg = `type of #${i} in ${field} should be ${t}`;
                }
                break;
            case 'EmbeddedObject':
                errMsg = _validateEmbeddedObject(field, validator, args);
                break;
        }
        if (errMsg) {
            break;
        }
    }
    return errMsg
}

function _validateTypedList (field, validator, args) {
    let errMsg = null;
    let params = [];
    let rawString = typeof args === 'string'? args : args.toString();
    let strArr = rawString.split(',');
    let t = typeExtractRe.exec(validator.type)[0];
    for (let i=0; i<strArr.length; i++) {
        let item = strArr[i];
        switch(t) {
            case 'ObjectID':
                if(!ObjectId.isValid(item)) {
                    errMsg = `type of #${i} in ${field} should be ${t}`;
                }              
                break;
            case 'Number':
                if (Number.isNaN(item)) {
                    errMsg = `type of #${i} in ${field} should be ${t}`;
                }
                break;
        }
        if (!errMsg) {
            params.push(item);
        } else {
            break;
        }
    }
    if (!errMsg) {
        args = params;
    }
    return errMsg;
}

function _validateNumber (field, validator, argv, options = {}) {
    let fullField = options.fieldPrefix === undefined? field : `${options.fieldPrefix}.${field}`;
    let errMsg = null;
    if (typeof argv === 'string' || Number.isNaN(argv)) {
        errMsg = `Value type of ${fullField} Should be Number!`;
    }
    if (!errMsg && validator.min !== undefined) {
        if (argv < validator.min) {
            errMsg = `Value of ${fullField} should be great than ${validator.min} !`;
        }
    }
    if (!errMsg && validator.max !== undefined) {
        if (argv > validator.max) {
            errMsg = `Value of ${fullField} should be less than ${validator.max} !`;
        }
    }
    return errMsg;
}

function _validateDate (field, validator, argv, options = {}) {
    let fullField = options.fieldPrefix === undefined? field : `${options.fieldPrefix}.${field}`;
    let errMsg = null;
    if (Date.parse(argv) === NaN) {
        errMsg = `Value format of ${fullField} should be Date!`;
    }
    return errMsg;
}

const typedArrayRe = new RegExp("^Array<(String|Number|ObjectID|EmbeddedObject)>$");
//const typedListRe = new RegExp("^List<(String|Number|ObjectID)>$");
function _validateParameter(field, validator, argv) {
    //logger.debug(`Perform validation: ${field} - ${tools.inspect(validator)} - ${tools.inspect(argv)}`);
    let errMsg = null;
    if (validator.enum) {
        let enumValues = tools.isTypeOfArray(validator.enum)? validator.enum : Object.values(validator.enum);
        if (enumValues.indexOf(argv) === -1) {
            errMsg = `${field} value not allowed! - Should be one of ${tools.inspect(enumValues)}`;
        }
    }
    if (errMsg !== null) {
        return errMsg;
    }
    if (typedArrayRe.test(validator.type)) {
        errMsg = _validateTypedArray(field, validator, argv);
    }
    // if (typedListRe.test(validator.type)) {
    //     errMsg = _validateTypedList(field, validator, argv);
    // }
    if (errMsg !== null) {
        return errMsg;
    }
    switch(validator.type) {
        case 'ObjectID':
            if (!ObjectId.isValid(argv) && validator.allowEmpty !== true) {
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
        case 'Date':
            errMsg = _validateDate(field, validator, argv);
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
    if (tools.isTypeOfArray(validator.mandatory)) {
        // Append mandatory fields
        validator.mandatory.forEach(key => {
            if (validator[key] === undefined) {
                validator[key] = {
                    required: true
                };
            }
        });
    }
    if (tools.isTypeOfArray(validator.optional)) {
        // Append optional fields
        validator.optional.forEach(key => {
            if (validator[key] === undefined) {
                validator[key] = {};
            }
        });
    }
}

function _parseParameters (args, validator, callback) {
    logger.debug(`Parsing: ${tools.inspect(args)}`);
    if (typeof validator === 'function') {
        callback = validator;
        validator = {};
    }
    _unifyValidator(validator);
    let fields = Object.keys(validator);
    //logger.debug(`Validator fields: ${tools.inspect(fields)}`);
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
            continue;  // Ignore optional parameter
        }
        // Perform validation for exist field ...
        errMsg = _validateParameter(field, v, argv);
        if (errMsg !== null) {
            break;
        }
        // Copy directly
        if (v.transKey) {
            params[v.transKey] = argv;
        } else {
            params[field] = argv;
        }
    }
    if (errMsg) {
        return callback({
            code: eRetCodes.BAD_REQUEST,
            message: errMsg
        })
    }
    return callback(null, params);
}

// Declaring module exports
module.exports = exports = {
    packUserPayload: _packUserPayload,
    packAdminPayload: _packAdminPayload,
    genJwtToken: _genJwtToken,
    refreshJwtToken: _refreshJwtToken,
    accessAuth: _accessAuth,
    authorize: _authorize2,
    parseParameters: _parseParameters
};
