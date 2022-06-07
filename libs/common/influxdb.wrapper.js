/**
 * Created by Eric on 2022/06/05
 */
const async = require('async');
const { InfluxDB, Point, HttpError } = require('@influxdata/influxdb-client');
exports.Point = Point;
exports.HttpError = HttpError;
//
const pubdefs = require('../../include/sysdefs');
const eRetCodes = require('../../include/retcodes');
const { CommonObject, EventModule, eClientState } = require('../../include/components');
const theApp = require('../../bootstrap');
const tools = require('../../utils/tools');
const mntService = require('../base/prom.wrapper');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'influxdb');
const MODULE_NAME = "INFLUXDB_CONN";


class InfluxDbClient extends CommonObject {
    constructor(props) {
        super(props);
        //
        this.name = props.name || tools.uuidv4();
        this.config = props.config; // config: {connection: {url, token}, org, bucket}
        logger.debug(`${this.name}: influxDBClient config - ${tools.inspect(this.config)}`);
        // Declaring member variableds
        this._conn = null;
        this.state = eClientState.Null;
        // Implementing methods
        this.writePoint = (point) => {
            if (this.state !== eClientState.Conn) {
                logger.error(`${this.name}[${this.state}]: not connected`);
            }
            logger.debug(`${this.name}[${this.state}]: write ${tools.inspect(point)}`);
            this._conn.writePoint(point);
            //TODO: Increase send success
        }
        this.writePoints = (points) => {
            if (this.state !== eClientState.Conn) {
                logger.error(`${this.name}[${this.state}]: not connected`);
            }
            logger.debug(`${this.name}[${this.state}]: write ${tools.inspect(point)}`);
            _conn.writePoints(points);
            //TODO: Increase send success
        }
        this.dispose = (callback) => {
            if (this.state !== eClientState.Conn) {
                return callback();
            }
            this.state = eClientState.Closing;
            this._conn.close().then(() => {
                logger.info(`${this.name}[${this.state}]: connection closed.`);
                return callback();
            }).catch(ex => {
                logger.error(`${this.name}[${this.state}]: Close connection error! - ${ex.message}`);
                return callback();
            });
        }
        // Implementing events handlers
        //
        (() => {
            this.state = eClientState.Init;
            this._conn = new InfluxDB(this.config.connection).getWriteApi(
                this.config.org,
                this.config.bucket,
                this.config.timeUnit || 'ns',
                this.config.writeOptions || {flushInterval: 0}
            );
            this.state = eClientState.Conn;
        })();
    }
}

class ClientFactory extends EventModule {
    constructor(props) {
        super(props);
        //
        this._clients = {};
        this.createClient = (name, config) => {
            logger.debug(`${this.name}: create client with config - ${name}, ${tools.inspect(config)}`);
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
    name: 'InfluxDBClientFactory',
    mandatory: false,
    status: true
});