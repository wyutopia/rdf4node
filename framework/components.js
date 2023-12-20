/**
 * Created by Eric on 2023/02/07
 */
// System libs
const assert = require('assert');
const ObjectId = require('mongoose').Types.ObjectId;
// Framework libs
const Types = require('../include/types');
const sysdefs = require('../include/sysdefs');
const eRetCodes = require('../include/retcodes');
const {EventModule} = require('../include/events');
const {WinstonLogger} = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'comp');
const tools = require('../utils/tools');
//
const {repoFactory, paginationVal, _DS_DEFAULT_} = require('./repository');
const {_DEFAULT_PUBKEY_, _DEFAULT_CHANNEL_} = require('./ebus');

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

const _reNotAllowed = new RegExp(/^-/);
/**
 * 
 * @param { Object } options
 * @param { number } options.mode
 * @param { string } options.method
 * @param { Object } options.headers
 * @param { string } options.dsName
 * @param { Object } options.data
 * @param { Callback } callback 
 * @returns 
 */
function _publishEvents(options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    let mode = options.mode || 0;
    let method = options.method;
    if (method === undefined) {
        return callback();
    }
    let domainEvent = this._domainEvents[method];
    if (domainEvent === undefined) {
        return callback();
    }
    let evt = tools.deepAssign({
        headers: Object.assign({
            source: this.$name,
            modelName: this.modelName,
            dsName: options.dsName || _DS_DEFAULT_
        }, options.headers),
        body: options.data
    }, domainEvent.success);
    if (typeof domainEvent.select === 'string') { // Remove not-allowed properties
        domainEvent.select.split(' ').forEach(key => {
            if (_reNotAllowed.test(key)) {  
                delete evt.body[key.slice(1)]
            }
        });
    }
    this.pubEvent(evt, this._eventOptions, err => {
        if (err) {
            logger.error(`Publish event: ${tools.inspect(evt)} error! - ${err.code}#${err.message}`);
        }
        return callback();
    });
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
    searchVal: {},              // For search query
    mandatorySearchKeys: [],    // For 
    addVal: {},                 // For create
    mandatoryAddKeys: [],
    updateVal: {},              // For Update
    mandatoryUpdateKeys: [],    // 
    chainUpdateKeys: {},        // For chain updates
    delVal: {},
    mandatoryDelKeys: [],       // For delete 
    // For database query options
    populate: null,             // For populate
    sort: null,                 // For sort
    select: null,               // For select 
    deleteOptions: null,        // For additional delete criterias
    briefSelect: 'name',        // For brief query
    // For publish events
    pubKey: _DEFAULT_PUBKEY_,
    channel: _DEFAULT_CHANNEL_,
    // For overridable query operations
    beforeFind: function (req, baseOptions, callback) {
        return callback(null, baseOptions);
    },
    //
    afterFindOne: function (req, doc, callback) { return callback(null, doc); },      // For only one document
    afterFindMany: function (req, docs, callback) { return callback(null, docs); },     // For one or array results
    afterFindPartial: function (req, results, callback) { return callback(null, results); },  // For pagination results
    //
    allowAdd: function (req, callback) { return callback(); },
    beforeAdd: function (req, callback) { return callback(null, req.$args); },
    beforeInsert: function (req, callback) { 
        return callback(null, {
            filter: req.$args,
            updates: req.$args
        }); 
    },
    afterAdd: function (req, doc, callback) { return callback(null, doc); },
    //
    beforeUpdate: function (req, callback) {
        let setData = tools.deepAssign({}, req.$args);
        delete setData.id;
        if (Object.keys(setData).length === 0) {
            return callback({
                code: eRetCodes.ACCEPTED,
                message: 'Empty updates!'
            });
        }
        setData.updateAt = new Date();
        let params = {
            filter: {
                _id: req.$args.id
            },
            updates: {
                $set: setData
            },
            options: {
                new: true
            }
        }
        if (this._populate) {
            params.populate = this._populate;
        }
        if (this._select) {
            params.select = this._select;
        }
        return callback(null, params);
    },
//    beforeUpdateOne: tools.noop,
    afterUpdateOne: function (req, doc, callback) { return callback(null, doc); },
    //
    allowDelete: function (req, id, callback) { 
        return callback({
            code: eRetCodes.METHOD_NOT_ALLOWED,
            message: 'Not allowed!'
        });
    },
    beforeDeleteOne: tools.noop,
    afterDeleteOne: function (req, doc, callback) { return callback(null, doc); }
};
function _initCtlSpec(ctlSpec) {
    Object.keys(_defaultCtlSpec).forEach( key => {
        let privateKey = `_${key}`;
        this[privateKey] = ctlSpec[key] || _defaultCtlSpec[key];
    });
}

