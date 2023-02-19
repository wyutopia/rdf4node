/**
 * Created by Eric on 2021/11/15.
 */
let assert = require('assert');
let mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
mongoose.set('strictQuery', true);

let Schema = mongoose.Schema;
Schema.prototype.extractValidators = function (keys, options = {isSearch: false}) {
    let results = {};
    keys.forEach(key => {
        let path = this.path(key);
        if (!path) {
            return;
        }
        let pathType = path.instance;
        let pathValidators = path.validators || [];
        if (pathType === 'Array') {
            pathType = options.isSearch? path.$embeddedSchemaType.instance : `Array<${path.$embeddedSchemaType.instance}>`;
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
                    validator.match = v.regexp
                    break;
            }
        });
        results[key] = validator;
    });
    return results;
};

module.exports = exports = mongoose;

 //http://mongoosejs.com/docs/middleware.html
 //https://mongoosejs.com/docs/deprecations.html#-findandmodify-

 //Replace update() with updateOne(), updateMany(), or replaceOne()
 //Replace remove() with deleteOne() or deleteMany().
 //Replace count() with countDocuments(),
 // unless you want to count how many documents are in the whole collection (no filter).
 // In the latter case, use estimatedDocumentCount().
