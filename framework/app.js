#!/usr/bin/env node
/**
 * Created by Eric on 2021/11/10
 * Updatede by Eric on 2024/01/19
 */
// Node libs
const assert = require('assert');
const appRoot = require('app-root-path');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const os = require('os');
// project libs
const sysdefs = require('../include/sysdefs');
const eRetCodes = require('../include/retcodes');
const { eSysEvents: eDomainEvent } = require('../include/events');
const tools = require('../utils/tools');
//
const promMonitor = require('../libs/base/prom.monitor');
const logDirManager = require('../utils/logdir.manager');
//
const { ConsulClient } = require('../libs/base/consul.wrapper');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const { RedisManager } = require('../libs/common/redis.wrapper');
const { RascalManager } = require('../libs/common/rascal.wrapper');

const logger = WinstonLogger(process.env.SRV_ROLE || 'app');
// The framework components
const { Registry } = require('./registry');
const { DataSourceFactory } = require('./data-source');
const { EventBus } = require('./ebus');
const { RepositoryFactory } = require('./repository');
const { CacheFactory } = require('./cache');
const { EndpointFactory } = require('./endpoint');
const { DistributedEntityLocker } = require('./distributed-locker');
const { TaskFactory } = require('./xtask');
const { UploadHelper } = require('./upload');

//
async function _regService() {
    if (!this._consulClient) {
        logger.warn(`>>>>>> Consul not configged! -ignore register service.`);
        return 0;
    }
    let localIp = tools.getLocalIp()[0];
    let port = this._port || process.env.PORT || '3000';
    try {
        await this._consulClient.regService({
            name: this._alias,
            id: this._id,
            tags: this._tags,
            address: localIp,
            port: parseInt(port, 10),
            check: {
                http: `http://${localIp}:${port}/monitor/health`,
                interval: '60s',
                timeout: '2s',
                status: 'passing'
            }
        });
        logger.info(`${this._name}: Register to consul succeed.`);
        this._consulSignIn = true;
        return 1;
    } catch (ex) {
        logger.error(`${this._name}: Register to consul error! - ${tools.inspect(ex)}`);
        return 0;
    }
}

async function _deregService() {
    if (!this._consulClient) {
        logger.warn(`!!! Consul not configged! - ignore de-registration.`);
        return 0;
    }
    if (!this._consulSignIn) {
        logger.error('Not registered!');
        return 0;
    }
    logger.info('Try to de-register from consul...');
    try {
        const result = await this._consulClient.deregService({
            id: this._id
        });
        logger.info(`${this._name}: De-register from consul succeed.`);
        return result;
    } catch (ex) {
        logger.error(`${this._name}: De-register from consul failed.`);
        return 0;
    }
}

function _fireStartupAlarm(callback) {
    let options = {
        eventId: sysdefs.eAlarmCode.SERVICE_STARTUP,
        content: 'This is a startup alarm test!'
    }
    return this.fireAlarm(options, callback);
}

async function _fireExitAlarm() {
    // let options = {
    //     eventId: sysdefs.eAlarmCode.GRACEFUL_EXIT,
    //     content: 'This is a graceful-exit alarm test!'
    // }
    // return this.fireAlarm(options, callback);
    logger.info(`[${this._name}]: TODO - fire exit alarm ...`)
    return 0;
}

function _buildModuleArch() {
    let arch = {};
    Object.keys(sysdefs.eModuleType).forEach(layer => {
        arch[layer.toLowerCase()] = [];
    });
    return arch;
}

const _typeAppConfig = {
    id: os.hostname(),
    name: 'a9kb',
    alias: 'a9kb-app',
    version: 'a.b.c',
    tags: [],
    //
    arch: _buildModuleArch(),
    state: sysdefs.eModuleState.INIT,
    //
    enableMonitor: false,
    security: {
        ip: false,
        encryptKey: '123abcABC',
        expiresIn: "72h",
        enableRateLimit: false,
        enableAuthentication: true,
        enableAuthorization: false
    },
    defaultDataSource: 'default'
}

function _initSelf(props) {
    Object.keys(_typeAppConfig).forEach(key => {
        const propKey = '_' + key;
        this[propKey] = props[key] !== undefined ? props[key] : _typeAppConfig[key];
    })
}

