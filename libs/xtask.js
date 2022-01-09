/**
 * Created by wyutopia on 2021/11/10.
 */
const assert = require('assert');
const async = require('async');
const EventEmitter = require('events');
const schedule = require('node-schedule');

const pubdefs = require('../include/sysdefs');
const {CommonModule} = require('../include/components');

const theApp = require('../bootstrap');
const tools = require('../utils/tools');
const { WinstonLogger } = require('./base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'xtask');
const mntService = require('./base/prom.wrapper');

// the cron format:
// second minute hour dayOfMonth month dayOfWeek

const MODULE_NAME = "TASKS_MNG";

const eMetricNames = {
    activeTasks : 'active_tasks'
};

const metricCollector = mntService.regMetrics({
    moduleName: MODULE_NAME,
    metrics:[{
        name: eMetricNames.activeTasks,
        type: pubdefs.eMetricType.GAUGE
    }]
});

//
class XTaskManager extends CommonModule {
    constructor(options) {
        super(options)
        //
        this.tasks = {};
        this.register = (task) => {
            this.tasks[task._id] = task;
            //
            metricCollector[eMetricNames.activeTasks].inc(1);
        },
        this.dispose = (callback) => {
            logger.info(`${this.name}: Stop all tasks ...`);
            let keys = Object.keys(this.tasks);
            async.eachLimit(keys, 4, (key, next) => {
                let task = this.tasks[key];
                if (typeof task.dispose === 'function') {
                    return task.dispose(next);
                }
                return process.nextTick(next);
            }, () => {
                logger.info(`${this.name}: All tasks stopped.`);
                return callback();
            });
        }
        //
        (() => {
            theApp.regModule(this);
        })();
    }
}
const taskMng = new XTaskManager({
    name: MODULE_NAME,
    mandatory: true,
    state: pubdefs.eModuleState.ACTIVE,
    type: pubdefs.eModuleType.TASK
});

// The interval task wrapper
class XTask extends EventEmitter {
    constructor(options) {
        assert(options !== undefined);
        super(options);
        // Class meta-info
        this._run = true;
        this._id = tools.uuidv4();
        // Member variables
        this.alias = options.alias || 'XTask';
        this.interval = options.interval || pubdefs.eInterval._5_SEC;
        this.startup = options.startup !== undefined ? options.startup.toUpperCase() : 'AUTO';
        this.cronExp = options.cronExp;
        this.mutex = false;
        this.hTask = null;
        // Methods
        this.realWork = (callback) => {
            return process.nextTick(callback);
        }
        this.beforeWork = (callback) => {
            return process.nextTick(callback);
        }
        this.afterWork = (callback) => {
            return process.nextTick(callback);
        }
        this.doWork = () => {
            //logger.debug(this.alias, 'Start working...');
            if (!this._run) {
                logger.debug(`${this.alias}: stopped.`);
                return null;
            }
            if (this.mutex) {
                logger.error(`${this.alias}: loop conflict!`);
                return null;
            }
            this.mutex = true;
            this.beforeWork(() => {
                this.realWork(() => {
                    //logger.debug(this.alias, 'Finished.')
                    this.afterWork(() => {
                        this.mutex = false;
                        return null;
                    });
                });
            });
        }
        this.dispose = (callback) => {
            this._run = false;
            return setTimeout(() => {
                logger.info(`${this.alias}: >>>>> Backend task <<<<< stopped.`);
                return callback();
            }, 200);
        }
        this.start = (itv) => {
            if (itv !== undefined) {
                this.interval = itv;
            }
            if (this.hTask === null) {
                this.mutex = false;
                this.hTask = this.startup === 'ONCE' ? setTimeout(this.doWork, this.interval) : setInterval(this.doWork, this.interval);
                logger.info(`${this.alias}: started. - ${this.startup} - ${this.interval}`);
            } else {
                logger.error(`${this.alias}: already exists.`);
            }
        }
        this.stop = () => {
            if (this.hTask !== null) {
                this.startup === 'ONCE' ? clearTimeout(this.hTask) : clearInterval(this.hTask);
                this.hTask = null;
                this.mutex = false;
                logger.info(`${this.alias}: >>>>> Backend task <<<<< destroyed.`);
            }
        }
        this.restart = (itv) => {
            this.stop();
            this.start(itv);
        }
        this.toJSON = () => {
            let json = {
                alias: this.alias,
                interval: this.interval,
                hTask: this.hTask,
                startup: this.startup
            };
            if (this.cronExp !== undefined) {
                json.cronExp = this.cronExp;
            }
            return json;
        }
        // Startup script
        (() => {
            taskMng.register(this);
            //
            if (options.immediateExec) {
                this.doWork();
            }
            if (this.startup === 'AUTO' || this.startup === 'ONCE') {
                if (options.startDelayMs) {
                    setTimeout(this.start.bind(this), options.startDelayMs);
                } else {
                    this.start();
                }
            } else if (this.startup === 'SCHEDULE' && this.cronExp !== undefined) {
                logger.info(`Schedule task with cron: ${this.cronExp}`);
                schedule.scheduleJob(this.cronExp, this.start.bind(this));
            }
        })();
    }
}

module.exports = exports = XTask;