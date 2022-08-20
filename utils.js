const fs = require('fs');
const path = require('path');
const logsDir = path.resolve(__dirname, 'log/default');

const utils = {
    getFileContent(postfix) {
        const date = new Date();
        const day = ('0' + date.getDate()).slice(-2);
        const month = ('0' + (date.getMonth() + 1)).slice(-2);

        const name = `${date.getFullYear()}${month}${day}_${postfix}.log`;

        return fs.readFileSync(path.join(logsDir, name)).toString();
    },
};

module.exports.utils = utils;
