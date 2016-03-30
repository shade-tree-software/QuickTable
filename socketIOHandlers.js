var broadcastAll = function (client, message, data, logData) {
    console.log("broadcasting '" + message + "' " + logData || data);
    client.broadcast.emit(message, data);
    client.emit(message, data);
};

module.exports = function (redisClient, encryption) {
    return function (client) {
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
};
