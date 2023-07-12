/**
 * Created by Eric 2021/11/16
 */
 const assert = require('assert');
 const EventEmitter = require('events');
 //
 const pubdefs = require('../include/sysdefs');
 const ePrimitives = pubdefs.ePrimitives;
 const theApp = require('../app');
 const tools = require('../utils/tools');
 const mntService = require('./base/prom.wrapper');
 
 const {WinstonLogger} = require('./base/winston.wrapper');
 const logger = WinstonLogger(process.env.SRV_ROLE || 'evm');
 
 const eFsmFlag = {
     REDIRECT   : -1,
     INVALID    : 0
 };
 exports.eFsmFlag = eFsmFlag
 
 const FSMSTATE_IDLE = 'idle';
 const LOGOUT_THRESHOLD = 200;
 
 /**
  * Class EventFsm
  * @param options
  * @constructor
  */
 class EventFsm extends EventEmitter {
     constructor (options) {
        assert(options !== undefined);
        this.id = options.id;
        this.mid = options.mid;
        this.state = options.state;
        this.self = () => {
            return {
                nid: 0,
                mid: this.mid,
                pid: this.id
            };
        }
        //
        this.createTimer = (callback, timeout) => {
            assert(typeof callback === 'function');
            return setTimeout(callback.bind(this), timeout || pubdefs.eInterval._5_MIN);
        }
        this.killTimer = (hTimer) => {
            if (hTimer !== null) {
                clearTimeout(hTimer);
                hTimer = null;
            }
        }
        this.dispose = () => {
            theApp.sendMessage({
                host: {
                    mid: this.mid
                },
                sender: this.self(),
                primitive: ePrimitives.MODULE_FSM_DISPOSE,
                data: {
                    pid: this.id
                }
            })
        }
     }
 }
 exports.EventFsm = EventFsm;
 
 class NetThread extends EventFsm {
     constructor(options) {
         assert(options !== undefined);
         super(options);
         //
         this.sendStartTcpSrvReq = (pkt) => {
             theApp.sendMessage({
                 host: {
                     mid: 'ntm'
                 },
                 sender: this.self(),
                 primitive: ePrimitives.NTP_TCPSRV_START_REQ,
                 data: pkt
             });
         }
         this.sendStartTcpSrvRsp = (err) => {
             theApp.sendMessage({
                 host: this.peer,
                 sender: this.self(),
                 primitive: ePrimitives.NTP_TCPSRV_START_RSP,
                 data: err? err : {code: 0, message: 'Normal'}
             });
         }
         this.sendConnectReq = (pkt) => {
             theApp.sendMessage({
                 host: {
                     mid: 'ntm'
                 },
                 sender: this.self(),
                 primitive: ePrimitives.NTP_CONNECT_REQ,
                 data: pkt
             });
         }
         this.sendConnectRsp = (err) => {
             theApp.sendMessage({
                 host: this.peer,
                 sender: this.self(),
                 primitive: ePrimitives.NTP_CONNECT_RSP,
                 data: err? err : {code: 0, message: 'Normal'}
             });
         }
         this.sendClientInd = () => {
             theApp.sendMessage({
                 host: this.peer,
                 sender: this.self(),
                 primitive: ePrimitives.NTP_CLIENT_IND
             })
         }
         this.sendClientCnf = () => {
             theApp.sendMessage({
                 host: this.peer,
                 sender: this.self(),
                 primitive: ePrimitives.NTP_CLIENT_CNF
             });
         }
         this.sendDataStreamReq = (pkt) => {
             theApp.sendMessage({
                 host: this.peer,
                 sender: this.self(),
                 primitive: ePrimitives.NTP_DATASTREAM_REQ,
                 data: pkt
             });
         }
         this.sendDataStreamInd = (trunk) => {
             theApp.sendMessage({
                 host: this.peer,
                 sender: this.self(),
                 primitive: ePrimitives.NTP_DATASTREAM_IND,
                 data: trunk
             });
         }
         this.sendDisconnReq = (err) => {
             theApp.sendMessage({
                 host: this.peer,
                 sender: this.self(),
                 primitive: ePrimitives.NTP_DISCONNECT_REQ,
                 data: err? err : {code: 0, message: 'Normal'}
             });
         }
         this.sendDisconnInd = (err) => {
             theApp.sendMessage({
                 host: this.peer,
                 sender: this.self(),
                 primitive: ePrimitives.NTP_DISCONNECT_IND,
                 data: err? err : {code: 0, message: 'Normal'}
             });
         }
     }
 }
 exports.NetThread = NetThread;
 
 async function _setActFsmGauge() {
     return Object.keys(this.fsm).length;
 }
 /**
  * Class EventModule
  * @param options
  * @constructor
  */
 class EventModule extends EventEmitter {
     constructor(options) {
         assert(options !== undefined);
         super(options);
         // Declaring member variables
         this.$name = options.name || 'BaseEventModule';
         this.mandatory = options.mandatory || false;
         this.state = options.state || pubdefs.eModuleState.ACTIVE;
         this.verbose = options.verboseOn || false;
         this.maxThreads = options.maxThreads || 0;
         this.fsm = {};
         this.currFsm = null;
         this.logCount = 0;
         // Implementing member methods
         this.getName = () => {
             return this.$name;
         }
         this.fsmConstructor = options.fsmConstructor || EventFsm;
 
         this.allocFsm = () => {
             if (this.maxThreads > 0 && Object.keys(this.fsm).length >= this.maxThreads) {
                 logger.error(`${this.$name}: Out of threads! Wait for a moment and re-try again!`);
                 return null;
             }
             try {
                 let pid = tools.uuidv4();
                 this.fsm[pid] = new this.fsmConstructor({
                     id: pid,
                     mid: this.$name,
                     state: FSMSTATE_IDLE
                 });
                 //logger.info(__file, __line, this.$name, ', new FSM allocated: ', pid);
                 return pid;
             } catch (err) {
                 logger.error(`${this.$name}: Allocate thread failed! - ${err.message}`);
                 return null;
             }
         }
         this.redirFsm = () => {
            logger.debug(`${this.$name}: redirFsm called.`);
            return null;
        }
         this.freeFsm = (pid) => {
            logger.debug(`${this.$name}: freeFsm called, pid=${pid}`);
            if (this.fsm[pid] !== undefined) {
                delete this.fsm[pid];
            } else {
                logger.error(`${this.$name}: pid=${pid}, Fsm does not exists!`);
            }
        }
         // event handlers
         this.on('MESSAGE', (msg) => {
             setImmediate(_onMessage.bind(this, msg));
         });
         //
         (() => {
             mntService.regMetrics({
                 moduleName: this.$name,
                 metrics: [{
                     name: 'active_fsm',
                     type: pubdefs.eMetricType.GAUGE,
                     fnCollectAsync: _setActFsmGauge.bind(this)
                 }]
             });
         })();
     }
 }
 
 function _onMessage(msg) {
     let ret = 0;
     this.logCount++;
     if (this.verbose) {
        logger.debug(`${this.$name}: OnMessage - ${tools.inspect(msg)}`);
     } else {
        logger.debug(`${this.$name}: OnMessage - ${tools.inspect(msg.host)}, ${tools.inspect(msg.sender)}, ${msg.primitive}`);
     }
     let re = new RegExp(/^MODULE_/);
     if (re.test(msg.primitive)) {  // Handle MODULE_XX message first
         switch(msg.primitive) {
             case ePrimitives.MODULE_FSM_DISPOSE:
                 _onDisposeFsm.call(this, msg);
                 break;
             case ePrimitives.MODULE_START:
                 break;
             case ePrimitives.MODULE_STOP:
                 break;
         }
         return null;
     }
     if (msg.host.pid === eFsmFlag.REDIRECT) {
         msg.host.pid = this.redirFsm();
     } else if (!msg.host.pid) {
         msg.host.pid = this.allocFsm();
     }
     if (!msg.host.pid) {
         logger.error(`${this.$name}: Invalid host-pid! discard message.`);
         return null;
     }
     this.currFsm = this.fsm[msg.host.pid];
     if (this.currFsm) {
         this.currFsm.emit(msg.primitive, msg);
         ret = 1;
     } else {
         logger.error(`${this.$name}: Invalid fsm!`);
     }
     return ret;
 }
 
 function _onDisposeFsm(msg) {
     //logger.debug(__file, __line, this.$name, 'MODULE_FSM_DISPOSE received with options:', msg.data.pid);
     //logger.debug(__file, __line, 'Before dispose:', tools.inspect(Object.keys(this.fsm)));
     let fsm = this.fsm[msg.data.pid];
     if (fsm !== undefined) {
         delete this.fsm[msg.data.pid];
     }
     //logger.debug(__file, __line, 'After dispose:', tools.inspect(Object.keys(this.fsm)));
 }
 
 exports.EventModule = EventModule;
 