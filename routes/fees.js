// routes/fees.js — EduCore v2 (multi-component, no section)
'use strict';

const express   = require('express');
const router    = express.Router();
const { query } = require('../config/db');

// ── GET /api/fees ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { studentId, status, feeType, academicYear, page=1, limit=50 } = req.query;
    const conditions=[], params=[];
    let p=1;

    if (studentId)    { conditions.push(`f.student_id = $${p++}`);                  params.push(studentId); }
    if (status)       { conditions.push(`UPPER(f.status) = UPPER($${p++})`);         params.push(status); }
    if (feeType)      { conditions.push(`f.fee_type = $${p++}`);                     params.push(feeType); }
    if (academicYear) { conditions.push(`f.academic_year = $${p++}`);                params.push(academicYear); }

    const where  = conditions.length ? 'WHERE '+conditions.join(' AND ') : '';
    const offset = (Number(page)-1)*Number(limit);

    const countRes = await query(`SELECT COUNT(*) FROM fees f ${where}`, params);
    const total    = Number(countRes.rows[0].count);

    params.push(Number(limit), offset);
    const result = await query(
      `SELECT f.receipt_no, f.student_id,
              s.first_name||' '||s.last_name AS student_name,
              s.class, s.section,
              f.fee_type, f.amount,
              TO_CHAR(f.paid_date,'YYYY-MM-DD') AS paid_date,
              f.payment_mode, f.status, f.remarks, f.academic_year,
              f.created_at
       FROM   fees f
       LEFT   JOIN students s ON s.student_id = f.student_id
       ${where}
       ORDER  BY f.created_at DESC
       LIMIT $${p++} OFFSET $${p++}`,
      params
    );
    res.json({ success:true, total, page:Number(page), limit:Number(limit), data:result.rows });
  } catch(err){ next(err); }
});

// ── GET /api/fees/summary ─────────────────────────────────────
router.get('/summary', async (req, res, next) => {
  try {
    const { academicYear } = req.query;
    const where  = academicYear ? 'WHERE academic_year=$1' : '';
    const params = academicYear ? [academicYear] : [];
    const result = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN status='Paid'    THEN amount ELSE 0 END),0) AS collected,
         COALESCE(SUM(CASE WHEN status='Pending' THEN amount ELSE 0 END),0) AS pending,
         COALESCE(SUM(CASE WHEN status='Partial' THEN amount ELSE 0 END),0) AS partial,
         COALESCE(SUM(amount),0) AS total, COUNT(*) AS transactions
       FROM fees ${where}`, params
    );
    res.json({ success:true, data:result.rows[0] });
  } catch(err){ next(err); }
});

// ── POST /api/fees ────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { studentId, feeType, amount, paymentMode, paidDate, remarks, academicYear } = req.body;
    if (!studentId) return res.status(400).json({ success:false, error:'studentId is required' });
    if (!feeType)   return res.status(400).json({ success:false, error:'feeType is required' });
    if (!amount||Number(amount)<=0) return res.status(400).json({ success:false, error:'amount must be > 0' });

    const stu = await query('SELECT student_id FROM students WHERE student_id=$1',[studentId]);
    if (!stu.rows.length) return res.status(404).json({ success:false, error:'Student not found: '+studentId });

    const result = await query(
      `INSERT INTO fees (student_id,fee_type,amount,paid_date,payment_mode,status,remarks,academic_year)
       VALUES ($1,$2,$3,$4,$5,'Paid',$6,$7)
       RETURNING receipt_no`,
      [ studentId, feeType, Number(amount),
        paidDate||new Date().toISOString().split('T')[0],
        paymentMode||'Cash', remarks||null, academicYear||'2025-2026' ]
    );
    res.status(201).json({ success:true, receiptNo:result.rows[0].receipt_no, message:'Fee payment recorded' });
  } catch(err){ next(err); }
});

module.exports = router;
