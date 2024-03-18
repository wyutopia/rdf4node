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
 * @typedef { Object } AcrossPopulates
 * @prop { string } path
 * @prop { string } dsName
 */
/**
 * @typedef {Object} DataSourceOptions
 * @prop { string } dsName - The dataSource name
 * @prop { AcrossPopulates[] } populates - The populates across databases
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
 * @prop {Object} cacheOptions
 * @prop {boolean} cacheOptions.enabled - Enable or disable cache
 * @prop {CacheSpecOptions} cacheOptions.spec - The cache spec
 * @prop {CacheProperties} cacheOptions.props - The cache entity properties
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

/**
 * @typedef { Object } RequestWrapper
 * @prop { enum<string> } method - The request method
 * @prop { string } host - The host string
 * @prop { Object } headers - The headers wrapper
 * @prop { Object } query - The query parameters
 * @prop { Object | string | ? } body - The body
 */

/**
 * @typedef { Object } HeaderAuthWrapper
 * @prop { string } algorithm - The algorithm indicator string, should be 'x-hmac-sha256'
 * @prop { string } Access - The accessKey value
 * @prop { string } SignedHeaders - The signedHeaders value
 * @prop { string } Signature - The signature value
 */

/**
 * The ChainEventOptions
 * @typedef { Object } ChainOptions
 * @property { string } engine
 * @property { string } channel
 */

/**
 * The event headers
 * @typedef { Object } EventHeaders
 * @property { string } source - The source module
 * @property { string } dsName - The dataSource name
 * @property { Boolean } isObject - Whether the body is a Mongoose Document Object
 * @property { ChainOptions } chainOptions
 */

/**
 * The event object
 * @typedef { Object } EventWrapper
 * @property { string } code - The event code
 * @property { EventHeaders } headers - The header options
 * @property { Object } body - The event body
 */

/**
 * The publish options
 * @typedef { Object } PublishOptions
 * @property { string } engine
 * @property { string } pubKey
 * @property { string } channel
 * @property { string } dest
 */

/**
 * The ChainEvent
 * @typedef { Object } ChainEvent
 * @property { Object } pattern - The regexp object
 * @property { string } code - The event code
 * @property { string[] } ignores  - The ignored event list
 * @property { string } select - The selected value keys from original event body. eg: 'key1 key2' 
 */
module.exports = exports = {};