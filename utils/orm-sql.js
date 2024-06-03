/**
 * Created by Eric on 2024/05/20
 */

const _OPR_ALL = ['$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin'];
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
    }
    return str;
}

function _packWhereExpr(filter) {
    if (!filter) {
        return null;
    }
    const keys = Object.keys(filter);
    if (keys.length === 0) {
        return null;
    }
    let errMsg = null;
    let segments = [];
    //
    for (let i = 0; i < keys.length; i++) {
        let k = keys[i];
        if (k === '$or') {
            //TODO: handle OR
            continue;
        }
        // Handle AND
        let v = filter[k];
        if (tools.isTypeOfPrimitive(v)) { // The value is primitive type
            let expr = typeof v === 'string'? `${k} = '${v}'` : `${k} = ${v}`;
            segments.push(expr);
            continue;
        }
        // Handle query operators
        let exprArr = [];
        let nextAllowed = _OPR_ALL;
        const operators = Object.keys(v);
        for (let i = 0; i < operators.length; i++) {
            let operator = operators[i];
            if (nextAllowed.includes(operator)) {
                let oprStr = _getOperatorString(operator);
                if (oprStr !== null) {
                    let expr = typeof v === 'string'? `${k} ${oprStr} '${v[operator]}'` : `${k} ${oprStr} ${v[operator]}`;
                    exprArr.push(expr);
                    nextAllowed = _ALLOWED_OPERATORS[operator] || [];
                } else {
                    console.error(`*** Un-supported operator: ${operator} !!!`);
                }
            } else {
                errMsg = `Bad filter  expression! - ${operator}`;
                break;
            }
        }
        if (errMsg) {
            break;
        }
        segments.push(exprArr.join(' AND '));
    }
    if (errMsg) {
        console.error(errMsg);
        throw new Error(errMsg);
    }
    return segments.join(' AND ');
}

function _packOrderByExpr(sort) {
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
 *
 * @param { string } table - The table name
 * @param { Object } options - The query options
 * @param { string? } options.select
 * @param { Object? } options.filter
 * @param { Object? } options.populate
 * @param { Object? } options.sort
 * @param { number? } options.pageSize
 * @param { number? } options.page
 * @returns {Promise<string>}
 * @private
 */
async function _packQueryString(table, options) {
    assert(typeof table === 'string');
    //
    try {
        let select = options.select? options.select : '*';
        let query = `SELECT ${select} FROM ${table}`;
        // Handle filter
        let where = _packWhereExpr(options.filter);
        if (where) {
            query += ` WHERE ${where}`;
        }
        // Handle sort
        let orderBy = _packOrderByExpr(options.sort);
        if (orderBy) {
            query += ` ORDER BY ${orderBy}`;
        }
        // Handle pagination
        if (options.pageSize !== undefined) {
            let ps = parseInt(options.pageSize);
            let pn = parseInt(options.page || 1);
            query += ` LIMIT ${options.pageSize}`;
            if (pn > 1) {
                let offset = (pn - 1) * ps;
                query += ` OFFSET ${offset}`
            }
        }
        return query;
    } catch(err) {
        return err.message;
    }
}

