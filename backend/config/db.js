const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' }); // if .env at project root

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

module.exports = pool;