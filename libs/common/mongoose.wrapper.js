/**
 * Created by eric on 2021/11/15.
 */
let assert = require('assert');
let mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
const pubdefs = require('../../include/sysdefs');
const theApp = require('../../bootstrap');
const {mongodb: config} = require('../base/config');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf');

const MODULE_NAME = 'MONGODB_CONN';
let conn = null;
// register module
theApp.regModule({
    name: MODULE_NAME,
    mandatory: true,
    state: pubdefs.eModuleState.INIT,
    dispose: (callback) => {
        try {
            logger.info('Disconnect from MongoDb...');
            if (conn === null) {
                logger.warn('MongoDb connection not exists!');
                return callback();
            }
            return conn.close(function (err) {
                if (err) {
                    logger.info('Close mongodb connection error!', err.code, err.message);
                } else {
                    logger.info('MongoDb disconnected.');
                }
                return callback();
            });
        }
        catch (ex) {
            logger.error('MongoDb cleanup error!', ex);
            return callback();
        }
    }
});

(async () => {
    try {
        const options = {
            useUnifiedTopology: true,
            useNewUrlParser: true
        };
        logger.info('Connect to MongoDb......');
        let connStr = `mongodb://${config.user}:${encodeURIComponent(config.pwd)}` 
                        + `@${config.ip}:${config.port || 27017}/${config.db}?authSource=${config.authSource || config.db}`;
        const result = await mongoose.connect(connStr, options);
        if (result) {
            conn = mongoose.connection;
            logger.info(`mongo-db@${process.env.NODE_ENV} connected!`);
            theApp.setModuleState(MODULE_NAME, pubdefs.eModuleState.ACTIVE);
        }
    } catch (err) {
        logger.error('Connect to MongoDb error!', err.code, err.message);
    }
})();

module.exports = mongoose;



 //http://mongoosejs.com/docs/middleware.html
 //https://mongoosejs.com/docs/deprecations.html#-findandmodify-

 //Replace update() with updateOne(), updateMany(), or replaceOne()
 //Replace remove() with deleteOne() or deleteMany().
 //Replace count() with countDocuments(),
 // unless you want to count how many documents are in the whole collection (no filter).
 // In the latter case, use estimatedDocumentCount().