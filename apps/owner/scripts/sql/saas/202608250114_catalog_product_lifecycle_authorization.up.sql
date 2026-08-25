BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.product_variants
  ADD COLUMN archived_by_product boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT product_variants_product_archive_origin_check CHECK (
    status='archived' OR archived_by_product=false
  );

UPDATE saas.product_variants AS variant
SET archived_by_product=true
FROM saas.products AS product
WHERE product.id=variant.product_id
  AND product.store_id=variant.store_id
  AND product.status='archived'
  AND variant.status='archived'
  AND product.archived_at IS NOT NULL
  AND variant.archived_at=product.archived_at;

ALTER TABLE saas.catalog_operations
  DROP CONSTRAINT catalog_operations_kind_check,
  DROP CONSTRAINT catalog_operations_result_shape_check,
  DROP CONSTRAINT catalog_operations_variant_kind_check,
  ADD CONSTRAINT catalog_operations_kind_check CHECK (operation_kind IN (
    'create_product','update_product','archive_product','restore_product',
    'create_variant','update_variant','archive_variant'
  )),
  ADD CONSTRAINT catalog_operations_result_shape_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=32768
    AND result_payload ? 'product' = (operation_kind IN ('create_product','update_product','archive_product','restore_product'))
    AND result_payload ? 'variant' = (operation_kind IN ('create_variant','update_variant','archive_variant'))
    AND result_payload ? 'initialVariant' = (operation_kind='create_product')
  ),
  ADD CONSTRAINT catalog_operations_variant_kind_check CHECK (
    (operation_kind IN ('create_product','create_variant','update_variant','archive_variant') AND result_variant_id IS NOT NULL)
    OR (operation_kind IN ('update_product','archive_product','restore_product') AND result_variant_id IS NULL)
  );

CREATE FUNCTION saas.media_product_operation_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_storage_bytes bigint,p_now timestamptz,p_required_action text
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE action_error text;
BEGIN
  IF p_storage_bytes IS NULL OR p_storage_bytes<0 THEN RETURN 'invalid_input'; END IF;
  action_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'media',p_required_action
  );
  IF action_error='durable_authority_invalid' THEN RETURN 'feature_not_enabled'; END IF;
  IF action_error IS NOT NULL THEN RETURN action_error; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.plan_limits AS plan_limit
    WHERE plan_limit.plan_id=p_plan_id AND plan_limit.limit_key='storageBytes'
      AND plan_limit.effective_limit=p_storage_bytes
  ) THEN RETURN 'feature_not_enabled'; END IF;
  RETURN NULL;
END
$function$;
REVOKE ALL ON FUNCTION saas.media_product_operation_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION saas.media_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_storage_bytes bigint,p_now timestamptz
)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
  SELECT saas.media_product_operation_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_storage_bytes,p_now,'catalog_admin.manage'
  )
$function$;

CREATE FUNCTION saas.media_read_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_storage_bytes bigint,p_now timestamptz
)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
  SELECT saas.media_product_operation_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_storage_bytes,p_now,'catalog_admin.read'
  )
$function$;
REVOKE ALL ON FUNCTION saas.media_read_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION saas.media_list_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_storage_bytes bigint,p_now timestamptz,p_product_id uuid,p_include_archived boolean
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.media_read_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_include_archived IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.products AS product
    WHERE product.id=p_product_id AND product.store_id=p_store_id
  ) THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,COALESCE(
    pg_catalog.jsonb_agg(saas.media_projection(media.id) ORDER BY media.sort_order,media.id),'[]'::jsonb
  ) FROM saas.product_media AS media
  WHERE media.store_id=p_store_id AND media.product_id=p_product_id
    AND (p_include_archived OR media.status<>'archived');
END
$function$;

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
  SELECT saas.catalog_product_projection(product.id) INTO product_projection
    FROM saas.products AS product WHERE product.id=p_product_id AND product.store_id=p_store_id;
  IF product_projection IS NULL THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(saas.catalog_variant_projection(variant.id) ORDER BY variant.created_at,variant.id),'[]'::jsonb)
    INTO variant_projections FROM saas.product_variants AS variant
    WHERE variant.product_id=p_product_id AND variant.store_id=p_store_id
      AND (p_include_archived_variants OR variant.status='active');
  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_build_object('product',product_projection,'variants',variant_projections);
END
$function$;

ALTER FUNCTION saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)
  RENAME TO catalog_create_product_implementation_v1;
ALTER FUNCTION saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text)
  RENAME TO catalog_update_product_implementation_v1;
ALTER FUNCTION saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint)
  RENAME TO catalog_archive_product_implementation_v1;
ALTER FUNCTION saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)
  RENAME TO catalog_create_variant_implementation_v1;
ALTER FUNCTION saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)
  RENAME TO catalog_update_variant_implementation_v1;
ALTER FUNCTION saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint)
  RENAME TO catalog_archive_variant_implementation_v1;

REVOKE ALL ON FUNCTION saas.catalog_create_product_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_update_product_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_archive_product_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_create_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_update_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.catalog_archive_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM PUBLIC,celebix_saas_app;

