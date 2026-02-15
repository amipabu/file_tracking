const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/officers — list all
router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT o.*,
                (SELECT COUNT(*) FROM files f WHERE f.officer_id = o.id) AS file_count,
                (SELECT COUNT(*) FROM files f WHERE f.officer_id = o.id AND f.status = 'Active') AS active_count,
                (SELECT COUNT(*) FROM files f WHERE f.officer_id = o.id AND f.status = 'Completed') AS completed_count
             FROM officers o ORDER BY o.name`
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/officers — create
router.post('/', async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

    try {
        const result = await pool.query(
            'INSERT INTO officers (name, email) VALUES ($1, $2) RETURNING *',
            [name, email]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/officers/:id
router.delete('/:id', async (req, res) => {
    try {
        const filesCheck = await pool.query('SELECT COUNT(*) FROM files WHERE officer_id = $1', [req.params.id]);
        if (parseInt(filesCheck.rows[0].count) > 0) {
            return res.status(400).json({ error: 'Cannot delete officer with assigned files' });
        }
        await pool.query('DELETE FROM officers WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/officers/:id/transfer — transfer individual files to different officers
router.put('/:id/transfer', async (req, res) => {
    const fromId = parseInt(req.params.id);
    const { transfers } = req.body; // Array of { file_id, to_officer_id }

    if (!transfers || !Array.isArray(transfers) || transfers.length === 0) {
        return res.status(400).json({ error: 'At least one file transfer is required' });
    }

    try {
        // Verify source officer exists
        const fromOfficer = await pool.query('SELECT * FROM officers WHERE id = $1', [fromId]);
        if (fromOfficer.rows.length === 0) return res.status(404).json({ error: 'Source officer not found' });

        // Process each transfer
        const results = [];
        for (const t of transfers) {
            if (!t.file_id || !t.to_officer_id) continue;
            if (parseInt(t.to_officer_id) === fromId) continue; // skip same-officer

            const updated = await pool.query(
                `UPDATE files SET officer_id = $1 
                 WHERE id = $2 AND officer_id = $3 AND status = 'Active' 
                 RETURNING id, pr_number, title, process_name`,
                [t.to_officer_id, t.file_id, fromId]
            );
            if (updated.rows.length > 0) {
                results.push({ ...updated.rows[0], to_officer_id: parseInt(t.to_officer_id) });
            }
        }

        // Get distinct target officers for email notifications
        const targetIds = [...new Set(results.map(r => r.to_officer_id))];
        const targetOfficers = {};
        for (const tid of targetIds) {
            const oRes = await pool.query('SELECT * FROM officers WHERE id = $1', [tid]);
            if (oRes.rows.length > 0) targetOfficers[tid] = oRes.rows[0];
        }

        // Group transferred files by target officer
        const grouped = {};
        for (const r of results) {
            if (!grouped[r.to_officer_id]) grouped[r.to_officer_id] = [];
            grouped[r.to_officer_id].push(r);
        }

        res.json({
            success: true,
            transferred_count: results.length,
            from_officer: fromOfficer.rows[0],
            grouped_transfers: Object.entries(grouped).map(([toId, files]) => ({
                to_officer: targetOfficers[parseInt(toId)],
                files
            }))
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
