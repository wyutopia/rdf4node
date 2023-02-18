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
const {repoFactory, paginationVal} = require('./repository');

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

function _$extFindFilter (filter) {
    return filter;
}

function _$extDeleteFilter (filter) {
    // Do nothering...
}

function _publishEvents(options, callback) {
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
    let evt = tools.deepAssign({
        headers: {
            source: this.name,
            modelName: this.modelName,
            dsName: this.dsName
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
        // Declaring member variables
        // Implementing member methods
    }
}

const _defaultCtlSpec = {
    // For CRUD operations
    searchVal: {},              // For query
    addVal: {},                 // For create
    mandatoryAddKeys: [],
    updateVal: {},              // For Update
    populate: null,             // For populate
    selectKeys: null,           // For result projection
    // For overridable query operations
    beforeFindByProject: tools.noop,
    beforeFindByUser: tools.noop,
    beforeFindPartial: tools.noop,
    //
    afterFindOne: tools.noop,      // For only one document
    afterFindMany: tools.noop,     // For one or array results
    afterFindPartial: tools.noop,  // For pagination results
    //
    beforeAdd: function () { return {} },
    afterAdd: function (doc) { return doc; },
    //
    beforeUpdateOne: tools.noop,
    afterUpdateOne: function (doc) { return doc; },
    //
    allowDelete: function (id, callback) { return callback('Not allowed!', false) },
    beforeDeleteOne: tools.noop
};
function _initCtlSpec(ctlSpec) {
    Object.keys(_defaultCtlSpec).forEach( key => {
        let privateKey = `_${key}`;
        this[privateKey] = ctlSpec[key] || _defaultCtlSpec[key];
    });
}

function _beforeFind(args) {
    let options = {
        filter: tools.deepAssign({}, args)
    };
    if (this._populate) {
        options.populate = this._populate;
    }
    if (this._selectKeys) {
        options.select = this._selectKeys;
    }
    return options;
}

function _beforeUpdate(args) {
    let setData = tools.deepAssign({}, args);
    delete setData.id;
    if (Object.keys(setData).length === 0) {
        return {noop: true};
    }
    setData.updateAt = new Date();
    let options = {
        filter: {
            _id: args.id
        },
        updates: {
            $set: setData
        }
    }
    if (this._populate) {
        options.populate = this._populate;
    }
    if (this._selectKeys) {
        options.select = this._selectKeys;
    }
    return options;
}

function _beforePatch(args) {
    let updates = this._parsePatch(args.jsonPatch);
    //
    if (Object.keys(updates).length === 0) {
        return {noop: 'Empty updates!'}
    }
    //
    let options = {
        filter: {_id: args.id},
        updates: updates
    }
    if (this._selectKeys) {
        options.select = this._selectKeys;
    }
    return options;
}

// The class
class EntityController extends ControllerBase {
    constructor(props) {
        super(props);
        // Init repo properties
        this.modelName = props.modelName || 'test';
        this.modelSchema = props.modelSchema || {};
        this.modelRefs = props.modelRefs || [];
        this.dsName = props.dsName || 'default';
        // Init controller properties
        _initCtlSpec.call(this, props.ctlSpec || {});
        // Implementing the class methods
        this._getRepo = (options, callback) => {
            assert(options !== undefined);
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            let dsName = options.dsName || this.dsName;
            let repo = repoFactory.getRepo(this.modelName, dsName);
            if (!repo) {
                let msg = `Repository not exists! - ${this.modelName} - ${dsName}`;
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
        this.find = (req, res) => {

        };
        this.findByid = (req, res) => {
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
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let options = _beforeFind.call(this, args);
                    repo.findOne(options, (err, doc) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this._afterFindOne(doc);
                        return res.sendSuccess(doc);
                    });
                });
            });
        };
        this.findOne = (req, res) => {
            let params = Object.assign({}, req.params, req.query, req.body);
            tools.parseParameter2(params, this._searchVal, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let options = _beforeFind.call(this, args);
                    repo.findOne(options, (err, doc) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this._afterFindOne(doc);
                        return res.sendSuccess(doc);
                    });
                });
            });
        };
        this.findPartial = (req, res) => {
            let validator = Object.assign({}, repoFactory.paginationVal, this._searchVal);
            tools.parseParameter2(req.query, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    //
                    let options = _beforeFind.call(this, args);
                    this._beforeFindPartial(options);
                    repo.findPartial(options, (err, results) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        _publishEvents.call(this, {
                            method: 'findAll',
                            data: results
                        }, () => {
                            this._afterFindPartial(results);
                            return res.sendSuccess(results);
                        });
                    });
                });
            });
        };
        this.findByProject = (req, res) => {
            let params = Object.assign({}, req.params, req.query);
            let validator = Object.assign({
                id: {
                    type: 'ObjectId',
                    required: true,
                    transKey: 'project'
                }
            }, this._searchVal);
            tools.parseParameter2(params, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let options = _beforeFind.call(this, args);
                    this._beforeFindByProject(options);
                    repo.findMany(options, (err, docs) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        _publishEvents.call(this, {
                            method: 'findByProject',
                            data: docs
                        }, () => {
                            this._afterFindMany(docs);
                            return res.sendSuccess(docs);
                        });
                    });
                });
            });
        };
        this.findByUser = (req, res) => {
            let params = Object.assign({}, req.params, req.query);
            let validator = Object.assign({
                id: {
                    type: 'ObjectId',
                    required: true,
                    transKey: 'user'
                }
            }, this._searchVal);
            tools.parseParameter2(params, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    //
                    let options = _beforeFind.call(this, args);
                    this._beforeFindByUser(options);
                    repo.findMany(options, (err, docs) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this._afterFindMany(docs);
                        return res.sendSuccess(docs);
                    });
                });
            });
        };
        this.addOne = (req, res) => {
            let validator = tools.deepAssign({}, this._addVal);
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
                    let data = this._beforeAdd(args, repo);
                    repo.create(data, (err, doc) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        _publishEvents.call(this, {
                            method: 'addOne',
                            data: doc
                        }, () => {
                            let result = this._afterAdd(doc);
                            return res.sendSuccess(result);
                        });
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
            }, this._updateVal);
            tools.parseParameter2(req.body, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                //
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let options = _beforeUpdate.call(this, args);
                    if (options.noop) {
                        return res.sendRsp(eRetCodes.ACCEPTED, 'Empty updates!');
                    }
                    this._beforeUpdateOne(options);
                    repo.updateOne(options, (err, doc) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        _publishEvents.call(this, {
                            method: 'updateOne',
                            data: doc
                        }, () => {
                            let result = this._afterUpdateOne(doc);
                            return res.sendSuccess(result);
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
                        let options = _beforeDelete.call(this, args);
                        this._beforeDeleteOne(options);
                        repo.remove(options, (err, result) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            _publishEvents.call(this, {
                                method: 'deleteOne',
                                data: result
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
                    let options = _beforePatch.call(this, args);
                    if (options.noop) {
                        return res.sendRsp(eRetCodes.ACCEPTED, options.noop);
                    }
                    repo.updateOne(options, (err, doc) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        _publishEvents.call(this, {
                            method: 'patchOne',
                            data: doc
                        }, () => {
                            this._afterPatchOne(doc);
                            return res.sendSuccess(doc);
                        });
                    });
                });
            });
        };
    }
};

// The ServiceBase class
class ServiceBase extends EventModule {
    constructor(props) {
        super(props);
        this.dsName = props.dsName || 'default';
        // Declaring other variables and methods here ...
    }
};

// Declaring module exports
module.exports = exports = {
    ControllerBase: ControllerBase,
    EntityController: EntityController,
    ServiceBase: ServiceBase
};
