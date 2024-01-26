/**
 * The entry point for running patch scripts
 */
const sysdefs = require('./include/sysdefs');
const config = require('./include/config');
const { RepositoryFactory } = require('./framework/repository');
const { CacheFactory } = require('./framework/cache');
const { DataSourceFactory } = require('./framework/data-source');

class Patcher {
    constructor(config) {
        this.dsFactory = new DataSourceFactory(this, {$name: sysdefs.eFrameworkModules.DATASOURCE});
        this.repoFactory = new RepositoryFactory(this, {$name: sysdefs.eFrameworkModules.REPOSITORY});
        this.cacheFactory = new CacheFactory(this, {$name: sysdefs.eFrameworkModules.CACHE});
    }
    registerModule () {}
}

async function bootstrap() {
    const patcher = new Patcher();
    // Do init
    if (config.dataSources) {
        patcher.dsFactory.init(config.dataSources);
    }
    if (config.dataModels) {
        patcher.repoFactory.init(config.dataModels);
    }
    return patcher;
}

module.exports = exports = {
    bootstrap
}