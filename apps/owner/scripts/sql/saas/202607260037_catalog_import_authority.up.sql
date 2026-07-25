-- Harden catalog bulk-import replay and plan-limit authority under concurrency.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.catalog_admin_import_products(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_products_limit bigint,p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_file_name text,p_rows jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; op saas.catalog_admin_operations%ROWTYPE; row_value jsonb; row_count integer; result jsonb; store_currency text;
BEGIN
 e:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.import'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_job_id IS NULL OR p_file_name IS NULL OR p_file_name<>pg_catalog.btrim(p_file_name) OR pg_catalog.char_length(p_file_name) NOT BETWEEN 1 AND 200 OR p_file_name~'[[:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF p_rows IS NULL OR pg_catalog.jsonb_typeof(p_rows)<>'array' OR pg_catalog.pg_column_size(p_rows)>131072 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 row_count:=pg_catalog.jsonb_array_length(p_rows);
 IF row_count NOT BETWEEN 1 AND 100 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF EXISTS(
  SELECT 1
  FROM pg_catalog.jsonb_array_elements(p_rows) r
  WHERE CASE
   WHEN pg_catalog.jsonb_typeof(r)<>'object' THEN true
   ELSE
    (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(r))<>7
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(r) k WHERE k NOT IN('productId','variantId','title','slug','priceCents','sku','stockQuantity'))
    OR pg_catalog.jsonb_typeof(r->'productId')<>'string'
    OR (r->>'productId')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(r->'variantId')<>'string'
    OR (r->>'variantId')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(r->'slug')<>'string'
    OR (r->>'slug')!~'^[a-z0-9]+(-[a-z0-9]+)*$'
    OR pg_catalog.char_length(r->>'slug') NOT BETWEEN 3 AND 100
    OR pg_catalog.jsonb_typeof(r->'title')<>'string'
    OR r->>'title'<>pg_catalog.btrim(r->>'title')
    OR pg_catalog.char_length(r->>'title') NOT BETWEEN 1 AND 200
    OR (r->>'title')~'[[:cntrl:]]'
    OR CASE WHEN pg_catalog.jsonb_typeof(r->'priceCents')='number' THEN (r->>'priceCents')::numeric<0 OR (r->>'priceCents')::numeric>9007199254740991 OR (r->>'priceCents')::numeric<>pg_catalog.trunc((r->>'priceCents')::numeric) ELSE true END
    OR CASE WHEN pg_catalog.jsonb_typeof(r->'stockQuantity')='number' THEN (r->>'stockQuantity')::numeric<0 OR (r->>'stockQuantity')::numeric>9007199254740991 OR (r->>'stockQuantity')::numeric<>pg_catalog.trunc((r->>'stockQuantity')::numeric) ELSE true END
    OR pg_catalog.jsonb_typeof(r->'sku') NOT IN('string','null')
    OR (pg_catalog.jsonb_typeof(r->'sku')='string' AND (r->>'sku')!~'^[A-Z0-9][A-Z0-9._-]{0,63}$')
   END
 ) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog_admin.operation:'||p_operation_id::text,0));
 SELECT * INTO op FROM saas.catalog_admin_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN IF op.store_id IS DISTINCT FROM p_store_id OR op.payload_fingerprint IS DISTINCT FROM p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 IF (SELECT pg_catalog.count(*) FROM saas.products WHERE store_id=p_store_id AND status<>'archived')+row_count>p_products_limit THEN RETURN QUERY SELECT 'product_limit_reached',NULL::jsonb; RETURN; END IF;
 SELECT currency INTO store_currency FROM saas.stores WHERE id=p_store_id;
 BEGIN
  FOR row_value IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) LOOP
   INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES((row_value->>'productId')::uuid,p_store_id,row_value->>'slug',row_value->>'title','draft',store_currency,1,p_now,p_now);
   INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES((row_value->>'variantId')::uuid,(row_value->>'productId')::uuid,p_store_id,'Varsayılan',NULLIF(row_value->>'sku',''),(row_value->>'priceCents')::bigint,true,(row_value->>'stockQuantity')::bigint,'active','{}'::jsonb,1,p_now,p_now);
  END LOOP;
 EXCEPTION WHEN unique_violation OR check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'import_conflict',NULL::jsonb; RETURN; END;
 INSERT INTO saas.catalog_import_jobs(id,store_id,file_name,payload_digest,status,total_rows,succeeded_rows,failed_rows,version,created_at,updated_at) VALUES(p_job_id,p_store_id,p_file_name,p_fingerprint,'completed',row_count,row_count,0,1,p_now,p_now);
 SELECT saas.catalog_admin_mutation_projection(j.id,j.version,j.status,j.updated_at) INTO result FROM saas.catalog_import_jobs j WHERE j.store_id=p_store_id AND j.id=p_job_id;
 INSERT INTO saas.catalog_admin_operations VALUES(p_operation_id,p_store_id,'import_products',p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'imported',result;
END $f$;

REVOKE ALL ON FUNCTION saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,text,jsonb) FROM PUBLIC,celebix_saas_migrator,celebix_saas_bootstrap,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_observability;
GRANT EXECUTE ON FUNCTION saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,text,jsonb) TO celebix_saas_app;
COMMIT;
