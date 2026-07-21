-- Phase 3B2 additive least-privilege merchant quick-order link API.
-- This migration is authorized only for isolated disposable PostgreSQL 16 rehearsal.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.quick_links_json_timestamp(p_value timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
$function$;

CREATE FUNCTION saas.quick_links_mutation_projection(p_store_id uuid, p_link_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id', link.id,
    'status', link.status,
    'version', link.version,
    'expiresAt', saas.quick_links_json_timestamp(link.expires_at),
    'updatedAt', saas.quick_links_json_timestamp(link.updated_at)
  )
  FROM saas.quick_order_links AS link
  WHERE link.store_id = p_store_id
    AND link.id = p_link_id
$function$;

CREATE FUNCTION saas.quick_links_detail_projection(p_store_id uuid, p_link_id uuid, p_now timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', link.id,
    'customerName', link.customer_name,
    'customerEmail', link.customer_email,
    'customerPhone', link.customer_phone,
    'firstProductName', (
      SELECT item.product_name
      FROM saas.quick_order_link_items AS item
      WHERE item.store_id = p_store_id
        AND item.quick_order_link_id = p_link_id
      ORDER BY item.position, item.id
      LIMIT 1
    ),
    'itemCount', (
      SELECT pg_catalog.count(*)
      FROM saas.quick_order_link_items AS item
      WHERE item.store_id = p_store_id
        AND item.quick_order_link_id = p_link_id
    ),
    'status', CASE
      WHEN link.status IN ('active','opened') AND link.expires_at <= p_now THEN 'expired'
      ELSE link.status
    END,
    'currency', link.currency,
    'totalCents', link.total_cents,
    'expiresAt', saas.quick_links_json_timestamp(link.expires_at),
    'createdAt', saas.quick_links_json_timestamp(link.created_at),
    'version', link.version,
    'shippingAddress', link.shipping_address,
    'billingAddress', link.billing_address,
    'customerNote', link.customer_note,
    'internalLabel', link.internal_label,
    'providerKey', provider.provider_key,
    'subtotalCents', link.subtotal_cents,
    'shippingCents', link.shipping_cents,
    'discountCents', link.discount_cents,
    'items', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', item.id,
        'position', item.position,
        'productName', item.product_name,
        'variantName', item.variant_name,
        'sku', item.sku,
        'imageUrl', item.image_url,
        'unitPriceCents', item.unit_price_cents,
        'quantity', item.quantity,
        'lineTotalCents', item.line_total_cents
      )) ORDER BY item.position, item.id), '[]'::jsonb)
      FROM saas.quick_order_link_items AS item
      WHERE item.store_id = p_store_id
        AND item.quick_order_link_id = p_link_id
    ),
    'openedAt', CASE WHEN link.opened_at IS NULL THEN NULL ELSE saas.quick_links_json_timestamp(link.opened_at) END,
    'paidAt', CASE WHEN link.paid_at IS NULL THEN NULL ELSE saas.quick_links_json_timestamp(link.paid_at) END,
    'cancelledAt', CASE WHEN link.cancelled_at IS NULL THEN NULL ELSE saas.quick_links_json_timestamp(link.cancelled_at) END,
    'orderId', link.order_id,
    'updatedAt', saas.quick_links_json_timestamp(link.updated_at)
  ))
  FROM saas.quick_order_links AS link
  JOIN saas.checkout_provider_configs AS provider
    ON provider.store_id = link.store_id
   AND provider.id = link.provider_config_id
  WHERE link.store_id = p_store_id
    AND link.id = p_link_id
$function$;

