/**
 * The authentication and authorization module
 */
const jsonwebtoken = require('jsonwebtoken');
//
const eRetCodes = require('../include/retcodes');
const tools = require('../utils/tools');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE);
//
const sysConf = require('./config');
const config = sysConf.security || {};
const ENCRYPT_KEY = config.encryptKey || 'abcd1234';
const EXPIRES_IN = config.expiresIn || '120s';

function _genJwtToken(seed) {
    return {
        token: jsonwebtoken.sign(seed, ENCRYPT_KEY, { expiresIn: EXPIRES_IN }),
        expiresIn: EXPIRES_IN
    }
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
        // Set decoded jwt into req
        if (req.jwt === undefined) {
            req.jwt = token;
        } else {
            req['x-jwt'] = token;
        }
        return callback();
    });
};

function _authenticate(authType, req, callback) {
    if (config.enableAuthentication !== true) {
        return callback();
    }
    if (authType === 'jwt') {
        return _validateJwt(req, callback);
    }
    if (authType === 'cookie') {
        // TODO: Add cookie validation here ...
        return callback();
    }
    return callback();
}

function _authorize(req, callback) {
    if (config.enableAuthorization !== true) {
        // Ignore AUTHORIZATION
        return callback();
    }
    return callback();
};

function _accessAuth(authType, req, res, next) {
    _authenticate(authType, req, err => {
        if (err) {
            return res.sendRsp(err.code, err.message);
        }
        _authorize(req, err => {
            if (err) {
                return res.sendRsp(err.code, err.message);
            }
            return next();
        });
    });
}

// Declaring module exports
module.exports = exports = {
    genJwtToken: _genJwtToken,
    accessAuth: _accessAuth
};
