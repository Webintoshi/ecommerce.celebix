BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.orders DROP CONSTRAINT orders_source_check;
ALTER TABLE saas.orders ADD CONSTRAINT orders_source_check
  CHECK (source IN ('storefront','quick_link','marketplace','manual_import','manual'));

CREATE TABLE saas.order_drafts (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  draft_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  customer_id uuid,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  currency text NOT NULL,
  subtotal_cents bigint NOT NULL,
  shipping_cents bigint NOT NULL,
  discount_cents bigint NOT NULL,
  total_cents bigint NOT NULL,
  shipping_address jsonb NOT NULL,
  billing_address jsonb NOT NULL,
  note text,
  adjust_inventory boolean NOT NULL,
  converted_order_id uuid,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT order_drafts_store_id_id_key UNIQUE (store_id, id),
  CONSTRAINT order_drafts_store_number_key UNIQUE (store_id, draft_number),
  CONSTRAINT order_drafts_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT order_drafts_customer_store_fk FOREIGN KEY (store_id, customer_id) REFERENCES saas.customers(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT order_drafts_order_store_fk FOREIGN KEY (store_id, converted_order_id) REFERENCES saas.orders(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT order_drafts_status_check CHECK (status IN ('draft','converted','archived')),
  CONSTRAINT order_drafts_lifecycle_check CHECK ((status='converted')=(converted_order_id IS NOT NULL)),
  CONSTRAINT order_drafts_currency_check CHECK (currency='TRY'),
  CONSTRAINT order_drafts_money_check CHECK (
    subtotal_cents BETWEEN 0 AND 9007199254740991
    AND shipping_cents BETWEEN 0 AND 9007199254740991
    AND discount_cents BETWEEN 0 AND 9007199254740991
    AND total_cents BETWEEN 0 AND 9007199254740991
    AND discount_cents<=subtotal_cents+shipping_cents
    AND total_cents=subtotal_cents+shipping_cents-discount_cents
  ),
  CONSTRAINT order_drafts_identity_check CHECK (
    customer_name=pg_catalog.btrim(customer_name)
    AND pg_catalog.char_length(customer_name) BETWEEN 1 AND 200
    AND customer_name !~ '[[:cntrl:]]'
    AND customer_email=pg_catalog.btrim(customer_email)
    AND pg_catalog.char_length(customer_email) BETWEEN 3 AND 320
    AND customer_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    AND (customer_phone IS NULL OR customer_phone ~ '^\+[1-9][0-9]{7,14}$')
  ),
  CONSTRAINT order_drafts_address_check CHECK (saas.orders_address_valid(shipping_address) AND saas.orders_address_valid(billing_address)),
  CONSTRAINT order_drafts_note_check CHECK (note IS NULL OR (note=pg_catalog.btrim(note) AND pg_catalog.char_length(note) BETWEEN 1 AND 2000 AND note !~ '[[:cntrl:]]')),
  CONSTRAINT order_drafts_version_check CHECK (version BETWEEN 1 AND 9007199254740991),
  CONSTRAINT order_drafts_time_check CHECK (pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at) AND updated_at>=created_at)
);

CREATE TABLE saas.order_draft_lines (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  position integer NOT NULL,
  product_name text NOT NULL,
  variant_name text,
  sku text,
  unit_price_cents bigint NOT NULL,
  quantity integer NOT NULL,
  discount_cents bigint NOT NULL,
  line_total_cents bigint NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT order_draft_lines_store_id_id_key UNIQUE (store_id, id),
  CONSTRAINT order_draft_lines_store_position_key UNIQUE (store_id, draft_id, position),
  CONSTRAINT order_draft_lines_store_variant_key UNIQUE (store_id, draft_id, variant_id),
  CONSTRAINT order_draft_lines_draft_store_fk FOREIGN KEY (store_id, draft_id) REFERENCES saas.order_drafts(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT order_draft_lines_product_store_fk FOREIGN KEY (store_id, product_id) REFERENCES saas.products(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT order_draft_lines_variant_store_fk FOREIGN KEY (store_id, variant_id) REFERENCES saas.product_variants(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT order_draft_lines_position_check CHECK (position BETWEEN 0 AND 99),
  CONSTRAINT order_draft_lines_quantity_check CHECK (quantity BETWEEN 1 AND 9999),
  CONSTRAINT order_draft_lines_money_check CHECK (
    unit_price_cents BETWEEN 0 AND 9007199254740991
    AND discount_cents BETWEEN 0 AND 9007199254740991
    AND line_total_cents BETWEEN 0 AND 9007199254740991
    AND discount_cents<=unit_price_cents*quantity
    AND line_total_cents=unit_price_cents*quantity-discount_cents
  ),
  CONSTRAINT order_draft_lines_time_check CHECK (pg_catalog.isfinite(created_at))
);

CREATE TABLE saas.order_draft_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT order_draft_operations_store_id_id_key UNIQUE (store_id, operation_id),
  CONSTRAINT order_draft_operations_draft_store_fk FOREIGN KEY (store_id, draft_id) REFERENCES saas.order_drafts(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT order_draft_operations_kind_check CHECK (operation_kind IN ('create','update','archive','convert')),
  CONSTRAINT order_draft_operations_fingerprint_check CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT order_draft_operations_payload_check CHECK (pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=32768),
  CONSTRAINT order_draft_operations_time_check CHECK (pg_catalog.isfinite(committed_at))
);

CREATE TABLE saas.manual_order_inventory_commitments (
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity integer NOT NULL,
  restoration_operation_id uuid,
  restored_at timestamptz,
  created_at timestamptz NOT NULL,
  CONSTRAINT manual_order_inventory_commitments_pkey PRIMARY KEY (store_id, order_id, variant_id),
  CONSTRAINT manual_order_inventory_commitments_store_id_id_key UNIQUE (store_id, order_id, variant_id),
  CONSTRAINT manual_order_inventory_commitments_order_store_fk FOREIGN KEY (store_id, order_id) REFERENCES saas.orders(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT manual_order_inventory_commitments_variant_store_fk FOREIGN KEY (store_id, variant_id) REFERENCES saas.product_variants(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT manual_order_inventory_commitments_quantity_check CHECK (quantity BETWEEN 1 AND 9999),
  CONSTRAINT manual_order_inventory_commitments_restore_check CHECK ((restoration_operation_id IS NULL)=(restored_at IS NULL)),
  CONSTRAINT manual_order_inventory_commitments_time_check CHECK (pg_catalog.isfinite(created_at) AND (restored_at IS NULL OR (pg_catalog.isfinite(restored_at) AND restored_at>=created_at)))
);

CREATE INDEX order_drafts_store_updated_idx ON saas.order_drafts(store_id,updated_at DESC,id DESC);
CREATE INDEX order_drafts_store_status_updated_idx ON saas.order_drafts(store_id,status,updated_at DESC,id DESC);
CREATE INDEX order_draft_lines_store_draft_idx ON saas.order_draft_lines(store_id,draft_id,position,id);
CREATE INDEX order_draft_operations_store_committed_idx ON saas.order_draft_operations(store_id,committed_at DESC,operation_id);
CREATE INDEX manual_order_inventory_commitments_unrestored_idx ON saas.manual_order_inventory_commitments(store_id,order_id,variant_id) WHERE restoration_operation_id IS NULL;

CREATE FUNCTION saas.guard_order_draft_operation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  RAISE EXCEPTION 'ORDER_DRAFT_OPERATION_IMMUTABLE';
END
$function$;
CREATE TRIGGER order_draft_operations_immutable BEFORE UPDATE OR DELETE ON saas.order_draft_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_order_draft_operation_mutation();

CREATE FUNCTION saas.order_drafts_intent_valid(p_value jsonb,p_expected_version_allowed boolean)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $function$
DECLARE checked_key text; line_value jsonb; line_count integer;
BEGIN
  IF p_value IS NULL OR pg_catalog.jsonb_typeof(p_value)<>'object'
    OR NOT (p_value ?& ARRAY['customerName','customerEmail','currency','shippingCents','discountCents','shippingAddress','billingAddress','adjustInventory','lines'])
  THEN RETURN false; END IF;
  FOR checked_key IN SELECT pg_catalog.jsonb_object_keys(p_value) LOOP
    IF checked_key<>ALL(ARRAY['customerId','customerName','customerEmail','customerPhone','currency','shippingCents','discountCents','shippingAddress','billingAddress','note','adjustInventory','lines','expectedVersion'])
      OR (checked_key='expectedVersion' AND NOT p_expected_version_allowed)
    THEN RETURN false; END IF;
  END LOOP;
  IF p_value->>'currency'<>'TRY'
    OR pg_catalog.jsonb_typeof(p_value->'adjustInventory')<>'boolean'
    OR pg_catalog.jsonb_typeof(p_value->'shippingCents')<>'number'
    OR pg_catalog.jsonb_typeof(p_value->'discountCents')<>'number'
    OR p_value->>'shippingCents' !~ '^(0|[1-9][0-9]{0,15})$'
    OR p_value->>'discountCents' !~ '^(0|[1-9][0-9]{0,15})$'
    OR (p_value->>'shippingCents')::numeric>9007199254740991
    OR (p_value->>'discountCents')::numeric>9007199254740991
    OR NOT saas.orders_address_valid(p_value->'shippingAddress')
    OR NOT saas.orders_address_valid(p_value->'billingAddress')
    OR pg_catalog.jsonb_typeof(p_value->'lines')<>'array'
  THEN RETURN false; END IF;
  IF pg_catalog.jsonb_typeof(p_value->'customerName')<>'string' OR pg_catalog.char_length(p_value->>'customerName') NOT BETWEEN 1 AND 200 OR p_value->>'customerName'<>pg_catalog.btrim(p_value->>'customerName') OR p_value->>'customerName'~'[[:cntrl:]]'
    OR pg_catalog.jsonb_typeof(p_value->'customerEmail')<>'string' OR pg_catalog.char_length(p_value->>'customerEmail') NOT BETWEEN 3 AND 320 OR p_value->>'customerEmail'<>pg_catalog.btrim(p_value->>'customerEmail') OR p_value->>'customerEmail'!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR (p_value ? 'customerPhone' AND (pg_catalog.jsonb_typeof(p_value->'customerPhone')<>'string' OR p_value->>'customerPhone'!~'^\+[1-9][0-9]{7,14}$'))
    OR (p_value ? 'customerId' AND (pg_catalog.jsonb_typeof(p_value->'customerId')<>'string' OR p_value->>'customerId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
    OR (p_value ? 'note' AND (pg_catalog.jsonb_typeof(p_value->'note')<>'string' OR pg_catalog.char_length(p_value->>'note') NOT BETWEEN 1 AND 2000 OR p_value->>'note'<>pg_catalog.btrim(p_value->>'note') OR p_value->>'note'~'[[:cntrl:]]'))
    OR (p_value ? 'expectedVersion' AND (pg_catalog.jsonb_typeof(p_value->'expectedVersion')<>'number' OR p_value->>'expectedVersion'!~'^[1-9][0-9]{0,15}$' OR (p_value->>'expectedVersion')::numeric>9007199254740991))
  THEN RETURN false; END IF;
  line_count:=pg_catalog.jsonb_array_length(p_value->'lines');
  IF line_count NOT BETWEEN 1 AND 100 THEN RETURN false; END IF;
  FOR line_value IN SELECT value FROM pg_catalog.jsonb_array_elements(p_value->'lines') LOOP
    IF pg_catalog.jsonb_typeof(line_value)<>'object'
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(line_value))<>5
      OR NOT (line_value ?& ARRAY['lineId','productId','variantId','quantity','discountCents'])
      OR line_value->>'lineId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR line_value->>'productId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR line_value->>'variantId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR pg_catalog.jsonb_typeof(line_value->'quantity')<>'number' OR line_value->>'quantity'!~'^[1-9][0-9]{0,3}$' OR (line_value->>'quantity')::integer NOT BETWEEN 1 AND 9999
      OR pg_catalog.jsonb_typeof(line_value->'discountCents')<>'number' OR line_value->>'discountCents'!~'^(0|[1-9][0-9]{0,15})$' OR (line_value->>'discountCents')::numeric>9007199254740991
    THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT pg_catalog.count(DISTINCT value->>'lineId') FROM pg_catalog.jsonb_array_elements(p_value->'lines'))<>line_count
    OR (SELECT pg_catalog.count(DISTINCT value->>'variantId') FROM pg_catalog.jsonb_array_elements(p_value->'lines'))<>line_count
  THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END
$function$;

CREATE FUNCTION saas.order_drafts_replace_lines(p_store_id uuid,p_draft_id uuid,p_intent jsonb,p_now timestamptz)
RETURNS TABLE(outcome text,subtotal_cents bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE expected_count integer:=pg_catalog.jsonb_array_length(p_intent->'lines'); catalog_count integer; computed_subtotal numeric;
BEGIN
  PERFORM variant.id
  FROM pg_catalog.jsonb_array_elements(p_intent->'lines') WITH ORDINALITY AS requested(value,ordinality)
  JOIN saas.products AS product ON product.id=(requested.value->>'productId')::uuid AND product.store_id=p_store_id AND product.status='active'
  JOIN saas.product_variants AS variant ON variant.id=(requested.value->>'variantId')::uuid AND variant.store_id=p_store_id AND variant.product_id=product.id AND variant.status='active'
  ORDER BY variant.id FOR SHARE OF product,variant;
  SELECT pg_catalog.count(*),pg_catalog.sum(variant.price_cents::numeric*(requested.value->>'quantity')::integer-(requested.value->>'discountCents')::numeric)
  INTO catalog_count,computed_subtotal
  FROM pg_catalog.jsonb_array_elements(p_intent->'lines') WITH ORDINALITY AS requested(value,ordinality)
  JOIN saas.products AS product ON product.id=(requested.value->>'productId')::uuid AND product.store_id=p_store_id AND product.status='active'
  JOIN saas.product_variants AS variant ON variant.id=(requested.value->>'variantId')::uuid AND variant.store_id=p_store_id AND variant.product_id=product.id AND variant.status='active'
  WHERE (requested.value->>'discountCents')::numeric<=variant.price_cents::numeric*(requested.value->>'quantity')::integer;
  IF catalog_count<>expected_count THEN RETURN QUERY SELECT 'catalog_conflict',NULL::bigint; RETURN; END IF;
  IF computed_subtotal<0 OR computed_subtotal>9007199254740991 THEN RETURN QUERY SELECT 'invalid_input',NULL::bigint; RETURN; END IF;
  DELETE FROM saas.order_draft_lines AS draft_line WHERE draft_line.store_id=p_store_id AND draft_line.draft_id=p_draft_id;
  INSERT INTO saas.order_draft_lines(id,store_id,draft_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
  SELECT (requested.value->>'lineId')::uuid,p_store_id,p_draft_id,product.id,variant.id,(requested.ordinality-1)::integer,product.title,variant.title,variant.sku,variant.price_cents,(requested.value->>'quantity')::integer,(requested.value->>'discountCents')::bigint,variant.price_cents*(requested.value->>'quantity')::integer-(requested.value->>'discountCents')::bigint,p_now
  FROM pg_catalog.jsonb_array_elements(p_intent->'lines') WITH ORDINALITY AS requested(value,ordinality)
  JOIN saas.products AS product ON product.id=(requested.value->>'productId')::uuid AND product.store_id=p_store_id
  JOIN saas.product_variants AS variant ON variant.id=(requested.value->>'variantId')::uuid AND variant.store_id=p_store_id AND variant.product_id=product.id
  ORDER BY requested.ordinality;
  RETURN QUERY SELECT 'saved',computed_subtotal::bigint;
END
$function$;

CREATE FUNCTION saas.order_drafts_list_projection(p_store_id uuid,p_draft_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',draft.id,'draftNumber',draft.draft_number,'status',draft.status,
    'customerName',draft.customer_name,'customerEmail',draft.customer_email,
    'currency',draft.currency,'totalCents',draft.total_cents,
    'lineCount',(SELECT pg_catalog.count(*) FROM saas.order_draft_lines AS draft_line WHERE draft_line.store_id=p_store_id AND draft_line.draft_id=draft.id),
    'adjustInventory',draft.adjust_inventory,'convertedOrderId',draft.converted_order_id,
    'convertedOrderNumber',converted_order.order_number,
    'createdAt',saas.orders_json_timestamp(draft.created_at),'updatedAt',saas.orders_json_timestamp(draft.updated_at),'version',draft.version
  ))
  FROM saas.order_drafts AS draft
  LEFT JOIN saas.orders AS converted_order ON converted_order.store_id=draft.store_id AND converted_order.id=draft.converted_order_id
  WHERE draft.store_id=p_store_id AND draft.id=p_draft_id
$function$;

CREATE FUNCTION saas.order_drafts_detail_projection(p_store_id uuid,p_draft_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
  SELECT saas.order_drafts_list_projection(p_store_id,draft.id)||pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'customerId',draft.customer_id,'customerPhone',draft.customer_phone,
    'subtotalCents',draft.subtotal_cents,'shippingCents',draft.shipping_cents,'discountCents',draft.discount_cents,
    'shippingAddress',draft.shipping_address,'billingAddress',draft.billing_address,'note',draft.note,
    'lines',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'lineId',draft_line.id,'position',draft_line.position,'productId',draft_line.product_id,'variantId',draft_line.variant_id,
      'productName',draft_line.product_name,'variantName',draft_line.variant_name,'sku',draft_line.sku,
      'unitPriceCents',draft_line.unit_price_cents,'quantity',draft_line.quantity,'discountCents',draft_line.discount_cents,
      'lineTotalCents',draft_line.line_total_cents
    )) ORDER BY draft_line.position,draft_line.id),'[]'::jsonb)
      FROM saas.order_draft_lines AS draft_line WHERE draft_line.store_id=p_store_id AND draft_line.draft_id=draft.id)
  ))
  FROM saas.order_drafts AS draft WHERE draft.store_id=p_store_id AND draft.id=p_draft_id
$function$;

CREATE FUNCTION saas.order_drafts_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_page_size integer,p_cursor_updated_at timestamptz,p_cursor_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; page_items jsonb; has_more boolean; last_updated_at timestamptz; last_id uuid;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR (p_cursor_updated_at IS NULL)<>(p_cursor_id IS NULL) OR (p_cursor_updated_at IS NOT NULL AND NOT pg_catalog.isfinite(p_cursor_updated_at)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  WITH candidates AS (
    SELECT draft.id,draft.updated_at,pg_catalog.row_number() OVER(ORDER BY draft.updated_at DESC,draft.id DESC) AS page_position
    FROM saas.order_drafts AS draft
    WHERE draft.store_id=p_store_id AND (p_cursor_updated_at IS NULL OR (draft.updated_at,draft.id)<(p_cursor_updated_at,p_cursor_id))
    ORDER BY draft.updated_at DESC,draft.id DESC LIMIT p_page_size+1
  ), page AS (SELECT * FROM candidates WHERE page_position<=p_page_size)
  SELECT COALESCE(pg_catalog.jsonb_agg(saas.order_drafts_list_projection(p_store_id,page.id) ORDER BY page.page_position),'[]'::jsonb),
    (SELECT pg_catalog.count(*)>p_page_size FROM candidates),
    (SELECT tail.updated_at FROM page AS tail WHERE tail.page_position=p_page_size),
    (SELECT tail.id FROM page AS tail WHERE tail.page_position=p_page_size)
  INTO page_items,has_more,last_updated_at,last_id FROM page;
  result_payload:=pg_catalog.jsonb_build_object('items',page_items);
  IF has_more THEN result_payload:=result_payload||pg_catalog.jsonb_build_object('nextCursor',pg_catalog.jsonb_build_object('updatedAt',saas.orders_cursor_timestamp(last_updated_at),'id',last_id)); END IF;
  RETURN QUERY SELECT 'listed',result_payload;
END
$function$;

CREATE FUNCTION saas.order_drafts_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_draft_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; projection jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_draft_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  projection:=saas.order_drafts_detail_projection(p_store_id,p_draft_id);
  IF projection IS NULL THEN RETURN QUERY SELECT 'draft_not_found',NULL::jsonb; ELSE RETURN QUERY SELECT 'found',projection; END IF;
END
$function$;

CREATE FUNCTION saas.order_drafts_recover_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.order_draft_operations%ROWTYPE;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT operation.* INTO existing FROM saas.order_draft_operations AS operation WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;
  ELSIF existing.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',existing.result_payload; END IF;
END
$function$;

CREATE FUNCTION saas.order_drafts_create(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_draft_id uuid,p_intent jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.order_draft_operations%ROWTYPE; line_outcome text; subtotal bigint; shipping bigint; discount bigint; projection jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_draft_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR NOT saas.order_drafts_intent_valid(p_intent,false) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.order-draft.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_draft_operations AS operation WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN IF existing.operation_kind='create' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.order_drafts AS draft WHERE draft.id=p_draft_id) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF p_intent ? 'customerId' AND NOT EXISTS(SELECT 1 FROM saas.customers AS customer WHERE customer.store_id=p_store_id AND customer.id=(p_intent->>'customerId')::uuid AND customer.status='active') THEN RETURN QUERY SELECT 'customer_conflict',NULL::jsonb; RETURN; END IF;
  shipping:=(p_intent->>'shippingCents')::bigint; discount:=(p_intent->>'discountCents')::bigint;
  INSERT INTO saas.order_drafts(id,store_id,draft_number,status,customer_id,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,shipping_address,billing_address,note,adjust_inventory,version,created_at,updated_at)
  VALUES(p_draft_id,p_store_id,'TSL-'||pg_catalog.left(pg_catalog.md5(p_draft_id::text),20),'draft',CASE WHEN p_intent ? 'customerId' THEN (p_intent->>'customerId')::uuid END,p_intent->>'customerName',p_intent->>'customerEmail',p_intent->>'customerPhone','TRY',0,shipping,0,shipping,p_intent->'shippingAddress',p_intent->'billingAddress',p_intent->>'note',(p_intent->>'adjustInventory')::boolean,1,p_now,p_now);
  SELECT saved.outcome,saved.subtotal_cents INTO line_outcome,subtotal FROM saas.order_drafts_replace_lines(p_store_id,p_draft_id,p_intent,p_now) AS saved;
  IF line_outcome<>'saved' THEN DELETE FROM saas.order_drafts WHERE store_id=p_store_id AND id=p_draft_id; RETURN QUERY SELECT line_outcome,NULL::jsonb; RETURN; END IF;
  IF discount>subtotal+shipping THEN DELETE FROM saas.order_draft_lines WHERE store_id=p_store_id AND draft_id=p_draft_id; DELETE FROM saas.order_drafts WHERE store_id=p_store_id AND id=p_draft_id; RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  UPDATE saas.order_drafts SET subtotal_cents=subtotal,discount_cents=discount,total_cents=subtotal+shipping-discount WHERE store_id=p_store_id AND id=p_draft_id;
  projection:=saas.order_drafts_detail_projection(p_store_id,p_draft_id);
  INSERT INTO saas.order_draft_operations(operation_id,store_id,draft_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_operation_id,p_store_id,p_draft_id,'create',p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'created',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.order_drafts_update(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_draft_id uuid,p_expected_version bigint,p_intent jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.order_draft_operations%ROWTYPE; current_draft saas.order_drafts%ROWTYPE; line_outcome text; subtotal bigint; shipping bigint; discount bigint; projection jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_draft_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR NOT saas.order_drafts_intent_valid(p_intent,true) OR NOT (p_intent ? 'expectedVersion') OR (p_intent->>'expectedVersion')::bigint<>p_expected_version THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.order-draft.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_draft_operations AS operation WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN IF existing.operation_kind='update' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  SELECT draft.* INTO current_draft FROM saas.order_drafts AS draft WHERE draft.store_id=p_store_id AND draft.id=p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'draft_not_found',NULL::jsonb; RETURN; END IF;
  IF current_draft.status<>'draft' THEN RETURN QUERY SELECT 'draft_not_editable',NULL::jsonb; RETURN; END IF;
  IF current_draft.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF p_intent ? 'customerId' AND NOT EXISTS(SELECT 1 FROM saas.customers AS customer WHERE customer.store_id=p_store_id AND customer.id=(p_intent->>'customerId')::uuid AND customer.status='active') THEN RETURN QUERY SELECT 'customer_conflict',NULL::jsonb; RETURN; END IF;
  SELECT saved.outcome,saved.subtotal_cents INTO line_outcome,subtotal FROM saas.order_drafts_replace_lines(p_store_id,p_draft_id,p_intent,p_now) AS saved;
  IF line_outcome<>'saved' THEN RETURN QUERY SELECT line_outcome,NULL::jsonb; RETURN; END IF;
  shipping:=(p_intent->>'shippingCents')::bigint; discount:=(p_intent->>'discountCents')::bigint;
  IF discount>subtotal+shipping THEN RAISE EXCEPTION 'ORDER_DRAFT_INVALID_TOTAL'; END IF;
  UPDATE saas.order_drafts SET customer_id=CASE WHEN p_intent ? 'customerId' THEN (p_intent->>'customerId')::uuid END,customer_name=p_intent->>'customerName',customer_email=p_intent->>'customerEmail',customer_phone=p_intent->>'customerPhone',subtotal_cents=subtotal,shipping_cents=shipping,discount_cents=discount,total_cents=subtotal+shipping-discount,shipping_address=p_intent->'shippingAddress',billing_address=p_intent->'billingAddress',note=p_intent->>'note',adjust_inventory=(p_intent->>'adjustInventory')::boolean,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_draft_id;
  projection:=saas.order_drafts_detail_projection(p_store_id,p_draft_id);
  INSERT INTO saas.order_draft_operations(operation_id,store_id,draft_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_operation_id,p_store_id,p_draft_id,'update',p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'updated',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  WHEN check_violation OR raise_exception THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.order_drafts_archive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_draft_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.order_draft_operations%ROWTYPE; current_draft saas.order_drafts%ROWTYPE; projection jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_draft_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.order-draft.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_draft_operations AS operation WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN IF existing.operation_kind='archive' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  SELECT draft.* INTO current_draft FROM saas.order_drafts AS draft WHERE draft.store_id=p_store_id AND draft.id=p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'draft_not_found',NULL::jsonb; RETURN; END IF;
  IF current_draft.status<>'draft' THEN RETURN QUERY SELECT 'draft_not_editable',NULL::jsonb; RETURN; END IF;
  IF current_draft.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  UPDATE saas.order_drafts SET status='archived',version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_draft_id;
  projection:=saas.order_drafts_detail_projection(p_store_id,p_draft_id);
  INSERT INTO saas.order_draft_operations(operation_id,store_id,draft_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_operation_id,p_store_id,p_draft_id,'archive',p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'archived',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.order_drafts_convert(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_draft_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.order_draft_operations%ROWTYPE; current_draft saas.order_drafts%ROWTYPE; order_id uuid; order_number text; projection jsonb; draft_line record;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_draft_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.order-draft.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_draft_operations AS operation WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN IF existing.operation_kind='convert' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  SELECT draft.* INTO current_draft FROM saas.order_drafts AS draft WHERE draft.store_id=p_store_id AND draft.id=p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'draft_not_found',NULL::jsonb; RETURN; END IF;
  IF current_draft.status<>'draft' THEN RETURN QUERY SELECT 'draft_not_editable',NULL::jsonb; RETURN; END IF;
  IF current_draft.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.order_draft_lines AS stored_line WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id) THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN; END IF;
  PERFORM variant.id FROM saas.order_draft_lines AS stored_line JOIN saas.products AS product ON product.store_id=p_store_id AND product.id=stored_line.product_id AND product.status='active' JOIN saas.product_variants AS variant ON variant.store_id=p_store_id AND variant.id=stored_line.variant_id AND variant.product_id=product.id AND variant.status='active' WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id ORDER BY variant.id FOR UPDATE OF variant,product;
  IF (SELECT pg_catalog.count(*) FROM saas.order_draft_lines AS stored_line WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id)<>(SELECT pg_catalog.count(*) FROM saas.order_draft_lines AS stored_line JOIN saas.products AS product ON product.store_id=p_store_id AND product.id=stored_line.product_id AND product.status='active' JOIN saas.product_variants AS variant ON variant.store_id=p_store_id AND variant.id=stored_line.variant_id AND variant.product_id=product.id AND variant.status='active' WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id) THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN; END IF;
  IF current_draft.adjust_inventory AND EXISTS(SELECT 1 FROM saas.order_draft_lines AS stored_line JOIN saas.product_variants AS variant ON variant.store_id=p_store_id AND variant.id=stored_line.variant_id WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id AND variant.stock_tracking AND variant.stock_quantity<stored_line.quantity) THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb; RETURN; END IF;
  order_id:=pg_catalog.md5('saas.manual-order:'||p_operation_id::text)::uuid;
  order_number:='MAN-'||pg_catalog.left(pg_catalog.replace(pg_catalog.lower(order_id::text),'-',''),20);
  INSERT INTO saas.orders(id,store_id,order_number,source,customer_id,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at)
  VALUES(order_id,p_store_id,order_number,'manual',current_draft.customer_id,current_draft.customer_name,current_draft.customer_email,current_draft.customer_phone,current_draft.currency,current_draft.subtotal_cents,current_draft.shipping_cents,current_draft.discount_cents,current_draft.total_cents,'pending','pending',current_draft.shipping_address,1,p_now,p_now);
  INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
  SELECT pg_catalog.md5('saas.manual-order-item:'||stored_line.id::text)::uuid,p_store_id,order_id,stored_line.product_id,stored_line.variant_id,stored_line.position,stored_line.product_name,stored_line.variant_name,stored_line.sku,stored_line.unit_price_cents,stored_line.quantity,stored_line.discount_cents,stored_line.line_total_cents,p_now
  FROM saas.order_draft_lines AS stored_line WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id ORDER BY stored_line.position;
  INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at)
  VALUES(pg_catalog.md5('saas.manual-order-event:'||p_operation_id::text)::uuid,p_store_id,order_id,p_membership_id,'order_created','Manual order created',pg_catalog.jsonb_build_object('source','manual','adjustedInventory',current_draft.adjust_inventory,'inventoryMessage',CASE WHEN current_draft.adjust_inventory THEN 'Stok güncellendi' ELSE 'Stok değiştirilmedi' END),p_now);
  IF current_draft.adjust_inventory THEN
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','checkout_sale',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id',order_id::text,true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
    FOR draft_line IN SELECT line.variant_id,line.quantity FROM saas.order_draft_lines AS line JOIN saas.product_variants AS variant ON variant.store_id=p_store_id AND variant.id=line.variant_id WHERE line.store_id=p_store_id AND line.draft_id=p_draft_id AND variant.stock_tracking ORDER BY line.variant_id LOOP
      UPDATE saas.product_variants AS variant SET stock_quantity=variant.stock_quantity-draft_line.quantity,version=variant.version+1,updated_at=p_now WHERE variant.store_id=p_store_id AND variant.id=draft_line.variant_id;
      INSERT INTO saas.manual_order_inventory_commitments(store_id,order_id,variant_id,quantity,created_at) VALUES(p_store_id,order_id,draft_line.variant_id,draft_line.quantity,p_now);
    END LOOP;
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  END IF;
  UPDATE saas.order_drafts SET status='converted',converted_order_id=order_id,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_draft_id;
  projection:=pg_catalog.jsonb_build_object('draftId',p_draft_id,'orderId',order_id,'orderNumber',order_number,'draftVersion',current_draft.version+1,'adjustedInventory',current_draft.adjust_inventory,'replayed',false);
  INSERT INTO saas.order_draft_operations(operation_id,store_id,draft_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_operation_id,p_store_id,p_draft_id,'convert',p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'converted',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  WHEN check_violation OR foreign_key_violation THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb;
END
$function$;

CREATE OR REPLACE FUNCTION saas.orders_transition_status(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_operation_id uuid, p_fingerprint text, p_order_id uuid, p_expected_version bigint, p_next_status text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $function$
DECLARE authority_error text; required_action text; stored_action text; existing saas.order_operations%ROWTYPE; current_order saas.orders%ROWTYPE; projection jsonb; commitment record;
BEGIN
  required_action := CASE WHEN p_next_status IN ('cancelled','refunded') THEN 'orders.manage' ELSE 'orders.fulfill' END;
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders',required_action);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_next_status IS NULL OR p_next_status <> ALL (ARRAY['pending','confirmed','preparing','shipped','delivered','cancelled','refunded']) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.orders.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_operations AS operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id FOR UPDATE;
  IF FOUND THEN
    stored_action:=CASE
      WHEN existing.operation_kind='transition_status' AND existing.result_payload->>'status' IN ('cancelled','refunded') THEN 'orders.manage'
      WHEN existing.operation_kind='transition_status' THEN 'orders.fulfill'
      WHEN existing.operation_kind='transition_payment' THEN 'orders.payment'
      WHEN existing.operation_kind='update_shipping' THEN 'orders.fulfill'
      ELSE 'orders.note'
    END;
    authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders',stored_action);
    IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
    IF existing.operation_kind='transition_status' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  SELECT order_row.* INTO current_order FROM saas.orders AS order_row WHERE order_row.store_id=p_store_id AND order_row.id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_order.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF NOT ((current_order.status='pending' AND p_next_status IN ('confirmed','cancelled')) OR (current_order.status='confirmed' AND p_next_status IN ('preparing','cancelled')) OR (current_order.status='preparing' AND p_next_status IN ('shipped','cancelled')) OR (current_order.status='shipped' AND p_next_status='delivered') OR (current_order.status='delivered' AND p_next_status='refunded')) THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN; END IF;
  IF current_order.source='manual' AND p_next_status='cancelled' THEN
    PERFORM variant.id
    FROM saas.manual_order_inventory_commitments AS inventory_commitment
    JOIN saas.product_variants AS variant ON variant.store_id=p_store_id AND variant.id=inventory_commitment.variant_id
    WHERE inventory_commitment.store_id=p_store_id AND inventory_commitment.order_id=p_order_id AND inventory_commitment.restoration_operation_id IS NULL
    ORDER BY variant.id FOR UPDATE OF inventory_commitment,variant;
    IF EXISTS(SELECT 1 FROM saas.manual_order_inventory_commitments AS inventory_commitment JOIN saas.product_variants AS variant ON variant.store_id=p_store_id AND variant.id=inventory_commitment.variant_id WHERE inventory_commitment.store_id=p_store_id AND inventory_commitment.order_id=p_order_id AND inventory_commitment.restoration_operation_id IS NULL AND variant.stock_quantity::numeric+inventory_commitment.quantity::numeric>2147483647) THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb; RETURN; END IF;
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','catalog_adjustment',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id',p_operation_id::text,true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
    FOR commitment IN SELECT inventory_commitment.variant_id,inventory_commitment.quantity FROM saas.manual_order_inventory_commitments AS inventory_commitment WHERE inventory_commitment.store_id=p_store_id AND inventory_commitment.order_id=p_order_id AND inventory_commitment.restoration_operation_id IS NULL ORDER BY inventory_commitment.variant_id LOOP
      UPDATE saas.product_variants AS variant SET stock_quantity=variant.stock_quantity+commitment.quantity,version=variant.version+1,updated_at=p_now WHERE variant.store_id=p_store_id AND variant.id=commitment.variant_id;
      UPDATE saas.manual_order_inventory_commitments AS inventory_commitment SET restoration_operation_id=p_operation_id,restored_at=p_now WHERE inventory_commitment.store_id=p_store_id AND inventory_commitment.order_id=p_order_id AND inventory_commitment.variant_id=commitment.variant_id AND inventory_commitment.restoration_operation_id IS NULL;
    END LOOP;
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  END IF;
  BEGIN
    UPDATE saas.orders SET status=p_next_status,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_order_id;
    INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at) VALUES (pg_catalog.md5('saas.order.event:'||p_operation_id::text)::uuid,p_store_id,p_order_id,p_membership_id,'status_transition',current_order.status,p_next_status,'Order status changed to '||p_next_status,pg_catalog.jsonb_build_object('from',current_order.status,'to',p_next_status),p_now);
    projection:=saas.orders_mutation_projection(p_store_id,p_order_id);
    INSERT INTO saas.order_operations(operation_id,store_id,order_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES (p_operation_id,p_store_id,p_order_id,'transition_status',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

ALTER TABLE saas.order_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_drafts FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.order_draft_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_draft_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.order_draft_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_draft_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.manual_order_inventory_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.manual_order_inventory_commitments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.order_drafts,saas.order_draft_lines,saas.order_draft_operations,saas.manual_order_inventory_commitments FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

ALTER FUNCTION saas.guard_order_draft_operation_mutation() OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_drafts_intent_valid(jsonb,boolean) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_drafts_replace_lines(uuid,uuid,jsonb,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_drafts_list_projection(uuid,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_drafts_detail_projection(uuid,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_drafts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer,timestamptz,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_drafts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_drafts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_drafts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) OWNER TO celebix_saas_owner;

REVOKE ALL ON FUNCTION saas.guard_order_draft_operation_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.order_drafts_intent_valid(jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.order_drafts_replace_lines(uuid,uuid,jsonb,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.order_drafts_list_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.order_drafts_detail_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.order_drafts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.order_drafts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.order_drafts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.order_drafts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.order_drafts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.order_drafts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.order_drafts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.order_drafts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) TO celebix_saas_app;

COMMIT;
