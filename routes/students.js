// routes/students.js  — Updated for EduCore v2
'use strict';

const express   = require('express');
const router    = express.Router();
const { query } = require('../config/db');

// ── GET /api/students ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const {
      class: cls, section, status, search,
      academicYear, page = 1, limit = 50
    } = req.query;

    const conditions = [];
    const params     = [];
    let   p          = 1;

    if (cls)          { conditions.push(`UPPER(class) = UPPER($${p++})`);                           params.push(cls); }
    if (section)      { conditions.push(`UPPER(section) = UPPER($${p++})`);                         params.push(section); }
    if (status)       { conditions.push(`UPPER(status) = UPPER($${p++})`);                          params.push(status); }
    if (academicYear) { conditions.push(`academic_year = $${p++}`);                                  params.push(academicYear); }
    if (search)       { conditions.push(`(UPPER(first_name||' '||last_name) LIKE UPPER($${p++}))`); params.push(`%${search}%`); }

    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (Number(page) - 1) * Number(limit);

    const countRes = await query(`SELECT COUNT(*) FROM students ${where}`, params);
    const total    = Number(countRes.rows[0].count);

    params.push(Number(limit), offset);
    const result = await query(
      `SELECT student_id, first_name, last_name,
              TO_CHAR(dob,'DD Mon YYYY') AS dob,
              gender, class, section, parent_name,
              phone, email, blood_group, address,
              annual_fee, status, academic_year,
              roll_number, nationality, prev_school,
              occupation, alt_phone, relation,
              TO_CHAR(admission_date,'DD Mon YYYY') AS admission_date
       FROM   students
       ${where}
       ORDER  BY last_name, first_name
       LIMIT  $${p++} OFFSET $${p++}`,
      params
    );

    res.json({ success: true, total, page: Number(page), limit: Number(limit), data: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/students/:id ─────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT *, TO_CHAR(dob,'DD Mon YYYY') AS dob_fmt,
               TO_CHAR(admission_date,'DD Mon YYYY') AS admission_date_fmt
       FROM students WHERE student_id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Student not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── POST /api/students ────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      firstName, lastName, dob, gender, className, section,
      parentName, phone, email, bloodGroup, address,
      annualFee, admissionDate, academicYear,
      rollNumber, nationality, prevSchool, occupation, altPhone, relation
    } = req.body;

    if (!firstName || !lastName || !className) {
      return res.status(400).json({
        success: false,
        error: 'firstName, lastName and className are required'
      });
    }

    const result = await query(
      `INSERT INTO students
         (first_name, last_name, dob, gender, class, section,
          parent_name, phone, email, blood_group, address,
          annual_fee, admission_date, academic_year,
          roll_number, nationality, prev_school, occupation, alt_phone, relation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING student_id`,
      [
        firstName, lastName,
        dob || null,
        gender || 'Male',
        className,
        section || 'A',
        parentName || null,
        phone || null,
        email || null,
        bloodGroup || null,
        address || null,
        annualFee || 0,
        admissionDate || new Date().toISOString().split('T')[0],
        academicYear || '2025-2026',
        rollNumber || null,
        nationality || 'Indian',
        prevSchool || null,
        occupation || null,
        altPhone || null,
        relation || 'Father',
      ]
    );

    res.status(201).json({
      success:   true,
      studentId: result.rows[0].student_id,
      message:   'Student enrolled successfully'
    });
  } catch (err) { next(err); }
});

// ── PUT /api/students/:id ─────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const allowed = {
      firstName: 'first_name',   lastName: 'last_name',
      gender: 'gender',          className: 'class',
      section: 'section',        parentName: 'parent_name',
      phone: 'phone',            email: 'email',
      bloodGroup: 'blood_group', address: 'address',
      annualFee: 'annual_fee',   status: 'status',
      academicYear: 'academic_year', rollNumber: 'roll_number',
      nationality: 'nationality', prevSchool: 'prev_school',
      occupation: 'occupation',   altPhone: 'alt_phone',
      relation: 'relation',
    };

    const sets   = [];
    const params = [];
    let   p      = 1;

    Object.entries(req.body).forEach(([k, v]) => {
      if (allowed[k]) { sets.push(`${allowed[k]} = $${p++}`); params.push(v); }
    });

    if (!sets.length) return res.status(400).json({ success: false, error: 'No valid fields to update' });

    params.push(req.params.id);
    const result = await query(
      `UPDATE students SET ${sets.join(', ')} WHERE student_id = $${p} RETURNING student_id`,
      params
    );

    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Student not found' });
    res.json({ success: true, message: 'Student updated' });
  } catch (err) { next(err); }
});

// ── DELETE /api/students/:id  (soft delete) ───────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await query(
      `UPDATE students SET status = 'Inactive' WHERE student_id = $1`,
      [req.params.id]
    );
    res.json({ success: true, message: 'Student deactivated' });
  } catch (err) { next(err); }
});

module.exports = router;
