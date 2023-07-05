/**
 * Created by Eric on 2021/11/09.
 */
 const appRootPath = require('app-root-path');
 const fs = require('fs');
 const path = require('path');
 const morgan = require('morgan');
 const tools = require('../../utils/tools');
 
 morgan.token('xforwarded', function(req, res){
     return tools.getClientIp(req);
 });
 
 const appName = process.env.SRV_ROLE || 'app';
 const LOG_DIR = process.env.LOG_DIR || path.join(appRootPath.path, 'logs');
 const QUITE_LOG = (process.env.NODE_ENV === 'production' && process.env.ACCESS_LOG_ALL === undefined);

 morgan.format(appName, ':xforwarded - [:date[iso]] ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms ":referrer" ":user-agent"');
 
 function MorganWrapper(proc) {
     let accessLogStream = fs.createWriteStream(path.join(LOG_DIR, `${proc}-access.log`), {flags: 'a'});
     let options = {
        stream: accessLogStream
     };
     if (QUITE_LOG) {
         options.skip = function (req, res) {
            return res.statusCode < 400;
         };
     }
     return morgan(appName, options);
 }
 
 module.exports = exports = MorganWrapper;
 