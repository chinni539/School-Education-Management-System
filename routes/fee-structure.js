// routes/fee-structure.js — EduCore v2 (no section, class-level only)
'use strict';

const express   = require('express');
const router    = express.Router();
const { query } = require('../config/db');

// ── GET /api/fee-structure ────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { academicYear, class: cls } = req.query;
    const conditions=[], params=[];
    let p=1;
    if (academicYear) { conditions.push(`academic_year=$${p++}`); params.push(academicYear); }
    if (cls)          { conditions.push(`class=$${p++}`);          params.push(cls); }
    const where = conditions.length ? 'WHERE '+conditions.join(' AND ') : '';
    const result = await query(
      `SELECT * FROM fee_structure ${where} ORDER BY academic_year, class`, params
    );
    res.json({ success:true, data:result.rows });
  } catch(err){ next(err); }
});

// ── GET /api/fee-structure/lookup ─────────────────────────────
router.get('/lookup', async (req, res, next) => {
  try {
    const { academicYear, class: cls } = req.query;
    if (!academicYear||!cls)
      return res.status(400).json({ success:false, error:'academicYear and class are required' });

    const result = await query(
      `SELECT * FROM fee_structure WHERE academic_year=$1 AND class=$2 LIMIT 1`,
      [academicYear, cls]
    );
    if (!result.rows.length)
      return res.json({ success:true, data:null, message:'No fee structure found' });
    res.json({ success:true, data:result.rows[0] });
  } catch(err){ next(err); }
});

// ── POST /api/fee-structure (upsert) ─────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { academicYear, class: cls, schoolFee=0, admissionFee=0,
            examFee=0, transportFee=0, booksFee=0, otherFees=0 } = req.body;
    if (!academicYear||!cls)
      return res.status(400).json({ success:false, error:'academicYear and class are required' });

    const result = await query(
      `INSERT INTO fee_structure
         (academic_year,class,section,school_fee,admission_fee,exam_fee,transport_fee,books_fee,other_fees)
       VALUES ($1,$2,'',$3,$4,$5,$6,$7,$8)
       ON CONFLICT (academic_year,class,section)
       DO UPDATE SET
         school_fee=EXCLUDED.school_fee, admission_fee=EXCLUDED.admission_fee,
         exam_fee=EXCLUDED.exam_fee,     transport_fee=EXCLUDED.transport_fee,
         books_fee=EXCLUDED.books_fee,   other_fees=EXCLUDED.other_fees,
         updated_at=NOW()
       RETURNING fs_id, total_fee`,
      [ academicYear, cls,
        Number(schoolFee), Number(admissionFee), Number(examFee),
        Number(transportFee), Number(booksFee), Number(otherFees) ]
    );
    res.status(201).json({ success:true, fsId:result.rows[0].fs_id,
      totalFee:result.rows[0].total_fee, message:'Fee structure saved' });
  } catch(err){ next(err); }
});

// ── DELETE /api/fee-structure/:id ─────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM fee_structure WHERE fs_id=$1',[req.params.id]);
    res.json({ success:true, message:'Deleted' });
  } catch(err){ next(err); }
});

module.exports = router;
