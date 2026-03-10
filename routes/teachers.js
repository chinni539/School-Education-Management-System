// routes/teachers.js  — PostgreSQL version
'use strict';

const express   = require('express');
const router    = express.Router();
const { query } = require('../config/db');

// ── GET /api/teachers ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { subject, status, search } = req.query;
    const conditions = [];
    const params     = [];
    let   p          = 1;

    if (subject) { conditions.push(`UPPER(subject) = UPPER($${p++})`);          params.push(subject); }
    if (status)  { conditions.push(`UPPER(status) = UPPER($${p++})`);           params.push(status); }
    if (search)  { conditions.push(`UPPER(full_name) LIKE UPPER($${p++})`);     params.push(`%${search}%`); }

    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await query(
      `SELECT teacher_id, full_name, subject, class_assigned,
              phone, email, qualification, experience_years,
              basic_salary, TO_CHAR(join_date,'DD Mon YYYY') AS join_date, status
       FROM   teachers
       ${where}
       ORDER  BY full_name`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/teachers/:id ─────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM teachers WHERE teacher_id = $1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Teacher not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── POST /api/teachers ────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { fullName, subject, classAssigned, phone, email, qualification, experienceYears, basicSalary, joinDate } = req.body;

    if (!fullName || !subject) {
      return res.status(400).json({ success: false, error: 'fullName and subject are required' });
    }

    const result = await query(
      `INSERT INTO teachers
         (full_name, subject, class_assigned, phone, email, qualification, experience_years, basic_salary, join_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING teacher_id`,
      [
        fullName, subject, classAssigned || null, phone || null,
        email || null, qualification || null, experienceYears || 0,
        basicSalary || 0, joinDate || new Date().toISOString().split('T')[0]
      ]
    );

    res.status(201).json({ success: true, teacherId: result.rows[0].teacher_id, message: 'Teacher added' });
  } catch (err) { next(err); }
});

// ── PUT /api/teachers/:id ─────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const allowed = {
      fullName: 'full_name', subject: 'subject', classAssigned: 'class_assigned',
      phone: 'phone', email: 'email', qualification: 'qualification',
      experienceYears: 'experience_years', basicSalary: 'basic_salary', status: 'status'
    };

    const sets   = [];
    const params = [];
    let   p      = 1;

    Object.entries(req.body).forEach(([k, v]) => {
      if (allowed[k]) { sets.push(`${allowed[k]} = $${p++}`); params.push(v); }
    });

    if (!sets.length) return res.status(400).json({ success: false, error: 'No valid fields to update' });

    params.push(req.params.id);
    await query(`UPDATE teachers SET ${sets.join(', ')} WHERE teacher_id = $${p}`, params);
    res.json({ success: true, message: 'Teacher updated' });
  } catch (err) { next(err); }
});

// ── DELETE /api/teachers/:id  (soft delete) ───────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await query(`UPDATE teachers SET status = 'Inactive' WHERE teacher_id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Teacher deactivated' });
  } catch (err) { next(err); }
});

module.exports = router;
