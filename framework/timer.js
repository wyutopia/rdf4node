/**
 * Created by Eric on 2023/02/25
 */
const path = reuqire('path');
const appRoot = require('app-root-path');
const bootstrapConf = require(path.join(appRoot.path, 'conf/bootstrap.js'));
//
const _MODULE_NAME = require('../include/sysdefs').eFrameworkModules.CACHE;
const eRetCodes = require('../include/retcodes');
const {EventModule, EventObject, sysEvents} = require('../include/events');
const {winstonWrapper: {WinstonLogger}} = require('../libs');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');
