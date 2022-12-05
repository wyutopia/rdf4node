/**
 * Created by Eric on 2021/12/14
 */
 const pubdefs = require("../../include/sysdefs");
 const mntService = require('../base/prom.wrapper');
 
 const gIgnoredUrls = [
     '/monitor/health',
     '/monitor/metrics'
 ];
 
 const eHttpMetrics = {
     REQ_TOTAL : 'requests_received_total',
     REQ_CODE_TOTAL: 'requests_status_code_total'
 };
 
 let metricsCollector = mntService.regMetrics({
     moduleName: 'http',
     metrics: [{
         name: eHttpMetrics.REQ_TOTAL,
         type: pubdefs.eMetricType.COUNTER,
         labelNames: ['url']
     }, {
         name: eHttpMetrics.REQ_CODE_TOTAL,
         type: pubdefs.eMetricType.COUNTER,
         labelNames: ['url', 'status_code']
     }]
 });
 
 module.exports = exports = function (req, res, next) {
     res.on('finish', () => {
         let originalUrl = req.originalUrl || req.url;
         if (gIgnoredUrls.indexOf(originalUrl) === -1) {
             metricsCollector[eHttpMetrics.REQ_TOTAL].inc({url: originalUrl}, 1)
             metricsCollector[eHttpMetrics.REQ_CODE_TOTAL].inc({url: originalUrl, 'status_code': res.statusCode}, 1)
         }
     });
     next();
 };