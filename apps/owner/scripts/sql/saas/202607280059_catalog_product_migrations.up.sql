-- Tenant-scoped, resumable catalog product migration authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.products DROP CONSTRAINT products_description_check;
ALTER TABLE saas.products ADD CONSTRAINT products_description_check CHECK(
  description IS NULL OR (
    description=pg_catalog.btrim(description)
    AND pg_catalog.char_length(description) BETWEEN 1 AND 10000
    AND description!~E'[\\x01-\\x09\\x0B-\\x1F\\x7F]'
  )
);

CREATE TABLE saas.catalog_product_migration_jobs(
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  source_digest char(64) NOT NULL,
  status text NOT NULL,
  total_products integer NOT NULL,
  imported_products integer NOT NULL DEFAULT 0,
  total_media integer NOT NULL,
  committed_media integer NOT NULL DEFAULT 0,
  failed_media integer NOT NULL DEFAULT 0,
  category_count integer NOT NULL,
  brand_count integer NOT NULL,
  category_slugs text[] NOT NULL,
  brand_slugs text[] NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(id),
  UNIQUE(store_id,id),
  UNIQUE(store_id,source_digest),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(source_digest~'^[a-f0-9]{64}$'),
  CHECK(status IN('processing','media_processing','completed','completed_with_failures')),
  CHECK(total_products BETWEEN 1 AND 2500),
  CHECK(imported_products BETWEEN 0 AND total_products),
  CHECK(total_media BETWEEN 0 AND 40000),
  CHECK(committed_media BETWEEN 0 AND total_media),
  CHECK(failed_media BETWEEN 0 AND total_media),
  CHECK(committed_media+failed_media<=total_media),
  CHECK(category_count BETWEEN 0 AND 100),
  CHECK(brand_count BETWEEN 0 AND 50),
  CHECK(pg_catalog.cardinality(category_slugs)=category_count AND pg_catalog.cardinality(brand_slugs)=brand_count),
  CHECK(pg_catalog.array_position(category_slugs,NULL) IS NULL AND pg_catalog.array_position(brand_slugs,NULL) IS NULL),
  CHECK(version BETWEEN 1 AND 9007199254740991),
  CHECK(pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at) AND updated_at>=created_at),
  CHECK(
    (status='processing' AND imported_products<total_products AND committed_media=0 AND failed_media=0)
    OR (status='media_processing' AND imported_products=total_products AND total_media>committed_media+failed_media)
    OR (status='completed' AND imported_products=total_products AND committed_media=total_media AND failed_media=0)
    OR (status='completed_with_failures' AND imported_products=total_products AND committed_media+failed_media=total_media AND failed_media>0)
  )
);

CREATE INDEX catalog_product_migration_jobs_store_status_idx
  ON saas.catalog_product_migration_jobs(store_id,status,updated_at DESC,id);

CREATE TABLE saas.catalog_product_migration_items(
  store_id uuid NOT NULL,
  job_id uuid NOT NULL,
  source_product_id text NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  media_count integer NOT NULL,
  imported_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,job_id,source_product_id),
  UNIQUE(store_id,job_id,product_id),
  UNIQUE(store_id,job_id,variant_id),
  FOREIGN KEY(store_id,job_id) REFERENCES saas.catalog_product_migration_jobs(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,product_id,variant_id) REFERENCES saas.product_variants(store_id,product_id,id) ON DELETE RESTRICT,
  CHECK(source_product_id~'^[1-9][0-9]{0,19}$'),
  CHECK(media_count BETWEEN 0 AND 16),
  CHECK(pg_catalog.isfinite(imported_at))
);

