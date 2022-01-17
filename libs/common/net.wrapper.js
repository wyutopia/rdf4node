/**
 * Create by Eric 2022/01/17
 */
// Global modules
const assert = require('assert');
const async = require('async');
const net = require('net');

// Project modules
const theApp = require('../../bootstrap');
const pubdefs = require('../../include/sysdefs');
const {EventObject, eClientState} =  require('../../include/components');
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
        type: pubdefs.eMetricType.COUNTER
    }, {
        name: eMetricsName.tcpConnectSuccess,
        type: pubdefs.eMetricType.COUNTER
    }, {
        name: eMetricsName.tcpConnectFailed,
        type: pubdefs.eMetricType.COUNTER
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
        // Implements member methods
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
            this.state = eClientState.Init;
            let client = net.createConnection({
                host: options.ip || '127.0.0.1',
                port: options.port || 3000,
                timeout: options.connectTimeoutMs || pubdefs.eInterval._3_SEC
            }, () => {
                logger.debug(`${this.name}[${this.state}]: on createConnection callback...`);
                if (this.state === eClientState.Init) {
                    this.client = client;
                    this.state = eClientState.Conn;
                    return callback();
                }
            });
            client.on('error', err => {
                logger.debug(`${this.name}[${this.state}]: on [ERROR] event...`);
                if (this.state === eClientState.Init) {
                    logger.error(`${this.name}[${this.state}]: Connecting failed! - ${err.message}`);
                    this.state = eClientState.ConnErr;
                }
            });
            client.on('data', trunk => {
                logger.debug(`${this.name}[${this.state}]: on [DATA] event...`);
                setImmediate(this.onRawData.bind(this, trunk));
            });
            client.on('end', () => {
                logger.debug(`${this.name}: on [END] event...`);
            });
            client.on('close', () => {
                logger.debug(`${this.name}[${this.state}]: on [CLOSE] event...`);
                if (this.state === eClientState.ConnErr) {
                    this.state = eClientState.Null;
                }
            });
        }
        this.sendData = (data, callback) => {
            logger.debug(`${this.name}: TODO: send data...`);
            return callback();
        }
        this.onRawData = (trunk) => {
            logger.debug(`${this.name}: TODO: onRawData ...`);
        }
        this.onPacketData = (pkt) => {
            logger.debug(`${this.name}: TODO: onPacketData ...`);
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
