/**
 * Created by Eric 2021/06/17
 */
const {
  pubdefs, monitor
} = require('../app');

module.exports = exports = {
  scope: pubdefs.eResourceScope.Public,
  routes: [
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
  ]
};