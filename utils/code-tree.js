/**
 * Created by Eric on 2024/07/06
 */
const { WinstonLogger } = require('../libs/base/winston.wrapper')
const logger = WinstonLogger();


// The node class
class CodeNode {
    constructor(parent) {
        this._parent = parent;
        //
        this._children = {};
        this._data = null;
    }
    appendChild(key, node) {
        if (this._children[key] !== undefined) {
            logger.error(`*** Child exists with key: ${key} ***`)
        }
        this._children[key] = node;
    }
    getChild(key) {
        return this._children[key];
    }
    getChildrenKeys() {
        return Object.keys(this._children);
    }
    setData(data) {
        if (this._data !== null) {
            logger.warn(`*** Duplicate data ***`);
        }
        this._data = data;
    }
    getData() {
        return this._data;
    }
}

/**
 *
 * @param { CodeNode } node
 * @param { string[] } code
 * @returns {CodeNode}
 * @private
 */
function _walkTree(node, code) {
    if (code.length === 0) {
        return node;
    }
    let c = code.slice(0, 1);
    let child = node.getChild(c);
    if (!child) {
        return node;
    }
    code.shift();
    return _walkTree(child, code);
}

/**
 *
 * @param { CodeNode } parent
 * @param { string[] } snippet
 * @param { Object} data
 * @private
 */
function _deepCreateNodes(parent, snippet, data) {
    let holder = parent;
    for (let i = 0; i < snippet.length; i++) {
        let c = snippet[i];
        let node = new CodeNode(holder);
        holder.appendChild(c, node);
        holder = node;
    }
    holder.setData(data);
    return 1;
}

function _deepGetData(node) {
    let result = [];
    if (!node) {
        return result;
    }
    if (node._data) {
        result.push(node._data);
    }
    let keys = node.getChildrenKeys();
    if (keys.length === 0) {
        return result;
    }
    keys.forEach( k => {
        let child = node.getChild(k);
        if (child instanceof CodeNode) {
            result = result.concat(_deepGetData(child));
        }
    })
    return result;
}

/**
 *
 * @param { CodeNode } startNode
 * @param { string[] } codes
 * @private {CodeNode | undefined}
 */
function _deepGetMatched(startNode, codes) {
    let n = startNode;
    for (let i = 0; i < codes.length && n; i++) {
        n = n.getChild(codes[i])
    }
    return n;
}

function _getCode (indexKey, data) {
    let code = '';
    indexKey.split(' ').forEach(k => {
        code += data[k];
    })
    return code;
}

// The tree class
class CodeTree {
    constructor(props) {
        this._key = props.indexKey || 'code';
        this._root = null;
    }
    /**
     * Set up the tree
     * @param { Object[] }dataSet
     */
    setup(dataSet) {
        this._root = new CodeNode();
        //
        let count = 0;
        dataSet.forEach(data => {
            if (this.insertNode(Array.from(_getCode(this._key, data)), data)) {
                count++;
            }
        })
        return count;
    }
    /**
     *
     * @param { string[] } codes
     * @param { Object } data
     * @returns {number}
     */
    insertNode(codes, data) {
        let node = _walkTree(this._root, codes);
        return _deepCreateNodes(node, codes, data);
    }

    /**
     *
     * @param { string } code - full code or snippet
     * @param { Object? } options - find options
     */
    find(code, options) {
        let n = _deepGetMatched(this._root, Array.from(code));
        if (!n) {
            return [];
        }
        return _deepGetData(n);
    }
    getAll() {
        return _deepGetData(this._root);
    }
}

//
module.exports = exports = {
    CodeTree
}