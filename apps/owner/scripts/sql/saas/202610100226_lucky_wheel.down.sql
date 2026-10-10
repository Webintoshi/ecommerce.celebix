-- Pre-use rollback only. Issued coupons always retain native226 readers.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.lucky_wheel_campaigns,saas.lucky_wheel_awards IN ACCESS EXCLUSIVE MODE;
DO $safe$ BEGIN
 IF EXISTS(SELECT 1 FROM saas.lucky_wheel_campaigns) OR EXISTS(SELECT 1 FROM saas.lucky_wheel_awards) OR EXISTS(SELECT 1 FROM saas.email_marketing_consent_events WHERE source='lucky_wheel') THEN RAISE EXCEPTION 'LUCKY_WHEEL_ROLLBACK_REFUSED_AFTER_USE';END IF;
 IF(SELECT count(*) FROM saas.lucky_wheel_function_baseline)<>6 OR EXISTS(SELECT 1 FROM saas.lucky_wheel_function_baseline b LEFT JOIN pg_proc p ON p.oid=to_regprocedure(b.identity) WHERE p.oid IS NULL OR md5(pg_get_functiondef(p.oid))<>b.patched_hash OR md5(b.original_definition)<>b.original_hash OR p.proowner<>b.owner_oid OR p.proacl::text IS DISTINCT FROM b.acl) THEN RAISE EXCEPTION 'LUCKY_WHEEL_ROLLBACK_NATIVE_DRIFT';END IF;
END $safe$;
DO $restore$ DECLARE r record;BEGIN FOR r IN SELECT * FROM saas.lucky_wheel_function_baseline ORDER BY identity LOOP EXECUTE r.original_definition;IF(SELECT md5(pg_get_functiondef(oid))<>r.original_hash OR proowner<>r.owner_oid OR proacl::text IS DISTINCT FROM r.acl FROM pg_proc WHERE oid=to_regprocedure(r.identity)) THEN RAISE EXCEPTION 'LUCKY_WHEEL_ROLLBACK_RESTORE_DRIFT';END IF;END LOOP;END $restore$;
DROP TRIGGER lucky_wheel_managed_parent ON saas.promotions;
DROP TRIGGER lucky_wheel_managed_versions ON saas.promotion_versions;
DROP TRIGGER lucky_wheel_managed_codes ON saas.promotion_codes;
DROP TRIGGER lucky_wheel_managed_batches ON saas.promotion_code_batches;
DROP TRIGGER lucky_wheel_managed_targets ON saas.promotion_targets;
ALTER TABLE saas.email_marketing_consent_events DROP CONSTRAINT email_marketing_consent_events_source_check;
ALTER TABLE saas.email_marketing_consent_events ADD CONSTRAINT email_marketing_consent_events_source_check CHECK(source IN('newsletter','customer','cart_capture','provider'));
-- Drop entrypoints before their private typed row dependencies; no CASCADE into native coupon engine.
DO $functions$ DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'lucky_wheel_%' AND proname NOT IN('lucky_wheel_config_valid','lucky_wheel_rule_eligible_v1','lucky_wheel_immutable') ORDER BY CASE WHEN proname IN('lucky_wheel_label_v1','lucky_wheel_money_v1','lucky_wheel_blocked_v1','lucky_wheel_random_bps_v1') THEN 1 ELSE 0 END LOOP EXECUTE format('DROP FUNCTION %s',r.signature);END LOOP;END $functions$;
DROP TABLE saas.lucky_wheel_request_limits;
DROP TABLE saas.lucky_wheel_events;
DROP TABLE saas.lucky_wheel_admin_operations;
DROP TABLE saas.lucky_wheel_awards;
DROP TABLE saas.lucky_wheel_rewards;
DROP TABLE saas.lucky_wheel_prize_counters;
DROP TABLE saas.lucky_wheel_campaign_versions;
DROP TABLE saas.lucky_wheel_campaigns;
DROP TABLE saas.lucky_wheel_function_baseline;
DROP FUNCTION saas.lucky_wheel_immutable();
DROP FUNCTION saas.lucky_wheel_config_valid(jsonb);
DROP FUNCTION saas.lucky_wheel_rule_eligible_v1(jsonb);
COMMIT;
