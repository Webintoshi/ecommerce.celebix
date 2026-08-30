BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.catalog_operations
  ALTER COLUMN result_product_id DROP NOT NULL,
  DROP CONSTRAINT catalog_operations_kind_check,
  DROP CONSTRAINT catalog_operations_result_shape_check,
  DROP CONSTRAINT catalog_operations_variant_kind_check,
  ADD CONSTRAINT catalog_operations_kind_check CHECK (operation_kind IN (
    'create_product','update_product','archive_product','restore_product',
    'create_variant','update_variant','archive_variant','bulk_mutate_products','remove_product'
  )),
  ADD CONSTRAINT catalog_operations_result_shape_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=262144
    AND result_payload ? 'product' = (operation_kind IN ('create_product','update_product','archive_product','restore_product'))
    AND result_payload ? 'variant' = (operation_kind IN ('create_variant','update_variant','archive_variant'))
    AND result_payload ? 'initialVariant' = (operation_kind='create_product')
    AND result_payload ? 'products' = (operation_kind='bulk_mutate_products')
    AND result_payload ? 'removed' = (operation_kind='remove_product')
  ),
  ADD CONSTRAINT catalog_operations_variant_kind_check CHECK (
    (operation_kind IN ('create_product','create_variant','update_variant','archive_variant') AND result_product_id IS NOT NULL AND result_variant_id IS NOT NULL)
    OR (operation_kind IN ('update_product','archive_product','restore_product') AND result_product_id IS NOT NULL AND result_variant_id IS NULL)
    OR (operation_kind IN ('bulk_mutate_products','remove_product') AND result_product_id IS NULL AND result_variant_id IS NULL)
  );

CREATE FUNCTION saas.catalog_bulk_mutate_products(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_action text,p_targets jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  action_error text;
  existing saas.catalog_operations%ROWTYPE;
  projection jsonb;
  target_count integer;
  locked_count integer;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_action NOT IN ('active','draft','archive') THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  action_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog',
    CASE WHEN p_action='archive' THEN 'catalog_admin.archive' ELSE 'catalog_admin.manage' END
  );
  IF action_error IS NOT NULL THEN RETURN QUERY SELECT action_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR pg_catalog.jsonb_typeof(p_targets)<>'array' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  target_count:=pg_catalog.jsonb_array_length(p_targets);
  IF target_count<1 OR target_count>100 OR EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_targets) AS item(value)
    WHERE pg_catalog.jsonb_typeof(item.value)<>'object'
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(item.value))<>2
      OR NOT item.value ?& ARRAY['productId','expectedVersion']
      OR (item.value->>'productId')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR (item.value->>'expectedVersion')!~'^[1-9][0-9]*$'
      OR (item.value->>'expectedVersion')::numeric>9223372036854775807
  ) OR (
    SELECT pg_catalog.count(DISTINCT item.value->>'productId') FROM pg_catalog.jsonb_array_elements(p_targets) AS item(value)
  )<>target_count THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id=p_store_id AND existing.operation_kind='bulk_mutate_products' AND existing.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*)::integer INTO locked_count
  FROM (
    SELECT product.id
    FROM saas.products AS product
    JOIN pg_catalog.jsonb_array_elements(p_targets) AS item(value)
      ON product.id=(item.value->>'productId')::uuid
    WHERE product.store_id=p_store_id
      AND ((p_action='archive' AND product.status<>'archived') OR (p_action<>'archive' AND product.status<>'archived'))
    ORDER BY product.id
    FOR UPDATE OF product
  ) AS locked;
  IF locked_count<>target_count THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM saas.products AS product
    JOIN pg_catalog.jsonb_array_elements(p_targets) AS item(value) ON product.id=(item.value->>'productId')::uuid
    WHERE product.store_id=p_store_id AND product.version<>(item.value->>'expectedVersion')::bigint
  ) THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;

  IF p_action='archive' THEN
    PERFORM 1 FROM saas.product_variants AS variant
      WHERE variant.store_id=p_store_id AND variant.product_id IN (
        SELECT (item.value->>'productId')::uuid FROM pg_catalog.jsonb_array_elements(p_targets) AS item(value)
      ) ORDER BY variant.product_id,variant.id FOR UPDATE;
    UPDATE saas.product_variants AS variant
      SET status='archived',archived_at=p_now,archived_by_product=true,version=variant.version+1,updated_at=p_now
      WHERE variant.store_id=p_store_id AND variant.status='active' AND variant.product_id IN (
        SELECT (item.value->>'productId')::uuid FROM pg_catalog.jsonb_array_elements(p_targets) AS item(value)
      );
    UPDATE saas.products AS product SET status='archived',archived_at=p_now,version=product.version+1,updated_at=p_now
      WHERE product.store_id=p_store_id AND product.id IN (
        SELECT (item.value->>'productId')::uuid FROM pg_catalog.jsonb_array_elements(p_targets) AS item(value)
      );
  ELSE
    UPDATE saas.products AS product SET status=p_action,version=product.version+1,updated_at=p_now
      WHERE product.store_id=p_store_id AND product.id IN (
        SELECT (item.value->>'productId')::uuid FROM pg_catalog.jsonb_array_elements(p_targets) AS item(value)
      );
  END IF;

  SELECT pg_catalog.jsonb_build_object('products',pg_catalog.jsonb_agg(saas.catalog_product_projection(product.id) ORDER BY product.id))
    INTO projection FROM saas.products AS product WHERE product.store_id=p_store_id AND product.id IN (
      SELECT (item.value->>'productId')::uuid FROM pg_catalog.jsonb_array_elements(p_targets) AS item(value)
    );
  INSERT INTO saas.catalog_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_product_id,result_variant_id,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,'bulk_mutate_products',p_fingerprint,NULL,NULL,projection,p_now);
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb) TO celebix_saas_app;
ALTER FUNCTION saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb) OWNER TO celebix_saas_owner;

COMMIT;
