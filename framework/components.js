/**
 * Created by Eric on 2023/02/07
 */
const tools = require('../utils/tools');
const pubdefs = require('./sysdefs');
const {EventModule} = require('./common');

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
    let updates = {};
    if (tools.isTypeOfArray(jsonPatch)) {
        jsonPatch.forEach(item => {
            let key = item.path.replace('/', '.').slice(1);
            switch(item.op) {
                case 'add':
                    if (updates.$set === undefined) {
                        updates.$set = {};
                    }
                    updates.$set[key] = item.value;
                    break;
                case 'push':
                    if (updates.$push === undefined) {
                        updates.$push = {};
                    }
                    updates.$push[key] = item.value;
                    break;
                case 'addToSet':
                    if (updates.$addToSet === undefined) {
                        updates.$addToSet = {};
                    }
                    updates.$addToSet[key] = item.value;
                case 'remove':
                    updates.$unset = {};
                    updates.$unset[key] = 1;
                    break;
                case 'replace':
                    break;
                case 'copy':
                    break;
                case 'move':
                    break;
                case 'test':
                    break;
            }
        });
    }
    return updates
}

function _$extQueryFilter (filter) {
    return filter;
}

function _$extDeleteFilter (filter) {
    // Do nothering...
}

function _emitEvents(options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    let method = options.method;
    if (method === undefined) {
        return callback();
    }
    let domainEvent = this._domainEvents[method];
    if (domainEvent === undefined) {
        return callback();
    }
    let evt = Object.assign({
        headers: {
            source: this.name
        },
        body: options.data
    }, domainEvent.success);
    this.pubEvent(evt, err => {
        if (err) {
            logger.error(`Publish event: ${tools.inspect(evt)} error! - ${err.code}#${err.message}`);
        }
        return callback();
    });
}

function _packDeleteFilter(args) {
    let filter = {
        _id: args.id
    };
    this._extDeleteFilter(filter);
    return filter;
}

class ControllerBase extends EventModule {
    constructor(props) {
        super(props);
        // Init private members
        this._model = props.model || null;
        this._searchKeys = props.searchKeys || {};
        this._propKeys = props.propKeys || {};
        this._mandatoryAddKeys = props.mandatoryAddKeys || [];
        this._mutableKeys = props.mutableKeys || this._propKeys;
        this._populateKeys = props.populateKeys || [];
        // Declaring private overridable methods
        this._allowDelete = props.allowDelete || _$allowDelete;
        this._parsePatch = props.parsePatch || _$parsePatch;
        this._extUpdates = props.extUpdates || _$extUpdates;
        this._extQueryFilter = props.extQueryFilter || _$extQueryFilter;
        this._extDeleteFilter = props.extDeleteFilter || _$extDeleteFilter;
        // Register event publishers
        this._domainEvents = props.domainEvents || {};
        // Implementing basic CRUD methods
        this.listAll = (req, res) => {
            let validator = Object.assign({}, dbHelper.paginationOpt, this._searchKeys);
            tools.parseParameter2(req.query, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                let filter = this._extQueryFilter(args);
                //
                dbHelper.findPartial(this._model, {
                    filter: filter,
                    populate: this._populateKeys
                }, (err, results) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    _emitEvents.call(this, {
                        method: 'listAll',
                        data: results
                    }, () => {
                        return res.sendSuccess(results);
                    });
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
                    _emitEvents.call(this, {
                        method: 'listByProject',
                        data: docs
                    }, () => {
                        return res.sendSuccess(docs);
                    });
                });
            });
        };
        this.addOne = (req, res) => {
            let validator = Object.assign({}, this._propKeys);
            this._mandatoryAddKeys.forEach( key => {
                if (validator[key]) {
                    validator[key].required = true;
                }
            });
            tools.parseParameter2(req.body, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                //
                dbHelper.create(this._model, args, (err, doc) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    _emitEvents.call(this, {
                        method: 'addOne',
                        data: doc
                    }, () => {
                        return res.sendSuccess(doc);
                    });
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
                    _emitEvents.call(this, {
                        method: 'updateOne',
                        data: doc
                    }, () => {
                        return res.sendSuccess(doc);
                    });
                });
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
                    let filter = _packDeleteFilter.call(this, args);
                    dbHelper.remove(this._model, {
                        filter: filter
                    }, (err, result) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        _emitEvents.call(this, {
                            method: 'deleteOne',
                            data: filter
                        }, () => {
                            return res.sendSuccess();
                        });
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
                    _emitEvents.call(this, {
                        method: 'patchOne',
                        data: doc
                    }, () => {
                        return res.sendSuccess(doc);
                    });
                });
            });
        };
    }
};
exports.ControllerBase = ControllerBase;