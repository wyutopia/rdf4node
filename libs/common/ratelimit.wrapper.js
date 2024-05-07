/**
 * Created by Eric on 2021/11/15
 * Modified by Eric on 2022/04/06
 * Modified by Eric on 2023/02/12
 * Modified by Eric on 2024/01/21
 * MOdified by Eric on 2024/05/05 - Replace rate-limit-mongo with rate-limit-redis
 */
const rateLimit = require('express-rate-limit');
// Framework libs
const config = require('../../include/config');
const tools = require('../../utils/tools');

/**
 * 
 * @param { Object } options 
 * @param { string } options.type
 * @param { string } options.confPath
 * @returns 
 */
async function _makeRealStore(options) {
    let store = undefined;
    if (options.type === 'mongo') {
        try {
            const MongoStore = require('rate-limit-mongo');
            let storeConf = tools.safeGetJsonValue(config, options.confPath);
            if (storeConf) {
                let uri = tools.packMongoUri(storeConf);
                store = new MongoStore({
                    uri: uri,
                    collectionName: 'accessRateLimit'
                });
            }            
        } catch(ex) {
            console.error(`!!! Create mongo store error! - ${ex.message}`);
        }
    } else if (options.type === 'redis') {
        try {
            const { RedisStore} = require('rate-limit-redis');
            const { createClient } = require('redis');
            //
            let storeConf = tools.safeGetJsonValue(config, options.confPath);
            if (storeConf) {
                const client = createClient(storeConf);
                await client.connect();
                store = new RedisStore({
                    sendCommand: (...args) => client.sendCommand(args)
                })
            }
        } catch(ex) {
            console.error(`!!! Create redis store error! - ${ex.message}`);
        }
    }
    return store;
}

/**
 * 
 * @param { Object } config 
 * @param { Object } config.options
 * @param { Object? } config.store
 * @returns 
 */
async function createRateLimit(config) {
    const options = config.options || {};
    options.keyGenerator = function (req, res) {
        let xff = req.headers['x-forwarded-for'];
        if (xff) {
            return xff.split(',')[0].trim();
        }
        return req.ip;
    }
    if (options.windowMs === undefined) {
        options.windowMs = 15 * 60 * 1000;
    }
    if (options.limit === undefined) {
        options.limit = 10;
    }
    if (options.expireTimeMs === undefined) {
        options.expireTimeMs = 60 * 1000;
    }
    // Step 2: Set persistant store if configed
    if (config.store !== undefined) {
        options.store = await _makeRealStore(config.store)
    }
    return rateLimit(options);
}
// Define module
module.exports = exports = { createRateLimit };
