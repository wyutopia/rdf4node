/**
 * Create by wyutopia on 2021/11/10
 */
exports.theApp = require('./bootstrap');

// Definitions
exports.eRetCodes = require('./include/retcodes.js');

// base libs
exports.XTask = require('./libs/xtask');
exports.eventModule = require('./libs/event-module');

exports.sysConfig = require('./libs/base/config');
exports.expressWrapper = require('./libs/base/express.wrapper');
exports.MorganWrapper = require('./libs/base/morgan.wrapper');
exports.winstonWrapper = require('./libs/base/winston.wrapper');
exports.monitor = require('./libs/base/prom.wrapper');
exports.rateLimiter = require('./libs/base/ratelimit.wrapper');

// common libs
exports.amqpWrapper = require('./libs/common/ampq.wrapper');
exports.mongoose = require('./libs/common/mongoose.wrapper');
exports.mongoSession = require('./libs/common/mongo-session.wrapper');
exports.mysql2Wrapper = require('./libs/common/mysql2.wrapper');
exports.grpcWrapper = require('./libs/common/grpc.wrapper');
exports.ldapWrapper = require('./libs/common/ldap-auth.wrapper');
exports.httpMonitor = require('./libs/common/http-monitor');

// utilities
exports.tools = require('./utils/tools');
exports.dbHelper = require('./utils/db-helper');
exports.logDirMainter = require('./utils/logdir-maint');