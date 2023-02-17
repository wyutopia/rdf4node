/**
 * Created by Eric on 2023/02/16
 */
const {mongoose: db} = require('@icedeer/rdf4node');
const Schema = db.Schema;
const ObjectId = Schema.Types.ObjectId;
const pubdefs = require('../common/pubdefs');

// Define user schema
let schema = new Schema({
    version            : { type: Number, default: 1 },
    createAt           : { type: Date, default: Date.now },
    updateAt           : { type: Date },
    //
    username           : { 
        type: String, 
        required: true, 
        minLength: 4,
        maxLength: 128,
        unique: true 
    },
    password           : { type: String, required: true },
    status             : { type: Number, default: pubdefs.eStatus.ACT_PENDING },
    //profile
    mobile             : { 
        type: String, 
        match: /^1[3-9][0-9]\d{8}$/g
    },
    email              : { 
        type: String, 
        match: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    }
});
schema.index({createAt: 1});
schema.index({updateAt: -1});
schema.index({username: 1, mobile: 1, email: 1, status: 1});

const _searchVal = schema.extractValidators(['username', 'mobile', 'email', 'status']);
const _addVal = schema.extractValidators(['username', 'password', 'mobile', 'email']);
const _updateVal = schema.extractValidators('mobile', 'email', 'status');

// Declaring module exports
const _MODEL_NAME_ = 'User';
module.exports = exports = {
    modelName: _MODEL_NAME_,
    modelSchema: schema,
    modelRefs: [], // Add ref model  names here to advance registering model schemas
    // Controller properties
    ctlSpec: {
        searchVal: _searchVal,
        addVal: _addVal,
        mandatoryAddKeys: ['username', 'password'],
        updateVal: _updateVal,
        populate: [],
        selectKeys: null
    }
}