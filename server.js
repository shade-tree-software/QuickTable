var app = require('express')();
var passport = require('passport');
var localStrategy = require('passport-local').Strategy;
var fs = require('fs');
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var redisClient = require('redis').createClient(process.env.REDIS_URL);
var encryption = require('./encryption');
var users = require('./db/users')(redisClient, encryption);
var socketIOHandlers = require('./socketIOHandlers')(redisClient, encryption);
var session = require('express-session');
var redisStore = require('connect-redis')(session);

// Connect to Redis and configure Socket-IO handlers
redisClient.on("error", function (err) {
    console.log(err.toString());
});
io.on('connection', socketIOHandlers);

// User account management
passport.use(new localStrategy(
    function (username, password, done) {
        users.findByUsername(username, function (err, user) {
            if (err) {
                return done(err);
            }
            if (!user) {
                return done(null, false);
            }
            if (user.password !== encryption.hashString(password)) {
                console.log('invalid password');
                return done(null, false);
            }
            console.log('password match');
            return done(null, user);
        });
    }
));
passport.serializeUser(function (user, cb) {
    cb(null, user.id);
});
passport.deserializeUser(function (id, cb) {
    users.findById(id, function (err, user) {
        if (err) {
            return cb(err);
        }
        cb(null, user);
    });
});

// Middleware
app.use(function (req, res, next) {
    if (req.headers['x-forwarded-proto'] != 'https') {
        //next();
        res.sendStatus(400);
    } else {
        next();
    }
});
app.use(require('body-parser').urlencoded({extended: true}));
app.use(session({
    secret: process.env.ENCRYPTION_KEY,
    resave: false,
    saveUninitialized: false,
    store: new redisStore({client: redisClient})
}));
app.use(passport.initialize());
app.use(passport.session());

app.get('/user/new', function (req, res) {
    res.sendFile(__dirname + '/new_user.html');
});

// Routes
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
        console.log('redirecting to /');
        res.redirect('/');
    });

app.get('/logout',
    function (req, res) {
        req.logout();
        console.log('user logged out');
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

// Start server
var port = process.env.PORT || 8080;
server.listen(port, function () {
    console.log('listening on port ' + port);
});

