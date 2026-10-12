BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $f$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['admin_login_policy','admin_login_store_policy','admin_login_factors','admin_login_pending','admin_login_otp','admin_login_trust','admin_login_backups','admin_login_assurance','admin_login_events','admin_login_management_operations','admin_login_original_functions'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relrowsecurity AND relforcerowsecurity AND relowner='celebix_saas_owner'::regrole) THEN RAISE EXCEPTION 'ADMIN_MFA_TABLE_AUTHORITY_DRIFT %',t;END IF;
 IF has_table_privilege('celebix_saas_identity','saas.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_table_privilege('celebix_saas_workflow','saas.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'ADMIN_MFA_TABLE_GRANT_DRIFT %',t;END IF;
 END LOOP;
 IF NOT has_function_privilege('celebix_saas_identity','saas.admin_login_security_command(text,jsonb)','EXECUTE') OR has_function_privilege('celebix_saas_app','saas.admin_login_security_command(text,jsonb)','EXECUTE') OR has_function_privilege('public','saas.admin_login_security_command(text,jsonb)','EXECUTE') OR has_function_privilege('celebix_saas_identity','saas.admin_login_security_invalidate(jsonb)','EXECUTE') OR NOT has_function_privilege('celebix_saas_workflow','saas.admin_login_security_invalidate(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'ADMIN_MFA_RPC_GRANT_DRIFT';END IF;
 IF has_function_privilege('celebix_saas_identity','saas.admin_login_cleanup_expired_completions()','EXECUTE') OR has_function_privilege('celebix_saas_workflow','saas.admin_login_cleanup_expired_completions()','EXECUTE') OR has_function_privilege('public','saas.admin_login_cleanup_expired_completions()','EXECUTE') THEN RAISE EXCEPTION 'ADMIN_MFA_CLEANUP_GRANT_DRIFT';END IF;
 IF (SELECT count(*) FROM saas.admin_login_original_functions)<>15 THEN RAISE EXCEPTION 'ADMIN_MFA_GUARD_COUNT_DRIFT';END IF;
END $f$;
ROLLBACK;
