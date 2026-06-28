-- PROPOSAL ONLY - DO NOT APPLY TO PRODUCTION YET
-- Phase 2C rollback proposal for a future self-serve registry mirror apply.
-- Safe only before runtime cutover. Existing owner_* tables are intentionally untouched.

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- Pre-rollback review checks. Row counts should be captured separately before rollback.
SELECT 'stores' AS table_name, to_regclass('public.stores') IS NOT NULL AS table_exists;
SELECT 'store_domains' AS table_name, to_regclass('public.store_domains') IS NOT NULL AS table_exists;
SELECT 'store_memberships' AS table_name, to_regclass('public.store_memberships') IS NOT NULL AS table_exists;
SELECT 'store_invitations' AS table_name, to_regclass('public.store_invitations') IS NOT NULL AS table_exists;
SELECT 'store_onboarding_sessions' AS table_name, to_regclass('public.store_onboarding_sessions') IS NOT NULL AS table_exists;
SELECT 'store_provisioning_jobs' AS table_name, to_regclass('public.store_provisioning_jobs') IS NOT NULL AS table_exists;
SELECT 'store_billing_accounts' AS table_name, to_regclass('public.store_billing_accounts') IS NOT NULL AS table_exists;

-- Drop only new self-serve registry tables in dependency order.
DROP TABLE IF EXISTS public.store_billing_accounts;
DROP TABLE IF EXISTS public.store_provisioning_jobs;
DROP TABLE IF EXISTS public.store_onboarding_sessions;
DROP TABLE IF EXISTS public.store_invitations;
DROP TABLE IF EXISTS public.store_memberships;
DROP TABLE IF EXISTS public.store_domains;
DROP TABLE IF EXISTS public.stores;

-- Existing legacy authority tables remain intact:
-- - public.owner_profiles
-- - public.owner_stores
-- - public.owner_store_access
-- - public.owner_store_secrets
-- - public.owner_cleanup_runs

COMMIT;
