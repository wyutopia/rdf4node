/**
 * Create by eric 2021/06/16
 */
const assert = require('assert');
const os = require('os');
const client = require('prom-client');
const pubdefs = require('../sysdefs');

const Registry = client.Registry;
const register = new Registry();
register.setDefaultLabels({ instance: os.hostname() });
const prefix = process.env.PROM_PREFIX || 'rdf4_';

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ prefix, register });

function _regCounter(name, help) {
    return new client.Counter({
        name: name,
        help: help,
        registers: [register]
    });
}

function _regGauge(name, help) {
    return new client.Gauge({
        name: name,
        help: help,
        registers: [register]
    });
}

function _regGaugeAsync(name, help, fnCollectAsync) {
    assert(typeof fnCollectAsync === 'function');
    new client.Gauge({
        name: name,
        help: help,
        registers: [register],
        async collect() {
            const d = await fnCollectAsync();
            this.set(d)
        }
    })
}

exports.regMetrics = (options) => {
    let collectors = {};
    let prefix = options.moduleName;
    options.metrics.forEach(metric => {
        let name = `${prefix}_${metric.name}`
        let help = metric.help || `${name}_help`;
        if (metric.type === pubdefs.eMetricType.COUNTER) {
            collectors[metric.name] = _regCounter(name, help);
        } else if (metric.type === pubdefs.eMetricType.GAUGE) {
            if (metric.fnCollectAsync) {
                _regGaugeAsync(name, help, metric.fnCollectAsync);
            } else {
                collectors[metric.name] = _regGauge(name, help);
            }
        }
    });
    return collectors;
};

//Exposed API for prometheus monitoring
exports.getMetrics = async (req, res) => {
    let metrics = await register.metrics();
    res.send(metrics);
};

exports.checkHealth = (req, res) => {
    res.sendStatus(200);
};
