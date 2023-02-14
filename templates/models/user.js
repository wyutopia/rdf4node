const db = require('mongoose');
const Schema = db.Schema;
const ObjectId = Schema.Types.ObjectId;
const pubdefs = require('../common/pubdefs');

// Define user schema
let userSchema = new Schema({
    version            : { type: Number, default: 1 },
    createAt           : { type: Date, default: Date.now },
    updateAt           : { type: Date },
    //
    username           : { type: String, required: true, unique: true },
    password           : { type: String, required: true },
    status             : { type: Number, default: pubdefs.eStatus.ACT_PENDING },
    //profile
    mobile             : { type: String },
    email              : { type: String }
});
userSchema.index({createAt: 1});
userSchema.index({updateAt: -1});
userSchema.index({username: 1, mobile: 1, email: 1, status: 1});

// Declaring module exports
const _MODEL_NAME_ = 'User';
module.exports = exports = {
    modelName: _MODEL_NAME_,
    modelSchema: userSchema,
    mutableFields: pubdefs.getMutableFields(userSchema.paths)
}