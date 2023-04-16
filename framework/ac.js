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

function _packUserPayload (uid, user) {
    return {
        id: uid,
        sub: user.username,
        grp: user.activeGroup,
        tnt: user.activeTenant
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
        if (req.jwt === undefined) {
            req.jwt = {};
        } else {
            req['x-jwt'] = {};
        }
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
const gVerbsRe = new RegExp(/(add|create|get|find|list|watch|update|patch|modify|push|move|assign|sort|schedule|delete|remove)/);
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

// Declaring module exports
module.exports = exports = {
    packUserPayload: _packUserPayload,
    packAdminPayload: _packAdminPayload,
    genJwtToken: _genJwtToken,
    refreshJwtToken: _refreshJwtToken,
    accessAuth: _accessAuth
};
