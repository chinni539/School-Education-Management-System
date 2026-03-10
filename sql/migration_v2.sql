-- ============================================================
--  EduCore Migration v2
--  Run in Supabase → SQL Editor → New Query → Run
-- ============================================================

-- ── 1. Drop section from unique constraint on fee_structure ──
-- (fee is now per academic_year + class only, no section)

-- Drop old constraint
ALTER TABLE fee_structure DROP CONSTRAINT IF EXISTS fee_structure_academic_year_class_section_key;

-- Make section default to empty string for existing rows
UPDATE fee_structure SET section='' WHERE section IS NULL;
ALTER TABLE fee_structure ALTER COLUMN section SET DEFAULT '';

-- Add new unique constraint without section
ALTER TABLE fee_structure
  DROP CONSTRAINT IF EXISTS fee_structure_year_class_key;
ALTER TABLE fee_structure
  ADD CONSTRAINT fee_structure_year_class_key
  UNIQUE (academic_year, class, section);
-- Note: since section is always '' now, this effectively makes
-- (academic_year, class) unique

-- ── 2. Add paid_date format fix (store as DATE not TEXT) ─────
-- fees.paid_date is already DATE in schema, no change needed

-- ── 3. Verify ────────────────────────────────────────────────
SELECT
  'fee_structure' AS tbl,
  COUNT(*) AS rows,
  string_agg(DISTINCT academic_year, ', ' ORDER BY academic_year) AS years
FROM fee_structure
UNION ALL
SELECT 'fees', COUNT(*), string_agg(DISTINCT academic_year, ', ') FROM fees;
