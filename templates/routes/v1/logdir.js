/**
 * Created by Eric on 2022/09/22
 */
 const {pubdefs, logDir} = require('../../applications');
 
 module.exports = exports = [
     {
         path: 'list',
         method: 'GET',
         authType: pubdefs.eRequestAuthType.JWT,
         handler: logDir.listDir
     },
     {
         path: 'clear',
         method: 'POST',
         authType: pubdefs.eRequestAuthType.JWT,
         handler: logDir.cleanDir
     },
     {
         path: 'delete',
         method: 'POST',
         authType: pubdefs.eRequestAuthType.JWT,
         handler: logDir.removeFiles
     },
     {
         path: 'download/:filename',
         method: 'GET',
         authType: pubdefs.eRequestAuthType.JWT,
         handler: logDir.downloadFile
     },
     {
         path: 'file/:filename',
         method: 'GET',
         authType: pubdefs.eRequestAuthType.JWT,
         handler: logDir.downloadFile
     }
 ];