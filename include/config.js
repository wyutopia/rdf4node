/**
 * Created by Eric on 2021/11/09
 * Modified by Eric on 2023/02/12
 */
 const assert = require('assert');
 const appRoot = require('app-root-path');
 const fs = require('fs');
 const path = require('path');
 //
 const tools = require('../utils/tools');
 
 let config = {};
 try {
    let nodeEnv = process.env.NODE_ENV? process.env.NODE_ENV.slice(0, 3) : 'dev';
    const cnfFileName = `conf-${nodeEnv}.json`;
    const cnfFilePath = process.env.CFG_FILE || path.join(appRoot.path, 'conf', cnfFileName);
    assert(cnfFilePath !== undefined);
     console.log('Load config from file: ', cnfFilePath);
     let fileData = fs.readFileSync(cnfFilePath)
     if (fileData === null) {
         console.error('Config file does not exists!')
         process.exit(1);
     }
     config = JSON.parse(fileData.toString());
     // Collect database and cache types
     let dbTypes = [];
     // databases
     let dataSources = tools.safeGetJsonValue(config, 'dataSources');
     if (dataSources) {
        Object.keys(dataSources).forEach(key => {
            let ds = dataSources[key];
            if (dbTypes.indexOf(ds.type) === -1) {
                dbTypes.push(ds.type);
            }
        });
     }
     // caches
     let cacheProfiles = tools.safeGetJsonValue(config, 'caches.profiles');
     if (cacheProfiles) {
        Object.keys(cacheProfiles).forEach (key => {
            let profile = cacheProfiles[key];
            if (dbTypes.indexOf(profile.type) === -1) {
                dbTypes.push(profile.type);
            }
        })
     }
     config.dbTypes = dbTypes;
     // 
     console.log('The configurations: ', tools.inspect(config));
 } catch (ex) {
     console.error(ex);
     process.exit(1);
 }
 
 
 // Export module
 module.exports = exports = config;
 