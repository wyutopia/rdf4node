module.exports = exports = {
    app: {
        "name": "app",
        "alias": "app@dev",
        "tags": [
            "Kubernetes", "Linux", "Alpine", "node", "amd64"
        ],
        "defaultDataSource": "default",
        enableMonitor: true,
        security: {
            "ip": false,
            "encryptKey": "1234",
            "expiresIn": "72h",
            "enableAuthentication": true,
            "enableAuthorization": false
        },
        consul: {
            host: '127.0.0.1',
            port: 8500
        }
    },
    // Followings are framework components
    registry: {
        "type": "consul",
        "config": {
            "host": "127.0.0.1",
            "port": 8500
        }
    },
    eventBus: {
        "lo": true,
        "persistent": true,
        "disabledEvents": [],
        "triggerEvents": [],
        "engine": "native",
    },
    dataSources: {
        "default": {
            "type": "mongo",
            "config": {
                "ip": "127.0.0.1",
                "port": 27017,
                "user": "dbo",
                "pwd": "123456",
                "db": "demo",
                "authSource": "demo"
            },
            "enabled": true
        }
    },
    // Followings are module configurations
    modules: { },
    upload: {
        "engine": "native",
        "alioss": {},
        "minio": {}
    },
    endpoints: [{
        name: 'web',
        protocol: 'http',
        options: {
            //viewPath: 'views',
            //viewEngine: 'ejs',
            //routePath: 'routes',
            payloadLimit: '5mb',
            enableRateLimit: false,
            rateLimit: {
                "options": {
                    "windowMs": 60000,
                    "max": 60,
                    "expireTimeMs": 900000
                },
                "store": {
                    "type": "mongo",
                    "confPath": "dataSources.default.config"
                }
            }
        }
    }],
    dataModels: {
        //modelPath: 'models',
        excludeModelPaths: [],
        caches: {},
    },
    services: {
        //servicePath: 'services',
        enabledServices: []
    }
}