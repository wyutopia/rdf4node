/**
 * Create by Eric on 2022/01/05
 */
const EventEmitter = require('events');
const {objectInit, moduleInit, CommonObject, CommonModule} = require('./common');
const tools = require('../utils/tools');
const pubdefs = require('../include/sysdefs');
const eRetCodes = require('../include/retcodes');
const sysEvents = require('./sys-events');
const icp = require('../libs/base/icp');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'components');

exports.CommonObject = CommonObject;
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
        this.pubEvent = (event, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {
                    routingKey: event.code
                }
            }
            return icp.publish(event, callback);
        };
        this._msgProc = (msg, ackOrNack) => {
            //TODO: Handle msg
            return ackOrNack();
        };
        this.on('message', (msg, ackOrNack) => {
            //setImmediate(this._msgProc.bind(this, msg, ackOrNack));
            setTimeout(this._msgProc.bind(this, msg, ackOrNack), 10);
        });
        // Perform initiliazing codes...
        (() => {
            icp.register(this.name, this);
            // Subscribe events
            let allEvents = Object.values(sysEvents).concat(props.subEvents || []);
            icp.subscribe(allEvents, this.name);
        })();
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