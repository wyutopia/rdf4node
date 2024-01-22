/**
 * All callback methods have the following signature function(err, data, res).
 * err (Error, optional): set if there was an error, otherwise falsy
 * data (Object, optional): response data if any, otherwise undefined
 * res (http.IncomingMessage, optional): HTTP response object with additional body property. This might
 *   not exist when err is set. The body property can be a decoded object, string, or Buffer.
 */
const Consul = require('consul');
//
const eRetCodes = require('../../include/retcodes');
const tools = require('../../utils/tools');
const { WinstonLogger } = require('./winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'consul');

// Declaring module scope error object
const connErr = {
    code: eRetCodes.METHOD_NOT_ALLOWED,
    message: 'Consul not connected!'
};

/**
 * consul.catalog.service  methods
 */
// List services
// exports.listServices = function (callback) {
//     if (consul === null) {
//         return callback(connErr);
//     }
//     consul.catalog.service.list().then(result => {
//         logger.debug(`List services: ${tools.inspect(result)}`);
//         return callback(null, result);
//     }).catch(err => {
//         logger.error(`list services error! - ${err.code}#${err.message}`);
//         return callback(err);
//     });
// }

// List nodes of service
// exports.listServiceNodes = function (serviceName, callback) {
//     if (consul === null) {
//         return callback(connErr);
//     }
//     consul.catalog.service.nodes(serviceName).then(result => {
//         logger.debug(`List service nodes: ${tools.inspect(result)}`);
//         return callback(null, result);
//     }).catch(err => {
//         logger.error(`list nodes of service error! - ${err.code}#${err.message}`);
//         return callback(err);
//     });
// }



// Maintenance
// exports.maintainService = function (options, callback) {
//     if (consul === null) {
//         return callback(connErr);
//     }
//     if (options.id === undefined) {
//         return callback({
//             code: eRetCodes.OP_FAILED,
//             message: 'Unrecognized service ID'
//         });
//     }
//     if (options.reason === undefined) {
//         options.reason = 'Manual set';
//     }
//     consul.agent.service.maintenance(options).then((data, result) => {
//         logger.info('service.maintenacne: ', data, result);
//         return callback(null, data, result);
//     }).catch(err => {
//         logger.error('service.maintenance: ', err.code, err.message);
//         return callback(err);
//     });
// };

/**
 * consul.acl
 */
//consul.acl.bootstrap(onCallback.bind(null, 'acl.bootstrap'));

/**
 * consul agent
 */
//consul.agent.members(onCallback.bind(null, 'agent.members'));
//consul.agent.reload(onCallback.bind(null, 'agent.reload'));
//consul.agent.self(onCallback.bind(null, 'agent.self'));
//consul.agent.maintenance(true, onCallback.bind(null, 'agent.maintenance'));
//consul.agent.join('127.0.0.1', onCallback.bind(null, 'agent.join'));
//consul.agent.forceLeave('node2', onCallback.bind(null, 'agent.forceLeave'));


// Returns the checks the agent is managing


// Deregister a check
//consul.agent.check.deregister('example', onCallback(null, 'agent.check.example'));

// Returns the checks the agent is managing
//consul.agent.check.list(onCallback.bind(null, 'agent.check.list'));


class ConsulClient {
    constructor(props) {
        this._consul = null;
        //
        (() => {
            try {
                this._consul = new Consul({
                    host: props.host,    // String: agent address
                    port: props.port     // Integer: agent port
                });
            } catch (ex) {
                logger.info(`Create consul client error! - ${ex.message}`);
            };
        })();
    }
    // Register
    async regService(options) {
        logger.info(`Register service: ${tools.inspect(options)}`);
        if (!this._consul) {
            return Promise.reject('Consul not configured!');
        }
        await this._consul.agent.service.register(options);
    }
    // Deregister
    async deregService(options) {
        logger.info(`De-register service: ${tools.inspect(options)}`);
        if (!this._consul) {
            return  Promise.reject('No Consul registration!');
        }
        if (options.id === undefined) {
            return Promise.reject('Service id not provided!');
        }
        await this._consul.agent.service.deregister(options);
    }
    // consul kv
    async setKv(key, val) {
        return this._consul.kv.set(key, val);
    }
    async getKv(key) {
        let options = {
            key: key,
            raw: true
        }
        return await this._consul.kv.get(options);
    }
}


// Define module
module.exports = exports = {
    ConsulClient
}