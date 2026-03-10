// routes/dashboard.js  — PostgreSQL version
'use strict';

const express   = require('express');
const router    = express.Router();
const { query } = require('../config/db');

// ── GET /api/dashboard  — all KPIs in one call ────────────────
router.get('/', async (req, res, next) => {
  try {
    const [students, fees, attendance, exams, teachers, salaries] = await Promise.all([

      query(`SELECT COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE admission_date >= NOW() - INTERVAL '30 days') AS new_this_month
             FROM   students WHERE status = 'Active'`),

      query(`SELECT SUM(CASE WHEN status='Paid'    THEN amount ELSE 0 END) AS collected,
                    SUM(CASE WHEN status='Pending' THEN amount ELSE 0 END) AS pending,
                    SUM(CASE WHEN status='Partial' THEN amount ELSE 0 END) AS partial,
                    COUNT(DISTINCT student_id) FILTER (WHERE status='Pending') AS pending_students
             FROM   fees
             WHERE  TO_CHAR(COALESCE(paid_date, NOW()),'YYYY-MM') = TO_CHAR(NOW(),'YYYY-MM')`),

      query(`SELECT ROUND(
                      SUM(CASE WHEN status IN ('Present','Late') THEN 1 ELSE 0 END)::NUMERIC
                      / NULLIF(COUNT(*), 0) * 100, 1
                    ) AS today_pct
             FROM   attendance
             WHERE  att_date = CURRENT_DATE`),

      query(`SELECT ROUND(AVG(marks / NULLIF(max_marks,0) * 100)::NUMERIC, 1) AS avg_pct
             FROM   exam_marks`),

      query(`SELECT COUNT(*) AS total FROM teachers WHERE status = 'Active'`),

      query(`SELECT SUM(net_pay) AS total_payroll
             FROM   salary_payments
             WHERE  pay_month = TO_CHAR(NOW(),'YYYY-MM') AND status = 'Paid'`),
    ]);

    res.json({
      success: true,
      data: {
        students:   students.rows[0],
        fees:       fees.rows[0],
        attendance: attendance.rows[0],
        exams:      exams.rows[0],
        teachers:   teachers.rows[0],
        salaries:   salaries.rows[0],
      }
    });
  } catch (err) { next(err); }
});

// ── GET /api/dashboard/cashflow ───────────────────────────────
router.get('/cashflow', async (req, res, next) => {
  try {
    const months = Math.min(Number(req.query.months) || 6, 24);

    const income = await query(
      `SELECT TO_CHAR(paid_date,'Mon YYYY') AS month_label,
              TO_CHAR(paid_date,'YYYY-MM')  AS month_key,
              SUM(amount) AS income
       FROM   fees
       WHERE  status = 'Paid'
         AND  paid_date >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' * ($1 - 1)
       GROUP  BY TO_CHAR(paid_date,'Mon YYYY'), TO_CHAR(paid_date,'YYYY-MM')
       ORDER  BY month_key`,
      [months]
    );

    const expense = await query(
      `SELECT pay_month AS month_key, SUM(net_pay) AS expenses
       FROM   salary_payments
       WHERE  status = 'Paid'
         AND  pay_month >= TO_CHAR(NOW() - INTERVAL '1 month' * ($1 - 1), 'YYYY-MM')
       GROUP  BY pay_month
       ORDER  BY pay_month`,
      [months]
    );

    const expMap = {};
    expense.rows.forEach(r => { expMap[r.month_key] = Number(r.expenses) || 0; });

    const merged = income.rows.map(r => ({
      label:    r.month_label,
      key:      r.month_key,
      income:   Number(r.income)   || 0,
      expenses: expMap[r.month_key] || 0,
      net:      (Number(r.income) || 0) - (expMap[r.month_key] || 0),
    }));

    const ytdIncome   = merged.reduce((s, r) => s + r.income, 0);
    const ytdExpenses = merged.reduce((s, r) => s + r.expenses, 0);

    res.json({
      success: true,
      data: {
        monthly: merged,
        ytd: {
          income:   ytdIncome,
          expenses: ytdExpenses,
          net:      ytdIncome - ytdExpenses,
          margin:   ytdIncome ? Math.round((ytdIncome - ytdExpenses) / ytdIncome * 100) : 0
        }
      }
    });
  } catch (err) { next(err); }
});

// ── GET /api/dashboard/recent  — activity feed ────────────────
router.get('/recent', async (req, res, next) => {
  try {
    const result = await query(
      `(SELECT 'Enrollment'                        AS activity_type,
               first_name || ' ' || last_name      AS name,
               class, 'New Student Enrolled'       AS description,
               admission_date                      AS activity_date,
               'violet'                            AS color
        FROM   students
        WHERE  admission_date IS NOT NULL
        ORDER  BY admission_date DESC LIMIT 5)
       UNION ALL
       (SELECT 'Fee Payment',
               s.first_name || ' ' || s.last_name,
               s.class,
               'Fee Payment — ₹' || TO_CHAR(f.amount,'FM99,99,999'),
               f.paid_date, 'green'
        FROM   fees f
        JOIN   students s ON s.student_id = f.student_id
        WHERE  f.status = 'Paid' AND f.paid_date IS NOT NULL
        ORDER  BY f.paid_date DESC LIMIT 5)
       ORDER  BY activity_date DESC
       LIMIT  10`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

module.exports = router;
