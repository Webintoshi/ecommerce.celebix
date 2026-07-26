-- Additive rich catalog import and read-only feed-preview authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.catalog_admin_import_products_v2(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_now timestamptz,
  p_products_limit bigint,
  p_operation_id uuid,
  p_fingerprint text,
  p_job_id uuid,
  p_file_name text,
  p_products jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  operation_row saas.catalog_admin_operations%ROWTYPE;
  product_value jsonb;
  variant_value jsonb;
  product_count integer;
  variant_count integer;
  result jsonb;
  store_currency text;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;

  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','catalog_admin.import'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;

  IF p_operation_id IS NULL
    OR p_fingerprint IS NULL
    OR p_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_job_id IS NULL
    OR p_file_name IS NULL
    OR p_file_name <> pg_catalog.btrim(p_file_name)
    OR pg_catalog.char_length(p_file_name) NOT BETWEEN 1 AND 200
    OR p_file_name ~ '[[:cntrl:]]'
    OR p_products IS NULL
    OR pg_catalog.jsonb_typeof(p_products) <> 'array'
    OR pg_catalog.pg_column_size(p_products) > 131072
  THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  product_count := pg_catalog.jsonb_array_length(p_products);
  IF product_count NOT BETWEEN 1 AND 100 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_products) AS product(value)
    WHERE CASE
      WHEN pg_catalog.jsonb_typeof(product.value) <> 'object' THEN true
      ELSE
        (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(product.value)) <> 6
        OR EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_object_keys(product.value) AS key
          WHERE key NOT IN ('productId','title','slug','description','status','variants')
        )
        OR pg_catalog.jsonb_typeof(product.value->'productId') <> 'string'
        OR (product.value->>'productId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR pg_catalog.jsonb_typeof(product.value->'title') <> 'string'
        OR product.value->>'title' <> pg_catalog.btrim(product.value->>'title')
        OR pg_catalog.char_length(product.value->>'title') NOT BETWEEN 1 AND 200
        OR (product.value->>'title') ~ '[[:cntrl:]]'
        OR pg_catalog.jsonb_typeof(product.value->'slug') <> 'string'
        OR (product.value->>'slug') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        OR pg_catalog.char_length(product.value->>'slug') NOT BETWEEN 3 AND 100
        OR pg_catalog.jsonb_typeof(product.value->'description') NOT IN ('string','null')
        OR (
          pg_catalog.jsonb_typeof(product.value->'description') = 'string'
          AND (
            product.value->>'description' <> pg_catalog.btrim(product.value->>'description')
            OR pg_catalog.char_length(product.value->>'description') NOT BETWEEN 1 AND 10000
            OR (product.value->>'description') ~ '[[:cntrl:]]'
          )
        )
        OR pg_catalog.jsonb_typeof(product.value->'status') <> 'string'
        OR product.value->>'status' NOT IN ('draft','active')
        OR pg_catalog.jsonb_typeof(product.value->'variants') <> 'array'
        OR pg_catalog.jsonb_array_length(product.value->'variants') NOT BETWEEN 1 AND 50
      END
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  SELECT COALESCE(pg_catalog.sum(pg_catalog.jsonb_array_length(product.value->'variants')),0)::integer
  INTO variant_count
  FROM pg_catalog.jsonb_array_elements(p_products) AS product(value);
  IF variant_count NOT BETWEEN 1 AND 500 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_products) AS product(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(product.value->'variants') AS variant(value)
    WHERE CASE
      WHEN pg_catalog.jsonb_typeof(variant.value) <> 'object' THEN true
      ELSE
        (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(variant.value)) <> 9
        OR EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_object_keys(variant.value) AS key
          WHERE key NOT IN ('variantId','title','sku','barcode','priceCents','compareAtCents','costCents','stockQuantity','attributes')
        )
        OR pg_catalog.jsonb_typeof(variant.value->'variantId') <> 'string'
        OR (variant.value->>'variantId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR pg_catalog.jsonb_typeof(variant.value->'title') <> 'string'
        OR variant.value->>'title' <> pg_catalog.btrim(variant.value->>'title')
        OR pg_catalog.char_length(variant.value->>'title') NOT BETWEEN 1 AND 200
        OR (variant.value->>'title') ~ '[[:cntrl:]]'
        OR pg_catalog.jsonb_typeof(variant.value->'sku') NOT IN ('string','null')
        OR (
          pg_catalog.jsonb_typeof(variant.value->'sku') = 'string'
          AND (variant.value->>'sku') !~ '^[A-Z0-9][A-Z0-9._-]{0,63}$'
        )
        OR pg_catalog.jsonb_typeof(variant.value->'barcode') NOT IN ('string','null')
        OR (
          pg_catalog.jsonb_typeof(variant.value->'barcode') = 'string'
          AND (
            variant.value->>'barcode' <> pg_catalog.btrim(variant.value->>'barcode')
            OR pg_catalog.char_length(variant.value->>'barcode') NOT BETWEEN 1 AND 128
            OR (variant.value->>'barcode') ~ '[[:cntrl:]]'
          )
        )
        OR CASE WHEN pg_catalog.jsonb_typeof(variant.value->'priceCents') = 'number'
          THEN (variant.value->>'priceCents')::numeric < 0
            OR (variant.value->>'priceCents')::numeric > 9007199254740991
            OR (variant.value->>'priceCents')::numeric <> pg_catalog.trunc((variant.value->>'priceCents')::numeric)
          ELSE true END
        OR CASE WHEN pg_catalog.jsonb_typeof(variant.value->'stockQuantity') = 'number'
          THEN (variant.value->>'stockQuantity')::numeric < 0
            OR (variant.value->>'stockQuantity')::numeric > 9007199254740991
            OR (variant.value->>'stockQuantity')::numeric <> pg_catalog.trunc((variant.value->>'stockQuantity')::numeric)
          ELSE true END
        OR CASE WHEN pg_catalog.jsonb_typeof(variant.value->'compareAtCents') = 'number'
          THEN (variant.value->>'compareAtCents')::numeric < (variant.value->>'priceCents')::numeric
            OR (variant.value->>'compareAtCents')::numeric > 9007199254740991
            OR (variant.value->>'compareAtCents')::numeric <> pg_catalog.trunc((variant.value->>'compareAtCents')::numeric)
          ELSE pg_catalog.jsonb_typeof(variant.value->'compareAtCents') <> 'null' END
        OR CASE WHEN pg_catalog.jsonb_typeof(variant.value->'costCents') = 'number'
          THEN (variant.value->>'costCents')::numeric < 0
            OR (variant.value->>'costCents')::numeric > 9007199254740991
            OR (variant.value->>'costCents')::numeric <> pg_catalog.trunc((variant.value->>'costCents')::numeric)
          ELSE pg_catalog.jsonb_typeof(variant.value->'costCents') <> 'null' END
        OR pg_catalog.jsonb_typeof(variant.value->'attributes') <> 'object'
        OR NOT saas.catalog_attributes_are_valid(variant.value->'attributes')
      END
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_products) AS product(value)
    GROUP BY product.value->>'productId' HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_products) AS product(value)
    GROUP BY product.value->>'slug' HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_products) AS product(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(product.value->'variants') AS variant(value)
    GROUP BY variant.value->>'variantId' HAVING pg_catalog.count(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(p_products) AS product(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(product.value->'variants') AS variant(value)
    WHERE pg_catalog.jsonb_typeof(variant.value->'sku') = 'string'
    GROUP BY variant.value->>'sku' HAVING pg_catalog.count(*) > 1
  ) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog_admin.operation:'||p_operation_id::text,0)
  );
  SELECT * INTO operation_row
  FROM saas.catalog_admin_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation_row.store_id IS DISTINCT FROM p_store_id
      OR operation_row.payload_fingerprint IS DISTINCT FROM p_fingerprint
    THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'operation_replayed',operation_row.result_payload;
    END IF;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0)
  );
  IF (
    SELECT pg_catalog.count(*) FROM saas.products
    WHERE store_id=p_store_id AND status<>'archived'
  ) + product_count > p_products_limit THEN
    RETURN QUERY SELECT 'product_limit_reached',NULL::jsonb;
    RETURN;
  END IF;

  SELECT currency INTO store_currency FROM saas.stores WHERE id=p_store_id;
  BEGIN
    FOR product_value IN
      SELECT value FROM pg_catalog.jsonb_array_elements(p_products)
    LOOP
      INSERT INTO saas.products(
        id,store_id,slug,title,description,status,currency,version,created_at,updated_at
      ) VALUES (
        (product_value->>'productId')::uuid,p_store_id,product_value->>'slug',
        product_value->>'title',NULLIF(product_value->>'description',''),
        product_value->>'status',store_currency,1,p_now,p_now
      );

      FOR variant_value IN
        SELECT value FROM pg_catalog.jsonb_array_elements(product_value->'variants')
      LOOP
        INSERT INTO saas.product_variants(
          id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,
          cost_cents,stock_tracking,stock_quantity,status,attributes,version,
          created_at,updated_at
        ) VALUES (
          (variant_value->>'variantId')::uuid,(product_value->>'productId')::uuid,
          p_store_id,variant_value->>'title',NULLIF(variant_value->>'sku',''),
          NULLIF(variant_value->>'barcode',''),(variant_value->>'priceCents')::bigint,
          NULLIF(variant_value->>'compareAtCents','')::bigint,
          NULLIF(variant_value->>'costCents','')::bigint,true,
          (variant_value->>'stockQuantity')::bigint,'active',
          variant_value->'attributes',1,p_now,p_now
        );
      END LOOP;
    END LOOP;
  EXCEPTION
    WHEN unique_violation OR check_violation OR foreign_key_violation
      OR invalid_text_representation OR numeric_value_out_of_range
    THEN
      RETURN QUERY SELECT 'import_conflict',NULL::jsonb;
      RETURN;
  END;

  INSERT INTO saas.catalog_import_jobs(
    id,store_id,file_name,payload_digest,status,total_rows,succeeded_rows,
    failed_rows,version,created_at,updated_at
  ) VALUES (
    p_job_id,p_store_id,p_file_name,p_fingerprint,'completed',product_count,
    product_count,0,1,p_now,p_now
  );
  SELECT saas.catalog_admin_mutation_projection(j.id,j.version,j.status,j.updated_at)
  INTO result
  FROM saas.catalog_import_jobs j
  WHERE j.store_id=p_store_id AND j.id=p_job_id;
  INSERT INTO saas.catalog_admin_operations
  VALUES (p_operation_id,p_store_id,'import_products',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'imported',result;
END
$function$;

CREATE FUNCTION saas.catalog_admin_authorize_feed_preview(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','catalog_admin.import'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'authorized','{}'::jsonb;
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_admin_import_products_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,text,jsonb) FROM PUBLIC,celebix_saas_migrator,celebix_saas_bootstrap,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_observability;
REVOKE ALL ON FUNCTION saas.catalog_admin_authorize_feed_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz) FROM PUBLIC,celebix_saas_migrator,celebix_saas_bootstrap,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_observability;
GRANT EXECUTE ON FUNCTION saas.catalog_admin_import_products_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,text,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_admin_authorize_feed_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;

COMMIT;
