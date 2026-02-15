const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

const pool = require('./db/pool');
const requireAuth = require('./middleware/auth');
const authRouter = require('./routes/auth');
const officersRouter = require('./routes/officers');
const filesRouter = require('./routes/files');
const processesRouter = require('./routes/processes');
const notificationsRouter = require('./routes/notifications');
const { checkSLAs } = require('./services/slaChecker');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Public routes (no auth required)
app.use('/api/auth', authRouter);

// Health check (public)
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
    }
});

// Protected API routes (auth required)
app.use('/api/officers', requireAuth, officersRouter);
app.use('/api/files', requireAuth, filesRouter);
app.use('/api/processes', requireAuth, processesRouter);
app.use('/api/notifications', requireAuth, notificationsRouter);

// Manual SLA check trigger (protected)
app.post('/api/sla-check', requireAuth, async (req, res) => {
    try {
        await checkSLAs();
        res.json({ success: true, message: 'SLA check completed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SLA checker cron — every hour
cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running SLA check at', new Date().toISOString());
    try {
        await checkSLAs();
    } catch (err) {
        console.error('[CRON] SLA check error:', err.message);
    }
});

// Start server with retry logic for DB connection
async function start() {
    let retries = 10;
    while (retries > 0) {
        try {
            await pool.query('SELECT 1');
            console.log('✅ Database connected');
            break;
        } catch (err) {
            retries--;
            console.log(`⏳ Waiting for database... (${retries} retries left)`);
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    if (retries === 0) {
        console.error('❌ Could not connect to database');
        process.exit(1);
    }

    // Seed admin account with proper bcrypt hash
    try {
        const bcrypt = require('bcryptjs');
        const existing = await pool.query('SELECT id, password_hash FROM admin WHERE username = $1', ['admin']);
        if (existing.rows.length === 0) {
            const hash = await bcrypt.hash('admin123', 10);
            await pool.query(
                'INSERT INTO admin (username, password_hash, display_name) VALUES ($1, $2, $3)',
                ['admin', hash, 'Team Leader']
            );
            console.log('✅ Default admin created (admin / admin123)');
        } else {
            // Verify hash is valid bcrypt, re-hash if not
            const row = existing.rows[0];
            const isValid = row.password_hash && row.password_hash.startsWith('$2');
            if (!isValid) {
                const hash = await bcrypt.hash('admin123', 10);
                await pool.query('UPDATE admin SET password_hash = $1 WHERE id = $2', [hash, row.id]);
                console.log('✅ Admin password hash refreshed');
            } else {
                console.log('✅ Admin account ready');
            }
        }
    } catch (err) {
        console.error('⚠️ Admin seed warning:', err.message);
    }

    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

start();
