const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

const JWT_SECRET = process.env.JWT_SECRET || 'file-tracker-secret-key-change-in-production';
const TOKEN_EXPIRY = '24h';

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const result = await pool.query('SELECT * FROM admin WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const admin = result.rows[0];
        const valid = await bcrypt.compare(password, admin.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign(
            { id: admin.id, username: admin.username, displayName: admin.display_name },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );

        res.json({
            token,
            user: {
                id: admin.id,
                username: admin.username,
                displayName: admin.display_name,
                passwordChanged: admin.password_changed
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/auth/password — change password (requires auth)
router.put('/password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    try {
        // Get admin from token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const result = await pool.query('SELECT * FROM admin WHERE id = $1', [decoded.id]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Admin not found' });
        }

        const admin = result.rows[0];
        const valid = await bcrypt.compare(currentPassword, admin.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await pool.query(
            'UPDATE admin SET password_hash = $1, password_changed = TRUE, updated_at = NOW() WHERE id = $2',
            [newHash, decoded.id]
        );

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        res.status(500).json({ error: err.message });
    }
});

// GET /api/auth/me — get current user info
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        // Fetch fresh user data to include password_changed status
        const userRes = await pool.query('SELECT id, username, display_name, password_changed FROM admin WHERE id = $1', [decoded.id]);
        if (userRes.rows.length === 0) return res.status(401).json({ error: 'User not found' });
        const user = userRes.rows[0];

        res.json({
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            passwordChanged: user.password_changed
        });
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
module.exports.JWT_SECRET = JWT_SECRET;
