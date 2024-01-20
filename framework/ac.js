/**
 * The authentication and authorization module
 */
const jsonwebtoken = require('jsonwebtoken');
const { ObjectId } = require('bson');
//
const eRetCodes = require('../include/retcodes');
const tools = require('../utils/tools');
const {CommonModule} = require('../include/base');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE);
//
const {app: appConf} = require('../include/config');
const config = appConf.security || {};
const ENCRYPT_KEY = config.encryptKey || 'abcd1234';
const EXPIRES_IN = config.expiresIn || '72h';
const DEFAULT_OPTIONS = config.signOptions || {
    expiresIn: EXPIRES_IN, 
};
logger.info(`>>>>>> The jwt configuration: ${ENCRYPT_KEY} - ${tools.inspect(DEFAULT_OPTIONS)}`);

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

function _validateString (field, validator, argv) {
    let errMsg = null;
    if (!argv && validator.allowEmpty) {
        return errMsg;
    }
    if (validator.regexp && !validator.regexp.test(argv)) {
        errMsg = `Invalid ${field} value!`;
    }
    if (!errMsg && validator.minLeng !== undefined) {
        if (argv.length < validator.minLeng) {
            errMsg = `Length of ${field} should be great than ${validator.minLeng} !`;
        }
    }
    if (!errMsg && validator.maxLeng !== undefined) {
        if (argv.length > validator.maxLeng) {
            errMsg = `Length of ${field} should be less than ${validator.maxLeng} !`;
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
                    case 'ObjectId':
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

const _typeExtractRe = new RegExp("String|Number|ObjectId|EmbeddedObject");
function _validateTypedArray(field, validator, args) {
    let errMsg = null;
    if (!Array.isArray(args)) {
        errMsg = `${field} should be array!`;
        return errMsg;
    }
    let result = _typeExtractRe.exec(validator.type);
    if (!result) {
        errMsg = `Unrecognized parameter type: ${field}`;
        return errMsg;
    }
    let t = result[0];
    for (let i = 0; i < args.length; i++) {
        let argv = args[i];
        switch(t) {
            case 'String':
                if (typeof argv !== 'string') {
                    errMsg = `type of #${i} in ${field} should be ${t}`;
                }
                break;
            case 'ObjectId':
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

const _typedArrayRe = new RegExp("^Array<(String|Number|ObjectId|EmbeddedObject)>$");
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
    if (_typedArrayRe.test(validator.type)) {
        errMsg = _validateTypedArray(field, validator, argv);
    }
    if (errMsg !== null) {
        return errMsg;
    }
    switch(validator.type) {
        case 'ObjectId':
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
                errMsg = `Value of ${field} shoud be a boolean!`;
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

function _parseParameters (params, validator, callback) {
    if (typeof validator === 'function') {
        callback = validator;
        validator = {};
    }
    _unifyValidator(validator);
    let fields = Object.keys(validator);
    //logger.debug(`Validator fields: ${tools.inspect(fields)}`);
    if (fields.length === 0) {  // No validator provided or all arguments are validated
        return callback(null, params);
    }
    // Only validated arguments will be parsed
    let args = {};
    let errMsg = null;
    for (let i = 0; i < fields.length; i++) {
        let field = fields[i];
        let val = validator[field];
        let argv = (params[field] !== undefined && val.type === 'Number')? parseFloat(params[field]) : params[field];

        if (argv === undefined) {
            if (val.required === true) {
                errMsg = `Missing parameter(s): ${field}!`;
                break;
            }
            continue;  // Ignore optional parameter
        }
        // Perform validation for exist field ...
        errMsg = _validateParameter(field, val, argv);
        if (errMsg !== null) {
            break;
        }
        // Copy directly
        if (val.transKey) {
            args[val.transKey] = argv;
        } else {
            args[field] = argv;
        }
    }
    if (errMsg) {
        return callback({
            code: eRetCodes.BAD_REQUEST,
            message: errMsg
        })
    }
    return callback(null, args);
}

// The class
class AccessControllerHelper extends CommonModule {
    constructor(props) {
        super(props);
        //
        this.packUserPayload = (user) => {
            return {
                id: user._id,
                sub: user.username,
                grp: user.activeGroup,
                tnt: user.activeTenant
            }
        };
        this.packAdminPayload = (admin) => {
            return {
                id: admin._id,
                sub: admin.username
            }
        };
        this.genJwtToken = (payload, signOptions) => {
            const jwtSignOptions = Object.assign({}, signOptions, DEFAULT_OPTIONS);
            return jsonwebtoken.sign(payload, ENCRYPT_KEY, jwtSignOptions);        
        };
        this.refreshJwtToken = (token, refreshOptions) => {
            const payload = jsonwebtoken.verify(token, ENCRYPT_KEY, refreshOptions.verify);
            delete payload.iat;
            delete payload.exp;
            delete payload.nbf;
            delete payload.jti;
            const jwtSignOptions = Object.assign({}, DEFAULT_OPTIONS, {jwtid: refreshOptions.jwtid});
            return jwt.sign(payload, ENCRYPT_KEY, jwtSignOptions);        
        };
        //
        this._realAuthorize = function (req, options, callback) {
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            logger.info('Do nothing on authorization!');
            return callback();
        };
    }
}
const _acHelper = new AccessControllerHelper({
    $name: 'AccessCtrollerHelper'
})

// The private methods
function _authenticate(authType, req, callback) {
    req.$token = {};
    if (authType === 'jwt') {
        return _validateJwt(req, (err, token) => {
            if (err && config.enableAuthentication === true) {
                return callback(err);
            }
            if (token) {
                req.$token = token;
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

function _authorize(req, scope, callback) {
    if (config.enableAuthorization !== true) {
        // Ignore AUTHORIZATION
        return callback();
    }
    // Do real authorization
    return _acHelper._realAuthorize(req, {scope: scope}, callback);
}

/**
 * 
 * @param {authType, validator, scope} options 
 * @param {*} req 
 * @param {*} res 
 * @param {*} next 
 */
function _accessCtl ({authType, validator, scope}, req, res, next) {
    _authenticate(authType, req, err => {
        if (err) {
            return res.sendStatus(err.code);
        }
        let params = Object.assign({}, req.params, req.query, req.body);
        logger.debug(`Parsing parameters: ${tools.inspect(params)} - ${req.url}`);
        _parseParameters(params, validator, (err, args) => {
            if (err) {
                return res.sendRsp(err.code, err.message);
            }
            req.$args = args;  // Append parsed parameters as $args
            if (authType === 'none') {
                return next();
            }
            _authorize(req, scope, err => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                return next();
            });
        });
    });
}

// Declaring module exports
module.exports = exports = {
    accessCtl : _accessCtl,
    acHelper : _acHelper
};
