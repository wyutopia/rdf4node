/**
 * The authentication and authorization module
 */
const sysConf = require('./config');
const config = sysConf.security || {};



const jwt = require('../libs/base/jwt');

exports.authorize = function (req, res, next) {

};

function jwtAuth (req, res, next) {

}

function cookieAuth (req, res, next) {

}

exports.authenticate = function (req, res, next) {

}






//
module.exports = exports = {
    jwtAuth: jwtAuth,
    cookieAuth: cookieAuth
};
