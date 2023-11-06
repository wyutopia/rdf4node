/**
 * Created by Eric on 2023/11/05
 */

/**
 * @typedef {Object} XTaskProperties
 * @prop {string} alias - The task alias
 * @prop {number} interval - The task interval in milliseconds
 * @prop {string} startup - The startup policy: AUTO or MANUAL
 * @prop {boolean} immediateExec - Indicator whether executing the task immediatly after creation
 * @prop {number} startDelayMs - The startup delay in milliseconds 
 */

/**
 * @typedef {Object} CacheProperties
 * @prop {string} logLevel - The log level. enum: debug, info, error
 * @prop {string} engine - The cache engine type. enum: native, redis
 * @prop {string} server - The server config name
 * @prop {number} database - The database number
 * @prop {string} prefix - The key prefix
 * @prop {number} ttl - The TTL value in milliseconds
 * @prop {boolean} json - Whether the data value should be parsed as JSON
 */

/**
 * @typedef {Object} CacheSpecOptions
 * @prop {string} dataType - The cache dataType
 * @prop {string} loadPolicy - The cache loadPolicy
 * @prop {string} keyName - The primitive cache key
 * @prop {string} keyNameTemplate - The combined cache keys joined with ':', ex: 'user:project:group:tenant'
 * @prop {Object} populate - The populate option for query database
 * @prop {string} select - The select option for query database
 * @prop {string} valueKeys - The cache value keys joined with space. ex: '_id username role'
 */

/**
 * @typedef {Object} ModelSpecOptions
 * @prop {Object} schema - The model schema
 * @prop {string[]} refs - The referenced model name array
 * @prop {boolean} allowCache - Enable or disable cache
 * @prop {CacheSpecOptions} cacheSpec - The cache spec
 */

/**
 * @typedef {Object} RepositoryProperties
 * @prop {string} $name - The repository name with format: <model-name>@<data-source-name>
 * @prop {string} modelName - The model name
 * @prop {Object} modelSchema - The model schema
 * @prop {boolean} allowCache - The cache flag
 * @prop {CacheSpecOptions} cacheSpec - The cache spec
 */

/**
 * @typedef {Object} QueryOptions
 * @prop {Object} filter
 * @prop {string?} select - The selected keys joined with space. ex: 'username password'
 * @prop {Object?} sort - The sort options
 * @prop {number?} skip - Number of documents be skipped
 * @prop {number?} limit - Limitation of documents be fetched
 * @prop {(object[]|object)?} populate
 */

/**
 * @typedef {Object} PaginatingQueryOptions
 * @prop {Object} filter - The filter condition
 * @prop {string} pageSize - The page size
 * @prop {string} page - The page number
 * @prop {boolean} allowRealCount - Whether using the real count method. Default is false: estimated.
 */

/**
 * @typedef {Object} UpdateOptions
 * @prop {Object} filter - The filter conditions
 * @prop {Object} updates - The updates expression
 * @prop {Object} options - The update options
 * @prop {boolean} options.new - Whether return the new document or the old one
 * @prop {string} select
 * @prop {(Object[]|Object)} populate
 * @prop {boolean} allowEmpty - Whether treating empty result as error
 */

/**
 * @typedef {Object} CountOptions
 * @prop {Object} filter
 * @prop {boolean?} allowRealCount - Whether using the real count method. Default is false: estimated.
 */

/**
 * @typedef {Object} DeleteOptions
 * @prop {Object} filter - The filter condition
 * @prop {boolean?} multi - Choose the method between deleteOne and deleteMany. Default: false for deleteOne.
 */

module.exports = exports = {};