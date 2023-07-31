/**
 * Created by Eric on 2023/02/10
 */
const tools = require('../utils/tools');
const sysdefs = require('./sysdefs');

function _initObject(props) {
    this.id = props.id || tools.uuidv4();
    this.$name = props.$name || `rdf4node_${this.id}`;
    this.$type = props.$type || sysdefs.eModuleType.OBJ;
}
exports.objectInit = _objectInit;

function _initModule(props) {
    //
    this.mandatory = true;
    this.state = props.status || sysdefs.eModuleState.INIT;
    this.isActive = () => {
        return this.state === sysdefs.eModuleState.ACTIVE;
    }
}
exports.moduleInit = _moduleInit;

class CommonObject {
    constructor(props) {
        _initObject.call(this, props);
        // Additional properties go here ...
    }
}

class CommonModule extends CommonObject {
    constructor(props) {
        super(props);
        _initModule.call(this, props);
        // Additional properties go here ...
    }
}

// Declaring module exports
module.exports = exports = {
    initObject         : _initObject,
    initModule         : _initModule,
    CommonObject       : CommonObject,
    CommonModule       : CommonModule
};