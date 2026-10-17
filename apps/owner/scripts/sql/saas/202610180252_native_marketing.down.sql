BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$ BEGIN
 IF current_setting('celebix.allow_native_marketing252_down',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'NATIVE_MARKETING252_DOWN_NOT_APPROVED';END IF;
 LOCK TABLE saas.native_marketing_deliveries,saas.native_marketing_campaigns,saas.native_marketing_settings,saas.native_marketing_templates,saas.native_marketing_operations,saas.native_marketing_suppressions,saas.native_marketing_provider_events,saas.native_marketing_store_limits,saas.native_marketing_sender_budget,saas.native_marketing_sender_attempts,saas.abandoned_cart_recovery_tokens IN EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM saas.abandoned_cart_recovery_tokens WHERE issued_by_delivery_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM saas.native_marketing_sender_attempts) OR EXISTS(SELECT 1 FROM saas.native_marketing_sender_budget WHERE daily_limit<>90 OR monthly_limit<>2900 OR blocked_until IS NOT NULL OR blocked_reason IS NOT NULL)
 OR EXISTS(SELECT 1 FROM saas.native_marketing_deliveries) OR EXISTS(SELECT 1 FROM saas.native_marketing_campaigns)
 OR EXISTS(SELECT 1 FROM saas.native_marketing_settings) OR EXISTS(SELECT 1 FROM saas.native_marketing_templates)
 OR EXISTS(SELECT 1 FROM saas.native_marketing_operations) OR EXISTS(SELECT 1 FROM saas.native_marketing_suppressions)
 OR EXISTS(SELECT 1 FROM saas.native_marketing_provider_events) OR EXISTS(SELECT 1 FROM saas.native_marketing_store_limits)
 THEN RAISE EXCEPTION 'NATIVE_MARKETING252_DOWN_DATA_CHANGED';END IF;
END $guard$;
ALTER TABLE saas.abandoned_cart_recovery_tokens DROP CONSTRAINT abandoned_cart_recovery_tokens_exact_issuer;
ALTER TABLE saas.abandoned_cart_recovery_tokens DROP CONSTRAINT abandoned_cart_recovery_tokens_delivery_store_fk;
ALTER TABLE saas.abandoned_cart_recovery_tokens DROP COLUMN issued_by_delivery_id;
ALTER TABLE saas.abandoned_cart_recovery_tokens ALTER COLUMN created_by_membership_id SET NOT NULL;
DROP INDEX saas.native_marketing_cart_candidates_idx;
DROP TABLE saas.native_marketing_sender_attempts,saas.native_marketing_sender_budget,saas.native_marketing_provider_events,saas.native_marketing_suppressions,saas.native_marketing_operations,saas.native_marketing_deliveries,saas.native_marketing_campaigns,saas.native_marketing_templates,saas.native_marketing_settings,saas.native_marketing_store_limits;
DO $functions$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'native_marketing_%' LOOP EXECUTE format('DROP FUNCTION %s',f.signature);END LOOP;
END $functions$;
COMMIT;
