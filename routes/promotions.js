// routes/promotions.js  — PostgreSQL version
'use strict';

const express      = require('express');
const router       = express.Router();
const { query, getClient } = require('../config/db');

// ── GET /api/promotions/eligible ─────────────────────────────
router.get('/eligible', async (req, res, next) => {
  try {
    const { class: cls } = req.query;
    const params = [];
    let clsFilter = '';
    if (cls) { clsFilter = 'AND s.class = $1'; params.push(cls); }

    const result = await query(
      `WITH avg_marks AS (
         SELECT em.student_id,
                ROUND(AVG(em.marks / NULLIF(em.max_marks,0) * 100)::NUMERIC, 1) AS avg_pct
         FROM   exam_marks em
         JOIN   exams e ON e.exam_id = em.exam_id AND e.exam_type = 'Annual'
         GROUP  BY em.student_id
       ),
       att_pct AS (
         SELECT student_id,
                ROUND(
                  SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END)::NUMERIC
                  / NULLIF(COUNT(*), 0) * 100, 1
                ) AS att_pct
         FROM   attendance
         GROUP  BY student_id
       ),
       fee_status AS (
         SELECT student_id,
                CASE WHEN COUNT(*) FILTER (WHERE status = 'Pending') > 0
                     THEN 'Pending' ELSE 'Clear' END AS fee_stat
         FROM   fees
         GROUP  BY student_id
       )
       SELECT s.student_id,
              s.first_name || ' ' || s.last_name AS student_name,
              s.class AS current_class,
              s.section,
              COALESCE(am.avg_pct, 0)   AS avg_score,
              COALESCE(ap.att_pct, 0)   AS att_pct,
              COALESCE(fs.fee_stat, 'Clear') AS fee_status,
              CASE
                WHEN COALESCE(am.avg_pct, 0) >= 35
                 AND COALESCE(ap.att_pct, 0) >= 75
                 AND COALESCE(fs.fee_stat, 'Clear') = 'Clear'
                THEN 'Eligible'
                WHEN COALESCE(am.avg_pct, 0) < 35 THEN 'Detained'
                ELSE 'Review'
              END AS promotion_status,
              p.promoted_to,
              p.academic_year
       FROM   students s
       LEFT JOIN avg_marks am ON am.student_id = s.student_id
       LEFT JOIN att_pct   ap ON ap.student_id = s.student_id
       LEFT JOIN fee_status fs ON fs.student_id = s.student_id
       LEFT JOIN promotions p  ON p.student_id = s.student_id
       WHERE  s.status = 'Active' ${clsFilter}
       ORDER  BY s.class, s.last_name`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── POST /api/promotions/promote/:studentId ───────────────────
router.post('/promote/:studentId', async (req, res, next) => {
  const { toClass, toSection, academicYear } = req.body;
  if (!toClass) return res.status(400).json({ success: false, error: 'toClass is required' });

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Get current class info
    const cur = await client.query(
      `SELECT class, section FROM students WHERE student_id = $1`,
      [req.params.studentId]
    );
    if (!cur.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    // Log promotion
    await client.query(
      `INSERT INTO promotions (student_id, from_class, from_section, promoted_to, to_section, academic_year)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.params.studentId, cur.rows[0].class, cur.rows[0].section, toClass, toSection || 'A', academicYear || '2025-26']
    );

    // Update student class
    await client.query(
      `UPDATE students SET class = $1, section = $2 WHERE student_id = $3`,
      [toClass, toSection || 'A', req.params.studentId]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: `Student promoted to ${toClass}` });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── POST /api/promotions/bulk ─────────────────────────────────
router.post('/bulk', async (req, res, next) => {
  const { studentIds, academicYear } = req.body;
  if (!Array.isArray(studentIds) || !studentIds.length) {
    return res.status(400).json({ success: false, error: 'studentIds array is required' });
  }

  const client = await getClient();
  let promoted = 0;
  try {
    await client.query('BEGIN');

    for (const sid of studentIds) {
      const cur = await client.query(
        `SELECT class, section FROM students WHERE student_id = $1`, [sid]
      );
      if (!cur.rows.length) continue;

      const currentClass = cur.rows[0].class;
      const currentSection = cur.rows[0].section;

      // Parse class number and increment
      const match = currentClass.match(/(\d+)/);
      if (!match) continue;
      const nextNum = parseInt(match[1]) + 1;
      if (nextNum > 12) continue; // Graduated
      const nextClass = currentClass.replace(/\d+/, nextNum);

      await client.query(
        `INSERT INTO promotions (student_id, from_class, from_section, promoted_to, to_section, academic_year)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sid, currentClass, currentSection, nextClass, currentSection, academicYear || '2025-26']
      );

      await client.query(
        `UPDATE students SET class = $1 WHERE student_id = $2`,
        [nextClass, sid]
      );
      promoted++;
    }

    await client.query('COMMIT');
    res.json({ success: true, promoted, message: `${promoted} students promoted` });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
