/**
 * Created by Eric on 2024/06/20
 */
const appRoot = require('app-root-path');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
//
const sysdefs = require('../../include/sysdefs');
const eRetCodes = require('../../include/retcodes');
const { EventObject, EventModule } = require('../../include/events');
//
const { WinstonLogger } = require('../base/winston.wrapper');
const { promises } = require('dns');
const logger = WinstonLogger(process.env.SRV_ROLE || 'wss');

class WSConnection extends EventObject {
    constructor(props) {
        super(props);
        //
        this._ws = props.ws;
        this._ws.on('error', err => {
            this.emit('client-error', this.$id, err);
        })
        this._ws.on('close', () => {
            this.emit('client-close', this.$id);
        })
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

// The WebSocketConnectionManager class
class WSConnectionManager extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
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
        this.setState(sysdefs.eModuleState.ACTIVE);
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
     * @param { string } options 
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

//
module.exports = exporst = {
    WebSocket, WSRouter, WSConnection, WSConnectionManager
}