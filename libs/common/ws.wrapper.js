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
const { Endpoint, normalizePort } = require('../../include/endpoint');
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
                this.emit('error', this.$id, err);
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
                this.emit('open', this.$id);
            } catch(err) {
                logger.error(`${this.$name}[${this._state}]>> emit client-open error! - ${err.message}`);
            }
        })
        this._ws.on('message', (data, isBinary) => {
            try {
                this.emit('message', this.$id, data, isBinary);
            } catch(err) {
                logger.error(`${this.$name}[${this._state}]>> emit client-message error! - ${err.message}`);
            }
        })        
        this._ws.on('close', () => {
            let retain = this._origin === eOrigin.OUTBOUND && this._reconnect;
            this.emit('close', this.$id, retain);
            if (retain) { // Only outbound connection need reconnecting
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
        this._origin = this._ws? eOrigin.INBOUND : eOrigin.OUTBOUND;
        this._url = props.url || '';
        this._remoteClientIp = props.clientIp;
        //
        this._reconnect = this._ws? false : (props.reconnect !== undefined? props.reconnect : true); 
        this._retryDelayMs = props.retryDelayMs || 2000;
        //
        this._enableHeartbeat = this._ws? false : (props.enableHeartbeat !== undefined? props.enableHeartbeat : true);
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

async function _parseParamters(validator, searchParams) {
    let args = {};
    let keys = Object.keys(validator);
    if (keys.length === 0) { // Empty parameter list
        return args;
    }
    let err = null;
    let i = 0;
    while(i < keys.length && !err) {
        let key = keys[i++];
        //
        let val = validator[key];
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

const _fakeController = {
    emit: function() {},
    on: function () {}
}

const eWebSockEvent = {
    Error    : 'ws-error',
    Open     : 'ws-open',
    Message  : 'ws-message',
    Close    : 'ws-close' 
}

// The WebSocket ConnectionManager class
class WebSockConnectionManager extends EventObject {
    constructor(props) {
        super(props);
        //
        this._id = 0;
        this._validator = props.validator || {};
        this._clients = {};
        //
        this._controller = props.controller || _fakeController;
        this._controller.on('', () => {});
        //
        this._state = sysdefs.eModuleState.ACTIVE;
    }
    
    isActive() {
        return this._state === sysdefs.eModuleState.ACTIVE;
    }

    /**
     *  Handle inbound connection
     * @param { WebSocket } ws 
     * @param { Object } options
     * @param { Map } options.searchParams 
     * @param { string } options.clientIp
     * @returns 
     */
    async inbound(ws, options) {
        const args = await _parseParamters(this._validator, options.searchParams || {});
        //
        let cid = _genClientId.call(this);
        let client = new WebSocketClient({
            $id: cid,
            //
            ws,
            clientIp: options.clientIp
        });
        client.on('error', (cid, err) => {
            try {
                this._controller.emit('ws-error', cid, err);
            } catch(err) {
                logger.error(err.message);
            }
        }).on('open', cid => {
            try {
                this._controller.emit('ws-open', cid, args);
            } catch(err) {
                logger.error(err.message);
            }
        }).on('message', (cid, data, isBinary) => {
            try {
                this._controller.emit('ws-message', cid);
            } catch(err) {
                logger.error(err.message);
            }
        }).on('close', (cid, retain = false) => {
            this._consumers.forEach(consumer => {
                try {
                    consumer.emit('ws-close', cid);
                } catch(err) {
                    logger.error(err.message);
                }
            })
            //
            delete this._clients[cid];
        })
        await client.start();
        this._clients[cid] = client;
        return true;
    }

    async outbound(url, params) {

    }

    async dispose() {
        logger.info(`${this.$name} >> Close all connections...`);
        let promises = [];
        Object.keys(this._clients).forEach( key => {
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
class WebSockRouter extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this._routes = {};
        this._state = sysdefs.eModuleState.INIT;
    }
    /**
     * 
     * @param { string } rootPath
     * @param { Object } options 
     */
    async init(rootPath, options) {
        if (this._state !== sysdefs.eModuleState.INIT) {
            logger.warn(`### ${this.$name}[${this._state}]>> Already initialized.`);
            return false;
        }
        let loaded = [];
        let currentDir = path.join(appRoot.path, rootPath);
        logger.info(`${this.$name}[${this._state}]>> scan directory: ${currentDir}`);
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        entries.forEach(dirent => {
            if (dirent.isDirectory() || _reSysFile.test(dirent.name)) { // Ignore sub-dirs and system files
                return null;
            }
            let filePath = path.join(currentDir, dirent.name);
            try {
                let m = require(filePath);
                this._routes[m.path] = m.handler;
                //
                loaded.push(m.path);
            } catch(ex) {
                logger.error(`*** Load ${filePath} error! - ${ex.message}`);
            }
        })
        this._state = sysdefs.eModuleState.ACTIVE;
        return loaded;
    }
    /**
     * Handle inbound ws connection
     * @param { string } pathname
     * @param { WebSocket } ws 
     * @param { Object } options
     * @param { map } options.searchParams
     * @param { string } options.clientIp
     * @returns 
     */
    async inboundConnection(pathname, ws, options) {
        let cm = this._routes[pathname];
        if (cm && cm.isActive()) {
            return await cm.inbound(ws, options);
        }
        return Promise.reject({
            code: 600,
            message: `*** No active handler for ${pathname}`
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
        this._wss = null;
        this._router = new WebSockRouter(appCtx, {$name: '_wsrt_'});
        // this._heartbeat = null;
        // this._cm = new ConnectionManager({
        //     $name: '_wscm_'
        // });
    }

    /**
     * 
     * @param { Object } config 
     * @returns 
     */
    async init(config = {}) {
        if (this._state !== sysdefs.eModuleState.INIT) {
            logger.error(`${this.$name}[${this._state}]>> Already initialized!`);
            return null;
        }
        this._config = config;
        this._port = normalizePort(config.port || process.env.WS_PORT || '10086');
        // Load routes
        let paths = await this._router.init(config.routePath || 'wss');
        logger.info(`${this.$name}[${this._state}]>> Supported paths: ${tools.inspect(paths)}`);
        // Update state
        this._state = sysdefs.eModuleState.READY;
        return true;
    }

    async start(options) {
        if (this._state !== sysdefs.eModuleState.READY) {
            logger.error(`*** ${this.$name}[${this._state}]>> endpoint is not ready!`);
            return this._state;
        }
        this._state = sysdefs.eModuleState.START_PENDING;
        try {
            this._wss = new WebSocketServer({
                port: this._port
            })
            this._wss.on('connection', async (ws, req) => {
                try {
                    const xff = req.headers['x-forwarded-for'];
                    const clientIp = xff? xff.split(',')[0].trim() : req.socket.remoteAddress;
                    //
                    let url = new URL(`http://localhost${req.url}`);
                    const r = await this._router.inboundConnection(url.pathname, ws, {
                        searchParams: url.searchParams,
                        clientIp
                    })
                } catch(err) {
                    logger.error(`*** ${this.$name}[${this._state}]>> On connection error! - ${err.message}`);
                    ws.close();
                }
            }).on('error', err => {
                logger.error(`${this.$name}[${this._state}]>> wss error! - ${err.message}`);
                this._state = sysdefs.eModuleState.OSS;
            }).on('close', () => {
                logger.error(`${this.$name} >> wss closed!`);
                this._wss = null;
                if (this._heartbeat) {
                    clearInterval(this._heartbeat);
                    this._heartbeat = null;
                }
                this._state = sysdefs.eModuleState.READY;
            });
            //
            this._state = sysdefs.eModuleState.ACTIVE;
            logger.info(`${this.$name}[${this._state}]>> wss start listening on port ${this._port}`);
            return 'ok';
        } catch(ex) {
            this._state =sysdefs.eModuleState.OOS;
            this.lastError = ex.message;
            logger.error(`*** ${this.$name}[${this._state}]>> Start ws@endpoint failure! - ${ex.message}`);
            return ex.message;
        }
    }
    async dispose() {
        if (this._wss) {
            this._wss.close();
        }
        return true;
    }
}

//
module.exports = exports = {
    WebSocket, 
    //
    eWebSockEvent,
    WebSockRouter, 
    WebSocketClient, 
    WebSockConnectionManager, 
    WebSockEndpoint
}