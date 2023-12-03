/**
 * Created by Eric on 2023/02/08
 */
const assert = require('assert');
const mongoose = require('mongoose');
//
const sysdefs = require('../include/sysdefs');
const _MODULE_NAME = sysdefs.eFrameworkModules.DATASOURCE;
const {EventModule, EventObject} = require('../include/events');
const sysConf = require('../include/config');
const {WinstonLogger} = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');

function _initMongoConnection(config) {
    const options = {
        useUnifiedTopology: true,
        useNewUrlParser: true
    };
    let uri = tools.packMongoUri(config);
    logger.info(`>>> Create mongodb connection with ${uri}`);
    this._conn = mongoose.createConnection(uri, options);
    this.isConnected = true;
}

function _initProcMemoryStorage(config) {
    this._memStorage = {};
}

function _initMySqlConnection(config) {

}

// The class
class DataSource extends EventObject {
    constructor(props) {
        super(props);
        // Save class properites
        this.dbType = props.dbType || sysdefs.eDbType.NATIVE;
        this.conf = props.conf || {};
        // Declaring member variables
        this.isConnected = false;
        this._models = {};
        // Implenting event handlers
        this.getModel = (modelName, modelSchema) => {
            assert(modelName !== undefined && modelSchema !== undefined);
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
            switch(this.dbType) {
                case sysdefs.eDbType.NATIVE:
                    _initProcMemoryStorage.call(this, this.conf);
                    break;
                case sysdefs.eDbType.MONGO:
                    _initMongoConnection.call(this, this.conf);
                    break;
                case sysdefs.eDbType.MYSQL:
                    _initMySqlConnection.call(this, this.conf);
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
                if (dsConf[dsName].enabled === true) {
                    this._ds[dsName] = new DataSource({
                        name: dsName,
                        //
                        dbType: dsConf[dsName].type,
                        conf: dsConf[dsName].config
                    });
                } else {
                    logger.info(`DataSource: ${dsName} is disabled!`);
                }
            });
            //
            if (this._ds['default'] === undefined) {
                logger.error(`>>> Set default data-source to in-memory storage! <<<`);
                this._ds['default'] = new DataSource({
                    name: 'default',
                    dbType: sysdefs.eDbType.NATIVE,
                    conf: {}
                })
            }
        })();
    }
}

module.exports = exports = {
    dsFactory: new DataSourceFactory({
        name: _MODULE_NAME
    })
};