/**
 * Create by Eric on 2022/01/05
 */
const EventEmitter = require('events');
const tools = require('../utils/tools');
const pubdefs = require('../include/sysdefs');
const eRetCodes = require('../include/retcodes');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'components');

function objectInit(options) {
    this.id = options.id || tools.uuidv4();
    this.name = options.name || 'Normal';
    this.type = options.type || pubdefs.eModuleType.OBJ;
}

function moduleInit(options) {
    //
    this.mandatory = true;
    this.state = options.state || pubdefs.eModuleState.INIT;
    this.isActive = () => {
        return this.state === pubdefs.eModuleState.ACTIVE;
    }
}

class CommonObject {
    constructor(options) {
        objectInit.call(this, options);
        //
    }
}
class CommonModule extends CommonObject {
    constructor(options) {
        super(options);
        moduleInit.call(this, options);
        //
    }
}
exports.CommonModule = CommonModule;

class EventModule extends EventEmitter {
    constructor(options) {
        super(options);
        objectInit.call(this, options);
        moduleInit.call(this, options);
        //
        this._msgProc = (msg, ackOrNack) => {
            //TODO: Handle msg
            return ackOrNack();
        }
        this.on('message', (msg, ackOrNack) => {
            setImmediate(this._msgProc.bind(this, msg, ackOrNack));
        });
    }
}
exports.EventModule = EventModule;

const eClientState = {
    Null: 'null',
    Init: 'init',
    Conn: 'conn',
    PClosing: 'pclose',
    Closing: 'closing',
    Pending: 'pending'
};
exports.eClientState = eClientState;
exports.eConnectionState = eClientState;