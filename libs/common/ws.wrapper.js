/**
 * Created by Eric on 2024/06/20
 */
const appRoot = require('app-root-path');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.WebSocketServer;
//
const sysdefs = require('../../include/sysdefs');
const eRetCodes = require('../../include/retcodes');
const { EventObject, EventModule } = require('../../include/events');
const { Endpoint } = require('../../include/endpoint');
//
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'wss');
const tools = require('../../utils/tools');

const eOrigin = {
    INBOUND     : 0,
    OUTBOUND    : 1
};

function _invokeConnect() {
    try {
        if (this._origin === eOrigin.OUTBOUND) {
            this._ws = new WebSocket(this._url, {
                perMessageDeflate: false
            })
        }
        this._ws.on('error', err => {
            logger.error(`${this.$name}[${this._state}]>> ws error! - ${tools.inspect(err)}`);
            this._lastError = err;
            try {
                this.emit('client-error', this.$id, err);
            } catch(err) {
                logger.error(`${this.$name}[${this._state}]>> emit client-error error! - ${err.message}`);
            }
        })
        this._ws.on('open', () => {
            this._state = sysdefs.eClientState.Conn;
            // Start heartbeat if enabled
            if (this._enableHeartbeat) {
                this._heartbeat = setInterval(() => {
                    if (this._state === sysdefs.eClientState.Conn) {
                        this._ws.ping(0x66);
                    }
                }, this._intervalMs);
            }
            logger.info(`${this.$name}[${this._state}]>> connection established (hb: ${this._intervalMs}ms). waiting for data...`);
            //
            try {
                this.emit('client-open', this.$id);
            } catch(err) {
                logger.error(`${this.$name}[${this._state}]>> emit client-open error! - ${err.message}`);
            }
        })
        this._ws.on('message', (data, isBinary) => {
            try {
                this.emit('client-message', this.$id, data, isBinary);
            } catch(err) {
                logger.error(`${this.$name}[${this._state}]>> emit client-message error! - ${err.message}`);
            }
        })        
        this._ws.on('close', () => {
            this.emit('client-close', this.$id);
            if (this._reconnect) {
                logger.info(`${this.$name}[${this._state}]>> disconnected. re-connecting after ${this._retryDelayMs}ms ...`);
                setTimeout(_invokeConnect.bind(this), this._retryDelayMs);
            }
        })
    } catch(err) {
        return true;
    }
}

// The ws client wrapper object
class WebSocketClient extends EventObject {
    constructor(props) {
        super(props);
        //
        this._ws = props.ws || null;
        this._origin = props.origin || eOrigin.OUTBOUND;
        this._url = props.url || '';
        //
        this._reconnect = props.reconnect !== undefined? props.reconnect : true; 
        this._retryDelayMs = props.retryDelayMs || 2000;
        //
        this._enableHeartbeat = props.enableHeartbeat !== undefined? props.enableHeartbeat : true;
        this._intervalMs = props.intervalMs || 5000;
        this._heartbeat = null;
        //
        this._lastError = null;
        this._state = sysdefs.eClientState.Init;
    }
    /**
     * 
     * @param { Object } options - The 
     */
    async start(options) {
        if (this._state !== sysdefs.eClientState.Init) {
            logger.error(`${this.$name} already started.`);
            return false;
        }
        await _invokeConnect.call(this);
        return true;
    }

    async dispose() {
        let result = {};
        try {
            this._ws.close();
            result[this.$id] = 'closed';    
        } catch(ex) {
            result[this.$id] = ex.message;
        }
        return result;
    }
}

async function _doValidate(searchParams) {
    let args = {};
    let keys = Object.keys(this._validators);
    let err = null;
    let i = 0;
    while(i < keys.length && !err) {
        let key = keys[i++];
        //
        let val = this._validators[key];
        let arg = searchParams.get(key);
        //
        if (arg === undefined && val.required) {
            err = {
                code: eRetCodes.BAD_REQUEST,
                message: `${key} is required!`
            }
            break;
        }
        args[key] = arg;
    }
    if (err) {
        return Promise.reject(err);
    }
    return args;
}

function _genClientId() {
    return ++this._id;
}

// The WebSocket ConnectionManager class
class ConnectionManager extends EventObject {
    constructor(props) {
        super(props);
        //
        this._id = 0;
        this._validators = props.validators || {};
        this._connections = {};
        //
        this.realCreate = async (ws, args) => {
            return Promise.reject({
                code: 404,
                message: `+++ Need override to take effect! +++`
            })
        }
        //
        this._state = sysdefs.eModuleState.ACTIVE;
    }
    isActive() {
        return this._state === sysdefs.eModuleState.ACTIVE;
    }
    async createConnection(ws, searchParams, clientIp) {
        //TODO: check clientIp
        const args = await _doValidate.call(this, searchParams);
        return await this.realCreate(ws, args);
    }
    async dispose() {
        logger.info(`${this.$name} >> Close all connections...`);
        let promises = [];
        Object.keys(this._connections).forEach( key => {
            let conn = this._connections[key];
            if (typeof conn.dispose === 'function') {
                promises.push(conn.dispose());
            }
        })
        let result = {};
        result[this.$name] = promises.length === 0? 'ignored' : await Promise.all(promises);
        return result;
    }
}

