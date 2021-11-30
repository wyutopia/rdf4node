/**
 * Created by eric on 2021/11/09.
 */
 const appRootPath = require('app-root-path');
 const fs = require('fs');
 const path = require('path');
 const morgan = require('morgan');
 const tools = require('../../utils/tools');
 
 morgan.token('xforwarded', function(req, res){
     return tools.getClientIp(req);
 });
 
 let appName = process.env.SRV_ROLE || 'app';
 let logDir = process.env.LOG_DIR || path.join(appRootPath.path, 'logs');
 morgan.format(appName, ':xforwarded - [:date[iso]] ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms ":referrer" ":user-agent"');
 
 function morganWrapper(proc) {
     let accessLogStream = fs.createWriteStream(path.join(logDir, `${proc}-access.log`), {flags: 'a'});
     let options = {};
     if (process.env.NODE_ENV === 'production') {
         options = {
             skip: function (req, res) { return res.statusCode < 400 },
             stream: accessLogStream
         };
     }
     return morgan(appName, options);
 }
 
 module.exports = exports = morganWrapper;
 