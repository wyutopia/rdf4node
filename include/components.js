/**
 * Create by Eric on 2022/01/05
 */
const EventEmitter = require('events');
const tools = require('../utils/tools');
const pubdefs = require('../include/sysdefs');
const eRetCodes = require('../include/retcodes');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'components');

function _bootstrapInit(options) {
    this.id = options.id || tools.uuidv4();
    this.name = options.name || 'Normal';
    this.type = options.type || pubdefs.eModuleType.APP;
    //
    this.mandatory = true;
    this.state = pubdefs.eModuleState.INIT;
}

class CommonModule {
    constructor(options) {
        _bootstrapInit.call(this, options);
        //
    }
}

class EventModule extends EventEmitter {
    constructor(options) {
        _bootstrapInit.call(this, options);
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