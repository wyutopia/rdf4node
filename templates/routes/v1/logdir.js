/**
 * Created by Eric on 2022/09/22
 */
 const {pubdefs, logDirManager} = require('../../app');
 
 module.exports = exports = [
     {
         path: 'list',
         method: 'GET',
         authType: pubdefs.eRequestAuthType.JWT,
         handler: logDirManager.listDir
     },
     {
         path: 'clear',
         method: 'POST',
         authType: pubdefs.eRequestAuthType.JWT,
         handler: logDirManager.cleanDir
     },
     {
         path: 'delete',
         method: 'POST',
         authType: pubdefs.eRequestAuthType.JWT,
         handler: logDirManager.removeFiles
     },
     {
         path: 'download/:filename',
         method: 'GET',
         authType: pubdefs.eRequestAuthType.JWT,
         handler: logDirManager.downloadFile
     },
     {
         path: 'file/:filename',
         method: 'GET',
         authType: pubdefs.eRequestAuthType.JWT,
         handler: logDirManager.downloadFile
     }
 ];