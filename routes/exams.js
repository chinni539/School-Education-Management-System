// routes/exams.js  — PostgreSQL version
'use strict';

const express      = require('express');
const router       = express.Router();
const { query, getClient } = require('../config/db');

// ── GET /api/exams ────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT exam_id, exam_name, exam_type, classes_applicable,
              TO_CHAR(start_date,'DD Mon YYYY') AS start_date,
              TO_CHAR(end_date,'DD Mon YYYY')   AS end_date,
              max_marks, pass_mark, notes, status
       FROM   exams
       ORDER  BY start_date DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── POST /api/exams ───────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { examName, examType, classesApplicable, startDate, endDate, maxMarks, passMark, notes } = req.body;

    if (!examName || !examType) {
      return res.status(400).json({ success: false, error: 'examName and examType are required' });
    }

    const result = await query(
      `INSERT INTO exams (exam_name, exam_type, classes_applicable, start_date, end_date, max_marks, pass_mark, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING exam_id`,
      [examName, examType, classesApplicable || 'All', startDate || null, endDate || null, maxMarks || 100, passMark || 35, notes || null]
    );

    res.status(201).json({ success: true, examId: result.rows[0].exam_id, message: 'Exam created' });
  } catch (err) { next(err); }
});

// ── GET /api/exams/:examId/marks ──────────────────────────────
router.get('/:examId/marks', async (req, res, next) => {
  try {
    const { class: cls, section } = req.query;
    const conditions = ['em.exam_id = $1'];
    const params     = [Number(req.params.examId)];
    let   p          = 2;

    if (cls)     { conditions.push(`UPPER(s.class) = UPPER($${p++})`);   params.push(cls); }
    if (section) { conditions.push(`UPPER(s.section) = UPPER($${p++})`); params.push(section); }

    const result = await query(
      `SELECT em.student_id,
              s.first_name || ' ' || s.last_name AS student_name,
              s.class, s.section,
              MAX(CASE WHEN UPPER(em.subject) = 'MATHEMATICS'    THEN em.marks END) AS mathematics,
              MAX(CASE WHEN UPPER(em.subject) = 'SCIENCE'        THEN em.marks END) AS science,
              MAX(CASE WHEN UPPER(em.subject) = 'ENGLISH'        THEN em.marks END) AS english,
              MAX(CASE WHEN UPPER(em.subject) = 'SOCIAL STUDIES' THEN em.marks END) AS social_studies,
              MAX(CASE WHEN UPPER(em.subject) = 'TELUGU'         THEN em.marks END) AS telugu,
              SUM(em.marks)                                                          AS total_marks,
              ROUND(SUM(em.marks)::NUMERIC / NULLIF(COUNT(*) * MAX(em.max_marks), 0) * 100, 1) AS percentage
       FROM   exam_marks em
       JOIN   students s ON s.student_id = em.student_id
       WHERE  ${conditions.join(' AND ')}
       GROUP  BY em.student_id, s.first_name, s.last_name, s.class, s.section
       ORDER  BY total_marks DESC`,
      params
    );

    const graded = result.rows.map(r => ({
      ...r,
      grade:  calcGrade(Number(r.percentage)),
      result: Number(r.percentage) >= 35 ? 'Pass' : 'Fail',
    }));

    res.json({ success: true, data: graded });
  } catch (err) { next(err); }
});

// ── POST /api/exams/:examId/marks ─────────────────────────────
router.post('/:examId/marks', async (req, res, next) => {
  const examId     = Number(req.params.examId);
  const { studentId, marks } = req.body;

  if (!studentId || !marks || typeof marks !== 'object') {
    return res.status(400).json({ success: false, error: 'studentId and marks object are required' });
  }

  const client = await getClient();
  try {
    // Verify exam exists
    const examRes = await client.query(`SELECT max_marks FROM exams WHERE exam_id = $1`, [examId]);
    if (!examRes.rows.length) return res.status(404).json({ success: false, error: 'Exam not found' });
    const maxMarks = examRes.rows[0].max_marks;

    await client.query('BEGIN');

    for (const [subject, score] of Object.entries(marks)) {
      await client.query(
        `INSERT INTO exam_marks (student_id, exam_id, subject, marks, max_marks)
         VALUES ($1, $2, UPPER($3), $4, $5)
         ON CONFLICT (student_id, exam_id, subject)
         DO UPDATE SET marks = EXCLUDED.marks, updated_at = NOW()`,
        [studentId, examId, subject, Number(score), maxMarks]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, message: 'Marks saved', subjects: Object.keys(marks).length });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── GET /api/exams/student/:studentId ─────────────────────────
router.get('/student/:studentId', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT e.exam_name, e.exam_type,
              TO_CHAR(e.start_date,'Mon YYYY') AS exam_period,
              em.subject, em.marks, em.max_marks,
              ROUND(em.marks / NULLIF(em.max_marks, 0) * 100, 1) AS pct
       FROM   exam_marks em
       JOIN   exams e ON e.exam_id = em.exam_id
       WHERE  em.student_id = $1
       ORDER  BY e.start_date DESC, em.subject`,
      [req.params.studentId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

function calcGrade(pct) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 35) return 'D';
  return 'F';
}

module.exports = router;
