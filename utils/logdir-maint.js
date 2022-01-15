/**
 * Create by eric on 2021/11/10
 */
const appRoot = require('app-root-path');
const async = require('async');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

const eRetCodes = require('../include/retcodes.js');
const tools = require('./tools');
const XTask = require('../libs/xtask');
const {WinstonLogger} = require('../libs/base/winston.wrapper');
const { setFlagsFromString } = require('v8');
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
                    size: stats.size,
                    mtime: new Date(stats.mtimeMs)
                });
                return callback();
            })
        }, function() {
            logger.info(`Scan result: ${tools.inspect(result)}`);
            return res.sendSuccess(result);
        });
    });
};

let cleanMutex = false;
exports.cleanDir = function (req, res) {
    if (cleanMutex === true) {
        return res.sendRsp(eRetCodes.CONFLICT, 'Cleaning...');
    }
    cleanMutex = true;
    _cleanLogDir((err, num) => {
        cleanMutex = false;
        if (err) {
            return res.sendRsp(err.code, err.message);
        }
        return res.sendSuccess({
            removedFileNum: num
        });
    });
};

function _cleanLogDir(lastModTime, callback) {
    if (typeof lastModTime === 'function') {
        callback = lastModTime;
        lastModTime = new Date(moment().format('YYYY-MM-DD')).valueOf();
    }
    _realReadDir(logDir, function(err, files) {
        if (err) {
            cleanMutex = false;
            return res.sendRsp(err.code, err.message);
        }
        logger.debug(`${logDir}: ${tools.inspect(files)}`);
        return _safeRemoveFiles(files, lastModTime, callback);
    });
}

class ScheduledCleanTask extends XTask {
    constructor(options) {
        super(options);
        //
        this.beforeWork = (callback) => {
            if (cleanMutex === true) {
                return callback({
                    code: eRetCodes.CONFLICT,
                    message: 'Cleaning'
                });
            }
            cleanMutex = true;
            return callback();
        };
        this.realWork = _cleanLogDir.bind(this, new Date(moment().add(-7, 'd').format('YYYY-MM-DD')).valueOf());
        this.afterWork = (callback) => {
            cleanMutex = false;
            return callback();
        };
    }
}

// second minute hour dayOfMonth month dayOfWeek
new ScheduledCleanTask({
    alias: 'WeeklyLogFilesCleaner',
    startup: 'SCHEDULE',
    cronExp: '0 0 8 * * 1'
});

exports.removeFiles = function (req, res) {
    tools.parseParameters(req.body, {
        mandatory: ['files']
    }, (err, args) => {
        if (err) {
            return res.sendRsp(err.code, err.message);
        }
        if (typeof args.files !== 'string') {
            return res.sendRsp(eRetCodes.BAD_REQUEST, 'Invalid parameters: files! - Should be string!');
        }
        _safeRemoveFiles(args.files.split(','), new Date(moment().format('YYYY-MM-DD')).valueOf(), (err, num) => {
            if (err) {
                return res.sendRsp(err.code, err.message);
            }
            return res.sendSuccess({
                removedFileNum: num
            });
        });
    });
}

function _safeRemoveFiles(files, lastModTime, callback) {
    logger.debug(`Remove files: ${tools.inspect(files)}`);
    if (!tools.isTypeOfArray(files)) {
        return callback({
            code: eRetCodes.BAD_REQUEST,
            message: 'Parameter: files is not array!'
        });
    }
    let num = 0;
    async.eachLimit(files, 4, (file, next) => {
        let fullPathFile = path.join(logDir, file);
        fs.stat(fullPathFile, (err, stats) => {
            if (err) {
                logger.error(`Stat file error! - ${err.message}`);
                return next(err);
            }
            if (stats.mtimeMs >= lastModTime) { // Ignore
                logger.info(`Ignore in use log file: ${file}`);
                return next();
            }
            fs.unlink(fullPathFile, (err) => {
                if (err) {
                    logger.error(`Remove file error! - ${file} - ${err.code} - ${err.message}`);
                    return next(err);
                }
                num++;
                logger.info(`File: ${file} removed.`);
                return next();
            });
        });
    }, function (err) {
        if (err) {
            return callback(err);
        }
        return callback(null, num);
    });
}

function _realReadDir(dir, callback) {
    fs.readdir(dir, function(err, files) {
        if (err) {
            logger.error(`Read logDir error! - ${err.code} - ${err.message}`);
            return callback(err);
        }
        logger.debug(`Exist log files: ${tools.inspect(files)}`);
        return callback(null, files);
    });
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
