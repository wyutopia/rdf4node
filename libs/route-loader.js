/**
 * Create by wyutopia on 2021/11/11
 */
let express = require('express');
let router = express.Router();

const appRoot = require('app-root-path');
const fs = require('fs');
const path = require('path');
const {WinstonLogger} = require('./winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf');
const mntService = require('./prom.wrapper');
const projectRoutePath = process.env.ROUTE_PATH || path.join(appRoot.path, 'routes');
logger.info(`>>>>>> projectRoutePath=${projectRoutePath}`);
/**
 * Middleware to Support CORS
 */
router.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*'); // Replace * with actual front-end server ip or domain in production env.
    res.header('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With, Rabbit-Token, Rabbit-Rand');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
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
router.get('/monitor/metrics', mntService.getMetrics);
router.get('/monitor/health', mntService.checkHealth);

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
    let entries = fs.readdirSync(projectRoutePath, READDIR_OPTIONS);
    let rootPath = '';
    entries.forEach( dirent => {
        if (dirent.isFile() && !isExclude(dirent.name)) {
            _loadRouteConfig(rootPath, projectRoutePath, dirent.name);
        } else if (dirent.isDirectory()) {
            _loadSubRoutes(rootPath, projectRoutePath, dirent.name);
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
            logger.info(`Set system route: ${route.path} - ${route.method}`);
            if (route.method === 'GET') {
                router.get(route.path, route.handler);
            } else if (route.method === 'POST') {
                router.post(route.path, route.handler);
            } else if (route.method === 'USE') {
                router.use(route.path, route.handler);
            } else {
                logger.error(`Illegal route with method = ${route.method}`);
            }
        });
    } catch (err) {
        logger.error(`Dynamic load routes error! - ${err.message}`);
    }
})();

module.exports = router;
