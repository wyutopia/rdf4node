/**
 * Created by Eric on 2022/09/20
 */
const pubdefs = require('../../common/pubdefs');
const exCtl = require('../../controllers/example');

module.exports = exports = [
    {
        path: '/hello',
        method: 'GET',
        authType: pubdefs.eRequestAuthType.JWT,
        handler: exCtl.greetings
    }
];