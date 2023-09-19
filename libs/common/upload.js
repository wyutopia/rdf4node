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
const {WinstonLogger} = require("../base/winston.wrapper");
const logger = WinstonLogger(process.env.SRV_ROLE || 'uploads');
//
const _DEFAULT_DIR = process.env.UPLOAD_DIR || path.join(appRoot.path, 'public/uploads/');
logger.info(`>>>>>> The default upload dir: ${_DEFAULT_DIR}`);

//
function _initSelf(options) {
    // Config hostPath
    this._hostPath = options.hostPath || _DEFAULT_DIR;
    // Config 3rd-party oss engine
    this._engine = options.engine || sysdefs.eOSSEngine.Native;
    this._engineConf = options[this._engine];
    if (this._engineConf) {
        if (this._engine === sysdefs.eOSSEngine.AliOSS) {
            this._alioss = new AliOSS(this._engineConf.config);
            this._baseUrl = this._engineConf.config.cname === true?  
                this._engineConf.config.endpoint : `https://${this._engineConf.config.bucket}.${this._engineConf.config.endpoint}`;
        } else if (this._engine === sysdefs.eOSSEngine.MINIO) {
            // TODO: Add minio configures
            //this._minio = new Minio(this._engineConf.config);
        }
    } else {
        this._baseUrl = '';   // Using local 
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
            {bucket: this._engineConf.config.bucket},
            ["content-length-range", 1, sysdefs.eSize._50M],
            ["eq", "$success_action_status", "200"],
            ["in", "$content-type", _ALLOW_CONTENT_TYPE]
        ]
    }
    const base64Policy = Buffer.from(JSON.stringify(policy), 'utf8').toString('base64');
    const signature = crypto.createHmac('sha1', this._engineConf.config.accessKeySecret).update(base64Policy).digest('base64');
    // Pack signature
    let vDir = path.join(options.catalog, options.subPath || '');
    const result = {
        accessid: this._engineConf.config.accessKeyId,
        host: this._baseUrl,
        expire: options.expiresAt || Math.floor(tenMinLater.valueOf() / 1000),
        dir: `${vDir}/`,
        policy: base64Policy,
        signature: signature,
    };
    const callbackPart = tools.safeGetJsonValue(this._engineConf, 'params.callback');
    if (callbackPart) {
        result.callback = Buffer.from(JSON.stringify(callbackPart)).toString('base64');
    }
    return result;
}

class UploadHelper extends CommonObject {
    constructor(props) {
        super(props);
        _initSelf.call(this, props.config);
        logger.info(`>>>>>> UploadHelper created with configuration: ${tools.inspect(props.config)}`);
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
            logger.error(`${this.$name}: The OSSEngine shoud be alioss!`);
            return {};
        };
        /**
         * 
         * @param {string} name 
         * @param {string} acl (private/public-read/public-read-write)
         * @param {*} callback 
         * @returns 
         */
        this.setObjectAcl = (name, acl, callback) => {
            return callback();
        };
        this.getSignatureUrl = (name, options) => {
            return this._engine === sysdefs.eOSSEngine.AliOSS? this._alioss.signatureUrl(name, options) : name;
        };
        this.getObjectUrl = (name, options) => {
            
        };
        this.deleteOneAsync = async (url, options) => {
            let objName = url.split('?')[0].replace(this._baseUrl, '');
            logger.debug(`Try to delete object with name: ${objName}`);
            return this._alioss.delete(objName);
        };
        this.deleteMultiAsync = async (urls, options) => {
            const names = [];
            urls.forEach(url => {
                names.push(url.split('?')[0].replace(this._baseUrl, ''));
            })
            logger.debug(`Trying to delete multiple objects with names: ${tools.inspect(names)}`);
            return this._alioss.deleteMuti(names);
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