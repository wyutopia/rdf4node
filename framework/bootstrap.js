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
const bootstrapConf = require(path.join(appRoot.path, 'conf/bootstrap.js'));

function _initFramework() {
    logger.info('++++++ Step 1: Initializing framwork ++++++');
}

function _loadModels() {
    let modelDir = path.join(appRoot.path, bootstrapConf.modelDir);
    logger.info(`++++++ Step 2: Load all database model schemas from ${modelDir} ++++++`);
    let allModels = [];
    let modelFiles = fs.readdirSync(modelDir);
    modelFiles.forEach(filename => {
        let filePath = path.join(modelDir, filename);
        try {
            let modelSpec = require(filePath);
            let modelName = modelSpec.modelName;
            //
            repoFactory.registerSchema(modelName, modelSpec.modelSchema);
            allModels.push(modelName);
        } catch (ex) {
            logger.error(`Load database schema from: ${filename} error! - ${ex.message}`);
        }
    });
    logger.debug(`>>> Registered database schemas: ${tools.inspect(allModels)}`);
}
_loadModels();

const allowedServices = bootstrapConf.allowedServices || [];
function _loadServices() {
    let serviceDir = path.join(appRoot.path, bootstrapConf.serviceDir);
    logger.info(`++++++ Step 3: Load all services module from ${serviceDir} ++++++`);
    let allServices = [];
    let svcFiles = fs.readdirSync(serviceDir);
    svcFiles.forEach( filename => {
        if (allowedServices.indexOf(filename) === -1) {
            return null;
        }
        let filePath = path.join(serviceDir, filename);
        try {
            let svc = require(filePath);
            let svcName = registry.register(svc);
            allServices.push(svcName);
        } catch (ex) {
            logger.error(`Load service: ${filename} error! - ${ex.message}`);
        }
    });
    logger.debug(`>>> All available services: ${tools.inspect(allServices)}`);
}
_loadServices();

function _loadEndpoint() { // Only http endpoint is supported currently
    
}
