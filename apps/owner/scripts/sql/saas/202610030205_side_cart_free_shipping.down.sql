BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- The published design owns this optional policy. Existing shipping settings,
-- merchant data, drafts, order snapshots and provider configuration are untouched.
-- Reject automatic rollback after a merchant has adopted the new schema.
-- Recovery must preserve the affected design/operation history explicitly.
LOCK TABLE saas.storefront_designs IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_records IN SHARE ROW EXCLUSIVE MODE;
DO $restore$ DECLARE backup record; actual text; BEGIN
 IF EXISTS(SELECT 1 FROM saas.storefront_designs WHERE draft_config->'composition'->'cart'?'freeShippingThresholdCents' OR published_config->'composition'->'cart'?'freeShippingThresholdCents')
  OR EXISTS(SELECT 1 FROM saas.merchant_admin_records WHERE record_kind='starter_theme_composition' AND config->'cart'?'freeShippingThresholdCents')
  OR EXISTS(SELECT 1 FROM saas.storefront_design_operations WHERE result_payload::text LIKE '%"freeShippingThresholdCents"%')
 THEN RAISE EXCEPTION 'SIDE_CART_FREE_SHIPPING_ROLLBACK_REQUIRES_DATA_RECOVERY'; END IF;
 FOR backup IN SELECT * FROM saas.side_cart_free_shipping_backup LOOP
  SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(backup.identity)) INTO actual;
  IF actual IS DISTINCT FROM backup.migrated_definition THEN RAISE EXCEPTION 'SIDE_CART_FREE_SHIPPING_DOWN_DEFINITION_CHANGED: %',backup.identity; END IF;
 END LOOP;
 FOR backup IN SELECT * FROM saas.side_cart_free_shipping_backup LOOP EXECUTE backup.definition; END LOOP;
END $restore$;
DROP FUNCTION saas.storefront_shipping_for_subtotal(uuid,bigint);
DROP FUNCTION saas.c205_composition_predecessor(jsonb);
DROP TABLE saas.side_cart_free_shipping_backup;
COMMIT;
