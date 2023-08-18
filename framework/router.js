/**
 * Created by Eric on 2022/02/26
 */
const fs = require('fs');
const path = require('path');
const appRoot = require('app-root-path');
const _rootDir = path.join(appRoot.path, 'routes');
// Framework
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'router');
const { accessCtl } = require('./ac');
const tools = require('../utils/tools');
const { app: appConf, security: secConf } = require('../include/config');

/**
 * Middleware to Support CORS
 */
const _ALLOW_HEADERS_BASE = [
    'Content-Type', 'Content-Length', 'Authorization', 'Accept', 'X-Requested-With', 'ActiveGroup', 'ActiveTenant', 'AuthToken'
];
const _allowHeaders = secConf.allowHeaders ? _ALLOW_HEADERS_BASE.concat(secConf.allowHeaders) : _ALLOW_HEADERS_BASE;
function _setCORS(router) {
    router.all('*', (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', secConf.allowOrigin || '*'); // Replace * with actual front-end server ip or domain in production env.
        res.setHeader('Access-Control-Allow-Headers', _allowHeaders.join(', '));
        res.setHeader('Access-Control-Allow-Methods', secConf.allowMethods || 'POST, GET, OPTIONS');
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        next();
    });
}

function _addBaseRoutes(router) {
    /* GET home page. */
    router.get('/', (req, res, next) => {
        //TODO: Replace title with your own project name
        res.render('index', { title: appConf.alias || 'the rappid-dev-framework!' });
    });
    /* GET apis page on non-production env. */
    if (process.env.NODE_ENV !== 'production') {
        router.get('/api', (req, res) => {
            return res.render('api', { routes: gRoutes });
        });
    }
}

const _READDIR_OPTIONS = {
    withFileTypes: true
};
const _EXCLUDE_FILES = [
    '.DS_Store',
    'index.js'
];
function isExclude(filename) {
    return _EXCLUDE_FILES.indexOf(filename) !== -1;
}

const _reDelKey = new RegExp(/^--/);
const _reNotRequired = new RegExp(/^-/);
function _modifyValidators(r, modSpec) {
    if (modSpec !== undefined) {
        modSpec.forEach(key => {
            if (_reDelKey.test(key)) {
                let realKey = key.replace('--', '');
                delete r.validator[realKey]
            } else if (_reNotRequired.test(key)) {
                let realKey = key.replace('-', '');
                delete r.validator[realKey].required;
            } else if (r.validator[key] !== undefined) {
                r.validator[key].required = true;
            }
        });
    }
}

function _readRouteFileSync(specs, routePath, filename) {
    let filePath = path.join(_rootDir, routePath, filename);
    try {
        let routes = require(filePath);
        routes.forEach(route => {
            if (route.handler.fn !== undefined) {
                let subPath = filename.split('.')[0].replace('-', '/');
                let r = {
                    path: path.join('/', routePath, subPath, route.path),
                    authType: route.authType || 'jwt',
                    method: route.method.toUpperCase(),
                    validator: route.handler.val || {},
                    multerFunc: route.multerFunc,
                    handler: route.handler.fn,
                    isNew: route.isNew
                };
                if (route.oldPath) {
                    r.oldPath = path.join('/', routePath, subPath, route.oldPath);
                }
                if (route.modValidators !== undefined) {
                    _modifyValidators(r, route.modValidators);
                }
                if (route.multer !== undefined) {
                    r.multer = route.multer;
                }
                specs.push(r);
            } else {
                logger.error(`Handler function is missing! - ${filename} - ${route.path}`);
            }
        });
    } catch (ex) {
        logger.error(`Load routes from file: ${filePath} error! - ${ex.message} - ${ex.stack}`);
    }
}

function _readRouteDirSync(specs, routePath) {
    let routeDir = path.join(_rootDir, routePath);
    logger.debug(`Processing current directory: ${routeDir}`);

    let entries = fs.readdirSync(routeDir, _READDIR_OPTIONS);
    entries.forEach(dirent => {
        if (isExclude(dirent.name)) {
            return null;
        }
        if (dirent.isDirectory()) {
            _readRouteDirSync(specs, path.join(routePath, dirent.name));
        } else {
            _readRouteFileSync(specs, routePath, dirent.name);
        }
    });
}

function _setRoutes(router, routeSpecs) {
    try {
        routeSpecs.forEach(route => {
            let method = (route.method || 'USE').toLowerCase();
            let argv = [route.path];
            // Add multer middleware if exists
            if (method === 'post' && typeof route.multerFunc === 'function') {
                argv.push(route.multerFunc);
            }
            // Add accessCtl middleware
            argv.push(accessCtl.bind(null, route.authType, route.validator));
            // Add sequence middlewares or handler
            if (typeof route.handler === 'function') {
                argv.push(route.handler);
            } else {
                for (let i = 0; i < route.handler.length; i++) {
                    if (typeof route.handler[i] === 'function') {
                        argv.push(route.handler[i])
                    }
                }
            }
            // Perform setting route
            try {
                router[method].apply(router, argv);
                logger.info(`Route: ${route.method} - ${route.path} - ${route.authType} set.`);
            } catch (ex) {
                logger.error(`Set [${method}] ${route.path} error! - ${ex.message} - ${ex.stack}`);
            }
        });
    } catch (err) {
        logger.error(`Read route directory error! - ${err.message} - ${err.stack}`);
    }
}

function _addAppRoutes (router) {
    let routeSpecs = [];
    _readRouteDirSync(routeSpecs, '');
    _setRoutes(router, routeSpecs);
}

function initRouter(router) {
    _setCORS(router);
    _addBaseRoutes(router);
    _addAppRoutes(router);
}

// Declaring module exports
module.exports = exports = {
    initRouter
};