CREATE TABLE saas.catalog_product_migration_media_items(
  store_id uuid NOT NULL,
  job_id uuid NOT NULL,
  source_product_id text NOT NULL,
  product_id uuid NOT NULL,
  ordinal integer NOT NULL,
  source_url_digest char(64) NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  safe_failure_code text,
  committed_media_id uuid,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,job_id,source_product_id,ordinal),
  UNIQUE(store_id,job_id,source_url_digest,source_product_id,ordinal),
  FOREIGN KEY(store_id,job_id,source_product_id) REFERENCES saas.catalog_product_migration_items(store_id,job_id,source_product_id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,committed_media_id) REFERENCES saas.product_media(store_id,id) ON DELETE RESTRICT,
  CHECK(ordinal BETWEEN 0 AND 15),
  CHECK(source_url_digest~'^[a-f0-9]{64}$'),
  CHECK(status IN('pending','committed','failed')),
  CHECK(safe_failure_code IS NULL OR (safe_failure_code~'^[a-z0-9_]{1,64}$')),
  CHECK(pg_catalog.isfinite(updated_at)),
  CHECK(
    (status='pending' AND safe_failure_code IS NULL AND committed_media_id IS NULL)
    OR (status='committed' AND safe_failure_code IS NULL AND committed_media_id IS NOT NULL)
    OR (status='failed' AND safe_failure_code IS NOT NULL AND committed_media_id IS NULL)
  )
);

CREATE INDEX catalog_product_migration_media_progress_idx
  ON saas.catalog_product_migration_media_items(store_id,job_id,status,source_product_id,ordinal);

CREATE TABLE saas.catalog_product_migration_operations(
  operation_id uuid NOT NULL,
  store_id uuid NOT NULL,
  job_id uuid NOT NULL,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY(operation_id),
  FOREIGN KEY(store_id,job_id) REFERENCES saas.catalog_product_migration_jobs(store_id,id) ON DELETE RESTRICT,
  CHECK(operation_kind IN('begin','import_batch','record_media')),
  CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=131072),
  CHECK(pg_catalog.isfinite(committed_at))
);

CREATE INDEX catalog_product_migration_operations_store_idx
  ON saas.catalog_product_migration_operations(store_id,job_id,committed_at,operation_id);

CREATE FUNCTION saas.guard_catalog_product_migration_operation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_OPERATION_IMMUTABLE';
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_catalog_product_migration_operation() FROM PUBLIC;
CREATE TRIGGER catalog_product_migration_operations_immutable
BEFORE UPDATE OR DELETE ON saas.catalog_product_migration_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_product_migration_operation();

CREATE FUNCTION saas.guard_catalog_product_migration_item()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_ITEM_IMMUTABLE';
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_catalog_product_migration_item() FROM PUBLIC;
CREATE TRIGGER catalog_product_migration_items_immutable
BEFORE UPDATE OR DELETE ON saas.catalog_product_migration_items
FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_product_migration_item();

CREATE FUNCTION saas.guard_catalog_product_migration_job()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.source_digest<>OLD.source_digest
     OR NEW.total_products<>OLD.total_products OR NEW.total_media<>OLD.total_media
     OR NEW.category_count<>OLD.category_count OR NEW.brand_count<>OLD.brand_count
     OR NEW.category_slugs<>OLD.category_slugs OR NEW.brand_slugs<>OLD.brand_slugs
     OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1
     OR OLD.status='completed'
  THEN RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_JOB_IDENTITY_IMMUTABLE'; END IF;
  IF NOT (
    (OLD.status='processing' AND NEW.status IN('processing','media_processing','completed'))
    OR (OLD.status='media_processing' AND NEW.status IN('media_processing','completed','completed_with_failures'))
    OR (OLD.status='completed_with_failures' AND NEW.status IN('completed_with_failures','completed'))
  ) THEN RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_JOB_TRANSITION_INVALID'; END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_catalog_product_migration_job() FROM PUBLIC;
CREATE TRIGGER catalog_product_migration_job_identity_immutable
BEFORE UPDATE OR DELETE ON saas.catalog_product_migration_jobs
FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_product_migration_job();

CREATE FUNCTION saas.guard_catalog_product_migration_media_item()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF TG_OP='DELETE' OR NEW.store_id<>OLD.store_id OR NEW.job_id<>OLD.job_id
     OR NEW.source_product_id<>OLD.source_product_id OR NEW.product_id<>OLD.product_id
     OR NEW.ordinal<>OLD.ordinal OR NEW.source_url_digest<>OLD.source_url_digest
     OR OLD.status='committed'
     OR NOT ((OLD.status='pending' AND NEW.status IN('committed','failed')) OR (OLD.status='failed' AND NEW.status='committed'))
  THEN RAISE EXCEPTION 'CATALOG_PRODUCT_MIGRATION_MEDIA_IDENTITY_IMMUTABLE'; END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_catalog_product_migration_media_item() FROM PUBLIC;
