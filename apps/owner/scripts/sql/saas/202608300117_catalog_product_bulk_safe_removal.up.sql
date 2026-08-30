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

CREATE FUNCTION saas.catalog_product_removal_eligibility(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_products_limit bigint,p_now timestamptz,p_product_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; selected saas.products%ROWTYPE; dependency regclass; dependency_found boolean; reasons jsonb:='[]'::jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.archive');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT product.* INTO selected FROM saas.products AS product WHERE product.store_id=p_store_id AND product.id=p_product_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected.status<>'archived' THEN reasons:=reasons||'"product_not_archived"'::jsonb; END IF;
  IF EXISTS(SELECT 1 FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.object_deleted_at IS NULL) THEN reasons:=reasons||'"media_not_cleaned"'::jsonb; END IF;
  FOR dependency IN
    SELECT DISTINCT constraint_row.conrelid::regclass
    FROM pg_catalog.pg_constraint AS constraint_row
    JOIN pg_catalog.pg_class AS dependent_class ON dependent_class.oid=constraint_row.conrelid
    JOIN pg_catalog.pg_namespace AS dependent_namespace ON dependent_namespace.oid=dependent_class.relnamespace AND dependent_namespace.nspname='saas'
    WHERE constraint_row.contype='f' AND constraint_row.confrelid IN('saas.products'::regclass,'saas.product_variants'::regclass)
      AND dependent_class.relname NOT IN(
        'product_variants','catalog_operations','catalog_product_profiles','catalog_product_categories',
        'catalog_variant_commerce_profiles','catalog_product_channels','catalog_onboarding_operations',
        'catalog_admin_resource_products','product_media','store_media_operations','product_media_archive_operations',
        'product_media_cleanup_operations'
      )
  LOOP
    EXECUTE pg_catalog.format(
      'SELECT EXISTS(SELECT 1 FROM %s AS dependent WHERE to_jsonb(dependent)->>''store_id''=$1::text AND ((to_jsonb(dependent)->>''product_id''=$2::text) OR (to_jsonb(dependent)->>''variant_id'' IN(SELECT variant.id::text FROM saas.product_variants AS variant WHERE variant.store_id=$1 AND variant.product_id=$2))))',
      dependency
    ) INTO dependency_found USING p_store_id,p_product_id;
    IF dependency_found THEN reasons:=reasons||'"business_dependency"'::jsonb; EXIT; END IF;
  END LOOP;
  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_build_object('eligible',pg_catalog.jsonb_array_length(reasons)=0,'reasons',reasons,'productId',selected.id,'expectedVersion',selected.version);
END
$function$;

CREATE FUNCTION saas.catalog_get_product_preview(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_product_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; hostname text; projection jsonb;
BEGIN
 authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.products AS product WHERE product.store_id=p_store_id AND product.id=p_product_id) THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
 SELECT domain.hostname INTO hostname FROM saas.store_domains AS domain WHERE domain.store_id=p_store_id AND domain.status='active' AND domain.is_primary ORDER BY domain.id LIMIT 1;
 IF hostname IS NULL THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
 SELECT pg_catalog.jsonb_build_object(
   'canonicalStorefrontUrl','https://'||hostname||'/products/'||product.slug,
   'product',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',product.id,'slug',product.slug,'title',product.title,'description',product.description,'status',product.status,'currency',product.currency,'version',product.version)),
   'variants',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('title',variant.title,'priceCents',variant.price_cents,'compareAtCents',variant.compare_at_cents,'stockTracking',variant.stock_tracking,'stockQuantity',variant.stock_quantity,'attributes',variant.attributes)) ORDER BY variant.created_at,variant.id) FROM saas.product_variants AS variant WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id AND variant.status='active'),'[]'::jsonb),
   'media',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('publicUrl',media.public_url,'altText',media.alt_text,'width',media.width,'height',media.height)) ORDER BY media.sort_order,media.id) FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.status='active'),'[]'::jsonb),
   'merchandising',COALESCE((SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('seoTitle',profile.seo_title,'seoDescription',profile.seo_description)) FROM saas.catalog_product_profiles AS profile WHERE profile.store_id=p_store_id AND profile.product_id=p_product_id),'{}'::jsonb)
 ) INTO projection FROM saas.products AS product WHERE product.store_id=p_store_id AND product.id=p_product_id;
 RETURN QUERY SELECT 'found'::text,projection;
END
$function$;

CREATE OR REPLACE FUNCTION saas.guard_catalog_operation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF TG_OP='DELETE' AND pg_catalog.current_setting('celebix.catalog_safe_remove',true)=OLD.store_id::text||':'||COALESCE(OLD.result_product_id::text,'') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'CATALOG_OPERATION_IMMUTABLE';
END
$function$;

CREATE OR REPLACE FUNCTION saas.guard_catalog_onboarding_operation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF TG_OP='DELETE' AND pg_catalog.current_setting('celebix.catalog_safe_remove',true)=OLD.store_id::text||':'||COALESCE(OLD.result_product_id::text,'') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'CATALOG_ONBOARDING_OPERATION_IMMUTABLE';
END
$function$;

