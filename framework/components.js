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
const {repoFactory, paginationVal, _DS_DEFAULT_} = require('./repository');

/////////////////////////////////////////////////////////////////////////
// Define the ControllerBase

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

const _reNotAllowed = new RegExp(/^-/);
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
            dsName: options.dsName || _DS_DEFAULT_
        },
        body: options.data
    }, domainEvent.success);
    if (typeof domainEvent.select === 'string') { // Remove not-allowed properties
        domainEvent.select.split(' ').forEach(key => {
            if (_reNotAllowed.test(key)) {  
                delete evt.body[key.slice(1)]
            }
        });
    }
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
        this._getRepositories = (modelNames, dsName = 'default') => {
            assert(Array.isArray(modelNames));
            let results = {};
            modelNames.forEach(modelName => {
                results[modelName] = repoFactory.getRepo(modelName, dsName);
            });
            return results;
        };
    }
}

const _defaultCtlSpec = {
    // For CRUD operation validators
    searchVal: {},              // For query
    addVal: {},                 // For create
    mandatoryAddKeys: [],
    updateVal: {},              // For Update
    // For database query options
    populate: null,             // For populate
    sort: null,                 // For sort
    select: null,               // For select 
    deleteOptions: null,        // For additional delete criterias
    inventorySelect: 'name',    // For inventory query
    // For overridable query operations
    beforeFind: tools.noop,
    beforeFindByProject: tools.noop,
    beforeFindByUser: tools.noop,
    beforeFindPartial: tools.noop,
    //
    afterFindOne: function (doc, callback) { return callback(null, doc); },      // For only one document
    afterFindMany: function (docs, callback) { return callback(null, docs); },     // For one or array results
    afterFindPartial: function (results, callback) { return callback(null, results); },  // For pagination results
    //
    allowAdd: function (req, args, callback) { return callback(); },
    beforeAdd: function (args, repo, callback) { return callback(null, args); },
    beforeInsert: function (args, repo, callback) { 
        return callback(null, {
            filter: args,
            updates: args
        }); 
    },
    afterAdd: function (doc, callback) { return callback(null, doc); },
    //
    beforeUpdateOne: tools.noop,
    afterUpdateOne: function (doc) { return doc; },
    //
    allowDelete: function (id, dsName, callback) { 
        return callback({
            code: eRetCodes.METHOD_NOT_ALLOWED,
            message: 'Not allowed!'
        });
    },
    beforeDeleteOne: tools.noop
};
function _initCtlSpec(ctlSpec) {
    Object.keys(_defaultCtlSpec).forEach( key => {
        let privateKey = `_${key}`;
        this[privateKey] = ctlSpec[key] || _defaultCtlSpec[key];
    });
}