// The application class
class Application extends EventEmitter {
    constructor(props) {
        super();
        // Declaring member variables
        this._modules = {};
        this._consulClient = null;
        this._consulSignIn = false;
        _initSelf.call(this, props);
        if (props.consul) { // Consul configured
            this._consulClient = new ConsulClient(props.consul);
        }
        // !!! *** ebus should be the first framework component ***
        this.ebus = new EventBus(this, { $name: sysdefs.eFrameworkModules.EBUS });    
        // Other framework components
        this.redisManager = new RedisManager(this, {
            $name: sysdefs.eFrameworkModules.REDIS_CM,
            $type: sysdefs.eModuleType.CM
        });
        this.rascalManager = new RascalManager(this, {
            $name: sysdefs.eFrameworkModules.RASCAL_CM,
            $type: sysdefs.eModuleType.CM
        });
        //
        this.upload = new UploadHelper(this, { $name: sysdefs.eFrameworkModules.UPLOAD });
        this.registry = new Registry(this, { $name: sysdefs.eFrameworkModules.REGISTRY });
        this.dsFactory = new DataSourceFactory(this, { $name: sysdefs.eFrameworkModules.DATASOURCE });
        this.cacheFactory = new CacheFactory(this, { $name: sysdefs.eFrameworkModules.CACHE });
        this.taskFactory = new TaskFactory(this, { $name: sysdefs.eFrameworkModules.XTASK });
        this.distLocker = new DistributedEntityLocker({ $name: sysdefs.eFrameworkModules.DLOCKER });
        this.repoFactory = new RepositoryFactory(this, { $name: sysdefs.eFrameworkModules.REPOSITORY });
        this.epFactory = new EndpointFactory(this, { $name: sysdefs.eFrameworkModules.ENDPOINT });
    }
    getVersion() {
        if (this._version === null) {
            const pkgJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
            this._version = pkgJson.version;
        }
        return this._version;
    }
    // Implementing member methods
    getName() {
        logger.debug(`>>> The application name: ${this._name}`);
        return this._name;
    }
    getId() {
        logger.debug(`>>> The application id: ${this._id}`);
        return this._id;
    }
    getInstance() {
        return this._id;
    }
    setState(s) {
        this._state = s;
    }
    getState() {
        return this._state;
    }
    fetchServices(callback) {
        return _consulClient.listServices(callback);
    }
    getDataSource(...args) {
        return this.dsFactory.getDataSource(...args);
    }
    getCache(...args) {
        return this.cacheFactory.getCache(...args);
    }
    //
    /**
     * 
     * @param { Object } config - The framework config
     * @param { Object? } config.registry
     * @param { Object? } config.dataSources
     * @param { Object? } config.eventBus
     * @returns 
     */
    async initFramework(config, extensions) {
        if (this._state !== sysdefs.eModuleState.INIT) {
            return Promise.reject({
                code: eRetCodes.INTERNAL_SERVER_ERR,
                message: 'Framework components already initialized.'
            });
        }
        promMonitor.init(this);
        logDirManager.init(this);
        if (config.redis) {
            this.redisManager.init(config.redis);
        }
        if (config.rascal) {
            this.rascalManager.init(config.rascal);
        }
        if (config.eventBus) {
            this.ebus.init(config.eventBus, extensions.eventBus || {});
        }
        if (config.registry) {
            this.registry.init(config.registry);
        }
        if (config.upload) {
            this.upload.init(config.upload);
        }
        if (config.cache) {
            this.cacheFactory.init(config.cache);
        }
        if (config.dataSources) {
            this.dsFactory.init(config.dataSources);
        }
        if (config.dataModels) {
            this.repoFactory.init(config.dataModels);
        }
        if (config.distLocker) {
            this.distLocker.init(config.distLocker);
        }
        if (config.endpoints) {
            this.epFactory.init(config.endpoints, extensions.endpoints || {});
        }
        //TODO: Add other framework components here ...
        this._state = sysdefs.eModuleState.READY;
        return 'ok';
    }
    loadServices(options) {
        let serviceDir = path.join(appRoot.path, options.servicePath || 'services');
        logger.info(`>>>>>> Load all services module from ${serviceDir} ...`);
        let allServices = [];
        let entries = fs.readdirSync(serviceDir, {
            withFileTypes: true
        });
        entries.forEach(dirent => {
            if (dirent.isDirectory()  // Recursive not support currently
                || (options.enabledServices && options.enabledServices.indexOf(dirent.name) === -1)) {
                return null;
            }
            let filePath = path.join(serviceDir, dirent.name);
            try {
                let svc = require(filePath);
                let svcName = this.registry.register(svc);
                if (typeof svc.start === 'function') {
                    try {
                        svc.start(options[svcName] || {});  // With potential configuration identified by svcName
                    } catch (ex) {
                        logger.error(`!!! Call start() of ${svcName} error! - ${ex.message}`);
                    }
                }
                allServices.push(svcName);
            } catch (ex) {
                logger.error(`!!! Load service: ${dirent.name} error! - ${ex.message}`);
            }
        });
        logger.debug(`>>> All available services: ${tools.inspect(allServices)}`);
        return allServices;
    }

