/**
 * Created by Eric on 2021/11/10
 */
// Definitions
exports.eRetCodes = require('./include/retcodes');
exports.base = require('./include/base');
exports.events = require('./include/events');
exports.ac = require('./framework/ac');
exports.components = require('./framework/components');
exports.repository = require('./framework/repository');
exports.cache = require('./framework/cache');
exports.registry = require('./framework/registry');
exports.distLocker = require('./framework/distributed-locker');
const config = require('./include/config');
exports.sysConfig = config;
exports.allConfig = config;
// utilities
exports.tools = require('./utils/tools');
exports.logDir = require('./utils/logdir-maint');

// base libs
exports.XTask = require('./framework/xtask');
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
exports.uploadHelper = require('./libs/common/upload');

// Expose database wrappers if configured
config.dbTypes.forEach(dbType => {
    switch(dbType) {
        case 'mongo':
            exports.mongoose = require('./libs/common/mongoose.wrapper');
            exports.mongoSession = require('./libs/common/mongo-session.wrapper');
            break;
        case 'influxdb':
            exports.influxDbWrapper = require('./libs/common/influxdb.wrapper');
            break;
        case 'mysql':
            exports.mysql2Wrapper = require('./libs/common/mysql2.wrapper');
            break;
        case 'mssql':
            exports.tdsWrapper = require('./libs/common/tedious.wrapper');
            break;
        case 'redis':
            exports.redisWrapper = require('./libs/common/redis.wrapper');
            break;
        case 'elastic':
            exports.elasticWrapper = require('./libs/common/es.wrapper');
            break;
    }
});

//
if (config.amq || config.mq) {
    exports.rascalWrapper = require('./libs/common/rascal.wrapper');
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

