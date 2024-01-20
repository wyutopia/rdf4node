/**
 * Created by Eric on 2023/02/15
 * Updated by Eric on 2024/01/20
 */
const util = require('util');
const http = require('http');
//
const appRoot = require('app-root-path');
const cookieParser = require('cookie-parser');
const { EventModule } = require('../include/events');
const _MODULE_NAME = require('../include/sysdefs').eFrameworkModules.ENDPOINT;
// The endpoint kinds
const express = require('../libs/base/express.wrapper');
const MorganWrapper = require('../libs/base/morgan.wrapper');
const httpLogger = MorganWrapper(process.env.SRV_ROLE);
const routeHelper = require('./router');

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

    return false;
}

// The class
class Endpoint extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
    }
    dispose(callback) {
        return process.nextTick(callback);
    }
    disposeAsync = util.promisify(this.dispose)
}

class HttpEndpoint extends Endpoint {
    constructor(name) {
        super(name);
        //
        this._app = express();
    }
    init(options) {
        // Step 1: Setup view engine
        this._app.set('views', options.viewPath || path.join(appRoot.path, 'views'));
        this._app.set('view engine', options.engine || 'ejs');
        // Step 2: Setup middlewares
        this._app.use(httpLogger);
        this._app.use(express.json({ limit: options.payloadLimit || '50mb' }));
        this._app.use(express.urlencoded({ extended: false }));
        this._app.use(cookieParser());
        this._app.use(express.static(path.join(__dirname, 'public')));
        // The rateLimit
        if (config.rateLimit) {
            logger.info('>>>>>> TODO: Enable rate-limit... <<<<<<');
            //app.use(rateLimiter);
            //logger.info('>>>>>> Rate limitation enabled. <<<<<<');
        } else {
            logger.info('>>>>>> Rate limitation disabled. <<<<<<');
        }
        // Step 3: Setup routes
        const router = require('express').Router();
        routeHelper.initRouter(router, options.routePath || path.join(appRoot.path, 'routes'));
        this._app.use('/', router);
        // The 404 and forware to error handler
        this._app.use(function (req, res, next) {
            next(createError(404));
        })
        this._app.use(function (err, req, res, next) {
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
        //
        const port = normalizePort();

    }
    start(options) {
        const port = normalizePort(options.port || process.env.PORT || '3000');
        this._app.set('port', port);
        this._server = http.createServer(this._app);
        this._server.listen(port);
        this._server.on('error', () => {
            if (error.syscall !== 'listen') {
                throw error;
            }
    
            let bind = typeof port === 'string'
                ? 'Pipe ' + port
                : 'Port ' + port;
    
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
        })
    }
    getInstance() {
        return this._app;
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
        const arr = tools.isTypeofArray(config)? config : [config];
        arr.forEach(item => {
            const ep = new HttpEndpoint(item.name);
            this._endpoints[item.name] = ep;
            //
            ep.init(item.options);
            ep.start();
        })
    }
    get(name) {
        const ep = this._endpoints[name];
        return ep? ep.getInstance() : ep;
    }
    start(name) {

    }
    stop(name) {

    }
    startAll() {

    }
    dispose(callback) {
        return process.nextTick(callback);
    }
    disposeAsync = util.promisify(this.dispose);
}

// Declaring module exports
module.exports = exports = {
    EndpointFactory
};