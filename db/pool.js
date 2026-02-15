const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://tracker:tracker_pass@localhost:5432/file_tracking',
});

module.exports = pool;
