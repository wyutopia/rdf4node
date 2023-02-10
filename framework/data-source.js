/**
 * Created by Eric on 2023/02/08
 */
const mongoose = require('mongose');
//
const sysConf = require('./config');
const pubdefs = require('../include/sysdefs');
const eConnState = pubdefe.eConnectionState;
const sysEvents = require('../include/sys-events');
const tools = require('../utils/tools');
const {EventModule, EventObject} = require('./common');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'ds');

function _parseConnParams(config) {
    let params = [];
    let keys = Object.keys(config.parameters || {});
    if (keys.indexOf('authSource') === -1) { // authSource not exists!
        params.push(`authSource=${config.authSource || config.db}`);
    }
    keys.forEach(key => {
        params.push(`${key}=${config.parameters[key]}`);
    });

    return params.join('&');
}

function _initMongoConnection(config) {
    const options = {
        useUnifiedTopology: true,
        useNewUrlParser: true
    };
    let host = config.host || `${config.ip}:${config.port}`;
    let connParams = _parseConnParams(config);
    let uri = `mongodb://${config.user}:${encodeURIComponent(config.pwd)}` 
                    + `@${host}/${config.db || ''}?${connParams}`;
    logger.info(`>>> Create mongodb connection with ${uri}`);
    this._conn = mongoose.createConnection(uri, options);
    this.isConnected = true;
}

function _initMySqlConnection(config) {

}

// The class
class DataSource extends EventObject {
    constructor(props) {
        super(props);
        // Declaring member variables
        this.conf = props.conf || {};
        this.isConnected = false;
        this._models = {};
        // Implenting event handlers
        this.getModel = (modelName, modelSchema) => {
            if (!this.isConnected) {
                return null;
            }
            if (this._models[modelName] === undefined) {
                this._models[modelName] = this._conn.model(modelName, modelSchema);
            }
            return this._models[modelName];
        };
        //
        (() => {
            switch(this._conf.type) {
                case pubdefs.eDbType.MONGO:
                    _initMongoConnection.call(this, this._conf.config);
                    break;
                case pubdefs.eDbType.MYSQL:
                    _initMySqlConnection.call(this, this._conf.config);
                    break;
                default:
                    break;
            }
        })();
    }
}

// The factory class
class DataSourceFactory extends EventModule {
    constructor(props) {
        super(props);
        //
        this._ds = {};
        // Implementing methods
        this.getEntries = () => {
            return Object.entries(this._ds);
        }
        this.getDataSource = (name) => {
            return this._ds[name];
        };
        this._msgProc = (msg, ackOrNack) => {
            //TODO: Handler message
            if (typeof ackOrNack === 'function') {
                return ackOrNack(true);
            }
        };
        // The init codes
        (() => {
            let dsConf = sysConf.dataSources || {};
            Object.keys(dsConf).forEach(dsName => {
                this._ds[dsName] = new DataSource({
                    name: dsName,
                    conf: dsConf[dsName]
                });
            });
            //
            if (this._ds['default'] === undefined) {
                this._ds['default'] = new DataSource({
                    name: 'default',
                    conf: {}
                })
            }
        })();
    }
}

module.exports = exports = new DataSourceFactory({
    name: '_DataSourceFactory_'
});