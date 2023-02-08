/**
 * Created by Eric on 2023/02/08
 */
const config = require('./config');
const pubdefs = require('../include/sysdefs');
const sysEvents = require('../include/sys-events');
const tools = require('../utils/tools');
const {EventModule, EventObject} = require('./common');

function _createMongoConnection() {

}

function _createMySqlConnection() {

}

// The class
class DataSource extends EventObject {
    constructor(props) {
        super(props);
        // Declaring member variables
        this._conn = null;
        this._state = 
        this._conf = props.conf || {};
        // Implenting event handlers
        this.on(sysEvents.SYS_MODULE_DESTORY, () => {

        });
        //
        (() => {
            switch(this._conf.type) {
                case pubdefs.eDbType.MONGO:
                    break;
                case pubdefs.eDbType.MYSQL:
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
            let conf = config.dataSources || {};
            Object.keys(conf).forEach(dsName => {
                this._ds[dsName] = new DataSource(conf[dsName]);
            });
        })();
    }
}

module.exports = exports = new DataSourceFactory({
    name: '_DataSourceFactory_'
});