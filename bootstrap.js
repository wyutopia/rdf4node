/**
 * Created by Eric on 2023/02/07
 * Upgraded by Eric on 2024/01/19
 */
// Node libs
const fs = require('fs');
const path = require('path');
const util = require('util');
// 3rd libs
const appRoot = require('app-root-path');
// Common definitions and utilities
const sysdefs = require('./include/sysdefs');
const config = require("./include/config");
// Create logger
const { WinstonLogger } = require('./libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'bootstrap');

// Framework components
const { Application } = require('./framework/app');

// function _initFramework(callback) {
//     logger.info('++++++ Stage 1: Initializing framwork ++++++');
//     // Step 1: Create event-bus 
//     global._$ebus = new EventBus(Object.assign({
//         $name: sysdefs.eFrameworkModules.EBUS
//     }, config.eventBus));
//     // Step 2: Create timer
//     return callback();
// }

async function bootstrap() {
    const beginTime = new Date();
    logger.info('>>> Application startup ... <<<');
    // Step 1: Create app context instance
    const theApp = new Application(config.app);
    global.theApp = theApp;
    process.on('SIGINT', async () => {
        logger.info('>>> On SIGINT <<<');
        theApp.setState(sysdefs.eModuleState.STOP_PENDING);
        const code = await theApp.gracefulExit()
        process.exit(code);
    });
    const result = {};
    try {
        logger.info('====== Step 1: Init framework components ======');
        result.framework = await theApp.initFramework({
            registry: config.registry,
            eventBus: config.eventBus,
            dataSources: config.dataSources,
            caches: config.caches,
            endpoints: config.endpoints
        });
        //
        logger.info('====== Step 2: Load enabled database models ======');
        result.dataModels = await theApp.loadDataModel(config.dataModel || {});
        //
        logger.info('====== Step 3: Start enabled services ======');
        result.services = await theApp.startServices(config.services);
        
        logger.info('====== Step 4: Create endpoints ======');
        result.endpoints = await theApp.createEndpoints(config.endpoints);
        // Step 5: 
        result.start = await theApp.start();
    } catch (ex) {
        logger.error('!!! Bootstrap error! - ', ex);
    }
    return result;
}

// Define module
module.exports = exports = {
    bootstrap
};