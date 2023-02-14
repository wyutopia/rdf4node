/**
 * Created by Eric on 2023/02/12
 */
const config = require('../framework/config');
module.exports = exports = {
    // The modules
    sysConf             : config,
    expressWrapper      : require('./base/express.wrapper'),
    promWrapper         : require('./base/prom.wrapper'),
    winstonWrapper      : require('./base/winston.wrapper'),
    // The classes
    MorganWrapper       : require('./base/morgan.wrapper')
};