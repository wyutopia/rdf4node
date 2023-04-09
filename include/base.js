/**
 * Created by Eric on 2023/02/10
 */
const tools = require('../utils/tools');
const sysdefs = require('./sysdefs');

function _objectInit(props) {
    this.id = props.id || tools.uuidv4();
    this.$name = props.$Name || `Untitled-${this.id}`;
    this.type = props.type || sysdefs.eModuleType.OBJ;
}
exports.objectInit = _objectInit;

function _moduleInit(props) {
    //
    this.mandatory = true;
    this.state = props.state || sysdefs.eModuleState.INIT;
    this.isActive = () => {
        return this.state === sysdefs.eModuleState.ACTIVE;
    }
}
exports.moduleInit = _moduleInit;

