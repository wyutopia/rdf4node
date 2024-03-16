/**
 * Created by Eric on 2023/07/05
 */
const crypto = require('crypto');
const path = require('path');
//
const appRoot = require('app-root-path');
const moment = require('moment');
const multer = require('multer');
//
const sysdefs = require('../include/sysdefs');
const { CommonObject } = require('../include/base');
const tools = require('../utils/tools');
const {WinstonLogger} = require("../libs/base/winston.wrapper");
const logger = WinstonLogger(process.env.SRV_ROLE || 'uploads');
//
function _initSelf(options) {
    // Config hostPath
    this._hostPath = process.env.UPLOAD_DIR || path.join(appRoot.path, options.hostPath || 'public/uploads/');
    logger.info(`>>>>>> The default upload dir: ${this._hostPath}`);
    // Config 3rd-party oss engine
    this._engine = options.engine || sysdefs.eOSSEngine.Native;
    this._engineConf = options[this._engine];
    if (this._engineConf) {
        if (this._engine === sysdefs.eOSSEngine.AliOSS) {
            try {
                const AliOSS = require('ali-oss');
                this._alioss = new AliOSS(this._engineConf.config);
                if (this._engineConf.config.cname === true) {
                    this._baseUrl = this._baseUrlPattern = this._engineConf.config.endpoint;
                } else {
                    this._baseUrl = `https://${this._engineConf.config.bucket}.${this._engineConf.config.endpoint}`;
                    this._baseUrlPattern = `http://${this._engineConf.config.bucket}.${this._engineConf.config.endpoint}`
                }
            } catch (ex) {
                logger.error(`Initialize ali-oss error! - ${ex.message}`);
            }

        } else if (this._engine === sysdefs.eOSSEngine.MINIO) {
            // TODO: Add minio configures
            //this._minio = new Minio(this._engineConf.config);
        }
    } else {
        this._baseUrl = '';   // Using local
        this._baseUrlPattern = new RegExp('');
    }
}

const _ALLOW_CONTENT_TYPE = [
    "image/jpg", "image/jpeg", "image/png", "image/svg+xml", "image/svg",
    "text/csv", "text/csv-schema", "text/xml", "text/plain",
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
        // Define member variables
        this._uploads = {};
        this._state = sysdefs.eModuleState.INIT;
    }
    // Implementing methods
    init(config) {
        if (this._state !== sysdefs.eModuleState.INIT) {
            logger.error('Already initialized.');
            return 0;
        }
        logger.info(`>>> Init with with config: ${tools.inspect(config)}`);
        _initSelf.call(this, config);
        this._state = sysdefs.eModuleState.READY;
        return 1;
    }
    getUpload (absDir, options) {
        let destDir = absDir || this._hostPath;
        let key = tools.md5Sign(destDir);
        if (this._uploads[key] === undefined) {
            this._uploads[key] = multer({dest: destDir});
        }
        return this._uploads[key];
    }
    getSignature (options) {
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
    setObjectAcl(name, acl, callback) {
        return callback();
    }    
    getSignatureUrl(name, options) {
        return this._engine === sysdefs.eOSSEngine.AliOSS? this._alioss.signatureUrl(name, options) : name;
    }    
    getObjectUrl(name, options) {
        return path.join(this._baseUrlPattern, name);
    }    
    async deleteOneAsync(url, options) {
        const objName = url.replace(this._baseUrlPattern, '').split('?')[0];
        const result = await this._alioss.delete(objName);
        logger.debug(`Delete object: ${objName} result: ${tools.inspect(result)}`);
        return result;
    }    
    async deleteMultiAsync(urls, options) {
        const names = [];
        urls.forEach(url => {
            names.push(url.replace(this._baseUrlPattern, '').split('?')[0]);
        })
        const result = await this._alioss.deleteMulti(names);
        logger.debug(`Delete multiple objects: ${tools.inspect(names)} result: ${tools.inspect(result)}`);
        return result;
    }
    getOSSClient() {
        return this._alioss;
    }
};

// Define 
module.exports = exports = {
    UploadHelper
};