CREATE OR REPLACE FUNCTION saas.guard_store_media_operation_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF TG_OP='DELETE' AND pg_catalog.current_setting('celebix.catalog_safe_remove',true)=OLD.store_id::text||':'||OLD.product_id::text THEN RETURN OLD; END IF;
  IF TG_OP='DELETE' OR NEW.operation_id IS DISTINCT FROM OLD.operation_id OR NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.media_id IS DISTINCT FROM OLD.media_id OR NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.variant_id IS DISTINCT FROM OLD.variant_id OR NEW.object_key IS DISTINCT FROM OLD.object_key OR NEW.public_url IS DISTINCT FROM OLD.public_url OR NEW.media_type IS DISTINCT FROM OLD.media_type OR NEW.alt_text IS DISTINCT FROM OLD.alt_text OR NEW.width IS DISTINCT FROM OLD.width OR NEW.height IS DISTINCT FROM OLD.height OR NEW.byte_size IS DISTINCT FROM OLD.byte_size OR NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256 OR NEW.payload_fingerprint IS DISTINCT FROM OLD.payload_fingerprint OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.version<>OLD.version+1 OR NEW.updated_at<=OLD.updated_at OR NOT((OLD.state='reserved' AND NEW.state IN('uploaded','cleanup_required')) OR (OLD.state='uploaded' AND NEW.state IN('committed','cleanup_required')) OR (OLD.state='cleanup_required' AND NEW.state='deleted')) THEN RAISE EXCEPTION 'STORE_MEDIA_OPERATION_MUTATION_FORBIDDEN'; END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION saas.guard_product_media_archive_operation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF TG_OP='DELETE' AND pg_catalog.current_setting('celebix.catalog_safe_remove',true)=OLD.store_id::text||':'||OLD.product_id::text THEN RETURN OLD; END IF;
  IF TG_OP='DELETE' OR NEW.operation_id<>OLD.operation_id OR NEW.store_id<>OLD.store_id OR NEW.media_id<>OLD.media_id OR NEW.product_id<>OLD.product_id OR NEW.object_key<>OLD.object_key OR NEW.payload_fingerprint<>OLD.payload_fingerprint OR NEW.expected_version<>OLD.expected_version OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at OR NOT((OLD.state='reserved' AND NEW.state='committed' AND OLD.committed_at IS NULL AND NEW.committed_at=NEW.updated_at AND NEW.deleted_at IS NULL) OR (OLD.state='committed' AND NEW.state='deleted' AND NEW.committed_at=OLD.committed_at AND OLD.deleted_at IS NULL AND NEW.deleted_at=NEW.updated_at)) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_ARCHIVE_OPERATION_MUTATION_FORBIDDEN'; END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION saas.catalog_remove_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; existing saas.catalog_operations%ROWTYPE; eligibility record; projection jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.archive');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id=p_store_id AND existing.operation_kind='remove_product' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN; END IF;
  PERFORM 1 FROM saas.products AS product WHERE product.store_id=p_store_id AND product.id=p_product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF (SELECT product.version FROM saas.products AS product WHERE product.store_id=p_store_id AND product.id=p_product_id)<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  SELECT check_result.outcome,check_result.result_payload INTO eligibility FROM saas.catalog_product_removal_eligibility(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_product_id) AS check_result;
  IF eligibility.outcome<>'found' THEN RETURN QUERY SELECT eligibility.outcome,NULL::jsonb; RETURN; END IF;
  IF NOT (eligibility.result_payload->>'eligible')::boolean THEN RETURN QUERY SELECT 'removal_not_eligible'::text,eligibility.result_payload; RETURN; END IF;
  PERFORM pg_catalog.set_config('celebix.catalog_safe_remove',p_store_id::text||':'||p_product_id::text,true);
  IF pg_catalog.to_regclass('saas.product_media_cleanup_operations') IS NOT NULL THEN EXECUTE 'DELETE FROM saas.product_media_cleanup_operations WHERE store_id=$1 AND product_id=$2' USING p_store_id,p_product_id; END IF;
  DELETE FROM saas.product_media_archive_operations WHERE store_id=p_store_id AND product_id=p_product_id;
  DELETE FROM saas.store_media_operations WHERE store_id=p_store_id AND product_id=p_product_id;
  DELETE FROM saas.product_media WHERE store_id=p_store_id AND product_id=p_product_id;
  DELETE FROM saas.catalog_admin_resource_products WHERE store_id=p_store_id AND product_id=p_product_id;
  DELETE FROM saas.catalog_product_channels WHERE store_id=p_store_id AND product_id=p_product_id;
  DELETE FROM saas.catalog_product_categories WHERE store_id=p_store_id AND product_id=p_product_id;
  DELETE FROM saas.catalog_variant_commerce_profiles WHERE store_id=p_store_id AND product_id=p_product_id;
  DELETE FROM saas.catalog_onboarding_operations WHERE store_id=p_store_id AND result_product_id=p_product_id;
  DELETE FROM saas.catalog_operations WHERE store_id=p_store_id AND result_product_id=p_product_id;
  DELETE FROM saas.product_variants WHERE store_id=p_store_id AND product_id=p_product_id;
  DELETE FROM saas.catalog_product_profiles WHERE store_id=p_store_id AND product_id=p_product_id;
  DELETE FROM saas.products WHERE store_id=p_store_id AND id=p_product_id;
  projection:=pg_catalog.jsonb_build_object('removed',true,'productId',p_product_id);
  INSERT INTO saas.catalog_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_product_id,result_variant_id,result_payload,committed_at) VALUES(p_operation_id,p_store_id,'remove_product',p_fingerprint,NULL,NULL,projection,p_now);
  RETURN QUERY SELECT 'removed'::text,projection;
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb) TO celebix_saas_app;
ALTER FUNCTION saas.catalog_bulk_mutate_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text,jsonb) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.catalog_product_removal_eligibility(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_get_product_preview(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_remove_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_product_removal_eligibility(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_preview(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_remove_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
ALTER FUNCTION saas.catalog_product_removal_eligibility(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.catalog_get_product_preview(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.catalog_remove_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) OWNER TO celebix_saas_owner;

COMMIT;
