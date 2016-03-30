const crypto = require('crypto');

if (!process.env.ENCRYPTION_KEY){
    console.log("No encryption key!");
}

var hashString = function(string){
    const hash = crypto.createHash('sha256');
    hash.update(string);
    return hash.digest('hex');
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

exports.hashString = hashString;
exports.encryptString = encryptString;
exports.decryptString = decryptString;
exports.encryptRow = encryptRow;
exports.decryptRow = decryptRow;
