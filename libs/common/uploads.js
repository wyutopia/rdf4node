/**
 * Created by Eric on 2023/07/05
 */
const appRootPath = require('app-root-path');
const path = require('path');
const destDir = process.env.UPLOAD_DIR || path.join(appRootPath, 'public/uploads/');
const multer = require('multer');
const uploads = multer({dest: destDir});

//
module.exports = exports = uploads;