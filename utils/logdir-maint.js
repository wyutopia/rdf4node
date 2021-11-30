/**
 * Create by eric on 2021/11/10
 */
const appRoot = require('app-root-path');
const async = require('async');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const tools = require('./tools');
const eRetCodes = require('../include/retcodes.js');
const {WinstonLogger} = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'logdir');

let logDir = process.env.LOG_DIR || path.join(appRoot.path, 'logs');
console.log(`>>>>>> Log directory: ${logDir}`);

const gExludeFiles = new RegExp(/^\.nfs/);
function _isExclude(filename) {
    return gExludeFiles.test(filename);
}

exports.listDir = function (req, res) {
    _realReadDir(logDir, function(err, files) {
        if (err) {
            return res.sendRsp(err.code, err.message);
        }
        //logger.info(logDir, ': ', files);
        let result = {
            num: 0,
            size: 0,
            manifest: []
        };
        async.eachLimit(files, 2, function(file, callback) {
            let fullPathFile = path.join(logDir, file);
            fs.stat(fullPathFile, (err, stats) => {
                if (err) {
                    logger.error(`Stat file: ${file} - ${err.message}`);
                    return callback();
                }
                logger.info(`${file} - stat: ${stats.size}`);
                result.num++;
                result.size += stats.size;
                result.manifest.push({
                    file: file,
                    size: stats.size
                });
                return callback();
            })
        }, function() {
            logger.info(`Scan result: ${tools.inspect(result)}`);
            return res.sendSuccess(result);
        });
    });
};

exports.cleanDir = function (req, res) {
    _realReadDir(logDir, function(err, files) {
        if (err) {
            return res.sendRsp(err.code, err.message);
        }
        logger.info(`${logDir}: ${tools.inspect(files)}`);
        _realRemoveFiles(files, function(err, num) {
            if (err) {
                return res.sendRsp(err.code, err.message);
            }
            return res.sendSuccess({
                removedFileNum: num
            })
        });
    });
};

exports.removeFiles = function (req, res) {
    tools.checkParameters(req.body, ['files'], function (err, args) {
        if (err) {
            return res.sendRsp(err.code, err.message);
        }
        _realRemoveFiles(args.files, function (err, num) {
            if (err) {
                return res.sendRsp(err.code, err.message);
            }
            return res.sendSuccess({
                removedFileNum: num
            });
        });
    });
}

function _realReadDir(dir, callback) {
    fs.readdir(dir, function(err, files) {
        if (err) {
            logger.error(`Read logDir error! - ${err.code} - ${err.message}`);
            return callback(err);
        }
        logger.info(`Files: ${tools.inspect(files)}`);
        return callback(null, files);
    });
}

function _realRemoveFiles(files, callback) {
    logger.info(`Remove files: ${tools.inspect(files)}`);
    if (!tools.isTypeOfArray(files)) {
        return callback({
            code: eRetCodes.BAD_REQUEST,
            message: 'Parameter: files is not array!'
        });
    }
    let num = 0;
    async.eachLimit(files, 2, function (file, callback) {
        let fullPathFile = path.join(logDir, file);
        if (!_isArchive(fullPathFile)) {
            return process.nextTick(callback);
        }
        fs.unlink(fullPathFile, (err) => {
            if (err) {
                logger.error(`Remove file error! - ${file} - ${err.code} - ${err.message}`);
                return callback(err);
            }
            num++;
            logger.info(`File: ${file} removed.`);
            return callback();
        });
    }, function (err) {
        if (err) {
            return callback(err);
        }
        return callback(null, num);
    });
}

function _isArchive(fullPathFileName) {
    try {
        let stat = fs.statSync(fullPathFileName);
        let today = new Date(moment().format('YYYY-MM-DD')).valueOf();
        return stat.mtimeMs < today;
    } catch (ex) {
        logger.error(`statSync file error! - ${ex.message}`);
        return false;
    }
}

/**
 * @param {*} req 
 * @param {*} res 
 * @returns 
 */
exports.downloadFile = function (req, res) {
    let file = req.params.filename;
    if (file === undefined) {
        return res.sendRsp(eRetCodes.BAD_REQUEST, 'Invalid file name!');
    }
    let fullPath = path.join(logDir, file);
    logger.info(`Download file: ${fullPath}`);
    if (!fs.existsSync(fullPath)) {
        return res.sendStatus(eRetCodes.NOT_FOUND);
    }
    res.download(fullPath, (err) => {
        if (err) {
            logger.error(err.code, err.message);
        }
    });
};
