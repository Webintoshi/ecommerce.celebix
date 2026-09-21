-- Admin-only catalog-declared weight. It never participates in price calculation or public DTOs.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE TABLE saas.catalog_weight_store_profiles (
  store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,
  mode text NOT NULL CHECK (mode IN ('general','jewelry')),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  updated_by uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL CHECK (pg_catalog.isfinite(updated_at))
);

CREATE TABLE saas.catalog_weight_declarations (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid,
  grams_milli bigint NOT NULL CHECK (grams_milli BETWEEN 1 AND 1000000000),
  weight_scope text NOT NULL CHECK (weight_scope IN ('net_metal','total_product','unspecified')),
  sales_unit text NOT NULL CHECK (sales_unit IN ('single','pair','set','unspecified')),
  approximate boolean NOT NULL,
  tolerance_basis_points integer CHECK (tolerance_basis_points BETWEEN 1 AND 10000),
  source text NOT NULL CHECK (source IN ('description','manual')),
  source_excerpt text,
  source_digest char(64),
  source_product_version bigint,
  import_operation_id uuid,
  pricing_verified boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  updated_by uuid NOT NULL REFERENCES saas.principals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL CHECK (pg_catalog.isfinite(created_at)),
  updated_at timestamptz NOT NULL CHECK (pg_catalog.isfinite(updated_at) AND updated_at>=created_at),
  UNIQUE NULLS NOT DISTINCT (store_id,product_id,variant_id),
  UNIQUE (store_id,id),
  FOREIGN KEY (store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (store_id,variant_id) REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  CHECK (approximate OR tolerance_basis_points IS NULL),
  CHECK ((source='manual' AND source_excerpt IS NULL AND source_digest IS NULL
      AND source_product_version IS NULL AND import_operation_id IS NULL)
    OR (source='description' AND source_excerpt IS NOT NULL
      AND source_excerpt=pg_catalog.btrim(source_excerpt)
      AND pg_catalog.char_length(source_excerpt) BETWEEN 1 AND 240
      AND source_excerpt!~'[[:cntrl:]]'
      AND source_digest~'^[a-f0-9]{64}$' AND source_product_version>0
      AND import_operation_id IS NOT NULL)),
  CHECK (pricing_verified=false)
);

CREATE TABLE saas.catalog_weight_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  operation_kind text NOT NULL CHECK (operation_kind IN ('manual_save','description_import','import_rollback','profile_set')),
  payload_fingerprint char(64) NOT NULL CHECK (payload_fingerprint~'^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=65536),
  committed_at timestamptz NOT NULL CHECK (pg_catalog.isfinite(committed_at)),
  UNIQUE (store_id,operation_id)
);

ALTER TABLE saas.catalog_weight_store_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_weight_store_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_weight_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_weight_declarations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_weight_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_weight_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.catalog_weight_store_profiles,saas.catalog_weight_declarations,saas.catalog_weight_operations
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

CREATE FUNCTION saas.catalog_weight_projection(p_store_id uuid,p_product_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'profileMode',profile.mode,
    'productVersion',product.version,
    'declarations',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',declaration.id,'productId',declaration.product_id,'variantId',declaration.variant_id,
      'gramsMilli',declaration.grams_milli,'scope',declaration.weight_scope,'salesUnit',declaration.sales_unit,
      'approximate',declaration.approximate,'toleranceBasisPoints',declaration.tolerance_basis_points,
      'source',declaration.source,'sourceExcerpt',declaration.source_excerpt,'sourceDigest',declaration.source_digest,
      'sourceProductVersion',declaration.source_product_version,'pricingVerified',declaration.pricing_verified,
      'version',declaration.version,'updatedAt',to_char(declaration.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) ORDER BY declaration.variant_id NULLS FIRST,declaration.id), '[]'::jsonb)
  )
  FROM saas.products product
  LEFT JOIN saas.catalog_weight_store_profiles profile ON profile.store_id=product.store_id
  WHERE product.store_id=p_store_id AND product.id=p_product_id
$fn$;

