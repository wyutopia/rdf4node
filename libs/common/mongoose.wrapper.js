/**
 * Created by Eric on 2021/11/15.
 */
let assert = require('assert');
let mongoose = require('mongoose');
mongoose.Promise = require('bluebird');
mongoose.set('strictQuery', true);

module.exports = exports = mongoose;



 //http://mongoosejs.com/docs/middleware.html
 //https://mongoosejs.com/docs/deprecations.html#-findandmodify-

 //Replace update() with updateOne(), updateMany(), or replaceOne()
 //Replace remove() with deleteOne() or deleteMany().
 //Replace count() with countDocuments(),
 // unless you want to count how many documents are in the whole collection (no filter).
 // In the latter case, use estimatedDocumentCount().