/**
 * Pack the base options for a find operation
 * 2. Add select, populate and sort from model spec.
 * @param { Object } req - The express request
 * @param {*} callback 
 * @returns 
 */
function _prepareFindOptions (req) {
    const options = {};
    const args = req.$args;
    // Step 1: Extract page, pageSize, brief, sort from request parameters
    ['page', 'pageSize'].forEach(key => {
        if (args[key]) {
            options[key] = args[key];
            delete args[key];
        }
    });
    if (args.sort !== undefined) {
        const sortData = {};
        args.sort.split(',').forEach(key => {
            sortData[key] = 1;
        })
        options.sort = sortData;
        delete args.sort;
    } else if (this._sort) {
        options.sort = this._sort;
    }
    
    // Step 2: Append select, populate and from model spec
    // Convert id to _id if provided
    if (args.id !== undefined) {
        args._id = args.id;
        delete args.id;
    }
    if (args.brief) {
        options.select = this._briefSelect;
        delete args.brief;
    } else if (this._select) {
        options.select = this._select;
    }
    if (this._populate) {
        options.popualte = this._populate;
    }
    //
    options.filter = args;
    return options;
}
/**
 * 
 * @param { Object } req - The express request
 * @param { Object } baseOptions - The base find options
 * @param { Object } baseOptions.filter - The filter conditions
 * @param { ObjectId } baseOptions.filter.id - The entity ObjectId
 * @param { Object } baseOptions.filter.sort - The sort option
 * @param { Object } baseOptions.filter.select - The select option
 * @param { Object } baseOptions.filter.populate - The populate option
 * @returns { Object } options - The total wrapper of query options
 */
function _packFindOption (req, baseOptions = {}) {
    let baseFilter = baseOptions.filter || {};
    let filter = tools.deepAssign(baseFilter, req.$args);
    // Convert id to _id
    if (filter.id !== undefined) {
        filter._id = filter.id;
        delete filter.id;
    }
    // Create options without brief
    delete filter.brief;
    let options = {
        filter: filter
    };
    if (baseOptions.sort || this._sort) {
        options.sort = baseOptions.sort || this._sort;
    }
    if (req.$args.brief) { // Using briefSelect and no populate
        options.select = this._briefSelect; 
    } else {
        if (this._select) {
            options.select = this._select;
        }
        if (this._populate) {
            options.populate = this._populate;
        }
    }
    return options;
}

function _beforePatch(req) {
    let updates = this._parsePatch(req.$args.jsonPatch);
    //
    if (Object.keys(updates).length === 0) {
        return {noop: 'Empty updates!'}
    }
    //
    let options = {
        filter: {_id: req.$args.id},
        updates: updates
    }
    if (this._select) {
        options.select = this._select;
    }
    return options;
}

function _setMandatoryKeys(keys, validator) {
    keys.forEach( key => {
        let path = key.replace('.', '.$embeddedValidators.');
        let val = tools.safeGetJsonValue(validator, path);
        if (val) {
            val.required = true;
        }
    });
}

function _getObjectIdString(v) {
    if (v instanceof ObjectId) {
        return v + '';
    }
    if (v._id instanceof ObjectId) {
        return v._id + '';
    }
    return null;
}

