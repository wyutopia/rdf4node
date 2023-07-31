/**
 * Created by Eric on 2022/01/17
 */
// Global modules
const assert = require('assert');
const async = require('async');
const net = require('net');

// Project modules
const theApp = global._$theApp;
const sysdefs = require('../../include/sysdefs');
const eClientState = sysdefs.eClientState;
const {EventObject} =  require('../../include/events');
const mntService = require('../base/prom.wrapper');
const {WinstonLogger} = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'grpc');
const tools = require('../../utils/tools');
const eRetCodes = require('../../include/retcodes');

const MODULE_NAME = 'NET_CONN';
const eMetricsName = {
    tcpConnectAttempt: 'tcp_connect_attempt',
    tcpConnectSuccess: 'tcp_connect_success',
    tcpConnectFailed: 'tcp_connect_failed',
    tcpListenAttempt: 'tcp_listen_attempt',
    tcpListenSuccess: 'tcp_listen_success',
    tcpListenFailed: 'tcp_listen_failed',
    tcpSendAttempt: 'tcp_send_attempt',
    tcpSendSuccess: 'tcp_send_success',
    tcpSendFailed: 'tcp_send_failed',
    //
    udpListenAttempt: 'udp_listen_attempt',
    udpListenSuccess: 'udp_listen_success',
    udpListenFailed: 'udp_listen_failed',
    udpSendAttempt: 'udp_send_attempt',
    udpSendSuccess: 'udp_send_success',
    udpSendFailed: 'udp_send_failed',
};

const metricsCollector = mntService.regMetrics({
    moduleName: MODULE_NAME,
    metrics: [{
        name: eMetricsName.tcpConnectAttempt,
        type: sysdefs.eMetricType.COUNTER
    }, {
        name: eMetricsName.tcpConnectSuccess,
        type: sysdefs.eMetricType.COUNTER
    }, {
        name: eMetricsName.tcpConnectFailed,
        type: sysdefs.eMetricType.COUNTER
    }]
});

class TcpServer extends EventObject {
    constructor(options) {
        super(options);
        //
        this.state = eClientState.Null;
    }
}
exports.TcpServer = TcpServer;

/**
 * The TcpClient Object
 */
class TcpClient extends EventObject {
    constructor(options) {
        super(options);
        //
        this.client = null;
        this.state = eClientState.Null;
        this.disposeCallback = null;
        // Implements member methods
        this.dispose = (callback) => {
           if (this.state !== eClientState.Conn) {
               return callback();
           }
           this.state = eClientState.Closing;
           this.client.end();
           this.disposeCallback = callback;
        }
        this.connect = (options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {
                    ip: '127.0.0.1',
                    port: 3000
                }
            }
            if (this.state !== eClientState.Null) {
                return callback({
                    code: eRetCodes.CONFLICT,
                    message: 'Active connection exists.'
                });
            }
            // Connecting event sequence: 
            // 1. Connecting failure: error -> close
            // 2. Connect success: data
            // 3. Disconnect from peer: end -> close
            // 4. Disconnect from local: end -> close
            // 5. TODO: Network error!
            this.state = eClientState.Init;
            let client = net.createConnection({
                host: options.ip || '127.0.0.1',
                port: options.port || 3000,
                timeout: options.connectTimeoutMs || sysdefs.eInterval._3_SEC
            }, () => {
                logger.debug(`${this.$name}[${this.state}]: server connected.`);
                this.client = client;
                this.state = eClientState.Conn;
                return callback();
            });
            client.on('error', err => {
                if (this.state === eClientState.Init) {
                    logger.error(`${this.$name}[${this.state}]: Connecting failed! - ${err.message}`);
                    this.state = eClientState.ConnErr;
                    return callback(err);
                }                     
                logger.debug(`${this.$name}[${this.state}]: Connection error! - ${err.message}`);
                this.state = eClientState.ConnErr;
            });
            client.on('data', trunk => {
                logger.debug(`${this.$name}[${this.state}]: on [DATA] event: ${tools.inspect(trunk)}`);
                if (typeof this.onData === 'function') {
                    setImmediate(this.onData.bind(this, trunk));                
                }
            });
            client.on('end', () => {
                logger.debug(`${this.$name}[${this.state}]: on [END] event...`);
                if (typeof this.onEnd === 'function') {
                    setImmediate(this.onEnd.bind(this));
                }
            });
            client.on('close', () => {
                logger.debug(`${this.$name}[${this.state}]: on [CLOSE] event...`);
                this.state = eClientState.Null;
                this.client = null;
                if (this.disposeCallback) {
                    this.disposeCallback.call(this);
                    this.disposeCallback = null;
                }
                if (typeof this.onClose === 'function') {
                    setImmediate(this.onClose.bind(this));
                }
            });
        }
        this.sendData = (data, callback) => {
            logger.debug(`${this.$name}[${this.state}]: send data - ${tools.inspect(data)}`);
            if (this.state !== eClientState.Conn) {
                return callback({
                    code: eRetCodes.METHOD_NOT_ALLOWED,
                    message: 'Connection lost!'
                });
            }
            return this.client.write(data, callback);
        }
    }
}
exports.TcpClient = TcpClient;

class UdpServer extends EventObject {
    constructor(options) {
        super(options);
        //
    }
}
exports.UdpServer = UdpServer;
