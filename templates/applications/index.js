/**
 * Created by Eric on 2021/11/10
 */
// Definitions
const sysdefs = require('@icedeer/rdf4node/include/sysdefs');
exports.eRetCodes = require('@icedeer/rdf4node/include/retcodes');
exports.base = require('@icedeer/rdf4node/include/base');
exports.events = require('@icedeer/rdf4node/include/events');

// utilities
exports.tools = require('@icedeer/rdf4node/utils/tools');
exports.logDir = require('@icedeer/rdf4node/utils/logdir-maint');

// The config
const config = require('@icedeer/rdf4node/include/config');
exports.sysConfig = config;
exports.allConfig = config;

// base libs
exports.expressWrapper = require('@icedeer/rdf4node/libs/base/express.wrapper');
exports.MorganWrapper = require('@icedeer/rdf4node/libs/base/morgan.wrapper');
exports.winstonWrapper = require('@icedeer/rdf4node/libs/base/winston.wrapper');
exports.monitor = require('@icedeer/rdf4node/libs/base/prom.wrapper');
exports.rateLimiter = require('@icedeer/rdf4node/libs/base/ratelimit.wrapper');

// common libs
exports.netWrapper = require('@icedeer/rdf4node/libs/common/net.wrapper');
exports.httpMonitor = require('@icedeer/rdf4node/libs/common/http-monitor');
// The demo app use mongodb
exports.mongoose = require('@icedeer/rdf4node/libs/common/mongoose.wrapper');
exports.mongoSession = require('@icedeer/rdf4node/libs/common/mongo-session.wrapper');
// Other used libs
//exports.uploadHelper = require('@icedeer/rdf4node/libs/common/upload');
//exports.redisWrapper = require('@icedeer/rdf4node/libs/common/redis.wrapper');
//exports.rascalWrapper = require('@icedeer/rdf4node/libs/common/rascal.wrapper');
//exports.grpcWrapper = require('@icedeer/rdf4node/libs/common/grpc.wrapper');

// framework components
exports.ac = require('@icedeer/rdf4node/framework/ac');
exports.components = require('@icedeer/rdf4node/framework/components');
exports.repository = require('@icedeer/rdf4node/framework/repository');
exports.cache = require('@icedeer/rdf4node/framework/cache');
exports.registry = require('@icedeer/rdf4node/framework/registry');
exports.distLocker = require('@icedeer/rdf4node/framework/distributed-locker');
exports.XTask = require('@icedeer/rdf4node/framework/xtask');

// Export combined pubdefs
const pubdefs = require('../common/pubdefs');
exports.pubdefs = Object.assign({}, sysdefs, pubdefs);
