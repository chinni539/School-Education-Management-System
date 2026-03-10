-- ============================================================
--  EduCore — Migration Script
--  Run this in Supabase → SQL Editor → New Query → Run
--  Safe to run on existing database (uses IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- ── 1. Add academic_year to students table ────────────────────
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '2025-2026',
  ADD COLUMN IF NOT EXISTS roll_number   TEXT,
  ADD COLUMN IF NOT EXISTS nationality   TEXT DEFAULT 'Indian',
  ADD COLUMN IF NOT EXISTS prev_school   TEXT,
  ADD COLUMN IF NOT EXISTS occupation    TEXT,
  ADD COLUMN IF NOT EXISTS alt_phone     TEXT,
  ADD COLUMN IF NOT EXISTS relation      TEXT DEFAULT 'Father';

-- ── 2. Add academic_year to fees table ───────────────────────
ALTER TABLE fees
  ADD COLUMN IF NOT EXISTS academic_year TEXT DEFAULT '2025-2026';

-- ── 3. Update fees status check to auto-set Paid ─────────────
-- Drop old constraint and recreate (safe)
ALTER TABLE fees DROP CONSTRAINT IF EXISTS fees_status_check;
ALTER TABLE fees ADD CONSTRAINT fees_status_check
  CHECK (status IN ('Paid','Pending','Partial','Waived'));

-- ── 4. Create fee_structure table ────────────────────────────
CREATE TABLE IF NOT EXISTS fee_structure (
  fs_id           SERIAL       PRIMARY KEY,
  academic_year   TEXT         NOT NULL,
  class           TEXT         NOT NULL,
  section         TEXT         DEFAULT '',
  school_fee      NUMERIC(10,2) DEFAULT 0,
  admission_fee   NUMERIC(10,2) DEFAULT 0,
  exam_fee        NUMERIC(10,2) DEFAULT 0,
  transport_fee   NUMERIC(10,2) DEFAULT 0,
  books_fee       NUMERIC(10,2) DEFAULT 0,
  other_fees      NUMERIC(10,2) DEFAULT 0,
  total_fee       NUMERIC(10,2) GENERATED ALWAYS AS
                  (school_fee + admission_fee + exam_fee + transport_fee + books_fee + other_fees) STORED,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (academic_year, class, section)
);

CREATE INDEX IF NOT EXISTS idx_fs_year_class ON fee_structure(academic_year, class);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER trg_fee_structure_updated_at
  BEFORE UPDATE ON fee_structure
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 5. Verify all tables ──────────────────────────────────────
SELECT tablename AS "Table", 
       (SELECT COUNT(*) FROM information_schema.columns 
        WHERE table_name = pg_tables.tablename 
        AND table_schema = 'public') AS "Columns"
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
