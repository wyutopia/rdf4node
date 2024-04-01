/**
 * Created by Eric on 2021/11/10
 */
const appRoot = require('app-root-path');
const async = require('async');
const fs = require('fs/promises');
const path = require('path');
const moment = require('moment');

const eRetCodes = require('../include/retcodes.js');
const tools = require('./tools.js');
const { XTask } = require('../framework/xtask.js');
const { WinstonLogger } = require('../libs/base/winston.wrapper.js');
const logger = WinstonLogger(process.env.SRV_ROLE || 'logdir');
let logDir = process.env.LOG_DIR || path.join(appRoot.path, 'logs');
console.log(`>>>>>> Log directory: ${logDir}`);

const gExludeFiles = new RegExp(/^\.nfs/);
function _isExclude(filename) {
    return gExludeFiles.test(filename);
}

exports.listDir = {
    val: {},
    fn: async function (req, res) {
        try {
            const files = await fs.readdir(logDir);
            //logger.info(logDir, ': ', files);
            let result = {
                num: 0,
                size: 0,
                manifest: []
            };
            await async.eachLimit(files, 3, async function (file) {
                let fullPathFile = path.join(logDir, file);
                try {
                    const stats = await fs.stat(fullPathFile)
                    //logger.info(`${file} - stat: ${stats.size}`);
                    result.num++;
                    result.size += stats.size;
                    result.manifest.push({
                        file: file,
                        size: stats.size,
                        mtime: new Date(stats.mtimeMs)
                    })
                } catch(ex) {
                    logger.error(`*** Stat file: ${fullPathFile} error! - ${ex.message}`);
                }
            })
            //logger.info(`Scan result: ${tools.inspect(result)}`);
            return res.sendSuccess(result);
        } catch (err) {
            return res.sendRsp(err.code, err.message);
        }
    }
};

let cleanMutex = false;
exports.cleanDir = {
    val: {},
    fn: async function (req, res) {
        if (cleanMutex === true) {
            return res.sendRsp(eRetCodes.CONFLICT, 'Cleaning...');
        }
        cleanMutex = true;
        try {
            const n = await _cleanLogDir();
            return res.sendSuccess({
                removedFileNum: n
            });
        } catch(err) {
            return res.sendRsp(err.code, err.message);
        } finally {
            cleanMutex = false;
        }
    }
};

async function _cleanLogDir(lastModTime) {
    if (!lastModTime) {
        lastModTime = new Date(moment().format('YYYY-MM-DD')).valueOf();
    }
    try {
        const files = await fs.readdir(logDir);
        logger.debug(`${logDir}: ${tools.inspect(files)}`);
        await _safeRemoveFiles(files, lastModTime);
    } catch (ex) {
        logger.error(`*** Clean log-dir error! - ${ex.message}`);
    }
}

class ScheduledCleanTask extends XTask {
    constructor(options) {
        super(options);
        //
        this.beforeWork = async () => {
            if (cleanMutex === true) {
                return Promise.reject({
                    code: eRetCodes.CONFLICT,
                    message: 'Cleaning'
                })
            }
            cleanMutex = true;
            return true;
        };
        this.realWork = async () => {
            return _cleanLogDir.call(this, new Date(moment().add(-7, 'd').format('YYYY-MM-DD')).valueOf());
        }
        this.afterWork = async () => {
            cleanMutex = false;
            return true;
        };
    }
}

exports.init = function (appCtx) {
    new ScheduledCleanTask({
        alias: 'WeeklyLogFilesCleaner',
        startup: 'SCHEDULE',
        // second minute hour dayOfMonth month dayOfWeek
        cronExp: '0 0 8 * * 1'
    })
}

exports.removeFiles = {
    val: {
        files: {
            type: 'String',
            required: true
        }
    },
    fn: async function (req, res) {
        try {
            const n = await _safeRemoveFiles(args.files.split(','), new Date(moment().format('YYYY-MM-DD')).valueOf());
            return res.sendSuccess({
                removedFileNum: n
            })
        } catch(err) {
            return res.sendRsp(err.code, err.message);
        }
    }
};

async function _safeRemoveFiles(files, lastModTime) {
    logger.debug(`Remove files: ${tools.inspect(files)}`);
    if (!tools.isTypeOfArray(files)) {
        return Promise.reject({
            code: eRetCodes.BAD_REQUEST,
            message: 'Parameter: files is not array!'
        })
    }
    let num = 0;
    await async.eachLimit(files, 3, async (file) => {
        let fullPathFile = path.join(logDir, file);
        try {
            const stats = await fs.stat(fullPathFile);
            if (stats.mtimeMs >= lastModTime) { // Ignore
                logger.info(`Ignore in use log file: ${file}`);
                return null;
            }
            try {
                await fs.unlink(fullPathFile);
                num++;
                logger.info(`File: ${file} removed.`);    
            } catch(err) {
                logger.error(`Remove file error! - ${file} - ${err.code} - ${err.message}`);
            }
        } catch(ex) {
            logger.error(`*** Stat file: ${fullPathFile} error! - ${ex.message}`);
        }
    })
    return num;
}

async function _realReadDir(dir) {
    return fs.readdir(dir);
}

/**
 * @param {*} req 
 * @param {*} res 
 * @returns 
 */
exports.downloadFile = {
    val: {
        filename: {
            type: 'String',
            required: true
        }
    },
    fn: async function (req, res) {
        const filename = req.$args.filename;
        const fullPath = path.join(logDir, filename);
        try {
            logger.info(`Download file: ${fullPath}`);
            res.download(fullPath, filename);
        } catch(ex) {
            return res.sendRsp(eRetCodes.OP_FAILED, ex.message);
        }
    }
}
