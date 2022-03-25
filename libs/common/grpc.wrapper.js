/**
 * Created by Eric 2021/11/10
 */
// Global modules
const assert = require('assert');
const async = require('async');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
// Project modules
const pubdefs = require("../../include/sysdefs");
const theApp = require("../../bootstrap");
const {grpc: config} =  require('../base/config');
const mntService = require('../base/prom.wrapper');
const {WinstonLogger} = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'grpc');
const tools = require('../../utils/tools');

const MODULE_NAME_PREFIX = 'GRPC_PD';
/*********************************************
 * Set monitor metrics
 *********************************************/
const eMetricCounters = {
    pd                 : 'pd',
    clientTotal        : 'client_total',
    clientActive       : 'client_active'
}
const metricsCollector = mntService.regMetrics({
    moduleName: MODULE_NAME_PREFIX,
    metrics: [{
        name: eMetricCounters.pd,
        help: 'Number of ProtocolDescriptors',
        type: pubdefs.eMetricType.GAUGE,
        fnCollectAsync: async () => {
            return Object.keys(gDescriptors).length;
        }
    }, {
        name: eMetricCounters.clientActive,
        help: 'Number of active gRpc clients',
        type: pubdefs.eMetricType.GAUGE,
        fnCollectAsync: async () => {
            let count = 0;
            Object.keys(gDescriptors).forEach( key => {
                count += Object.keys(gDescriptors[key].clients).length;
            });
            return count;
        }
    }, {
        name: eMetricCounters.clientTotal,
        type: pubdefs.eMetricType.COUNTER
    }]
});

const LOAD_OPTIONS = {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
}
// Module packages
let gDescriptors = {};
class ProtoDescriptor {
    constructor(options) {
        logger.info(`Create new protobuf: ${tools.inspect(options)}`);
        let pkgDef = protoLoader.loadSync(options.file, LOAD_OPTIONS);
        // Declaring member variables
        this.id = options.key;
        this.name = `${MODULE_NAME_PREFIX}_${this.id}`;
        this.mandatory = false;
        //
        this.pd = grpc.loadPackageDefinition(pkgDef);
        this._package = this.pd[options.pkgName];
        this.Service = this._package[options.svcName];
        //
        this.ref = 1;
        this.servers = {};
        this.clients = {};
        // Implementing methods
        this.startServer = (port, methods, callback) => {
            if (this.servers[port] !== undefined) {
                return callback(null, this.servers[port]);
            }
            let server = new grpc.Server();
            server.addService(this.Service.service, methods);
            server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
                if (err) {
                    logger.error('>>>>>> gRpc server error!', err);
                    return callback(err);
                }
                logger.info('>>>>> gRpc server listening on port:', port);
                server.start();
                this.servers[port] = server;
                return callback(null, server);
            });
        }
        this.destroyServer = (port) => {
            logger.info(this.id, `Destroy server with listening port: ${port}`);
            let s = this.servers[options.port];
            if (s !== undefined) {
                s.close();
            } else {
                logger.error(this.id, `Server not exists! port=${port}`);
            }
        }
        /**
         * @param options = {ip, port, ttl}
         */
        this.createClient = (options) => {
            let target = `${options.ip}:${options.port}`;
            let client = this.clients[target];
            if (client === undefined) {
                client = {
                    service: new this.Service(target, grpc.credentials.createInsecure()),
                    refCount: 1,
                    tm : null,
                    ttl: options.ttl
                }
                this.clients[target] = client;
                metricsCollector[eMetricCounters.clientTotal].inc(1);
            } else {
                client.refCount++;
                clearTimeout(client.tm);
                client.tm = null;
            }
            client.lastActiveTime = new Date();
            client.tm = setTimeout(_onClientTtlTimeout.bind(this, target), options.ttl);
            return client;
        }
        this.dispose = (callback) => {
            logger.info(this.name, 'Start cleaning...');
            async.parallel([
                // Stop server
                (next) => {
                    return process.nextTick(next);
                },
                // Stop client
                (next) => {
                    let keys = Object.keys(this.clients);
                    let count = 0;
                    logger.info(this.name, 'Total', keys.length, 'clients need to be closed.');
                    async.each(keys, (key, cb) => {
                        let client = this.clients[key];
                        client.service.close();
                        if (client.tm !== null) {
                            clearTimeout(client.tm);
                            client.tm = null;
                        }
                        delete this.clients[key];
                        count++;
                        return process.nextTick(cb);
                    }, () => {
                        logger.info(this.name, count, 'clients has been closed.');
                        return next();
                    })
                }
            ], () => {
                logger.info(this.name, 'Cleaning succeed.');
                return callback();
            });
        }
        //
        (() => {
            theApp.regModule(this);
        })();
    }
}

function _onClientTtlTimeout(target) {
    let client = this.clients[target];
    if (client !== undefined) {
        if (client.refCount <= 0) {  // No references
            client.service.close();
            client.tm = null;
            delete this.clients[target];
            logger.debug(`${this.id}: ${target} client closed due to ttl!`);
        } else { // Restart ttl timer
            client.tm = setTimeout(_onClientTtlTimeout.bind(this, target), client.ttl);
            logger.info(`${this.id}: ${target} client timer reset. - ${client.refCount} - ${client.lastActiveTime}`);
        }
    } else {
        logger.error(`${this.id}: ${target} client not exists!`);
    }
}

/**
 *
 * @param options = {file, pkgName, svcName}
 * @returns {*}
 */
exports.getProtoDescriptor = (options) => {
    assert(options.file !== undefined);
    assert(options.pkgName !== undefined);
    assert(options.svcName !== undefined);
    let key = tools.genSign(JSON.stringify(options));
    logger.info(`load protobuf: ${key} ${tools.inspect(options)}`);
    if (gDescriptors[key] !== undefined) {
        gDescriptors[key].ref++;
    } else {
        let opts = Object.assign({key: key}, options);
        gDescriptors[key] = new ProtoDescriptor(opts);
    }
    return gDescriptors[key];
};


