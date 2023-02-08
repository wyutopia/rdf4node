/**
 * Created by Eric on 2023/02/07
 */
const sysConf = require('./config');
const pubdefs = require('../include/sysdefs');
const eConnState = pubdefe.eConnectionState;
const sysEvents = require('../include/sys-events');
const tools = require('../utils/tools');
const {EventModule, EventObject} = require('./common');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'repo');


class Repository extends EventObject {
    constructor(props) {
        super(props);
        //
        this._model = null;
        //
        this.findMany = () => {};
        this.findPartial = () => {};
        this.findById = () => {};

    }
}

class RepositoryFactory extends EventModule {
    constructor(props) {
        super(props);
        //
        this._repos = {};
        //
        this.createRepo = () => {};
        this.getRepo = () => {};
    }
}