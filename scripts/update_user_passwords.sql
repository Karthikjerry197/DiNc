-- ============================================================================
-- DiNC — Milestone 1: Replace TEMP_HASH password values with real bcrypt hashes
-- ----------------------------------------------------------------------------
-- Target table : public.users  (existing schema — NOT modified by this script)
-- Operation    : UPDATE password_hash for four seeded accounts.
-- Hash format  : bcrypt $2b$, cost factor 10 (matches backend bcrypt.compare).
--
-- This is a DATA update only. It performs NO schema changes (no CREATE / ALTER /
-- DROP). Each statement only touches rows whose password_hash is still the
-- placeholder literal 'TEMP_HASH', so re-running it is safe and idempotent.
--
-- Plaintext credentials (for reference only — do NOT store in the database):
--   admin         : Admin@123
--   clinician1    : Clinician@123
--   caremanager1  : CareManager1@123
--   caremanager2  : CareManager2@123
--
-- Review before executing. This script is provided for manual execution and is
-- intentionally NOT run by the application.
-- ============================================================================

BEGIN;

UPDATE public.users
SET password_hash = '$2b$10$qlG6B0SMA9cyRq8CRnYumuxM87jciUSjjpBieVkU7q084D9r2FSI.',
    updated_at = now()
WHERE username = 'admin'
  AND password_hash = 'TEMP_HASH';

UPDATE public.users
SET password_hash = '$2b$10$qBEpQnE/nbVYyeyTC.YdF.sK9JtROrsEcLQRZWm5Iw2llVn6irhWi',
    updated_at = now()
WHERE username = 'clinician1'
  AND password_hash = 'TEMP_HASH';

UPDATE public.users
SET password_hash = '$2b$10$f03EKTMsuUacD7r4lU3S.OOY4kXb0BHLoXXmQJu6Kr/pnyIFbkVmW',
    updated_at = now()
WHERE username = 'caremanager1'
  AND password_hash = 'TEMP_HASH';

UPDATE public.users
SET password_hash = '$2b$10$v1dUGqOqnYBl7ZEaExKdtug74xl93brofx4mrnjNiUxrudY4j9PTa',
    updated_at = now()
WHERE username = 'caremanager2'
  AND password_hash = 'TEMP_HASH';

-- Verify the four accounts no longer carry the placeholder hash:
--   SELECT username, left(password_hash, 7) AS hash_prefix, is_active
--   FROM public.users
--   WHERE username IN ('admin', 'clinician1', 'caremanager1', 'caremanager2');

COMMIT;
