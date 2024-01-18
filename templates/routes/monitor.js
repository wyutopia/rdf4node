/**
 * Created by Eric 2021/06/17
 */
 const {monitor} = require('../applications');

 module.exports = exports = [
   {
     path: 'metrics',
     method: 'get',
     authType: 'none',
     handler: monitor.getMetrics
   }, {
     path: 'health',
     method: 'get',
     authType: 'none',
     handler: monitor.checkHealth
   }
 ];