CREATE FUNCTION saas.quick_links_lock_manage_authority(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  PERFORM 1
  FROM saas.stores AS store
  WHERE store.id=p_store_id
  ORDER BY store.id
  FOR SHARE;

  PERFORM 1
  FROM saas.memberships AS membership
  WHERE membership.id=p_membership_id
  ORDER BY membership.id
  FOR SHARE;

  PERFORM 1
  FROM saas.plans AS plan
  WHERE plan.id=p_plan_id
  ORDER BY plan.id
  FOR SHARE;

  PERFORM 1
  FROM saas.subscriptions AS subscription
  WHERE subscription.store_id=p_store_id
  ORDER BY subscription.id
  FOR SHARE;

  PERFORM 1
  FROM saas.plan_features AS feature
  WHERE feature.plan_id=p_plan_id
    AND feature.feature_key IN ('orders','checkout')
  ORDER BY feature.feature_ordinal,feature.feature_key
  FOR SHARE;

  RETURN saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
END
$function$;

CREATE FUNCTION saas.quick_links_list(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_status text, p_page_size bigint, p_cursor_created_at timestamptz, p_cursor_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  page_items jsonb;
  has_more boolean;
  last_created_at timestamptz;
  last_id uuid;
BEGIN
  authority_error := saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
     OR (p_status IS NOT NULL AND p_status <> ALL (ARRAY['active','opened','paid','cancelled','expired']))
     OR pg_catalog.num_nulls(p_cursor_created_at,p_cursor_id) NOT IN (0,2) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;

  WITH candidates AS (
    SELECT link.*,
      CASE
        WHEN link.status IN ('active','opened') AND link.expires_at <= p_now THEN 'expired'
        ELSE link.status
      END AS effective_status
    FROM saas.quick_order_links AS link
    WHERE link.store_id = p_store_id
      AND (p_status IS NULL OR CASE
        WHEN link.status IN ('active','opened') AND link.expires_at <= p_now THEN 'expired'
        ELSE link.status
      END = p_status)
      AND (p_cursor_created_at IS NULL OR (link.created_at,link.id) < (p_cursor_created_at,p_cursor_id))
    ORDER BY link.created_at DESC, link.id DESC
    LIMIT p_page_size + 1
  ), page AS (
    SELECT candidate.*,
      pg_catalog.row_number() OVER (ORDER BY candidate.created_at DESC,candidate.id DESC) AS page_position
    FROM candidates AS candidate
    ORDER BY candidate.created_at DESC, candidate.id DESC
    LIMIT p_page_size
  )
  SELECT
    COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', page.id,
      'customerName', page.customer_name,
      'customerEmail', page.customer_email,
      'firstProductName', (
        SELECT item.product_name
        FROM saas.quick_order_link_items AS item
        WHERE item.store_id = p_store_id
          AND item.quick_order_link_id = page.id
        ORDER BY item.position, item.id
        LIMIT 1
      ),
      'itemCount', (
        SELECT pg_catalog.count(*)
        FROM saas.quick_order_link_items AS item
        WHERE item.store_id = p_store_id
          AND item.quick_order_link_id = page.id
      ),
      'status', page.effective_status,
      'currency', page.currency,
      'totalCents', page.total_cents,
      'expiresAt', saas.quick_links_json_timestamp(page.expires_at),
      'createdAt', saas.quick_links_json_timestamp(page.created_at),
      'version', page.version
    ) ORDER BY page.page_position), '[]'::jsonb),
    (SELECT pg_catalog.count(*) > p_page_size FROM candidates),
    (SELECT tail.created_at FROM page AS tail WHERE tail.page_position = p_page_size),
    (SELECT tail.id FROM page AS tail WHERE tail.page_position = p_page_size)
  INTO page_items,has_more,last_created_at,last_id
  FROM page;

  result_payload := pg_catalog.jsonb_build_object('items',page_items);
  IF has_more THEN
    result_payload := result_payload || pg_catalog.jsonb_build_object(
      'nextCursor', pg_catalog.jsonb_build_object(
        'createdAt', saas.quick_links_json_timestamp(last_created_at),
        'id', last_id
      )
    );
  END IF;
  RETURN QUERY SELECT 'listed'::text,result_payload;
END
$function$;