CREATE FUNCTION saas.catalog_weight_operation_result(
  p_store_id uuid,p_operation_id uuid,p_kind text,p_fingerprint text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE prior saas.catalog_weight_operations%ROWTYPE;
BEGIN
  SELECT * INTO prior FROM saas.catalog_weight_operations WHERE operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF prior.store_id=p_store_id AND prior.operation_kind=p_kind AND prior.payload_fingerprint=p_fingerprint THEN
    RETURN QUERY SELECT 'operation_replayed',prior.result_payload; RETURN;
  END IF;
  RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END $fn$;

CREATE FUNCTION saas.catalog_weight_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_product_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; projected jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_product_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT saas.catalog_weight_projection(p_store_id,p_product_id) INTO projected;
  IF projected IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',projected;
END $fn$;

CREATE FUNCTION saas.catalog_weight_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_declaration_id uuid,
  p_product_id uuid,p_variant_id uuid,p_expected_product_version bigint,p_expected_variant_version bigint,
  p_expected_declaration_version bigint,p_grams_milli bigint,p_scope text,p_sales_unit text,
  p_approximate boolean,p_tolerance_basis_points integer
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; prior saas.catalog_weight_operations%ROWTYPE; existing saas.catalog_weight_declarations%ROWTYPE;
  selected_product saas.products%ROWTYPE; selected_variant saas.product_variants%ROWTYPE; projected jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_declaration_id IS NULL OR p_product_id IS NULL OR p_fingerprint IS NULL
    OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_product_version<1 OR p_expected_declaration_version<0
    OR p_grams_milli NOT BETWEEN 1 AND 1000000000 OR p_scope NOT IN ('net_metal','total_product','unspecified')
    OR p_sales_unit NOT IN ('single','pair','set','unspecified') OR p_approximate IS NULL
    OR (p_tolerance_basis_points IS NOT NULL AND p_tolerance_basis_points NOT BETWEEN 1 AND 10000)
    OR (NOT p_approximate AND p_tolerance_basis_points IS NOT NULL)
    OR (p_variant_id IS NULL AND p_expected_variant_version IS NOT NULL)
    OR (p_variant_id IS NOT NULL AND (p_expected_variant_version IS NULL OR p_expected_variant_version<1)) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.catalog_weight_store_profiles WHERE store_id=p_store_id) THEN
    RETURN QUERY SELECT 'profile_not_enabled',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.weight.operation:'||p_operation_id::text,0));
  SELECT * INTO prior FROM saas.catalog_weight_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='manual_save'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
    CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='manual_save'
      AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO selected_product FROM saas.products WHERE store_id=p_store_id AND id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF selected_product.version<>p_expected_product_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF p_variant_id IS NOT NULL THEN
    SELECT * INTO selected_variant FROM saas.product_variants WHERE store_id=p_store_id AND product_id=p_product_id AND id=p_variant_id FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF selected_variant.version<>p_expected_variant_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  END IF;
  SELECT * INTO existing FROM saas.catalog_weight_declarations
    WHERE store_id=p_store_id AND product_id=p_product_id AND variant_id IS NOT DISTINCT FROM p_variant_id FOR UPDATE;
  IF FOUND AND (existing.version<>p_expected_declaration_version OR existing.id<>p_declaration_id) THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF NOT FOUND AND p_expected_declaration_version<>0 THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.catalog_weight_declarations(id,store_id,product_id,variant_id,grams_milli,weight_scope,sales_unit,
    approximate,tolerance_basis_points,source,pricing_verified,version,updated_by,created_at,updated_at)
  VALUES(p_declaration_id,p_store_id,p_product_id,p_variant_id,p_grams_milli,p_scope,p_sales_unit,
    p_approximate,p_tolerance_basis_points,'manual',false,1,p_principal_id,p_now,p_now)
  ON CONFLICT (store_id,product_id,variant_id) DO UPDATE SET grams_milli=EXCLUDED.grams_milli,
    weight_scope=EXCLUDED.weight_scope,sales_unit=EXCLUDED.sales_unit,approximate=EXCLUDED.approximate,
    tolerance_basis_points=EXCLUDED.tolerance_basis_points,source='manual',source_excerpt=NULL,source_digest=NULL,
    source_product_version=NULL,import_operation_id=NULL,pricing_verified=false,version=saas.catalog_weight_declarations.version+1,
    updated_by=p_principal_id,updated_at=p_now;
  SELECT saas.catalog_weight_projection(p_store_id,p_product_id) INTO projected;
  INSERT INTO saas.catalog_weight_operations VALUES(p_operation_id,p_store_id,'manual_save',p_fingerprint,projected,p_now);
  RETURN QUERY SELECT 'saved',projected;
