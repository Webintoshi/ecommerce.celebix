-- Rollback is allowed only while revision248 is staged and unused.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.commercial.release248',0));
DO $restore$DECLARE r record;new_ids uuid[]:=ARRAY['00000000-0000-4000-8000-000000000007'::uuid,'00000000-0000-4000-8000-000000000008'::uuid,'00000000-0000-4000-8000-000000000009'::uuid,'00000000-0000-4000-8000-000000000010'::uuid];BEGIN
 IF (SELECT enabled FROM saas.commercial248_release_state WHERE singleton) IS DISTINCT FROM false OR EXISTS(SELECT 1 FROM saas.subscriptions WHERE plan_id=ANY(new_ids)) OR EXISTS(SELECT 1 FROM saas.commercial_upgrade_requests WHERE plan_id=ANY(new_ids)) THEN RAISE EXCEPTION 'COMMERCIAL248_ROLLBACK_IN_USE';END IF;
 FOR r IN SELECT * FROM saas.commercial248_original_functions LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=r.function_oid AND p.oid=to_regprocedure(r.signature) AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=r.published_sha256 AND p.proowner=r.function_owner AND p.proacl IS NOT DISTINCT FROM r.function_acl AND p.proconfig IS NOT DISTINCT FROM r.function_config) OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')<>r.original_sha256 THEN RAISE EXCEPTION 'COMMERCIAL248_ROLLBACK_SOURCE_DRIFT:%',r.signature;END IF;
 END LOOP;
 FOR r IN SELECT * FROM saas.commercial248_original_functions LOOP
  EXECUTE r.definition;
  IF encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(r.signature)),'UTF8')),'hex')<>r.original_sha256 THEN RAISE EXCEPTION 'COMMERCIAL248_RESTORE_MISMATCH:%',r.signature;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM(VALUES('saas.plans'::regclass,'plan_versions_immutable'),('saas.plan_features'::regclass,'plan_features_immutable'),('saas.plan_limits'::regclass,'plan_limits_immutable'),('saas.platform_plan_prices'::regclass,'platform_append_only'),('saas.commercial_plan_policies'::regclass,'commercial_policy_immutable'))expected(rel,name)LEFT JOIN pg_trigger t ON t.tgrelid=expected.rel AND t.tgname=expected.name WHERE t.oid IS NULL OR t.tgenabled<>'O')THEN RAISE EXCEPTION 'COMMERCIAL248_SEAL_DRIFT';END IF;
 ALTER TABLE saas.plans DISABLE TRIGGER plan_versions_immutable;
 ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
 ALTER TABLE saas.plan_limits DISABLE TRIGGER plan_limits_immutable;
 ALTER TABLE saas.platform_plan_prices DISABLE TRIGGER platform_append_only;
 ALTER TABLE saas.commercial_plan_policies DISABLE TRIGGER commercial_policy_immutable;
 DELETE FROM saas.commercial_plan_policies WHERE plan_id=ANY(new_ids);
 DELETE FROM saas.platform_plan_prices WHERE plan_id=ANY(new_ids);
 DELETE FROM saas.plan_features WHERE plan_id=ANY(new_ids);
 DELETE FROM saas.plan_limits WHERE plan_id=ANY(new_ids);
 DELETE FROM saas.plans WHERE id=ANY(new_ids);
 ALTER TABLE saas.plans ENABLE TRIGGER plan_versions_immutable;
 ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;
 ALTER TABLE saas.plan_limits ENABLE TRIGGER plan_limits_immutable;
 ALTER TABLE saas.platform_plan_prices ENABLE TRIGGER platform_append_only;
 ALTER TABLE saas.commercial_plan_policies ENABLE TRIGGER commercial_policy_immutable;
END $restore$;
DROP FUNCTION saas.commercial248_receipt_in_store_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,boolean),saas.commercial248_receipt_quick_link_merchant_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.commercial248_plan_selectable(uuid);
DROP TABLE saas.commercial248_release_state,saas.commercial248_original_functions;
DO $payment$BEGIN
 IF saas.built_in_payment_methods_preflight() IS DISTINCT FROM true OR saas.payment_provider_keyed_lifecycle_preflight() IS DISTINCT FROM true OR saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true OR saas.quick_order_hosted_payment_authority_preflight() IS DISTINCT FROM true OR saas.shipping_provider_preflight() IS DISTINCT FROM true THEN RAISE EXCEPTION 'COMMERCIAL248_PAYMENT_PREFLIGHT';END IF;
END $payment$;
COMMIT;
