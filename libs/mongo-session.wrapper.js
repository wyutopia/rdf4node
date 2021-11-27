/**
 * Created by eric on 16/6/13.
 */
 let assert = require('assert');
 const {mongodb: config} = require('../common/config');
 let session = require('express-session');
 let MongoDBStore = require('connect-mongodb-session')(session);
 
 function sessionStore (collect) {
    let connUri = `mongodb://${config.user}:${encodeURIComponent(config.pwd)}` 
            + `@${config.ip}:${config.port || 27017}/${config.db}?authSource=${config.authSource || config.db}`;
     let store = new MongoDBStore({
         uri: connUri,
         collection: collect,
         connectionOptions: {
             useUnifiedTopology: true,
             useNewUrlParser: true
         }
     });
 
     // Catch errors
     store.on('error', function(err){
         assert.ifError(err);
         assert.ok(false);
     });
     return store;
 }
 
 module.exports = exports = sessionStore;