/**
 * Created by Eric on 2023/07/05
 */
const appRoot = require('app-root-path');
const path = require('path');
const destDir = process.env.UPLOAD_DIR || path.join(appRoot.path, 'public/uploads/');
console.log('>>>>>> The upload dir:', destDir);
const multer = require('multer');
const upload = multer({dest: destDir});

//
module.exports = exports = upload;