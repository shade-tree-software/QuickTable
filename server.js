var express = require('express');
var app = express();
var passport = require('passport');
var localStrategy = require('passport-local').Strategy;
var server = require('http').createServer(app);
var fs = require('fs');
var ssl_server = require('https').createServer({
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
}, app);
var io = require('socket.io')(server);
var ssl_io = require('socket.io')(ssl_server);
var socketIOHandlers = require('./socketIOHandlers');

io.on('connection', socketIOHandlers);
ssl_io.on('connection', socketIOHandlers);

passport.use(new localStrategy(
    function (username, password, done) {
        console.log('got username=' + username + ' password=' + password);
        if (username === 'test') {
            return done(null, {id: 1});
        } else {
            return done(null, false);
        }
    }
));

passport.serializeUser(function (user, cb) {
    console.log(JSON.stringify(user));
    cb(null, user.id);
});

passport.deserializeUser(function (id, cb) {
    console.log(id);
    cb(null, {id: 1});
});

app.use(require('body-parser').urlencoded({extended: true}));
app.use(require('express-session')({secret: 'keyboard cat', resave: false, saveUninitialized: false}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/login', function (req, res) {
    res.sendFile(__dirname + '/login.html');
});

app.post('/login',
    passport.authenticate('local', {failureRedirect: '/login'}),
    function (req, res) {
        res.redirect('/');
    });

app.get('/logout',
    function(req, res){
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

var port = process.env.PORT || 8080;
server.listen(port, function () {
    console.log('listening on port ' + port);
});

var ssl_port = process.env.SSL_PORT || 8081;
ssl_server.listen(ssl_port, function () {
    console.log('listening on ssl port ' + ssl_port);
});

