/**
 * Created by Eric on 2024/02/17
 */
const crypto = require('crypto');

const _HEADER_ALGORITHM = 'x-hmac-sha256';
const _HEADER_AUTHORIZATION = 'Authorization';
const _HEADER_CONTENT_SHA256 = 'x-content-sha256';
const _HEADER_X_DATE = 'x-a9kb-date';

const _noEscape = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0 - 15
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 16 - 31
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, // 32 - 47
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, // 48 - 63
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 64 - 79
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, // 80 - 95
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 96 - 111
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0  // 112 - 127
];
const _hexTable = new Array(256);
for (let i = 0; i < 256; ++i) {
    _hexTable[i] = '%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase();
}

// Define crypto wrapper
const cryptoWrapper = {
    hmacsha256: function (keyByte, message) {
        return crypto.createHmac('SHA256', keyByte).update(message).digest().toString('hex');
    },
    hexEncodeSHA256Hash: function (body) {
        return crypto.createHash('SHA256').update(body).digest().toString('hex');
    }
}

function _urlEncode(str) {
    if (typeof str !== 'string') {
        if (typeof str === 'object')
            str = String(str);
        else
            str += '';
    }
    let out = '';
    let lastPos = 0;

    for (let i = 0; i < str.length; ++i) {
        let c = str.charCodeAt(i);
        // ASCII
        if (c < 0x80) {
            if (_noEscape[c] === 1)
                continue;
            if (lastPos < i)
                out += str.slice(lastPos, i);
            lastPos = i + 1;
            out += _hexTable[c];
            continue;
        }

        if (lastPos < i)
            out += str.slice(lastPos, i);

        // Multi-byte characters ...
        if (c < 0x800) {
            lastPos = i + 1;
            out += _hexTable[0xC0 | (c >> 6)] + _hexTable[0x80 | (c & 0x3F)];
            continue;
        }
        if (c < 0xD800 || c >= 0xE000) {
            lastPos = i + 1;
            out += _hexTable[0xE0 | (c >> 12)] + _hexTable[0x80 | ((c >> 6) & 0x3F)] + _hexTable[0x80 | (c & 0x3F)];
            continue;
        }
        // Surrogate pair
        ++i;

        if (i >= str.length)
            throw new errors.URIError('ERR_INVALID_URI');

        let c2 = str.charCodeAt(i) & 0x3FF;

        lastPos = i + 1;
        c = 0x10000 + (((c & 0x3FF) << 10) | c2);
        out += _hexTable[0xF0 | (c >> 18)] + _hexTable[0x80 | ((c >> 12) & 0x3F)] + _hexTable[0x80 | ((c >> 6) & 0x3F)] + _hexTable[0x80 | (c & 0x3F)];
    }
    if (lastPos === 0)
        return str;
    if (lastPos < str.length)
        return out + str.slice(lastPos);
    return out;
}

function _findHeader(r, header) {
    return r.headers[header.toLowerCase()] || null;
}

function _canonicalURI(r) {
    let pattens = r.uri.split('/');
    let uri = [];
    for (let k in pattens) {
        let v = pattens[k];
        uri.push(_urlEncode(v))
    }
    let urlpath = uri.join('/');
    if (urlpath[urlpath.length - 1] !== '/') {
        urlpath = urlpath + '/'
    }
    return urlpath;
}

function _canonicalQueryString(r) {
    let keys = [];
    for (let key in r.query) {
        keys.push(key)
    }
    keys.sort();
    let a = [];
    for (let i in keys) {
        let key = _urlEncode(keys[i]);
        let value = r.query[keys[i]];
        if (Array.isArray(value)) {
            value.sort();
            for (let iv in value) {
                a.push(key + '=' + _urlEncode(value[iv]))
            }
        } else {
            a.push(key + '=' + _urlEncode(value))
        }
    }
    return a.join('&');
}

