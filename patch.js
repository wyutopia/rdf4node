/**
 * The entry point for running patch scripts
 */
const sysdefs = require('./include/sysdefs');
const config = require('./include/config');
const tools = require('./utils/tools');
const { RepositoryFactory } = require('./framework/repository');
const { CacheFactory } = require('./framework/cache');
const { DataSourceFactory } = require('./framework/data-source');
const { DistributedEntityLocker } = require('./framework/distributed-locker');

class Patcher {
    constructor(config) {
        this.redisManager = null;
        //
        this.dsFactory = new DataSourceFactory(this, {$name: sysdefs.eFrameworkModules.DATASOURCE});
        this.repoFactory = new RepositoryFactory(this, {$name: sysdefs.eFrameworkModules.REPOSITORY});
        this.cacheFactory = new CacheFactory(this, {$name: sysdefs.eFrameworkModules.CACHE});
        this.distLocker = new DistributedEntityLocker(this, { $name: sysdefs.eFrameworkModules.DLOCKER });
    }
    registerModule () {}
    async init() {
        if (config.redis) {
            try {
                const { RedisManager } = require('./libs/common/redis.wrapper');
                this.redisManager = new RedisManager(this, {
                    $name: sysdefs.eFrameworkModules.REDIS_CM,
                    $type: sysdefs.eModuleType.CM
                });
                const r = await this.redisManager.init(config.redis);
                console.info(`>>> Init redisManager ${r}.`);
            } catch (ex) {
                console.error(`*** Create and init redisManager error: ${ex.message}`);
            }
        }
        if (config.distLocker) {
            await this.distLocker.init(config.distLocker)
        }        
        if (config.dataSources) {
            await this.dsFactory.init(config.dataSources);
        }
        if (config.dataModels) {
            await this.repoFactory.init(config.dataModels);
        }
    }
}

async function bootstrap() {
    const patcher = new Patcher();
    await patcher.init();
    return patcher;
}

module.exports = exports = {
    bootstrap
}