const mysql = require('mysql');
const prodSettings = require('./db-credentials.js');

const devSettings = {
    host: 'localhost',
    database: 'thefreiburger',
    user: 'thefreiburger_ad',
    password: 'password'
}
/** The file db-credentials.js should export an object as below:
const prodSettings = {
    host: 'localhost',
    database: 'database_name',
    user: 'user',
    password: 'password'
}
*/

function setConfig() {
    switch( process.env.NODE_ENV ){
        case 'development':
            return devSettings;
            break;
        case 'production':
            return prodSettings;
            break;
        default:
            throw new Error('NODE_ENV is not set, configuration could not be loaded.');
    }
}

dbConfig = setConfig();

module.exports = mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database
});