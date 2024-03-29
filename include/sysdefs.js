/**
 * Created by eric on 16/9/2.
 */
(() => {
    Object.defineProperty(global, '__stack', {
        get: function() {
            let orig = Error.prepareStackTrace;
            Error.prepareStackTrace = function(_, stack) {
                return stack;
            };
            let err = new Error;
            Error.captureStackTrace(err, arguments.callee);
            let stack = err.stack;
            Error.prepareStackTrace = orig;
            return stack;
        }
    });

    Object.defineProperty(global, '__file', {
        get: function() {
            return __stack[1].getFileName().split('/').slice(-1)[0];
        }
    });

    Object.defineProperty(global, '__line', {
        get: function() {
            return __stack[1].getLineNumber();
        }
    });

    Object.defineProperty(global, '__function', {
        get: function() {
            return __stack[1].getFunctionName();
        }
    });
})();

const eSysStatus = {
    OFFLINE    : "offline",
    MAINTAIN   : "maintain",
    ONLINE     : "online"
};
exports.eSysStatus = eSysStatus;

const eDeployMode = {
    NATIVE     : 'native',
    K8S        : 'k8s'
};
exports.eDeployMode = eDeployMode;

const eFrameworkModules = {
    CONFIG          : '_config_',
    REGISTRY        : '_registry_',
    EBUS            : '_ebus_',
    EVTLOGGER       : '_evtlogger_',
    ICP             : '_icp_',
    TIMER           : '_timer_',
    DATASOURCE      : '_datasource_',
    REPOSITORY      : '_repository_',
    CACHE           : '_cache_',
    ENDPOINT        : '_endpoint_',
    ROUTER          : '_router_',
    DLOCKER         : '_distlocker_',
    XTASK           : '_xtask_',
    UPLOAD          : '_upload_',
    REDIS_CM        : '_redis_cm_',
    RASCAL_CM       : '_racal_cm_'
};
exports.eFrameworkModules = eFrameworkModules;

const eModuleState = {
    INIT         : 'init',
    READY        : 'ready',
    ACTIVE       : 'active',
    SUSPEND      : 'suspend',
    STOP_PENDING : 'pending'
};
exports.eModuleState = eModuleState;
exports.isValidModuleStatus = function (s) {
    return Object.values(eModuleState).indexOf(s) > -1;
};

const eModuleType = {
    OBJ          : 'obj',
    TASK         : 'task',
    APP          : 'app',
    CM           : 'cm',   // connection manager
    LIB          : 'lib'
};
exports.eModuleType = eModuleType;
exports.isValidModuleType = function (s) {
    return Object.values(eModuleType).indexOf(s) > -1;
};

const eStatus = {
    UNREG       : -1,
    ACTIVE      : 0,
    ACT_PENDING : 1,
    // set 2 - 8 as abnormal state for account
    EXPIRED     : 6,
    SUSPEND     : 7,
    DEL_PENDING : 8,
    DELETED     : 9,
    CLOSED      : 10,
    EXTEND      : 100
};
exports.eStatus = eStatus;
exports.isValidStatus = (s) => {
    return Object.values(eStatus).indexOf(s) > -1;
}

let eString = {
    SESSION_EXPIRED      : '会话过期,请重新打开公众号.'
};
Object.freeze(eString);
exports.eString = eString;

const eInterval = {
    _1_SEC       : 1000,
    _2_SEC       : 2000,
    _3_SEC       : 3000,
    _5_SEC       : 5000,
    _8_SEC       : 8000,
    _10_SEC      : 10 * 1000,
    _15_SEC      : 15 * 1000,
    _30_SEC      : 30 * 1000,
    _90_SEC      : 90 * 1000,
    _1_MIN       : 60 * 1000,
    _2_MIN       : 2 * 60 * 1000,
    _3_MIN       : 3 * 60 * 1000,
    _4_MIN       : 4 * 60 * 1000,
    _5_MIN       : 5 * 60 * 1000,
    _6_MIN       : 6 * 60 * 1000,
    _8_MIN       : 8 * 60 * 1000,
    _10_MIN      : 10 * 60 * 1000,
    _15_MIN      : 15 * 60 * 1000,
    _20_MIN      : 20 * 60 * 1000,
    _30_MIN      : 30 * 60 * 1000,
    _50_MIN      : 50 * 60 * 1000,
    _90_MIN      : 90 * 60 * 1000,
    _1_HOUR      : 3600 * 1000,
    _2_HOUR      : 2 * 3600 * 1000,
    _3_HOUR      : 3 * 3600 * 1000,
    _4_HOUR      : 4 * 3600 * 1000,
    _6_HOUR      : 6 * 3600 * 1000,
    _8_HOUR      : 8 * 3600 * 1000,
    _10_HOUR     : 10 * 3600 * 1000,
    _12_HOUR     : 12 * 3600 * 1000,
    _1_DAY       : 24 * 3600 * 1000,
    _2_DAY       : 48 * 3600 * 1000,
    _3_DAY       : 72 * 3600 * 1000,
    _5_DAY       : 5 * 24 * 3600 * 1000,
    _7_DAY       : 7 * 24 * 3600 * 1000,
    _14_DAY      : 14 * 24 * 3600 * 1000,
    _31_DAY      : 31 * 24 * 3600 * 1000
};
exports.eInterval = eInterval;

