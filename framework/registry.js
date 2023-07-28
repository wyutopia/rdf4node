/**
 * Created by Eric on 2023/02/10
 */
const assert = require('assert');
const _MODULE_NAME = require('../include/sysdefs').eFrameworkModules.REGISTRY;
const {CommonObject} = require('../include/base');
const {winstonWrapper: {WinstonLogger}} = require('../libs');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);

// The class
class Registry extends CommonObject {
    constructor(props) {
        super(props);
        //
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

// Declaring module exports
module.exports = exports = new Registry({
    $name: _MODULE_NAME
});
