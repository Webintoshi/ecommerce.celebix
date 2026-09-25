BEGIN;
SET LOCAL ROLE celebix_saas_owner;

-- Assignment.position chooses the primary category (0..7). The storefront
-- position is a different, category-scoped ordering concern.
ALTER TABLE saas.catalog_product_categories
  ADD COLUMN storefront_position integer;
ALTER TABLE saas.catalog_product_categories
  ADD CONSTRAINT catalog_product_categories_storefront_position_check
  CHECK (storefront_position IS NULL OR storefront_position BETWEEN 0 AND 999);
CREATE INDEX catalog_product_categories_storefront_order_idx
  ON saas.catalog_product_categories(store_id,category_id,storefront_position,product_id);

CREATE TABLE saas.catalog_category_product_order_state (
  store_id uuid NOT NULL,
  category_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  updated_at timestamptz NOT NULL CHECK (pg_catalog.isfinite(updated_at)),
  PRIMARY KEY (store_id,category_id),
  FOREIGN KEY (store_id,category_id) REFERENCES saas.catalog_categories(store_id,id) ON DELETE CASCADE
);
CREATE TABLE saas.catalog_category_product_order_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  category_id uuid NOT NULL,
  fingerprint character(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL CHECK (pg_catalog.isfinite(committed_at)),
  FOREIGN KEY (store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT
);
CREATE INDEX catalog_category_product_order_operations_store_idx
  ON saas.catalog_category_product_order_operations(store_id,category_id,committed_at);
ALTER TABLE saas.catalog_category_product_order_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_category_product_order_state FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_category_product_order_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_category_product_order_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.catalog_category_product_order_state FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON saas.catalog_category_product_order_operations FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

CREATE FUNCTION saas.catalog_category_product_order_projection(p_store_id uuid,p_category_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'categoryId',p_category_id,
    'version',COALESCE((SELECT state.version FROM saas.catalog_category_product_order_state AS state
      WHERE state.store_id=p_store_id AND state.category_id=p_category_id),0),
    'items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'productId',product.id,'title',product.title,'slug',product.slug,
      'status',product.status,'storefrontPosition',assignment.storefront_position
    ) ORDER BY assignment.storefront_position ASC NULLS LAST,
      (product.status='active') DESC,
      EXISTS(SELECT 1 FROM saas.product_variants AS variant
        WHERE variant.store_id=product.store_id AND variant.product_id=product.id
          AND variant.status='active'
          AND (NOT variant.stock_tracking OR variant.stock_quantity>0)) DESC,
      product.created_at DESC,product.id DESC)
      FROM saas.catalog_product_categories AS assignment
      JOIN saas.products AS product ON product.store_id=assignment.store_id AND product.id=assignment.product_id
      WHERE assignment.store_id=p_store_id AND assignment.category_id=p_category_id
        AND product.status IN ('active','draft')),'[]'::jsonb)
  )
$function$;

CREATE FUNCTION saas.catalog_get_category_product_order(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_category_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; member_count bigint;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,'catalog','catalog_admin.read'); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_category_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id
    AND category.id=p_category_id AND category.status='active')
  THEN RETURN QUERY SELECT 'category_not_found',NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.count(*) INTO member_count
  FROM saas.catalog_product_categories AS assignment
  JOIN saas.products AS product ON product.store_id=assignment.store_id AND product.id=assignment.product_id
  WHERE assignment.store_id=p_store_id AND assignment.category_id=p_category_id
    AND product.status IN ('active','draft');
  IF member_count>1000 THEN RETURN QUERY SELECT 'order_limit_exceeded',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',saas.catalog_category_product_order_projection(p_store_id,p_category_id);
END
$function$;

