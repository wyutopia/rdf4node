/**
 * Created by Eric on 2023/07/05
 */
const appRoot = require('app-root-path');
const path = require('path');
const tools = require('../../utils/tools');
const _DEFAULT_DIR = process.env.UPLOAD_DIR || path.join(appRoot.path, 'public/uploads/');
console.log('>>>>>> The default upload dir: ', _DEFAULT_DIR);
const multer = require('multer');

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

module.exports = exports = getUpload;