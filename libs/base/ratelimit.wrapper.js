/**
 * Created by Eric on 2021/11/15
 * Modified by Eric on 2022/04/06
 */
const rateLimit = require('express-rate-limit');
const MongoStore = require('rate-limit-mongo');
const { mongodb, rateLimit: rateLimitConf } = require('./config');

const config = Object.assign({}, rateLimitConf.options);
if (config.windowMs === undefined) {
    config.windowMs = 15 * 60 * 1000;
}
if (config.max === undefined) {
    config.max = 20;
}
if (config.expireTimeMs === undefined) {
    config.expireTimeMs = 60 * 1000;
}
if (rateLimitConf.store === 'mongo') {
    let dbUri = `mongodb://${mongodb.user}:${encodeURIComponent(mongodb.pwd)}`
        + `@${mongodb.ip}:${mongodb.port || 27017}/${mongodb.db}?authSource=${mongodb.authSource || mongodb.db}`;
    config.store = new MongoStore({
        uri: dbUri,
        collectionName: 'accessRateLimit'
    });
}

const limiter = rateLimit(config);
module.exports = limiter;
