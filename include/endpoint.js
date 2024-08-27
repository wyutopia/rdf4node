/**
 * Created by Eric on 2024/07/13
 */
const { eModuleState } = require('./sysdefs');
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

// The endpoint super class
class Endpoint extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        // Define the public member variables
        this._server = null;
        this._config = null;
        this._state = eModuleState.INIT;
    }
    /**
     * Init with configuration
     * @param { Object } config 
     */
    async init(config) {
        console.warn('### Override this to perform actual initializing work!!!');
        return true;
    }
    /**
     * Start with options
     * @param { Object } options 
     */
    async start(options) {
        console.warn('### Override this to perform actual startup codes!!!');
        return true;
    }
    async dispose() {
        return 'ok';
    }
}

const eProtocol = {
    HTTP       : 'http',
    WebSock    : 'ws',
    gRPC       : 'gRpc',
    TCP        : 'tcp',
    UDP        : 'udp'
};

//
module.exports = exports = {
    Endpoint, normalizePort, eProtocol
}
