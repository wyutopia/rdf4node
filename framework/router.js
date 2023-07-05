/**
 * Created by Eric on 2022/02/26
 */
const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({dest: 'uploads/'});
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

const reDelKey = new RegExp(/^--/);
const reNotRequired = new RegExp(/^-/);
function _modifyValidators (r, modSpec) {
    if (modSpec !== undefined) {
        modSpec.forEach(key => {
            if (reDelKey.test(key)) {
                let realKey = key.replace('--', '');
                delete r.validator[realKey]
            } else if (reNotRequired.test(key)) {
                let realKey = key.replace('-', '');
                delete r.validator[realKey].required;
            } else if (r.validator[key] !== undefined) {
                r.validator[key].required = true;
            }
        });
    }
}

function _loadRoutes(urlPathArray, filename) {
    let urlPath = urlPathArray.join('/');
    let fullPathName = path.join(routeDir, urlPath, filename);
    try {
        let routes = require(fullPathName);
        routes.forEach( route => {
            if (route.handler.fn !== undefined) {
                let subPath = filename.split('.')[0].replace('-', '/');
                let r = {
                    path: path.join(urlPath, subPath, route.path),
                    authType: route.authType || 'jwt',
                    method: route.method.toUpperCase(),
                    validator: route.handler.val || {},
                    handler: route.handler.fn,
                    isNew: route.isNew
                };
                if (route.oldPath) {
                    r.oldPath = path.join(urlPath, subPath, route.path);
                }
                if (route.modValidators !== undefined) {
                    _modifyValidators(r, route.modValidators);
                }
                if (route.multer !== undefined) {
                    r.multer = route.multer;
                }
                gRoutes.push(r);
            } else {
                logger.error(`Invalid controller method! - ${filename} - ${route.path} - ${toh}`);
            }
        });
    } catch (ex) {
        logger.error(`Load routes from file: ${fullPathName} error! - ${ex.message} - ${ex.stack}`);
    }
}

function _readDir(urlPathArray, dir) {
    let curDir = path.join(routeDir, urlPathArray.join('/'), dir);
    //logger.debug(`Processing current directory: ${curDir}`);
    let entries = fs.readdirSync(curDir, READDIR_OPTIONS);
    entries.forEach( dirent => {
        //logger.debug(`${curDir} - ${dirent.name}`);
        if (isExclude(dirent.name)) {
            return null;
        }
        let nextPaths = urlPathArray.slice();
        nextPaths.push(dir);
        //logger.debug(`Processing sub directory: ${tools.inspect(nextPaths)}`);
        if (dirent.isDirectory()) {
            _readDir(nextPaths, dirent.name);
        } else {
            _loadRoutes(nextPaths, dirent.name);
        }
    });
}

function _setRoute(method, urlPath, funcs) {
    let evalExp = 'router[method](urlPath';
    for (let i = 0; i < funcs.length; i++) {
        evalExp += `, funcs[${i}]`;
    }
    evalExp += ');';
    eval(evalExp);
}

// Load and set routes
(() => {
    try {
        _readDir([''], '');
        //
        gRoutes.forEach(route => {
            let method = (route.method || 'USE').toLowerCase();
            let funcs = [];
            // Add multer middleware if exists
            if (method === 'post' && typeof route.multerFunc === 'function') {
                funcs.push(route.multerFunc);
            }
            // Add accessCtl middleware
            funcs.push(accessCtl.bind(null, route.authType, route.validator));
            // Add sequence middlewares or handler
            if (typeof route.handler === 'function') {
                funcs.push(route.handler);
            } else {
                for (let i = 0; i < route.handler.length; i++) {
                    if (typeof route.handler[i] === 'function') {
                        funcs.push(route.handler[i])
                    }
                }
            }
            // Perform setting route
            try {
                _setRoute(method, route.path, funcs);
                logger.info(`Route: ${route.method} - ${route.path} - ${route.authType} set.`);
            } catch (ex) {
                logger.error(`Set [${method}] ${route.path} error! - ${ex.message} - ${ex.stack}`);
            }
        });
    } catch (err) {
        logger.error(`Read route directory error! - ${err.message} - ${err.stack}`);
    }
})();

// Declaring module exports
module.exports = exports = router;
