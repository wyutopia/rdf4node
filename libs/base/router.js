/**
 * Created by Eric on 2022/02/26
 */
let express = require('express');
let router = express.Router();

const fs = require('fs');
const path = require('path');
const {WinstonLogger} = require('./winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf4node');
const jwt = require('./jwt');
const tools = require('../../utils/tools');
const appRoot = require('app-root-path');
const routeDir = path.join(appRoot.path, 'routes');

const config = require('./config');
const securityConf = config.security || {};
/**
 * Middleware to Support CORS
 */
router.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', securityConf.allowOrigin || '*'); // Replace * with actual front-end server ip or domain in production env.
    res.header('Access-Control-Allow-Headers', securityConf.allowHeaders || 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With, Rabbit-Token, Rabbit-Rand');
    res.header('Access-Control-Allow-Methods', securityConf.allowMethods || 'POST, GET, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

/* GET home page. */
router.get('/', function (req, res, next) {
    //TODO: Replace title with your own project name
    res.render('index', {title: 'the rappid-dev-framework!'});
});

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
    try {
        let fullPathName = path.join(dir, filename);
        let routes = require(fullPathName);
        routes.forEach(route => {
            let toh = typeof route.handler;
            if (toh === 'function') {
                gRoutes.push({
                    path: path.join(pathPrefix, filename.split('.')[0].replace('-', ''), route.path),
                    authType: route.authType,
                    method: route.method.toUpperCase(),
                    handler: route.handler
                });
            } else {
                logger.error(`Invalid controller method! - ${route.path} - ${toh}`);
            }
        });
    } catch (ex) {
        logger.error(ex.message);
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
            if (route.authType) {
                router.authType === 'jwt'? router[method](route.path, jwt.validateToken, route.handler) : router[method](route.path, tools.checkSign, route.handler);
            } else {
                router[method](route.path, router.handler);
            }
        });
    } catch (err) {
        logger.error(`Dynamic load routes error! - ${err.message}`);
    }
})();

module.exports = router;
