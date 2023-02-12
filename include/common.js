/**
 * Created by Eric on 2023/01/30
 */
const EventEmitter = require('events');
const {objectInit, moduleInit} = require('./base');

exports.objectInit = objectInit;
exports.moduleInit = moduleInit;

class CommonObject {
    constructor(props) {
        objectInit.call(this, props);
        // Additional properties go here ...
    }
}
exports.CommonObject = CommonObject;

class CommonModule extends CommonObject {
    constructor(props) {
        super(props);
        moduleInit.call(this, props);
        // Additional properties go here ...
    }
}
exports.CommonModule = CommonModule;

class EventObject extends EventEmitter {
    constructor(props) {
        super(props);
        objectInit.call(this, props);
        // Additional properties go here ...
    }
}
exports.EventObject = EventObject;
