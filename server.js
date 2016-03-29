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
var redis = require('redis');
var redisClient = null;
const crypto = require('crypto');

var broadcastAll = function (client, message, data, logData) {
    console.log("broadcasting '" + message + "' " + logData || data);
    client.broadcast.emit(message, data);
    client.emit(message, data);
};

var encryptString = function (plainText) {
    const cipher = crypto.createCipher('aes192', process.env.ENCRYPTION_KEY);
    var encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
};

var decryptString = function (cipherText) {
    const decipher = crypto.createDecipher('aes192', process.env.ENCRYPTION_KEY);
    var decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

var encryptRow = function (plainTextRow) {
    var cipherTextRow = {};
    Object.keys(plainTextRow).forEach(function (key) {
        cipherTextRow[key] = encryptString(plainTextRow[key]);
    });
    return cipherTextRow;
};

var decryptRow = function (cipherTextRow) {
    var plainTextRow = {};
    Object.keys(cipherTextRow).forEach(function (key) {
        plainTextRow[key] = decryptString(cipherTextRow[key]);
    });
    return plainTextRow;
};

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

var handleClientConnections = function () {
    var runMe = function (client) {
        console.log('new client connected: ' + client.request.connection.remoteAddress);
        client.on('request all', function () {
            console.log("received 'request all' from client");
            redisClient.smembers('row keys', function (err, rowKeys) {
                console.log('found row keys [' + rowKeys + ']');
                rowKeys.forEach(function (rowKey) {
                    redisClient.hgetall(rowKey, function (err, rowDataCipherText) {
                        var rowDataCipherTextJSON = JSON.stringify({key: rowKey, data: rowDataCipherText});
                        var rowDataPlainText = decryptRow(rowDataCipherText);
                        var rowDataPlainTextJSON = JSON.stringify({key: rowKey, data: rowDataPlainText});
                        console.log("sending 'new table row' to client " + rowDataCipherTextJSON);
                        client.emit('new table row', rowDataPlainTextJSON);
                    });
                });
            });
        });
        client.on('new table row', function (rowPlainTextJSON) {
            var rowPlainText = JSON.parse(rowPlainTextJSON);
            var rowCipherText = encryptRow(rowPlainText);
            var rowCipherTextJSON = JSON.stringify(rowCipherText);
            console.log("received 'new table row' " + rowCipherTextJSON);
            redisClient.incr('next row id', function (err, newKey) {
                var rowKey = 'rows:' + newKey;
                console.log('inserting item ' + rowKey + ' ' + rowCipherTextJSON);
                redisClient.sadd('row keys', rowKey);
                redisClient.hmset(rowKey, rowCipherText);
                broadcastAll(client, "new table row", JSON.stringify({key: rowKey, data: rowPlainText}),
                    JSON.stringify({key: rowKey, data: rowCipherText}));
            });
        });
        client.on('update table cell', function (origDataPlainTextJSON) {
            var origDataPlainText = JSON.parse(origDataPlainTextJSON);
            var valCipherText = encryptString(origDataPlainText.val);
            var dataCipherText = {
                key: origDataPlainText.key,
                col: origDataPlainText.col,
                val: valCipherText
            };
            var dataCipherTextJSON = JSON.stringify(dataCipherText);
            console.log("received 'update table cell' " + dataCipherTextJSON);
            redisClient.hset(origDataPlainText.key, origDataPlainText.col, valCipherText);
            var newDataPlainText = {
                key: origDataPlainText.key,
                col: origDataPlainText.col,
                val: decryptString(valCipherText)
            };
            var newDataPlainTextJSON = JSON.stringify(newDataPlainText);
            broadcastAll(client, "update table cell", newDataPlainTextJSON, dataCipherTextJSON);
        });
    };
    io.on('connection', runMe);
    ssl_io.on('connection', runMe);
};

if (!process.env.ENCRYPTION_KEY) {
    console.log("No encryption key!");
}
console.log("connecting to redis");
redisClient = redis.createClient(process.env.REDIS_URL);
redisClient.on("error", function (err) {
    console.log(err.toString());
});
handleClientConnections();


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

