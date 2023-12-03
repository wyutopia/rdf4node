/**
 * Created by Eric on 2023/02/10
 */
const tools = require('../utils/tools');
const sysdefs = require('./sysdefs');

/**
 * Initializing the object
 * @param { Object } props - The basic object properties
 * @param { string } props.$id - The object's identifier
 * @param { string } props.$name - The object's name
 * @param { string } props.$type - The object's type, eg: obj, mod, daemon
 */
function _initObject(props) {
    this.$id = props.$id || tools.uuidv4();
    this.$name = props.$name || this.$id;
    this.$type = props.$type || sysdefs.eModuleType.OBJ;
}


/**
 * Initializing the module
 * @param { Object } props - The module properties with basic object properties
 * @param { string } props.$state
 * @param { boolean } props.$mandatory - Flag for system health check
 */
function _initModule(props) {
    //
    _initObject.call(this, props);
    //
    this.$state = props.status || sysdefs.eModuleState.INIT;
    this.$mandatory = true;
    this.isActive = () => {
        return this.$state === sysdefs.eModuleState.ACTIVE;
    };
    this.setState = (s) => {
        this.$state = s;
    }
}

class CommonObject {
    constructor(props) {
        _initObject.call(this, props);
        // Additional properties go here ...
    }
}

class CommonModule {
    constructor(props) {
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