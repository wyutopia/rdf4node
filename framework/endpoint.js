/**
 * Created by Eric on 2023/02/15
 * Updated by Eric on 2024/01/20
 */
const async = require('async');
//
const { EventModule } = require('../include/events');
const { eFrameworkModules, eModuleState } = require('../include/sysdefs');
const tools = require('../utils/tools');
const _MODULE_NAME = eFrameworkModules.ENDPOINT;
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
// The endpoint kinds
const { eProtocol } = require('../include/endpoint');

// Define the endpoint constructor map
const _epConstructor = {};
function _getEpModule(proto) {
    if (!_epConstructor[proto]) {
        if (proto === eProtocol.HTTP) {
            const { HttpEndpoint } = require('../libs/common/express.wrapper');
            _epConstructor[proto] = HttpEndpoint;
        } else if (proto === eProtocol.WebSock) {
            const { WebSockEndpoint } = require('../libs/common/ws.wrapper');
            _epConstructor[eProtocol.WebSock] = WebSockEndpoint;
        } else if (proto === eProtocol.gRPC) {
            const { gRpcEndpoint } = require('../libs/common/grpc.wrapper');
            _epConstructor[eProtocol.gRPC] = gRpcEndpoint;
        } else if (proto === eProtocol.TCP || proto === eProtocol.UDP) {
            const { TcpEndpoint, UdpEndpoint } = require('../libs/common/net.wrapper');
            _epConstructor[proto] = proto === eProtocol.TCP? TcpEndpoint : UdpEndpoint;
        }
    }
    return _epConstructor[proto];
}

// The Endpoint factory class
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
                const EpModule = _getEpModule(item.protocol);
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