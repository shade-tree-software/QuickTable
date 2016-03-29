module.exports = function (redisClient, encryption) {
    return {
        createNew: function(username, password){
            redisClient.incr('next user id', function (err, newKey) {
                var userKey = 'users:' + newKey;
                redisClient.sadd('user keys', userKey);
                var rowData = {id: userKey, username: username, password: encryption.hashString(password)};
                redisClient.hmset(userKey, rowData);
            });
        },
        findByUsername: function (username, cb) {
            var found = false;
            redisClient.smembers('user keys', function (err, userKeys) {
                if (err) {
                    cb(err);
                } else {
                    userKeys.forEach(function (userKey) {
                        redisClient.hgetall(userKey, function (err, user) {
                            if (err) {
                                cb(err);
                            } else {
                                console.log("checking " + JSON.stringify(user));
                                if (found === false && user.username === username) {
                                    found = true;
                                    cb(null, user);
                                }
                            }
                        });
                    });
                }
            });
        },
        findById: function (id, cb) {
            redisClient.hgetall(id, function (err, user) {
                if (err) {
                    cb(err);
                } else {
                    cb(null, user);
                }
            });
        }
    }
};
