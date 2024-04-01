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
const { EventModule } = require('../include/events');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'comp');
const tools = require('../utils/tools');
//
const { paginationVal, _DS_DEFAULT_ } = require('./repository');
const { _DEFAULT_PUBKEY_, _DEFAULT_CHANNEL_ } = require('./ebus');
const { CommonObject } = require('../include/base');
const session = require('express-session');
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
            switch (item.op) {
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

 * @returns 
 */
async function _publishEvents(options) {
    try {
        let mode = options.mode || 0;
        let method = options.method;
        if (method === undefined) {
            return null;
        }
        let domainEvent = this._domainEvents[method];
        if (domainEvent === undefined) {
            return null;
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
        await this.pubAsync(evt, this._eventOptions);
    } catch (ex) {
        logger.error(`*** ${this.$name}: ${ex.message}`);
    }
}

const eSessionCacheResource = {
    LicenseReservation: 'licRsv',
    DistributedLock: 'distLock'
    // Additional key goes here ...
}

class SessionCache extends CommonObject {
    constructor(props) {
        super(props || {});
        this._repo = {};
        this._index = 0;
    }
    isEmpty() {
        return Object.keys(this._repo).length === 0;
    }
    keys() {
        return Object.keys(this._repo);
    }
    count() {
        return Object.keys(this._repo).length;
    }
    /**
     * @param { string } rc
     * @param { * } ett
     * @param { string } op
     */
    append(rc, ett, op) {
        let id = this._index;
        this._repo[this._index++] = {
            rc, ett, op
        }
        return id;
    }
    updateOp(id, op) {
        let data = this._repo[id];
        if (data) {
            data.op = op;
        }
    }
    /**
     * @param { string } k 
     * @param { boolean } autoClean - Default true
     * @returns 
     */
    get(k) {
        return this._repo[k];
    }
    remove(id) {
        delete this._repo[id];
    }
    clear() {
        this._repo = {};
        this._index = 0;
    }
}

class ControllerBase extends EventModule {
    constructor(props) {
        super(global.theApp, props);
    }
    getMultiRepos(modelNames, dsName = _DS_DEFAULT_) {
        return this._appCtx.repoFactory.getMultiRepos(modelNames, dsName);
    }
    getRepo(modelName, dsName) {
        return this._appCtx.repoFactory.getRepo(modelName, dsName);
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
    shortSelect: 'name',        // For short query
    // For publish events
    pubKey: _DEFAULT_PUBKEY_,
    channel: _DEFAULT_CHANNEL_,
    // For overridable query operations
    beforeFind: async function (req, baseOptions) {
        return baseOptions;
    },
    //
    afterFindOne: async function (req, doc) { return doc; },      // For only one document
    afterFindMany: async function (req, docs) { return docs; },     // For one or array results
    afterFindPartial: async function (req, results) { return results; },  // For pagination results
    //
    allowAdd: async function (req, sessionCache) { return true; },
    beforeAdd: async function (req) { return req.$args; },
    beforeInsert: async function (req) {
        return {
            filter: req.$args,
            updates: req.$args
        };
    },
    afterAdd: async function (req, doc) { return doc; },
    //
    beforeUpdate: async function (req) {
        let setData = tools.deepAssign({}, req.$args);
        delete setData.id;
        if (Object.keys(setData).length === 0) {
            return Promise.reject({
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
        return params;
    },
    //    beforeUpdateOne: tools.noop,
    afterUpdateOne: async function (req, doc) { return doc; },
    //
    allowDelete: async function (req, id) {
        return Promise.reject({
            code: eRetCodes.METHOD_NOT_ALLOWED,
            message: 'Not allowed!'
        })
    },
    beforeDeleteOne: tools.noop,
    afterDeleteOne: async function (req, doc) { return doc; },
    //
    cleanup: async function (sessionCache) {
        if (sessionCache.isEmpty()) {
            return 0;
        }
        try {
            const promiseMap = {};
            sessionCache.keys().forEach(k => {
                const { rc, ett, op } = sessionCache.get(k);
                switch (rc) {
                    case eSessionCacheResource.LicenseReservation:
                        promiseMap[`${rc}#${k}`] = op === sysdefs.eResourceOp.Apply ? this._appCtx.licenseManager.applyLicense(ett) : this._appCtx.licenseManager.refundLicense(ett);
                        break;
                    case eSessionCacheResource.DistributedLock:
                        promiseMap[`${rc}#${k}`] = op === sysdefs.eResourceOp.Free || op === sysdefs.eResourceOp.Unlock ? this._appCtx.distLocker.UnlockOneAsync(ett) : Promise.resolve('ignored');
                        break;
                    default:
                        logger.warn(`*** ${this.$name}: Unrecognized cache resource - ${rc}`);
                        break;
                }
            })
            if (Object.keys(promiseMap).length === 0) {
                return -1;
            }
            const result = await tools.asyncParallel(promiseMap);
            logger.debug(`>>> ${this.$name}: Cleanup - ${tools.inspect(result)}}]`);
            return 0;
        } catch (ex) {
            logger.error(`*** ${this.$name}: ${ex.message}`);
            return -1;
        }
    }
};
function _initCtlSpec(ctlSpec) {
    Object.keys(_defaultCtlSpec).forEach(key => {
        let privateKey = `_${key}`;
        this[privateKey] = ctlSpec[key] !== undefined ? ctlSpec[key] : _defaultCtlSpec[key];
    });
}

/**
 * Pack the base options for a find operation
 * 2. Add select, populate and sort from model spec.
 * @param { Object } req - The express request 
 * @returns { Types.QueryOptions }
 */
function _prepareFindOptions(req) {
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
        options.populate = this._populate;
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
function _packFindOption(req, baseOptions = {}) {
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
        return { noop: 'Empty updates!' }
    }
    //
    let options = {
        filter: { _id: req.$args.id },
        updates: updates
    }
    if (this._select) {
        options.select = this._select;
    }
    return options;
}

function _setMandatoryKeys(keys, validator) {
    keys.forEach(key => {
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
function _findUpdatedKeys(doc, updates, options) {
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
        // Implementing basic CRUD methods
        this.find = {
            val: (() => {
                let validator = tools.deepAssign({}, this._searchVal);
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: async (req, res) => {
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    const baseOptions = _prepareFindOptions.call(this, req);
                    const options = await this._beforeFind(req, baseOptions);
                    const docs = await repo.findManyAsync(options);
                    const results = await this._afterFindMany(req, docs);
                    return res.sendSuccess(results);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                }
            }
        };
        this.findOne = {
            val: (() => {
                let validator = tools.deepAssign({}, this._searchVal);
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: async (req, res) => {
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    const baseOptions = _prepareFindOptions.call(this, req);
                    const options = await this._beforeFind(req, baseOptions);
                    this.emit('before_find_one', req, options);
                    const doc = await repo.findOneAsync(options);
                    const result = await this._afterFindOne(req, doc);
                    return res.sendSuccess(result);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                }
            }
        };
        this.findPartial = {
            val: (() => {
                let validator = tools.deepAssign({}, paginationVal, this._searchVal);
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: async (req, res) => {
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    const baseOptions = _prepareFindOptions.call(this, req);
                    const options = await this._beforeFind(req, baseOptions);
                    this.emit('before_find_partial', req, options);
                    const result = await repo.findPartialAsync(options);
                    const outcomes = await this._afterFindPartial(req, result);
                    return res.sendSuccess(outcomes);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                }
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
            fn: async (req, res) => {
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    const baseOptions = _prepareFindOptions.call(this, req);
                    const options = await this._beforeFind(req, baseOptions);
                    this.emit('before_findby_id', req, options);
                    const doc = await repo.findOneAsync(options);
                    const result = await this._afterFindOne(req, doc);
                    return res.sendSuccess(result);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                }
            }
        };
        this.findByProject = {
            val: (() => {
                let validator = tools.deepAssign({}, this._searchVal, {
                    project: {
                        type: 'ObjectId',
                        required: true
                    },
                    brief: {},
                    short: {}
                });
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: async (req, res) => {
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    const baseOptions = _prepareFindOptions.call(this, req);
                    const options = await this._beforeFind(req, baseOptions);
                    this.emit('before_findby_project', req, options);
                    const docs = await repo.findManyAsync(options);
                    await _publishEvents.call(this, {
                        method: 'findByProject',
                        data: docs
                    })
                    const results = await this._afterFindMany(req, docs);
                    return res.sendSuccess(results);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                }
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
            fn: async (req, res) => {
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    const baseOptions = _prepareFindOptions.call(this, req);
                    const options = await this._beforeFind(req, baseOptions);
                    this.emit('before_findby_user', req, options);
                    const docs = await repo.findManyAsync(options);
                    const results = await this._afterFindMany(req, docs);
                    return res.sendSuccess(results);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                }
            }
        };
        this.findByGroup = {
            val: (() => {
                let validator = tools.deepAssign({}, this._searchVal, {
                    group: {
                        type: 'ObjectId',
                        required: true
                    },
                    brief: {},
                    short: {}
                });
                _setMandatoryKeys(this._mandatorySearchKeys, validator);
                return validator;
            }).call(this),
            fn: async (req, res) => {
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    const baseOptions = _prepareFindOptions.call(this, req);
                    const options = await this._beforeFind(req, baseOptions);
                    this.emit('before_findby_group', req, options);
                    const docs = await repo.findManyAsync(options);
                    const results = await this._afterFindMany(req, docs);
                    return res.sendSuccess(results);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                }
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
            fn: async (req, res) => {
                let sessionCache = new SessionCache();
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    await this._allowAdd(req, sessionCache);
                    const data = await this._beforeAdd(req);
                    if (data._id === undefined && req.$args.oid !== undefined) {
                        data._id = req.$args.oid; // Using client provided id
                    }
                    const doc = await repo.createAsync(data);
                    let obj = doc.toObject();
                    await _publishEvents.call(this, {
                        method: 'addOne',
                        data: obj,
                        mode: req.$args.mode || 0
                    });
                    const result = await this._afterAdd(req, doc);
                    return res.sendSuccess(result);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                } finally {
                    await this._cleanup(sessionCache);
                }
            }
        };
        // FindOneAndUpdate with upsert=true
        this.insertOne = {
            val: (() => {
                let validator = tools.deepAssign({}, this._addVal);
                _setMandatoryKeys(this._mandatoryAddKeys, validator);
                return validator;
            }).call(this),
            fn: async (req, res) => {
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    const options = await this._beforeInsert(req);
                    const doc = await repo.insertAsync(options);
                    let obj = doc.toObject();
                    await _publishEvents.call(this, {
                        method: 'inertOne',
                        data: obj
                    });
                    const result = await this._afterAdd(req, doc);
                    return res.sendSuccess(result);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                }
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
            fn: async (req, res) => {
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    const params = await this._beforeUpdate(req);
                    this.emit('before_update_one', req, params);
                    const doc = await repo.updateOneAsync(params);
                    let obj = doc.toObject();
                    await _publishEvents.call(this, {
                        method: 'updateOne',
                        data: obj,
                        headers: {
                            updatedKeys: _findUpdatedKeys.call(this, obj, req.$args, params.options)
                        }
                    });
                    const result = await this._afterUpdateOne(req, doc);
                    return res.sendSuccess(result);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                }
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
            fn: async (req, res) => {
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    const id = req.$args.id;
                    await this._allowDelete(req, id);
                    let options = {
                        filter: Object.assign({
                            _id: id
                        }, this._deleteOptions || {})
                    }
                    await this._beforeDeleteOne(options);
                    const doc = await repo.deleteAsync(options);
                    if (!doc) {
                        return res.sendRsp(eRetCodes.ACCEPTED, `#${id} not found!`);
                    }
                    await _publishEvents.call(this, {
                        method: 'deleteOne',
                        data: doc.toObject()
                    });
                    const result = await this._afterDeleteOne(req, doc);
                    return res.sendSuccess(result);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                }
            }
        };
        this.logicDeleteOne = {
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
            fn: async (req, res) => {
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    await this._allowDelete(req, req.$args.id);
                    //
                    const doc = await repo.updateOneAsync({
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
                    })
                    if (!doc) {
                        return res.sendRsp(eRetCodes.DB_DELETE_ERR, `${req.$args.id} already deleted!`);
                    }
                    await _publishEvents.call(this, {
                        method: 'deleteOne',
                        data: doc.toObject()
                    });
                    const result = await this._afterDeleteOne(req, doc);
                    return res.sendSuccess(result);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(eRetCodes.DB_DELETE_ERR, err.message);
                }
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
                },
                dryrun: {}
            },
            fn: async (req, res) => {
                let sessionCache = new SessionCache();
                try {
                    const dsName = req.dataSource.dsName || _DS_DEFAULT_;
                    const repo = this.getRepo(this.modelName, dsName);
                    const options = await _beforePatch.call(this, req);
                    if (options.noop) {
                        return res.sendRsp(eRetCodes.ACCEPTED, options.noop);
                    }
                    const doc = await repo.updateOneAsync(options);
                    await _publishEvents.call(this, {
                        method: 'patchOne',
                        data: doc
                    });
                    await this._afterPatchOne(doc);
                    return res.sendSuccess(doc);
                } catch (err) {
                    logger.error(`*** ${this.$name}: ${err.message}`);
                    return res.sendRsp(err.code, err.message);
                } finally {
                    await this._cleanup(sessionCache);
                }
            }
        }
    }
};

// The ServiceBase class
class ServiceBase extends EventModule {
    constructor(props) {
        super(global.theApp, props);
        // Declaring other variables and methods here ...
    }
};

// Declaring module exports
module.exports = exports = {
    eSessionCacheResource,
    ControllerBase: ControllerBase,
    EntityController: EntityController,
    ServiceBase: ServiceBase,
    utils: {
        packFindOption: _packFindOption,
        findUpdatedKeys: _findUpdatedKeys
    }
};
