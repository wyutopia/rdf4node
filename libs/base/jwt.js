/**
 * Created by Eric on 2022/02/15
 */

const jsonwebtoken = require('jsonwebtoken');
// project libs
const pubdefs = require('../../include/sysdefs');
const eRetCodes = require('../../include/retcodes');

const { security: config } = require('../../framework/config');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE);
const tools = require('../../utils/tools');

const ENCRYPT_KEY = 'abcd1234';
const EXPIRES_IN = '120s';

exports.genToken = function (seed) {
    let expiresIn = config.expires || EXPIRES_IN;
    return {
        token: jsonwebtoken.sign(seed, config.encryptKey || ENCRYPT_KEY, { expiresIn:  expiresIn}),
        expiresIn: expiresIn
    }
};

exports.validateToken = function (req, res, next) {
    if (config.jwt === true) {
        // Extract JWT from the request header
        const authHeader = req.headers['authorization'];
        const jwt = authHeader && authHeader.split(' ')[1];
        if (jwt === null) {
            return res.sendRsp(eRetCodes.UNAUTHORIZED, 'JWT is required!');
        }
        return jsonwebtoken.verify(jwt, config.encryptKey || ENCRYPT_KEY, (err, token) => {
            if (err) {
                logger.error(`Verfiy JWT error! - ${err.message}`);
                return res.sendRsp(eRetCodes.FORBIDDEN, 'Invalid JWT value!');
            }
            req['x-jwt'] = token;
            return next();
        });
    }
    if (config.cookie === true) {
        //TODO: Add cookie support here ...
        return next();
    }
    return next();
};