CREATE FUNCTION saas.quick_links_get(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz, p_link_id uuid
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
BEGIN
  authority_error := saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;
  IF p_link_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;
  result_payload := saas.quick_links_detail_projection(p_store_id,p_link_id,p_now);
  IF result_payload IS NULL THEN
    RETURN QUERY SELECT 'quick_link_not_found'::text,NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'found'::text,result_payload;
END
$function$;

CREATE FUNCTION saas.quick_links_create(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_link_id uuid, p_item_ids uuid[], p_variant_ids uuid[], p_quantities bigint[], p_provider_config_id uuid,
  p_customer_name text, p_customer_email text, p_customer_phone text,
  p_shipping_address jsonb, p_billing_address jsonb, p_customer_note text, p_internal_label text,
  p_shipping_cents bigint, p_discount_cents bigint, p_expiry_hours bigint,
  p_token_digest text, p_token_key_id text, p_sealed_token jsonb,
  p_operation_id uuid, p_fingerprint text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing_operation saas.quick_order_link_operations%ROWTYPE;
  store_currency text;
  item_position integer;
  product_id uuid;
  product_name text;
  variant_name text;
  variant_sku text;
  variant_price bigint;
  requested_variant_count bigint;
  locked_variant_count bigint;
  product_ids uuid[] := ARRAY[]::uuid[];
  product_names text[] := ARRAY[]::text[];
  variant_names text[] := ARRAY[]::text[];
  variant_skus text[] := ARRAY[]::text[];
  image_urls text[] := ARRAY[]::text[];
  unit_prices bigint[] := ARRAY[]::bigint[];
  line_totals bigint[] := ARRAY[]::bigint[];
  subtotal numeric := 0;
  line_total numeric;
  total numeric;
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
BEGIN
  authority_error := saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error = 'membership_denied' AND EXISTS (
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN
    authority_error := 'action_denied';
  END IF;
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_operation_id::text !~ uuid_pattern
     OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;

  authority_error := saas.quick_links_lock_manage_authority(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now
  );
  IF authority_error = 'membership_denied' AND EXISTS (
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error := 'action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.quick_links.operation:'||p_store_id::text||':'||p_operation_id::text,0)
  );
  SELECT operation.* INTO existing_operation
  FROM saas.quick_order_link_operations AS operation
  WHERE operation.store_id=p_store_id
    AND operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind='create'
       AND existing_operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE
      RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  IF p_link_id IS NULL OR p_link_id::text !~ uuid_pattern
     OR p_item_ids IS NULL OR p_variant_ids IS NULL OR p_quantities IS NULL
     OR pg_catalog.cardinality(p_item_ids) NOT BETWEEN 1 AND 100
     OR pg_catalog.cardinality(p_item_ids) <> pg_catalog.cardinality(p_variant_ids)
     OR pg_catalog.cardinality(p_item_ids) <> pg_catalog.cardinality(p_quantities)
     OR p_provider_config_id IS NULL
     OR p_customer_name IS NULL OR p_customer_name<>pg_catalog.btrim(p_customer_name)
     OR pg_catalog.char_length(p_customer_name) NOT BETWEEN 1 AND 200 OR p_customer_name ~ '[[:cntrl:]]'
     OR p_customer_email IS NULL OR p_customer_email<>pg_catalog.btrim(p_customer_email)
     OR pg_catalog.char_length(p_customer_email) NOT BETWEEN 3 AND 320 OR p_customer_email ~ '[[:cntrl:]]'
     OR p_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR (p_customer_phone IS NOT NULL AND (p_customer_phone<>pg_catalog.btrim(p_customer_phone) OR pg_catalog.char_length(p_customer_phone) NOT BETWEEN 3 AND 32 OR p_customer_phone ~ '[[:cntrl:]]'))
     OR saas.quick_link_address_is_valid(p_shipping_address) IS DISTINCT FROM TRUE
     OR saas.quick_link_address_is_valid(p_billing_address) IS DISTINCT FROM TRUE
     OR (p_customer_note IS NOT NULL AND (p_customer_note<>pg_catalog.btrim(p_customer_note) OR pg_catalog.char_length(p_customer_note) NOT BETWEEN 1 AND 2000 OR p_customer_note ~ '[[:cntrl:]]'))
     OR (p_internal_label IS NOT NULL AND (p_internal_label<>pg_catalog.btrim(p_internal_label) OR pg_catalog.char_length(p_internal_label) NOT BETWEEN 1 AND 200 OR p_internal_label ~ '[[:cntrl:]]'))
     OR p_shipping_cents IS NULL OR p_shipping_cents NOT BETWEEN 0 AND 500000000000000
     OR p_discount_cents IS NULL OR p_discount_cents NOT BETWEEN 0 AND 500000000000000
     OR p_expiry_hours IS NULL OR p_expiry_hours <> ALL (ARRAY[4,12,24,48,72]::bigint[])
     OR p_token_digest IS NULL OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_token_key_id IS NULL OR p_token_key_id<>pg_catalog.btrim(p_token_key_id)
     OR pg_catalog.char_length(p_token_key_id) NOT BETWEEN 1 AND 128 OR p_token_key_id ~ '[[:cntrl:]]'
     OR saas.quick_link_sealed_envelope_is_valid(p_sealed_token,p_token_key_id) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;
  IF pg_catalog.array_ndims(p_item_ids) IS DISTINCT FROM 1
     OR pg_catalog.array_lower(p_item_ids,1) IS DISTINCT FROM 1
     OR pg_catalog.array_upper(p_item_ids,1) IS DISTINCT FROM pg_catalog.cardinality(p_item_ids)
     OR pg_catalog.array_ndims(p_variant_ids) IS DISTINCT FROM 1
     OR pg_catalog.array_lower(p_variant_ids,1) IS DISTINCT FROM 1
     OR pg_catalog.array_upper(p_variant_ids,1) IS DISTINCT FROM pg_catalog.cardinality(p_variant_ids)
     OR pg_catalog.array_ndims(p_quantities) IS DISTINCT FROM 1
     OR pg_catalog.array_lower(p_quantities,1) IS DISTINCT FROM 1
     OR pg_catalog.array_upper(p_quantities,1) IS DISTINCT FROM pg_catalog.cardinality(p_quantities) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;
  IF pg_catalog.array_position(p_item_ids,NULL) IS NOT NULL
     OR pg_catalog.array_position(p_variant_ids,NULL) IS NOT NULL
     OR pg_catalog.array_position(p_quantities,NULL) IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_item_ids) AS supplied(id) WHERE supplied.id::text !~ uuid_pattern)
     OR (SELECT pg_catalog.count(DISTINCT supplied.id) FROM pg_catalog.unnest(p_item_ids) AS supplied(id)) <> pg_catalog.cardinality(p_item_ids)
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_quantities) AS supplied(quantity) WHERE supplied.quantity NOT BETWEEN 1 AND 9999) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;

  PERFORM 1
    FROM saas.checkout_provider_configs AS provider
    JOIN saas.stores AS store ON store.id=provider.store_id
    WHERE provider.store_id=p_store_id AND provider.id=p_provider_config_id
      AND provider.status='active' AND provider.provider_key='paytr'
      AND store.status='active'
    FOR SHARE OF provider,store;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'provider_not_ready'::text,NULL::jsonb;
    RETURN;
  END IF;
  SELECT store.currency INTO store_currency
  FROM saas.stores AS store
  WHERE store.id=p_store_id AND store.status='active';

  SELECT pg_catalog.count(DISTINCT supplied.variant_id)
  INTO requested_variant_count
  FROM pg_catalog.unnest(p_variant_ids) AS supplied(variant_id);
  PERFORM 1
  FROM (
    SELECT DISTINCT supplied.variant_id
    FROM pg_catalog.unnest(p_variant_ids) AS supplied(variant_id)
  ) AS requested
  JOIN saas.product_variants AS variant
    ON variant.store_id=p_store_id AND variant.id=requested.variant_id AND variant.status='active'
  JOIN saas.products AS product
    ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
  ORDER BY product.id,variant.id
  FOR UPDATE OF product,variant;
  GET DIAGNOSTICS locked_variant_count = ROW_COUNT;
  IF locked_variant_count<>requested_variant_count THEN
    RETURN QUERY SELECT 'catalog_item_unavailable'::text,NULL::jsonb;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT requested.variant_id,pg_catalog.sum(requested.quantity::numeric) AS requested_quantity
      FROM ROWS FROM (
        pg_catalog.unnest(p_variant_ids),
        pg_catalog.unnest(p_quantities)
      ) AS requested(variant_id,quantity)
      GROUP BY requested.variant_id
    ) AS grouped_request
    JOIN saas.product_variants AS variant
      ON variant.store_id=p_store_id AND variant.id=grouped_request.variant_id
    WHERE variant.stock_tracking
      AND grouped_request.requested_quantity>variant.stock_quantity::numeric
  ) THEN
    RETURN QUERY SELECT 'stock_unavailable'::text,NULL::jsonb;
    RETURN;
  END IF;

  FOR item_position IN 1..pg_catalog.cardinality(p_variant_ids) LOOP
    SELECT product.id,product.title,variant.title,variant.sku,variant.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants AS variant
    JOIN saas.products AS product
      ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_ids[item_position]
      AND variant.status='active' AND product.status='active';
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'catalog_item_unavailable'::text,NULL::jsonb;
      RETURN;
    END IF;
    IF variant_price NOT BETWEEN 0 AND 8000000000 THEN
      RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
      RETURN;
    END IF;
    line_total := variant_price::numeric * p_quantities[item_position]::numeric;
    IF line_total NOT BETWEEN 0 AND 79992000000000 THEN
      RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
      RETURN;
    END IF;
    subtotal := subtotal + line_total;
    product_ids := pg_catalog.array_append(product_ids,product_id);
    product_names := pg_catalog.array_append(product_names,product_name);
    variant_names := pg_catalog.array_append(variant_names,variant_name);
    variant_skus := pg_catalog.array_append(variant_skus,variant_sku);
    image_urls := pg_catalog.array_append(image_urls,saas.quick_link_canonical_image_url(p_store_id,product_id,p_variant_ids[item_position]));
    unit_prices := pg_catalog.array_append(unit_prices,variant_price);
    line_totals := pg_catalog.array_append(line_totals,line_total::bigint);
  END LOOP;
  total := subtotal + p_shipping_cents::numeric - p_discount_cents::numeric;
  IF subtotal NOT BETWEEN 0 AND 7999200000000000 OR total NOT BETWEEN 0 AND 8500000000000000 THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO saas.quick_order_links(
      id,store_id,creating_membership_id,provider_config_id,status,
      token_digest,token_key_id,sealed_token,customer_name,customer_email,customer_phone,
      shipping_address,billing_address,customer_note,internal_label,currency,
      subtotal_cents,shipping_cents,discount_cents,total_cents,expires_at,
      opened_at,paid_at,cancelled_at,order_id,version,created_at,updated_at
    ) VALUES (
      p_link_id,p_store_id,p_membership_id,p_provider_config_id,'active',
      p_token_digest,p_token_key_id,p_sealed_token,p_customer_name,p_customer_email,p_customer_phone,
      p_shipping_address,p_billing_address,p_customer_note,p_internal_label,store_currency,
      subtotal::bigint,p_shipping_cents,p_discount_cents,total::bigint,
      p_now + pg_catalog.make_interval(hours=>p_expiry_hours::integer),
      NULL,NULL,NULL,NULL,1,p_now,p_now
    );
    FOR item_position IN 1..pg_catalog.cardinality(p_item_ids) LOOP
      INSERT INTO saas.quick_order_link_items(
        id,store_id,quick_order_link_id,product_id,variant_id,position,
        product_name,variant_name,sku,image_url,unit_price_cents,quantity,line_total_cents,created_at
      ) VALUES (
        p_item_ids[item_position],p_store_id,p_link_id,product_ids[item_position],p_variant_ids[item_position],item_position-1,
        product_names[item_position],variant_names[item_position],variant_skus[item_position],image_urls[item_position],
        unit_prices[item_position],p_quantities[item_position]::integer,line_totals[item_position],p_now
      );
    END LOOP;
    result_payload := saas.quick_links_mutation_projection(p_store_id,p_link_id);
    INSERT INTO saas.quick_order_link_operations(
      operation_id,store_id,quick_order_link_id,operation_kind,payload_fingerprint,result_payload,committed_at
    ) VALUES (p_operation_id,p_store_id,p_link_id,'create',p_fingerprint,result_payload,p_now);
  EXCEPTION
    WHEN unique_violation OR check_violation OR foreign_key_violation THEN
      RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
      RETURN;
    WHEN raise_exception THEN
      RETURN QUERY SELECT 'provider_not_ready'::text,NULL::jsonb;
      RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,result_payload;