    //
    // Fire alarm
    async fireAlarm(args, options) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        return false;
        // if (process.env.NODE_ENV !== 'production' && !options.alwaysSend) {
        //     logger.debug(`Ignore fire alarm on development env.`);
        //     return callback();
        // }
        // if (!apmConf) {
        //     logger.warn(`APM server not configed!`);
        //     return callback();
        // }
        // let req = {
        //     url: `${apmConf.baseUrl}/v1/alarm/raise`,
        //     method: 'POST',
        //     json: true,
        //     body: {
        //         service: args.service || this.getServiceAlias(),
        //         instance: this._id,
        //         eventId: args.eventId,
        //         content: args.content
        //     }
        // };
        // logger.debug(`Alarm options: ${tools.inspect(req)}`);
        // req.bodyParser = tools.defaultBodyParser;
        // tools.invokeHttpRequest(req, (err, body) => {
        //     if (err) {
        //         return callback(err);
        //     }
        //     return callback(null, body);
        // });
    }
    /**
     *
     * @param mod
     */
    registerModule(mod, options) {
        logger.info(`New module registry: ${mod.$name} - ${tools.inspect(options)} - ${typeof mod.disposeAsync}`);
        if (this._modules[mod.$name] !== undefined) {
            logger.error(`>>>>>> Conflict! ${mod.name} already exists.`)
        } else {
            this._modules[mod.$name] = mod;
            // Add to clean up chain
            let layer = mod.type || sysdefs.eModuleType.OBJ;
            this._arch[layer].push(mod);
            // Subscribe events
            if (this.ebus && options.subEvents && options.subEvents.length > 0) {
                this.ebus.register(mod, options);
            }
        }
    }
    updateModuleState(name, s) {
        assert(name !== undefined);
        assert(sysdefs.isValidModuleState(s));
        if (this._modules[name] !== undefined) {
            this._modules[name].state = s;
            logger.info(name, s);
        } else {
            logger.error(`Unrecognized module name: ${name}`);
        }
    }
    getModuleState(name) {
        return this._modules[name] ? this._modules[name].state : undefined;
    }
    isActive() {
        let active = true;
        let keys = Object.keys(this._modules);
        for (let i = 0; i < keys.length; i++) {
            let key = keys[i];
            if (this._modules[key].mandatory === true && this._modules[key].state !== sysdefs.eModuleState.ACTIVE) {
                active = false;
                break;
            }
        }
        return active;
    }
    isMaster = () => {
        return (process.env.NODE_ENV === 'production' && this._isMaster === true);
    }
    updateInnerToken(token) {
        this._prevToken = this._innerToken;
        this._innerToken = token;
    }
    getSecurity() {
        return this._security;
    }
    setDebugLevel(args, callback) {
        if (['info', 'debug', 'error'].indexOf(args.level) === -1) {
            return callback({
                code: eRetCodes.BAD_REQUEST,
                message: 'Invalid level!'
            })
        }
        return logger.setRotateFileLevel(args.level, callback);
    }

    async createEndpoints() {
        return 'todo';
    }
    async start() {
        if (this._state !== sysdefs.eModuleState.READY) {
            logger.error('!!! Initializing first.');
            return 0;
        }
        await _regService.call(this);
        await this.epFactory.startAll();
        //Register to the centered regsitry
        //fire app startup alarm
        //Change state to ACTIVE
        return true;
    }
    // Handle graceful Exit
    async gracefulExit() {
        logger.info('>>> Perform system clean-up before exit... <<<');
        await _fireExitAlarm.call(this);
        //
        logger.info(`>>>>>> Stop all modules ...`);
        const promises = [];
        Object.keys(this._arch).forEach(layer => {
            logger.info(`>>>>>> ${layer}: Clean up modules ...`);
            this._arch[layer].forEach(m => {
                if (typeof m.dispose === 'function') {
                    promises.push(m.dispose());
                }
            });
        });
        const result = await Promise.all(promises);
        logger.info(`>>>>>> All modules disposed. results: ${tools.inspect(result)}`);
        await _deregService.call(this);
        return 0
    }
}

// Define module
module.exports = exports = {
    Application
};
