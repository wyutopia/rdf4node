/**
 * Created by Eric on 2022/02/26
 */
const fs = require('fs');
const path = require('path');
const appRoot = require('app-root-path');
// Framework
const tools = require('../utils/tools');
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'router');
const { accessCtl } = require('./ac');

/**
 * Middleware to Support CORS
 */
const _ALLOW_HEADERS_BASE = [
    'Content-Type', 'Content-Length', 'Authorization', 'Accept', 'X-Requested-With', 'ActiveGroup', 'ActiveTenant', 'AuthToken'
];
function _mergeAllowHeaders(allowHeaders) {
    return allowHeaders? _ALLOW_HEADERS_BASE.concat(allowHeaders) : _ALLOW_HEADERS_BASE;
}
/**
 * Setup CORS
 * @param {*} router 
 * @param { Object } options 
 * @param { string? } options.allowOrigin - 
 * @param { string[]? } options.allowHeaders - 
 * @param { string? } options.allowMethods - 
 */
function _setCORS(router, options) {
    router.all('*', (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', options.allowOrigin || '*'); // Replace * with actual front-end server ip or domain in production env.
        res.setHeader('Access-Control-Allow-Headers', _mergeAllowHeaders(options.allowHeaders).join(', '));
        res.setHeader('Access-Control-Allow-Methods', options.allowMethods || 'POST, GET, OPTIONS');
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        next();
    });
}

/**
 * Setup homepage
 * @param {*} router 
 * @param {*} options 
 */
function _addHomepage(router, options) {
    /* GET home page. */
    router.get('/', (req, res, next) => {
        //TODO: Replace title with your own project name
        res.render('index', { title: options.name || 'the rappid-dev-framework!' });
    });
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


const _scopeToParameterKey = {
    'tnt': 'tenant',
    'grp': 'group',
    'prj': 'project'
};
const _reDelKey = new RegExp(/^--/);
const _reNotRequired = new RegExp(/^-/);
function _calibrateValidator(validator, scope, modifications) {
    // Perform modifications if provided
    if (modifications !== undefined) {
        modifications.forEach(key => {
            if (_reDelKey.test(key)) {
                let realKey = key.replace('--', '');
                delete validator[realKey]
            } else if (_reNotRequired.test(key)) {
                let realKey = key.replace('-', '');
                delete validator[realKey].required;
            } else if (validator[key] !== undefined) {
                validator[key].required = true;
            }
        });
    }
    // Set MandatoryKey according to scope
    let mandatoryKey = _scopeToParameterKey[scope];
    if (mandatoryKey !== undefined) {
        validator[mandatoryKey] = {
            type: 'ObjectId',
            required: true
        }
    }
}

function _readRouteFileSync(specs, rootDir, routePath, filename) {
    let filePath = path.join(rootDir, routePath, filename);
    try {
        const routeObj = require(filePath);
        //
        const scope = routeObj.scope || 'usr';
        const routes = routeObj.routes || [];
        routes.forEach(route => {
            if (route.handler.fn !== undefined) {
                let subPath = filename.split('.')[0].replace('-', '/');
                let r = {
                    path: path.join('/', routePath, subPath, route.path),
                    authType: route.authType || 'jwt',
                    scope: scope,
                    method: route.method.toUpperCase(),
                    validator: route.handler.val || {},
                    multerFunc: route.multerFunc,
                    handler: route.handler.fn,
                    isNew: route.isNew,
                    commit: route.commit
                };
                if (route.oldPath) {
                    r.oldPath = path.join('/', routePath, subPath, route.oldPath);
                }
                _calibrateValidator(r.validator, scope, route.modValidators);
                specs.push(r);
            } else {
                logger.error(`Route handling function is missing! - ${filename} - ${route.path}`);
            }
        });
    } catch (ex) {
        logger.error(`Load routes from file: ${filePath} error! - ${ex.message} - ${ex.stack}`);
    }
}

function _readRouteDirSync(specs, rootDir, routePath) {
    let routeDir = path.join(rootDir, routePath);
    logger.debug(`>>> Read routes from dir: ${routeDir}`);

    let entries = fs.readdirSync(routeDir, _READDIR_OPTIONS);
    entries.forEach(dirent => {
        if (isExclude(dirent.name)) {
            return null;
        }
        if (dirent.isDirectory()) {
            _readRouteDirSync(specs, rootDir, path.join(routePath, dirent.name));
        } else {
            _readRouteFileSync(specs, rootDir, routePath, dirent.name);
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
            argv.push(accessCtl.bind(null, {
                authType: route.authType,
                validator: route.validator,
                scope: route.scope
            }));
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
                logger.info(`Route: ${route.method} - ${route.path} - ${route.authType} - ${route.scope} set.`);
            } catch (ex) {
                logger.error(`Set [${method}] ${route.path} error! - ${ex.message} - ${ex.stack}`);
            }
        });
    } catch (err) {
        logger.error(`Read route directory error! - ${err.message} - ${err.stack}`);
    }
}


function _addAppRoutes(router, routeDir) {
    let routeSpecs = [];
    _readRouteDirSync(routeSpecs, routeDir, '');
    _setRoutes(router, routeSpecs);
    //
    /* GET api document page on non-production env. */
    if (process.env.NODE_ENV !== 'production') {
        router.get('/api', (req, res) => {
            return res.render('api', { routes: routeSpecs });
        });
    }
}

function initRouter(router, options) {
    logger.info(`>>> Init router with options: ${tools.inspect(options)}`);
    _setCORS(router, options);
    _addHomepage(router, options);
    //
    _addAppRoutes(router, path.join(appRoot.path, options.routePath || 'routes'));
}

// Declaring module exports
module.exports = exports = {
    initRouter
};
