/**
 * Created by Eric on 2023/07/05
 */
const AliOSS = require('ali-oss');
const appRoot = require('app-root-path');
const moment = require('moment');
const multer = require('multer');
const path = require('path');
const tools = require('../../utils/tools');
const {upload: config} = require('../../include/config');
//
const _DEFAULT_DIR = process.env.UPLOAD_DIR || path.join(appRoot.path, 'public/uploads/');
console.log('>>>>>> The default upload dir: ', _DEFAULT_DIR);

//
const _uploads = {};
function getUpload (absDir, options) {
    let destDir = absDir || _DEFAULT_DIR;
    let key = tools.md5Sign(destDir);
    if (_uploads[key] === undefined) {
        _uploads[key] = multer({dest: destDir});
    }
    return _uploads[key];
}

// Define 
module.exports = exports = getUpload;