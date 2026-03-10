// routes/exams.js — EduCore v3 (structured exam sessions + student_marks)
'use strict';

const express            = require('express');
const router             = express.Router();
const { query, getClient } = require('../config/db');

const SUBJECTS   = ['Telugu','English','Hindi','Mathematics','Science','Social'];
const SF_TYPES   = ['SF1','SF2','SF3','SF4'];
const BIG_TYPES  = ['Mid Annual','Annual'];
const ALL_TYPES  = [...SF_TYPES, ...BIG_TYPES];

function maxPerSubject(examType) { return SF_TYPES.includes(examType) ? 25 : 50; }
function totalMax(examType)      { return SF_TYPES.includes(examType) ? 150 : 300; }

function calcGrade(pct) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  if (pct >= 35) return 'D';
  return 'F';
}

// ── GET /api/exams/types ──────────────────────────────────────
// Returns available exam types with their mark limits
router.get('/types', (_req, res) => {
  res.json({
    success: true,
    data: ALL_TYPES.map(t => ({
      examType:      t,
      maxPerSubject: maxPerSubject(t),
      totalMax:      totalMax(t),
      subjects:      SUBJECTS,
    })),
  });
});

// ── GET /api/exams/sessions ───────────────────────────────────
// List sessions filtered by academicYear and/or class
router.get('/sessions', async (req, res, next) => {
  try {
    const { academicYear, class: cls } = req.query;
    const conds=[], params=[];
    let p=1;
    if (academicYear) { conds.push(`academic_year=$${p++}`); params.push(academicYear); }
    if (cls)          { conds.push(`class=$${p++}`);          params.push(cls); }
    const where = conds.length ? 'WHERE '+conds.join(' AND ') : '';
    const result = await query(
      `SELECT * FROM exam_sessions ${where} ORDER BY academic_year, class, exam_type`, params
    );
    res.json({ success:true, data:result.rows });
  } catch(err){ next(err); }
});

// ── GET /api/exams/marks ──────────────────────────────────────
// Get all marks for a session (year+class+examType), optionally filtered by studentId
router.get('/marks', async (req, res, next) => {
  try {
    const { academicYear, class: cls, examType, studentId } = req.query;
    if (!academicYear || !cls || !examType) {
      return res.status(400).json({ success:false, error:'academicYear, class, examType required' });
    }

    const conds  = ['sm.academic_year=$1','sm.class=$2','sm.exam_type=$3'];
    const params = [academicYear, cls, examType];
    let p = 4;
    if (studentId) { conds.push(`sm.student_id=$${p++}`); params.push(studentId); }

    const result = await query(
      `SELECT sm.student_id,
              s.first_name||' '||s.last_name AS student_name,
              s.roll_number,
              sm.subject, sm.marks_obtained, sm.max_marks, sm.exam_type,
              sm.academic_year, sm.session_id
       FROM   student_marks sm
       JOIN   students s ON s.student_id=sm.student_id
       WHERE  ${conds.join(' AND ')}
       ORDER  BY s.last_name, s.first_name, sm.subject`,
      params
    );

    // Pivot by student
    const byStudent = {};
    result.rows.forEach(r => {
      if (!byStudent[r.student_id]) {
        byStudent[r.student_id] = {
          student_id:   r.student_id,
          student_name: r.student_name,
          roll_number:  r.roll_number,
          subjects:     {},
          total_obtained: 0,
          max_marks:    maxPerSubject(examType),
          total_max:    totalMax(examType),
        };
      }
      byStudent[r.student_id].subjects[r.subject] = Number(r.marks_obtained);
      byStudent[r.student_id].total_obtained += Number(r.marks_obtained);
    });

    const rows = Object.values(byStudent).map(s => {
      const pct   = s.total_max > 0 ? (s.total_obtained / s.total_max * 100) : 0;
      return { ...s, percentage: Math.round(pct*10)/10,
               grade: calcGrade(pct), result: pct >= 35 ? 'Pass' : 'Fail' };
    });

    res.json({
      success: true,
      examInfo: { examType, maxPerSubject: maxPerSubject(examType), totalMax: totalMax(examType) },
      data: rows,
    });
  } catch(err){ next(err); }
});

