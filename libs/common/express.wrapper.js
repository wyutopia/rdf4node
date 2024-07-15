/**
 * Created by Eric on 16/4/2.
 */
const path = require('path');
const appRoot = require('app-root-path');
const { eRequestAuthType, eModuleState } = require('../../include/sysdefs');
const express = require('express');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE);
const tools = require('../../utils/tools');

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

const { Endpoint, normalizePort } = require('../../include/endpoint');

// The http endpoint
class HttpEndpoint extends Endpoint {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this._routeManager = null;
    }
    init(options) {
        if (this._state !== eModuleState.INIT) {
            logger.error(`${this.$name}: Already initialized!`);
            return null;
        }
        this._config = options;
        this._port = normalizePort(options.port || process.env.PORT || '3000');
        // Update state
        this._state = eModuleState.READY;
    }
    async start() {
        if (this._state !== eModuleState.READY) {
            logger.error(`${this.$name}: endpoint is not ready!`);
            return false;
        }
        try {
            this._state = eModuleState.START_PENDING;
            // Dynamicly load http and express libs
            const http = require('http');
            const cookieParser = require('cookie-parser');
            const createError = require('http-errors');
            const router = express.Router();
            const MorganWrapper = require('../base/morgan.wrapper');
            const httpLogger = MorganWrapper(process.env.SRV_ROLE);
            //
            const app = express();
            if (this._config.trustProxy !== undefined) {
                try {
                    let numberOfProxies = parseInt(this._config.trustProxy);
                    app.set('trust proxy', numberOfProxies);
                } catch (ex) {
                    logger.error(`!!! Set trust-proxy error! - ${ex.message}`);
                }
            }
            // Step 1: Setup view engine
            app.set('views', this._config.viewPath || path.join(appRoot.path, 'views'));
            app.set('view engine', this._config.engine || 'ejs');
            // Step 2: Setup mandatory middlewares
            app.use(httpLogger);
            app.use(express.json({ limit: this._config.payloadLimit || '50mb' }));
            app.use(express.urlencoded({ extended: false }));
            app.use(cookieParser());
            app.use(express.static(this._config.staticPath || path.join(appRoot.path, 'public')));
            if (this._config.enableRateLimit && this._config.rateLimit) {
                try {
                    const { createRateLimit } = require('./ratelimit.wrapper');
                    let limiter = await createRateLimit(this._config.rateLimit);
                    app.use(limiter);
                    logger.info('>>>>>> Rate limitation enabled. <<<<<<');
                } catch(err) {
                    logger.error(`****** Setup limitation error! - ${err.message}`);
                }
            } else {
                logger.info('>>>>>> Rate limitation disabled. <<<<<<');
            }
            // Step 3: Setup cookie if configed
            const authConfig = this._config.authentication;
            if (authConfig && authConfig.type === eRequestAuthType.COOKIE) {
                try {
                    const session = require('./session')(authConfig.store, authConfig.options);
                    app.use(session);
                } catch (ex) {
                    logger.error(`!!! Setup session error! - ${ex.message}`);
                }
            }
            // Step 4: Setup customer specified middlewares
            if (this._config.middlewares) {
                let pathName = this._config.middlewares.path || 'endpoints';
                let fileName = this._config.middlewares.file || 'middlewares.express.js';
                try {
                    const result = {};
                    let fullPath = path.join(appRoot.path, pathName, fileName);
                    const mws = require(fullPath);
                    mws.forEach(mw => {
                        try {
                            app.use(mw.fn);
                            result[mw.name] = 'ok'
                        } catch(err) {
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
                const { RouteManager } = require('./router');
                this._routeManager = new RouteManager({
                    $name: `${this.$name}@ep`
                });
                this._routeManager.init(router, this._config);
                app.use('/', router);    
            } catch(err) {
                logger.error(`*** Setup routes error! - ${err.message}`);
            }
            // The 404 and forware to error handler
            app.use(function (req, res, next) {
                next(createError(404));
            })
            app.use(function (err, req, res, next) {
                // set locals, only providing error in development
                logger.error(err, err.stack);
                res.locals.message = err.message;
                //
                if (req.app.get('env') === 'development') {
                    res.locals.error = err;
                } else {
                    res.locals.error = {};
                }
                // render the error page
                res.status(err.status || 500);
                res.render('error');
            });
            app.set('port', this._port);
            this._server = http.createServer(app);
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
                        console.error(bind + ' requires elevated privileges');
                        //
                        theApp.emit('app.exit', 1);
                        //process.exit(1);
                        break;
                    case 'EADDRINUSE':
                        console.error(bind + ' is already in use');
                        theApp.emit('app.exit', 1);
                        //process.exit(1);
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
            return `${this.$name} closed`;
        }
        return 0;
    }
}

//
module.exports = exports = {
    express, HttpEndpoint
}