END
$function$;

CREATE FUNCTION saas.quick_links_cancel(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_link_id uuid, p_expected_version bigint, p_operation_id uuid, p_fingerprint text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing_operation saas.quick_order_link_operations%ROWTYPE;
  current_link saas.quick_order_links%ROWTYPE;
BEGIN
  authority_error := saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error = 'membership_denied' AND EXISTS (
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error := 'action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;

  authority_error := saas.quick_links_lock_manage_authority(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now
  );
  IF authority_error = 'membership_denied' AND EXISTS (
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error := 'action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.quick_links.operation:'||p_store_id::text||':'||p_operation_id::text,0)
  );
  SELECT operation.* INTO existing_operation FROM saas.quick_order_link_operations AS operation
  WHERE operation.store_id=p_store_id
    AND operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind='cancel'
       AND existing_operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
    END IF;
    RETURN;
  END IF;
  IF p_link_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link
  WHERE link.store_id=p_store_id AND link.id=p_link_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'quick_link_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_link.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF current_link.status NOT IN ('active','opened') OR current_link.expires_at<=p_now THEN
    RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN;
  END IF;
  BEGIN
    UPDATE saas.quick_order_links SET status='cancelled',cancelled_at=p_now,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_link_id;
    result_payload := saas.quick_links_mutation_projection(p_store_id,p_link_id);
    INSERT INTO saas.quick_order_link_operations(
      operation_id,store_id,quick_order_link_id,operation_kind,payload_fingerprint,result_payload,committed_at
    ) VALUES (p_operation_id,p_store_id,p_link_id,'cancel',p_fingerprint,result_payload,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,result_payload;
END
$function$;

CREATE FUNCTION saas.quick_links_duplicate(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_source_link_id uuid, p_link_id uuid, p_item_ids uuid[],
  p_token_digest text, p_token_key_id text, p_sealed_token jsonb,
  p_operation_id uuid, p_fingerprint text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing_operation saas.quick_order_link_operations%ROWTYPE;
  source_link saas.quick_order_links%ROWTYPE;
  source_item record;
  source_count integer;
  item_position integer := 0;
  product_id uuid;
  product_name text;
  variant_name text;
  variant_sku text;
  variant_price bigint;
  requested_variant_count bigint;
  locked_variant_count bigint;
  product_ids uuid[] := ARRAY[]::uuid[];
  variant_ids uuid[] := ARRAY[]::uuid[];
  quantities bigint[] := ARRAY[]::bigint[];
  product_names text[] := ARRAY[]::text[];
  variant_names text[] := ARRAY[]::text[];
  variant_skus text[] := ARRAY[]::text[];
  image_urls text[] := ARRAY[]::text[];
  unit_prices bigint[] := ARRAY[]::bigint[];
  line_totals bigint[] := ARRAY[]::bigint[];
  subtotal numeric := 0;
  line_total numeric;
  total numeric;
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
BEGIN
  authority_error := saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error = 'membership_denied' AND EXISTS (
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error := 'action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_operation_id::text !~ uuid_pattern
     OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;

  authority_error := saas.quick_links_lock_manage_authority(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now
  );
  IF authority_error = 'membership_denied' AND EXISTS (
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error := 'action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.quick_links.operation:'||p_store_id::text||':'||p_operation_id::text,0)
  );
  SELECT operation.* INTO existing_operation FROM saas.quick_order_link_operations AS operation
  WHERE operation.store_id=p_store_id
    AND operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind='duplicate'
       AND existing_operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
    END IF;
    RETURN;
  END IF;
  IF p_source_link_id IS NULL OR p_link_id IS NULL OR p_link_id::text !~ uuid_pattern
     OR p_item_ids IS NULL OR pg_catalog.cardinality(p_item_ids) NOT BETWEEN 1 AND 100
     OR p_token_digest IS NULL OR p_token_digest !~ '^[a-f0-9]{64}$'
     OR p_token_key_id IS NULL OR p_token_key_id<>pg_catalog.btrim(p_token_key_id)
     OR pg_catalog.char_length(p_token_key_id) NOT BETWEEN 1 AND 128 OR p_token_key_id ~ '[[:cntrl:]]'
     OR saas.quick_link_sealed_envelope_is_valid(p_sealed_token,p_token_key_id) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  IF pg_catalog.array_ndims(p_item_ids) IS DISTINCT FROM 1
     OR pg_catalog.array_lower(p_item_ids,1) IS DISTINCT FROM 1
     OR pg_catalog.array_upper(p_item_ids,1) IS DISTINCT FROM pg_catalog.cardinality(p_item_ids) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  IF pg_catalog.array_position(p_item_ids,NULL) IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.unnest(p_item_ids) AS supplied(id) WHERE supplied.id::text !~ uuid_pattern)
     OR (SELECT pg_catalog.count(DISTINCT supplied.id) FROM pg_catalog.unnest(p_item_ids) AS supplied(id)) <> pg_catalog.cardinality(p_item_ids) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT link.* INTO source_link FROM saas.quick_order_links AS link
  WHERE link.store_id=p_store_id AND link.id=p_source_link_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'quick_link_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_token_digest=source_link.token_digest OR p_sealed_token=source_link.sealed_token THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.checkout_provider_configs AS provider
    JOIN saas.stores AS store ON store.id=provider.store_id
    WHERE provider.store_id=p_store_id AND provider.id=source_link.provider_config_id
      AND provider.status='active' AND provider.provider_key='paytr'
      AND store.status='active'
    FOR SHARE OF provider,store;
  IF NOT FOUND THEN RETURN QUERY SELECT 'provider_not_ready'::text,NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.count(*)::integer INTO source_count FROM saas.quick_order_link_items AS item
  WHERE item.store_id=p_store_id AND item.quick_order_link_id=p_source_link_id;
  IF source_count<>pg_catalog.cardinality(p_item_ids) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;

  SELECT pg_catalog.count(*)
  INTO requested_variant_count
  FROM (
    SELECT DISTINCT item.product_id,item.variant_id
    FROM saas.quick_order_link_items AS item
    WHERE item.store_id=p_store_id AND item.quick_order_link_id=p_source_link_id
  ) AS requested;
  PERFORM 1
  FROM (
    SELECT DISTINCT item.product_id,item.variant_id
    FROM saas.quick_order_link_items AS item
    WHERE item.store_id=p_store_id AND item.quick_order_link_id=p_source_link_id
  ) AS requested
  JOIN saas.product_variants AS variant
    ON variant.store_id=p_store_id AND variant.id=requested.variant_id
   AND variant.product_id=requested.product_id AND variant.status='active'
  JOIN saas.products AS product
    ON product.store_id=variant.store_id AND product.id=requested.product_id AND product.status='active'
  ORDER BY product.id,variant.id
  FOR UPDATE OF product,variant;
  GET DIAGNOSTICS locked_variant_count = ROW_COUNT;
  IF locked_variant_count<>requested_variant_count THEN
    RETURN QUERY SELECT 'catalog_item_unavailable'::text,NULL::jsonb; RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT item.variant_id,pg_catalog.sum(item.quantity::numeric) AS requested_quantity
      FROM saas.quick_order_link_items AS item
      WHERE item.store_id=p_store_id AND item.quick_order_link_id=p_source_link_id
      GROUP BY item.variant_id
    ) AS grouped_request
    JOIN saas.product_variants AS variant
      ON variant.store_id=p_store_id AND variant.id=grouped_request.variant_id
    WHERE variant.stock_tracking
      AND grouped_request.requested_quantity>variant.stock_quantity::numeric
  ) THEN
    RETURN QUERY SELECT 'stock_unavailable'::text,NULL::jsonb; RETURN;
  END IF;

  FOR source_item IN
    SELECT item.* FROM saas.quick_order_link_items AS item
    WHERE item.store_id=p_store_id AND item.quick_order_link_id=p_source_link_id
    ORDER BY item.position,item.id
  LOOP
    item_position := item_position + 1;
    SELECT product.id,product.title,variant.title,variant.sku,variant.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants AS variant
    JOIN saas.products AS product ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=p_store_id AND variant.id=source_item.variant_id
      AND product.id=source_item.product_id AND variant.status='active' AND product.status='active';
    IF NOT FOUND THEN RETURN QUERY SELECT 'catalog_item_unavailable'::text,NULL::jsonb; RETURN; END IF;
    IF variant_price NOT BETWEEN 0 AND 8000000000 THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
    line_total := variant_price::numeric * source_item.quantity::numeric;
    IF line_total NOT BETWEEN 0 AND 79992000000000 THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
    subtotal := subtotal + line_total;
    product_ids := pg_catalog.array_append(product_ids,product_id);
    variant_ids := pg_catalog.array_append(variant_ids,source_item.variant_id);
    quantities := pg_catalog.array_append(quantities,source_item.quantity::bigint);
    product_names := pg_catalog.array_append(product_names,product_name);
    variant_names := pg_catalog.array_append(variant_names,variant_name);
    variant_skus := pg_catalog.array_append(variant_skus,variant_sku);
    image_urls := pg_catalog.array_append(image_urls,saas.quick_link_canonical_image_url(p_store_id,product_id,source_item.variant_id));
    unit_prices := pg_catalog.array_append(unit_prices,variant_price);
    line_totals := pg_catalog.array_append(line_totals,line_total::bigint);
  END LOOP;
  total := subtotal + source_link.shipping_cents::numeric - source_link.discount_cents::numeric;
  IF subtotal NOT BETWEEN 0 AND 7999200000000000 OR total NOT BETWEEN 0 AND 8500000000000000 THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;

  BEGIN
    INSERT INTO saas.quick_order_links(
      id,store_id,creating_membership_id,provider_config_id,status,
      token_digest,token_key_id,sealed_token,customer_name,customer_email,customer_phone,
      shipping_address,billing_address,customer_note,internal_label,currency,
      subtotal_cents,shipping_cents,discount_cents,total_cents,expires_at,
      opened_at,paid_at,cancelled_at,order_id,version,created_at,updated_at
    ) VALUES (
      p_link_id,p_store_id,p_membership_id,source_link.provider_config_id,'active',
      p_token_digest,p_token_key_id,p_sealed_token,source_link.customer_name,source_link.customer_email,source_link.customer_phone,
      source_link.shipping_address,source_link.billing_address,source_link.customer_note,source_link.internal_label,source_link.currency,
      subtotal::bigint,source_link.shipping_cents,source_link.discount_cents,total::bigint,p_now+interval '24 hours',
      NULL,NULL,NULL,NULL,1,p_now,p_now
    );
    FOR item_position IN 1..source_count LOOP
      INSERT INTO saas.quick_order_link_items(
        id,store_id,quick_order_link_id,product_id,variant_id,position,
        product_name,variant_name,sku,image_url,unit_price_cents,quantity,line_total_cents,created_at
      ) VALUES (
        p_item_ids[item_position],p_store_id,p_link_id,product_ids[item_position],variant_ids[item_position],item_position-1,
        product_names[item_position],variant_names[item_position],variant_skus[item_position],image_urls[item_position],
        unit_prices[item_position],quantities[item_position]::integer,line_totals[item_position],p_now
      );
    END LOOP;
    result_payload := saas.quick_links_mutation_projection(p_store_id,p_link_id);
    INSERT INTO saas.quick_order_link_operations(
      operation_id,store_id,quick_order_link_id,operation_kind,payload_fingerprint,result_payload,committed_at
    ) VALUES (p_operation_id,p_store_id,p_link_id,'duplicate',p_fingerprint,result_payload,p_now);
  EXCEPTION
    WHEN unique_violation OR check_violation OR foreign_key_violation THEN
      RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
    WHEN raise_exception THEN
      RETURN QUERY SELECT 'provider_not_ready'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,result_payload;
END
$function$;

CREATE FUNCTION saas.quick_links_recover_operation(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_operation_id uuid, p_operation_kind text, p_fingerprint text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing_operation saas.quick_order_link_operations%ROWTYPE;
BEGIN
  authority_error := saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error = 'membership_denied' AND EXISTS (
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error := 'action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_operation_kind IS NULL
     OR p_operation_kind<>ALL(ARRAY['create','cancel','duplicate'])
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT operation.* INTO existing_operation
  FROM saas.quick_order_link_operations AS operation
  WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'quick_link_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF existing_operation.operation_kind<>p_operation_kind OR existing_operation.payload_fingerprint<>p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
END
$function$;

REVOKE ALL ON FUNCTION saas.quick_links_json_timestamp(timestamptz) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.quick_links_mutation_projection(uuid,uuid) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.quick_links_detail_projection(uuid,uuid,timestamptz) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.quick_links_lock_manage_authority(uuid,uuid,uuid,uuid,text,bigint,timestamptz) FROM PUBLIC,celebix_saas_app;

REVOKE ALL ON FUNCTION saas.quick_links_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.quick_links_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text) TO celebix_saas_app;

COMMIT;
