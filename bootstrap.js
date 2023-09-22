/**
 * Created by Eric on 2023/02/07
 */
// Step 1: Load bootstrap config
// Step 2: Init framework components
// Step 3: Load database schemas
// Step 4: Build caches
// Step 5: Start application modules (Controllers, Services, DaemonTasks)
// Step 6: Prepare system monitoring metrics

// Node libs
const fs = require('fs');
const path = require('path');
// 3rd libs
const async = require('async');
const appRoot = require('app-root-path');
// Common definitions and utilities
const sysdefs = require('./include/sysdefs');
const tools = require('./utils/tools');
// Create application core instance
global._$theApp = require('./framework/app');
// Framework libs
const {EventBus} = require('./framework/ebus');
const {repoFactory} = require('./framework/repository');
const {cacheFactory} = require('./framework/cache');
const {WinstonLogger} = require('./libs/base/winston.wrapper');
const registry = require('./framework/registry');
// Local variables
const logger = WinstonLogger(process.env.SRV_ROLE || 'bootstrap');
const bsConf = require(path.join(appRoot.path, 'conf/bootstrap.js'));

function _initFramework(callback) {
    logger.info('++++++ Stage 1: Initializing framwork ++++++');
    // Step 1: Create event-bus 
    global._$ebus = new EventBus({
        $name: sysdefs.eFrameworkModules.EBUS
    });
    // Step 2: Create timer
    return callback();
}

const _excludeModelDirs = ['.DS_Store', '_templates'];
const _loadedModels = [];
function _readModelDirSync(modelDir) {
    //logger.debug(`====== Scan directory: ${modelDir}`);
    let entries = fs.readdirSync(modelDir, {
        withFileTypes: true
    });
    entries.forEach(dirent => {
        let fullPath = path.join(modelDir, dirent.name);
        if (dirent.isDirectory()) {
            if (_excludeModelDirs.indexOf(dirent.name) !== -1) { // Ignore excluded folers
                return null;
            }
            return _readModelDirSync(fullPath);
        }
        //logger.debug(`====== Load model: ${fullPath}`);
        try {
            let modelSpec = require(fullPath);
            let modelName = modelSpec.modelName;
            if (modelName) {
                repoFactory.registerSchema(modelName, {
                    schema: modelSpec.modelSchema,
                    refs: modelSpec.modelRefs || [],
                    // Cache options
                    allowCache: modelSpec.allowCache !== undefined? modelSpec.allowCache : false,
                    cacheSpec: modelSpec.cacheSpec || {}
                });
                _loadedModels.push(modelName);
            }
        } catch (ex) {
            logger.error(`====== Load database schema from: ${dirent.name} error! - ${ex.message}`);
        }
    });
    return null;
}

function _loadDatabaseSchemas(callback) {
    let modelDir = path.join(appRoot.path, bsConf.modelDir || 'models');
    logger.info(`++++++ Step 2: Load all database schemas from ${modelDir} ++++++`);
    _readModelDirSync(modelDir);
    logger.debug(`>>> Total ${_loadedModels.length} database schemas registered. - ${tools.inspect(_loadedModels)}`);
    return callback();
}

const enabledServices = bsConf.enabledServices || [];
function _startServices(callback) {
    let serviceDir = path.join(appRoot.path, bsConf.serviceDir);
    logger.info(`++++++ Step 3: Load all services module from ${serviceDir} ++++++`);
    let allServices = [];
    let entries = fs.readdirSync(serviceDir, {
        withFileTypes: true
    });
    entries.forEach( dirent => {
        if (dirent.isDirectory() || enabledServices.indexOf(dirent.name) === -1) {
            return null;
        }
        let filePath = path.join(serviceDir, dirent.name);
        try {
            let svc = require(filePath);
            let svcName = registry.register(svc);
            allServices.push(svcName);
        } catch (ex) {
            logger.error(`Load service: ${dirent.name} error! - ${ex.message}`);
        }
    });
    logger.debug(`>>> All available services: ${tools.inspect(allServices)}`);
    return callback();
}

const enabledCaches = bsConf.enabledCaches || [];
function _buildCaches(callback) {
    return callback();
}

function _createEndpoints(callback) { // Only http endpoint is supported currently
    return callback();
}

function _bootstrap(callback) {
    async.series([
        _initFramework,
        _loadDatabaseSchemas,
        _buildCaches,
        _startServices,
        _createEndpoints
    ], (err) => {
        return callback(err);
    });
}

// Declaring module exports
module.exports = exports = {
    loadDatabaseSchemas: _loadDatabaseSchemas,
    sysBootstrap: _bootstrap
};