/**
 * Created by Eric on 2021/11/15
 * Modified by Eric on 2022/04/06
 * Modified by Eric on 2023/02/12
 */
const rateLimit = require('express-rate-limit');
const MongoStore = require('rate-limit-mongo');
// Framework libs
const config = require('./config');
const rateLimitConf = config.rateLimit || {};
const tools = require('../../utils/tools');

// Step 1: Prepare basic config options
const options = tools.deepAssign({}, rateLimitConf.options);
if (options.windowMs === undefined) {
    options.windowMs = 15 * 60 * 1000;
}
if (options.max === undefined) {
    options.max = 20;
}
if (options.expireTimeMs === undefined) {
    options.expireTimeMs = 60 * 1000;
}
// Step 2: Set persistant store if configed
if (rateLimitConf.store !== undefined) {
    if (rateLimitConf.store.type === 'mongo') {
        let confPath = rateLimitConf.store.confPath;
        let storeConf = tools.safeGetJsonValue(config, confPath);
        if (storeConf) {
            let uri = tools.packMongoUri(storeConf);
            options.store = new MongoStore({
                uri: uri,
                collectionName: 'accessRateLimit'
            });
        }
    }
}
console.log(`>>> Enable rate-limit with options: ${tools.inspect(options)} <<<`);
module.exports = exports = rateLimit(options);
