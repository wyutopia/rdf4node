/**
 * Import constants, enums, classes and utilities from @icedeer/rdf4node
 * Created by Eric on 2021/11/10
 * Updated by Eric on 2024/01/21
 */
// Definitions
const sysdefs= require('@icedeer/rdf4node/include/sysdefs');
// Merge application definitions
const pubdefs = require('./common/pubdefs');
exports.pubdefs = ((...args) => {
    const result = {};
    args.forEach(arg => {
        Object.keys(arg).forEach(key => {
            result[key] = Object.assign(result[key] || {}, arg[key])
        });
    })
    return result;
})(sysdefs, pubdefs);
//
exports.eRetCodes = require('@icedeer/rdf4node/include/retcodes');
exports.base = require('@icedeer/rdf4node/include/base');
exports.events = require('@icedeer/rdf4node/include/events');

// utilities
exports.tools = require('@icedeer/rdf4node/utils/tools');
exports.logDirManager = require('@icedeer/rdf4node/utils/logdir.manager');

// The config
const config = require('@icedeer/rdf4node/include/config');
exports.sysConfig = config;
exports.allConfig = config;

// base libs
exports.expressWrapper = require('@icedeer/rdf4node/libs/base/express.wrapper');
exports.WinstonLogger = require('@icedeer/rdf4node/libs/base/winston.wrapper').WinstonLogger;
exports.monitor = require('@icedeer/rdf4node/libs/base/prom.monitor');

// common libs
exports.mongoose = require('@icedeer/rdf4node/libs/common/mongoose.wrapper');
exports.redisWrapper = require('@icedeer/rdf4node/libs/common/redis.wrapper');

// framework components
exports.ac = require('@icedeer/rdf4node/framework/ac');
exports.components = require('@icedeer/rdf4node/framework/components');
exports._DS_DEFAULT_ = require('@icedeer/rdf4node/framework/repository')._DS_DEFAULT_;
exports.cache = require('@icedeer/rdf4node/framework/cache');
exports.XTask = require('@icedeer/rdf4node/framework/xtask').XTask;
exports.EventLogger = require('@icedeer/rdf4node/framework/ebus').EventLogger;
