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
const tools = require('./utils/tools');
// Create logger
const { WinstonLogger } = require('./libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'bootstrap');

// Framework components
const { Application } = require('./framework/app');

/**
 * 
 * @param { Object? } extensions - The customized overrides and extensions
 * @param { Object? } extensions.registry
 * @param { Object? } extensions.eventBus
 * @param { Object? } extensions.endpoints
 * @returns 
 */
async function bootstrap(extensions) {
    const beginTime = new Date();
    logger.info('>>> Application startup ... <<<');
    // Step 1: Create app context instance
    const theApp = new Application(config.app);
    global.theApp = theApp;
    process.on('SIGINT', async () => {
        logger.info('>>> On SIGINT <<<');
        theApp.setState(sysdefs.eModuleState.STOP_PENDING);
        try {
            const code = await theApp.gracefulExit();
            return process.exit(code);
        } catch (ex) {
            logger.error(`>>> Exit error! - ${tools.inspect(ex)}`);
            process.exit(1);
        }        
    });
    const result = {};
    try {
        logger.info('====== Step 1: Init framework components ======');
        result.framework = await theApp.initFramework(config, extensions);
        //
        logger.info('====== Step 2: Load daemon tasks ======');
        result.daemons = theApp.loadDaemons(config.daemons || {});
        //
        logger.info('====== Step 3: App startup ======');
        result.start = await theApp.start();
    } catch (ex) {
        logger.error(`!!! Bootstrap error! - ${tools.inspect(ex)}`);
    }
    return result;
}

// Define module
module.exports = exports = {
    bootstrap
};