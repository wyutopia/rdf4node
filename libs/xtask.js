/**
 * Created by wyutopia on 2021/11/10.
 */
 const assert = require('assert');
 const EventEmitter = require('events');
 const schedule = require('node-schedule');

 const pubdefs = require('../include/sysdefs');
 const {WinstonLogger} = require('./base/winston.wrapper');
 const logger = WinstonLogger(process.env.SRV_ROLE || 'xtask');
 
 // the cron format:
 // second minute hour dayOfMonth month dayOfWeek
 class XTask extends EventEmitter {
     constructor(options) {
         assert(options !== undefined);
         super(options);
         // Members
         this.alias = options.alias || 'XTask';
         this.interval = options.interval || pubdefs.eInterval._5_SEC;
         this.startup = options.startup !== undefined? options.startup.toUpperCase() : 'AUTO';
         this.cronExp = options.cronExp;
         this.mutex = false;
         this.hTask = null;
         // Methods
         this.realWork = (callback) => {
             return callback();
         }
         this.doWork = () => {
             //logger.debug(this.alias, 'Start working...');
             if (this.mutex) {
                 logger.error(this.alias, 'conflict!');
                 return null;
             }
             this.mutex = true;
             this.realWork(() => {
                 //logger.debug(this.alias, 'Finished.')
                 this.mutex = false;
             });
         }
         this.start = (itv) => {
             if (itv !== undefined) {
                 this.interval = itv;
             }
             if (this.hTask === null) {
                 this.mutex = false;
                 this.hTask = this.startup === 'ONCE'? setTimeout(this.doWork, this.interval) : setInterval(this.doWork, this.interval);
                 logger.info(this.alias, 'started.');
             } else {
                 logger.error(this.alias, 'already exists.');
             }
         }
         this.stop = () => {
             if (this.hTask !== null) {
                 this.startup === 'ONCE'? clearTimeout(this.hTask) : clearInterval(this.hTask);
                 this.hTask = null;
                 this.mutex = false;
                 logger.info(this.alias, '>>>>> Backend task <<<<<', 'stopped.');
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
             if (this.startup === 'AUTO' || this.startup === 'ONCE') {
                 this.start();
             } else if (this.startup === 'SCHEDULE' && this.cronExp !== undefined) {
                 logger.info(`Schedule task with cron: ${this.cronExp}`);
                 schedule.scheduleJob(this.cronExp, this.start.bind(this));
             }
         })();
     }
 }
 
 module.exports = exports = XTask;