/**
 * 
 * @param { Object } doc - The entity document
 * @param { Object } updates - All update values in JSON format
 * @param { Object } options - The update query options
 * @param { boolean } options.new - Flag for return updated document
 * @returns 
 */
function _findUpdatedKeys (doc, updates, options) {
    let configKeys = Object.keys(this._chainUpdateKeys);
    if (options.new === true || configKeys.length === 0) {
        return configKeys;
    }
    let updatedKeys = [];
    configKeys.forEach(key => {
        if (updates[key] !== undefined) {
            let spec = this._chainUpdateKeys[key];
            if (['String', 'Number', 'Boolean'].indexOf(spec.type) !== -1) {  // 
                if (doc[key] !== updates[key]) {
                    updatedKeys.push(key);
                }
            } else if (spec.type === 'ObjectId') {
                let oidString = _getObjectIdString(doc[key]);
                if (oidString && oidString !== updates[key]) {
                    updatedKeys.push(key);
                }
            } else {
                logger.error(`Unrecognized chainUpdateKey type! - ${spec.type}`);
            }
        }
    });
    return updatedKeys;
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
        // Register event publishers
        this._domainEvents = props.domainEvents || {};
        // Implementing the class methods
        /**
         * 
         * @param { Types.DataSourceOptions } dsOptions 
         * @param { function } callback 
         * @returns 
         */
        this.getRepo = (dsOptions, callback) => {
            if (typeof dsOptions === 'function') {
                callback = dsOptions;
                dsOptions = {};
            }
            let dsName = dsOptions.dsName || _DS_DEFAULT_;
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
        /**
         * 
         * @param { Types.DataSourceOptions } dsOptions 
         * @returns 
         */
        this.getRepoSync = (dsOptions = {}) => {
            let dsName = dsOptions.dsName || _DS_DEFAULT_;
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
        // Implementing basic CRUD methods
        this.find = {
            val: (() => {
                let validator = tools.deepAssign({}, this._searchVal);
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    const baseOptions = _prepareFindOptions.call(this, req);
                    this._beforeFind(req, baseOptions, (err, options) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        repo.findMany(options, (err, docs) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            this._afterFindMany(req, docs, (err, results) => {
                                if (err) {
                                    return res.sendRsp(err.code, err.message);
                                }
                                return res.sendSuccess(results);
                            });
                        });
                    });
                });
            }
        };
        this.findOne = {
            val: (() => {
                let validator = tools.deepAssign({}, this._searchVal);
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    const baseOptions = _prepareFindOptions.call(this, req);
                    this._beforeFind(req, baseOptions, (err, options) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this.emit('before_find_one', req, options);
                        repo.findOne(options, (err, doc) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            this._afterFindOne(req, doc, (err, result) => {
                                if (err) {
                                    return res.sendRsp(err.code, err.message);
                                }
                                return res.sendSuccess(result);
                            });
                        });
                    });
                });
            }
        };
        this.findPartial = {
            val: (() => {
                let validator = tools.deepAssign({}, paginationVal, this._searchVal);
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    //
                    const baseOptions = _prepareFindOptions.call(this, req);
                    this._beforeFind(req, baseOptions, (err, options) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this.emit('before_find_partial', req, options);
                        repo.findPartial(options, (err, result) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            this._afterFindPartial(req, result, (err, outcomes) => {
                                if (err) {
                                    return res.sendRsp(err.code, err.message);
                                }
                                return res.sendSuccess(outcomes);
                            });
                        });
    
                    });
                });
            }
        };
        // 
        this.findById = {
            val: (() => {
                let validator = tools.deepAssign({}, this._searchVal, {
                    id: {
                        type: 'ObjectId',
                        required: true
                    }
                });
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    const baseOptions = _prepareFindOptions.call(this, req);
                    this._beforeFind(req, baseOptions, (err, options) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this.emit('before_findby_id', req, options);
                        repo.findOne(options, (err, doc) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            this._afterFindOne(req, doc, (err, result) => {
                                if (err) {
                                    return res.sendRsp(err.code, err.message);
                                }
                                return res.sendSuccess(result);
                            });
                        });
                    });
                });
            }
        };
        this.findByProject = {
            val: (() => {
                let validator = tools.deepAssign({}, this._searchVal, {
                    project: {
                        type: 'ObjectId',
                        required: true
                    },
                    brief: {}
                });
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    const baseOptions = _prepareFindOptions.call(this, req);
                    this._beforeFind(req, baseOptions, (err, options) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this.emit('before_findby_project', req, options);
                        repo.findMany(options, (err, docs) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            _publishEvents.call(this, {
                                method: 'findByProject',
                                data: docs
                            }, () => {
                                this._afterFindMany(req, docs, (err, results) => {
                                    if (err) {
                                        return res.sendRsp(err.code, err.message);
                                    }
                                    return res.sendSuccess(results);
                                });
                            });
                        });
                    });
                });
            }
        };
        this.findByUser = {
            val: (() => {
                let validator = tools.deepAssign({}, this._searchVal, {
                    user: {
                        type: 'ObjectId',
                        required: true
                    },
                });
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    //
                    const baseOptions = _prepareFindOptions.call(this, req);
                    this._beforeFind(req, baseOptions, (err, options) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this.emit('before_findby_user', req, options);
                        repo.findMany(options, (err, docs) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            this._afterFindMany(req, docs, (err, results) => {
                                if (err) {
                                    return res.sendRsp(err.code, err.message);
                                }
                                return res.sendSuccess(results);
                            });
                        });
                    });
                });
            }
        };
        this.findByGroup = {
            val: (() => {
                let validator = tools.deepAssign({}, this._searchVal, {
                    group: {
                        type: 'ObjectId',
                        required: true
                    },
                    brief: {}
                });
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    //
                    const baseOptions = _prepareFindOptions.call(this, req);
                    this._beforeFind(req, baseOptions, (err, options) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this.emit('before_findby_group', req, options);
                        repo.findMany(options, (err, docs) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            this._afterFindMany(req, docs, (err, results) => {
                                if (err) {
                                    return res.sendRsp(err.code, err.message);
                                }
                                return res.sendSuccess(results);
                            });
                        });
                    });
                });
            }
        };
        // Create one new entity
        this.addOne = {
            val: (() => {
                let validator = tools.deepAssign({
                    oid: {
                        type: 'ObjectId'
                    }
                }, this._addVal);
                _setMandatoryKeys(this._mandatoryAddKeys, validator);
                return validator;
            }).call(this),
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    this._allowAdd(req, (err) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this._beforeAdd(req, (err, data) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            if (data._id === undefined && req.$args.oid !== undefined) {
                                data._id = req.$args.oid;
                            }
                            repo.create(data, (err, doc) => {
                                if (err) {
                                    return res.sendRsp(err.code, err.message);
                                }
                                let obj = doc.toObject();
                                _publishEvents.call(this, {
                                    method: 'addOne',
                                    data: obj,
                                    mode: req.$args.mode || 0
                                }, () => {
                                    this._afterAdd(req, doc, (err, result) => {
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
            }
        };
        // FindOneAndUpdate with upsert=true
        this.insertOne = {
            val: (() => {
                let validator = tools.deepAssign({}, this._addVal);
                _setMandatoryKeys(this._mandatoryAddKeys, validator);
                return validator;
            }).call(this),
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    this._beforeInsert(req, (err, options) => {
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
                                this._afterAdd(req, doc, (err, result) => {
                                    if (err) {
                                        return res.sendRsp(err.code, err.message);
                                    }
                                    return res.sendSuccess(result);
                                });
                            });
                        });
                    });
                });
            }
        };
        this.updateOne = {
            val: (() => {
                let validator = tools.deepAssign({
                    id: {
                        type: 'ObjectId',
                        required: true
                    }
                }, this._updateVal);
                _setMandatoryKeys(this._mandatoryUpdateKeys, validator);
                return validator;
            }).call(this),
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    this._beforeUpdate(req, (err, params) => {
                        if (err) {
                            return res.sendRsp(err.code, err.message);
                        }
                        this.emit('before_update_one', req, params);
                        repo.updateOne(params, (err, doc) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            let obj = doc.toObject();
                            _publishEvents.call(this, {
                                method: 'updateOne',
                                data: obj,
                                headers: {
                                    updatedKeys: _findUpdatedKeys.call(this, obj, req.$args, params.options)
                                }
                            }, () => {
                                this._afterUpdateOne(req, doc, (err, result) => {
                                    return res.sendSuccess(result);
                                });
                            });
                        });
                    });
                });
            }
        };
        this.deleteOne = {
            val: (() => {
                let validator = tools.deepAssign({
                    id: {
                        type: 'ObjectId',
                        required: true
                    }
                }, this._delVal);
                _setMandatoryKeys(this._mandatoryDelKeys, validator);
                return validator;
            }).call(this),
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    this._allowDelete(req, req.$args.id, (err) => {
                        if (err) {
                            return res.sendRsp(eRetCodes.DB_DELETE_ERR, err.message);
                        }
                        //
                        let options = {
                            filter: Object.assign({
                                _id: req.$args.id
                            }, this._deleteOptions || {})
                        }
                        this._beforeDeleteOne(options);
                        repo.delete(options, (err, doc) => {
                            if (err) {
                                return res.sendRsp(err.code, err.message);
                            }
                            if (!doc) {
                                return res.sendRsp(eRetCodes.ACCEPTED, 'No document deleted!');
                            }
                            _publishEvents.call(this, {
                                method: 'deleteOne',
                                data: doc.toObject()
                            }, () => {
                                this._afterDeleteOne(req, doc, () => {
                                    return res.sendSuccess(doc);
                                })
                            });
                        });
                    });
                });
            }
        };
        this.logicDeleteOne = {
            val: {
                tenant: {
                    type: 'ObjectId',
                    required: true
                },
                id: {
                    type: 'ObjectId',
                    required: true
                },
                comment: {
                    type: 'String'
                }
            },
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    this._allowDelete(req, req.$args.id, (err) => {
                        if (err) {
                            return res.sendRsp(eRetCodes.DB_DELETE_ERR, err.message);
                        }
                        //
                        repo.updateOne({
                            filter: {
                                _id: req.$args.id,
                                status: sysdefs.eStatus.ACTIVE
                            },
                            updates: {
                                $set: {
                                    updateAt: new Date(),
                                    status: sysdefs.eStatus.DELETED,
                                    comment: req.$args.comment
                                }
                            },
                            allowEmpty: true
                        }, (err, doc) => {
                            if (err) {
                                return res.sendRsp(err.code, 'Fake delete error!');
                            }
                            if (!doc) {
                                return res.sendRsp(eRetCodes.DB_DELETE_ERR, `${req.$args.id} already deleted!`);
                            }
                            _publishEvents.call(this, {
                                method: 'deleteOne',
                                data: doc.toObject()
                            }, () => {
                                this._afterDeleteOne(req, doc, () => {
                                    return res.sendSuccess(doc);
                                })
                            });
                        });
                    });
                });
            }
        };
        this.patchOne = {
            val: {
                id: {
                    type: 'ObjectId',
                    requird: true
                },
                jsonPatch: {
                    required: true
                }
            },
            fn: (req, res) => {
                this.getRepo(req.dataSource, (err, repo) => {
                    if (err) {
                        return res.sendRsp(err.code, err.message);
                    }
                    let options = _beforePatch.call(this, req);
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
            }
        }
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
    ServiceBase: ServiceBase,
    utils: {
        packFindOption: _packFindOption,
        findUpdatedKeys: _findUpdatedKeys
    }
};
