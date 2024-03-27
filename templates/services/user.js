/**
 * Created by Eric on 2023/02/16
 */
const {
    pubdefs, tools, eRetCodes,
    winstonWrapper: {WinstonLogger},
    components: {ServiceBase}
} = require('../applications');
const logger = WinstonLogger(process.env.SRV_ROLE);
const _MODULE_NAME_ = pubdefs.eAppModules.UserSvc;
const appEvents = require('../common/app-events');

// Implementing event handlers
function _onUserCreated (evt, callback) {
    logger.info(`On [user.create]: do something...`);
    return callback();
}

const _eventHandlers = {};
_eventHandlers[appEvents.USER_CREATE] = _onUserCreated;

// The module exports
module.exports = exports = new ServiceBase({
    name: _MODULE_NAME_,
    eventHandlers: _eventHandlers
});