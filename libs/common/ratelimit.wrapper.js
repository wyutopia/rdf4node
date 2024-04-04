/**
 * Created by Eric on 2021/11/15
 * Modified by Eric on 2022/04/06
 * Modified by Eric on 2023/02/12
 * Modified by Eric on 2024/01/21
 */
const rateLimit = require('express-rate-limit');
const MongoStore = require('rate-limit-mongo');
// Framework libs
const config = require('../../include/config');
const tools = require('../../utils/tools');

function _getRealStoreConfig(origStore) {
    let store = undefined;
    if (origStore.type === 'mongo') {
        let storeConf = tools.safeGetJsonValue(config, origStore.confPath);
        if (storeConf) {
            let uri = tools.packMongoUri(storeConf);
            store = new MongoStore({
                uri: uri,
                collectionName: 'accessRateLimit'
            });
        }
    }
    return store;
}

function RateLimit(config) {
    const options = config.options || {};
    const store = config.store;
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
    if (store !== undefined) {
        options.store = _getRealStoreConfig(store)
    }
    return rateLimit(options);
}
// Define module
module.exports = exports = { RateLimit };