// ── GET /api/exams/student-marks ─────────────────────────────
// Get marks for ONE student in ONE session (for the entry form)
router.get('/student-marks', async (req, res, next) => {
  try {
    const { academicYear, class: cls, examType, studentId } = req.query;
    if (!academicYear||!cls||!examType||!studentId)
      return res.status(400).json({ success:false, error:'academicYear, class, examType, studentId required' });

    const result = await query(
      `SELECT sm.subject, sm.marks_obtained, sm.max_marks
       FROM   student_marks sm
       WHERE  sm.academic_year=$1 AND sm.class=$2
         AND  sm.exam_type=$3     AND sm.student_id=$4`,
      [academicYear, cls, examType, studentId]
    );

    const marks = {};
    result.rows.forEach(r => { marks[r.subject] = Number(r.marks_obtained); });

    res.json({
      success: true,
      marks,
      maxPerSubject: maxPerSubject(examType),
      totalMax:      totalMax(examType),
    });
  } catch(err){ next(err); }
});

// ── POST /api/exams/marks ─────────────────────────────────────
// Save/update marks for one student in a session
router.post('/marks', async (req, res, next) => {
  const { academicYear, class: cls, examType, studentId, marks } = req.body;

  if (!academicYear||!cls||!examType||!studentId||!marks)
    return res.status(400).json({ success:false, error:'academicYear, class, examType, studentId, marks required' });
  if (!ALL_TYPES.includes(examType))
    return res.status(400).json({ success:false, error:'Invalid examType: '+examType });

  const maxMark = maxPerSubject(examType);
  const client  = await getClient();

  try {
    await client.query('BEGIN');

    // Upsert exam_session
    const sesRes = await client.query(
      `INSERT INTO exam_sessions (academic_year, class, exam_type)
       VALUES ($1,$2,$3)
       ON CONFLICT (academic_year, class, exam_type) DO UPDATE SET academic_year=EXCLUDED.academic_year
       RETURNING session_id`,
      [academicYear, cls, examType]
    );
    const sessionId = sesRes.rows[0].session_id;

    // Validate student exists
    const stuRes = await client.query('SELECT student_id FROM students WHERE student_id=$1',[studentId]);
    if (!stuRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success:false, error:'Student not found' });
    }

    // Upsert each subject mark
    let saved = 0;
    for (const subject of SUBJECTS) {
      if (marks[subject] === undefined || marks[subject] === '' || marks[subject] === null) continue;
      const score = Number(marks[subject]);
      if (isNaN(score) || score < 0 || score > maxMark) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `${subject}: marks must be between 0 and ${maxMark}`
        });
      }
      await client.query(
        `INSERT INTO student_marks
           (session_id, student_id, academic_year, class, exam_type, subject, marks_obtained, max_marks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (session_id, student_id, subject)
         DO UPDATE SET marks_obtained=EXCLUDED.marks_obtained, updated_at=NOW()`,
        [sessionId, studentId, academicYear, cls, examType, subject, score, maxMark]
      );
      saved++;
    }

    await client.query('COMMIT');
    res.status(201).json({ success:true, message:`Marks saved for ${saved} subjects`, sessionId });
  } catch(err){
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── Legacy routes (keep for backward compatibility) ───────────
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT session_id AS exam_id, academic_year, class,
              exam_type AS exam_name, exam_type,
              max_per_subject AS max_marks, total_max
       FROM exam_sessions ORDER BY academic_year DESC, class, exam_type`
    );
    res.json({ success:true, data:result.rows });
  } catch(err){ next(err); }
});

module.exports = router;
