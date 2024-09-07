/**
 * Created by Eric on 2024/07/15
 */
const {
    _DS_DEFAULT_,
    WinstonLogger
} = require('../app');
const logger = WinstonLogger();

//
module.exports = exports = [{
    name: 'xff',
    fn: function (req, res, next) {
        logger.debug(`++++++ The x-forwarded-for: ${req.headers['x-forwarded-for']}`);
        return next();
    }
}, {
    name: 'dataSource',
    fn: async function (req, res, next) {
        // TODO: Add your dsName here ...
        // Append dataSource
        req.dataSource = {
            dsName: _DS_DEFAULT_
        }
        return next();
    }
}]