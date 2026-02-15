const pool = require('../db/pool');

async function checkSLAs() {
    console.log('[SLA] Checking for overdue steps...');

    // Find active files where the current step is overdue
    const result = await pool.query(`
    SELECT f.id AS file_id, f.pr_number, f.title, f.officer_id, f.current_step_id,
           f.step_started_at, ps.step_name, ps.sla_days, o.name AS officer_name, o.email
    FROM files f
    JOIN process_steps ps ON ps.id = f.current_step_id
    JOIN officers o ON o.id = f.officer_id
    WHERE f.status = 'Active'
      AND ps.sla_days > 0
      AND f.step_started_at + (ps.sla_days || ' days')::interval < NOW()
  `);

    console.log(`[SLA] Found ${result.rows.length} overdue file(s)`);

    for (const row of result.rows) {
        // Check if we already notified for this file + step
        const existing = await pool.query(
            'SELECT id FROM notifications WHERE file_id = $1 AND step_id = $2',
            [row.file_id, row.current_step_id]
        );

        if (existing.rows.length === 0) {
            const daysOverdue = Math.floor(
                (Date.now() - new Date(row.step_started_at).getTime()) / (1000 * 60 * 60 * 24)
            ) - row.sla_days;

            const message = `⚠️ OVERDUE: File "${row.pr_number} - ${row.title}" is ${daysOverdue} day(s) overdue on step "${row.step_name}" (SLA: ${row.sla_days} days). Assigned to ${row.officer_name}.`;

            await pool.query(
                'INSERT INTO notifications (file_id, officer_id, step_id, message) VALUES ($1, $2, $3, $4)',
                [row.file_id, row.officer_id, row.current_step_id, message]
            );

            console.log(`[SLA] Notification created for file ${row.pr_number}: ${message}`);
        }
    }
}

module.exports = { checkSLAs };
