BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.merchant_admin_records WHERE record_kind='general_setting' AND config ? 'skuPrefix') THEN
    RAISE EXCEPTION 'store_sku_prefix_settings_must_be_removed_before_downgrade';
  END IF;
  IF EXISTS(SELECT 1 FROM saas.product_variants WHERE sku IS NOT NULL GROUP BY store_id,sku HAVING pg_catalog.count(*)>1) THEN
    RAISE EXCEPTION 'shared_variant_skus_must_be_resolved_before_downgrade';
  END IF;
END
$guard$;

CREATE UNIQUE INDEX product_variants_store_sku_key ON saas.product_variants(store_id,sku) WHERE sku IS NOT NULL;
DROP INDEX saas.product_variants_store_sku_lookup_idx;
DROP TRIGGER product_variants_sku_owner_guard ON saas.product_variants;
DROP FUNCTION saas.guard_product_variant_sku_owner();

DO $rewrite$
DECLARE target regprocedure; definition text; old_text text; new_text text;
BEGIN
  FOR target,old_text,new_text IN
    SELECT 'saas.catalog_create_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure,
      'variant.store_id = p_store_id AND variant.sku = p_sku AND variant.product_id <> p_product_id',
      'variant.store_id = p_store_id AND variant.sku = p_sku'
    UNION ALL SELECT 'saas.catalog_update_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure,
      'variant.store_id = p_store_id AND variant.sku = p_sku AND variant.product_id <> p_product_id',
      'variant.store_id = p_store_id AND variant.sku = p_sku AND variant.id <> p_variant_id'
    UNION ALL SELECT 'saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)'::regprocedure,
      'EXISTS(SELECT 1 FROM saas.product_variants AS variant WHERE variant.store_id=p_store_id AND variant.sku=selected_sku AND variant.product_id<>p_product_id)',
      'selected_sku=ANY(seen_skus) OR EXISTS(SELECT 1 FROM saas.product_variants AS variant WHERE variant.store_id=p_store_id AND variant.sku=selected_sku)'
  LOOP
    definition:=pg_catalog.pg_get_functiondef(target);
    IF pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_text,''))<>pg_catalog.length(old_text) THEN
      RAISE EXCEPTION 'SKU_FUNCTION_SOURCE_CHANGED: %',target;
    END IF;
    EXECUTE pg_catalog.replace(definition,old_text,new_text);
  END LOOP;
END
$rewrite$;

DROP FUNCTION saas.catalog_onboard_product_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb);
DROP FUNCTION saas.catalog_get_onboarding_options_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz);
DROP FUNCTION saas.merchant_admin_config_valid(text,jsonb);
ALTER FUNCTION saas.merchant_admin_config_valid_without_sku_prefix(text,jsonb) RENAME TO merchant_admin_config_valid;
REVOKE ALL ON FUNCTION saas.merchant_admin_config_valid(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_config_valid(text,jsonb) TO celebix_saas_app;

COMMIT;
