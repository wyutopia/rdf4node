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

const _DS_DEFAULT = 'default';


class Query {
    constructor(props) {

    }

}





function _initDataModel(props) {

}

// The DataModel class
class DataModel extends EventObject {
    constructor(props) {
        super(props);
        //
        this._db = props.conn;
        this._modelName = props.modelName || 'users';
        this._modelSchema = props.modelSchema || {};
        // Implementing the query operators
        this.create = async (data) => {

        }
        this.find = async filter => {

        }
        this.findOne = async filter => {

        }
        this.findById = async id => {

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
}

class DataSource extends EventObject {
    constructor(props) {
        super(props);
        //
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
                this._models[modelName] = this._conn.model(modelName, modelSchema);
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