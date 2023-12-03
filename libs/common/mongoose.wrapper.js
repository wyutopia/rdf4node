/**
 * Created by Eric on 2021/11/15.
 * Modified by Eric on 2023/11/21
 */
const mongoose = require('mongoose');
mongoose.set('strictQuery', true);
mongoose.set('strictPopulate', false);
const ObjectId = mongoose.Types.ObjectId;
const Schema = mongoose.Schema;
//mongoose.Promise = require('bluebird');
const tools = require("../../utils/tools");


// Add new SchemaDL class into mongoose lib

/**
 * @constructor
 * @param {Object} options - The schema spec
 */
function SchemaDL (options) {
    this.spec = options;
    /**
     * Extract validators from schema sdl based on paths and options
     * @param {string[]} paths - The path array
     * @param {*} options 
     * @returns 
     */
    this.extractValidators = (paths, options = {}) => {
        const isSearch = options.isSearch !== undefined? options.isSearch : false;
        const doc = {};
        paths.forEach(key => {
            if (this.spec[key] !== undefined) {
                doc[key] = this.spec[key];
            }
        });
        return _extractValidatorsFromDoc(doc, isSearch);
    };
    this.extractRefs = () => {
        const refs = [];
        Object.keys(this.spec).forEach(path => {
            _parseRefs(this.spec[path]).forEach(ref => {
                if (refs.indexOf(ref) === -1) {
                    refs.push(ref);
                }
            });
        });
        return refs;
    }
}
mongoose.SchemaDL = SchemaDL;

function _parseRefs (doc) {
    const refs = [];
    if (doc === undefined) {
        return refs;
    }
    const prop = tools.isTypeOfArray(doc)? doc[0] : doc;
    if (prop === undefined || prop instanceof Schema) { // Maybe extract ref from Schema in the future
        return refs;
    }
    if (prop.type) {  // For primitive prop
        if (prop.type === ObjectId && prop.ref && refs.indexOf(prop.ref) === -1) {
            refs.push(prop.ref);
        }
        return refs;
    }
    // For Object prop
    Object.keys(prop).forEach(path => {
        _parseRefs(prop[path]).forEach(ref => {
            if (refs.indexOf(ref) === -1) {
                refs.push(ref);
            }
        })
    })
    return refs;
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

/**
 * 
 * @param {Object} doc 
 * @param {boolean} isSearch - For search opeartion or not
 * @returns 
 */
function _parseValidator(doc, isSearch) {
    let validator = {};
    if (doc.type) {
        validator.type = doc.type.name;
        _parseValProps(doc, validator);
    } else if (tools.isTypeOfArray(doc)) {
        if (doc[0].type) {
            validator.type = isSearch? doc[0].type.name : `Array<${doc[0].type.name}>`;  // No Array required on search request
            _parseValProps(doc[0], validator);
        } else {
            validator.type = 'Array<EmbeddedObject>';
            validator.$embeddedValidators = _extractValidatorsFromDoc(doc[0], isSearch);
        }
    } else {
        validator.type = 'EmbeddedObject';
        validator.$embeddedValidators = _extractValidatorsFromDoc(doc, isSearch);
    }
    return validator;
}

function _extractValidatorsFromDoc(doc, isSearch) {
    let validators = {};
    Object.keys(doc).forEach(key => {
        if (key !== '_id') {
            validators[key] = _parseValidator(doc[key], isSearch);
        }
    });
    return validators;
}

/*
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
*/
module.exports = exports = mongoose;

 //http://mongoosejs.com/docs/middleware.html
 //https://mongoosejs.com/docs/deprecations.html#-findandmodify-

 //Replace update() with updateOne(), updateMany(), or replaceOne()
 //Replace remove() with deleteOne() or deleteMany().
 //Replace count() with countDocuments(),
 // unless you want to count how many documents are in the whole collection (no filter).
 // In the latter case, use estimatedDocumentCount().
