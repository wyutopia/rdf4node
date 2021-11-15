/**
 * Create by eric on 2021/11/15
 */
 const RateLimit = require('express-rate-limit');
 const MongoStore = require('rate-limit-mongo');
 const config = require('../common/config');
 
 const limiter = new RateLimit({
     store: new MongoStore({
         uri: config.database
     }),
     collectionName: 'accessRateLimit',
     windowMs: config.rateLimit.windowMs || (15 * 60 * 1000),
     max: config.rateLimit.max || 100,
     expireTimeMs: config.rateLimit.expireTimeMs || (60 * 1000)
 });
 
 module.exports = limiter;
 