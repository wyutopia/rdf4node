/**
 * Create by Eric on 2022/01/05
 */
const EventEmitter = require('events');
const {objectInit, moduleInit, CommonObject, CommonModule} = require('./common');
const tools = require('../utils/tools');
const pubdefs = require('../include/sysdefs');
const eRetCodes = require('../include/retcodes');
const sysEvents = require('./sys-events');
const icp = require('../libs/base/icp');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const dbHelper = require('../utils/db-helper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'components');

exports.CommonObject = CommonObject;
exports.CommonModule = CommonModule;

class EventObject extends EventEmitter {
    constructor(props) {
        super(props);
        objectInit.call(this, props);
        // Additional properties go here ...
    }
}
exports.EventObject = EventObject;

class EventModule extends EventObject {
    constructor(props) {
        super(props);
        moduleInit.call(this, props);
        //
        this.pubEvent = (event, options, callback) => {
            if (typeof options === 'function') {
                callback = options;
                options = {
                    routingKey: event.code
                }
            }
            return icp.publish(event, callback);
        };
        this._msgProc = (msg, ackOrNack) => {
            //TODO: Handle msg
            return ackOrNack();
        };
        this.on('message', (msg, ackOrNack) => {
            //setImmediate(this._msgProc.bind(this, msg, ackOrNack));
            setTimeout(this._msgProc.bind(this, msg, ackOrNack), 10);
        });
        // Perform initiliazing codes...
        (() => {
            icp.register(this.name, this);
            // Subscribe events
            let allEvents = Object.values(sysEvents).concat(props.subEvents || []);
            icp.subscribe(allEvents, this.name);
        })();
    }
}
exports.EventModule = EventModule;

function _$extUpdates (setData) {
    return {
        $set: setData
        // TODO: add $push, $pull, $inc, ... update operations here ...
    };
}

function _$allowDelete(id, callback) {
    return callback('Not allowed!', false);
}

/**
 *
 * @param jsonPatch
 * @returns updates json
 * @private
 */
function _$parsePatch(jsonPatch) {
    return {}
}

function _$transQueryFilter(origFilter) {
    return origFilter;
}

class ControllerBase extends EventModule {
    constructor(props) {
        super(props);
        // Init private members
        this._model = props.model || null;
        this._searchKeys = props.searchKeys || {};
        this._propKeys = props.propKeys || {};
        this._mutableKeys = props.mutableKeys || this._propKeys;
        this._populateKeys = props.populateKeys || [];
        // Declaring private overridable methods
        this._extUpdates = props.extUpdates || _$extUpdates;
        this._allowDelete = props.allowDelete || _$allowDelete;
        this._parsePatch = props.parsePatch || _$parsePatch;
        this._transQueryFilter = props.transQueryFilter || _$transQueryFilter;

        // Implementing basic CRUD methods
        this.listAll = (req, res) => {
            let validator = Object.assign({}, dbHelper.paginationOpt, this._searchKeys);
            tools.parseParameter2(req.query, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                let filter = this._transQueryFilter(args);
                //
                dbHelper.findPartial(this._model, {
                    filter: filter,
                    populate: this._populateKeys
                }, (err, results) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    return res.sendSuccess(results);
                });
            });
        };
        this.listByProject = (req, res) => {
            let params = Object.assign({}, req.params, req.query);
            let validator = Object.assign({
                id: {
                    type: 'ObjectId',
                    required: true,
                    transKey: 'project'
                }
            }, this._searchKeys);
            tools.parseParameter2(params, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                //
                dbHelper.findMany(this._model, {
                    filter: args,
                    populate: this._populateKeys
                }, (err, docs) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    return res.sendSuccess(docs)
                });
            });
        };
        this.fetchOne = (req, res) => {
            let params = Object.assign({}, req.params, req.query, req.body);
            tools.parseParameter2(params, {
                id: {
                    type: 'ObjectId',
                    required: true
                }
            }, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                //
                dbHelper.findById(this._model, args.id, {
                    populate: this._populateKeys
                }, (err, doc) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    return res.sendSuccess(doc);
                });
            });
        };
        this.updateOne = (req, res) => {
            let validator = Object.assign({
                id: {
                    type: 'ObjectId',
                    required: true
                }
            }, this._mutableKeys);
            tools.parseParameter2(req.body, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                //
                let setData = Object.assign({}, args);
                delete setData.id;
                if (Object.keys(setData).length === 0) {
                    return res.sendRsp(eRetCodes.ACCEPTED, 'Empty updates!');
                }
                setData.updateAt = new Date();
                dbHelper.updateOne(this._model, {
                    filter: {
                        _id: args.id
                    },
                    updates: this._extUpdates(setData),
                    populate: this._populateKeys
                }, (err, doc) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    // TODO: Publish event if configed
                    // this.pubEvent(...)
                    return res.sendSuccess(doc);
                })
            });
        };
        this.deleteOne = (req, res) => {
            tools.parseParameter2(req.body, {
                id: {
                    type: 'ObjectId',
                    required: true
                }
            }, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                this._allowDelete(args.id, (reason, result) => {
                    if (reason) {
                        return res.sendRsp(eRetCodes.METHOD_NOT_ALLOWED, reason);
                    }
                    //
                    dbHelper.remove(this._model, {
                        filter: {_id: args.id}
                    }, (err, result) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        // TODO: Publish event if configed
                        return res.sendSuccess();
                    });
                });
            });
        };
        this.patchOne = (req, res) => {
            tools.parseParameter2(req.body, {
                id: {
                    type: 'ObjectId',
                    requird: true
                },
                jsonPatch: {
                    required: true
                }
            }, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                let updates = this._parsePatch(args.jsonPatch);
                //
                if (Object.keys(updates).length === 0) {
                    return res.sendRsp(eRetCodes.ACCEPTED, 'Invalid jsonPatch!');
                }
                //
                dbHelper.updateOne(this._model, {
                    filter: {_id: args.id},
                    updates: updates
                }, (err, doc) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    //TODO: Publish event if configed
                    return res.sendSuccess(doc);
                });
            });
        };
    }
};
exports.ControllerBase = ControllerBase;

const eClientState = {
    Null: 'null',
    Init: 'init',
    Conn: 'connected',
    ConnErr: 'connerr',
    Querying: 'querying',
    PClosing: 'pclosed',
    ClosePending: 'closepending',
    Closing: 'closing',
    Pending: 'pending',
    Closed: 'closed'
};
exports.eClientState = eClientState;
exports.eConnectionState = eClientState;

const eServerState = {
    Null: 'null',
    Init: 'init'
};
exports.eServerState = eServerState;