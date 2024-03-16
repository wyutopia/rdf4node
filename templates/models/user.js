/**
 * Created by Eric on 2023/02/16
 */
const {
    pubdefs, 
    mongoose: {Schema, SchemaDL, Types: {ObjectId}},
    cache: {eDataType, eLoadPolicy}
} = require('../app');

// Define user schema
const sdl = new SchemaDL({
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
    password           : { 
        type: String, 
        minLength: 6,
        maxLength: 64,
        required: true 
    },
    status             : { type: Number, enum: Object.values(pubdefs.eStatus), default: pubdefs.eStatus.ACT_PENDING },
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
const schema = new Schema(sdl.spec);
schema.index({createAt: 1});
schema.index({updateAt: -1});
schema.index({username: 1, mobile: 1, email: 1, status: 1});

const _searchVal = sdl.extractValidators(['username', 'mobile', 'email', 'status']);
const _addVal = sdl.extractValidators(['username', 'password', 'mobile', 'email']);
const _updateVal = sdl.extractValidators(['mobile', 'email', 'status']);

// Declaring module exports
const _MODEL_NAME = 'User';
module.exports = exports = {
    modelName: _MODEL_NAME,
    modelSchema: schema,
    modelRefs: [], // Add ref model  names here to advance registering model schemas
    // Controller properties
    validators: {
        searchVal: _searchVal,
        addVal: _addVal,
        mandatoryAddKeys: ['username', 'password'],
        updateVal: _updateVal
    },
    queryOptions: {
        populate: [],
        select: 'username'
    },
    // Cache options
    allowCache: false,   // Default is false
    cacheOptions: {
        eDataType: eDataType.Kv,
        eLoadPolicy: eLoadPolicy.SetAfterFound,
        keyName: 'username',
        valueKeys: '_id status'
    }
}