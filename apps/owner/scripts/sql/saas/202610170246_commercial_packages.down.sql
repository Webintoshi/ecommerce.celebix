-- Empty-only rollback; no published commercial subscription, request or reserved payment can be erased.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.commercial.release246',0));
DO $safe$BEGIN
 IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE plan_id IN(SELECT plan_id FROM saas.commercial_plan_policies)) OR EXISTS(SELECT 1 FROM saas.commercial_upgrade_requests) OR EXISTS(SELECT 1 FROM saas.commercial_order_reservations) THEN RAISE EXCEPTION 'COMMERCIAL246_FORWARD_RECOVERY_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM saas.commercial246_original_functions WHERE encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(signature)),'UTF8')),'hex')<>published_sha256) THEN RAISE EXCEPTION 'COMMERCIAL246_DOWN_FUNCTION_DRIFT';END IF;
END $safe$;
DO $triggers$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['products','product_variants','memberships','merchant_phone_staff','product_media','store_media_operations','storefront_assets'] LOOP EXECUTE format('DROP TRIGGER commercial246_capacity_lock ON saas.%I',t);EXECUTE format('DROP TRIGGER commercial246_capacity ON saas.%I',t);END LOOP;
 FOREACH t IN ARRAY ARRAY['orders','payment_attempts','checkout_payment_attempts','storefront_hosted_checkout_sessions','quick_order_hosted_payment_bridges','in_store_sales'] LOOP EXECUTE format('DROP TRIGGER commercial246_quota ON saas.%I',t);END LOOP;
END $triggers$;
DO $restore$DECLARE f record;BEGIN FOR f IN SELECT * FROM saas.commercial246_original_functions LOOP EXECUTE f.definition;END LOOP;END $restore$;
DROP FUNCTION IF EXISTS saas.commercial_default_starter_version();
DROP FUNCTION saas.commercial_plan_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.commercial_upgrade_request(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.commercial_quota_guard(),saas.commercial_capacity_after(),saas.commercial_capacity_lock(),saas.commercial_capacity_changed(text,jsonb,jsonb),saas.commercial_request_projection(uuid,boolean),saas.commercial_reserve_order(uuid,text,uuid,timestamptz,boolean),saas.commercial_usage(uuid,timestamptz),saas.commercial_month(uuid,timestamptz),saas.commercial_current_plan(uuid),saas.commercial_plan_has_capability(uuid,text);
CREATE TEMP TABLE commercial246_plan_ids AS SELECT plan_id FROM saas.commercial_plan_policies;
DROP TABLE saas.commercial_order_reservations,saas.commercial_upgrade_requests,saas.commercial_plan_policies;
ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
ALTER TABLE saas.plan_limits DISABLE TRIGGER plan_limits_immutable;
ALTER TABLE saas.plans DISABLE TRIGGER plan_versions_immutable;
ALTER TABLE saas.platform_plan_prices DISABLE TRIGGER platform_append_only;
DELETE FROM saas.plan_features WHERE plan_id IN(SELECT plan_id FROM commercial246_plan_ids);
DELETE FROM saas.plan_limits WHERE plan_id IN(SELECT plan_id FROM commercial246_plan_ids);
DELETE FROM saas.platform_plan_prices WHERE plan_id IN(SELECT plan_id FROM commercial246_plan_ids);
DELETE FROM saas.plans WHERE id IN(SELECT plan_id FROM commercial246_plan_ids);
ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;
ALTER TABLE saas.plan_limits ENABLE TRIGGER plan_limits_immutable;
ALTER TABLE saas.plans ENABLE TRIGGER plan_versions_immutable;
ALTER TABLE saas.platform_plan_prices ENABLE TRIGGER platform_append_only;
DROP TABLE saas.commercial246_original_functions,saas.commercial_package_release_state;
COMMIT;