END $fn$;

CREATE FUNCTION saas.catalog_weight_profile_set(
  p_store_id uuid,p_operation_id uuid,p_fingerprint text,p_mode text,p_workflow_principal_id uuid,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE prior saas.catalog_weight_operations%ROWTYPE; existing saas.catalog_weight_store_profiles%ROWTYPE;
  result jsonb; was_existing boolean:=false;
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL
    OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_mode NOT IN ('general','jewelry') OR p_workflow_principal_id IS NULL
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.weight.operation:'||p_operation_id::text,0));
  SELECT * INTO prior FROM saas.catalog_weight_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='profile_set'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
    CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='profile_set'
      AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO existing FROM saas.catalog_weight_store_profiles WHERE store_id=p_store_id FOR UPDATE;
  was_existing:=FOUND;
  IF was_existing AND existing.mode<>p_mode THEN RETURN QUERY SELECT 'existing_value_preserved',NULL::jsonb; RETURN; END IF;
  IF NOT was_existing THEN INSERT INTO saas.catalog_weight_store_profiles(store_id,mode,version,updated_by,updated_at)
    VALUES(p_store_id,p_mode,1,p_workflow_principal_id,p_now); END IF;
  result:=pg_catalog.jsonb_build_object('storeId',p_store_id,'mode',p_mode,'version',COALESCE(existing.version,1));
  INSERT INTO saas.catalog_weight_operations VALUES(p_operation_id,p_store_id,'profile_set',p_fingerprint,result,p_now);
  RETURN QUERY SELECT CASE WHEN was_existing THEN 'profile_preserved' ELSE 'profile_set' END,result;
END $fn$;

-- Workflow-only exact import. The caller supplies a manifest fingerprint and preallocated declaration id.
CREATE FUNCTION saas.catalog_weight_import(
  p_store_id uuid,p_operation_id uuid,p_fingerprint text,p_declaration_id uuid,p_product_id uuid,p_variant_id uuid,
  p_expected_product_version bigint,p_expected_variant_version bigint,p_source_digest text,p_source_excerpt text,
  p_grams_milli bigint,p_scope text,p_sales_unit text,p_approximate boolean,p_tolerance_basis_points integer,
  p_workflow_principal_id uuid,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE prior saas.catalog_weight_operations%ROWTYPE; product_row saas.products%ROWTYPE; variant_row saas.product_variants%ROWTYPE;
  projected jsonb; current_digest text;
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL OR p_declaration_id IS NULL OR p_product_id IS NULL OR p_variant_id IS NULL
    OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_source_digest!~'^[a-f0-9]{64}$'
    OR p_source_excerpt IS NULL OR p_source_excerpt<>pg_catalog.btrim(p_source_excerpt)
    OR pg_catalog.char_length(p_source_excerpt) NOT BETWEEN 1 AND 240 OR p_source_excerpt~'[[:cntrl:]]'
    OR p_expected_product_version<1 OR p_expected_variant_version<1 OR p_grams_milli NOT BETWEEN 1 AND 1000000000
    OR p_scope NOT IN ('net_metal','total_product','unspecified') OR p_sales_unit NOT IN ('single','pair','set','unspecified')
    OR p_approximate OR p_tolerance_basis_points IS NOT NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.weight.operation:'||p_operation_id::text,0));
  SELECT * INTO prior FROM saas.catalog_weight_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='description_import'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
    CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='description_import'
      AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO product_row FROM saas.products WHERE store_id=p_store_id AND id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO variant_row FROM saas.product_variants WHERE store_id=p_store_id AND product_id=p_product_id AND id=p_variant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  current_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(COALESCE(product_row.description,''),'UTF8')),'hex');
  IF product_row.version<>p_expected_product_version OR variant_row.version<>p_expected_variant_version
    OR current_digest<>p_source_digest THEN RETURN QUERY SELECT 'stale_source',NULL::jsonb; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM saas.catalog_weight_declarations WHERE store_id=p_store_id AND product_id=p_product_id
    AND variant_id IS NOT DISTINCT FROM p_variant_id) THEN RETURN QUERY SELECT 'existing_value_preserved',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.catalog_weight_declarations(id,store_id,product_id,variant_id,grams_milli,weight_scope,sales_unit,
    approximate,tolerance_basis_points,source,source_excerpt,source_digest,source_product_version,import_operation_id,
    pricing_verified,version,updated_by,created_at,updated_at)
  VALUES(p_declaration_id,p_store_id,p_product_id,p_variant_id,p_grams_milli,p_scope,p_sales_unit,false,NULL,
    'description',p_source_excerpt,p_source_digest,p_expected_product_version,p_operation_id,false,1,p_workflow_principal_id,p_now,p_now);
  SELECT saas.catalog_weight_projection(p_store_id,p_product_id) INTO projected;
  INSERT INTO saas.catalog_weight_operations VALUES(p_operation_id,p_store_id,'description_import',p_fingerprint,projected,p_now);
  RETURN QUERY SELECT 'imported',projected;
