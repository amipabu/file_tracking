const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/processes — list all
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM processes ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/processes/:name/steps — steps for a process
router.get('/:name/steps', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM process_steps WHERE process_name = $1 ORDER BY step_order',
            [req.params.name]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
