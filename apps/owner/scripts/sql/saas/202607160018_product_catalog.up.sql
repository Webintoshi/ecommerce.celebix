-- Phase 3A1 additive shared-SaaS product catalog foundation.
-- This migration is designed for disposable PostgreSQL 16 rehearsal only in Phase 3A1.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.products (
  id uuid,
  store_id uuid NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL,
  currency text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT products_store_slug_key UNIQUE (store_id, slug),
  CONSTRAINT products_store_id_key UNIQUE (store_id, id),
  CONSTRAINT products_slug_normalized_check CHECK (
    slug = lower(slug)
    AND char_length(slug) BETWEEN 3 AND 100
    AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT products_title_check CHECK (
    title = btrim(title)
    AND char_length(title) BETWEEN 1 AND 200
    AND title !~ '[[:cntrl:]]'
  ),
  CONSTRAINT products_description_check CHECK (
    description IS NULL
    OR (
      description = btrim(description)
      AND char_length(description) BETWEEN 1 AND 10000
      AND description !~ '[[:cntrl:]]'
    )
  ),
  CONSTRAINT products_status_check CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT products_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT products_version_check CHECK (version > 0),
  CONSTRAINT products_timestamp_order_check CHECK (updated_at >= created_at),
  CONSTRAINT products_archive_state_check CHECK (
    (status = 'archived' AND archived_at IS NOT NULL AND archived_at >= created_at AND updated_at >= archived_at)
    OR (status IN ('draft', 'active') AND archived_at IS NULL)
  )
);

CREATE FUNCTION saas.catalog_attributes_are_valid(candidate jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  attribute_count integer;
BEGIN
  IF pg_catalog.jsonb_typeof(candidate) <> 'object' OR pg_catalog.pg_column_size(candidate) > 8192 THEN
    RETURN false;
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO attribute_count
  FROM pg_catalog.jsonb_each(candidate);

  IF attribute_count > 32 THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_each(candidate) AS attribute(key, value)
    WHERE attribute.key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$'
       OR pg_catalog.jsonb_typeof(attribute.value) <> 'string'
       OR char_length(attribute.value #>> '{}') > 256
       OR attribute.value #>> '{}' <> btrim(attribute.value #>> '{}')
       OR attribute.value #>> '{}' ~ '[[:cntrl:]]'
  );
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_attributes_are_valid(jsonb) FROM PUBLIC;

CREATE TABLE saas.product_variants (
  id uuid,
  product_id uuid NOT NULL,
  store_id uuid NOT NULL,
  title text NOT NULL,
  sku text,
  barcode text,
  price_cents bigint NOT NULL,
  compare_at_cents bigint,
  cost_cents bigint,
  stock_tracking boolean NOT NULL,
  stock_quantity bigint NOT NULL,
  status text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT product_variants_pkey PRIMARY KEY (id),
  CONSTRAINT product_variants_product_store_fk FOREIGN KEY (store_id, product_id)
    REFERENCES saas.products(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT product_variants_store_fk FOREIGN KEY (store_id)
    REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT product_variants_store_id_key UNIQUE (store_id, id),
  CONSTRAINT product_variants_title_check CHECK (
    title = btrim(title)
    AND char_length(title) BETWEEN 1 AND 200
    AND title !~ '[[:cntrl:]]'
  ),
  CONSTRAINT product_variants_sku_check CHECK (
    sku IS NULL OR (char_length(sku) BETWEEN 1 AND 64 AND sku ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$')
  ),
  CONSTRAINT product_variants_barcode_check CHECK (
    barcode IS NULL
    OR (
      barcode = btrim(barcode)
      AND char_length(barcode) BETWEEN 1 AND 128
      AND barcode !~ '[[:cntrl:]]'
    )
  ),
  CONSTRAINT product_variants_price_check CHECK (
    price_cents >= 0
    AND (compare_at_cents IS NULL OR compare_at_cents >= price_cents)
    AND (cost_cents IS NULL OR cost_cents >= 0)
  ),
  CONSTRAINT product_variants_stock_check CHECK (stock_quantity >= 0),
  CONSTRAINT product_variants_status_check CHECK (status IN ('active', 'archived')),
  CONSTRAINT product_variants_attributes_check CHECK (saas.catalog_attributes_are_valid(attributes)),
  CONSTRAINT product_variants_version_check CHECK (version > 0),
  CONSTRAINT product_variants_timestamp_order_check CHECK (updated_at >= created_at),
  CONSTRAINT product_variants_archive_state_check CHECK (
    (status = 'archived' AND archived_at IS NOT NULL AND archived_at >= created_at AND updated_at >= archived_at)
    OR (status = 'active' AND archived_at IS NULL)
  )
);

CREATE UNIQUE INDEX product_variants_store_sku_key
  ON saas.product_variants (store_id, sku)
  WHERE sku IS NOT NULL;

CREATE INDEX products_store_list_idx
  ON saas.products (store_id, created_at DESC, id DESC)
  WHERE status <> 'archived';

CREATE INDEX products_store_status_list_idx
  ON saas.products (store_id, status, created_at DESC, id DESC);

CREATE INDEX product_variants_product_store_idx
  ON saas.product_variants (store_id, product_id, created_at, id);

CREATE TABLE saas.catalog_operations (
  operation_id uuid,
  store_id uuid NOT NULL,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_product_id uuid NOT NULL,
  result_variant_id uuid,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT catalog_operations_pkey PRIMARY KEY (operation_id),
  CONSTRAINT catalog_operations_store_fk FOREIGN KEY (store_id)
    REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT catalog_operations_product_fk FOREIGN KEY (store_id, result_product_id)
    REFERENCES saas.products(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT catalog_operations_variant_fk FOREIGN KEY (store_id, result_variant_id)
    REFERENCES saas.product_variants(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT catalog_operations_kind_check CHECK (operation_kind IN (
    'create_product', 'update_product', 'archive_product',
    'create_variant', 'update_variant', 'archive_variant'
  )),
  CONSTRAINT catalog_operations_fingerprint_check CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT catalog_operations_result_shape_check CHECK (
    pg_catalog.jsonb_typeof(result_payload) = 'object'
    AND pg_catalog.pg_column_size(result_payload) <= 32768
    AND result_payload ? 'product' = (operation_kind IN ('create_product', 'update_product', 'archive_product'))
    AND result_payload ? 'variant' = (operation_kind IN ('create_variant', 'update_variant', 'archive_variant'))
    AND result_payload ? 'initialVariant' = (operation_kind = 'create_product')
  ),
  CONSTRAINT catalog_operations_variant_kind_check CHECK (
    (operation_kind IN ('create_product', 'create_variant', 'update_variant', 'archive_variant') AND result_variant_id IS NOT NULL)
    OR (operation_kind IN ('update_product', 'archive_product') AND result_variant_id IS NULL)
  )
);

CREATE INDEX catalog_operations_store_committed_idx
  ON saas.catalog_operations (store_id, committed_at DESC, operation_id);

CREATE FUNCTION saas.guard_catalog_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  RAISE EXCEPTION 'CATALOG_OPERATION_IMMUTABLE';
END
$function$;

REVOKE ALL ON FUNCTION saas.guard_catalog_operation_mutation() FROM PUBLIC;

CREATE TRIGGER catalog_operations_immutable
BEFORE UPDATE OR DELETE ON saas.catalog_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_operation_mutation();

ALTER TABLE saas.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.products FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.product_variants FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.products FROM PUBLIC;
REVOKE ALL ON saas.product_variants FROM PUBLIC;
REVOKE ALL ON saas.catalog_operations FROM PUBLIC;
REVOKE ALL ON saas.products FROM celebix_saas_app;
REVOKE ALL ON saas.product_variants FROM celebix_saas_app;
REVOKE ALL ON saas.catalog_operations FROM celebix_saas_app;

CREATE FUNCTION saas.catalog_timestamp(value timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.to_char(value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$function$;

CREATE FUNCTION saas.catalog_product_projection(product_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', product.id,
    'storeId', product.store_id,
    'slug', product.slug,
    'title', product.title,
    'description', product.description,
    'status', product.status,
    'currency', product.currency,
    'createdAt', saas.catalog_timestamp(product.created_at),
    'updatedAt', saas.catalog_timestamp(product.updated_at),
    'version', product.version
  ))
  FROM saas.products AS product
  WHERE product.id = product_id;
$function$;

CREATE FUNCTION saas.catalog_variant_projection(variant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', variant.id,
    'productId', variant.product_id,
    'storeId', variant.store_id,
    'title', variant.title,
    'sku', variant.sku,
    'barcode', variant.barcode,
    'priceCents', variant.price_cents,
    'compareAtCents', variant.compare_at_cents,
    'costCents', variant.cost_cents,
    'stockTracking', variant.stock_tracking,
    'stockQuantity', variant.stock_quantity,
    'status', variant.status,
    'attributes', variant.attributes,
    'createdAt', saas.catalog_timestamp(variant.created_at),
    'updatedAt', saas.catalog_timestamp(variant.updated_at),
    'version', variant.version
  ))
  FROM saas.product_variants AS variant
  WHERE variant.id = variant_id;
$function$;

REVOKE ALL ON FUNCTION saas.catalog_timestamp(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_product_projection(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_variant_projection(uuid) FROM PUBLIC;

CREATE FUNCTION saas.catalog_product_input_valid(
  p_slug text,
  p_title text,
  p_description text,
  p_status text,
  p_currency text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, saas
AS $function$
  SELECT p_slug IS NOT NULL
    AND p_slug = lower(p_slug)
    AND char_length(p_slug) BETWEEN 3 AND 100
    AND p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND p_title IS NOT NULL
    AND p_title = btrim(p_title)
    AND char_length(p_title) BETWEEN 1 AND 200
    AND p_title !~ '[[:cntrl:]]'
    AND (
      p_description IS NULL
      OR (
        p_description = btrim(p_description)
        AND char_length(p_description) BETWEEN 1 AND 10000
        AND p_description !~ '[[:cntrl:]]'
      )
    )
    AND p_status IN ('draft', 'active')
    AND p_currency ~ '^[A-Z]{3}$';
$function$;

CREATE FUNCTION saas.catalog_variant_input_valid(
  p_title text,
  p_sku text,
  p_barcode text,
  p_price_cents bigint,
  p_compare_at_cents bigint,
  p_cost_cents bigint,
  p_stock_tracking boolean,
  p_stock_quantity bigint,
  p_attributes jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, saas
AS $function$
  SELECT p_title IS NOT NULL
    AND p_title = btrim(p_title)
    AND char_length(p_title) BETWEEN 1 AND 200
    AND p_title !~ '[[:cntrl:]]'
    AND (p_sku IS NULL OR (char_length(p_sku) BETWEEN 1 AND 64 AND p_sku ~ '^[A-Z0-9][A-Z0-9._-]{0,63}$'))
    AND (
      p_barcode IS NULL
      OR (
        p_barcode = btrim(p_barcode)
        AND char_length(p_barcode) BETWEEN 1 AND 128
        AND p_barcode !~ '[[:cntrl:]]'
      )
    )
    AND p_price_cents IS NOT NULL
    AND p_price_cents >= 0
    AND (p_compare_at_cents IS NULL OR p_compare_at_cents >= p_price_cents)
    AND (p_cost_cents IS NULL OR p_cost_cents >= 0)
    AND p_stock_tracking IS NOT NULL
    AND p_stock_quantity IS NOT NULL
    AND p_stock_quantity >= 0
    AND p_attributes IS NOT NULL
    AND saas.catalog_attributes_are_valid(p_attributes);
$function$;

REVOKE ALL ON FUNCTION saas.catalog_product_input_valid(text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_variant_input_valid(text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC;

CREATE FUNCTION saas.catalog_authority_error(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL
     OR p_plan_id IS NULL OR p_plan_code IS NULL OR p_plan_version IS NULL
     OR p_products_limit IS NULL OR p_now IS NULL OR p_products_limit < 0 THEN
    RETURN 'durable_authority_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM saas.stores AS store
    WHERE store.id = p_store_id AND store.status = 'active'
  ) THEN
    RETURN 'store_inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM saas.memberships AS membership
    WHERE membership.id = p_membership_id
      AND membership.store_id = p_store_id
      AND membership.principal_id = p_principal_id
      AND membership.status = 'active'
      AND membership.role IN ('store_owner', 'admin', 'editor', 'analyst')
  ) THEN
    RETURN 'membership_denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM saas.subscriptions AS subscription
    JOIN saas.plans AS plan
      ON plan.id = subscription.plan_id
     AND plan.plan_code = subscription.plan_code
     AND plan.version = subscription.plan_version
    WHERE subscription.store_id = p_store_id
      AND subscription.plan_id = p_plan_id
      AND subscription.plan_code = p_plan_code
      AND subscription.plan_version = p_plan_version
      AND subscription.status = 'active'
      AND subscription.valid_from <= p_now
      AND (subscription.valid_until IS NULL OR subscription.valid_until > p_now)
      AND plan.status = 'active'
      AND plan.valid_from <= p_now
      AND (plan.valid_until IS NULL OR plan.valid_until > p_now)
  ) THEN
    RETURN 'durable_authority_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM saas.plan_features AS feature
    WHERE feature.plan_id = p_plan_id
      AND feature.feature_key = 'catalog'
      AND feature.enabled
  ) THEN
    RETURN 'feature_not_enabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM saas.plan_limits AS plan_limit
    WHERE plan_limit.plan_id = p_plan_id
      AND plan_limit.limit_key = 'products'
      AND plan_limit.effective_limit = p_products_limit
  ) THEN
    RETURN 'durable_authority_invalid';
  END IF;

  RETURN NULL;
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) FROM PUBLIC;

CREATE FUNCTION saas.catalog_get_product(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_product_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  projection jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error, NULL::jsonb;
    RETURN;
  END IF;

  SELECT saas.catalog_product_projection(product.id)
    INTO projection
  FROM saas.products AS product
  WHERE product.id = p_product_id AND product.store_id = p_store_id;

  IF projection IS NULL THEN
    RETURN QUERY SELECT 'product_not_found'::text, NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'found'::text, pg_catalog.jsonb_build_object('product', projection);
END
$function$;

CREATE FUNCTION saas.catalog_list_products(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_status text,
  p_page_size integer,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  listed_items jsonb;
  listed_count integer;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error, NULL::jsonb;
    RETURN;
  END IF;

  IF p_page_size IS NULL OR p_page_size < 1 OR p_page_size > 100
     OR (p_status IS NOT NULL AND p_status NOT IN ('draft', 'active', 'archived'))
     OR ((p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL)) THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb;
    RETURN;
  END IF;

  WITH selected AS MATERIALIZED (
    SELECT product.id, product.created_at
    FROM saas.products AS product
    WHERE product.store_id = p_store_id
      AND (
        (p_status IS NULL AND product.status <> 'archived')
        OR product.status = p_status
      )
      AND (
        p_cursor_created_at IS NULL
        OR (product.created_at, product.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY product.created_at DESC, product.id DESC
    LIMIT p_page_size + 1
  ), page AS (
    SELECT selected.id, selected.created_at
    FROM selected
    ORDER BY selected.created_at DESC, selected.id DESC
    LIMIT p_page_size
  )
  SELECT
    COALESCE(
      pg_catalog.jsonb_agg(saas.catalog_product_projection(page.id) ORDER BY page.created_at DESC, page.id DESC),
      '[]'::jsonb
    ),
    (SELECT pg_catalog.count(*)::integer FROM selected)
  INTO listed_items, listed_count
  FROM page;

  RETURN QUERY SELECT 'listed'::text, pg_catalog.jsonb_build_object(
    'items', listed_items,
    'hasMore', listed_count > p_page_size
  );
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_get_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,integer,timestamptz,uuid) FROM PUBLIC;

CREATE FUNCTION saas.catalog_create_product(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_operation_id uuid,
  p_fingerprint text,
  p_product_id uuid,
  p_variant_id uuid,
  p_slug text,
  p_title text,
  p_description text,
  p_status text,
  p_currency text,
  p_variant_title text,
  p_sku text,
  p_barcode text,
  p_price_cents bigint,
  p_compare_at_cents bigint,
  p_cost_cents bigint,
  p_stock_tracking boolean,
  p_stock_quantity bigint,
  p_attributes jsonb
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing saas.catalog_operations%ROWTYPE;
  projection jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error, NULL::jsonb;
    RETURN;
  END IF;

  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_variant_id IS NULL
     OR p_fingerprint !~ '^[a-f0-9]{64}$'
     OR NOT saas.catalog_product_input_valid(p_slug, p_title, p_description, p_status, p_currency)
     OR NOT saas.catalog_variant_input_valid(
       p_variant_title, p_sku, p_barcode, p_price_cents, p_compare_at_cents,
       p_cost_cents, p_stock_tracking, p_stock_quantity, p_attributes
     ) THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.operation:' || p_operation_id::text, 0)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:' || p_store_id::text, 0)
  );

  SELECT operation.* INTO existing
  FROM saas.catalog_operations AS operation
  WHERE operation.operation_id = p_operation_id;

  IF FOUND THEN
    IF existing.store_id = p_store_id
       AND existing.operation_kind = 'create_product'
       AND existing.payload_fingerprint = p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text, existing.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM saas.products AS product
    WHERE product.store_id = p_store_id AND product.slug = p_slug
  ) THEN
    RETURN QUERY SELECT 'slug_conflict'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF p_sku IS NOT NULL AND EXISTS (
    SELECT 1 FROM saas.product_variants AS variant
    WHERE variant.store_id = p_store_id AND variant.sku = p_sku
  ) THEN
    RETURN QUERY SELECT 'sku_conflict'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM saas.products AS product
    WHERE product.store_id = p_store_id AND product.status <> 'archived'
  ) >= p_products_limit THEN
    RETURN QUERY SELECT 'product_limit_reached'::text, NULL::jsonb;
    RETURN;
  END IF;

  INSERT INTO saas.products (
    id, store_id, slug, title, description, status, currency,
    version, archived_at, created_at, updated_at
  ) VALUES (
    p_product_id, p_store_id, p_slug, p_title, p_description, p_status, p_currency,
    1, NULL, p_now, p_now
  );

  INSERT INTO saas.product_variants (
    id, product_id, store_id, title, sku, barcode, price_cents, compare_at_cents,
    cost_cents, stock_tracking, stock_quantity, status, attributes,
    version, archived_at, created_at, updated_at
  ) VALUES (
    p_variant_id, p_product_id, p_store_id, p_variant_title, p_sku, p_barcode,
    p_price_cents, p_compare_at_cents, p_cost_cents, p_stock_tracking, p_stock_quantity,
    'active', p_attributes, 1, NULL, p_now, p_now
  );

  projection := pg_catalog.jsonb_build_object(
    'product', saas.catalog_product_projection(p_product_id),
    'initialVariant', saas.catalog_variant_projection(p_variant_id)
  );

  INSERT INTO saas.catalog_operations (
    operation_id, store_id, operation_kind, payload_fingerprint,
    result_product_id, result_variant_id, result_payload, committed_at
  ) VALUES (
    p_operation_id, p_store_id, 'create_product', p_fingerprint,
    p_product_id, p_variant_id, projection, p_now
  );

  RETURN QUERY SELECT 'created'::text, projection;
END
$function$;

CREATE FUNCTION saas.catalog_update_product(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_operation_id uuid,
  p_fingerprint text,
  p_product_id uuid,
  p_expected_version bigint,
  p_slug text,
  p_title text,
  p_description text,
  p_status text,
  p_currency text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing saas.catalog_operations%ROWTYPE;
  current_product saas.products%ROWTYPE;
  projection jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error, NULL::jsonb;
    RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_fingerprint !~ '^[a-f0-9]{64}$'
     OR NOT saas.catalog_product_input_valid(p_slug, p_title, p_description, p_status, p_currency) THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb;
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:' || p_operation_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:' || p_store_id::text, 0));

  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation
  WHERE operation.operation_id = p_operation_id;
  IF FOUND THEN
    IF existing.store_id = p_store_id AND existing.operation_kind = 'update_product'
       AND existing.payload_fingerprint = p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text, existing.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT product.* INTO current_product
  FROM saas.products AS product
  WHERE product.id = p_product_id AND product.store_id = p_store_id
  FOR UPDATE;
  IF NOT FOUND OR current_product.status = 'archived' THEN
    RETURN QUERY SELECT 'product_not_found'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF current_product.version <> p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict'::text, NULL::jsonb;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM saas.products AS product
    WHERE product.store_id = p_store_id AND product.slug = p_slug AND product.id <> p_product_id
  ) THEN
    RETURN QUERY SELECT 'slug_conflict'::text, NULL::jsonb;
    RETURN;
  END IF;

  UPDATE saas.products
  SET slug = p_slug,
      title = p_title,
      description = p_description,
      status = p_status,
      currency = p_currency,
      version = version + 1,
      updated_at = p_now
  WHERE id = p_product_id AND store_id = p_store_id;

  projection := pg_catalog.jsonb_build_object('product', saas.catalog_product_projection(p_product_id));
  INSERT INTO saas.catalog_operations (
    operation_id, store_id, operation_kind, payload_fingerprint,
    result_product_id, result_variant_id, result_payload, committed_at
  ) VALUES (
    p_operation_id, p_store_id, 'update_product', p_fingerprint,
    p_product_id, NULL, projection, p_now
  );
  RETURN QUERY SELECT 'updated'::text, projection;
END
$function$;

CREATE FUNCTION saas.catalog_archive_product(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_operation_id uuid,
  p_fingerprint text,
  p_product_id uuid,
  p_expected_version bigint
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing saas.catalog_operations%ROWTYPE;
  current_product saas.products%ROWTYPE;
  projection jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error, NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:' || p_operation_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:' || p_store_id::text, 0));
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation
  WHERE operation.operation_id = p_operation_id;
  IF FOUND THEN
    IF existing.store_id = p_store_id AND existing.operation_kind = 'archive_product'
       AND existing.payload_fingerprint = p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text, existing.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT product.* INTO current_product FROM saas.products AS product
  WHERE product.id = p_product_id AND product.store_id = p_store_id
  FOR UPDATE;
  IF NOT FOUND OR current_product.status = 'archived' THEN
    RETURN QUERY SELECT 'product_not_found'::text, NULL::jsonb; RETURN;
  END IF;
  IF current_product.version <> p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict'::text, NULL::jsonb; RETURN;
  END IF;

  UPDATE saas.product_variants
  SET status = 'archived', archived_at = p_now, version = version + 1, updated_at = p_now
  WHERE store_id = p_store_id AND product_id = p_product_id AND status = 'active';

  UPDATE saas.products
  SET status = 'archived', archived_at = p_now, version = version + 1, updated_at = p_now
  WHERE id = p_product_id AND store_id = p_store_id;

  projection := pg_catalog.jsonb_build_object('product', saas.catalog_product_projection(p_product_id));
  INSERT INTO saas.catalog_operations (
    operation_id, store_id, operation_kind, payload_fingerprint,
    result_product_id, result_variant_id, result_payload, committed_at
  ) VALUES (
    p_operation_id, p_store_id, 'archive_product', p_fingerprint,
    p_product_id, NULL, projection, p_now
  );
  RETURN QUERY SELECT 'archived'::text, projection;
END
$function$;

CREATE FUNCTION saas.catalog_create_variant(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_operation_id uuid,
  p_fingerprint text,
  p_product_id uuid,
  p_variant_id uuid,
  p_title text,
  p_sku text,
  p_barcode text,
  p_price_cents bigint,
  p_compare_at_cents bigint,
  p_cost_cents bigint,
  p_stock_tracking boolean,
  p_stock_quantity bigint,
  p_attributes jsonb
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing saas.catalog_operations%ROWTYPE;
  projection jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error, NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_variant_id IS NULL
     OR p_fingerprint !~ '^[a-f0-9]{64}$'
     OR NOT saas.catalog_variant_input_valid(
       p_title, p_sku, p_barcode, p_price_cents, p_compare_at_cents,
       p_cost_cents, p_stock_tracking, p_stock_quantity, p_attributes
     ) THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:' || p_operation_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:' || p_store_id::text, 0));
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation
  WHERE operation.operation_id = p_operation_id;
  IF FOUND THEN
    IF existing.store_id = p_store_id AND existing.operation_kind = 'create_variant'
       AND existing.payload_fingerprint = p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text, existing.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM saas.products AS product
    WHERE product.id = p_product_id AND product.store_id = p_store_id AND product.status <> 'archived'
  ) THEN
    RETURN QUERY SELECT 'product_not_found'::text, NULL::jsonb; RETURN;
  END IF;
  IF p_sku IS NOT NULL AND EXISTS (
    SELECT 1 FROM saas.product_variants AS variant
    WHERE variant.store_id = p_store_id AND variant.sku = p_sku
  ) THEN
    RETURN QUERY SELECT 'sku_conflict'::text, NULL::jsonb; RETURN;
  END IF;

  INSERT INTO saas.product_variants (
    id, product_id, store_id, title, sku, barcode, price_cents, compare_at_cents,
    cost_cents, stock_tracking, stock_quantity, status, attributes,
    version, archived_at, created_at, updated_at
  ) VALUES (
    p_variant_id, p_product_id, p_store_id, p_title, p_sku, p_barcode,
    p_price_cents, p_compare_at_cents, p_cost_cents, p_stock_tracking, p_stock_quantity,
    'active', p_attributes, 1, NULL, p_now, p_now
  );

  projection := pg_catalog.jsonb_build_object('variant', saas.catalog_variant_projection(p_variant_id));
  INSERT INTO saas.catalog_operations (
    operation_id, store_id, operation_kind, payload_fingerprint,
    result_product_id, result_variant_id, result_payload, committed_at
  ) VALUES (
    p_operation_id, p_store_id, 'create_variant', p_fingerprint,
    p_product_id, p_variant_id, projection, p_now
  );
  RETURN QUERY SELECT 'created'::text, projection;
END
$function$;

CREATE FUNCTION saas.catalog_update_variant(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_operation_id uuid,
  p_fingerprint text,
  p_product_id uuid,
  p_variant_id uuid,
  p_expected_version bigint,
  p_title text,
  p_sku text,
  p_barcode text,
  p_price_cents bigint,
  p_compare_at_cents bigint,
  p_cost_cents bigint,
  p_stock_tracking boolean,
  p_stock_quantity bigint,
  p_attributes jsonb
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing saas.catalog_operations%ROWTYPE;
  current_variant saas.product_variants%ROWTYPE;
  projection jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error, NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_variant_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_fingerprint !~ '^[a-f0-9]{64}$'
     OR NOT saas.catalog_variant_input_valid(
       p_title, p_sku, p_barcode, p_price_cents, p_compare_at_cents,
       p_cost_cents, p_stock_tracking, p_stock_quantity, p_attributes
     ) THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:' || p_operation_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:' || p_store_id::text, 0));
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation
  WHERE operation.operation_id = p_operation_id;
  IF FOUND THEN
    IF existing.store_id = p_store_id AND existing.operation_kind = 'update_variant'
       AND existing.payload_fingerprint = p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text, existing.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM saas.products AS product
    WHERE product.id = p_product_id AND product.store_id = p_store_id AND product.status <> 'archived'
  ) THEN
    RETURN QUERY SELECT 'product_not_found'::text, NULL::jsonb; RETURN;
  END IF;
  SELECT variant.* INTO current_variant FROM saas.product_variants AS variant
  WHERE variant.id = p_variant_id AND variant.product_id = p_product_id AND variant.store_id = p_store_id
  FOR UPDATE;
  IF NOT FOUND OR current_variant.status = 'archived' THEN
    RETURN QUERY SELECT 'variant_not_found'::text, NULL::jsonb; RETURN;
  END IF;
  IF current_variant.version <> p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict'::text, NULL::jsonb; RETURN;
  END IF;
  IF p_sku IS NOT NULL AND EXISTS (
    SELECT 1 FROM saas.product_variants AS variant
    WHERE variant.store_id = p_store_id AND variant.sku = p_sku AND variant.id <> p_variant_id
  ) THEN
    RETURN QUERY SELECT 'sku_conflict'::text, NULL::jsonb; RETURN;
  END IF;

  UPDATE saas.product_variants
  SET title = p_title,
      sku = p_sku,
      barcode = p_barcode,
      price_cents = p_price_cents,
      compare_at_cents = p_compare_at_cents,
      cost_cents = p_cost_cents,
      stock_tracking = p_stock_tracking,
      stock_quantity = p_stock_quantity,
      attributes = p_attributes,
      version = version + 1,
      updated_at = p_now
  WHERE id = p_variant_id AND product_id = p_product_id AND store_id = p_store_id;

  projection := pg_catalog.jsonb_build_object('variant', saas.catalog_variant_projection(p_variant_id));
  INSERT INTO saas.catalog_operations (
    operation_id, store_id, operation_kind, payload_fingerprint,
    result_product_id, result_variant_id, result_payload, committed_at
  ) VALUES (
    p_operation_id, p_store_id, 'update_variant', p_fingerprint,
    p_product_id, p_variant_id, projection, p_now
  );
  RETURN QUERY SELECT 'updated'::text, projection;
