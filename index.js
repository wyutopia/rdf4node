/**
 * Created by Eric on 2021/11/10
 */
exports.theApp = require('./bootstrap');

// Definitions
exports.eRetCodes = require('./include/retcodes');
exports.base = require('./include/base');
exports.common = require('./include/common');
exports.events = require('./include/events');
exports.components = require('./framework/components');
exports.repository = require('./framework/repository');
exports.cache = require('./framework/cache');
exports.registry = require('./framework/registry');
const config = require('./framework/config');
exports.sysConfig = config;
exports.allConfig = config;
// utilities
exports.tools = require('./utils/tools');
exports.logDir = require('./utils/logdir-maint');

// base libs
exports.XTask = require('./libs/xtask');
//exports.moduleWrapper = require('./libs/event-module');
exports.expressWrapper = require('./libs/base/express.wrapper');
exports.MorganWrapper = require('./libs/base/morgan.wrapper');
exports.winstonWrapper = require('./libs/base/winston.wrapper');
exports.monitor = require('./libs/base/prom.wrapper');


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
// Database libs
if (config.mongodb || config.dbTypes.indexOf('mongo') !== -1) {
    exports.mongoose = require('./libs/common/mongoose.wrapper');
    exports.mongoSession = require('./libs/common/mongo-session.wrapper');
}
if (config.influxdb || config.dbTypes.indexOf('influxdb') !== -1) {
    exports.influxDbWrapper = require('./libs/common/influxdb.wrapper');
}
if (config.amq || config.mq) {
    exports.rascalWrapper = require('./libs/common/rascal.wrapper');
}
if (config.mysql2 || config.dbTypes.indexOf('mysql') !== -1) {
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
if (config.redis || config.dbTypes.indexOf('redis') !== -1) {
    exports.redisWrapper = require('./libs/common/redis.wrapper');
}
if (config.tedious || config.dbTypes.indexOf('mssql') !== -1) {
    exports.tdsWrapper = require('./libs/common/tedious.wrapper');
}
if (config.elastic || config.dbTypes.indexOf('elastic') !== -1) {
    exports.elasticWrapper = require('./libs/common/es.wrapper');
}