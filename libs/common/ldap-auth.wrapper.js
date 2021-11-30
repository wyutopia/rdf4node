/**
 * Create by eric on 2021/11/15
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