END
$function$;

CREATE FUNCTION saas.catalog_archive_variant(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_operation_id uuid,
  p_fingerprint text,
  p_product_id uuid,
  p_variant_id uuid,
  p_expected_version bigint
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing saas.catalog_operations%ROWTYPE;
  current_variant saas.product_variants%ROWTYPE;
  projection jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error, NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_variant_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb; RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:' || p_operation_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:' || p_store_id::text, 0));
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation
  WHERE operation.operation_id = p_operation_id;
  IF FOUND THEN
    IF existing.store_id = p_store_id AND existing.operation_kind = 'archive_variant'
       AND existing.payload_fingerprint = p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text, existing.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM saas.products AS product
    WHERE product.id = p_product_id AND product.store_id = p_store_id AND product.status <> 'archived'
  ) THEN
    RETURN QUERY SELECT 'product_not_found'::text, NULL::jsonb; RETURN;
  END IF;
  SELECT variant.* INTO current_variant FROM saas.product_variants AS variant
  WHERE variant.id = p_variant_id AND variant.product_id = p_product_id AND variant.store_id = p_store_id
  FOR UPDATE;
  IF NOT FOUND OR current_variant.status = 'archived' THEN
    RETURN QUERY SELECT 'variant_not_found'::text, NULL::jsonb; RETURN;
  END IF;
  IF current_variant.version <> p_expected_version THEN
    RETURN QUERY SELECT 'version_conflict'::text, NULL::jsonb; RETURN;
  END IF;

  UPDATE saas.product_variants
  SET status = 'archived', archived_at = p_now, version = version + 1, updated_at = p_now
  WHERE id = p_variant_id AND product_id = p_product_id AND store_id = p_store_id;

  projection := pg_catalog.jsonb_build_object('variant', saas.catalog_variant_projection(p_variant_id));
  INSERT INTO saas.catalog_operations (
    operation_id, store_id, operation_kind, payload_fingerprint,
    result_product_id, result_variant_id, result_payload, committed_at
  ) VALUES (
    p_operation_id, p_store_id, 'archive_variant', p_fingerprint,
    p_product_id, p_variant_id, projection, p_now
  );
  RETURN QUERY SELECT 'archived'::text, projection;
END
$function$;

CREATE FUNCTION saas.catalog_recover_operation(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_products_limit bigint,
  p_now timestamptz,
  p_operation_id uuid,
  p_fingerprint text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing saas.catalog_operations%ROWTYPE;
BEGIN
  authority_error := saas.catalog_authority_error(
    p_store_id, p_principal_id, p_membership_id, p_plan_id,
    p_plan_code, p_plan_version, p_products_limit, p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error, NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb; RETURN;
  END IF;
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation
  WHERE operation.operation_id = p_operation_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::jsonb; RETURN;
  END IF;
  IF existing.store_id <> p_store_id OR existing.payload_fingerprint <> p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'operation_replayed'::text, existing.result_payload;
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.catalog_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.catalog_get_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_list_products(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,integer,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_update_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_archive_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_recover_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text) TO celebix_saas_app;

COMMIT;
