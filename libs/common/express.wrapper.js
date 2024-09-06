/**
 * Created by Eric on 16/4/2.
 */
const path = require('path');
const appRoot = require('app-root-path');
const express = require('express');
// The project libs
const { eRequestAuthType, eModuleState } = require('../../include/sysdefs');
const { eDomainEvent } = require('../../include/events');
const { Endpoint, normalizePort } = require('../../include/endpoint');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE);
const tools = require('../../utils/tools');
const { RouteManager } = require('./router');

// Get prototype of HttpResponse
const responseWrapper = Object.getPrototypeOf(express.response);

// Attach customized response methods
responseWrapper.sendRsp = function (rc, msg, data) {
    let rsp = {
        code: rc || 500,
        message: msg
    };
    if (data !== undefined && data !== null) {
        rsp.data = data;
    }
    this.send(rsp);
};

responseWrapper.sendSuccess = function (data) {
    this.sendRsp(200, 'SUCCESS', data);
};

responseWrapper.sendIntSrvErr = function () {
    this.sendRsp(500, 'Internal server error!');
};


/**
 * @typedef RateLimitProps
 * @property { number } windowMs - The control period
 * @property { number } max - The limitation threshold value 
 * @property { number } expireTimeMs - The restriction duration
 */

/**
 * @typedef RateLimitStore
 * @property { 'mongo' | 'redis' } type - The database type. Default: 'mongo'
 * @property { string } confPath - The database configure path
 */

/**
 * @typedef HttpEndpointConfig
 * @property { string? } viewPath - The view components' root directory name. default: 'views'
 * @property { string? } viewEngin - The SSR engine. default: 'ejs'
 * @property { string? } routePath - The route modules' root directory name. Default: 'routes'
 * @property { number? } trustProxy - The number of proxies
 * @property { number? | string } port - The port value. Default: 3000
 * @property { string? } payloadLimit - The payloadLimit value. Default: '5mb'
 * @property { boolean? } enableRateLimit - Enable or disable rateLimit controll. default: false
 * @property { Object } rateLimit - The rateLimit configure wrapper
 * @property { RateLimitProps } rateLimit.options
 * @property { RateLimitStore } rateLimit.store
 * @
 */


