/**
 * Created by Eric on 2021/11/09.
 */
const appRoot = require('app-root-path');
const path = require('path');
const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const tools = require('../../utils/tools');

morgan.token('xforwarded', function (req, res) {
    return tools.getClientIp(req);
});

const appName = process.env.SRV_ROLE || 'app';
const LOG_DIR = process.env.LOG_DIR || path.join(appRoot.path, 'logs');
const QUITE_LOG = (process.env.NODE_ENV === 'production' && process.env.ACCESS_LOG_ALL === undefined);

morgan.format(appName, ':xforwarded - [:date[iso]] ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms ":referrer" ":user-agent"');

function MorganWrapper(proc) {
    let accessLogStream = rfs.createStream(`${proc}-access.log`, {
        interval: '1d',
        path: LOG_DIR
    });
    let options = {};
    if (QUITE_LOG) {
        options.stream = accessLogStream;
        options.skip = function (req, res) {
            return res.statusCode < 400;
        };
    }
    return morgan(appName, options);
}

module.exports = exports = MorganWrapper;
