BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.catalog_operations
  DROP CONSTRAINT catalog_operations_kind_check,
  DROP CONSTRAINT catalog_operations_result_shape_check,
  DROP CONSTRAINT catalog_operations_variant_kind_check,
  ADD CONSTRAINT catalog_operations_kind_check CHECK (operation_kind IN (
    'create_product','update_product','archive_product','restore_product',
    'create_variant','create_variant_batch','update_variant','archive_variant','bulk_mutate_products','remove_product'
  )),
  ADD CONSTRAINT catalog_operations_result_shape_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=262144
    AND result_payload ? 'product' = (operation_kind IN ('create_product','update_product','archive_product','restore_product'))
    AND result_payload ? 'variant' = (operation_kind IN ('create_variant','update_variant','archive_variant'))
    AND result_payload ? 'variants' = (operation_kind='create_variant_batch')
    AND result_payload ? 'initialVariant' = (operation_kind='create_product')
    AND result_payload ? 'products' = (operation_kind='bulk_mutate_products')
    AND result_payload ? 'removed' = (operation_kind='remove_product')
  ),
  ADD CONSTRAINT catalog_operations_variant_kind_check CHECK (
    (operation_kind IN ('create_product','create_variant','update_variant','archive_variant') AND result_product_id IS NOT NULL AND result_variant_id IS NOT NULL)
    OR (operation_kind IN ('update_product','archive_product','restore_product','create_variant_batch') AND result_product_id IS NOT NULL AND result_variant_id IS NULL)
    OR (operation_kind IN ('bulk_mutate_products','remove_product') AND result_product_id IS NULL AND result_variant_id IS NULL)
  );

