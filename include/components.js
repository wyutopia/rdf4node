/**
 * Create by Eric on 2022/01/05
 */
const EventEmitter = require('events');
const tools = require('../utils/tools');
const pubdefs = require('../include/sysdefs');
const eRetCodes = require('../include/retcodes');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'components');

function objectInit(props) {
    this.id = props.id || tools.uuidv4();
    this.name = props.name || 'Normal';
    this.type = props.type || pubdefs.eModuleType.OBJ;
}

function moduleInit(props) {
    //
    this.mandatory = true;
    this.state = props.state || pubdefs.eModuleState.INIT;
    this.isActive = () => {
        return this.state === pubdefs.eModuleState.ACTIVE;
    }
}

class CommonObject {
    constructor(props) {
        objectInit.call(this, props);
        // Additional properties go here ...
    }
}
exports.CommonObject = CommonObject;

class CommonModule extends CommonObject {
    constructor(props) {
        super(props);
        moduleInit.call(this, props);
        // Additional properties go here ...
    }
}
exports.CommonModule = CommonModule;

class EventObject extends EventEmitter {
    constructor(props) {
        super(props);
        objectInit.call(this, props);
        // Additional properties go here ...
    }
}
exports.EventObject = EventObject;

class EventModule extends EventObject {
    constructor(props) {
        super(props);
        moduleInit.call(this, props);
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
    Conn: 'connected',
    ConnErr: 'connerr',
    Querying: 'querying',
    PClosing: 'pclosed',
    ClosePending: 'closepending',
    Closing: 'closing',
    Pending: 'pending',
    Closed: 'closed'
};
exports.eClientState = eClientState;
exports.eConnectionState = eClientState;

const eServerState = {
    Null: 'null',
    Init: 'init'
};
exports.eServerState = eServerState;