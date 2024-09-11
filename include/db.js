/**
 * Created by Eric on 2024/09/07
 */
const async = require('async');
//
const sysdefs = require('./sysdefs');
const _MODULE_NAME = sysdefs.eFrameworkModules.DATASOURCE;
const { EventModule, EventObject } = require('./events');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || _MODULE_NAME);
const tools = require('../utils/tools');
const sqlBuilder = require('../utils/sqlorm');

const _DS_DEFAULT = 'default';


function _throwIfInitialized() {
    if (this.initialized) {
        throw new Error('Already initialized');
    }
}

class Query {
    constructor(props) {
        //
        this._db = props.db;
        this._modelName = props.modelName;
        this._operator = props.op || 'query';
        this.filter = props.filter || {};
        this.options = props.options || {};
        //
        this.initialized = false;
        //
        this.exec = async () => {
            let queryOptions = Object.assign({ filter: this.filter }, this.options);
            let {count, stmt} = sqlBuilder.parseQueryOptions(this._modelName, queryOptions);
            logger.debug(`>>> The query statement: ${stmt}`);
            const [results, fields] = await this._db.query(stmt);
            let limit = this.options.limit;
            if (!limit) {
                return results;
            }
            if (limit === 1) {
                return results[0];
            }
            return results.slice(0, limit);
        }
    }
    limit(value) {
        _throwIfInitialized.call(this);
        if (typeof value !== 'number') {
            throw new Error('Operation "limit" requires an integer');
        }
        this.options.limit = value;
        return this;
    }
    skip(value) {
        _throwIfInitialized.call(this);
        if (typeof value !== 'number') {
            throw new Error('Operation "skip" requires an integer');
        }
        this.options.skip = value;
        return this;
    }
    then(callback) {
        this.exec().then(callback);
    }
}


// The DataModel class
class DataModel extends EventObject {
    constructor(props) {
        super(props);
        //
        this._db = props.db;
        this._modelName = props.modelName || 'users';
        this._modelSchema = props.modelSchema || {};
        // Implementing the query operators
        this.create = async (data) => {

        }

        this.findOneAndUpdate = async (filter, updates, options) => {

        }
        this.updateMany = async (filter, updates) => {

        }
        this.count = async filter => {

        }
        this.findOneAndDelete = async filter => {

        }
        this.deleteMany = async filter => {

        }
    }
    /**
     *
     * @param { string | number } id
     * @param { Object? } options
     * @returns
     */
    findById(id, options = {}) {
        return this.find({_id: id}, options).limit(1);
    }
    /**
     *
     * @param { Object? } filter
     * @param { Object? } options
     * @returns
     */
    findOne(filter = {}, options = {}) {
        return this.find(filter, options).limit(1);
    }

    find(filter = {}, options = {}) {
        return new Query({
            db: this._db,
            modelName: this._modelName,
            filter, options
        })
    }
}

class DataSource extends EventObject {
    constructor(props) {
        super(props);
        //
        this._type = props.dbType;
        this._conn = null;
        this._models = {};
        this.isConnected = false;
        //

        /**
         * Initialize the dataSource by Creating connection
         * @param {*} config
         */
        this.init = async (config) => {
            logger.info(`### ${this.$name}: Override to implemnet your own ...`);
            return false;
        }

        /**
         * Get the dataModel handler
         * @param { string } modelName
         * @param { Object } modelSchema
         * @param { Object } options
         * @param { string } options.dsName
         * @param { Object } options.modification
         */
        this.getModel = (modelName, modelSchema, options) => {
            if (!this.isConnected) {
                return null;
            }
            if (this._models[modelName] === undefined) {
                this._models[modelName] = this._conn.model(modelName, modelSchema, options);
            }
            return this._models[modelName];
        }

        this.dispose = async () => {
            //TODO
        }
    }
}

// Define module
module.exports = exports = {
    _DS_DEFAULT_ : _DS_DEFAULT,
    DataSource,
    DataModel
}