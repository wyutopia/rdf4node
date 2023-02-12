/**
 * Created by Eric on 2022/07/29
 */
const fs = require('fs');
const path = require('path');
// Framework libs
const sysdefs = require('../../include/sysdefs');
const theApp = require('../../bootstrap');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf');

const MODULE_NAME = "es";

exports.buildConfig = function (options) {
    let config = {};
    // Add node
    config.node = options.node || 'https://localhost:9200';
    config.auth = options.auth || {
        username: 'elastic',
        password: 'password'
    };
    if (options.caFingerprint) {
        config.caFingerprint = options.caFingerprint;
    }
    if (options.caFilePath) {
        options.tls = {
            ca: fs.readFileSync(options.caFilePath),
            rejectUnauthorized: false
        }
    }
    return config;
};

class EsClient {
    constructor(props) {

    }
};

exports.createClient = function (config) {
    let client = new ElasticseachClient({
        name: '',
        config: config
    });
    return client;
};
