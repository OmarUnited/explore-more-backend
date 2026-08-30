const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 22040,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'defaultdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false // Required for Aiven SSL connection
  }
});

// Test connection on startup
(async () => {
  try {
    const connection = await pool.getConnection();
    console.log(' Successfully connected to Aiven MySQL!');
    connection.release();
  } catch (err) {
    console.error(' Database connection failed:', err.message);
  }
})();

module.exports = pool;