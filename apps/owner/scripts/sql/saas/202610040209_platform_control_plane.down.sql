-- Roll back only an unused installation. Never erase financial/audit history or published plans.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $preflight$ BEGIN
 IF EXISTS(SELECT 1 FROM saas.platform_audit) OR EXISTS(SELECT 1 FROM saas.platform_billing_periods) OR EXISTS(SELECT 1 FROM saas.platform_billing_adjustments) OR EXISTS(SELECT 1 FROM saas.platform_receipts) OR EXISTS(SELECT 1 FROM saas.platform_receipt_reversals) OR EXISTS(SELECT 1 FROM saas.platform_ownership_invitations) OR EXISTS(SELECT 1 FROM saas.platform_command_results) THEN RAISE EXCEPTION 'PLATFORM_ROLLBACK_HAS_HISTORY_FORWARD_RECOVERY_REQUIRED';END IF;
 IF to_regclass('saas.platform_support_sessions') IS NOT NULL OR to_regclass('saas.store_sales_policy') IS NOT NULL THEN RAISE EXCEPTION 'PLATFORM_ROLLBACK_REMOVE_210_FIRST';END IF;
END $preflight$;
DO $restore$ DECLARE d text;BEGIN SELECT definition INTO STRICT d FROM saas.platform_209_restore WHERE signature='saas.reject_plan_version_mutation()';EXECUTE replace(d,'CREATE FUNCTION','CREATE OR REPLACE FUNCTION');END $restore$;
DROP TRIGGER platform_last_owner_guard ON saas.memberships;
DROP FUNCTION saas.platform_ownership_accept_context(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.platform_ownership_accept(text,text,text);
DROP FUNCTION saas.platform_command(uuid,text,jsonb,bigint,text);
DROP FUNCTION saas.platform_read(uuid,text,jsonb);
DROP FUNCTION saas.platform_store_projection(uuid,boolean);
DROP FUNCTION saas.platform_merchant_sales_projection(uuid);
DROP FUNCTION saas.platform_period_projection(uuid);
DROP FUNCTION saas.platform_subscription_projection(uuid);
DROP FUNCTION saas.platform_store_usage(uuid);
DROP FUNCTION saas.platform_last_owner_guard();
DROP FUNCTION saas.platform_operator_resolve(text,text);
DROP FUNCTION saas.platform_operator_require_active(uuid);
DROP TABLE saas.platform_receipt_reversals,saas.platform_receipts,saas.platform_billing_adjustments,saas.platform_billing_periods,saas.platform_audit,saas.platform_command_results,saas.platform_ownership_invitations,saas.platform_plan_publications,saas.platform_plan_prices,saas.platform_209_restore,saas.platform_store_versions,saas.platform_operators;
DROP FUNCTION saas.platform_append_only();
DROP FUNCTION saas.platform_operator_identity_guard();
REVOKE USAGE ON SCHEMA saas FROM celebix_saas_platform_operator;
RESET ROLE;
-- Roles are cluster-wide. Preserve a role still used by another isolated/production DB or a provisioned login.
DO $role_cleanup$ DECLARE r oid;BEGIN SELECT oid INTO r FROM pg_roles WHERE rolname='celebix_saas_platform_operator';IF r IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r) AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=r OR member=r) THEN DROP ROLE celebix_saas_platform_operator;END IF;END $role_cleanup$;
COMMIT;