// The http endpoint
class HttpEndpoint extends Endpoint {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        /**
         * @member
         */
        this._app = null;
        this._port = null;
        this._server = null;
        this._routeManager = new RouteManager({
            $name: `${this.$name}@ep`
        });
        this._state = eModuleState.CREATE;
    }
    /**
     * 
     * @param {HttpEndpointConfig} config 
     * @returns 
     */
    async init(config) {
        if (this._state !== eModuleState.CREATE) {
            logger.error(`${this.$name}: Already initialized!`);
            return null;
        }
        this._state = eModuleState.INIT
        // Load the dependency libs
        const http = require('http');
        const cookieParser = require('cookie-parser');
        const createError = require('http-errors');
        const router = express.Router();
        const MorganWrapper = require('../base/morgan.wrapper');
        const httpLogger = MorganWrapper(process.env.SRV_ROLE);
        /**
         * Create and initialize the express instance
         */
        this._app = express();
        if (config.trustProxy !== undefined) {
            try {
                let numberOfProxies = parseInt(config.trustProxy);
                this._app.set('trust proxy', numberOfProxies);
            } catch (ex) {
                logger.error(`!!! Set trust-proxy error! - ${ex.message}`);
            }
        }
        // Step 1: Setup view engine
        this._app.set('views', path.join(appRoot.path, config.viewPath || 'views'));
        this._app.set('view engine', config.engine || 'ejs');
        // Step 2: Setup mandatory middlewares
        this._app.use(httpLogger);
        this._app.use(express.json({ limit: config.payloadLimit || '50mb' }));
        this._app.use(express.urlencoded({ extended: false }));
        this._app.use(cookieParser());
        this._app.use(express.static(path.join(appRoot.path, config.staticPath || 'public')));
        if (config.enableRateLimit && config.rateLimit) {
            try {
                const { createRateLimit } = require('./ratelimit.wrapper');
                let limiter = await createRateLimit(config.rateLimit);
                this._app.use(limiter);
                logger.info('>>>>>> Rate limitation enabled. <<<<<<');
            } catch (err) {
                logger.error(`****** Setup limitation error! - ${err.message}`);
            }
        } else {
            logger.info('>>>>>> Rate limitation disabled. <<<<<<');
        }
        // Step 3: Setup cookie if configed
        const authConfig = config.authentication;
        if (authConfig && authConfig.type === eRequestAuthType.COOKIE) {
            try {
                const session = require('./session')(authConfig.store, authConfig.options);
                this._app.use(session);
            } catch (ex) {
                logger.error(`!!! Setup session error! - ${ex.message}`);
            }
        }
        // Step 4: Setup customer specified middlewares
        if (config.middlewares) {
            try {
                const result = {};
                let fullPath = path.join(appRoot.path, config.middlewares);
                const mws = require(fullPath);
                mws.forEach(mw => {
                    try {
                        this._app.use(mw.fn);
                        result[mw.name] = 'ok'
                    } catch (err) {
                        result[mw.name] = err.message;
                    }
                })
                logger.info(`>>> Load express middlewares: ${tools.inspect(result)}`);
            } catch (err) {
                logger.error(`*** Load middlewares from file: ${fullPath} error! - ${err.message}`)
            }
        }
        // Step 5: Setup routes
        try {
            this._routeManager.init(router, config);
            this._app.use('/', router);
        } catch (err) {
            logger.error(`*** Setup routes error! - ${err.message}`);
        }
        // The 404 and forware to error handler
        this._app.use(function (req, res, next) {
            next(createError(404));
        })
        this._app.use( (err, req, res, next) => {
            // set locals, only providing error in development
            logger.error(err, err.stack);
            res.locals.message = err.message;
            //
            if (this._app.get('env') === 'development') {
                res.locals.error = err;
            } else {
                res.locals.error = {};
            }
            // render the error page
            res.status(err.status || 500);
            res.render('error');
        });
        // Set port
        this._port = normalizePort(config.port || process.env.PORT || '3000');
        this._app.set('port', this._port);
        // Create HTTP server and associated WebSocket server
        this._server = http.createServer(this._app);
        this._server.on('error', (error) => {
            if (error.syscall !== 'listen') {
                throw error;
            }
            let bind = typeof this._port === 'string'
                ? 'Pipe ' + this._port
                : 'Port ' + this._port;

            // handle specific listen errors with friendly messages
            switch (error.code) {
                case 'EACCES':
                    logger.error(`!!! ${this.$name}[${this._state}]>> ${bind} requires elevated privileges.`);
                    this._state = eModuleState.OOS;
                    //
                    theApp.emit('app.exit', 1);
                    break;
                case 'EADDRINUSE':
                    logger.error(`!!! ${this.$name}[${this._state}]>> ${bind} is already in use.`);
                    this._state = eModuleState.OOS;
                    //
                    theApp.emit('app.exit', 1);
                    break;
                default:
                    throw error;
            }
        });
        this._server.on('listening', () => {
            let addr = this._server.address();
            let bind = typeof addr === 'string'
                ? 'pipe ' + addr
                : 'port ' + addr.port;
            logger.info('Listening on ' + bind);
            //
            this._state = eModuleState.ACTIVE;
        });
        // Create combined wss if configed
        if (config.wss) { 
            try {
                this.emit(eDomainEvent.EP_HTTP_EXT_WSS, config.wss, this._server);
            } catch (err) {
                logger.error(`*** ${this.$name}[${this._state}]>> Init embedded wss error! - ${err.message}.`);
            }
        }
        // TODO: additional initialiazing codes go here ...
        // Update state
        this._state = eModuleState.READY;
        return true;
    }

    async start(options) {
        if (this._state !== eModuleState.READY) {
            logger.error(`${this.$name}: endpoint is not ready!`);
            return false;
        }
        this._state = eModuleState.START_PENDING;
        // Start the server
        try {
            this._server.listen(this._port);
            return 'ok';
        } catch (ex) {
            this._state = eModuleState.OOS;
            this.lastError = ex.message;
            logger.error(`!!! ${this.$name}: Start http@endpoint failure! - ${ex.message}`);
            return ex.message;
        }
    }
    getInstance() {
        return this._server;
    }
    async dispose() {
        if (this._server) {
            this._server.close();
        }
        return `${this.$name} closed.`;
    }
}

//
module.exports = exports = {
    express, HttpEndpoint
}