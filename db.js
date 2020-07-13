"use strict";
exports.__esModule = true;
exports.db = exports.pgp = void 0;
require('dotenv').config();
var pgPromise = require('pg-promise');
var config = {
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
};
exports.pgp = pgPromise({ capSQL: true });
exports.db = exports.pgp(config);