function _prepareFindOption (args) {
    let filter = tools.deepAssign({}, args);
    if (filter.id !== undefined) {
        filter._id = filter.id;
        delete filter.id;
    }
    delete filter.inventory;
    let options = {
        filter: filter
    };
    if (!args.inventory && this._populate) {
        options.populate = this._populate;
    }
    if (this._select) {
        options.select = this._select;
    }
    if (this._sort) {
        options.sort = this._sort;
    }
    if (args.inventory) {
        options.select = this._inventorySelect;
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
    if (this._select) {
        options.select = this._select;
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
    if (this._select) {
        options.select = this._select;
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
        //
        this._entityRepos = {};
        // Init controller properties
        _initCtlSpec.call(this, props.ctlSpec || {});
        // Implementing the class methods
        this._getRepo = (dataSourceOption, callback) => {
            assert(dataSourceOption !== undefined);
            if (typeof dataSourceOption === 'function') {
                callback = dataSourceOption;
                dataSourceOption = {};
            }
            let dsName = dataSourceOption.dsName || _DS_DEFAULT_;
            if (this._entityRepos[dsName] !== undefined) {
                return callback(null, this._entityRepos[dsName]);
            }
            let repo = repoFactory.getRepo(this.modelName, dsName);
            if (!repo) {
                let msg = `Repository not exists! - ${this.modelName} - ${dsName}`;
                logger.error(msg);
                return callback({
                    code: eRetCodes.DB_ERROR,
                    message: msg
                });
            }
            this._entityRepos[dsName] = repo;
            return callback(null, repo);
        };
        this.getRepoSync = (dataSourceOption) => {
            if (dataSourceOption === undefined) {
                dataSourceOption = {};
            }
            let dsName = dataSourceOption.dsName || DS_DEFAULT;
            let repo = this._entityRepos[dsName];
            if (repo !== undefined) {
                return repo;
            }
            repo = repoFactory.getRepo(this.modelName, dsName);
            if (repo) {
                this._entityRepos[dsName] = repo;
            }
            return repo;
        };
        // Register event publishers
        this._domainEvents = props.domainEvents || {};
        // Implementing basic CRUD methods
        this.find = (req, res) => {
            let params = Object.assign({}, req.params, req.query, req.body);
            tools.parseParameter2(params, this._searchVal, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let options = _prepareFindOption.call(this, args);
                    this._beforeFind(options);
                    repo.findMany(options, (err, docs) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this._afterFindMany(docs, (err, results) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            return res.sendSuccess(results);
                        });
                    });
                });
            });
        };
        this.findById = (req, res) => {
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
                    let options = _prepareFindOption.call(this, args);
                    repo.findOne(options, (err, doc) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this._afterFindOne(doc, (err, result) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            return res.sendSuccess(result);
                        });
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
                    let options = _prepareFindOption.call(this, args);
                    this._beforeFind(options);
                    repo.findOne(options, (err, doc) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this._afterFindOne(doc, (err, result) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            return res.sendSuccess(result);
                        });
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
                    let options = _prepareFindOption.call(this, args);
                    this._beforeFind(options);
                    this._beforeFindPartial(options);
                    repo.findPartial(options, (err, results) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this._afterFindPartial(results, (err, outcomes) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            return res.sendSuccess(outcomes);
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
                },
                inventory: {}
            }, this._searchVal);
            tools.parseParameter2(params, validator, (err, args) => {
                if (err) {
                    return res.sendRsp(err.code, err.message);
                }
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let options = _prepareFindOption.call(this, args);
                    this._beforeFind(options);
                    this._beforeFindByProject(options);
                    repo.findMany(options, (err, docs) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        _publishEvents.call(this, {
                            method: 'findByProject',
                            data: docs
                        }, () => {
                            this._afterFindMany(docs, (err, results) => {
                                if (err) {
                                    return res.sendRsp(err.code, err.message);
                                }
                                return res.sendSuccess(results);
                            });
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
                },
                inventory: {}
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
                    let options = _prepareFindOption.call(this, args);
                    this._beforeFind(options);
                    this._beforeFindByUser(options);
                    repo.findMany(options, (err, docs) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this._afterFindMany(docs, (err, results) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            return res.sendSuccess(results);
                        });
                    });
                });
            });
        };
        this.addOne = (req, res) => {
            let validator = tools.deepAssign({}, this._addVal);
            this._mandatoryAddKeys.forEach( key => {
                let path = key.replace('.', '.$embeddedValidators.');
                let val = tools.safeGetJsonValue(validator, path);
                if (val) {
                    val.required = true;
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
                    this._allowAdd(req, args, (err) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this._beforeAdd(args, repo, (err, data) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            repo.create(data, (err, doc) => {
                                if (err) {
                                    return res.sendRsp(err.code, err.message);
                                }
                                let obj = doc.toObject();
                                _publishEvents.call(this, {
                                    method: 'addOne',
                                    data: obj
                                }, () => {
                                    this._afterAdd(obj, (err, result) => {
                                        if (err) {
                                            return res.sendRsp(err.code, err.message);
                                        }
                                        return res.sendSuccess(result);
                                    });
                                });
                            });
                        });
                    });
                });
            });
        };
        this.insertOne = (req, res) => {
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
                this._getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    this._beforeInsert(args, repo, (err, options) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        repo.insert(options, (err, doc) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            let obj = doc.toObject();
                            _publishEvents.call(this, {
                                method: 'inertOne',
                                data: obj
                            }, () => {
                                this._afterAdd(obj, (err, result) => {
                                    if (err) {
                                        return res.sendRsp(err.code, err.message);
                                    }
                                    return res.sendSuccess(result);
                                });
                            });
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
                    let dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    this._allowDelete(args.id, dsName, (err) => {
                        if (err) {
                            return res.sendRsp(eRetCodes.DB_DELETE_ERR, err.message);
                        }
                        //
                        repo.updateOne({
                            filter: {
                                _id: args.id
                            },
                            updates: {
                                $set: {
                                    status: sysdefs.eStatus.DEL_PENDING,
                                    updateAt: new Date()
                                }
                            }
                        }, (err, doc) => {
                            if (err) {
                                return res.sendRsp(err.code, 'Set del-pending error!');
                            }
                            let options = {
                                filter: tools.deepAssign({
                                    _id: args.id
                                }, this._deleteOptions || {})
                            }
                            this._beforeDeleteOne(options);
                            repo.remove(options, (err, result) => {
                                if (err) {
                                    return res.sendRsp(err.code, err.message);
                                }
                                if (result.deletedCount === 0) {
                                    return res.sendRsp(eRetCodes.ACCEPTED, 'No document deleted!');
                                }
                                _publishEvents.call(this, {
                                    method: 'deleteOne',
                                    data: doc
                                }, () => {
                                    return res.sendSuccess(result);
                                });
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
        // Declaring other variables and methods here ...
    }
};

// Declaring module exports
module.exports = exports = {
    ControllerBase: ControllerBase,
    EntityController: EntityController,
    ServiceBase: ServiceBase
};
