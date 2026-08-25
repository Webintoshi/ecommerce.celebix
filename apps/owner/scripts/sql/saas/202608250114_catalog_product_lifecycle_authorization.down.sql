BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $rollback_guard$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.catalog_operations AS operation
    WHERE operation.operation_kind='restore_product'
  ) THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_LIFECYCLE_ROLLBACK_BLOCKED: restore ledger rows exist';
  END IF;
END
$rollback_guard$;

CREATE OR REPLACE FUNCTION saas.media_list_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_storage_bytes bigint,p_now timestamptz,p_product_id uuid,p_include_archived boolean
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.media_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_include_archived IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.products AS product
    WHERE product.id=p_product_id AND product.store_id=p_store_id AND product.status<>'archived'
  ) THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,COALESCE(
    pg_catalog.jsonb_agg(saas.media_projection(media.id) ORDER BY media.sort_order,media.id),'[]'::jsonb
  ) FROM saas.product_media AS media
  WHERE media.store_id=p_store_id AND media.product_id=p_product_id
    AND (p_include_archived OR media.status<>'archived');
END
$function$;

CREATE OR REPLACE FUNCTION saas.media_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_storage_bytes bigint,p_now timestamptz
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_storage_bytes IS NULL OR p_now IS NULL OR p_storage_bytes<0 THEN RETURN 'invalid_input'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores AS store WHERE store.id=p_store_id AND store.status='active') THEN RETURN 'store_inactive'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.memberships AS membership WHERE membership.id=p_membership_id AND membership.store_id=p_store_id AND membership.principal_id=p_principal_id AND membership.status='active' AND membership.role IN('store_owner','admin','editor')) THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.subscriptions AS subscription
    JOIN saas.plans AS plan ON plan.id=subscription.plan_id AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
    WHERE subscription.store_id=p_store_id AND subscription.plan_id=p_plan_id
      AND subscription.plan_code=p_plan_code AND subscription.plan_version=p_plan_version
      AND subscription.status='active' AND subscription.valid_from<=p_now
      AND (subscription.valid_until IS NULL OR subscription.valid_until>p_now)
      AND plan.status='active' AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR plan.valid_until>p_now)
  ) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.plan_features AS feature WHERE feature.plan_id=p_plan_id AND feature.feature_key='media' AND feature.enabled)
    OR NOT EXISTS(SELECT 1 FROM saas.plan_limits AS plan_limit WHERE plan_limit.plan_id=p_plan_id AND plan_limit.limit_key='storageBytes' AND plan_limit.effective_limit=p_storage_bytes)
  THEN RETURN 'feature_not_enabled'; END IF;
  RETURN NULL;
END
$function$;

DROP FUNCTION saas.media_read_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz);
DROP FUNCTION saas.media_product_operation_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text);

REVOKE ALL ON FUNCTION saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM PUBLIC,celebix_saas_app;

DROP FUNCTION saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb);
DROP FUNCTION saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text);
DROP FUNCTION saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.catalog_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb);
DROP FUNCTION saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb);
DROP FUNCTION saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint);

ALTER FUNCTION saas.catalog_create_product_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)
  RENAME TO catalog_create_product;
ALTER FUNCTION saas.catalog_update_product_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text)
  RENAME TO catalog_update_product;
ALTER FUNCTION saas.catalog_archive_product_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint)
  RENAME TO catalog_archive_product;
ALTER FUNCTION saas.catalog_create_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)
  RENAME TO catalog_create_variant;
ALTER FUNCTION saas.catalog_update_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)
  RENAME TO catalog_update_variant;
ALTER FUNCTION saas.catalog_archive_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint)
  RENAME TO catalog_archive_variant;

CREATE OR REPLACE FUNCTION saas.catalog_get_product_details(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_products_limit bigint,p_now timestamptz,p_product_id uuid,p_include_archived_variants boolean
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; product_projection jsonb; variant_projections jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_product_id IS NULL OR p_include_archived_variants IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT saas.catalog_product_projection(product.id) INTO product_projection FROM saas.products AS product
    WHERE product.id=p_product_id AND product.store_id=p_store_id AND product.status<>'archived';
  IF product_projection IS NULL THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(saas.catalog_variant_projection(variant.id) ORDER BY variant.created_at,variant.id),'[]'::jsonb)
    INTO variant_projections FROM saas.product_variants AS variant
    WHERE variant.product_id=p_product_id AND variant.store_id=p_store_id
      AND (p_include_archived_variants OR variant.status='active');
  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_build_object('product',product_projection,'variants',variant_projections);
END
$function$;

ALTER TABLE saas.product_variants
  DROP CONSTRAINT product_variants_product_archive_origin_check,
  DROP COLUMN archived_by_product;

ALTER TABLE saas.catalog_operations
  DROP CONSTRAINT catalog_operations_kind_check,
  DROP CONSTRAINT catalog_operations_result_shape_check,
  DROP CONSTRAINT catalog_operations_variant_kind_check,
  ADD CONSTRAINT catalog_operations_kind_check CHECK (operation_kind IN (
    'create_product','update_product','archive_product',
    'create_variant','update_variant','archive_variant'
  )),
  ADD CONSTRAINT catalog_operations_result_shape_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=32768
    AND result_payload ? 'product' = (operation_kind IN ('create_product','update_product','archive_product'))
    AND result_payload ? 'variant' = (operation_kind IN ('create_variant','update_variant','archive_variant'))
    AND result_payload ? 'initialVariant' = (operation_kind='create_product')
  ),
  ADD CONSTRAINT catalog_operations_variant_kind_check CHECK (
    (operation_kind IN ('create_product','create_variant','update_variant','archive_variant') AND result_variant_id IS NOT NULL)
    OR (operation_kind IN ('update_product','archive_product') AND result_variant_id IS NULL)
  );

GRANT EXECUTE ON FUNCTION saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) TO celebix_saas_app;

COMMIT;
