/**
 * Created by Eric on 2024/03/28
 */
const async = require('async');
const path = require('path');
const EventEmitter = require('events');
const util = require('util');
// Framework libs
const tools = require('../utils/tools');
const sysdefs = require('../include/sysdefs');
const _MODULE_NAME = sysdefs.eFrameworkModules.DLOCKER;
const eRetCodes = require('../include/retcodes');
const { CommonObject } = require('../include/base');
// Create logger
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);


// The class
class LicenseManager extends CommonObject {
    constructor(props) {
        super(props);
        //
    }
    reserveLicense = async function() { return null; }
    applyLicense = async function ({licId, appId, quantity}) { return 'noop'; }
    refundLicense = async function ({licId, appId, quantity}, applied) { return 'noop'; }    
    closeReservation = async function({licId, appId, quantity}, applied) { return 'noop'; }
    async init(config) {
        // TODO:...
        return true;
    }
}

//
module.exports = exports = { LicenseManager };