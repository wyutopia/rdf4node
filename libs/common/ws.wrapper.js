/**
 * Created by Eric on 2024/06/20
 */
const appRoot = require('app-root-path');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
//
const sysdefs = require('../../include/sysdefs');
const { EventObject, EventModule } = require('../../include/events');
//
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'wss');

class WSConnection extends EventObject {
    constructor(props) {
        super(props);
        //
        this._ws = props.ws;
        this._clientIp = props.clientIp;
    }
    async init(ws, args, clientIp) {
        //
        await this._validate(args);
        this._ws = ws;
        this._clientIp = clientIp;
        return true;
    }
}

class WSConnectionManager extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this._state = null;
        this._pathname = null;
        this._connections = {};
    }
    async createConnection(ws, searchParams, clientIp) {
        logger.warn(`+++ Need override! +++`)
        return false;
    }
}

const _reSysFile = new RegExp(/^\./)

class WSRouter extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this._routes = {};
        this._state = sysdefs.eModuleState.INIT;
    }
    /**
     * 
     * @param { string } pathName
     * @param { string } options 
     */
    async init(pathName, options) {
        if (this._state !== sysdefs.eModuleState.INIT) {
            return logger.warn(`*** Already initialized.`);
        }
        let loaded = [];
        let currentDir = path.join(appRoot.path, pathName);
        const entries = fs.readFileSync(currentDir, { withFileTypes: true });
        entries.forEach(dirent => {
            if (dirent.isDirectory() || _reSysFile.test(dirent.name)) { // Ignore sub-dirs and system files
                return null;
            }
            let filePath = path.join(currentDir, dirent.name);
            try {
                let m = require(filePath);
                this._routes[m.pathname] = m;
                //
                loaded.push(m.pathname);
            } catch(ex) {
                logger.error(`*** Load ${filePath} error! - ${ex.message}`);
            }
        })
        this._state = sysdefs.eModuleState.ACTIVE;
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
        if (cm === undefined && cm.isActive()) {
            return Promise.reject(`*** No handler for ${options.pathname}`);
        }
        return await cm.createConnection(ws, options.searchParams, clientIp);
    }
}

//
module.exports = exporst = {
    WebSocket, WSRouter, WSConnection
}