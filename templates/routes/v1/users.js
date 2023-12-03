/**
 * Created by Eric on 2022/09/20
 */
const pubdefs = require('../../common/pubdefs');
const usrCtl = require('../../controllers/users');

module.exports = exports = [
    {
        path: '/:id',
        method: 'GET',
        authType: pubdefs.eRequestAuthType.JWT,
        handler: usrCtl.findOne
    }
];