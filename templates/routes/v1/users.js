/**
 * Created by Eric on 2022/09/20
 */
const { pubdefs } = require('../../app');
const usrCtl = require('../../controllers/users');

module.exports = exports = {
    scope: pubdefs.eResourceScope.Public,
    routes: [
        {
            path: '/:id',
            method: 'GET',
            authType: 'none',
            handler: usrCtl.findById
        }
    ]
}