CREATE TRIGGER catalog_product_migration_media_items_one_way
BEFORE UPDATE OR DELETE ON saas.catalog_product_migration_media_items
FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_product_migration_media_item();

ALTER TABLE saas.catalog_product_migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_migration_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_migration_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_migration_items FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_migration_media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_migration_media_items FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_migration_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_migration_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.catalog_product_migration_jobs FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON saas.catalog_product_migration_items FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON saas.catalog_product_migration_media_items FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON saas.catalog_product_migration_operations FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

CREATE FUNCTION saas.catalog_migration_json_exact(candidate jsonb,required_keys text[],optional_keys text[] DEFAULT ARRAY[]::text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $function$
  SELECT candidate IS NOT NULL AND pg_catalog.jsonb_typeof(candidate)='object'
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.unnest(required_keys) required(key) WHERE NOT candidate ? required.key
    )
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_object_keys(candidate) actual(key)
      WHERE NOT (actual.key=ANY(required_keys) OR actual.key=ANY(optional_keys))
    )
$function$;

CREATE FUNCTION saas.catalog_migration_projection(p_store_id uuid,p_job_id uuid,p_replayed boolean)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'jobId',job.id,'sourceDigest',job.source_digest,'status',job.status,
    'totalProducts',job.total_products,'importedProducts',job.imported_products,
    'totalMedia',job.total_media,'committedMedia',job.committed_media,'failedMedia',job.failed_media,
    'categoryCount',job.category_count,'brandCount',job.brand_count,
    'version',job.version,'updatedAt',saas.catalog_timestamp(job.updated_at),'replayed',p_replayed
  )
  FROM saas.catalog_product_migration_jobs job
  WHERE job.store_id=p_store_id AND job.id=p_job_id
$function$;

CREATE FUNCTION saas.catalog_migration_media_projection(
  p_store_id uuid,p_job_id uuid,p_source_product_id text,p_ordinal integer
)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'jobId',media.job_id,'sourceProductId',media.source_product_id,
    'productId',media.product_id,'variantId',item.variant_id,
    'ordinal',media.ordinal,'sourceUrlDigest',media.source_url_digest,'status',media.status
  )||CASE WHEN media.status='committed'
    THEN pg_catalog.jsonb_build_object('committedMediaId',media.committed_media_id)
    ELSE '{}'::jsonb END
  FROM saas.catalog_product_migration_media_items media
  JOIN saas.catalog_product_migration_items item
    ON item.store_id=media.store_id AND item.job_id=media.job_id
   AND item.source_product_id=media.source_product_id
  WHERE media.store_id=p_store_id AND media.job_id=p_job_id
    AND media.source_product_id=p_source_product_id AND media.ordinal=p_ordinal
$function$;

CREATE FUNCTION saas.catalog_migration_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_products_limit bigint,p_now timestamptz
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NOT NULL THEN RETURN authority_error; END IF;
  RETURN saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.import'
  );
END
$function$;

