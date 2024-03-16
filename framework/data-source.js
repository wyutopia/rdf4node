/**
 * Created by Eric on 2023/02/08
 */
const assert = require('assert');
const mongoose = require('mongoose');
//
const sysdefs = require('../include/sysdefs');
const _MODULE_NAME = sysdefs.eFrameworkModules.DATASOURCE;
const { EventModule, EventObject } = require('../include/events');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');

const _DS_DEFAULT = 'default';

/**
 * @typedef DataModelOptions
 * @prop { string } dsName
 * @prop { Object? } modification
 */

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
        //
        (() => {
            switch (this.dbType) {
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
    // Implenting member methods
    /**
     * 
     * @param { string } modelName 
     * @param { DataModelSchema } modelSchema 
     * @param { Object? } modification
     * @returns 
     */
    getModel(modelName, modelSchema, modification) {
        assert(modelName !== undefined && modelSchema !== undefined);
        if (!this.isConnected) {
            return null;
        }
        if (this._models[modelName] === undefined) {
            this._models[modelName] = this._conn.model(modelName, modelSchema);
        }
        return this._models[modelName];
    }
}

// The factory class
class DataSourceFactory extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this._ds = {};
    }
    getEntries() {
        return Object.entries(this._ds);
    }
    getDataSource(name) {
        return this._ds[name];
    }
    /**
     * 
     * @param {*} modelName 
     * @param {*} modelSchema 
     * @param { DataModelOptions } options 
     * @returns 
     */
    getModel(modelName, modelSchema, options) {
        const ds = this._ds[options.dsName];
        if (ds instanceof DataSource) {
            return ds.getModel(modelName, modelSchema, options.modification);
        }
        return null;
    }
    _msgProc(msg, ackOrNack) {
        //TODO: Handler message
        if (typeof ackOrNack === 'function') {
            return ackOrNack(true);
        }
    }
    init(config) {
        Object.keys(config).forEach(dsName => {
            if (config[dsName].enabled === true) {
                this._ds[dsName] = new DataSource({
                    name: dsName,
                    //
                    dbType: config[dsName].type,
                    conf: config[dsName].config
                });
            } else {
                logger.info(`DataSource: ${dsName} is disabled!`);
            }
        });
        //
        if (this._ds[_DS_DEFAULT] === undefined) {
            logger.error(`>>> Set default data-source to in-memory storage! <<<`);
            this._ds[_DS_DEFAULT] = new DataSource({
                name: _DS_DEFAULT,
                dbType: sysdefs.eDbType.NATIVE,
                conf: {}
            })
        }
    }
}

module.exports = exports = {
    _DS_DEFAULT: 'default',
    DataSourceFactory
};