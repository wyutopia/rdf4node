/**
 * Created by Eric on 2023/02/07
 */
// System libs
const assert = require('assert');
// Framework libs
const sysdefs = require('../include/sysdefs');
const eRetCodes = require('../include/retcodes');
const {EventModule, icp, sysEvents} = require('../include/events');
const {winstonWrapper: {WinstonLogger}} = require('../libs');
const logger = WinstonLogger(process.env.SRV_ROLE || 'comp');
const tools = require('../utils/tools');
const {repoFactory, paginationKeys} = require('./repository');

/////////////////////////////////////////////////////////////////////////
// Define the ControllerBase
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
        this._modelName = props.modelName || 'test';
        this._modelSchema = props.modelSchema || {};
        this._dsName = props.dsName || 'default';
        //
        this._searchKeys = props.searchKeys || {};
        this._propKeys = props.propKeys || {};
        this._mandatoryAddKeys = props.mandatoryAddKeys || [];
        this._mutableKeys = props.mutableKeys || this._propKeys;
        this._populateKeys = props.populateKeys || [];
        this._selectKeys = props.selectKeys || null;
        // Declaring private overridable methods
        this._allowDelete = props.allowDelete || _$allowDelete;
        this._parsePatch = props.parsePatch || _$parsePatch;
        this._extUpdates = props.extUpdates || _$extUpdates;
        this._extQueryFilter = props.extQueryFilter || _$extQueryFilter;
        this._extDeleteFilter = props.extDeleteFilter || _$extDeleteFilter;
        this._getRepo = (options, callback) => {
            assert(options !== undefined);
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            let dsName = options.dsName || this._dsName;
            let repo = repoFactory.getRepo(this._modelName, this._modelSchema, dsName);
            if (!repo) {
                let msg = `Repository not exists! - ${this._modelName} - ${dsName}`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: msg
                });
            }
            return callback(null, repo);
        };
        // Register event publishers
        this._domainEvents = props.domainEvents || {};
        // Implementing basic CRUD methods
        this.listAll = (req, res) => {
            let validator = Object.assign({}, repoFactory.paginationKeys, this._searchKeys);
            tools.parseParameter2(req.query, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                let filter = this._extQueryFilter(args);
                //
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let options = {
                        filter: filter,
                        populate: this._populateKeys
                    };
                    if (this._selectKeys) {
                        options.select = this._selectKeys;
                    }
                    repo.findPartial(options, (err, results) => {
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
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let options = {
                        filter: args,
                        populate: this._populateKeys
                    };
                    if (this._selectKeys) {
                        options.select = this._selectKeys;
                    }
                    repo.findMany(options, (err, docs) => {
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
            });
        };
        this.listByUser = (req, res) => {

        };
        this.addOne = (req, res) => {
            let validator = tools.deepAssign({}, this._propKeys);
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
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    repo.create(args, (err, doc) => {
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
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let options = {
                        populate: this._populateKeys
                    }
                    if (this._selectKeys) {
                        options.select = this._selectKeys;
                    }
                    repo.findById(args.id, options, (err, doc) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        return res.sendSuccess(doc);
                    });
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
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let setData = tools.deepAssign({}, args);
                    delete setData.id;
                    if (Object.keys(setData).length === 0) {
                        return res.sendRsp(eRetCodes.ACCEPTED, 'Empty updates!');
                    }
                    setData.updateAt = new Date();
                    let options = {
                        filter: {
                            _id: args.id
                        },
                        updates: this._extUpdates(setData),
                        populate: this._populateKeys
                    }
                    if (this._selectKeys) {
                        options.select = this._selectKeys;
                    }
                    repo.updateOne(options, (err, doc) => {
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
            });
        };
        this.deleteOne = (req, res) => {
            let validator = {
                id: {
                    type: 'ObjectId',
                    required: true
                }
            };
            tools.parseParameter2(req.body, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    this._allowDelete(args.id, repo, (reason, result) => {
                        if (reason) {
                            return res.sendRsp(eRetCodes.DB_DELETE_ERR, reason);
                        }
                        //
                        let filter = _packDeleteFilter.call(this, args);
                        repo.remove({
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
            });
        };
        this.patchOne = (req, res) => {
            let validator = {
                id: {
                    type: 'ObjectId',
                    requird: true
                },
                jsonPatch: {
                    required: true
                }
            };
            tools.parseParameter2(req.body, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let updates = this._parsePatch(args.jsonPatch);
                    //
                    if (Object.keys(updates).length === 0) {
                        return res.sendRsp(eRetCodes.ACCEPTED, 'Invalid jsonPatch!');
                    }
                    //
                    let options = {
                        filter: {_id: args.id},
                        updates: updates
                    }
                    if (this._selectKeys) {
                        options.select = this._selectKeys;
                    }
                    repo.updateOne(options, (err, doc) => {
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
            });
        };
    }
};

// Declaring module exports
module.exports = exports = {
    ControllerBase: ControllerBase
};
