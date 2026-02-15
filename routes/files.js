const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/files — list all files with filters
router.get('/', async (req, res) => {
    try {
        let query = `
      SELECT f.*, o.name AS officer_name, o.email AS officer_email,
             ps.step_name AS current_step_name, ps.sla_days, ps.cum_days, ps.step_order,
             (SELECT COUNT(*) FROM process_steps WHERE process_name = f.process_name) AS total_steps
      FROM files f
      JOIN officers o ON o.id = f.officer_id
      LEFT JOIN process_steps ps ON ps.id = f.current_step_id
    `;
        const params = [];
        const conditions = [];

        if (req.query.officer_id) {
            params.push(req.query.officer_id);
            conditions.push(`f.officer_id = $${params.length}`);
        }
        if (req.query.status) {
            params.push(req.query.status);
            conditions.push(`f.status = $${params.length}`);
        }
        if (req.query.process_name) {
            params.push(req.query.process_name);
            conditions.push(`f.process_name = $${params.length}`);
        }

        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY f.created_at DESC';

        const result = await pool.query(query, params);

        // Add overdue flag
        const now = new Date();
        const files = result.rows.map(f => {
            let is_overdue = false;
            if (f.status === 'Active' && f.sla_days > 0 && f.step_started_at) {
                const deadline = new Date(f.step_started_at);
                deadline.setDate(deadline.getDate() + f.sla_days);
                is_overdue = now > deadline;
            }
            return { ...f, is_overdue };
        });

        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/files/stats/summary — dashboard stats
router.get('/stats/summary', async (req, res) => {
    try {
        const stats = await pool.query(`
      SELECT
        COUNT(*) AS total_files,
        COUNT(*) FILTER (WHERE status = 'Active') AS active_files,
        COUNT(*) FILTER (WHERE status = 'Completed') AS completed_files
      FROM files
    `);

        // Overdue count
        const overdueResult = await pool.query(`
      SELECT COUNT(*) FROM files f
      JOIN process_steps ps ON ps.id = f.current_step_id
      WHERE f.status = 'Active' AND ps.sla_days > 0
        AND f.step_started_at + (ps.sla_days || ' days')::interval < NOW()
    `);

        // Files per officer
        const byOfficer = await pool.query(`
      SELECT o.name, COUNT(f.id) AS file_count,
             COUNT(f.id) FILTER (WHERE f.status = 'Active') AS active_count
      FROM officers o
      LEFT JOIN files f ON f.officer_id = o.id
      GROUP BY o.id, o.name
      ORDER BY o.name
    `);

        // Process distribution
        const byProcess = await pool.query(`
      SELECT f.process_name, COUNT(*) AS file_count,
             COUNT(*) FILTER (WHERE f.status = 'Active') AS active_count
      FROM files f
      GROUP BY f.process_name
      ORDER BY file_count DESC
    `);

        // Upcoming SLA deadlines (active files with non-zero SLA, sorted by deadline)
        const upcoming = await pool.query(`
      SELECT f.id, f.pr_number, f.title, f.step_started_at, f.process_name,
             ps.step_name, ps.sla_days,
             o.name AS officer_name,
             f.step_started_at + (ps.sla_days || ' days')::interval AS deadline,
             EXTRACT(DAY FROM (f.step_started_at + (ps.sla_days || ' days')::interval) - NOW()) AS days_remaining
      FROM files f
      JOIN process_steps ps ON ps.id = f.current_step_id
      JOIN officers o ON o.id = f.officer_id
      WHERE f.status = 'Active' AND ps.sla_days > 0
      ORDER BY deadline ASC
      LIMIT 6
    `);

        res.json({
            ...stats.rows[0],
            overdue_files: parseInt(overdueResult.rows[0].count),
            by_officer: byOfficer.rows,
            by_process: byProcess.rows,
            upcoming_deadlines: upcoming.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/files/:id — file detail with step history
router.get('/:id', async (req, res) => {
    try {
        const fileResult = await pool.query(`
      SELECT f.*, o.name AS officer_name, o.email AS officer_email,
             ps.step_name AS current_step_name, ps.sla_days, ps.cum_days, ps.step_order
      FROM files f
      JOIN officers o ON o.id = f.officer_id
      LEFT JOIN process_steps ps ON ps.id = f.current_step_id
      WHERE f.id = $1
    `, [req.params.id]);

        if (fileResult.rows.length === 0) return res.status(404).json({ error: 'File not found' });

        const file = fileResult.rows[0];

        // Get all steps for this process
        const stepsResult = await pool.query(
            'SELECT * FROM process_steps WHERE process_name = $1 ORDER BY step_order',
            [file.process_name]
        );

        // Get step log
        const logResult = await pool.query(
            `SELECT fsl.*, ps.step_name, ps.sla_days, ps.step_order
       FROM file_step_log fsl
       JOIN process_steps ps ON ps.id = fsl.step_id
       WHERE fsl.file_id = $1
       ORDER BY ps.step_order`,
            [req.params.id]
        );


        // Add overdue flag
        const now = new Date();
        if (file.status === 'Active' && file.sla_days > 0 && file.step_started_at) {
            const deadline = new Date(file.step_started_at);
            deadline.setDate(deadline.getDate() + file.sla_days);
            file.is_overdue = now > deadline;
            file.deadline = deadline.toISOString();
        } else {
            file.is_overdue = false;
        }

        res.json({
            ...file,
            steps: stepsResult.rows,
            step_log: logResult.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/files — create new file (supports backdating for past files)
router.post('/', async (req, res) => {
    const { pr_number, title, process_name, officer_id, assigned_date, current_step_order } = req.body;
    if (!pr_number || !title || !process_name || !officer_id) {
        return res.status(400).json({ error: 'pr_number, title, process_name, and officer_id are required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get all steps for this process, ordered
        const stepsResult = await client.query(
            'SELECT * FROM process_steps WHERE process_name = $1 ORDER BY step_order',
            [process_name]
        );
        if (stepsResult.rows.length === 0) {
            throw new Error('Process not found or has no steps');
        }

        const allSteps = stepsResult.rows;
        const targetOrder = current_step_order ? parseInt(current_step_order) : 1;
        // Append T12:00:00 to date-only strings to prevent timezone offset
        // shifting the date back by one day (e.g. "2025-11-14" at UTC midnight
        // becomes Nov 13 in UTC-4 without this fix)
        const startDate = assigned_date
            ? new Date(assigned_date.includes('T') ? assigned_date : assigned_date + 'T12:00:00')
            : new Date();

        // Find the target step (the step the file is currently on)
        const targetStep = allSteps.find(s => s.step_order === targetOrder) || allSteps[0];

        // Create the file record
        const stepStartedAt = targetOrder <= 1 ? startDate : new Date(); // current step starts now if past steps exist
        const fileResult = await client.query(
            `INSERT INTO files (pr_number, title, process_name, officer_id, current_step_id, step_started_at, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [pr_number, title, process_name, officer_id, targetStep.id, stepStartedAt, startDate]
        );
        const file = fileResult.rows[0];

        // Auto-log completed steps (all steps before targetOrder)
        if (targetOrder > 1) {
            let runningDate = new Date(startDate);
            for (const step of allSteps) {
                if (step.step_order < targetOrder) {
                    const stepStart = new Date(runningDate);
                    // Advance by SLA days for the completed timestamp
                    runningDate = new Date(runningDate);
                    runningDate.setDate(runningDate.getDate() + (step.sla_days || 1));
                    const stepEnd = new Date(runningDate);

                    await client.query(
                        `INSERT INTO file_step_log (file_id, step_id, started_at, completed_at, sla_met)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [file.id, step.id, stepStart, stepEnd, true]
                    );
                } else if (step.step_order === targetOrder) {
                    // Log the current step as started (not completed)
                    await client.query(
                        'INSERT INTO file_step_log (file_id, step_id, started_at) VALUES ($1, $2, $3)',
                        [file.id, step.id, stepStartedAt]
                    );
                    break;
                }
            }
        } else {
            // Normal: log first step as started
            await client.query(
                'INSERT INTO file_step_log (file_id, step_id, started_at) VALUES ($1, $2, $3)',
                [file.id, allSteps[0].id, startDate]
            );
        }

        await client.query('COMMIT');

        // Return file with officer info
        const fullFile = await pool.query(`
      SELECT f.*, o.name AS officer_name, ps.step_name AS current_step_name
      FROM files f
      JOIN officers o ON o.id = f.officer_id
      LEFT JOIN process_steps ps ON ps.id = f.current_step_id
      WHERE f.id = $1
    `, [file.id]);

        res.status(201).json(fullFile.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') return res.status(409).json({ error: 'PR Number already exists' });
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// PUT /api/files/:id/steps/:logId/comment — add/update comment on a step
router.put('/:id/steps/:logId/comment', async (req, res) => {
    const { comment } = req.body;
    if (comment === undefined) return res.status(400).json({ error: 'comment is required' });
    try {
        const result = await pool.query(
            'UPDATE file_step_log SET comment = $1 WHERE id = $2 AND file_id = $3 RETURNING *',
            [comment, req.params.logId, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Step log not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/files/:id/advance — advance to next step
router.put('/:id/advance', async (req, res) => {
    const { comment } = req.body || {};
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Get current file
        const fileResult = await client.query(
            'SELECT f.*, ps.step_order, ps.process_name FROM files f JOIN process_steps ps ON ps.id = f.current_step_id WHERE f.id = $1',
            [req.params.id]
        );
        if (fileResult.rows.length === 0) throw new Error('File not found');

        const file = fileResult.rows[0];
        if (file.status === 'Completed') throw new Error('File is already completed');

        // Get next step
        const nextStep = await client.query(
            'SELECT * FROM process_steps WHERE process_name = $1 AND step_order = $2',
            [file.process_name, file.step_order + 1]
        );

        if (nextStep.rows.length === 0) throw new Error('No more steps');

        const next = nextStep.rows[0];
        const now = new Date();

        // Complete current step log with optional comment
        await client.query(
            `UPDATE file_step_log SET completed_at = $1,
       sla_met = (EXTRACT(EPOCH FROM ($1 - started_at)) / 86400) <= (SELECT sla_days FROM process_steps WHERE id = file_step_log.step_id),
       comment = COALESCE($4, comment)
       WHERE file_id = $2 AND step_id = $3 AND completed_at IS NULL`,
            [now, req.params.id, file.current_step_id, comment || null]
        );

        // Check if next step is "Completed"
        const isCompleted = next.step_name === 'Completed';

        // Update file
        await client.query(
            `UPDATE files SET current_step_id = $1, step_started_at = $2,
       status = $3, completed_at = $4 WHERE id = $5`,
            [next.id, now, isCompleted ? 'Completed' : 'Active', isCompleted ? now : null, req.params.id]
        );

        // Log new step
        await client.query(
            'INSERT INTO file_step_log (file_id, step_id, started_at, completed_at) VALUES ($1, $2, $3, $4)',
            [req.params.id, next.id, now, isCompleted ? now : null]
        );

        await client.query('COMMIT');

        // Return updated file
        const updatedFile = await pool.query(`
      SELECT f.*, o.name AS officer_name, ps.step_name AS current_step_name, ps.sla_days, ps.step_order,
             (SELECT COUNT(*) FROM process_steps WHERE process_name = f.process_name) AS total_steps
      FROM files f
      JOIN officers o ON o.id = f.officer_id
      LEFT JOIN process_steps ps ON ps.id = f.current_step_id
      WHERE f.id = $1
    `, [req.params.id]);

        res.json(updatedFile.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});


module.exports = router;

