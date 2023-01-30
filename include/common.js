/**
 * Created by Eric on 2023/01/30
 */
const tools = require('../utils/tools');
const pubdefs = require('./sysdefs');

function _objectInit(props) {
    this.id = props.id || tools.uuidv4();
    this.name = props.name || `Untitled-${this.id}`;
    this.type = props.type || pubdefs.eModuleType.OBJ;
}
exports.objectInit = _objectInit;

function _moduleInit(props) {
    //
    this.mandatory = true;
    this.state = props.state || pubdefs.eModuleState.INIT;
    this.isActive = () => {
        return this.state === pubdefs.eModuleState.ACTIVE;
    }
}
exports.moduleInit = _moduleInit;

class CommonObject {
    constructor(props) {
        _objectInit.call(this, props);
        // Additional properties go here ...
    }
}
exports.CommonObject = CommonObject;

class CommonModule extends CommonObject {
    constructor(props) {
        super(props);
        _moduleInit.call(this, props);
        // Additional properties go here ...
    }
}
exports.CommonModule = CommonModule;