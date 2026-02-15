// Seed script: generates proper bcrypt hash for default admin account
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://tracker:tracker_pass@localhost:5432/file_tracking',
});

async function seedAdmin() {
    try {
        // Check if admin exists
        const existing = await pool.query('SELECT id FROM admin WHERE username = $1', ['admin']);
        if (existing.rows.length > 0) {
            console.log('✅ Admin account already exists');
            // Update the hash to ensure it matches 'admin123'
            const hash = await bcrypt.hash('admin123', 10);
            await pool.query('UPDATE admin SET password_hash = $1 WHERE username = $2', [hash, 'admin']);
            console.log('✅ Admin password hash refreshed');
        } else {
            const hash = await bcrypt.hash('admin123', 10);
            await pool.query(
                'INSERT INTO admin (username, password_hash, display_name) VALUES ($1, $2, $3)',
                ['admin', hash, 'Team Leader']
            );
            console.log('✅ Default admin account created (admin / admin123)');
        }
    } catch (err) {
        console.error('⚠️ Admin seed error:', err.message);
    } finally {
        await pool.end();
    }
}

seedAdmin();
