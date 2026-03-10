// routes/attendance.js  — PostgreSQL version
'use strict';

const express      = require('express');
const router       = express.Router();
const { query, getClient } = require('../config/db');

// ── GET /api/attendance ───────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { class: cls, section, date, month, studentId, page = 1, limit = 100 } = req.query;
    const conditions = [];
    const params     = [];
    let   p          = 1;

    if (cls)       { conditions.push(`UPPER(a.class) = UPPER($${p++})`);    params.push(cls); }
    if (section)   { conditions.push(`UPPER(a.section) = UPPER($${p++})`);  params.push(section); }
    if (date)      { conditions.push(`a.att_date = $${p++}`);               params.push(date); }
    if (month)     { conditions.push(`TO_CHAR(a.att_date,'YYYY-MM') = $${p++}`); params.push(month); }
    if (studentId) { conditions.push(`a.student_id = $${p++}`);             params.push(studentId); }

    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const result = await query(
      `SELECT a.att_id,
              a.student_id,
              s.first_name || ' ' || s.last_name AS student_name,
              a.class, a.section,
              TO_CHAR(a.att_date,'YYYY-MM-DD') AS att_date,
              a.status, a.time_in
       FROM   attendance a
       JOIN   students s ON s.student_id = a.student_id
       ${where}
       ORDER  BY a.att_date DESC, s.last_name
       LIMIT  $${p++} OFFSET $${p++}`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/attendance/summary ───────────────────────────────
router.get('/summary', async (req, res, next) => {
  try {
    const { month } = req.query;
    const params = [];
    let filter   = '';
    if (month) { filter = 'AND TO_CHAR(att_date,\'YYYY-MM\') = $1'; params.push(month); }

    const result = await query(
      `SELECT class,
              COUNT(*) AS total_records,
              SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) AS present_count,
              SUM(CASE WHEN status = 'Absent'  THEN 1 ELSE 0 END) AS absent_count,
              SUM(CASE WHEN status = 'Late'    THEN 1 ELSE 0 END) AS late_count,
              ROUND(
                SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END)::NUMERIC
                / NULLIF(COUNT(*), 0) * 100, 1
              ) AS attendance_pct
       FROM   attendance
       WHERE  1=1 ${filter}
       GROUP  BY class
       ORDER  BY class`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/attendance/student/:studentId ────────────────────
router.get('/student/:studentId', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT TO_CHAR(att_date,'YYYY-MM-DD') AS att_date,
              status, time_in,
              COUNT(*) OVER ()                                 AS total_days,
              SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END) OVER () AS present_days
       FROM   attendance
       WHERE  student_id = $1
       ORDER  BY att_date DESC`,
      [req.params.studentId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── POST /api/attendance  — mark single student ───────────────
router.post('/', async (req, res, next) => {
  try {
    const { studentId, className, section, attDate, status, timeIn } = req.body;

    if (!studentId || !className || !attDate || !status) {
      return res.status(400).json({ success: false, error: 'studentId, className, attDate and status are required' });
    }

    // UPSERT — update if same student+date already exists
    await query(
      `INSERT INTO attendance (student_id, class, section, att_date, status, time_in)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (student_id, att_date)
       DO UPDATE SET status = EXCLUDED.status, time_in = EXCLUDED.time_in`,
      [studentId, className, section || 'A', attDate, status, timeIn || null]
    );

    res.status(201).json({ success: true, message: 'Attendance recorded' });
  } catch (err) { next(err); }
});

// ── POST /api/attendance/bulk  — mark whole class ────────────
router.post('/bulk', async (req, res, next) => {
  const { className, section, attDate, records } = req.body;

  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ success: false, error: 'records array is required' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Delete existing for that class/date, then re-insert
    await client.query(
      `DELETE FROM attendance WHERE class = $1 AND section = $2 AND att_date = $3`,
      [className, section || 'A', attDate]
    );

    for (const r of records) {
      await client.query(
        `INSERT INTO attendance (student_id, class, section, att_date, status, time_in)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [r.studentId, className, section || 'A', attDate, r.status, r.timeIn || null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, saved: records.length, message: 'Bulk attendance saved' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
