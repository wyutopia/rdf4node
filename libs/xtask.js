/**
 * Created by Eric on 2021/11/10.
 * Modifed by Eric on 2022/05/04
 */
const assert = require('assert');
const async = require('async');
const schedule = require('node-schedule');
// 
const sysdefs = require('../include/sysdefs');
const theApp = require('../bootstrap');
const tools = require('../utils/tools');
const { WinstonLogger } = require('./base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'xtask');
const mntService = require('./base/prom.wrapper');
const { EventObject, EventModule} = require('../include/events');

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
        type: sysdefs.eMetricType.GAUGE
    }]
});

//
class XTaskManager extends EventModule {
    constructor(props) {
        super(props)
        //
        this.tasks = {};
        this.register = (task) => {
            this.tasks[task._id] = task;
            //
            metricCollector[eMetricNames.activeTasks].inc(1);
        },
        this.dispose = (callback) => {
            logger.info(`${this.$name}: Stop all tasks ...`);
            let keys = Object.keys(this.tasks);
            async.eachLimit(keys, 4, (key, next) => {
                let task = this.tasks[key];
                if (typeof task.dispose === 'function') {
                    return task.dispose(next);
                }
                return process.nextTick(next);
            }, () => {
                logger.info(`${this.$name}: All tasks stopped.`);
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
    $name: MODULE_NAME,
    mandatory: true,
    state: sysdefs.eModuleState.ACTIVE,
    type: sysdefs.eModuleType.TASK
});

// The interval task wrapper
class XTask extends EventObject {
    constructor(props) {
        assert(props !== undefined);
        super(props);
        // Class meta-info
        this._run = true;
        this._id = tools.uuidv4();
        this._isAbstract = props.isAbstract !== undefined;
        this._mutex = false;
        this._hTask = null;

        // Member variables
        this.alias = props.alias || 'XTask';
        this.interval = props.interval || sysdefs.eInterval._5_SEC;
        this.startup = props.startup !== undefined ? props.startup.toUpperCase() : 'AUTO';
        this.cronExp = props.cronExp;
        this.immediateExec = props.immediateExec;
        this.startDelayMs = props.startDelayMs;

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
            if (this._mutex) {
                logger.error(`${this.alias}: loop conflict!`);
                return null;
            }
            this._mutex = true;
            this.beforeWork((err) => {
                if (err) {
                    this._mutex = false;
                    return null;
                }
                this.realWork(() => {
                    //logger.debug(this.alias, 'Finished.')
                    this.afterWork(() => {
                        this._mutex = false;
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
            if (this._hTask === null) {
                this._mutex = false;
                this._hTask = this.startup === 'ONCE' ? setTimeout(this.doWork, this.interval) : setInterval(this.doWork, this.interval);
                logger.info(`${this.alias}: started. - ${this.startup} - ${this.interval}`);
            } else {
                logger.error(`${this.alias}: already exists.`);
            }
        }
        this.stop = () => {
            if (this._hTask !== null) {
                this.startup === 'ONCE' ? clearTimeout(this._hTask) : clearInterval(this._hTask);
                this._hTask = null;
                this._mutex = false;
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
                hTask: this._hTask,
                startup: this.startup
            };
            if (this.cronExp !== undefined) {
                json.cronExp = this.cronExp;
            }
            return json;
        }
        // Startup script
        this._bootstrap = () => {
            if (this.immediateExec) {
                this.doWork();
            }
            if (this.startup === 'AUTO' || this.startup === 'ONCE') {
                this.start();
            } else if (this.startup === 'SCHEDULE' && this.cronExp !== undefined) {
                logger.info(`${this.alias}: Schedule task with cron: ${this.cronExp}`);
                schedule.scheduleJob(this.cronExp, this.doWork.bind(this));
            }
        }
        // Register task
        taskMng.register(this);
        if (!this._isAbstract) {
            if (this.startDelayMs) {
                setTimeout(this._bootstrap.bind(this), this.startDelayMs);
            } else {
                this._bootstrap();
            }
        }
    }
}

module.exports = exports = XTask;