CREATE FUNCTION saas.catalog_migration_begin(
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

CREATE FUNCTION saas.catalog_migration_import_batch(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_source_digest text,p_products jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE
  authority_error text;
  operation saas.catalog_product_migration_operations%ROWTYPE;
  job saas.catalog_product_migration_jobs%ROWTYPE;
  product_value jsonb;
  variant_value jsonb;
  selected_product_id uuid;
  selected_variant_id uuid;
  store_currency text;
  batch_count integer;
  batch_media integer;
  projected_status text;
  mappings jsonb:='[]'::jsonb;
  result jsonb;
  weight_grams text;
BEGIN
  authority_error:=saas.catalog_migration_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_job_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_source_digest!~'^[a-f0-9]{64}$'
     OR pg_catalog.jsonb_typeof(p_products)<>'array' OR pg_catalog.jsonb_array_length(p_products) NOT BETWEEN 1 AND 25
     OR pg_catalog.pg_column_size(p_products)>524288
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_products) product(value)
    WHERE NOT saas.catalog_migration_json_exact(product.value,
      ARRAY['sourceProductId','productId','title','slug','status','categorySlugs','brandSlugs','variant','sourceImageDigests'],ARRAY['description'])
      OR product.value->>'sourceProductId'!~'^[1-9][0-9]{0,19}$'
      OR product.value->>'productId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR product.value->>'title' IS NULL OR product.value->>'title'<>pg_catalog.btrim(product.value->>'title')
      OR pg_catalog.char_length(product.value->>'title') NOT BETWEEN 1 AND 200 OR product.value->>'title'~'[[:cntrl:]]'
      OR product.value->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR pg_catalog.char_length(product.value->>'slug') NOT BETWEEN 3 AND 100
      OR product.value->>'status' NOT IN('draft','active')
      OR (product.value ? 'description' AND (
        pg_catalog.jsonb_typeof(product.value->'description')<>'string'
        OR product.value->>'description'<>pg_catalog.btrim(product.value->>'description')
        OR pg_catalog.char_length(product.value->>'description') NOT BETWEEN 1 AND 10000
        OR product.value->>'description'~E'[\\x01-\\x09\\x0B-\\x1F\\x7F]'
      ))
      OR pg_catalog.jsonb_typeof(product.value->'categorySlugs')<>'array' OR pg_catalog.jsonb_array_length(product.value->'categorySlugs')>8
      OR pg_catalog.jsonb_typeof(product.value->'brandSlugs')<>'array' OR pg_catalog.jsonb_array_length(product.value->'brandSlugs')>16
      OR pg_catalog.jsonb_typeof(product.value->'sourceImageDigests')<>'array' OR pg_catalog.jsonb_array_length(product.value->'sourceImageDigests')>16
      OR NOT saas.catalog_migration_json_exact(product.value->'variant',ARRAY['variantId','title','priceCents','stockQuantity','attributes'],ARRAY['sku','barcode','compareAtCents'])
      OR product.value->'variant'->>'variantId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR product.value->'variant'->>'title' IS NULL OR product.value->'variant'->>'title'<>pg_catalog.btrim(product.value->'variant'->>'title')
      OR pg_catalog.char_length(product.value->'variant'->>'title') NOT BETWEEN 1 AND 120 OR product.value->'variant'->>'title'~'[[:cntrl:]]'
      OR pg_catalog.jsonb_typeof(product.value->'variant'->'priceCents')<>'number'
      OR (product.value->'variant'->>'priceCents')::numeric NOT BETWEEN 0 AND 9007199254740991
      OR (product.value->'variant'->>'priceCents')::numeric<>pg_catalog.trunc((product.value->'variant'->>'priceCents')::numeric)
      OR pg_catalog.jsonb_typeof(product.value->'variant'->'stockQuantity')<>'number'
      OR (product.value->'variant'->>'stockQuantity')::numeric NOT BETWEEN 0 AND 2147483647
      OR (product.value->'variant'->>'stockQuantity')::numeric<>pg_catalog.trunc((product.value->'variant'->>'stockQuantity')::numeric)
      OR (product.value->'variant' ? 'sku' AND (
        pg_catalog.jsonb_typeof(product.value->'variant'->'sku')<>'string' OR product.value->'variant'->>'sku'!~'^[A-Z0-9][A-Z0-9._-]{0,63}$'))
      OR (product.value->'variant' ? 'barcode' AND (
        pg_catalog.jsonb_typeof(product.value->'variant'->'barcode')<>'string' OR pg_catalog.char_length(product.value->'variant'->>'barcode') NOT BETWEEN 1 AND 128
        OR product.value->'variant'->>'barcode'<>pg_catalog.btrim(product.value->'variant'->>'barcode') OR product.value->'variant'->>'barcode'~'[[:cntrl:]]'))
      OR (product.value->'variant' ? 'compareAtCents' AND (
        pg_catalog.jsonb_typeof(product.value->'variant'->'compareAtCents')<>'number'
        OR (product.value->'variant'->>'compareAtCents')::numeric<(product.value->'variant'->>'priceCents')::numeric
        OR (product.value->'variant'->>'compareAtCents')::numeric>9007199254740991
        OR (product.value->'variant'->>'compareAtCents')::numeric<>pg_catalog.trunc((product.value->'variant'->>'compareAtCents')::numeric)))
      OR pg_catalog.jsonb_typeof(product.value->'variant'->'attributes')<>'object'
      OR NOT saas.catalog_attributes_are_valid((product.value->'variant'->'attributes')-'Ağırlık (g)')
      OR (product.value->'variant'->'attributes' ? 'Ağırlık (g)' AND (
        product.value->'variant'->'attributes'->>'Ağırlık (g)'!~'^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$'
        OR (product.value->'variant'->'attributes'->>'Ağırlık (g)')::numeric<=0
        OR (product.value->'variant'->'attributes'->>'Ağırlık (g)')::numeric>1000000))
      OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(product.value->'categorySlugs') slug(value) WHERE slug.value!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR pg_catalog.char_length(slug.value)>100)
      OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(product.value->'brandSlugs') slug(value) WHERE slug.value!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR pg_catalog.char_length(slug.value)>100)
      OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(product.value->'sourceImageDigests') digest(value) WHERE digest.value!~'^[a-f0-9]{64}$')
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_products) product(value) GROUP BY product.value->>'sourceProductId' HAVING pg_catalog.count(*)>1
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_products) product(value) GROUP BY product.value->>'productId' HAVING pg_catalog.count(*)>1
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_products) product(value) GROUP BY product.value->'variant'->>'variantId' HAVING pg_catalog.count(*)>1
  ) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.migration.operation:'||p_operation_id::text,0));
  SELECT * INTO operation FROM saas.catalog_product_migration_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload||pg_catalog.jsonb_build_object('replayed',true); END IF;
    RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO job FROM saas.catalog_product_migration_jobs WHERE store_id=p_store_id AND id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'job_not_found',NULL::jsonb; RETURN; END IF;
  IF job.source_digest<>p_source_digest OR job.status<>'processing' THEN RETURN QUERY SELECT 'job_mismatch',NULL::jsonb; RETURN; END IF;
  batch_count:=pg_catalog.jsonb_array_length(p_products);
  SELECT COALESCE(pg_catalog.sum(pg_catalog.jsonb_array_length(product.value->'sourceImageDigests')),0)::integer
  INTO batch_media FROM pg_catalog.jsonb_array_elements(p_products) product(value);
  IF job.imported_products+batch_count>job.total_products
     OR (job.imported_products+batch_count=job.total_products AND (
       SELECT pg_catalog.count(*) FROM saas.catalog_product_migration_media_items WHERE store_id=p_store_id AND job_id=p_job_id
     )+batch_media<>job.total_media)
  THEN RETURN QUERY SELECT 'job_mismatch',NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_products) product(value)
    WHERE EXISTS(SELECT 1 FROM saas.catalog_product_migration_items item WHERE item.store_id=p_store_id AND item.job_id=p_job_id AND item.source_product_id=product.value->>'sourceProductId')
      OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(product.value->'categorySlugs') requested(value)
        WHERE NOT requested.value=ANY(job.category_slugs)
          OR NOT EXISTS(SELECT 1 FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.slug=requested.value AND category.status='active'))
      OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(product.value->'brandSlugs') requested(value)
        WHERE NOT requested.value=ANY(job.brand_slugs)
          OR NOT EXISTS(SELECT 1 FROM saas.catalog_admin_resources brand WHERE brand.store_id=p_store_id AND brand.resource_kind='brand' AND brand.slug=requested.value AND brand.status='active'))
  ) THEN RETURN QUERY SELECT 'import_conflict',NULL::jsonb; RETURN; END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.products WHERE store_id=p_store_id AND status<>'archived')+batch_count>p_products_limit
  THEN RETURN QUERY SELECT 'product_limit_reached',NULL::jsonb; RETURN; END IF;
  SELECT currency INTO store_currency FROM saas.stores WHERE id=p_store_id;

  BEGIN
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id',p_operation_id::text,true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
    FOR product_value IN SELECT value FROM pg_catalog.jsonb_array_elements(p_products) LOOP
      variant_value:=product_value->'variant';
      selected_product_id:=(product_value->>'productId')::uuid;
      selected_variant_id:=(variant_value->>'variantId')::uuid;
      INSERT INTO saas.products(id,store_id,slug,title,description,status,currency,version,created_at,updated_at)
      VALUES(selected_product_id,p_store_id,product_value->>'slug',product_value->>'title',product_value->>'description',product_value->>'status',store_currency,1,p_now,p_now);
      INSERT INTO saas.product_variants(
        id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at
      ) VALUES(
        selected_variant_id,selected_product_id,p_store_id,variant_value->>'title',variant_value->>'sku',variant_value->>'barcode',
        (variant_value->>'priceCents')::bigint,(variant_value->>'compareAtCents')::bigint,true,(variant_value->>'stockQuantity')::bigint,'active',
        (variant_value->'attributes')-'Ağırlık (g)'::text,1,p_now,p_now
      );
      INSERT INTO saas.catalog_product_profiles(product_id,store_id,product_type,minimum_purchase_quantity,version,created_at,updated_at)
      VALUES(selected_product_id,p_store_id,'physical',1,1,p_now,p_now);
      weight_grams:=variant_value->'attributes'->>'Ağırlık (g)';
      INSERT INTO saas.catalog_variant_commerce_profiles(
        variant_id,product_id,store_id,measured_quantity_milli,measured_unit,base_quantity_milli,base_unit,version,created_at,updated_at
      ) VALUES(
        selected_variant_id,selected_product_id,p_store_id,
        CASE WHEN weight_grams IS NULL THEN NULL ELSE (weight_grams::numeric*1000)::bigint END,
        CASE WHEN weight_grams IS NULL THEN NULL ELSE 'g' END,
        CASE WHEN weight_grams IS NULL THEN NULL ELSE 1000 END,
        CASE WHEN weight_grams IS NULL THEN NULL ELSE 'g' END,1,p_now,p_now
      );
      INSERT INTO saas.catalog_product_categories(store_id,product_id,category_id,position)
      SELECT p_store_id,selected_product_id,category.id,requested.ordinality-1
      FROM pg_catalog.jsonb_array_elements_text(product_value->'categorySlugs') WITH ORDINALITY requested(value,ordinality)
      JOIN saas.catalog_categories category ON category.store_id=p_store_id AND category.slug=requested.value AND category.status='active';
      INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position)
      SELECT p_store_id,brand.id,selected_product_id,
        COALESCE((SELECT pg_catalog.max(relation.position)+1 FROM saas.catalog_admin_resource_products relation WHERE relation.store_id=p_store_id AND relation.resource_id=brand.id),0)
      FROM pg_catalog.jsonb_array_elements_text(product_value->'brandSlugs') requested(value)
      JOIN saas.catalog_admin_resources brand ON brand.store_id=p_store_id AND brand.resource_kind='brand' AND brand.slug=requested.value AND brand.status='active';
      INSERT INTO saas.catalog_product_migration_items(store_id,job_id,source_product_id,product_id,variant_id,media_count,imported_at)
      VALUES(p_store_id,p_job_id,product_value->>'sourceProductId',selected_product_id,selected_variant_id,pg_catalog.jsonb_array_length(product_value->'sourceImageDigests'),p_now);
      INSERT INTO saas.catalog_product_migration_media_items(store_id,job_id,source_product_id,product_id,ordinal,source_url_digest,status,updated_at)
      SELECT p_store_id,p_job_id,product_value->>'sourceProductId',selected_product_id,requested.ordinality-1,requested.value,'pending',p_now
      FROM pg_catalog.jsonb_array_elements_text(product_value->'sourceImageDigests') WITH ORDINALITY requested(value,ordinality);
      mappings:=mappings||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('sourceProductId',product_value->>'sourceProductId','productId',selected_product_id));
    END LOOP;
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
    projected_status:=CASE
      WHEN job.imported_products+batch_count<job.total_products THEN 'processing'
      WHEN job.total_media=0 THEN 'completed'
      ELSE 'media_processing'
    END;
    UPDATE saas.catalog_product_migration_jobs
    SET imported_products=imported_products+batch_count,status=projected_status,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_job_id;
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR invalid_text_representation OR numeric_value_out_of_range OR raise_exception
    THEN
      PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
      PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
      PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
      RETURN QUERY SELECT 'import_conflict',NULL::jsonb; RETURN;
  END;
  result:=saas.catalog_migration_projection(p_store_id,p_job_id,false)||pg_catalog.jsonb_build_object('mappings',mappings);
  INSERT INTO saas.catalog_product_migration_operations(operation_id,store_id,job_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,p_job_id,'import_batch',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'batch_imported',result;
END
$function$;

CREATE FUNCTION saas.catalog_migration_authorize_media(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_job_id uuid,p_source_product_id text,p_ordinal integer,p_source_url_digest text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE
  authority_error text;
  job_status text;
  persisted_digest text;
BEGIN
  authority_error:=saas.catalog_migration_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_job_id IS NULL OR p_source_product_id IS NULL OR p_source_product_id!~'^[1-9][0-9]{0,19}$'
     OR p_ordinal NOT BETWEEN 0 AND 15 OR p_source_url_digest IS NULL OR p_source_url_digest!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT status INTO job_status FROM saas.catalog_product_migration_jobs
  WHERE store_id=p_store_id AND id=p_job_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'job_not_found',NULL::jsonb; RETURN; END IF;
  IF job_status='processing' THEN RETURN QUERY SELECT 'job_mismatch',NULL::jsonb; RETURN; END IF;
  SELECT source_url_digest::text INTO persisted_digest
  FROM saas.catalog_product_migration_media_items
  WHERE store_id=p_store_id AND job_id=p_job_id
    AND source_product_id=p_source_product_id AND ordinal=p_ordinal;
  IF NOT FOUND OR persisted_digest<>p_source_url_digest
  THEN RETURN QUERY SELECT 'media_not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'authorized',saas.catalog_migration_media_projection(p_store_id,p_job_id,p_source_product_id,p_ordinal);
END
$function$;

CREATE FUNCTION saas.catalog_migration_record_media(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_source_product_id text,p_ordinal integer,
  p_source_url_digest text,p_outcome text,p_media_id uuid,p_safe_failure_code text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE
  authority_error text;
  operation saas.catalog_product_migration_operations%ROWTYPE;
  job saas.catalog_product_migration_jobs%ROWTYPE;
  media_item saas.catalog_product_migration_media_items%ROWTYPE;
  migration_item saas.catalog_product_migration_items%ROWTYPE;
  next_committed integer;
  next_failed integer;
  next_status text;
  result jsonb;
BEGIN
  authority_error:=saas.catalog_migration_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_job_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_source_product_id IS NULL OR p_source_product_id!~'^[1-9][0-9]{0,19}$'
     OR p_ordinal NOT BETWEEN 0 AND 15 OR p_source_url_digest IS NULL OR p_source_url_digest!~'^[a-f0-9]{64}$'
     OR p_outcome NOT IN('committed','failed')
     OR (p_outcome='committed' AND (p_media_id IS NULL OR p_safe_failure_code IS NOT NULL))
     OR (p_outcome='failed' AND (p_media_id IS NOT NULL OR p_safe_failure_code IS NULL OR p_safe_failure_code!~'^[a-z0-9_]{1,64}$'))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.migration.operation:'||p_operation_id::text,0));
  SELECT * INTO operation FROM saas.catalog_product_migration_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload||pg_catalog.jsonb_build_object('replayed',true); END IF;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO job FROM saas.catalog_product_migration_jobs
  WHERE store_id=p_store_id AND id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'job_not_found',NULL::jsonb; RETURN; END IF;
  IF job.status='processing' OR p_now<job.updated_at
  THEN RETURN QUERY SELECT 'job_mismatch',NULL::jsonb; RETURN; END IF;

  SELECT * INTO media_item FROM saas.catalog_product_migration_media_items
  WHERE store_id=p_store_id AND job_id=p_job_id
    AND source_product_id=p_source_product_id AND ordinal=p_ordinal FOR UPDATE;
  IF NOT FOUND OR media_item.source_url_digest::text<>p_source_url_digest
  THEN RETURN QUERY SELECT 'media_not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO migration_item FROM saas.catalog_product_migration_items
  WHERE store_id=p_store_id AND job_id=p_job_id AND source_product_id=p_source_product_id;
  IF NOT FOUND OR migration_item.product_id<>media_item.product_id
  THEN RETURN QUERY SELECT 'media_not_found',NULL::jsonb; RETURN; END IF;

  IF p_outcome='failed' THEN
    IF media_item.status<>'pending' THEN RETURN QUERY SELECT 'media_state_invalid',NULL::jsonb; RETURN; END IF;
    next_committed:=job.committed_media;
    next_failed:=job.failed_media+1;
    UPDATE saas.catalog_product_migration_media_items
    SET status='failed',safe_failure_code=p_safe_failure_code,committed_media_id=NULL,updated_at=p_now
    WHERE store_id=p_store_id AND job_id=p_job_id AND source_product_id=p_source_product_id AND ordinal=p_ordinal;
  ELSE
    IF media_item.status NOT IN('pending','failed') THEN RETURN QUERY SELECT 'media_state_invalid',NULL::jsonb; RETURN; END IF;
    IF NOT EXISTS(
      SELECT 1 FROM saas.product_media selected
      WHERE selected.store_id=p_store_id AND selected.id=p_media_id
        AND selected.product_id=migration_item.product_id
        AND selected.variant_id=migration_item.variant_id AND selected.status='active'
    ) THEN RETURN QUERY SELECT 'media_not_found',NULL::jsonb; RETURN; END IF;
    next_committed:=job.committed_media+1;
    next_failed:=job.failed_media-CASE WHEN media_item.status='failed' THEN 1 ELSE 0 END;
    UPDATE saas.catalog_product_migration_media_items
    SET status='committed',safe_failure_code=NULL,committed_media_id=p_media_id,updated_at=p_now
    WHERE store_id=p_store_id AND job_id=p_job_id AND source_product_id=p_source_product_id AND ordinal=p_ordinal;
  END IF;

  next_status:=CASE
    WHEN next_committed+next_failed<job.total_media THEN 'media_processing'
    WHEN next_failed=0 THEN 'completed'
    ELSE 'completed_with_failures'
  END;
  UPDATE saas.catalog_product_migration_jobs
  SET committed_media=next_committed,failed_media=next_failed,status=next_status,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_job_id;
  result:=saas.catalog_migration_projection(p_store_id,p_job_id,false);
  INSERT INTO saas.catalog_product_migration_operations(
    operation_id,store_id,job_id,operation_kind,payload_fingerprint,result_payload,committed_at
  ) VALUES(p_operation_id,p_store_id,p_job_id,'record_media',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'media_recorded',result;
END
$function$;

CREATE FUNCTION saas.catalog_migration_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_job_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.catalog_migration_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.catalog_product_migration_jobs WHERE store_id=p_store_id AND id=p_job_id)
  THEN RETURN QUERY SELECT 'job_not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',saas.catalog_migration_projection(p_store_id,p_job_id,false);
END
$function$;

CREATE FUNCTION saas.catalog_migration_recover_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; operation saas.catalog_product_migration_operations%ROWTYPE;
BEGIN
  authority_error:=saas.catalog_migration_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.catalog_product_migration_operations WHERE operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb; RETURN; END IF;
  IF operation.store_id<>p_store_id OR operation.payload_fingerprint<>p_fingerprint
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed',operation.result_payload||pg_catalog.jsonb_build_object('replayed',true);
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_migration_json_exact(jsonb,text[],text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_migration_projection(uuid,uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_migration_media_projection(uuid,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_migration_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_migration_import_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,jsonb) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_migration_get(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_migration_authorize_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,integer,text) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_migration_record_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,text,text,uuid,text) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_migration_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) FROM PUBLIC,celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_migration_begin(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,integer,jsonb,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_migration_import_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_migration_get(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_migration_authorize_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,integer,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_migration_record_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,text,text,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_migration_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) TO celebix_saas_app;

COMMIT;
