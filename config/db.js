// // config/db.js
// const mysql = require('mysql2/promise');
// require('dotenv').config();

// const pool = mysql.createPool({
//   host:  'localhost',
//   user:  'root',
//   password: '',
//   database:  'sk-tours',
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
//   // port: 4306
//   port: 3306
// });

// module.exports = pool;





const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'sk-tours',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  port: 3306
});

// Test connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Connected to MySQL database');
    
    // Create table if it doesn't exist
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS video_carousel (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        video_url VARCHAR(500) NOT NULL,
        gradient_classes VARCHAR(100) DEFAULT 'from-emerald-500/20 to-cyan-500/20',
        display_order INT DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_active_order (is_active, display_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    connection.query(createTableSQL, (err) => {
      if (err) {
        console.error('❌ Error creating table:', err.message);
      } else {
        console.log('✅ Video carousel table ready');
      }
      connection.release();
    });
  }
});

module.exports = pool;