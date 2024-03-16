/**
 * Created by Eric on 2022/02/26
 */
const fs = require('fs');
const path = require('path');
const appRoot = require('app-root-path');
// Framework
const tools = require('../utils/tools');
const {WinstonLogger} = require('../libs/base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'router');
const {accessCtl} = require('./ac');

/**
 * Middleware to Support CORS
 */
const _ALLOW_HEADERS_BASE = [
    'Content-Type', 'Content-Length', 'Authorization', 'Accept', 'X-Requested-With', 'ActiveGroup', 'ActiveTenant', 'AuthToken'
];

function _mergeAllowHeaders(allowHeaders) {
    return allowHeaders ? _ALLOW_HEADERS_BASE.concat(allowHeaders) : _ALLOW_HEADERS_BASE;
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
        res.render('index', {title: theApp.getName() || 'the rappid-dev-framework!'});
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


function _recursiveReadRouteDir(rootPath, subPath, options) {
    let specs = [];
    let currentDir = path.join(rootPath, subPath);
    logger.info(`> Read routes from dir: ${currentDir}`);
    let entries = fs.readdirSync(currentDir, _READDIR_OPTIONS);
    entries.forEach(dirent => {
        if (isExclude(dirent.name)) {
            return null;
        }
        const entryPath = path.join(subPath, dirent.name);
        if (dirent.isDirectory()) {
            specs = specs.concat(_recursiveReadRouteDir(rootPath, entryPath, options));
            return null;
        }
        let filePath = path.join(currentDir, dirent.name);
        try {
            const routePack = require(filePath);
            //
            const scope = routePack.scope || 'usr';
            const authType = routePack.authType || 'jwt';
            //
            const routes = routePack.routes || [];
            routes.forEach(route => {
                if (route.handler.fn !== undefined) {
                    let pathElem = path.parse(entryPath);
                    let r = {
                        path: path.join('/', pathElem.dir, pathElem.name, route.path),
                        authType: route.authType || authType,
                        scope: scope,
                        method: route.method.toUpperCase(),
                        validator: route.handler.val || {},
                        multerFunc: route.multerFunc,
                        handler: route.handler.fn,
                        isNew: route.isNew,
                        commit: route.commit
                    };
                    if (route.oldPath) {
                        r.oldPath = path.join('/', pathElem.dir, pathElem.name, route.oldPath);
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
    });
    return specs;
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
    let routeSpecs = _recursiveReadRouteDir(routeDir, '', {});
    _setRoutes(router, routeSpecs);
    //
    /* GET api document page on non-production env. */
    if (process.env.NODE_ENV !== 'production') {
        router.get('/api', (req, res) => {
            return res.render('api', {routes: routeSpecs});
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
