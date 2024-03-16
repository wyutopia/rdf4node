/**
 * Created by Eric on 2023/02/10
 */
const assert = require('assert');
const util = require('util');
const tools = require('../utils/tools');
const _MODULE_NAME = require('../include/sysdefs').eFrameworkModules.REGISTRY;
const { CommonObject } = require('../include/base');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);

// The class
class Registry extends CommonObject {
    constructor(appCtx) {
        super({ $name: _MODULE_NAME });
        //
        this.ebus = appCtx.ebus;
        this._modules = {};
    }
    init(options) {

    }
    //
    register(moduleRef) {
        assert(moduleRef !== null && moduleRef !== undefined);
        //
        let name = moduleRef.$name || tools.uuidv4();
        if (this._modules[name] !== undefined) {
            logger.error(`!!! module: ${name} already exists! overrided.`);
        }
        this._modules[name] = moduleRef;
        return name;
    }

    getModule(name) {
        return this._modules[name];
    };

    dispose(callback) {
        return process.nextTick(callback);
    }
    disposeAsync = util.promisify(this.dispose)
}

// Declaring module exports
module.exports = exports = {
    Registry
};
