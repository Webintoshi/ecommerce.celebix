BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.catalog_migration_begin(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_source_digest text,
  p_total_products integer,p_total_media integer,p_categories jsonb,p_brands jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE
  authority_error text;
  operation saas.catalog_product_migration_operations%ROWTYPE;
  existing_job saas.catalog_product_migration_jobs%ROWTYPE;
  candidate jsonb;
  result jsonb;
  requested_count integer;
BEGIN
  authority_error:=saas.catalog_migration_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_job_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_source_digest!~'^[a-f0-9]{64}$' OR p_total_products NOT BETWEEN 1 AND 2500
     OR p_total_media NOT BETWEEN 0 AND 40000 OR p_total_media>p_total_products*16
     OR pg_catalog.jsonb_typeof(p_categories)<>'array' OR pg_catalog.jsonb_array_length(p_categories)>100
     OR pg_catalog.jsonb_typeof(p_brands)<>'array' OR pg_catalog.jsonb_array_length(p_brands)>50
     OR pg_catalog.pg_column_size(p_categories)>65536 OR pg_catalog.pg_column_size(p_brands)>32768
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM (
      SELECT value FROM pg_catalog.jsonb_array_elements(p_categories)
      UNION ALL SELECT value FROM pg_catalog.jsonb_array_elements(p_brands)
    ) taxonomy
    WHERE NOT saas.catalog_migration_json_exact(taxonomy.value,ARRAY['id','name','slug'])
      OR taxonomy.value->>'id'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR taxonomy.value->>'name' IS NULL OR taxonomy.value->>'name'<>pg_catalog.btrim(taxonomy.value->>'name')
      OR pg_catalog.char_length(taxonomy.value->>'name') NOT BETWEEN 1 AND 120 OR taxonomy.value->>'name'~'[[:cntrl:]]'
      OR taxonomy.value->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR pg_catalog.char_length(taxonomy.value->>'slug')>100
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_categories) value GROUP BY value->>'slug' HAVING pg_catalog.count(*)>1
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_brands) value GROUP BY value->>'slug' HAVING pg_catalog.count(*)>1
  ) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.migration.operation:'||p_operation_id::text,0));
  SELECT * INTO operation FROM saas.catalog_product_migration_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload||pg_catalog.jsonb_build_object('replayed',true); END IF;
    RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO existing_job FROM saas.catalog_product_migration_jobs WHERE store_id=p_store_id AND source_digest=p_source_digest FOR UPDATE;
  IF FOUND THEN
    IF existing_job.total_products<>p_total_products OR existing_job.total_media<>p_total_media
       OR existing_job.category_count<>pg_catalog.jsonb_array_length(p_categories)
       OR existing_job.brand_count<>pg_catalog.jsonb_array_length(p_brands)
       OR existing_job.category_slugs<>(SELECT COALESCE(pg_catalog.array_agg(value->>'slug' ORDER BY ordinality),ARRAY[]::text[]) FROM pg_catalog.jsonb_array_elements(p_categories) WITH ORDINALITY requested(value,ordinality))
       OR existing_job.brand_slugs<>(SELECT COALESCE(pg_catalog.array_agg(value->>'slug' ORDER BY ordinality),ARRAY[]::text[]) FROM pg_catalog.jsonb_array_elements(p_brands) WITH ORDINALITY requested(value,ordinality))
    THEN RETURN QUERY SELECT 'job_mismatch',NULL::jsonb; RETURN; END IF;
    result:=saas.catalog_migration_projection(p_store_id,existing_job.id,false);
    INSERT INTO saas.catalog_product_migration_operations(operation_id,store_id,job_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,existing_job.id,'begin',p_fingerprint,result,p_now);
    RETURN QUERY SELECT 'begun',result; RETURN;
  END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.products WHERE store_id=p_store_id AND status<>'archived')+p_total_products>p_products_limit
  THEN RETURN QUERY SELECT 'product_limit_reached',NULL::jsonb; RETURN; END IF;

  BEGIN
    FOR candidate IN SELECT value FROM pg_catalog.jsonb_array_elements(p_categories) LOOP
      IF EXISTS(SELECT 1 FROM saas.catalog_categories WHERE store_id=p_store_id AND slug=candidate->>'slug' AND (status<>'active' OR name<>candidate->>'name'))
      THEN RAISE EXCEPTION USING ERRCODE='unique_violation'; END IF;
      INSERT INTO saas.catalog_categories(id,store_id,name,slug,position,depth,status,version,created_at,updated_at)
      VALUES((candidate->>'id')::uuid,p_store_id,candidate->>'name',candidate->>'slug',0,1,'active',1,p_now,p_now)
      ON CONFLICT(store_id,slug) DO NOTHING;
    END LOOP;
    FOR candidate IN SELECT value FROM pg_catalog.jsonb_array_elements(p_brands) LOOP
      IF EXISTS(SELECT 1 FROM saas.catalog_admin_resources WHERE store_id=p_store_id AND resource_kind='brand' AND slug=candidate->>'slug' AND (status<>'active' OR name<>candidate->>'name'))
      THEN RAISE EXCEPTION USING ERRCODE='unique_violation'; END IF;
      INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at)
      VALUES((candidate->>'id')::uuid,p_store_id,'brand',candidate->>'name',candidate->>'slug','{}'::jsonb,'active',1,p_now,p_now)
      ON CONFLICT(store_id,resource_kind,slug) DO NOTHING;
    END LOOP;
    INSERT INTO saas.catalog_product_migration_jobs(
      id,store_id,source_digest,status,total_products,imported_products,total_media,committed_media,failed_media,
      category_count,brand_count,category_slugs,brand_slugs,version,created_at,updated_at
    ) VALUES(
      p_job_id,p_store_id,p_source_digest,'processing',p_total_products,0,p_total_media,0,0,
      pg_catalog.jsonb_array_length(p_categories),pg_catalog.jsonb_array_length(p_brands),
      (SELECT COALESCE(pg_catalog.array_agg(value->>'slug' ORDER BY ordinality),ARRAY[]::text[]) FROM pg_catalog.jsonb_array_elements(p_categories) WITH ORDINALITY requested(value,ordinality)),
      (SELECT COALESCE(pg_catalog.array_agg(value->>'slug' ORDER BY ordinality),ARRAY[]::text[]) FROM pg_catalog.jsonb_array_elements(p_brands) WITH ORDINALITY requested(value,ordinality)),
      1,p_now,p_now
    );
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR invalid_text_representation
    THEN RETURN QUERY SELECT 'import_conflict',NULL::jsonb; RETURN;
  END;
  result:=saas.catalog_migration_projection(p_store_id,p_job_id,false);
  INSERT INTO saas.catalog_product_migration_operations(operation_id,store_id,job_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,p_job_id,'begin',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'begun',result;
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb) FROM PUBLIC,celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb) TO celebix_saas_app;
DROP FUNCTION saas.catalog_migration_category_manifest_matches(uuid,jsonb);
DROP FUNCTION saas.catalog_migration_category_manifest_valid(jsonb);

COMMIT;
