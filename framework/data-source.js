/**
 * Created by Eric on 2023/02/08
 */
const async = require('async');
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

async function _initMongoConnection(config) {
    const options = {
        useUnifiedTopology: true,
        useNewUrlParser: true
    };
    let uri = tools.packMongoUri(config);
    this._conn = mongoose.createConnection(uri, options);
    logger.debug(`>>> ${this.$name}: mongodb://${config.host} connected.`);
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
        this._conn = null;
        this._models = {};
    }
    async init() {
        let fn = null;
        switch (this.dbType) {
            case sysdefs.eDbType.NATIVE:
                fn = _initProcMemoryStorage.bind(this, this.conf);
                break;
            case sysdefs.eDbType.MONGO:
                fn = _initMongoConnection.bind(this, this.conf);
                break;
            case sysdefs.eDbType.MYSQL:
                fn = _initMySqlConnection.bind(this, this.conf);
                break;
            default:
                break;
        }
        if (!fn) {
            throw new Error(`Unrecognized database type: ${this.dbType}`);
        }
        await fn();
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
    async init(config) {
        let keys = Object.keys(config);
        await async.eachSeries(keys, async (dsName) => {
            let options = config[dsName];
            if (!options.enabled) {
                logger.warn(`*** [${dsName}] is disabled!`);
                return false;
            }
            try {
                let ds = new DataSource({
                    $name: `${dsName}@ds`,
                    //
                    dbType: options.type,
                    conf: options.config
                });
                await ds.init();
                this._ds[dsName] = ds;
                return true;
            } catch(ex) {
                logger.error(`*** Create [${dsName}] error! - ${ex.message}`);
                return false;
            }
        })
        //
        if (this._ds[_DS_DEFAULT] === undefined) {
            logger.warn(`>>> Set default data-source to in-memory storage! <<<`);
            this._ds[_DS_DEFAULT] = new DataSource({
                $name: `${_DS_DEFAULT}@ds`,
                dbType: sysdefs.eDbType.NATIVE,
                conf: {}
            })
        }
        return 'ok';
    }
}

module.exports = exports = {
    _DS_DEFAULT: 'default',
    DataSourceFactory
};