/**
 * Created by Eric on 2022/05/11
 * Updated by Eric on 2024/01/18
 */
const sysdefs = require('@icedeer/rdf4node/include/sysdefs');

sysdefs.eResourceScope = {
    Public     : 'public',
    System     : 'system',
    User       : 'user'
};

sysdefs.customDefinitions = {
    one: 1,
    two: 2
};

// Add custom definitions here ...
sysdefs.eAppModules = {
    /////////////////////////////
    // Controllers
    UserCtl         : 'UsrCtl',
    // TODO: Other controllers

    /////////////////////////////
    // Services
    UserSvc         : 'UsrSvc',
    // TODO: Other services
    
    /////////////////////////////
    // Daemons
    UserDaemon      : 'userd',
    // TODO: Other services};
}
//
module.exports = exports = sysdefs;