const _reSysFile = new RegExp(/^\./)

// The WebSocketRouter class
class WSRouter extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this._routes = {};
        this.setState(sysdefs.eModuleState.INIT);
    }
    /**
     * 
     * @param { string } pathName
     * @param { Object } options 
     */
    async init(pathName, options) {
        if (this.$state !== sysdefs.eModuleState.INIT) {
            return logger.warn(`*** Already initialized.`);
        }
        let loaded = [];
        let currentDir = path.join(appRoot.path, pathName);
        logger.info(`${this.$name} >> scan directory: ${currentDir}`);
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        entries.forEach(dirent => {
            if (dirent.isDirectory() || _reSysFile.test(dirent.name)) { // Ignore sub-dirs and system files
                return null;
            }
            let filePath = path.join(currentDir, dirent.name);
            try {
                let m = require(filePath);
                this._routes[m.pathname] = m.handler;
                //
                loaded.push(m.pathname);
            } catch(ex) {
                logger.error(`*** Load ${filePath} error! - ${ex.message}`);
            }
        })
        this.setState(sysdefs.eModuleState.ACTIVE);
        return loaded;
    }
    /**
     * 
     * @param { * } ws 
     * @param { Object } options
     * @param { string } options.pathname
     * @param { map } options.searchParams
     * @param { string } options.clientIp
     * @returns 
     */
    async onConnection(ws, options) {
        let cm = this._routes[options.pathname];
        if (cm && cm.isActive()) {
            return await cm.createConnection(ws, options.searchParams, options.clientIp);
        }
        return Promise.reject({
            code: 600,
            message: `*** No active handler for ${options.pathname}`
        })
    }
    async dispose() {
        logger.info(`${this.$name} >> close all connections...`);
        const promises = [];
        Object.keys(this._routes).forEach(key => {
            let cm = this._routes[key];
            if (typeof cm.dispose === 'function') {
                promises.push(cm.dispose());
            }
        })
        const result = {};
        result[this.$name] = promises.length === 0? 'ignored' : await Promise.all(promises);
        return result;
    }
}

// The WebSocket endpoint
class WebSockEndpoint extends Endpoint {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this._cm = new ConnectionManager({
            $name: '_wscm_'
        });
    }
    init(options) {
        if (this._state !== eModuleState.INIT) {
            logger.error(`${this.$name}: Already initialized!`);
            return null;
        }
        this._config = options;
        this._port = normalizePort(options.port || process.env.WS_PORT || '18080');
        this._wss = null;
        this._heartbeat = null;
        this._clientManager = null;
        // Update state
        this._state = eModuleState.READY;
    }
    async start(options) {
        if (this._state !== eModuleState.READY) {
            logger.error(`${this.$name}: endpoint is not ready!`);
            return this._state;
        }
        try {
            this._state = eModuleState.START_PENDING;
            // 
            this._router = new WSRouter(this._appCtx, {$name: '_wsrt_'});
            let paths = await this._router.init(this._config.routePath || 'wss');
            logger.info(`>>> Supported pathnames: ${tools.inspect(paths)}`);
            // 
            const WebSocketServer = WebSocket.WebSocketServer;
            this._wss = new WebSocketServer({
                port: this._port
            })
            this._wss.on('connection', async (ws, req) => {
                try {
                    const xff = req.headers['x-forwarded-for'];
                    const clientIp = xff? xff.split(',')[0].trim() : req.socket.remoteAddress;
                    //
                    let url = new URL(`http://localhost${req.url}`);
                    const r = await this._router.onConnection(ws, {
                        pathname: url.pathname,
                        searchParams: url.searchParams,
                        clientIp
                    })
                } catch(err) {
                    logger.error(`*** On connection error! - ${err.message}`);
                    ws.close();
                }
            }).on('error', err => {
                logger.error(`${this.$name} >> wss error! - ${err.message}`);
                this._state = eModuleState.OSS;
            }).on('close', () => {
                logger.error(`${this.$name} >> wss closed!`);
                this._wss = null;
                if (this._heartbeat) {
                    clearInterval(this._heartbeat);
                    this._heartbeat = null;
                }
                this._state = eModuleState.READY;
            });
            //
            this._state = eModuleState.ACTIVE;
            logger.info(`${this.$name}: wss listening on port ${this._port}`);
        } catch(ex) {
            this._state = eModuleState.OOS;
            this.lastError = ex.message;
            logger.error(`!!! ${this.$name}: Start ws@endpoint failure! - ${ex.message}`);
            return ex.message;
        }
        return this._state;
    }
    async dispose() {
        if (this._wss) {
            this._wss.close();
        }
        return true;
    }
}

//
module.exports = exporst = {
    WebSocket, WSRouter, WSConnection, WSConnectionManager, WebSockEndpoint
}