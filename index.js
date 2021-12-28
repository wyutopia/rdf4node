/**
 * Create by wyutopia on 2021/11/10
 */
exports.theApp = require('./bootstrap');

// Definitions
exports.eRetCodes = require('./include/retcodes.js');

// base libs
exports.XTask = require('./libs/xtask');
exports.eventModule = require('./libs/event-module');

const config = require('./libs/base/config');
exports.sysConfig = config;
exports.allConfig = config;
exports.expressWrapper = require('./libs/base/express.wrapper');
exports.MorganWrapper = require('./libs/base/morgan.wrapper');
exports.winstonWrapper = require('./libs/base/winston.wrapper');
exports.monitor = require('./libs/base/prom.wrapper');
exports.rateLimiter = require('./libs/base/ratelimit.wrapper');

// utilities
exports.tools = require('./utils/tools');
exports.logDir = require('./utils/logdir-maint');

// common libs
if (config.mongodb) {
    exports.mongoose = require('./libs/common/mongoose.wrapper');
    exports.mongoSession = require('./libs/common/mongo-session.wrapper');
    exports.dbHelper = require('./utils/db-helper');
}
if (config.amq) {
    exports.amqpWrapper = require('./libs/common/ampq.wrapper');
}
if (config.mysql2) {
    exports.mysql2Wrapper = require('./libs/common/mysql2.wrapper');
}
if (config.grpc) {
    exports.grpcWrapper = require('./libs/common/grpc.wrapper');
}
if (config.ldap) {
    exports.ldapWrapper = require('./libs/common/ldap-auth.wrapper');
}
if (config.httpMonitor) {
    exports.httpMonitor = require('./libs/common/http-monitor');
}
if (config.redis) {
    exports.RedisClient = require('./libs/common/redis.wrapper');
}
if (config.tedious) {
    exports.tediousWrapper = require('./libs/common/tedious.wrapper');
}