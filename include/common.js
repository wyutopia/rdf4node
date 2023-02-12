/**
 * Created by Eric on 2023/01/30
 */
const {objectInit, moduleInit} = require('./base');

class CommonObject {
    constructor(props) {
        objectInit.call(this, props);
        // Additional properties go here ...
    }
}

class CommonModule extends CommonObject {
    constructor(props) {
        super(props);
        moduleInit.call(this, props);
        // Additional properties go here ...
    }
}

// Declaring module exports
module.exports = exports = {
    objectInit         : objectInit,
    moduleInit         : moduleInit,
    CommonObject       : CommonObject,
    CommonModule       : CommonModule
};