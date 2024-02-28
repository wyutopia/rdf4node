/**
 * Created by Eric on 2023/02/15
 * Updated by Eric on 2024/01/20
 */
const appRoot = require('app-root-path');
const http = require('http');
const util = require('util');
const path = require('path');
//
const cookieParser = require('cookie-parser');
const createError = require('http-errors');
const { EventModule } = require('../include/events');
const { eFrameworkModules, eModuleState, eRequestAuthType } = require('../include/sysdefs');
const _MODULE_NAME = eFrameworkModules.ENDPOINT;
const tools = require('../utils/tools');
// The endpoint kinds
const express = require('../libs/base/express.wrapper');
const router = express.Router();
const { RateLimit } = require('../libs/base/ratelimit.wrapper');
const MorganWrapper = require('../libs/base/morgan.wrapper');
const httpLogger = MorganWrapper(process.env.SRV_ROLE);
const routeHelper = require('./router');
const { _DS_DEFAULT_ } = require('./repository');

//const gRpc = require('../libs/common/grpc.wrapper');
//const net = require('../libs/common/net.wrapper');

const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);

function normalizePort(val) {
    let port = parseInt(val, 10);
    if (isNaN(port)) {
        // named pipe
        return val;
    }
    if (port >= 0) {
        // port number
        return port;
    }
    return 3000;
}

// The class
class Endpoint extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        // Define the public member variables
        this._server = null;
        this._config = null;
        this._state = eModuleState.INIT;
    }
    async dispose() {
        return 'ok';
    }
}

class HttpEndpoint extends Endpoint {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
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
        // Step 2: Setup middlewares
        app.use(httpLogger);
        app.use(express.json({ limit: this._config.payloadLimit || '50mb' }));
        app.use(express.urlencoded({ extended: false }));
        app.use(cookieParser());
        app.use(express.static(this._config.staticPath || path.join(appRoot.path, 'public')));
        // Step 3: Set rateLimit on demand
        if (this._config.enableRateLimit && this._config.rateLimit) {
            app.use(RateLimit(this._config.rateLimit));
            logger.info('>>>>>> Rate limitation enabled. <<<<<<');
        } else {
            logger.info('>>>>>> Rate limitation disabled. <<<<<<');
        }
        // Step 4: Setup middleware session while authType is cookie
        const authConfig = this._config.authentication;
        if (authConfig && authConfig.type === eRequestAuthType.COOKIE) {
            try {
                const session = require('./session')(authConfig.store, authConfig.options);
                app.use(session);
            } catch (ex) {
                logger.error(`!!! Setup session error! - ${ex.message}`);
            }
        }
        // Step 5: Setup dataSource middleware
        const dsName = process.env.DS_DEFAULT || _DS_DEFAULT_;
        app.use((req, res, next) => {
            req.dataSource = {
                dsName: dsName
            };
            if (req.headers.datasource === undefined) {
                req.headers.datasource = dsName;
            }
            return next();
        })
        // Step 6: Setup routes
        routeHelper.initRouter(router, this._config);
        app.use('/', router);
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
        this._server.listen(this._port);
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
        });
        this._state = eModuleState.ACTIVE;
        return true;
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

class gRPCEndpoint extends Endpoint {

}

class TcpEndPoint extends Endpoint {

}

class EndpointFactory extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this._endpoints = {};
    }
    /**
     * 
     * @param { 'http'|'grpc'|'tcp'|'udp' } protocol - The endpoint protocol.
     * @param { string } name - The endpoint name
     * @param { Object } options - The endpoint options
     * @param { string? } options.viewPath - The view template path
     * @param { string? } options.engine - The view template engine
     * @param { string? } options.payloadLimit - The http payload limitation
     * @param { Object? } options.rateLimit - The rateLimit options
     * @param { string? } options.routePath - The route root path
     */
    init(config) {
        const arr = tools.isTypeOfArray(config) ? config : [config];
        arr.forEach(item => {
            const ep = new HttpEndpoint(this._appCtx, { 
                $name: `ep-${item.name}`,
                managed: true
            });
            this._endpoints[item.name] = ep;
            //
            ep.init(item.options);
        })
    }
    get(name) {
        const ep = this._endpoints[name];
        return ep ? ep.getInstance() : ep;
    }
    start(name) {

    }
    stop(name) {

    }
    async startAll() {
        const promises = [];
        Object.values(this._endpoints).forEach(ep => {
            promises.push(ep.start());
        })
        return await Promise.all(promises);
    }
    async dispose() {
        logger.info(`Dispose all endpoints ...`);
        const promises = [];
        Object.keys(this._endpoints).forEach(key => {
            const ep = this._endpoints[key];
            if (typeof ep.dispose === 'function') {
                promises.push(ep.dispose());
            }
        })
        try {
            const results = await Promise.all(promises);
            logger.info(`Dispose results: ${tools.inspect(results)}`);
            return results;
        } catch (ex) {
            logger.error(`Dispose error! - ${tools.inspect(ex)}`);
            return ex;
        }
    }
}

// Declaring module exports
module.exports = exports = {
    EndpointFactory
};