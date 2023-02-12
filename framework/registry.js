/**
 * Created by Eric on 2023/02/10
 */
const assert = require('assert');
const _MODULE_NAME = require('../include/sysdefs').eFrameworkModules.REGISTRY;
const {CommonObject} = require('../include/common');
const {winstonWrapper: {WinstonLogger}} = require('../libs');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);

const icp = require('./icp');

// The class
class Registry extends CommonObject {
    constructor(props) {
        super(props);
        //
        this._modules = {};
        //
        this.register = (name, moduleRef) => {
            assert(name !== undefined);
            assert(moduleRef !== null && moduleRef !== undefined);
            //
            if (this._modules[name] !== undefined) {
                logger.error(`module: ${name} already exists! overrided!!!`);
            }
            this._modules[name] = moduleRef;
        };

        this.getModule = (name) => {
            return this._modules[name];
        };

        this.dispose = (callback) => {

        };
    }
}

// Declaring module exports
module.exports = exports = new Registry({
    name: _MODULE_NAME
});