function _canonicalHeaders(r, signedHeaders) {
    let headers = {};
    for (let key in r.headers) {
        headers[key.toLowerCase()] = r.headers[key];
    }
    let a = [];
    for (let i in signedHeaders) {
        let value = headers[signedHeaders[i]];
        a.push(signedHeaders[i] + ':' + value.trim())
    }
    return a.join('\n') + "\n";
}

function _signedHeaders(r) {
    let a = [];
    for (let key in r.headers) {
        a.push(key.toLowerCase())
    }
    a.sort();
    return a;
}

function _requestPayload(r) {
    return r.body
}
/**
 * Build a CanocialRequest from a regular request string
 * @param {*} r 
 * @param {*} signedHeaders 
 * @returns 
 */
function _canonicalRequest(r, signedHeaders) {
    let hexencode = _findHeader(r, _HEADER_CONTENT_SHA256);
    if (hexencode === null) {
        let data = _requestPayload(r);
        hexencode = cryptoWrapper.hexEncodeSHA256Hash(data);
    }
    return r.method + "\n" + _canonicalURI(r) + "\n" + _canonicalQueryString(r) + "\n" + _canonicalHeaders(r, signedHeaders) + "\n" + signedHeaders.join(';') + "\n" + hexencode
}

// Create a "String to Sign".
function _stringToSign(canonicalRequest, t) {
    var bytes = cryptoWrapper.hexEncodeSHA256Hash(canonicalRequest);
    return Algorithm + "\n" + t + "\n" + bytes
}

// Create the HWS Signature.
function _signStringToSign(stringToSign, signingKey) {
    return cryptoWrapper.hmacsha256(signingKey, stringToSign)
}

// 
// 
/**
 * Get the finalized value for the "Authorization" header.
 * The signature parameter is the output from SignStringToSign
 * @param { string } accessKey - The AK value 
 * @param { string[] } signedHeaders 
 * @param { string } signature 
 * @returns 
 */
function _authHeaderValue(accessKey, signedHeaders, signature) {
    return _HEADER_ALGORITHM + " Access=" + accessKey + ", SignedHeaders=" + signedHeaders.join(';') + ", Signature=" + signature;
}

function _twoChar(s) {
    if (s >= 10) {
        return "" + s
    } else {
        return "0" + s
    }
}

function _getTime() {
    let date = new Date();
    return "" + date.getUTCFullYear() + _twoChar(date.getUTCMonth() + 1) + _twoChar(date.getUTCDate()) + "T" +
        _twoChar(date.getUTCHours()) + _twoChar(date.getUTCMinutes()) + _twoChar(date.getUTCSeconds()) + "Z"
}

// The class 
class Signer {
    constructor(props) {
        this._accessKey = props.ak;
        this._secretKey = props.sk;
    }
    sign(r) {
        let headerTime = _findHeader(r, _HEADER_X_DATE);
        if (headerTime === null) {
            headerTime = _getTime();
            r.headers[_HEADER_X_DATE] = headerTime
        }
        if (r.method !== "PUT" && r.method !== "PATCH" && r.method !== "POST") {
            r.body = ""
        }
        let queryString = _canonicalQueryString(r);
        if (queryString !== "") {
            queryString = "?" + queryString
        }
        let options = {
            hostname: r.host,
            path: _encodeURI(r.uri) + queryString,
            method: r.method,
            headers: r.headers
        };
        if (_findHeader(r, 'host') === null) {
            r.headers.host = r.host;
        }
        let signedHeaders = _signedHeaders(r);
        let canonicalRequest = _canonicalRequest(r, signedHeaders);
        let stringToSign = _stringToSign(canonicalRequest, headerTime);
        let signature = _signStringToSign(stringToSign, this._secretKey);
        //
        options.headers[_HEADER_AUTHORIZATION] = _authHeaderValue(this._accessKey, signedHeaders, signature);
        return options
    }
    validate(r) {

    }
}

module.exports = exports = {
    Signer,
    findHeader: _findHeader,
    signedHeaders: _signedHeaders,
    canocialRequest: _canonicalRequest,
    stringToSign: _stringToSign
}