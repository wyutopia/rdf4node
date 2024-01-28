/**
 * Created by Eric on 2022/09/20
 */
 const {
    pubdefs, tools, 
    WinstonLogger,
    components: { EntityController }
} = require('../app');
const logger = WinstonLogger(process.env.SRV_ROLE || 'usr');
const _MODULE_NAME = pubdefs.eAppModules.UserCtl;

// Import model 
const { modelName, modelSchema, modelRefs, ctlSpec } = require('../models/user');

// Declaring the class 
class UserController extends EntityController {
    constructor(props) {
        super(props);
    }
}

// Declaring module exports
module.exports = exports = new UserController({
    $name: _MODULE_NAME,
    //
    modelName: modelName,
    modelSchema: modelSchema,
    modelRefs: modelRefs,
    //
    ctlSpec: ctlSpec
});