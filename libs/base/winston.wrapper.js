/**
 * Caution: Only for winston v3
 * Created by Eric on 2021/09/28.
 */
const appRoot = require('app-root-path');
const fs = require('fs');
const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');
const { combine, timestamp, label, printf } = winston.format;
const MESSAGE = Symbol.for('message');

const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');
const logDir = process.env.LOG_DIR || path.join(appRoot.path, 'logs');
console.log('>>>>>> Log parameters:', logDir, logLevel);

if (!fs.existsSync(logDir)) {
    try {
        fs.mkdirSync(logDir);
    } catch (ex) {
        console.error('>>>>>> Create log-dir failed!', ex.message);
    }
}

const xFormat = printf(({ timestamp, level, message }) => {
    return `${timestamp} - ${level}: ${message}`;
});

const jsonFormatter = (logEntry) => {
    logEntry[MESSAGE] = JSON.stringify({
        timestamp: new Date(),
        level: logEntry.level,
        message: logEntry.message
    });
    return logEntry;
}

let gLoggers = {};
class WinstonLogger {
    constructor(name) {
        this._logger = winston.createLogger({
            level: logLevel,
            exitOnError: false, // Continue after logging an uncaughtException
            format: winston.format(jsonFormatter)(),
            transports: [
                new winston.transports.Console({
                    level: logLevel,
                    timestamp: true,
                    format: combine(
                        timestamp(),
                        xFormat
                    )
                }),
                new winston.transports.File({
                    name: 'info-log',
                    filename: path.join(logDir, `${name}-info.log`),
                    maxsize: '10000000',
                    level: 'info'
                }),
                new winston.transports.File({
                    name: 'err-log',
                    filename: path.join(logDir, `${name}-err.log`),
                    maxsize: '10000000',
                    level: 'error'
                }),
                // Daily-rotate
                new winston.transports.DailyRotateFile({
                    filename: path.join(logDir, `${name}.log.%DATE%`),
                    datePattern: 'YYYY-MM-DD',
                    zippedArchive: true,
                    maxSize: '10m',
                    maxFiles: '7d'
                })
            ]
        });
        // Implementing log methods
        this.info = (...msg) => {
            let filename = __stack[1].getFileName().split('/').slice(-1)[0];
            let line = __stack[1].getLineNumber();
            msg.unshift(filename, line);
            this._logger.info(msg.join(' '));
        }
        this.error = (...msg) => {
            let filename = __stack[1].getFileName().split('/').slice(-1)[0];
            let line = __stack[1].getLineNumber();
            msg.unshift(filename, line);
            this._logger.error(msg.join(' '));
        }
        this.warn = (...msg) => {
            let filename = __stack[1].getFileName().split('/').slice(-1)[0];
            let line = __stack[1].getLineNumber();
            msg.unshift(filename, line);
            this._logger.warn(msg.join(' '));
        }
        this.debug = (...msg) => {
            let filename = __stack[1].getFileName().split('/').slice(-1)[0];
            let line = __stack[1].getLineNumber();
            msg.unshift(filename, line);
            this._logger.debug(msg.join(' '));
        }
    }
}

function WinstonWrapper(name) {
    if (name === undefined) {
        name = 'untitled';
    }
    if (gLoggers[name] !== undefined) {
        return gLoggers[name];
    }
    // Instance own logger
    let logger = new WinstonLogger(name);
    gLoggers[name] = logger;
    return logger;
}
exports.WinstonLogger = WinstonWrapper;

exports.getLoggers = function (callback) {
    return callback(null, Object.keys(gLoggers));
};

exports.getTransporters = function (name, callback) {
    let logger = gLoggers[name];
    if (logger === undefined) {
        return callback({
            code: 404,
            message: `Logger not found! - ${name}`
        });
    }
    let results = {};
    Object.keys(logger.transports).forEach((tp) => {
        results[tp] = logger.transports[tp].level;
    });
    return callback(null, results);
};

exports.setLoggerLevel = function (name, tp, level, callback) {
    let logger = gLoggers[name];
    if (logger === undefined) {
        return callback({
            code: 404,
            message: `Logger not found! - ${name}`
        });
    }
    if (logger.transports[tp] === undefined) {
        return callback({
            code: 404,
            message: `Transporter not found! - ${name} - ${tp}`
        });
    }
    logger.transports[tp].level = level;
    return callback(null, logger.transports[tp].level);
};
