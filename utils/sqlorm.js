/**
 * Created by Eric on 2024/07/08
 */
const assert = require("node:assert");
const eRetCode = require("../include/retcodes");
//
const tools = require("./tools");
const { WinstonLogger } = require('../libs/base/winston.wrapper');
const logger = WinstonLogger('orm');

const _OPR_ALL = ['$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin', '$like'];
const _ALLOWED_OPERATORS = {
    '$gt': ['$lt', '$lte'],
    '$gte': ['$lt', '$lte'],
    '$lt': ['$gt', '$gte'],
    '$lte': ['$gt', '$gte']
}
function _getOperatorString(operator) {
    let str = null;
    switch(operator) {
        case '$gt':
            str = '>';
            break;
        case '$gte':
            str = '>='
            break;
        case '$lt':
            str = '<';
            break;
        case '$lte':
            str = '<=';
            break;
        case '$ne':
            str = '!=';
            break;
        case '$in':
            str = 'IN'
            break;
        case '$nin':
            str = 'NOT IN'
            break;
        case '$like':
            str = 'LIKE'
            break;
    }
    return str;
}

function _parseExprOperator(k, v) {
    let exprArr = [];
    let nextAllowed = _OPR_ALL;
    const operators = Object.keys(v);
    for (let i = 0; i < operators.length; i++) {
        let operator = operators[i];
        if (nextAllowed.includes(operator)) {
            let oprStr = _getOperatorString(operator);
            if (oprStr !== null) {
                let expr = typeof v[operator] === 'string'? `${k} ${oprStr} "${v[operator]}"` : `${k} ${oprStr} ${v[operator]}`;
                exprArr.push(expr);
                nextAllowed = _ALLOWED_OPERATORS[operator] || [];
            } else {
                throw new Error(`*** Un-supported operator: ${operator} !!!`);
            }
        } else {
            throw new Error(`*** Not proper operator: ${operator} for key: ${k}`);
        }
    }
    return exprArr.join(' AND ');
}

function _parseAND(filter) {
    const keys = Object.keys(filter);
    if (keys.length === 0) {
        return null;
    }
    const segments = [];
    for (let i = 0; i < keys.length; i++) {
        let k = keys[i];
        if (k === '$or') {
            let conditions = filter[k];
            if (!Array.isArray(conditions)) {
                throw new Error('$or value should be array!')
            }
            let expr = '(' + _parseOR(conditions) + ')';
            segments.push(expr)
            //
            continue;
        }
        // Handle AND
        let v = filter[k];
        if (tools.isTypeOfPrimitive(v)) { // The value is primitive type
            let expr = typeof v === 'string'? `${k} = "${v}"` : `${k} = ${v}`;
            segments.push(expr);
            continue;
        }
        // Handle query operators
        let expr = '(' + _parseExprOperator(k, v) + ')';
        segments.push(expr);
    }
    return segments.join(' AND ');
}

function _parseOR(arr) {
    const exprArr = [];
    arr.forEach(elem => {
        const expr = '(' + _parseAND(elem) + ')';
        exprArr.push(expr)
    })
    return exprArr.join(' OR ');
}

function _parseWhereExpr(filter) {
    if (!filter) {
        return null;
    }
    return _parseAND(filter);
}

function _parseOrderByExpr(sort) {
    if (!sort) {
        return null;
    }
    const keys = Object.keys(sort);
    if (keys.length === 0) {
        return null;
    }
    let segments = [];
    keys.forEach(k => {
        let v = sort[k];
        let expr = `${k}${v === -1? ' DESC' : ''}`;
        segments.push(expr);
    })
    return segments.join(', ')
}

/**
 */
function _packJoinExp (populate) {

}

/**
 * @typedef QueryOptions
 * @property { Object? } filter - The filter expressions
 * @property { string? } select - The select fields string, each separated by space, eg: 'name password'
 * @property { Object? } populate - The join expression
 * @property { Object? } sort - The sort expression
 * @property { number? } pageSize - The pageSize for paginating querying
 * @property { number? } page - The request page number
 */

/**
 *
 * @param { string } table - The table name
 * @param { QueryOptions? } orm - The request query options
 * @private { Object | DOMException }
 */
function parseQueryOptions(table, orm) {
    assert(typeof table === 'string');
    logger.debug(`+++ the query options: ${tools.inspect(orm)}`);
    //
    let select = orm.select? orm.select : '*';
    let stmt = `SELECT ${select} FROM ${table}`;
    let count = `SELECT count(*) as total FROM ${table}`;
    // Handle filter
    let where = _parseWhereExpr(orm.filter);
    if (where) {
        stmt += ` WHERE ${where}`;
        count += ` WHERE ${where}`;
    }
    // Handle sort
    let orderBy = _parseOrderByExpr(orm.sort);
    if (orderBy) {
        stmt += ` ORDER BY ${orderBy}`;
    }
    // Handle pagination
    if (orm.pageSize !== undefined) {
        if (orm.page === undefined) {
            // Set default page to 1
            orm.page = 1;
        }
        stmt += ` LIMIT ${orm.pageSize}`;
        if (orm.page > 1) {
            let offset = (orm.page - 1) * orm.pageSize;
            stmt += ` OFFSET ${offset}`
        }
    }
    return { count, stmt };
}


module.exports = exports = {
    parseQueryOptions
}