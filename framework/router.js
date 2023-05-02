/**
 * Created by Eric on 2022/02/26
 */
const fs = require('fs');
const path = require('path');
let express = require('express');
let router = express.Router();
const appRoot = require('app-root-path');
const routeDir = path.join(appRoot.path, 'routes');
// Framework
const {WinstonLogger} = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'router');
const {accessCtl} = require('./ac');
const tools = require('../utils/tools');
const config = require('./config');
const securityConf = config.security || {};
/**
 * Middleware to Support CORS
 */
const _commonHeaders = [
    'Content-Type', 'Content-Length', 'Authorization', 'Accept', 'X-Requested-With', 'ActiveGroup', 'ActiveTenant', 'AuthToken'
];
const allowHeaders = securityConf.allowHeaders? _commonHeaders.concat(securityConf.allowHeaders) : _commonHeaders;

router.all('*', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', securityConf.allowOrigin || '*'); // Replace * with actual front-end server ip or domain in production env.
    res.header('Access-Control-Allow-Headers', allowHeaders.join(', '));
    res.header('Access-Control-Allow-Methods', securityConf.allowMethods || 'POST, GET, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

/* GET home page. */
router.get('/', (req, res, next) => {
    //TODO: Replace title with your own project name
    res.render('index', {title: config.app.alias || 'the rappid-dev-framework!'});
});

if (process.env.NODE_ENV !== 'production') {
    router.get('/api', (req, res) => {
        return res.render('api', {routes: gRoutes});
    });
}

let gRoutes = [];
const READDIR_OPTIONS = {
    withFileTypes: true
};

const EXCLUDE_FILES = [
    '.DS_Store',
    'index.js'
];
function isExclude(filename) {
    return EXCLUDE_FILES.indexOf(filename) !== -1;
}

function _loadRoutes() {
    let entries = fs.readdirSync(routeDir, READDIR_OPTIONS);
    let rootPath = '/';
    entries.forEach( dirent => {
        if (dirent.isFile() && !isExclude(dirent.name)) {
            _loadRouteConfig(rootPath, routeDir, dirent.name);
        } else if (dirent.isDirectory()) {
            _loadSubRoutes(rootPath, routeDir, dirent.name);
        }
    });
    //
}

function _loadSubRoutes(pathPrefix, dir, subDir) {
    let currDir = path.join(dir, subDir)
    let entries = fs.readdirSync(currDir, READDIR_OPTIONS);
    entries.forEach( dirent => {
        if (dirent.isFile() && !isExclude(dirent.name)) {
            _loadRouteConfig(path.join(pathPrefix, subDir), currDir, dirent.name);
        }
    })
}

function _loadRouteConfig(pathPrefix, dir, filename) {
    let fullPathName = null;
    try {
        fullPathName = path.join(dir, filename);
        let routes = require(fullPathName);
        routes.forEach(route => {
            let toh = typeof route.handler.fn;
            if (toh === 'function') {
                gRoutes.push({
                    path: path.join(pathPrefix, filename.split('.')[0].replace('-', '/'), route.path),
                    authType: route.authType || 'jwt',
                    method: route.method.toUpperCase(),
                    validator: route.handler.val || {},
                    handler: route.handler.fn
                });
            } else {
                logger.error(`Invalid controller method! - ${filename} - ${route.path} - ${toh}`);
            }
        });
    } catch (ex) {
        logger.error(`Loading ${fullPathName} error! - ${ex.message} - ${ex.stack}`);
    }
}

// Load and set routes
(() => {
    try {
        _loadRoutes();
        //
        gRoutes.forEach(route => {
            logger.info(`Set system route: ${route.path} - ${route.method} - ${route.authType}`);
            let method = (route.method || 'USE').toLowerCase();
            router[method](route.path, accessCtl.bind(null, route.authType, route.validator), route.handler);
        });
    } catch (err) {
        logger.error(`Dynamic load routes error! - ${err.message}`);
    }
})();

// Declaring module exports
module.exports = exports = router;