CREATE FUNCTION saas.catalog_variant_combination_key(p_attributes jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.coalesce(pg_catalog.jsonb_object_agg(pg_catalog.lower(key),pg_catalog.lower(value)),'{}'::jsonb)
  FROM pg_catalog.jsonb_each_text(p_attributes)
$function$;
REVOKE ALL ON FUNCTION saas.catalog_variant_combination_key(jsonb) FROM PUBLIC;

CREATE FUNCTION saas.catalog_create_variants_batch(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,
  p_variant_ids uuid[],p_variants jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE
  authority_error text;
  action_error text;
  existing saas.catalog_operations%ROWTYPE;
  candidate jsonb;
  position bigint;
  selected_sku text;
  selected_attributes jsonb;
  combination jsonb;
  seen_combinations jsonb[] := ARRAY[]::jsonb[];
  seen_skus text[] := ARRAY[]::text[];
  created jsonb := '[]'::jsonb;
  projection jsonb;
  attribute_record record;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  action_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF action_error IS NOT NULL THEN RETURN QUERY SELECT action_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_variants IS NULL OR pg_catalog.jsonb_typeof(p_variants)<>'array'
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF pg_catalog.jsonb_array_length(p_variants) NOT BETWEEN 1 AND 100
    OR p_variant_ids IS NULL OR pg_catalog.array_ndims(p_variant_ids)<>1 OR pg_catalog.array_lower(p_variant_ids,1)<>1
    OR pg_catalog.cardinality(p_variant_ids)<>pg_catalog.jsonb_array_length(p_variants)
    OR pg_catalog.array_position(p_variant_ids,NULL) IS NOT NULL
    OR (SELECT pg_catalog.count(DISTINCT entry.id) FROM pg_catalog.unnest(p_variant_ids) AS entry(id))<>pg_catalog.cardinality(p_variant_ids)
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:' || p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:' || p_store_id::text,0));
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id=p_store_id AND existing.operation_kind='create_variant_batch' AND existing.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF;
    RETURN;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.products AS product WHERE product.id=p_product_id AND product.store_id=p_store_id AND product.status<>'archived') THEN
    RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN;
  END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.product_variants AS variant WHERE variant.product_id=p_product_id AND variant.store_id=p_store_id AND variant.status<>'archived')
    + pg_catalog.jsonb_array_length(p_variants) > 100 THEN
    RETURN QUERY SELECT 'variant_limit_reached'::text,NULL::jsonb; RETURN;
  END IF;

  FOR candidate,position IN SELECT item.value,item.ordinality FROM pg_catalog.jsonb_array_elements(p_variants) WITH ORDINALITY AS item(value,ordinality) LOOP
    IF pg_catalog.jsonb_typeof(candidate)<>'object' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
    IF candidate - ARRAY['title','sku','barcode','priceCents','compareAtCents','costCents','stockTracking','stockQuantity','attributes']::text[] <> '{}'::jsonb
      OR pg_catalog.jsonb_typeof(candidate->'priceCents') IS DISTINCT FROM 'number'
      OR pg_catalog.jsonb_typeof(candidate->'stockTracking') IS DISTINCT FROM 'boolean'
      OR pg_catalog.jsonb_typeof(candidate->'stockQuantity') IS DISTINCT FROM 'number'
      OR pg_catalog.jsonb_typeof(candidate->'attributes') IS DISTINCT FROM 'object'
      OR candidate->>'priceCents' !~ '^(0|[1-9][0-9]*)$'
      OR candidate->>'stockQuantity' !~ '^(0|[1-9][0-9]*)$'
      OR (candidate ? 'compareAtCents' AND pg_catalog.jsonb_typeof(candidate->'compareAtCents')<>'null' AND candidate->>'compareAtCents' !~ '^(0|[1-9][0-9]*)$')
      OR (candidate ? 'costCents' AND pg_catalog.jsonb_typeof(candidate->'costCents')<>'null' AND candidate->>'costCents' !~ '^(0|[1-9][0-9]*)$')
    THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
    selected_sku:=candidate->>'sku';
    selected_attributes:=candidate->'attributes';
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(selected_attributes)) NOT BETWEEN 1 AND 3 OR NOT saas.catalog_variant_input_valid(
      candidate->>'title',selected_sku,candidate->>'barcode',(candidate->>'priceCents')::bigint,
      (candidate->>'compareAtCents')::bigint,(candidate->>'costCents')::bigint,
      (candidate->>'stockTracking')::boolean,(candidate->>'stockQuantity')::bigint,selected_attributes
    ) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
    IF EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_each_text(selected_attributes) AS selected(key,value)
      WHERE NOT EXISTS(
        SELECT 1 FROM saas.catalog_admin_resources AS resource
        WHERE resource.store_id=p_store_id AND resource.resource_kind='attribute' AND resource.status='active'
          AND resource.slug=selected.key AND pg_catalog.jsonb_typeof(resource.config->'values')='array'
          AND (resource.config->'values') ? selected.value
      )
    ) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
    combination:=saas.catalog_variant_combination_key(selected_attributes);
    IF combination=ANY(seen_combinations) OR EXISTS(
      SELECT 1 FROM saas.product_variants AS variant WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id
        AND saas.catalog_variant_combination_key(variant.attributes)=combination
    ) THEN RETURN QUERY SELECT 'variant_combination_conflict'::text,NULL::jsonb; RETURN; END IF;
    seen_combinations:=pg_catalog.array_append(seen_combinations,combination);
    IF selected_sku IS NOT NULL THEN
      IF selected_sku=ANY(seen_skus) OR EXISTS(SELECT 1 FROM saas.product_variants AS variant WHERE variant.store_id=p_store_id AND variant.sku=selected_sku) THEN
        RETURN QUERY SELECT 'sku_conflict'::text,NULL::jsonb; RETURN;
      END IF;
      seen_skus:=pg_catalog.array_append(seen_skus,selected_sku);
    END IF;
  END LOOP;

  PERFORM pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id',p_operation_id::text,true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
  FOR candidate,position IN SELECT item.value,item.ordinality FROM pg_catalog.jsonb_array_elements(p_variants) WITH ORDINALITY AS item(value,ordinality) LOOP
    INSERT INTO saas.product_variants (
      id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,cost_cents,
      stock_tracking,stock_quantity,status,attributes,version,archived_at,created_at,updated_at
    ) VALUES (
      p_variant_ids[position::integer],p_product_id,p_store_id,candidate->>'title',candidate->>'sku',candidate->>'barcode',
      (candidate->>'priceCents')::bigint,(candidate->>'compareAtCents')::bigint,(candidate->>'costCents')::bigint,
      (candidate->>'stockTracking')::boolean,(candidate->>'stockQuantity')::bigint,'active',candidate->'attributes',1,NULL,p_now,p_now
    );
    INSERT INTO saas.catalog_variant_commerce_profiles(
      variant_id,product_id,store_id,continue_selling_when_out_of_stock,version,created_at,updated_at
    ) VALUES(p_variant_ids[position::integer],p_product_id,p_store_id,false,1,p_now,p_now);
    created:=created || pg_catalog.jsonb_build_array(saas.catalog_variant_projection(p_variant_ids[position::integer]));
  END LOOP;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  FOR attribute_record IN
    SELECT DISTINCT selected.key
    FROM pg_catalog.jsonb_array_elements(p_variants) AS item(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_object_keys(item.value->'attributes') AS selected(key)
  LOOP
    INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position)
    SELECT p_store_id,resource.id,p_product_id,
      COALESCE((SELECT pg_catalog.max(relation.position)+1 FROM saas.catalog_admin_resource_products AS relation
        WHERE relation.store_id=p_store_id AND relation.resource_id=resource.id),0)
    FROM saas.catalog_admin_resources AS resource
    WHERE resource.store_id=p_store_id AND resource.resource_kind='attribute' AND resource.slug=attribute_record.key
      AND NOT EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products AS relation
        WHERE relation.store_id=p_store_id AND relation.resource_id=resource.id AND relation.product_id=p_product_id);
  END LOOP;
  projection:=pg_catalog.jsonb_build_object('variants',created);
  INSERT INTO saas.catalog_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_product_id,result_variant_id,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'create_variant_batch',p_fingerprint,p_product_id,NULL,projection,p_now);
  RETURN QUERY SELECT 'created'::text,projection;
END
$function$;
REVOKE ALL ON FUNCTION saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) TO celebix_saas_app;

COMMIT;
