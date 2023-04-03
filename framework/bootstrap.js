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
const {
    tools,
    winstonWrapper: {WinstonLogger},
    repository: {repoFactory},
    registry
} = require('@icedeer/rdf4node');
// Project libs

// Local variables
const logger = WinstonLogger(process.env.SRV_ROLE || 'bootstrap');
const bsConf = require(path.join(appRoot.path, 'conf/bootstrap.js'));

function _initFramework() {
    logger.info('++++++ Step 1: Initializing framwork ++++++');
}

function _loadDatabaseSchemas() {
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
                    refs: modelSpec.modelRefs || []
                });
                allModels.push(modelName);
            }
        } catch (ex) {
            logger.error(`Load database schema from: ${dirent.name} error! - ${ex.message}`);
        }
    });
    logger.debug(`>>> Registered database schemas: ${tools.inspect(allModels)}`);
}
_loadDatabaseSchemas();

const allowedServices = bsConf.allowedServices || [];
function _loadServices() {
    let serviceDir = path.join(appRoot.path, bsConf.serviceDir);
    logger.info(`++++++ Step 3: Load all services module from ${serviceDir} ++++++`);
    let allServices = [];
    let entries = fs.readdirSync(serviceDir, {
        withFileTypes: true
    });
    entries.forEach( dirent => {
        if (dirent.isDirectory() || allowedServices.indexOf(dirent.name) === -1) {
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
}
_loadServices();

function _createEndpoint() { // Only http endpoint is supported currently

}
