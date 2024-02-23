/**
 * Created by Eric on 2024/02/02
 */
const session = require('express-session');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE);
//
const sysdefs = require('../include/sysdefs');
const config = require('../include/config');
const tools = require('../utils/tools');

const _defaultOpt = {
    secret: 'a9kb666',
    store: null, //sessionStore('a9kbsess')
    cookie: {
        maxAge: 2 * 24 * 60 * 60 * 1000  // 2 days
    },
    rolling: true,
    resave: true,
    saveUninitialized: true
}

function _createMongoStore(name, options) {
    const MongoStore = require('connect-mongodb-session')(session);
    return new MongoStore({
        uri: tools.packMongoUri(options),
        collection: name,
        connectionOptions: {
            useUnifiedTopology: true,
            useNewUrlParser: true
        }
    })
}

function _createRedisStore(name, options) {
    const RedisStore = require('connect-redis')
    const { createClient } = require('redis');
    // 1. Create redis client
    const redisClient = createClient(options);
    redisClient.connect().catch(ex => {

    })
    // 2. Create store and return
    return new RedisStore({
        client: redisClient,
        prefix: name
    })
}

function _createSessionStore(options) {
    const dbConf = tools.safeGetJsonValue(config, options.confPath);
    if (!dbConf) {
        return null;
    }
    const name = options.name || 'sess';
    if (options.type === sysdefs.eDbType.MONGO) {
        return _createMongoStore(name, dbConf);
    }
    if (options.type === sysdefs.eCacheEngine.Redis) {
        return _createRedisStore(name, dbConf);
    }
    return null;
}

function _createSession(store, opt) {
    // 1. Create session store
    const sessionStore = _createSessionStore(store);
    // 2. Pack session options
    const options = Object.assign({}, _defaultOpt, opt);
    logger.info(`>>> Create session with config: ${tools.inspect(options)}`);
    if (sessionStore) {
        options.store = sessionStore;
    } else if (process.env.NODE_ENV === 'production') {
        logger.warn('~In-memory store is not recommended for production.');
    }
    // 3. Create session middleware and return
    return session(options);
}

module.exports = exports = _createSession;