END $fn$;

CREATE FUNCTION saas.catalog_weight_import_rollback(
  p_store_id uuid,p_operation_id uuid,p_fingerprint text,p_import_operation_id uuid,p_product_id uuid,p_variant_id uuid,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE prior saas.catalog_weight_operations%ROWTYPE; target saas.catalog_weight_declarations%ROWTYPE; result jsonb;
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL OR p_import_operation_id IS NULL
    OR p_product_id IS NULL OR p_variant_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.weight.operation:'||p_operation_id::text,0));
  SELECT * INTO prior FROM saas.catalog_weight_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='import_rollback'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
    CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='import_rollback'
      AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END; RETURN; END IF;
  SELECT * INTO target FROM saas.catalog_weight_declarations WHERE store_id=p_store_id AND product_id=p_product_id
    AND variant_id=p_variant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF target.source<>'description' OR target.import_operation_id<>p_import_operation_id OR target.version<>1 THEN
    RETURN QUERY SELECT 'later_change_preserved',NULL::jsonb; RETURN;
  END IF;
  DELETE FROM saas.catalog_weight_declarations WHERE id=target.id;
  result:=pg_catalog.jsonb_build_object('productId',p_product_id,'variantId',p_variant_id,'removedDeclarationId',target.id);
  INSERT INTO saas.catalog_weight_operations VALUES(p_operation_id,p_store_id,'import_rollback',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'rolled_back',result;
END $fn$;

REVOKE ALL ON FUNCTION saas.catalog_weight_projection(uuid,uuid),saas.catalog_weight_operation_result(uuid,uuid,text,text),
  saas.catalog_weight_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.catalog_weight_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,text,boolean,integer),
  saas.catalog_weight_profile_set(uuid,uuid,text,text,uuid,timestamptz),
  saas.catalog_weight_import(uuid,uuid,text,uuid,uuid,uuid,bigint,bigint,text,text,bigint,text,text,boolean,integer,uuid,timestamptz),
  saas.catalog_weight_import_rollback(uuid,uuid,text,uuid,uuid,uuid,timestamptz)
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.catalog_weight_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.catalog_weight_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,text,boolean,integer),
  saas.catalog_weight_operation_result(uuid,uuid,text,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_weight_import(uuid,uuid,text,uuid,uuid,uuid,bigint,bigint,text,text,bigint,text,text,boolean,integer,uuid,timestamptz),
  saas.catalog_weight_import_rollback(uuid,uuid,text,uuid,uuid,uuid,timestamptz),
  saas.catalog_weight_profile_set(uuid,uuid,text,text,uuid,timestamptz),
  saas.catalog_weight_operation_result(uuid,uuid,text,text) TO celebix_saas_workflow;
ALTER FUNCTION saas.catalog_weight_projection(uuid,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.catalog_weight_operation_result(uuid,uuid,text,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.catalog_weight_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.catalog_weight_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,text,boolean,integer) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.catalog_weight_profile_set(uuid,uuid,text,text,uuid,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.catalog_weight_import(uuid,uuid,text,uuid,uuid,uuid,bigint,bigint,text,text,bigint,text,text,boolean,integer,uuid,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.catalog_weight_import_rollback(uuid,uuid,text,uuid,uuid,uuid,timestamptz) OWNER TO celebix_saas_owner;
COMMIT;
