var express = require('express');
var app = express();
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
const encryption = require('./encryption');

var broadcastAll = function (client, message, data, logData) {
    console.log("broadcasting '" + message + "' " + logData || data);
    client.broadcast.emit(message, data);
    client.emit(message, data);
};

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
                        var rowDataPlainText = encryption.decryptRow(rowDataCipherText);
                        var rowDataPlainTextJSON = JSON.stringify({key: rowKey, data: rowDataPlainText});
                        console.log("sending 'new table row' to client " + rowDataCipherTextJSON);
                        client.emit('new table row', rowDataPlainTextJSON);
                    });
                });
            });
        });
        client.on('new table row', function (rowPlainTextJSON) {
            var rowPlainText = JSON.parse(rowPlainTextJSON);
            var rowCipherText = encryption.encryptRow(rowPlainText);
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
            var valCipherText = encryption.encryptString(origDataPlainText.val);
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
                val: encryption.decryptString(valCipherText)
            };
            var newDataPlainTextJSON = JSON.stringify(newDataPlainText);
            broadcastAll(client, "update table cell", newDataPlainTextJSON, dataCipherTextJSON);
        });
    };
    io.on('connection', runMe);
    ssl_io.on('connection', runMe);
};

if (!process.env.ENCRYPTION_KEY){
    console.log("No encryption key!");
}
console.log("connecting to redis");
redisClient = redis.createClient(process.env.REDIS_URL);
redisClient.on("error", function (err) {
    console.log(err.toString());
});
handleClientConnections();

app.get('/', function (req, res) {
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

