-- ============================================================
--  EduCore School Management System — PostgreSQL Schema
--  Run this ONCE in Supabase SQL Editor
--  Supabase: Dashboard → SQL Editor → New query → Paste → Run
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ── Helper function: generate student ID ─────────────────────
CREATE SEQUENCE IF NOT EXISTS students_id_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS teachers_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS fees_id_seq     START 1;
CREATE SEQUENCE IF NOT EXISTS exams_id_seq    START 1;

-- ── STUDENTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  student_id      TEXT        PRIMARY KEY
                  DEFAULT 'STU-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD(NEXTVAL('students_id_seq')::TEXT, 4, '0'),
  first_name      TEXT        NOT NULL,
  last_name       TEXT        NOT NULL,
  dob             DATE,
  gender          TEXT        CHECK (gender IN ('Male','Female','Other')),
  class           TEXT        NOT NULL,
  section         TEXT        DEFAULT 'A',
  parent_name     TEXT,
  phone           TEXT,
  email           TEXT,
  blood_group     TEXT,
  address         TEXT,
  annual_fee      NUMERIC(10,2) DEFAULT 0,
  status          TEXT        DEFAULT 'Active'
                  CHECK (status IN ('Active','Paid','Pending','Inactive','New')),
  admission_date  DATE        DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_class   ON students(class);
CREATE INDEX IF NOT EXISTS idx_students_status  ON students(status);
CREATE INDEX IF NOT EXISTS idx_students_name    ON students(last_name, first_name);

-- ── FEES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fees (
  receipt_no      TEXT        PRIMARY KEY
                  DEFAULT 'RCP-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD(NEXTVAL('fees_id_seq')::TEXT, 6, '0'),
  student_id      TEXT        NOT NULL REFERENCES students(student_id),
  fee_type        TEXT        NOT NULL,
  amount          NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  paid_date       DATE,
  payment_mode    TEXT        DEFAULT 'Cash'
                  CHECK (payment_mode IN ('Cash','Online/UPI','Bank Transfer','Cheque','DD')),
  status          TEXT        DEFAULT 'Pending'
                  CHECK (status IN ('Paid','Pending','Partial','Waived')),
  remarks         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fees_student ON fees(student_id);
CREATE INDEX IF NOT EXISTS idx_fees_date    ON fees(paid_date);
CREATE INDEX IF NOT EXISTS idx_fees_status  ON fees(status);

-- ── ATTENDANCE ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  att_id      SERIAL      PRIMARY KEY,
  student_id  TEXT        NOT NULL REFERENCES students(student_id),
  class       TEXT        NOT NULL,
  section     TEXT        DEFAULT 'A',
  att_date    DATE        NOT NULL,
  status      TEXT        NOT NULL CHECK (status IN ('Present','Absent','Late','Holiday')),
  time_in     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, att_date)
);

CREATE INDEX IF NOT EXISTS idx_att_date    ON attendance(att_date);
CREATE INDEX IF NOT EXISTS idx_att_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_att_class   ON attendance(class, att_date);

-- ── EXAMS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  exam_id             SERIAL      PRIMARY KEY,
  exam_name           TEXT        NOT NULL,
  exam_type           TEXT        NOT NULL
                      CHECK (exam_type IN ('Annual','Midterm','Unit Test','Quarterly','Other')),
  classes_applicable  TEXT        DEFAULT 'All',
  start_date          DATE,
  end_date            DATE,
  max_marks           NUMERIC(6,2) DEFAULT 100,
  pass_mark           NUMERIC(6,2) DEFAULT 35,
  notes               TEXT,
  status              TEXT        DEFAULT 'Active'
                      CHECK (status IN ('Active','Completed','Cancelled')),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── EXAM MARKS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_marks (
  mark_id     SERIAL      PRIMARY KEY,
  student_id  TEXT        NOT NULL REFERENCES students(student_id),
  exam_id     INTEGER     NOT NULL REFERENCES exams(exam_id),
  subject     TEXT        NOT NULL,
  marks       NUMERIC(6,2) NOT NULL CHECK (marks >= 0),
  max_marks   NUMERIC(6,2) DEFAULT 100,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (student_id, exam_id, subject)
);

