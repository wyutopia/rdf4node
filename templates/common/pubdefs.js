/**
 * Created by Eric on 2022/05/11
 */
let sysdefs = require('@icedeer/rdf4node/include/sysdefs');

sysdefs.customDefinitions = {
    one: 1,
    two: 2
};

// Add custom definitions here ...
const eAppModules = {
    /////////////////////////////
    // Controllers
    UserCtl         : 'UsrCtl',
    // TODO: Other controllers

    /////////////////////////////
    // Services
    UserSvc         : 'UsrSvc',
    // TODO: Other services
};
sysdefs.eAppModules = eAppModules;

module.exports = exports = sysdefs;