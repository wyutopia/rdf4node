/**
 * Created by Eric on 2024/07/13
 */
const { EventModule } = require('./events');

function normalizePort(val) {
    let port = parseInt(val, 10);
    if (isNaN(port)) {
        // named pipe
        return val;
    }
    if (port >= 0) {
        // port number
        return port;
    }
    return 3000;
}

// The class
class Endpoint extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        // Define the public member variables
        this._server = null;
        this._config = null;
        this._state = eModuleState.INIT;
    }
    async dispose() {
        return 'ok';
    }
}

//
module.exports = exports = {
    Endpoint, normalizePort
}
