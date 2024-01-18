/**
 * Created by Eric on 2021/11/09
 * Modified by Eric on 2023/02/12
 * Remove unused dbTypes from config - updated by Eric on 2024/01/18
 */
const assert = require('assert');
const appRoot = require('app-root-path');
const fs = require('fs');
const path = require('path');
//
const tools = require('../utils/tools');

let config = {};
try {
    const srvRole = process.env.SRV_ROLE || 'core';
    const nodeEnv = process.env.NODE_ENV ? process.env.NODE_ENV.slice(0, 3) : 'dev';
    const cnfFileName = `${srvRole}.${nodeEnv}.js`;
    const cnfFilePath = process.env.CFG_FILE || path.join(appRoot.path, 'conf', cnfFileName);
    assert(cnfFilePath !== undefined);
    console.log('>>> Load config from file: ', cnfFilePath);
    config = require(cnfFilePath);
    //
    console.log('>>> The application config: ', tools.inspect(config));
} catch (ex) {
    console.error('!!! Load application config error! - ', ex);
    process.exit(1);
}

// Export module
module.exports = exports = config;