CREATE INDEX IF NOT EXISTS idx_marks_student ON exam_marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_exam    ON exam_marks(exam_id);

-- ── TEACHERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
  teacher_id        TEXT        PRIMARY KEY
                    DEFAULT 'TCH-' || LPAD(NEXTVAL('teachers_id_seq')::TEXT, 4, '0'),
  full_name         TEXT        NOT NULL,
  subject           TEXT        NOT NULL,
  class_assigned    TEXT,
  phone             TEXT,
  email             TEXT,
  qualification     TEXT,
  experience_years  INTEGER     DEFAULT 0,
  basic_salary      NUMERIC(10,2) DEFAULT 0,
  join_date         DATE        DEFAULT CURRENT_DATE,
  status            TEXT        DEFAULT 'Active'
                    CHECK (status IN ('Active','On Leave','Inactive')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teachers_subject ON teachers(subject);
CREATE INDEX IF NOT EXISTS idx_teachers_status  ON teachers(status);

-- ── SALARY PAYMENTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_payments (
  pay_id            SERIAL      PRIMARY KEY,
  teacher_id        TEXT        NOT NULL REFERENCES teachers(teacher_id),
  pay_month         TEXT        NOT NULL,   -- format: YYYY-MM
  basic             NUMERIC(10,2) DEFAULT 0,
  hra               NUMERIC(10,2) DEFAULT 0,
  da_allowance      NUMERIC(10,2) DEFAULT 0,
  bonus             NUMERIC(10,2) DEFAULT 0,
  pf_deduction      NUMERIC(10,2) DEFAULT 0,
  tax_deduction     NUMERIC(10,2) DEFAULT 0,
  other_deductions  NUMERIC(10,2) DEFAULT 0,
  net_pay           NUMERIC(10,2) GENERATED ALWAYS AS
                    (basic + hra + da_allowance + bonus - pf_deduction - tax_deduction - other_deductions) STORED,
  payment_mode      TEXT        DEFAULT 'Bank Transfer',
  pay_date          DATE        DEFAULT CURRENT_DATE,
  status            TEXT        DEFAULT 'Pending'
                    CHECK (status IN ('Paid','Pending','On Hold')),
  remarks           TEXT,
  UNIQUE (teacher_id, pay_month)
);

CREATE INDEX IF NOT EXISTS idx_salary_month   ON salary_payments(pay_month);
CREATE INDEX IF NOT EXISTS idx_salary_teacher ON salary_payments(teacher_id);

-- ── PROMOTIONS LOG ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  promo_id       SERIAL      PRIMARY KEY,
  student_id     TEXT        NOT NULL REFERENCES students(student_id),
  from_class     TEXT        NOT NULL,
  from_section   TEXT,
  promoted_to    TEXT        NOT NULL,
  to_section     TEXT,
  academic_year  TEXT        NOT NULL,
  promoted_on    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Auto-update updated_at trigger ───────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_teachers_updated_at
  BEFORE UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Sample data ───────────────────────────────────────────────
INSERT INTO exams (exam_name, exam_type, classes_applicable, start_date, end_date, max_marks, pass_mark)
VALUES
  ('Midterm 2026',      'Midterm',   'All', '2026-02-15', '2026-02-25', 100, 35),
  ('Annual Exam 2025',  'Annual',    'All', '2025-11-10', '2025-11-25', 100, 35),
  ('Unit Test 3',       'Unit Test', 'All', '2025-12-05', '2025-12-07',  20,  7)
ON CONFLICT DO NOTHING;

-- ── Verify ────────────────────────────────────────────────────
SELECT tablename AS "Table Created"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
