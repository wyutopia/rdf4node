/**
 * Created by Eric on 2023/02/15
 */
const assert = require('assert');
const { EventModule } = require('../include/events');
const _MODULE_NAME = require('../include/sysdefs').eFrameworkModules.ENDPOINT;
const {WinstonLogger} = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);

// The class
class Endpoint extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, {$name: _MODULE_NAME});
        //
        this.ebus = appCtx.ebus;
        this._modules = {};
        //
        this.register = (moduleRef) => {
            assert(moduleRef !== null && moduleRef !== undefined);
            //
            let name = moduleRef.$name || tools.uuidv4();
            if (this._modules[name] !== undefined) {
                logger.error(`module: ${name} already exists! overrided!!!`);
            }
            this._modules[name] = moduleRef;
            return name;
        };

        this.getModule = (name) => {
            return this._modules[name];
        };

        this.dispose = (callback) => {
            return callback()
        };
    }
}

class HttpEndpoint extends Endpoint {

}

class gRPCEndpoint extends Endpoint {

}

class TcpEndPoint extends Endpoint {

}

class EndpointFactory extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, {$name: 'EpFactory'}),
        //
        this._endpoints = {};
    }
    create(name, type, options) {

    }
    destory(name) {

    }
}

// Declaring module exports
module.exports = exports = {
    EndpointFactory
};