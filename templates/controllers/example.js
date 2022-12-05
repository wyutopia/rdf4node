/**
 * Created by Eric on 2022/09/20
 */
 const {
    winstonWrapper: {WinstonLogger},
    tools, dbHelper, eRetCodes
} = require('@icedeer/rdf4node');
const logger = WinstonLogger(process.env.SRV_ROLE || 'example');
const pubdefs = require('../common/pubdefs');

//TODO: import models here ...

exports.greetings = function (req, res) {
    logger.info(`Echo greetings...`);
    return res.sendSuccess('Hello world!');
};
