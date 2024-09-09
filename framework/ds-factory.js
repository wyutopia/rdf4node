/**
 * Created by Eric on 2023/02/08
 */
const async = require('async');
//
const sysdefs = require('../include/sysdefs');
const _MODULE_NAME = sysdefs.eFrameworkModules.DATASOURCE;
const { EventModule, EventObject } = require('../include/events');
const { DataSource } = require('../include/data');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');

const _DS_DEFAULT = 'default';

/**
 * @typedef MySqlConfig
 * @property { string } host - The host string
 * @property { string } user - The account username
 * @property { string } password - The account password
 * @property { string } database - The database
 * @property { boolean } waitForConnections - default: true
 * @property { number } connectionLimit - default 10
 * @property { number } maxIdle - default 10
 * @property { number } idleTimeout - default 60000
 * @property { number } queueLimit - default 0
 * @property { boolean } enableKeepAlive - default true
 * @property { number } keepAliveInitialDelay - default 0  
 */

/**
 * @typedef MongoConfig
 * @property { string } host - The host string
 * @property { string } ip - The host ip. Omitted when host present.
 * @property { string } port - The host port. Omitted when host present. 
 * @property { string } user - The account username
 * @property { string } pwd - The account password
 * @property { string? } db - The target database
 * @property { string } authSource - The authentication source database
 */

/**
 * @typedef DataSourceConfig
 * @property { 'mongo' | 'mysql' | 'pg' } type
 * @property { Object<MySqlConfig | MongoConfig> } config - The actual dataSource configuration
 * @property { boolean } enabled - Enable or disable the dataSource. Default is false.
 */

/**
 * @typedef DataSourceWrapper
 * @property 
 */

/**
 * @typedef DataModelOptions
 * @prop { string } dsName
 * @prop { Object? } modification
 */


/**
 * 
 * @param { MySqlConfig } config 
 * @returns 
 */
async function _initMongoConnection(config) {
    try {
        const mongoose = require('mongoose');
        const options = {
            useUnifiedTopology: true,
            useNewUrlParser: true
        };
        let uri = tools.packMongoUri(config);
        this._conn = mongoose.createConnection(uri, options);
        logger.debug(`>>> ${this.$name}: mongodb://${config.host} connected.`);
        this.isConnected = true;
    } catch(err) {
        logger.error(`*** ${this.$name}>> Init mongo connection error! - ${err.message}`);
        return err.message;
    }
}

function _initProcMemoryStorage(config) {
    this._memStorage = {};
}

/**
 * 
 * @param { MySqlConfig } config 
 * @returns 
 */
async function _initMySqlConnection(config) {
    try {
        const { mysql } = require('mysql2/promise');
        this._conn = await mysql.createConnection(config)
        this._conn.model = (modelName, modelSchema) => {

        }
        this.isConnected = true;
        logger.info(`${this.$name}>> mysql server:${config.host} connected.`);
    } catch(err) {
        logger.error(`*** ${this.$name}>> Init mysql connection error! - ${err.message}`);
        return err.message;
    }
}

// The class
// class DataSource extends EventObject {
//     constructor(props) {
//         super(props);
//         // Save class properites
//         this.dbType = props.dbType || sysdefs.eDbType.NATIVE;
//         // Declaring member variables
//         this.isConnected = false;
//         this._conn = null;
//         this._models = {};
//     }
//     /**
//      * Initialize the dataSource instance
//      * @param { DataSourceConfig } config 
//      */
//     async init(config) {
//         let fn = null;
//         switch (this.dbType) {
//             case sysdefs.eDbType.NATIVE:
//                 fn = _initProcMemoryStorage.bind(this, config);
//                 break;
//             case sysdefs.eDbType.MONGO:
//                 fn = _initMongoConnection.bind(this, config);
//                 break;
//             case sysdefs.eDbType.MYSQL:
//                 fn = _initMySqlConnection.bind(this, config);
//                 break;
//             default:
//                 break;
//         }
//         if (!fn) {
//             throw new Error(`Unrecognized database type: ${this.dbType}`);
//         }
//         await fn();
//     }
//     // Implenting member methods
//     /**
//      * 
//      * @param { string } modelName 
//      * @param { DataModelSchema } modelSchema 
//      * @param { Object? } modification
//      * @returns 
//      */
//     getModel(modelName, modelSchema, modification) {
//         if (!this.isConnected) {
//             return null;
//         }
//         if (this._models[modelName] === undefined) {
//             this._models[modelName] = this._conn.model(modelName, modelSchema);
//         }
//         return this._models[modelName];
//     }
// }

// The factory class
class DataSourceFactory extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props);
        //
        this._constructors = {};
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
    /**
     * 
     * @param {Object<string, DataSourceConfig>} config 
     * @returns 
     */
    async init(config) {
        const result = {};
        let keys = Object.keys(config);
        await async.eachSeries(keys, async (dsName) => {
            let options = config[dsName];
            if (!options.enabled) {
                logger.info(`### ${this.$name}>> Ignore disabled dataSource: ${dsName}.`);
                result[dsName] = 'disabled';
                return false;
            }
            try {
                let fn = this._constructors[options.type];
                if (fn === undefined) { // Load dataSource constructor if not exists
                    if (options.type === sysdefs.eDbType.MONGO) {
                        const { MongoDataSource } = require('../libs/common/mongoose.wrapper');
                        fn = MongoDataSource;
                    } else if (options.type === sysdefs.eDbType.MYSQL) {
                        const { MySqlDataSource } = require('../libs/common/mysql2.wrapper');
                        fn = MySqlDataSource;
                    } else if (options.type === sysdefs.eDbType.SQLSERVER) {
                        const { SqlServerDataSource } = require('../libs/common/tedious.wrapper');
                        fn = SqlServerDataSource;
                    }
                }
                if (fn) {
                    this._constructors[options.type] = fn;
                    let ds = new fn({
                        $name: `${dsName}@ds`,
                        //
                        dbType: options.type
                    })
                    // TODO: add events handler here ...
                    await ds.init(options.config);
                    this._ds[dsName] = ds;
                    result[dsName] = 'ok';
                } else {
                    result[dsName] = `Un-supprted dataSource type - ${options.type}`;
                }
                return true;
            } catch(ex) {
                logger.error(`*** Create [${dsName}] error! - ${ex.message}`);
                result[dsName] = ex.message;
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
        return result;
    }
}

module.exports = exports = {
    _DS_DEFAULT: 'default',
    DataSourceFactory
};