CREATE FUNCTION saas.catalog_reorder_category_products(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_category_id uuid,p_expected_version bigint,p_product_ids uuid[]
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; previous saas.catalog_category_product_order_operations%ROWTYPE;
  current_version bigint; member_count bigint; result jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,'catalog','catalog_admin.manage'); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_category_id IS NULL OR p_fingerprint IS NULL
    OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL
    OR p_expected_version<0 OR p_expected_version>=9007199254740991
    OR p_product_ids IS NULL OR pg_catalog.cardinality(p_product_ids)>1000
    OR pg_catalog.array_position(p_product_ids,NULL::uuid) IS NOT NULL
    OR (SELECT pg_catalog.count(*)<>pg_catalog.count(DISTINCT requested.product_id)
        FROM pg_catalog.unnest(p_product_ids) AS requested(product_id))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.catalog_category_product_order:'||p_operation_id::text,0));
  SELECT operation.* INTO previous FROM saas.catalog_category_product_order_operations AS operation
    WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF previous.store_id<>p_store_id OR previous.category_id<>p_category_id
      OR previous.fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',
      pg_catalog.jsonb_set(previous.result_payload,'{replayed}','true'::jsonb); END IF;
    RETURN;
  END IF;

  -- FOR UPDATE also conflicts with the FK key-share lock of a concurrent new
  -- assignment. Existing assignment rows are locked before membership checks.
  PERFORM 1 FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id
    AND category.id=p_category_id AND category.status='active' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'category_not_found',NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.catalog_product_categories AS assignment
    JOIN saas.products AS product ON product.store_id=assignment.store_id AND product.id=assignment.product_id
    WHERE assignment.store_id=p_store_id AND assignment.category_id=p_category_id
      AND product.status IN ('active','draft')
    ORDER BY assignment.product_id FOR UPDATE OF assignment,product;
  GET DIAGNOSTICS member_count=ROW_COUNT;
  IF member_count>1000 THEN RETURN QUERY SELECT 'order_limit_exceeded',NULL::jsonb; RETURN; END IF;
  IF member_count<>pg_catalog.cardinality(p_product_ids)
    OR EXISTS(SELECT requested.product_id FROM pg_catalog.unnest(p_product_ids) AS requested(product_id)
      EXCEPT SELECT assignment.product_id FROM saas.catalog_product_categories AS assignment
      JOIN saas.products AS product ON product.store_id=assignment.store_id AND product.id=assignment.product_id
      WHERE assignment.store_id=p_store_id AND assignment.category_id=p_category_id
        AND product.status IN ('active','draft'))
  THEN RETURN QUERY SELECT 'order_membership_changed',NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(state.version,0) INTO current_version
    FROM saas.catalog_category_product_order_state AS state
    WHERE state.store_id=p_store_id AND state.category_id=p_category_id FOR UPDATE;
  current_version:=COALESCE(current_version,0);
  IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;

  UPDATE saas.catalog_product_categories AS assignment
    SET storefront_position=requested.ordinality::integer-1
    FROM pg_catalog.unnest(p_product_ids) WITH ORDINALITY AS requested(product_id,ordinality)
    WHERE assignment.store_id=p_store_id AND assignment.category_id=p_category_id
      AND assignment.product_id=requested.product_id;
  INSERT INTO saas.catalog_category_product_order_state(store_id,category_id,version,updated_at)
    VALUES(p_store_id,p_category_id,current_version+1,p_now)
    ON CONFLICT(store_id,category_id) DO UPDATE
      SET version=EXCLUDED.version,updated_at=EXCLUDED.updated_at;
  result:=saas.catalog_category_product_order_projection(p_store_id,p_category_id)
    ||pg_catalog.jsonb_build_object('replayed',false);
  INSERT INTO saas.catalog_category_product_order_operations(
    operation_id,store_id,category_id,fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,p_category_id,p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'reordered',result;
END
$function$;

CREATE FUNCTION saas.catalog_recover_category_product_order(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; previous saas.catalog_category_product_order_operations%ROWTYPE;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,'catalog','catalog_admin.manage'); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT operation.* INTO previous FROM saas.catalog_category_product_order_operations AS operation
    WHERE operation.operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb; RETURN; END IF;
  IF previous.store_id<>p_store_id OR previous.fingerprint<>p_fingerprint
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed',
    pg_catalog.jsonb_set(previous.result_payload,'{replayed}','true'::jsonb);
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_category_product_order_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_get_category_product_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_reorder_category_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_recover_category_product_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_get_category_product_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_reorder_category_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,uuid[]) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_recover_category_product_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) TO celebix_saas_app;
COMMIT;
