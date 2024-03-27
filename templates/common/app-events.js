/**
 * Created by Eric on 2023/02/16
 */
const { eDomainEvent } = require('@icedeer/rdf4node/include/events');

module.exports = exports = Object.assign({}, eDomainEvent, {
    // User 
    USER_CREATE             : 'user.create'
});