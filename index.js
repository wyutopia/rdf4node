/**
 * Created by Eric on 2021/11/10
 */
exports.theApp = require('./bootstrap');

// Definitions
exports.eRetCodes = require('./include/retcodes.js');

// base libs
exports.XTask = require('./libs/xtask');
exports.moduleWrapper = require('./libs/event-module');

const config = require('./libs/base/config');
exports.sysConfig = config;
exports.allConfig = config;
exports.expressWrapper = require('./libs/base/express.wrapper');
exports.MorganWrapper = require('./libs/base/morgan.wrapper');
exports.winstonWrapper = require('./libs/base/winston.wrapper');
exports.monitor = require('./libs/base/prom.wrapper');

// utilities
exports.tools = require('./utils/tools');
exports.logDir = require('./utils/logdir-maint');

// common libs
exports.netWrapper = require('./libs/common/net.wrapper');
if (config.rateLimit) {
    exports.rateLimiter = require('./libs/base/ratelimit.wrapper');
}
if (config.security) {
    if (config.security.jwt) {
        exports.jwtWrapper = require('./libs/base/jwt');
    }
    //TODO: Add other security wrappers
}
if (config.mongodb) {
    exports.mongoose = require('./libs/common/mongoose.wrapper');
    exports.mongoSession = require('./libs/common/mongo-session.wrapper');
    exports.dbHelper = require('./utils/db-helper');
}
if (config.influxdb) {
    exports.influxDbWrapper = require('./libs/common/influxdb.wrapper');
}
if (config.amq) {
    //exports.amqpWrapper = require('./libs/common/ampq.wrapper');
    exports.rascalWrapper = require('./libs/common/rascal.wrapper');
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
    exports.redisWrapper = require('./libs/common/redis.wrapper');
}
if (config.tedious) {
    exports.tdsWrapper = require('./libs/common/tedious.wrapper');
}
if (config.elastic) {
    exports.elasticWrapper = require('./libs/common/es.wrapper');
}