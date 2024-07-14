/**
 * Created by Eric on 2023/02/15
 * Updated by Eric on 2024/01/20
 */
const async = require('async');
const appRoot = require('app-root-path');
const util = require('util');
const path = require('path');
//
const { EventModule } = require('../include/events');
const { eFrameworkModules, eModuleState, eRequestAuthType } = require('../include/sysdefs');
const _MODULE_NAME = eFrameworkModules.ENDPOINT;
const tools = require('../utils/tools');
// The endpoint kinds
const { _DS_DEFAULT_ } = require('./repository');

//const gRpc = require('../libs/common/grpc.wrapper');
//const net = require('../libs/common/net.wrapper');

const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);


class WebSockEndpoint extends Endpoint {
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
        this._port = normalizePort(options.port || process.env.WS_PORT || '18080');
        this._wss = null;
        this._heartbeat = null;
        this._clientManager = null;
        // Update state
        this._state = eModuleState.READY;
    }
    async start() {
        if (this._state !== eModuleState.READY) {
            logger.error(`${this.$name}: endpoint is not ready!`);
            return this._state;
        }
        try {
            this._state = eModuleState.START_PENDING;
            //
            const { WSRouter, WebSocket} = require('../libs/common/ws.wrapper');
            // 
            this._router = new WSRouter(this._appCtx, {$name: '_wsrt_'});
            let paths = await this._router.init(this._config.routePath || 'wss');
            logger.info(`>>> Supported pathnames: ${tools.inspect(paths)}`);
            // 
            const WebSocketServer = WebSocket.WebSocketServer;
            this._wss = new WebSocketServer({
                port: this._port
            })
            this._wss.on('connection', async (ws, req) => {
                try {
                    const xff = req.headers['x-forwarded-for'];
                    const clientIp = xff? xff.split(',')[0].trim() : req.socket.remoteAddress;
                    //
                    let url = new URL(`http://localhost${req.url}`);
                    const r = await this._router.onConnection(ws, {
                        pathname: url.pathname,
                        searchParams: url.searchParams,
                        clientIp
                    })
                } catch(err) {
                    logger.error(`*** On connection error! - ${err.message}`);
                    ws.close();
                }
            }).on('error', err => {
                logger.error(`${this.$name} >> wss error! - ${err.message}`);
                this._state = eModuleState.OSS;
            }).on('close', () => {
                logger.error(`${this.$name} >> wss closed!`);
                this._wss = null;
                if (this._heartbeat) {
                    clearInterval(this._heartbeat);
                    this._heartbeat = null;
                }
                this._state = eModuleState.READY;
            });
            //
            this._state = eModuleState.ACTIVE;
            logger.info(`${this.$name}: wss listening on port ${this._port}`);
        } catch(ex) {
            this._state = eModuleState.OOS;
            this.lastError = ex.message;
            logger.error(`!!! ${this.$name}: Start ws@endpoint failure! - ${ex.message}`);
            return ex.message;
        }
        return this._state;
    }
    async dispose() {
        if (this._wss) {
            this._wss.close();
        }
        return true;
    }
}
class gRpcEndpoint extends Endpoint {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
    }
}

class TcpEndpoint extends Endpoint {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
    }
}

class UdpEndpoint extends Endpoint {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
    }
}

const eProtocol = {
    HTTP       : 'http',
    WebSock    : 'ws',
    gRPC       : 'gRpc',
    TCP        : 'tcp',
    UDP        : 'udp'
};
const _epConstructor = {};
_epConstructor[eProtocol.HTTP] = HttpEndpoint;
_epConstructor[eProtocol.WebSock] = WebSockEndpoint;
_epConstructor[eProtocol.gRPC] = gRpcEndpoint;
_epConstructor[eProtocol.TCP] = TcpEndpoint;
_epConstructor[eProtocol.UDP] = UdpEndpoint;

class EndpointFactory extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this._endpoints = {};
    }
    /**
     * 
     * @param { 'http'|'ws|'grpc'|'tcp'|'udp' } protocol - The endpoint protocol.
     * @param { string } name - The endpoint name
     * @param { Object } options - The endpoint options
     * @param { string? } options.viewPath - The view template path
     * @param { string? } options.engine - The view template engine
     * @param { string? } options.payloadLimit - The http payload limitation
     * @param { Object? } options.rateLimit - The rateLimit options
     * @param { string? } options.routePath - The route root path
     */
    async init(config) {
        const arr = tools.isTypeOfArray(config) ? config : [config];
        await async.each(arr, async item => {
            try {
                const EpModule = _epConstructor[item.protocol];
                const ep = new EpModule(this._appCtx, { 
                    $name: `${item.name}@${this.$name}`,
                    managed: true
                });
                this._endpoints[item.name] = ep;
                //
                ep.init(item.options);
            } catch(ex) {
                logger.error(`!!! [${this.$name}]: Create and init ${item.protocol} endpoint#${item.name} error! - ${ex.message}`);
            }
        })
        return 'ok';
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
            return {
                endpoints: results
            }
        } catch (ex) {
            logger.error(`Dispose error! - ${tools.inspect(ex)}`);
            return ex;
        }
    }
}

// Declaring module exports
module.exports = exports = {
    EndpointFactory, eProtocol
};