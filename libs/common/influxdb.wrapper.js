/**
 * Created by Eric on 2022/06/05
 */
const async = require('async');
const { InfluxDB, Point, HttpError, FluxTableMetaData, flux, fluxDuration } = require('@influxdata/influxdb-client');
const {DeleteAPI} = require('@influxdata/influxdb-client-apis');
exports.Point = Point;
exports.HttpError = HttpError;
exports.FluxTableMetaData = FluxTableMetaData;
exports.flux = flux;
exports.fluxDuration = fluxDuration;
//
const sysdefs = require('../../include/sysdefs');
const eClientState = sysdefs.eClientState;
const eRetCodes = require('../../include/retcodes');
const { EventObject, EventModule } = require('../../include/events');
const theApp = require('../../bootstrap');
const tools = require('../../utils/tools');
const mntService = require('../base/prom.wrapper');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'influxdb');
const MODULE_NAME = "INFLUXDB_CONN";


class InfluxDbClient extends EventObject {
    constructor(props) {
        super(props);
        //
        this.$name = props.name || tools.uuidv4();
        this.config = props.config; // config: {connection: {url, token}, org, bucket}
        logger.debug(`${this.$name}: influxDBClient config - ${tools.inspect(this.config)}`);
        // Declaring member variableds
        this._conn = null;
        this._writeApi = null;
        this._queryApi = null;
        this._deleteApi = null;
        this.state = eClientState.Null;
        // Implementing methods
        this.writePoint = (point) => {
            if (this.state !== eClientState.Conn) {
                logger.error(`${this.$name}[${this.state}]: not connected`);
                return null;
            }
            logger.debug(`${this.$name}[${this.state}]: write ${tools.inspect(point)}`);
            try {
                this._writeApi.writePoint(point);
                //TODO: Increase send success
            } catch (ex) {
                logger.debug(`${this.$name}[${this.state}]: write point error! - ${ex.message}`);
            }
        }
        this.writePoints = (points) => {
            if (this.state !== eClientState.Conn) {
                logger.error(`${this.$name}[${this.state}]: not connected`);
                return null;
            }
            logger.debug(`${this.$name}[${this.state}]: write ${tools.inspect(points)}`);
            try {
                this._writeApi.writePoint(points);
                //TODO: Increase send success
            } catch (ex) {
                logger.debug(`${this.$name}[${this.state}]: write point error! - ${ex.message}`);
            }
        }
        this.collectRows = (fluxQuery, rowMapper, callback) => {
            if (this._queryApi === null) {
                let msg = `${this.$name}: queryApi is NULL!`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.METHOD_NOT_ALLOWED,
                    message: msg
                });
            }
            this._queryApi.collectRows(fluxQuery, rowMapper).then(data => {
                return callback(null, data);
            }).catch(err => {
                logger.error(`${this.$name}: collectRows error! - ${tools.inspect(fluxQuery)} - ${err.message}`);
                return callback(err);
            });
        }
        this.queryRaw = (fluxQuery, callback) => {
            if (this._queryApi === null) {
                let msg = `${this.$name}: queryApi is NULL!`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.METHOD_NOT_ALLOWED,
                    message: msg
                });
            }
            this._queryApi.queryRaw(fluxQuery).then(data => {
                return callback(null, data);
            }).catch(err => {
                logger.error(`${this.$name}: queryRaw error! - ${tools.inspect(fluxQuery)} - ${err.message}`);
                return callback(err);
            });
        }
        this.dispose = (callback) => {
            if (this.state !== eClientState.Conn) {
                return callback();
            }
            this.state = eClientState.Closing;
            this._writeApi.close().then(() => {
                logger.info(`${this.$name}[${this.state}]: connection closed.`);
                return callback();
            }).catch(ex => {
                logger.error(`${this.$name}[${this.state}]: Close connection error! - ${ex.message}`);
                return callback();
            });
        }
        // Implementing events handlers
        //
        (() => {
            this.state = eClientState.Init;
            try {
                this._conn = new InfluxDB(this.config.connection);
                this._writeApi = this._conn.getWriteApi(
                    this.config.org,
                    this.config.bucket,
                    this.config.precision || 'ns',
                    this.config.writeOptions || { flushInterval: 10 }
                );
                this._queryApi = this._conn.getQueryApi(this.config.org);
                this._deleteApi = new DeleteAPI(this._conn);
                this.state = eClientState.Conn;
            } catch (ex) {
                logger.error(`${this.$name}: Connect to server error! - ${ex.message}`);
            }
        })();
    }
}

class ClientFactory extends EventModule {
    constructor(props) {
        super(props);
        //
        this._clients = {};
        this.createClient = (name, config) => {
            logger.debug(`${this.$name}: create client with config - ${name}, ${tools.inspect(config)}`);
            if (this._clients[name] !== undefined) {
                return this._clients[name];
            }
            this._clients[name] = new InfluxDbClient({
                name: name,
                config: config
            });
            return this._clients[name];
        }
        this.dispose = (callback) => {
            let names = Object.keys(this._clients);
            async.eachLimit(names, 2, (name, next) => {
                return this._clients[name].dispose(next);
            }, () => {
                return callback();
            });
        }
        //
        theApp.regModule(this);
    }
}
exports.clientFactory = new ClientFactory({
    $name: 'InfluxDBClientFactory',
    mandatory: false,
    state: sysdefs.eModuleState.ACTIVE,
    type: sysdefs.eModuleType.CONN
});