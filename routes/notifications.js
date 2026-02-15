const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/notifications — list (optionally filter by officer)
router.get('/', async (req, res) => {
    try {
        let query = `
      SELECT n.*, o.name AS officer_name, f.pr_number, f.title AS file_title,
             ps.step_name
      FROM notifications n
      JOIN officers o ON o.id = n.officer_id
      JOIN files f ON f.id = n.file_id
      JOIN process_steps ps ON ps.id = n.step_id
    `;
        const params = [];

        if (req.query.officer_id) {
            params.push(req.query.officer_id);
            query += ` WHERE n.officer_id = $${params.length}`;
        }

        if (req.query.unread === 'true') {
            query += params.length ? ' AND' : ' WHERE';
            query += ' n.is_read = false';
        }

        query += ' ORDER BY n.created_at DESC LIMIT 100';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/notifications/count — unread count
router.get('/count', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM notifications WHERE is_read = false');
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = true WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/notifications/read-all
router.put('/read-all', async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = true WHERE is_read = false');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
