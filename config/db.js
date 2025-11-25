// config/db.js
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:  'localhost',
  user:  'root',
  password: '',
  database:  'sk-tours',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  port: 4306
});

module.exports = pool;