BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.catalog_migration_category_manifest_valid(p_categories jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  candidate jsonb;
  selected_slug text;
  selected_parent text;
  selected_depth integer;
  parent_index integer;
  known_slugs text[]:=ARRAY[]::text[];
  known_depths integer[]:=ARRAY[]::integer[];
BEGIN
  IF p_categories IS NULL OR pg_catalog.jsonb_typeof(p_categories)<>'array'
     OR pg_catalog.jsonb_array_length(p_categories)>100
     OR pg_catalog.pg_column_size(p_categories)>65536 THEN RETURN false; END IF;
  FOR candidate IN SELECT value FROM pg_catalog.jsonb_array_elements(p_categories) LOOP
    IF NOT saas.catalog_migration_json_exact(candidate,ARRAY['id','name','slug'],ARRAY['parentSlug'])
       OR candidate->>'id'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR candidate->>'name' IS NULL OR candidate->>'name'<>pg_catalog.btrim(candidate->>'name')
       OR pg_catalog.char_length(candidate->>'name') NOT BETWEEN 1 AND 120 OR candidate->>'name'~'[[:cntrl:]]'
       OR candidate->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR pg_catalog.char_length(candidate->>'slug')>100
       OR (candidate ? 'parentSlug' AND (
         pg_catalog.jsonb_typeof(candidate->'parentSlug')<>'string'
         OR candidate->>'parentSlug'!~'^[a-z0-9]+(-[a-z0-9]+)*$'
         OR pg_catalog.char_length(candidate->>'parentSlug')>100
       )) THEN RETURN false; END IF;
    selected_slug:=candidate->>'slug'; selected_parent:=candidate->>'parentSlug';
    IF pg_catalog.array_position(known_slugs,selected_slug) IS NOT NULL OR selected_parent=selected_slug THEN RETURN false; END IF;
    IF selected_parent IS NULL THEN selected_depth:=1;
    ELSE
      parent_index:=pg_catalog.array_position(known_slugs,selected_parent);
      IF parent_index IS NULL THEN RETURN false; END IF;
      selected_depth:=known_depths[parent_index]+1;
    END IF;
    IF selected_depth>8 THEN RETURN false; END IF;
    known_slugs:=pg_catalog.array_append(known_slugs,selected_slug);
    known_depths:=pg_catalog.array_append(known_depths,selected_depth);
  END LOOP;
  RETURN true;
END
$function$;

CREATE FUNCTION saas.catalog_migration_category_manifest_matches(p_store_id uuid,p_categories jsonb)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  candidate jsonb;
  persisted_name text;
  persisted_status text;
  persisted_parent_slug text;
BEGIN
  IF NOT saas.catalog_migration_category_manifest_valid(p_categories) THEN RETURN false; END IF;
  FOR candidate IN SELECT value FROM pg_catalog.jsonb_array_elements(p_categories) LOOP
    SELECT category.name,category.status,parent.slug
    INTO persisted_name,persisted_status,persisted_parent_slug
    FROM saas.catalog_categories category
    LEFT JOIN saas.catalog_categories parent
      ON parent.store_id=category.store_id AND parent.id=category.parent_id
    WHERE category.store_id=p_store_id AND category.slug=candidate->>'slug';
    IF NOT FOUND OR persisted_status<>'active'
       OR persisted_name<>candidate->>'name'
       OR persisted_parent_slug IS DISTINCT FROM candidate->>'parentSlug' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$function$;

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
  candidate_ordinality bigint;
  requested_parent_id uuid;
  existing_category saas.catalog_categories%ROWTYPE;
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
  IF NOT saas.catalog_migration_category_manifest_valid(p_categories)
     OR EXISTS(
       SELECT 1 FROM pg_catalog.jsonb_array_elements(p_brands) brand(value)
       WHERE NOT saas.catalog_migration_json_exact(brand.value,ARRAY['id','name','slug'])
         OR brand.value->>'id'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR brand.value->>'name' IS NULL OR brand.value->>'name'<>pg_catalog.btrim(brand.value->>'name')
         OR pg_catalog.char_length(brand.value->>'name') NOT BETWEEN 1 AND 120 OR brand.value->>'name'~'[[:cntrl:]]'
         OR brand.value->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR pg_catalog.char_length(brand.value->>'slug')>100
     ) OR EXISTS(
       SELECT 1 FROM pg_catalog.jsonb_array_elements(p_brands) value GROUP BY value->>'slug' HAVING pg_catalog.count(*)>1
     )
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

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
       OR NOT saas.catalog_migration_category_manifest_matches(p_store_id,p_categories)
    THEN RETURN QUERY SELECT 'job_mismatch',NULL::jsonb; RETURN; END IF;
    result:=saas.catalog_migration_projection(p_store_id,existing_job.id,false);
    INSERT INTO saas.catalog_product_migration_operations(operation_id,store_id,job_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,existing_job.id,'begin',p_fingerprint,result,p_now);
    RETURN QUERY SELECT 'begun',result; RETURN;
  END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.products WHERE store_id=p_store_id AND status<>'archived')+p_total_products>p_products_limit
  THEN RETURN QUERY SELECT 'product_limit_reached',NULL::jsonb; RETURN; END IF;

  BEGIN
    FOR candidate,candidate_ordinality IN
      SELECT value,ordinality FROM pg_catalog.jsonb_array_elements(p_categories) WITH ORDINALITY
    LOOP
      requested_parent_id:=NULL;
      IF candidate ? 'parentSlug' THEN
        SELECT category.id INTO requested_parent_id
        FROM saas.catalog_categories category
        WHERE category.store_id=p_store_id
          AND category.slug=candidate->>'parentSlug'
          AND category.status='active';
        IF requested_parent_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='foreign_key_violation'; END IF;
      END IF;

      SELECT category.* INTO existing_category
      FROM saas.catalog_categories category
      WHERE category.store_id=p_store_id AND category.slug=candidate->>'slug'
      FOR UPDATE;

      IF FOUND THEN
        IF existing_category.status<>'active'
           OR existing_category.name<>candidate->>'name'
           OR existing_category.parent_id IS DISTINCT FROM requested_parent_id
        THEN RAISE EXCEPTION USING ERRCODE='unique_violation'; END IF;
      ELSE
        INSERT INTO saas.catalog_categories(
          id,store_id,parent_id,name,slug,position,status,version,created_at,updated_at
        ) VALUES (
          (candidate->>'id')::uuid,p_store_id,requested_parent_id,candidate->>'name',candidate->>'slug',
          candidate_ordinality-1,'active',1,p_now,p_now
        );
      END IF;
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

REVOKE ALL ON FUNCTION saas.catalog_migration_category_manifest_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_migration_category_manifest_matches(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb) FROM PUBLIC,celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb) TO celebix_saas_app;

COMMIT;
