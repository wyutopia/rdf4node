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
// Framework libs
const tools = require('../utils/tools');
const {WinstonLogger} = require('../libs/base/winston.wrapper');
const {repoFactory} = require('./repository');
const registry = require('./registry');
const {cacheFactory} = require('./cache');
// Local variables
const logger = WinstonLogger(process.env.SRV_ROLE || 'bootstrap');
const bsConf = require(path.join(appRoot.path, 'conf/bootstrap.js'));

function _initFramework(callback) {
    logger.info('++++++ Step 1: Initializing framwork ++++++');
    return callback();
}

const _excludeModelDirs = ['.DS_Store', '_templates'];
function _readModelDirSync(modelEntries, modelDir) {
    let entries = fs.readdirSync(modelDir, {
        withFileTypes: true
    });
    entries.forEach(dirent => {
        let filePath = path.join(modelDir, dirent.name);
        if (dirent.isDirectory()) {
            if (_excludeModelDirs.indexOf(dirent.name) !== -1) { // Ignore excluded folers
                return null;
            }
            return _readModelDirSync(modelEntries, filePath);
        }
        try {
            let modelSpec = require(filePath);
            let modelName = modelSpec.modelName;
            if (modelName) {
                repoFactory.registerSchema(modelName, {
                    schema: modelSpec.modelSchema,
                    refs: modelSpec.modelRefs || [],
                    // Cache options
                    allowCache: modelSpec.allowCache !== undefined? modelSpec.allowCache : false,
                    cacheSpec: modelSpec.cacheSpec || {}
                });
                modelEntries.push(modelName);
            }
        } catch (ex) {
            logger.error(`Load database schema from: ${dirent.name} error! - ${ex.message}`);
        }
    });
    return null;
}

function _loadDatabaseSchemas(callback) {
    let modelDir = path.join(appRoot.path, bsConf.modelDir);
    logger.info(`++++++ Step 2: Load all database schemas from ${modelDir} ++++++`);
    let allModels = [];
    _readModelDirSync(allModels, modelDir);
    logger.debug(`>>> Total ${allModels.length} database schemas registered. - ${tools.inspect(allModels)}`);
    if (callback) {
        return callback();
    }
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
    if (callback) {
        return callback();
    }
}

const enabledCaches = bsConf.enabledCaches || [];
function _buildCaches(callback) {
    return callback();
}

function _createEndpoints(callback) { // Only http endpoint is supported currently
    return callback();
}

function _createEventBus(callback) {
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