CREATE FUNCTION saas.catalog_archive_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; action_error text; existing saas.catalog_operations%ROWTYPE; current_product saas.products%ROWTYPE; projection jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  action_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.archive');
  IF action_error IS NOT NULL THEN RETURN QUERY SELECT action_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id=p_store_id AND existing.operation_kind='archive_product' AND existing.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF;
    RETURN;
  END IF;
  SELECT product.* INTO current_product FROM saas.products AS product
    WHERE product.id=p_product_id AND product.store_id=p_store_id FOR UPDATE;
  IF NOT FOUND OR current_product.status='archived' THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_product.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.product_variants AS variant
    WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id ORDER BY variant.id FOR UPDATE;
  UPDATE saas.product_variants
    SET status='archived',archived_at=p_now,archived_by_product=true,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND product_id=p_product_id AND status='active';
  UPDATE saas.products SET status='archived',archived_at=p_now,version=version+1,updated_at=p_now
    WHERE id=p_product_id AND store_id=p_store_id;
  projection:=pg_catalog.jsonb_build_object('product',saas.catalog_product_projection(p_product_id));
  INSERT INTO saas.catalog_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_product_id,result_variant_id,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,'archive_product',p_fingerprint,p_product_id,NULL,projection,p_now);
  RETURN QUERY SELECT 'archived'::text,projection;
END
$function$;

CREATE FUNCTION saas.catalog_restore_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; action_error text; existing saas.catalog_operations%ROWTYPE; current_product saas.products%ROWTYPE; projection jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  action_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.archive');
  IF action_error IS NOT NULL THEN RETURN QUERY SELECT action_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id=p_store_id AND existing.operation_kind = 'restore_product' AND existing.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF;
    RETURN;
  END IF;
  SELECT product.* INTO current_product FROM saas.products AS product
    WHERE product.id=p_product_id AND product.store_id=p_store_id FOR UPDATE;
  IF NOT FOUND OR current_product.status <> 'archived' THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_product.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.product_variants AS variant
    WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id ORDER BY variant.id FOR UPDATE;
  UPDATE saas.product_variants
    SET status='active',archived_at=NULL,archived_by_product=false,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND product_id=p_product_id AND status='archived' AND archived_by_product=true;
  UPDATE saas.products SET status='draft',archived_at=NULL,version=version+1,updated_at=p_now
    WHERE id=p_product_id AND store_id=p_store_id;
  projection:=pg_catalog.jsonb_build_object('product',saas.catalog_product_projection(p_product_id));
  INSERT INTO saas.catalog_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_product_id,result_variant_id,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,'restore_product',p_fingerprint,p_product_id,NULL,projection,p_now);
  RETURN QUERY SELECT 'restored'::text,projection;
END
$function$;

CREATE FUNCTION saas.catalog_create_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_variant_id uuid,p_slug text,p_title text,p_description text,p_status text,p_currency text,
  p_variant_title text,p_sku text,p_barcode text,p_price_cents bigint,p_compare_at_cents bigint,p_cost_cents bigint,p_stock_tracking boolean,p_stock_quantity bigint,p_attributes jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE action_error text;
BEGIN
  action_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF action_error IS NOT NULL THEN RETURN QUERY SELECT action_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT * FROM saas.catalog_create_product_implementation_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_id,p_slug,p_title,p_description,p_status,p_currency,p_variant_title,p_sku,p_barcode,p_price_cents,p_compare_at_cents,p_cost_cents,p_stock_tracking,p_stock_quantity,p_attributes);
END $function$;

CREATE FUNCTION saas.catalog_update_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_version bigint,p_slug text,p_title text,p_description text,p_status text,p_currency text
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE action_error text;
BEGIN
  action_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF action_error IS NOT NULL THEN RETURN QUERY SELECT action_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT * FROM saas.catalog_update_product_implementation_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_expected_version,p_slug,p_title,p_description,p_status,p_currency);
END $function$;

CREATE FUNCTION saas.catalog_create_variant(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_variant_id uuid,p_title text,p_sku text,p_barcode text,p_price_cents bigint,p_compare_at_cents bigint,p_cost_cents bigint,p_stock_tracking boolean,p_stock_quantity bigint,p_attributes jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE action_error text;
BEGIN
  action_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF action_error IS NOT NULL THEN RETURN QUERY SELECT action_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT * FROM saas.catalog_create_variant_implementation_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_id,p_title,p_sku,p_barcode,p_price_cents,p_compare_at_cents,p_cost_cents,p_stock_tracking,p_stock_quantity,p_attributes);
END $function$;

CREATE FUNCTION saas.catalog_update_variant(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_variant_id uuid,p_expected_version bigint,p_title text,p_sku text,p_barcode text,p_price_cents bigint,p_compare_at_cents bigint,p_cost_cents bigint,p_stock_tracking boolean,p_stock_quantity bigint,p_attributes jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE action_error text;
BEGIN
  action_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF action_error IS NOT NULL THEN RETURN QUERY SELECT action_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT * FROM saas.catalog_update_variant_implementation_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_id,p_expected_version,p_title,p_sku,p_barcode,p_price_cents,p_compare_at_cents,p_cost_cents,p_stock_tracking,p_stock_quantity,p_attributes);
END $function$;

CREATE FUNCTION saas.catalog_archive_variant(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_variant_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE action_error text;
BEGIN
  action_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.archive');
  IF action_error IS NOT NULL THEN RETURN QUERY SELECT action_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT * FROM saas.catalog_archive_variant_implementation_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_id,p_expected_version);
END $function$;

REVOKE ALL ON FUNCTION saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) TO celebix_saas_app;

COMMIT;
