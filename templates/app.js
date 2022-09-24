/**
 * Create by Eric on 2022/05/11
 */
let createError = require('http-errors');
let path = require('path');
let cookieParser = require('cookie-parser');
const {
    MorganWrapper, httpMonitor, rateLimiter,
    winstonWrapper: { WinstonLogger },
    expressWrapper: express } = require('@icedeer/rdf4node');
const httpLogger = MorganWrapper(process.env.SRV_ROLE);
const logger = WinstonLogger(process.env.SRV_ROLE);

let app = express();
logger.info(`Insight.BFF service start running in ${app.get('env')} env.`);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(httpLogger);
app.use(httpMonitor);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

if (process.env.NODE_ENV === 'production') {
    logger.info('Rate limitation enabled.');
    app.use(rateLimiter);
}

let indexRouter = require('./routes/index');
app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    //res.locals.error = req.app.get('env') === 'development' ? err : {};
    if (req.app.get('env') === 'development') {
        logger.error(`${err}`);
        res.locals.error = err;
    } else {
        res.locals.error = {};
    }

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
