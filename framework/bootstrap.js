/**
 * Created by Eric on 2023/02/07
 */
// Step 1: Load bootstrap config
// Step 2: Load application config
// Step 3: Perform system check and initializing framework
//TODO: Load all database schemas from folder <project-root>/models
//TODO: Load all controllers 

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

function _initFramework() {
    logger.info('++++++ Step 1: Initializing framwork ++++++');
}

function _loadDatabaseSchemas(callback) {
    let modelDir = path.join(appRoot.path, bsConf.modelDir);
    logger.info(`++++++ Step 2: Load all database schemas from ${modelDir} ++++++`);
    let allModels = [];
    let entries = fs.readdirSync(modelDir, {
        withFileTypes: true
    });
    entries.forEach(dirent => {
        if (dirent.isDirectory()) { // Ignore directory
            return null;
        }
        let filePath = path.join(modelDir, dirent.name);
        try {
            let modelSpec = require(filePath);
            let modelName = modelSpec.modelName;
            if (modelName) {
                repoFactory.registerSchema(modelName, {
                    schema: modelSpec.modelSchema,
                    refs: modelSpec.modelRefs || [],
                    // Cache options
                    allowCache: modelSpec.allowCache,
                    cacheSpec: modelSpec.cacheSpec
                });
                allModels.push(modelName);
            }
        } catch (ex) {
            logger.error(`Load database schema from: ${dirent.name} error! - ${ex.message}`);
        }
    });
    logger.debug(`>>> Registered database schemas: ${tools.inspect(allModels)}`);
    if (callback) {
        return callback();
    }
}

const enabledServices = bsConf.enabledServices || [];
function _loadServices(callback) {
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
function _buildSysCache(callback) {
    return callback();
}

function _createEndpoints(callback) { // Only http endpoint is supported currently
    return callback();
}

function _bootstrap(callback) {
    async.series([
        _loadDatabaseSchemas,
        _loadServices,
        _buildSysCache,
        _createEndpoints
    ], () => {
        return callback();
    });
}

// Declaring module exports
module.exports = exports = {
    loadDatabaseSchemas: _loadDatabaseSchemas,
    sysBootstrap: _bootstrap
};