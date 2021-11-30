/**
 * Create by eric on 2021/11/15
 */
 const RateLimit = require('express-rate-limit');
 const MongoStore = require('rate-limit-mongo');
 const {mongodb, rateLimit: config} = require('./config');
 
 const dbUri = `mongodb://${mongodb.user}:${encodeURIComponent(mongodb.pwd)}` 
                + `@${mongodb.ip}:${mongodb.port || 27017}/${mongodb.db}?authSource=${mongodb.authSource || mongodb.db}`;
 const limiter = new RateLimit({
     store: new MongoStore({
         uri: dbUri
     }),
     collectionName: 'accessRateLimit',
     windowMs: config.windowMs || (15 * 60 * 1000),
     max: config.max || 100,
     expireTimeMs: config.expireTimeMs || (60 * 1000)
 });
 
 module.exports = limiter;
 