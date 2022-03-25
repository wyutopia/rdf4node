/**
 * Created by Eric on 2021/11/15
 * Modified by eric on 2022/03/25
 */
const { authenticate } = require('ldap-authentication');
const config = require('../base/config');
const tools = require('../../utils/tools');
const { WinstonLogger } = require('../base/winston.wrapper');
const logger = WinstonLogger(process.env.SRV_ROLE || 'rdf');

exports.auth = async function (username, password) {
    let options = Object.assign({}, config.ldap);
    options.username = username;
    options.userPassword = password;
    //logger.info('LDAP options: ', tools.inspect(options));
    return await authenticate(options);
};

exports.authAsync = function (username, password, callback) {
    let options = Object.assign({}, config.ldap);
    options.username = username;
    options.userPassword = '***';
    logger.debug(`LDAP options: ${tools.inspect(options)}`);
    options.userPassword = password;
    authenticate(options).then(result => {
        return callback(null, result);
    }).catch(ex => {
        logger.error(`ldap-auth error! - ${tools.inspect(ex)}`);
        return callback(ex);
    });
};
