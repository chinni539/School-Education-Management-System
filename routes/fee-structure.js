// routes/fee-structure.js  — NEW route for fee structure management
'use strict';

const express   = require('express');
const router    = express.Router();
const { query } = require('../config/db');

// ── GET /api/fee-structure ────────────────────────────────────
// Query params: academicYear, class
router.get('/', async (req, res, next) => {
  try {
    const { academicYear, class: cls } = req.query;
    const conditions = [];
    const params     = [];
    let   p          = 1;

    if (academicYear) { conditions.push(`academic_year = $${p++}`); params.push(academicYear); }
    if (cls)          { conditions.push(`class = $${p++}`);          params.push(cls); }

    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await query(
      `SELECT * FROM fee_structure ${where} ORDER BY academic_year, class, section`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/fee-structure/lookup ─────────────────────────────
// Returns the best matching fee structure for a given year+class+section
router.get('/lookup', async (req, res, next) => {
  try {
    const { academicYear, class: cls, section } = req.query;
    if (!academicYear || !cls) {
      return res.status(400).json({ success: false, error: 'academicYear and class are required' });
    }

    // Try with section first, then fall back to no-section entry
    const result = await query(
      `SELECT * FROM fee_structure
       WHERE  academic_year = $1 AND class = $2
         AND  (section = $3 OR section = '' OR section IS NULL)
       ORDER  BY CASE WHEN section = $3 THEN 0 ELSE 1 END
       LIMIT  1`,
      [academicYear, cls, section || '']
    );

    if (!result.rows.length) {
      return res.json({ success: true, data: null, message: 'No fee structure found for this class/year' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── POST /api/fee-structure ───────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      academicYear, class: cls, section,
      schoolFee, admissionFee, examFee,
      transportFee, booksFee, otherFees
    } = req.body;

    if (!academicYear || !cls) {
      return res.status(400).json({ success: false, error: 'academicYear and class are required' });
    }

    const result = await query(
      `INSERT INTO fee_structure
         (academic_year, class, section,
          school_fee, admission_fee, exam_fee,
          transport_fee, books_fee, other_fees)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (academic_year, class, section)
       DO UPDATE SET
         school_fee    = EXCLUDED.school_fee,
         admission_fee = EXCLUDED.admission_fee,
         exam_fee      = EXCLUDED.exam_fee,
         transport_fee = EXCLUDED.transport_fee,
         books_fee     = EXCLUDED.books_fee,
         other_fees    = EXCLUDED.other_fees,
         updated_at    = NOW()
       RETURNING fs_id, total_fee`,
      [
        academicYear, cls, section || '',
        Number(schoolFee    || 0),
        Number(admissionFee || 0),
        Number(examFee      || 0),
        Number(transportFee || 0),
        Number(booksFee     || 0),
        Number(otherFees    || 0),
      ]
    );

    res.status(201).json({
      success:  true,
      fsId:     result.rows[0].fs_id,
      totalFee: result.rows[0].total_fee,
      message:  'Fee structure saved'
    });
  } catch (err) { next(err); }
});

// ── DELETE /api/fee-structure/:id ─────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM fee_structure WHERE fs_id = $1', [req.params.id]);
    res.json({ success: true, message: 'Fee structure deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
