// routes/fees.js  — PostgreSQL version
'use strict';

const express   = require('express');
const router    = express.Router();
const { query } = require('../config/db');

// ── GET /api/fees ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { studentId, status, feeType, month, page = 1, limit = 50 } = req.query;
    const conditions = [];
    const params     = [];
    let   p          = 1;

    if (studentId) { conditions.push(`f.student_id = $${p++}`);                              params.push(studentId); }
    if (status)    { conditions.push(`UPPER(f.status) = UPPER($${p++})`);                    params.push(status); }
    if (feeType)   { conditions.push(`UPPER(f.fee_type) = UPPER($${p++})`);                  params.push(feeType); }
    if (month)     { conditions.push(`TO_CHAR(f.paid_date,'YYYY-MM') = $${p++}`);            params.push(month); }

    const where  = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const result = await query(
      `SELECT f.receipt_no,
              f.student_id,
              s.first_name || ' ' || s.last_name AS student_name,
              s.class,
              f.fee_type,
              f.amount,
              TO_CHAR(f.paid_date,'DD Mon YYYY') AS paid_date,
              f.payment_mode,
              f.status,
              f.remarks
       FROM   fees f
       JOIN   students s ON s.student_id = f.student_id
       ${where}
       ORDER  BY f.paid_date DESC NULLS LAST
       LIMIT  $${p++} OFFSET $${p++}`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/fees/summary ─────────────────────────────────────
router.get('/summary', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
         SUM(CASE WHEN status = 'Paid'    THEN amount ELSE 0 END)  AS collected,
         SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END)  AS pending,
         SUM(CASE WHEN status = 'Partial' THEN amount ELSE 0 END)  AS partial,
         SUM(amount)                                                AS total_expected,
         COUNT(DISTINCT CASE WHEN status = 'Paid'    THEN student_id END) AS paid_count,
         COUNT(DISTINCT CASE WHEN status = 'Pending' THEN student_id END) AS pending_count,
         COUNT(DISTINCT CASE WHEN status = 'Partial' THEN student_id END) AS partial_count
       FROM fees`
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── GET /api/fees/student/:studentId ─────────────────────────
router.get('/student/:studentId', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT receipt_no, fee_type, amount,
              TO_CHAR(paid_date,'DD Mon YYYY') AS paid_date,
              payment_mode, status, remarks
       FROM   fees
       WHERE  student_id = $1
       ORDER  BY paid_date DESC`,
      [req.params.studentId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── POST /api/fees ────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { studentId, feeType, amount, paymentMode, paidDate, remarks } = req.body;

    if (!studentId || !feeType || !amount) {
      return res.status(400).json({ success: false, error: 'studentId, feeType and amount are required' });
    }

    const result = await query(
      `INSERT INTO fees (student_id, fee_type, amount, paid_date, payment_mode, status, remarks)
       VALUES ($1, $2, $3, $4, $5, 'Paid', $6)
       RETURNING receipt_no`,
      [
        studentId, feeType, amount,
        paidDate || new Date().toISOString().split('T')[0],
        paymentMode || 'Cash',
        remarks || null
      ]
    );

    // Update student status
    await query(
      `UPDATE students SET status = 'Paid' WHERE student_id = $1`,
      [studentId]
    );

    res.status(201).json({
      success:   true,
      receiptNo: result.rows[0].receipt_no,
      message:   'Fee payment recorded'
    });
  } catch (err) { next(err); }
});

// ── PUT /api/fees/:receiptNo ──────────────────────────────────
router.put('/:receiptNo', async (req, res, next) => {
  try {
    const { status, amount, remarks } = req.body;
    await query(
      `UPDATE fees
       SET    status  = COALESCE($1, status),
              amount  = COALESCE($2, amount),
              remarks = COALESCE($3, remarks)
       WHERE  receipt_no = $4`,
      [status || null, amount || null, remarks || null, req.params.receiptNo]
    );
    res.json({ success: true, message: 'Fee record updated' });
  } catch (err) { next(err); }
});

module.exports = router;