const __1K = 1024;
const __1M = __1K * __1K;
const __1G = __1K * __1M;
const eSize = {
    _1K     : 1024,
    _2K     : 2 * __1K,
    _3K     : 3 * __1K,
    _5K     : 5 * __1K,
    _8K     : 8 * __1K,
    _10K    : 10 * __1K,
    _20K    : 20 * __1K,
    _50K    : 50 * __1K,
    _80K    : 80 * __1K,
    _100K   : 100 * __1K,
    _1M     : 1024 * __1K,
    _2M     : 1 * __1M,
    _3M     : 3 * __1M,
    _5M     : 5 * __1M,
    _8M     : 8 * __1M,
    _10M    : 10 * __1M,
    _20M    : 20 * __1M,
    _50M    : 50 * __1M,
    _100M   : 100 * __1M,
    _200M   : 200 * __1M,
    _500M   : 500 * __1M,
    _800M   : 800 * __1M,
    _1G     : 1024 * __1M,
    _2G     : 2 * __1G,
};
exports.eSize = eSize;

const eAlarmSeverity = {
    CRITICAL      : 5,        // RED       : vibrate + sound
    MAJOR         : 4,        // ORANGE    : sound
    MINOR         : 3,        // YELLOW    : vibrate
    WARNING       : 2,        // NAVY      : status bar notification
    INDETERMINATE : 1,        // PURPLE    : log
    CLEARED       : 0         // GREEN     : log
};
exports.eAlarmSeverity = eAlarmSeverity;
exports.getAlarmSeverityString = function(s) {
    let str = 'Unknown';
    switch(s) {
        case 0:
            str = 'CLEAR';
            break;
        case 1:
            str = 'WARNING';
            break;
        case 2:
            str = 'MINOR';
            break;
        case 3:
            str = 'MAJOR';
            break;
        case 4:
            str = 'CRITICAL';
            break;
        case 5:
            str = 'FATAL';
            break;
    }
    return str;
};

const eAlarmStatus = {
    ACTIVE        : 'ACT',
    CLEAR         : 'CLR'
};
exports.eAlarmStatus = eAlarmStatus;

const eAlarmCode = {
    // System alarm
    SERVICE_STARTUP                : 1000,
    QUERY_SIGNTASK_ERR             : 4000,
    // Additional alarms ...
    OUT_OF_SERVICE                 : 5000,
    GRACEFUL_EXIT                  : 9000
};
exports.eAlarmCode = eAlarmCode;

const eAlarmConfig = {
    100: {
        alias: '无服务',
        severity: eAlarmSeverity.CRITICAL,
        suggest: '请尽快排查!'
    }
};
exports.eAlarmConfig = eAlarmConfig;

const eRedisResult = {
    SUCCESS: 'OK',
    FAILURE: 0
};
exports.eRedisResult = eRedisResult;

const ALLOWED_CFG_KEYS = [
    'NODE_ENV',
    'SRV_ROLE',
    'PROC_ROLE',
    'LOG_DIR',
    "LOG_LEVEL",
    'CFG_FILE',
    "PORT",
    "ENABLE_MQ",
    "port",
    "consul",
    "auth"
];

exports.extractValidConfig = function(inObj) {
    let conf = {};
    Object.keys(inObj).forEach((key) => {
        if (ALLOWED_CFG_KEYS.indexOf(key) !== -1) {
            conf[key] = inObj[key];
        }
    });
    return conf;
}

const eEncoding = {
    GBK  : 'gbk',
    UTF8 : 'utf8'
};
exports.eEncoding = eEncoding;

const eMetricType = {
    Counter  : 'counter',
    Gauge    : 'gauge'
};
exports.eMetricType = eMetricType;

function  _getMutableFields (paths, excludes = ['_id', 'version', 'createAt', 'updateAt']) {
    let fields = Object.keys(paths);
    excludes.forEach( key => {
        let index = fields.indexOf(key);
        if (index !== -1) {
            fields.splice(index, 1);
        }
    });
    return fields;
}
exports.getUpdatableFields = _getMutableFields;
exports.getMutableFields = _getMutableFields;

const eRequestAuthType = {
    NONE     : 'none',
    JWT      : 'jwt',
    COOKIE   : 'cookie',
    AKSK     : 'aksk' 
};
exports.eRequestAuthType = eRequestAuthType;
exports.isValidAuthType = function(t) { return Object.values(eRequestAuthType).indexOf(t) > -1; }

const eDbType = {
    PROCMEM       : 'procmem',
    NATIVE        : 'native',
    MONGO         : 'mongo',
    MYSQL         : 'mysql',
    SQLSERVER     : 'sqlsrv'
};
exports.eDbType = eDbType;

const eCacheEngine = {
    Native        : 'native',
    Redis         : 'redis',
};
exports.eCacheEngine = eCacheEngine;

const eEventBusEngine = {
    Native        : 'native',
    RabbitMQ      : 'rabbitmq',
    RocketMQ      : 'rocketmq',
    Redis         : 'redis'
};
exports.eEventBusEngine = eEventBusEngine;

const eOSSEngine = {
    Native        : 'native',
    AliOSS        : 'alioss'
};
exports.eOSSEngine = eOSSEngine;

const eClientState = {
    Null: 'null',
    Init: 'init',
    Conn0: 'conn0',
    Conn: 'connected',
    ConnErr: 'connerr',
    Querying: 'querying',
    PClosing: 'pclosed',
    ClosePending: 'closepending',
    Closing: 'closing',
    Pending: 'pending',
    Closed: 'closed'
};
exports.eClientState = eClientState;
exports.eConnectionState = eClientState;

const eServerState = {
    Null: 'null',
    Init: 'init'
};
exports.eServerState = eServerState;

const ePatchOp = {
    Add     : 'add',
    Remove  : 'rm',
    Replace : 'rep'
};
exports.ePatchOp = ePatchOp;

const eErrMsg = {
    INVALID_DS    : 'DataSource not exists!'
};
exports.eErrMsg = eErrMsg;