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
 const logger = WinstonLogger(process.env.SRV_ROLE || 'icp');
 const tools = require('../../utils/tools');

exports.register = function () {

};

exports.deregister = function () {

};

exports.getMethod = function () {

};