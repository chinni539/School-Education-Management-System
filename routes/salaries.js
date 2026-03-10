// routes/salaries.js  — PostgreSQL version
'use strict';

const express   = require('express');
const router    = express.Router();
const { query } = require('../config/db');

// ── GET /api/salaries ─────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { month, teacherId, status } = req.query;
    const conditions = [];
    const params     = [];
    let   p          = 1;

    if (month)     { conditions.push(`sp.pay_month = $${p++}`);              params.push(month); }
    if (teacherId) { conditions.push(`sp.teacher_id = $${p++}`);             params.push(teacherId); }
    if (status)    { conditions.push(`UPPER(sp.status) = UPPER($${p++})`);   params.push(status); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await query(
      `SELECT sp.pay_id, sp.teacher_id,
              t.full_name AS teacher_name, t.subject,
              sp.pay_month, sp.basic, sp.hra, sp.da_allowance, sp.bonus,
              sp.pf_deduction, sp.tax_deduction, sp.net_pay,
              sp.payment_mode,
              TO_CHAR(sp.pay_date,'DD Mon YYYY') AS pay_date,
              sp.status, sp.remarks
       FROM   salary_payments sp
       JOIN   teachers t ON t.teacher_id = sp.teacher_id
       ${where}
       ORDER  BY sp.pay_date DESC, t.full_name`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/salaries/summary ─────────────────────────────────
router.get('/summary', async (req, res, next) => {
  try {
    const { month } = req.query;
    const params = [];
    let filter   = '';
    if (month) { filter = 'WHERE pay_month = $1'; params.push(month); }

    const result = await query(
      `SELECT
         SUM(basic)                                              AS total_basic,
         SUM(hra)                                               AS total_hra,
         SUM(da_allowance)                                      AS total_da,
         SUM(bonus)                                             AS total_bonus,
         SUM(pf_deduction + tax_deduction + other_deductions)   AS total_deductions,
         SUM(net_pay)                                           AS total_net,
         COUNT(*)                                               AS total_staff,
         SUM(CASE WHEN status = 'Paid'    THEN 1 ELSE 0 END)   AS paid_count,
         SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END)   AS pending_count
       FROM salary_payments ${filter}`,
      params
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── POST /api/salaries ────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      teacherId, payMonth, basic, hra, daAllowance, bonus,
      pfDeduction, taxDeduction, otherDeductions,
      paymentMode, payDate, remarks
    } = req.body;

    if (!teacherId || !payMonth || !basic) {
      return res.status(400).json({ success: false, error: 'teacherId, payMonth and basic are required' });
    }

    // Duplicate guard
    const dup = await query(
      `SELECT 1 FROM salary_payments WHERE teacher_id = $1 AND pay_month = $2`,
      [teacherId, payMonth]
    );
    if (dup.rows.length) {
      return res.status(409).json({ success: false, error: 'Salary already processed for this month' });
    }

    const result = await query(
      `INSERT INTO salary_payments
         (teacher_id, pay_month, basic, hra, da_allowance, bonus,
          pf_deduction, tax_deduction, other_deductions,
          payment_mode, pay_date, status, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Paid',$12)
       RETURNING pay_id, net_pay`,
      [
        teacherId, payMonth,
        basic,         hra           || 0,
        daAllowance || 0, bonus       || 0,
        pfDeduction || 0, taxDeduction || 0, otherDeductions || 0,
        paymentMode || 'Bank Transfer',
        payDate || new Date().toISOString().split('T')[0],
        remarks || null
      ]
    );

    res.status(201).json({
      success: true,
      netPay:  result.rows[0].net_pay,
      message: 'Salary processed successfully'
    });
  } catch (err) { next(err); }
});

// ── PUT /api/salaries/:payId ──────────────────────────────────
router.put('/:payId', async (req, res, next) => {
  try {
    const { status, remarks } = req.body;
    await query(
      `UPDATE salary_payments
       SET    status  = COALESCE($1, status),
              remarks = COALESCE($2, remarks)
       WHERE  pay_id = $3`,
      [status || null, remarks || null, Number(req.params.payId)]
    );
    res.json({ success: true, message: 'Salary record updated' });
  } catch (err) { next(err); }
});

module.exports = router;
