/**
 * Created by Eric on 2021/11/15.
 */
let assert = require('assert');
let mongoose = require('mongoose');
const tools = require("../../utils/tools");
//mongoose.Promise = require('bluebird');
mongoose.set('strictQuery', true);
mongoose.set('strictPopulate', false);

// Add new SchemaDL class into mongoose lib
mongoose.SchemaDL = function (options) {
    this.spec = options;
    this.extractValidators = (paths) => {
        let doc = {};
        paths.forEach(key => {
            if (this.spec[key] !== undefined) {
                doc[key] = this.spec[key];
            }
        });
        return _extractValidatorsFromDoc(doc);
    };
}

// Following are methos for extracting validators from schema ddl
const _constValProps = ['min', 'max', 'minLength', 'maxLength', 'enum', 'match', 'allowEmpty'];
function _parseValProps(doc, val) {
    _constValProps.forEach(key => {
        if (doc[key]) {
            let valKey = key === 'match'? 'regexp' : key;
            val[valKey] = doc[key];
        }
    });
}
function _extractValidator(doc) {
    let validator = {};
    if (doc.type) {
        validator.type = doc.type.name;
        _parseValProps(doc, validator);
    } else if (tools.isTypeOfArray(doc)) {
        if (doc[0].type) {
            validator.type = `Array<${doc[0].type.name}>`;
            _parseValProps(doc[0], validator);
        } else {
            validator.type = 'Array<EmbeddedObject>';
            validator.$embeddedValidators = _extractValidatorsFromDoc(doc[0]);
        }
    } else {
        validator.type = 'EmbeddedObject';
        validator.$embeddedValidators = _extractValidatorsFromDoc(doc);
    }
    return validator;
}

function _extractValidatorsFromDoc(doc) {
    let validators = {};
    Object.keys(doc).forEach(key => {
        if (key !== '_id') {
            validators[key] = _extractValidator(doc[key]);
        }
    });
    return validators;
}

const Schema = mongoose.Schema;
// Followings are old extraction methods
Schema.prototype.extractValidators = function (keys, options = {isSearch: false}) {
    let paths = {};
    keys.forEach(key => {
        let path = this.path(key);
        if (path) {
            paths[key] = path;
        }
    });
    return _extractValidatorsFromPaths(paths, options);
}

function _extractValidatorsFromPaths(paths, options) {
    let validators = {};
    Object.keys(paths).forEach(key => {
        if (key !== '_id') {
            validators[key] = _extractValidator3(paths[key], options);
        }
    });
    return validators;
}

function _extractValidator3 (path, options) {
    let pathType = path.instance;
    let pathValidators = path.validators;
    if (pathType === 'Array') {
        let embeddedSchemaType = path.$embeddedSchemaType.instance || 'EmbeddedObject';
        pathType = options.isSearch? embeddedSchemaType : `Array<${embeddedSchemaType}>`;
        pathValidators = path.$embeddedSchemaType.validators || [];
    }
    let validator = {
        type: pathType
    }
    pathValidators.forEach (v => {
        switch(v.type) {
            case 'enum':
                validator.enum = v.enumValues;
                break;
            case 'min':
                validator.min = v.min;
                break;
            case 'max':
                validator.max = v.max;
                break;
            case 'minlength':
                validator.minLen = v.minlength;
                break;
            case 'maxlength':
                validator.maxLen = v.maxlength;
                break;
            case 'regexp':
                validator.regexp = v.regexp
                break;
        }
    });
    if (pathType === 'Array<EmbeddedObject>') {
        let subDocPaths = tools.safeGetJsonValue(path, 'schema.paths');
        if (subDocPaths) {
            validator.$embeddedValidators = _extractValidatorsFromPaths(subDocPaths, options);
        }
    }
    return validator;
}

module.exports = exports = mongoose;

 //http://mongoosejs.com/docs/middleware.html
 //https://mongoosejs.com/docs/deprecations.html#-findandmodify-

 //Replace update() with updateOne(), updateMany(), or replaceOne()
 //Replace remove() with deleteOne() or deleteMany().
 //Replace count() with countDocuments(),
 // unless you want to count how many documents are in the whole collection (no filter).
 // In the latter case, use estimatedDocumentCount().
