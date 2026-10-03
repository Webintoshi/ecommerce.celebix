-- Retain audit/provenance whenever support or sales policy has been used.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $rollback$
DECLARE row record;
BEGIN
 IF EXISTS(SELECT 1 FROM saas.platform_support_sessions) OR EXISTS(SELECT 1 FROM saas.store_sales_policy) THEN RAISE EXCEPTION 'PLATFORM_SUPPORT_ROLLBACK_REQUIRES_DATA_RECOVERY'; END IF;
 FOR row IN SELECT signature,definition FROM saas.platform_support_function_backup LOOP EXECUTE row.definition; END LOOP;
 FOR row IN SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND t.tgname='platform_support_atomic_journal' LOOP EXECUTE format('DROP TRIGGER platform_support_atomic_journal ON saas.%I',row.relname); END LOOP;
END $rollback$;
ALTER POLICY memberships_principal_discovery ON saas.memberships USING (principal_id = nullif(current_setting('app.current_principal_id',true),'')::uuid AND status='active');
DROP VIEW saas.platform_authorized_memberships,saas.platform_normal_memberships,saas.platform_provenance_memberships;
DROP INDEX saas.memberships_normal_principal_store;
ALTER TABLE saas.memberships DROP COLUMN support_session_id;
ALTER TABLE saas.memberships ADD CONSTRAINT memberships_principal_store_key UNIQUE(principal_id,store_id);
DO $functions$ DECLARE f record; BEGIN FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND (p.proname LIKE 'platform_support_%' OR p.proname LIKE 'platform_sales_%' OR p.proname IN ('platform_membership_is_authorized','platform_new_sales_allowed')) LOOP EXECUTE format('DROP FUNCTION %s',f.oid::regprocedure); END LOOP; END $functions$;
DROP TABLE saas.platform_support_write_journal,saas.platform_support_sessions,saas.platform_support_function_backup,saas.store_sales_policy;
REVOKE USAGE ON SCHEMA saas FROM celebix_saas_support_runtime;
COMMIT;
-- Role stays NOLOGIN so external membership grants can be reviewed separately.
