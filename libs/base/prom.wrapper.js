/**
 * Created by Eric 2021/06/16
 */
const assert = require('assert');
const client = require('prom-client');
const theApp = require('../../bootstrap');
const pubdefs = require('../../include/sysdefs');

const register = client.register;

const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({
    register: register
});

const defaultLabels = {
    service: theApp.getRegistry(),
    instance: theApp.getInstance()
};
register.setDefaultLabels(defaultLabels);

function _regCounter(name, help, labelNames) {
    return new client.Counter({
        name: name,
        help: help,
        labelNames: labelNames
    });
}

function _regGauge(name, help, labelNames) {
    return new client.Gauge({
        name: name,
        help: help,
        labelNames: labelNames
    });
}

function _regGaugeAsync(name, help, labelNames, fnCollectAsync) {
    assert(typeof fnCollectAsync === 'function');
    new client.Gauge({
        name: name,
        help: help,
        labelNames: labelNames,
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
        let labelNames = metric.labelNames || [];
        if (metric.type === pubdefs.eMetricType.COUNTER) {
            collectors[metric.name] = _regCounter(name, help, labelNames);
        } else if (metric.type === pubdefs.eMetricType.GAUGE) {
            if (metric.fnCollectAsync) {
                _regGaugeAsync(name, help, labelNames, metric.fnCollectAsync);
            } else {
                collectors[metric.name] = _regGauge(name, help, labelNames);
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
