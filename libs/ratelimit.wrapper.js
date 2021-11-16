/**
 * Create by eric on 2021/11/15
 */
 const RateLimit = require('express-rate-limit');
 const MongoStore = require('rate-limit-mongo');
 const {database: dbUrl, rateLimit: config} = require('../common/config');
 
 const limiter = new RateLimit({
     store: new MongoStore({
         uri: dbUrl
     }),
     collectionName: 'accessRateLimit',
     windowMs: config.windowMs || (15 * 60 * 1000),
     max: config.max || 100,
     expireTimeMs: config.expireTimeMs || (60 * 1000)
 });
 
 module.exports = limiter;
 