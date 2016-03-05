var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var redis = require('redis');
var redisClient = null;

var broadcastAll = function (client, message, data) {
    console.log("broadcasting '" + message + "' " + data);
    client.broadcast.emit(message, data);
    client.emit(message, data);
};

var handleClientConnections = function () {
    io.on('connection', function (client) {
        console.log('new client connected: ' + client.request.connection.remoteAddress);
        client.on('request all', function () {
            console.log("received 'request all' from client");
            redisClient.smembers('row keys', function (err, rowKeys) {
                console.log('found row keys [' + rowKeys + ']');
                rowKeys.forEach(function (rowKey) {
                    redisClient.hgetall(rowKey, function (err, rowData) {
                        var rowDataJSON = JSON.stringify({key: rowKey, data: rowData});
                        console.log("sending 'new table row' to client " + rowDataJSON);
                        client.emit('new table row', rowDataJSON);
                    });
                });
            });
        });
        client.on('new table row', function (rowJSON) {
            console.log("received 'new table row' " + rowJSON);
            var row = JSON.parse(rowJSON);
            redisClient.incr('next row id', function (err, newKey) {
                var rowKey = 'rows:' + newKey;
                console.log('inserting item ' + rowKey + ' ' + rowJSON);
                redisClient.sadd('row keys', rowKey);
                redisClient.hmset(rowKey, row);
                broadcastAll(client, "new table row", JSON.stringify({key: rowKey, data: row}));
            });
        });
        client.on('update table cell', function(dataJSON){
            console.log("received 'update table cell' " + dataJSON);
            var data = JSON.parse(dataJSON);
            redisClient.hset(data.key, data.col, data.val);
            broadcastAll(client, "update table cell", dataJSON);
        });
        client.on('remove grocery item', function (groceryKey) {
            console.log("received 'remove grocery item' for " + groceryKey);
            redisClient.del(groceryKey);
            redisClient.srem('grocery keys', groceryKey);
            broadcastAll(client, "remove grocery item", groceryKey);
        });
        client.on('toggle in cart', function (groceryKey) {
            console.log("received 'toggle in cart' for " + groceryKey);
            redisClient.hget(groceryKey, 'in_cart', function (err, val) {
                var newVal = (val === 'true' ? 'false' : 'true');
                console.log('updating ' + groceryKey + " 'in_cart' to '" + newVal + "'");
                redisClient.hset(groceryKey, 'in_cart', newVal);
                var data = JSON.stringify({key: groceryKey, update: {'in_cart': newVal}});
                broadcastAll(client, 'update grocery item', data);
            });
        });
    });
};

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

server.listen(process.env.PORT || 8080);

