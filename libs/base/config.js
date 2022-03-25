/**
 * Created by Eric on 2021/11/09.
 */
 const assert = require('assert');
 const fs = require('fs');
 const path = require('path');
 const Util = require('util');
 const appRoot = require('app-root-path');
 let nodeEnv = process.env.NODE_ENV? process.env.NODE_ENV.slice(0, 3) : 'dev';
 const cnfFileName = `conf-${nodeEnv}.json`;
 const cnfFilePath = process.env.CFG_FILE || path.join(appRoot.path, 'conf', cnfFileName);
 assert(cnfFilePath !== undefined);
 
 let config = {};
 try {
     console.log('Load config from file: ', cnfFilePath);
     let fileData = fs.readFileSync(cnfFilePath)
     if (fileData === null) {
         console.error('Config file does not exists!')
         process.exit(1);
     }
     config= JSON.parse(fileData.toString());
     console.log('The configurations: ', Util.inspect(config, {depth: Infinity}));
 } catch (ex) {
     console.error(ex);
     process.exit(1);
 }
 
 
 // Export module
 module.exports = exports = config;
 