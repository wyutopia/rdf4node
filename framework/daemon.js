/**
 * Created by Eric on 2023/03/17
 */
const assert = require('assert');
const async = require('async');
const schedule = require('node-schedule');
// 
const Types = require('../include/types');
const tools = require('../utils/tools');
const sysdefs = require('../include/sysdefs');
const _MODULE_NAME = sysdefs.eFrameworkModules.XTASK;
const { EventObject, EventModule } = require('../include/events');
const mntService = require('../libs/base/prom.monitor');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'daemon');

// the cron format:
// second minute hour dayOfMonth month dayOfWeek


const eMetricNames = {
    activeDaemons: 'active_daemons'
};

//
class TaskFactory extends EventModule {
    constructor(appCtx, props) {
        super(appCtx, props)
        //
        this._tasks = {};
        this._metricCollector = mntService.regMetrics({
            moduleName: _MODULE_NAME,
            metrics: [{
                name: eMetricNames.activeTasks,
                type: sysdefs.eMetricType.Gauge
            }]
        });
    }
    //
    create(name, fn, options) {
        logger.debug(`>>> Create new background task: ${name}`);
        const t = this._tasks[name];
        if (t !== undefined) {
            logger.error(`${this.$name}: Task ${name} already exists!`);
            return null;
        }
        if (typeof fn === 'function') {
            options.managed = true;
            this._tasks[name] = new fn(options);
            return this._tasks[name];
        }
        // Do nothing
        return null;
    }
    register(task) {
        this._tasks[task._id] = task;
        //
        this._metricCollector[eMetricNames.activeTasks].inc(1);
    }
    async dispose() {
        const taskNames = Object.keys(this._tasks);
        logger.info(`${this.$name}: Stop ${taskNames.length} backgroud tasks ...`);
        //
        const promises = [];
        taskNames.forEach(key => {
            const task = this._tasks[key];
            if (typeof task.dispose === 'function') {
                promises.push(task.dispose());
            }
        })
        try {
            const results = await Promise.all(promises);
            logger.info(`${this.$name}: All backgroud tasks stopped.`);
            return results;
        } catch (ex) {
            logger.error(`${this.$name}: Stop tasks error! - ${tools.inspect(ex)}`);
            return 0;
        }
    }
}

// The interval task wrapper
class DaemonBase extends EventObject {
    /**
     * The class constructor
     * @param {Types.XTaskProperties} props 
     */
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
        this.alias = props.alias || 'Daemon';
        this.interval = props.interval || sysdefs.eInterval._5_SEC;
        this.startup = props.startup !== undefined ? props.startup.toUpperCase() : 'AUTO';
        this.cronExp = props.cronExp;
        this.immediateExec = props.immediateExec;
        this.startDelayMs = props.startDelayMs;

        // Methods
        this.realWork = async () => {
            return 'ok';
        }
        this.beforeWork = async () => {
            return 'ok';
        }
        this.afterWork = async () => {
            return 'ok';
        }
        // Register task
        (() => {
            if (!this._isAbstract) {
                if (this.startDelayMs) {
                    setTimeout(this._bootstrap.bind(this), this.startDelayMs);
                } else {
                    this._bootstrap();
                }
            }
        })();
    }
    async doWork() {
        //logger.debug(this.alias, 'Start working...');
        if (!this._run) {
            logger.debug(`${this.$name}: stopped.`);
            return null;
        }
        if (this._mutex) {
            logger.error(`${this.$name}: loop conflict!`);
            return null;
        }
        this._mutex = true;
        try {
            await this.beforeWork();
            await this.realWork();
            await this.afterWork();
        } catch(ex) {
            logger.error(`${this.alias}: doWork error! - ${ex.message}`);
        } finally {
            this._mutex = false;
        }
    }
    async dispose() {
        return new Promise((resolve) => {
            this._run = false;
            setTimeout(() => {
                logger.info(`${this.alias}: >>>>> Backend task <<<<< stopped.`);
                this.stop();
                return resolve(`${this.alias} diposed.`);
            }, 200);
        });
    }
    start(itv) {
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
    stop() {
        if (this._hTask !== null) {
            this.startup === 'ONCE' ? clearTimeout(this._hTask) : clearInterval(this._hTask);
            this._hTask = null;
            this._mutex = false;
            logger.info(`${this.alias}: >>>>> Backend task <<<<< destroyed.`);
        }
    }
    restart(itv) {
        this.stop();
        this.start(itv);
    }
    toJSON() {
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
    _bootstrap() {
        if (this.immediateExec) {
            this.doWork().then().catch(ex => {});
        }
        if (this.startup === 'AUTO' || this.startup === 'ONCE') {
            this.start();
        } else if (this.startup === 'SCHEDULE' && this.cronExp !== undefined) {
            logger.info(`${this.alias}: Schedule task with cron: ${this.cronExp}`);
            schedule.scheduleJob(this.cronExp, this.doWork.bind(this));
        }
    }
}

// Define module
module.exports = exports = {
    DaemonBase
};