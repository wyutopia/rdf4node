/**
 * Created by Eric on 2022/09/20
 */
 const {
    tools, 
    winstonWrapper: {WinstonLogger},
    components: { EntityController }
} = require('@icedeer/rdf4node');
const logger = WinstonLogger(process.env.SRV_ROLE || 'usr');
const pubdefs = require('../common/pubdefs');
const _MODULE_NAME_ = pubdefs.eAppModules.UserCtl;

// Import model 
const {modelName, modelSchema, ctlSpec} = require('../models/user');

// Declaring the class 
class UserController extends EntityController {
    constructor(props) {
        super(props);
    }
}

// Declaring module exports
module.exports = exports = new UserController({
    name: _MODULE_NAME_,
    //
    modelName: modelName,
    modelSchema: modelSchema,
    ctlSpec: ctlSpec
});