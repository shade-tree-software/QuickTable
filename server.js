var express = require('express');
var app = express();
var passport = require('passport');
var localStrategy = require('passport-local').Strategy;
var fs = require('fs');
var ssl_server = require('https').createServer({
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
}, app);
var ssl_io = require('socket.io')(ssl_server);
console.log("connecting to redis");
var redisClient = require('redis').createClient(process.env.REDIS_URL);
redisClient.on("error", function (err) {
    console.log(err.toString());
});
var encryption = require('./encryption');

var users = require('./db/users')(redisClient, encryption);
var socketIOHandlers = require('./socketIOHandlers')(redisClient, encryption);

ssl_io.on('connection', socketIOHandlers);

passport.use(new localStrategy(
    function (username, password, done) {
        users.findByUsername(username, function (err, user) {
            if (err) { return done(err); }
            if (!user) { return done(null, false); }
            if (user.password !== encryption.hashString(password)) { return done(null, false); }
            return done(null, user);
        });
    }
));

passport.serializeUser(function (user, cb) {
    cb(null, user.id);
});

passport.deserializeUser(function (id, cb) {
    users.findById(id, function (err, user) {
        if (err) { return cb(err); }
        cb(null, user);
    });
});

app.use(require('body-parser').urlencoded({extended: true}));
app.use(require('express-session')({
    secret: process.env.ENCRYPTION_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: {secure: true}
}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/user/new', function (req, res) {
    res.sendFile(__dirname + '/new_user.html');
});

app.post('/user/create',
    function (req, res) {
        if (req.body.key === process.env.ENCRYPTION_KEY) {
            users.createNew(req.body.username, req.body.password);
        } else {
            console.log('Incorrect key.  Cannot create new user.');
        }
        res.redirect('/');
    });

app.get('/login', function (req, res) {
    res.sendFile(__dirname + '/login.html');
});

app.post('/login',
    passport.authenticate('local', {failureRedirect: '/login'}),
    function (req, res) {
        res.redirect('/');
    });

app.get('/logout',
    function (req, res) {
        req.logout();
        res.redirect('/');
    });

app.get('/',
    require('connect-ensure-login').ensureLoggedIn(),
    function (req, res) {
        res.sendFile(__dirname + '/index.html');
    });

app.get('/js/:filename', function (req, res) {
    res.sendFile(__dirname + '/js/' + req.params.filename);
});

app.get('/js/vendor/:filename', function (req, res) {
    res.sendFile(__dirname + '/js/vendor/' + req.params.filename);
});

app.get('/css/:filename', function (req, res) {
    res.sendFile(__dirname + '/css/' + req.params.filename);
});

app.get('/css/vendor/:filename', function (req, res) {
    res.sendFile(__dirname + '/css/vendor/' + req.params.filename);
});

app.get('/css/vendor/themes/default/assets/fonts/:filename', function (req, res) {
    res.sendFile(__dirname + '/css/vendor/themes/default/assets/fonts/' + req.params.filename);
});

var ssl_port = process.env.SSL_PORT || 8081;
ssl_server.listen(ssl_port, function () {
    console.log('listening on ssl port ' + ssl_port);
});

