/**
 * Created by Eric on 2023/07/05
 */
const crypto = require('crypto');
const path = require('path');
//
const AliOSS = require('ali-oss');
const appRoot = require('app-root-path');
const moment = require('moment');
const multer = require('multer');
//
const sysdefs = require('../../include/sysdefs');
const { CommonObject } = require('../../include/base');
const { upload: uploadConf } = require('../../include/config');
const tools = require('../../utils/tools');
//
const _DEFAULT_DIR = process.env.UPLOAD_DIR || path.join(appRoot.path, 'public/uploads/');
console.log('>>>>>> The default upload dir: ', _DEFAULT_DIR);

//
function _initSelf(options) {
    // Config hostPath
    this._hostPath = options.hostPath || _DEFAULT_DIR;
    // Config 3rd-party oss engine
    this._engine = options.engine || sysdefs.eOSSEngine.Resident;
    if (this._engine === sysdefs.eOSSEngine.AliOSS) {
        let config = options[this._engine];
        this._alioss = new AliOSS(config);
        //
        this._akId = config.accessKeyId;
        this._akSecret = config.accessKeySecret;
        this._bucket = config.bucket;
        this._host = config.endpoint;
        //
        this._cname = config.cname;
        this._region = config.region;
    } else if (this._engine === sysdefs.eOSSEngine.MINIO) {
        // TODO: Add minio configures
    }
}

const _ALLOW_CONTENT_TYPE = [
    "image/jpg", "image/jpeg", "image/png", "image/svg+xml",
    "text/csv", "text/csv-schema", "text/xml",
    "audio/aac", "audio/mpeg", "audio/mp4",
    "video/H263", "video/H264", "video/H265", "video/mp4"
];
function _genSignature(options) {
    let tenMinLater = moment().add(10, 'm');
    // Generating policy
    const policy = {
        expiration: tenMinLater.toISOString(),
        conditions: [
            {bucket: this._bucket},
            ["content-length-range", 1, sysdefs.eSize._50M],
            ["eq", "$success_action_status", "200"],
            ["in", "$content-type", _ALLOW_CONTENT_TYPE]
        ]
    }
    const base64Policy = Buffer.from(JSON.stringify(policy), 'utf8').toString('base64');
    const signature = crypto.createHmac('sha1', this._akSecret).update(base64Policy).digest('base64');
    // Pack signature
    let vDir = path.join(options.catalog, options.subPath || '');
    return {
        accessid: this._akId,
        host: options.host || this._host || "http://oss.aliyuncs.com",
        expire: options.expiresAt || Math.floor(tenMinLater.valueOf() / 1000),
        dir: `${vDir}/`,
        policy: base64Policy,
        signature: signature,
    }
}

class UploadHelper extends CommonObject {
    constructor(props) {
        super(props);
        _initSelf.call(this, props.config);
        // Define member variables
        this._uploads = {};
        // Implementing methods
        this.getUpload = (absDir, options) => {
            let destDir = absDir || _DEFAULT_DIR;
            let key = tools.md5Sign(destDir);
            if (this._uploads[key] === undefined) {
                this._uploads[key] = multer({dest: destDir});
            }
            return this._uploads[key];
        };
        this.getSignature = (options) => {
            if (this._engine === sysdefs.eOSSEngine.AliOSS) {
                return _genSignature.call(this, options || {});
            }
            loggers.error(`${this.$name}: The OSSEngine shoud be alioss!`);
            return {};
        };
        this.getOSSClient = () => {
            return this._alioss;
        };
    };
};

// Define 
module.exports = exports = new UploadHelper({
    $name: '_UploadHelper_',
    //
    config: uploadConf || {}
});