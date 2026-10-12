-- Rollback requires explicit disabled policy; never restore bypasses while active.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $f$ DECLARE r record;BEGIN
 IF EXISTS(SELECT 1 FROM saas.admin_login_policy WHERE enabled) OR EXISTS(SELECT 1 FROM saas.admin_login_store_policy WHERE enabled) THEN RAISE EXCEPTION 'ADMIN_MFA_ROLLBACK_REQUIRES_DISABLED_POLICY';END IF;
 FOR r IN SELECT definition FROM saas.admin_login_original_functions LOOP EXECUTE r.definition;END LOOP;
END $f$;
DROP TRIGGER admin_login_session_guard ON saas.panel_sessions;
DROP TRIGGER admin_login_store_policy_cutover ON saas.admin_login_store_policy;
DROP TRIGGER admin_login_policy_cutover ON saas.admin_login_policy;
DROP FUNCTION saas.admin_login_security_command(text,jsonb);
DROP FUNCTION saas.admin_login_cleanup_expired_completions();
DROP FUNCTION saas.admin_login_security_invalidate(jsonb);
DROP FUNCTION saas.admin_login_projection(uuid);
DROP FUNCTION saas.admin_login_guard_session();
DROP FUNCTION saas.admin_login_capture_cutover();
DROP FUNCTION saas.admin_login_session_allowed(text,text,boolean);
DROP FUNCTION saas.admin_login_principal_enforced(uuid,uuid);
DROP FUNCTION saas.admin_login_policy_enabled(uuid);
DROP TABLE saas.admin_login_management_operations,saas.admin_login_original_functions,saas.admin_login_events,saas.admin_login_assurance,saas.admin_login_backups,saas.admin_login_trust,saas.admin_login_otp,saas.admin_login_pending,saas.admin_login_factors,saas.admin_login_store_policy,saas.admin_login_policy;
COMMIT;
