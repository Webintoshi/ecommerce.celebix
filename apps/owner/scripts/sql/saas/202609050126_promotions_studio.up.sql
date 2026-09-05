-- Promotions Studio v1 is additive. Checkout/order entry points deliberately remain untouched.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS saas.promotions (
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  legacy_record_id uuid NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('draft','scheduled','active','paused','archived')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  rule_document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id),
  UNIQUE (id),
  UNIQUE (store_id,legacy_record_id),
  FOREIGN KEY (store_id) REFERENCES saas.stores(id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_versions (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version > 0), rule_document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,promotion_id,version),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_targets (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('product','variant','category','brand','collection')),
  target_id uuid NOT NULL, inclusion text NOT NULL CHECK (inclusion IN ('include','exclude')),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,promotion_id,target_kind,target_id,inclusion),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_code_batches (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  requested_count integer NOT NULL CHECK (requested_count BETWEEN 1 AND 10000),
  operation_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,operation_id),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_codes (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL, batch_id uuid NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,code),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id),
  FOREIGN KEY (store_id,batch_id) REFERENCES saas.promotion_code_batches(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_operations (
  id uuid NOT NULL, store_id uuid NOT NULL, operation_id uuid NOT NULL,
  operation_kind text NOT NULL CHECK (operation_kind ~ '^[a-z_]{1,64}$'),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,operation_id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_usage_reservations (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL, code_id uuid NULL,
  customer_id uuid NULL, operation_id uuid NOT NULL, source_reference text NOT NULL CHECK (length(source_reference) BETWEEN 1 AND 200),
  reserved_uses integer NOT NULL DEFAULT 1 CHECK (reserved_uses > 0), reserved_budget_minor bigint NOT NULL DEFAULT 0 CHECK (reserved_budget_minor >= 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','committed','released','expired')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,operation_id),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id), FOREIGN KEY (store_id,code_id) REFERENCES saas.promotion_codes(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_redemptions (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL, reservation_id uuid NULL,
  order_id uuid NULL, customer_id uuid NULL, discount_minor bigint NOT NULL CHECK (discount_minor >= 0), currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  UNIQUE (store_id,reservation_id), FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id),
  FOREIGN KEY (store_id,reservation_id) REFERENCES saas.promotion_usage_reservations(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_audit_events (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NULL, actor_principal_id uuid NULL,
  event_kind text NOT NULL CHECK (event_kind ~ '^[a-z_]{1,64}$'), payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.order_promotion_snapshots (
  id uuid NOT NULL, store_id uuid NOT NULL, order_id uuid NOT NULL, promotion_id uuid NOT NULL,
  promotion_version bigint NOT NULL CHECK (promotion_version > 0), normalized_code text NULL, snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  UNIQUE (store_id,order_id,promotion_id,promotion_version), FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.order_discount_allocations (
  id uuid NOT NULL, store_id uuid NOT NULL, order_id uuid NOT NULL, snapshot_id uuid NOT NULL,
  line_id uuid NULL, line_position integer NOT NULL CHECK (line_position >= 0), discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  FOREIGN KEY (store_id,snapshot_id) REFERENCES saas.order_promotion_snapshots(store_id,id)
);

CREATE OR REPLACE FUNCTION saas.promotion_json_keys(p_value jsonb,p_required text[],p_allowed text[])
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $fn$
  SELECT pg_catalog.jsonb_typeof(p_value)='object' AND p_value ?& p_required
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_value) AS key WHERE key<>ALL(p_allowed))
$fn$;
CREATE OR REPLACE FUNCTION saas.promotion_json_integer(p_value jsonb,p_min bigint,p_max bigint)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $fn$
  SELECT pg_catalog.jsonb_typeof(p_value)='number' AND p_value::text ~ '^(0|[1-9][0-9]*)$'
    AND (p_value::text)::numeric BETWEEN p_min AND p_max
$fn$;
CREATE OR REPLACE FUNCTION saas.promotion_json_uuid(p_value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $fn$
  SELECT pg_catalog.jsonb_typeof(p_value)='string' AND p_value#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$fn$;
CREATE OR REPLACE FUNCTION saas.promotion_json_array_unique(p_value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $fn$
  SELECT pg_catalog.jsonb_typeof(p_value)='array' AND (SELECT count(*)=count(DISTINCT value::text) FROM pg_catalog.jsonb_array_elements(p_value))
$fn$;
CREATE OR REPLACE FUNCTION saas.promotion_rule_document_valid(p_document jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = pg_catalog, saas AS $fn$
DECLARE b jsonb:=p_document->'benefit'; t jsonb:=p_document->'targets'; a jsonb:=p_document->'audience'; tr jsonb:=p_document->'trigger'; s jsonb:=p_document->'schedule'; l jsonb:=p_document->'limits'; c jsonb:=p_document->'conditions'; cp jsonb:=p_document->'combinationPolicy'; m jsonb:=p_document->'marginPolicy'; x jsonb; y jsonb; starts timestamptz; ends timestamptz; last_quantity integer:=0;
BEGIN
  IF NOT saas.promotion_json_keys(p_document,ARRAY['schemaVersion','benefit','targets','audience','trigger','schedule','limits','conditions','combinationPolicy','priority','marginPolicy','progressMessagePolicy'],ARRAY['schemaVersion','benefit','targets','audience','trigger','schedule','limits','conditions','combinationPolicy','priority','marginPolicy','progressMessagePolicy']) OR NOT saas.promotion_json_integer(p_document->'schemaVersion',1,1) OR NOT saas.promotion_json_integer(p_document->'priority',0,1000) THEN RETURN false; END IF;
  IF NOT saas.promotion_json_keys(t,ARRAY['mode','include','exclude'],ARRAY['mode','include','exclude']) OR t->>'mode' NOT IN ('all','selected') OR pg_catalog.jsonb_typeof(t->'include')<>'array' OR pg_catalog.jsonb_typeof(t->'exclude')<>'array' OR NOT saas.promotion_json_array_unique(t->'include') OR NOT saas.promotion_json_array_unique(t->'exclude') OR pg_catalog.jsonb_array_length(t->'include')>500 OR pg_catalog.jsonb_array_length(t->'exclude')>500 OR (t->>'mode'='all' AND pg_catalog.jsonb_array_length(t->'include')<>0) OR (t->>'mode'='selected' AND pg_catalog.jsonb_array_length(t->'include')=0) THEN RETURN false; END IF;
  FOR x IN SELECT value FROM pg_catalog.jsonb_array_elements(t->'include') UNION ALL SELECT value FROM pg_catalog.jsonb_array_elements(t->'exclude') LOOP IF NOT saas.promotion_json_keys(x,ARRAY['kind','id'],ARRAY['kind','id']) OR x->>'kind' NOT IN ('product','variant','category','brand','collection') OR NOT saas.promotion_json_uuid(x->'id') THEN RETURN false; END IF; END LOOP;
  IF NOT saas.promotion_json_keys(a,ARRAY['mode'],ARRAY['mode','referenceIds']) OR a->>'mode' NOT IN ('everyone','first_paid_order','customer_segments','customer_tags','masked_customers','abandoned_cart') THEN RETURN false; END IF;
  IF a->>'mode' IN ('customer_segments','customer_tags','masked_customers') THEN IF pg_catalog.jsonb_typeof(a->'referenceIds')<>'array' OR NOT saas.promotion_json_array_unique(a->'referenceIds') OR pg_catalog.jsonb_array_length(a->'referenceIds') NOT BETWEEN 1 AND 500 THEN RETURN false; END IF; FOR x IN SELECT value FROM pg_catalog.jsonb_array_elements(a->'referenceIds') LOOP IF NOT saas.promotion_json_uuid(x) THEN RETURN false; END IF; END LOOP; ELSIF a ? 'referenceIds' THEN RETURN false; END IF;
  IF NOT saas.promotion_json_keys(tr,ARRAY['kind'],ARRAY['kind','codes']) OR tr->>'kind' NOT IN ('automatic','code') THEN RETURN false; END IF; IF tr->>'kind'='automatic' AND tr ? 'codes' THEN RETURN false; END IF; IF tr->>'kind'='code' THEN IF pg_catalog.jsonb_typeof(tr->'codes')<>'array' OR NOT saas.promotion_json_array_unique(tr->'codes') OR pg_catalog.jsonb_array_length(tr->'codes') NOT BETWEEN 1 AND 10000 THEN RETURN false; END IF; FOR x IN SELECT value FROM pg_catalog.jsonb_array_elements(tr->'codes') LOOP IF pg_catalog.jsonb_typeof(x)<>'string' OR saas.promotion_normalize_code(x#>>'{}') IS NULL OR saas.promotion_normalize_code(x#>>'{}')<>(x#>>'{}') THEN RETURN false; END IF; END LOOP; END IF;
  IF NOT saas.promotion_json_keys(s,ARRAY['timezone'],ARRAY['timezone','startsAt','endsAt']) OR pg_catalog.jsonb_typeof(s->'timezone')<>'string' OR length(s->>'timezone') NOT BETWEEN 1 AND 64 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=s->>'timezone') THEN RETURN false; END IF;
  IF s ? 'startsAt' THEN IF pg_catalog.jsonb_typeof(s->'startsAt')<>'string' OR s->>'startsAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' THEN RETURN false; END IF; BEGIN starts:=(s->>'startsAt')::timestamptz; EXCEPTION WHEN others THEN RETURN false; END; END IF; IF s ? 'endsAt' THEN IF NOT(s ? 'startsAt') OR pg_catalog.jsonb_typeof(s->'endsAt')<>'string' OR s->>'endsAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' THEN RETURN false; END IF; BEGIN ends:=(s->>'endsAt')::timestamptz; EXCEPTION WHEN others THEN RETURN false; END; IF ends<=starts THEN RETURN false; END IF; END IF;
  IF NOT saas.promotion_json_keys(l,ARRAY['totalUsage','perCustomerUsage','budgetMinor','orderMaximumMinor'],ARRAY['totalUsage','perCustomerUsage','budgetMinor','orderMaximumMinor']) THEN RETURN false; END IF; FOREACH x IN ARRAY ARRAY[l->'totalUsage',l->'perCustomerUsage'] LOOP IF x<>'null'::jsonb AND NOT saas.promotion_json_integer(x,0,1000000000) THEN RETURN false; END IF; END LOOP; FOREACH x IN ARRAY ARRAY[l->'budgetMinor',l->'orderMaximumMinor'] LOOP IF x<>'null'::jsonb AND NOT saas.promotion_json_integer(x,0,8000000000) THEN RETURN false; END IF; END LOOP;
  IF NOT saas.promotion_json_keys(c,ARRAY['minimumBasketMinor','minimumQuantity','minimumProductQuantity'],ARRAY['minimumBasketMinor','minimumQuantity','minimumProductQuantity','paymentMethodIds','shippingMethodIds','salesChannels']) OR NOT saas.promotion_json_integer(c->'minimumBasketMinor',0,8000000000) OR NOT saas.promotion_json_integer(c->'minimumQuantity',0,1000000) OR NOT saas.promotion_json_integer(c->'minimumProductQuantity',0,1000000) THEN RETURN false; END IF;
  FOREACH x IN ARRAY ARRAY[c->'paymentMethodIds',c->'shippingMethodIds'] LOOP IF x IS NOT NULL THEN IF pg_catalog.jsonb_typeof(x)<>'array' OR NOT saas.promotion_json_array_unique(x) OR pg_catalog.jsonb_array_length(x) NOT BETWEEN 1 AND 100 THEN RETURN false; END IF; FOR y IN SELECT value FROM pg_catalog.jsonb_array_elements(x) LOOP IF NOT saas.promotion_json_uuid(y) THEN RETURN false; END IF; END LOOP; END IF; END LOOP; IF c ? 'salesChannels' THEN IF pg_catalog.jsonb_typeof(c->'salesChannels')<>'array' OR NOT saas.promotion_json_array_unique(c->'salesChannels') OR pg_catalog.jsonb_array_length(c->'salesChannels') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF; FOR x IN SELECT value FROM pg_catalog.jsonb_array_elements(c->'salesChannels') LOOP IF pg_catalog.jsonb_typeof(x)<>'string' OR length(x#>>'{}') NOT BETWEEN 1 AND 64 OR pg_catalog.btrim(x#>>'{}')<>(x#>>'{}') OR x#>>'{}'~'[[:cntrl:]]' THEN RETURN false; END IF; END LOOP; END IF;
  IF NOT saas.promotion_json_keys(cp,ARRAY['kind'],ARRAY['kind','benefitClasses']) OR cp->>'kind' NOT IN ('none','shipping_only','benefit_classes') OR (cp->>'kind' IN ('none','shipping_only') AND cp ? 'benefitClasses') THEN RETURN false; END IF; IF cp->>'kind'='benefit_classes' THEN IF pg_catalog.jsonb_typeof(cp->'benefitClasses')<>'array' OR NOT saas.promotion_json_array_unique(cp->'benefitClasses') OR pg_catalog.jsonb_array_length(cp->'benefitClasses') NOT BETWEEN 1 AND 7 THEN RETURN false; END IF; FOR x IN SELECT value FROM pg_catalog.jsonb_array_elements(cp->'benefitClasses') LOOP IF x#>>'{}' NOT IN ('percentage','fixed_amount','free_shipping','buy_x_get_y','quantity_tiers','bundle_price','gift') THEN RETURN false; END IF; END LOOP; END IF;
  IF NOT saas.promotion_json_keys(m,ARRAY['kind'],ARRAY['kind','maximumPercentageBps']) OR m->>'kind' NOT IN ('warn','floor_at_cost','maximum_percentage') OR (m->>'kind' IN ('warn','floor_at_cost') AND m ? 'maximumPercentageBps') OR (m->>'kind'='maximum_percentage' AND NOT saas.promotion_json_integer(m->'maximumPercentageBps',0,10000)) OR NOT saas.promotion_json_keys(p_document->'progressMessagePolicy',ARRAY['enabled'],ARRAY['enabled']) OR pg_catalog.jsonb_typeof(p_document->'progressMessagePolicy'->'enabled')<>'boolean' THEN RETURN false; END IF;
  IF pg_catalog.jsonb_typeof(b)<>'object' THEN RETURN false; END IF;
  CASE b->>'kind' WHEN 'percentage' THEN RETURN saas.promotion_json_keys(b,ARRAY['kind','percentageBps'],ARRAY['kind','percentageBps']) AND saas.promotion_json_integer(b->'percentageBps',1,10000); WHEN 'fixed_amount' THEN RETURN saas.promotion_json_keys(b,ARRAY['kind','amountMinor','currency'],ARRAY['kind','amountMinor','currency']) AND saas.promotion_json_integer(b->'amountMinor',1,8000000000) AND b->>'currency' ~ '^[A-Z]{3}$'; WHEN 'free_shipping' THEN RETURN saas.promotion_json_keys(b,ARRAY['kind'],ARRAY['kind']); WHEN 'quantity_tiers' THEN IF NOT saas.promotion_json_keys(b,ARRAY['kind','tiers'],ARRAY['kind','tiers']) OR pg_catalog.jsonb_typeof(b->'tiers')<>'array' OR pg_catalog.jsonb_array_length(b->'tiers') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF; FOR x IN SELECT value FROM pg_catalog.jsonb_array_elements(b->'tiers') LOOP IF NOT saas.promotion_json_keys(x,ARRAY['minimumQuantity','percentageBps'],ARRAY['minimumQuantity','percentageBps']) OR NOT saas.promotion_json_integer(x->'minimumQuantity',1,1000000) OR NOT saas.promotion_json_integer(x->'percentageBps',1,10000) OR (x->>'minimumQuantity')::integer<=last_quantity THEN RETURN false; END IF; last_quantity:=(x->>'minimumQuantity')::integer; END LOOP; RETURN true; WHEN 'bundle_price' THEN RETURN saas.promotion_json_keys(b,ARRAY['kind','bundleQuantity','bundlePriceMinor','currency'],ARRAY['kind','bundleQuantity','bundlePriceMinor','currency']) AND saas.promotion_json_integer(b->'bundleQuantity',2,1000000) AND saas.promotion_json_integer(b->'bundlePriceMinor',0,8000000000) AND b->>'currency' ~ '^[A-Z]{3}$'; WHEN 'gift' THEN RETURN saas.promotion_json_keys(b,ARRAY['kind','giftVariantId'],ARRAY['kind','giftVariantId']) AND saas.promotion_json_uuid(b->'giftVariantId'); WHEN 'buy_x_get_y' THEN IF NOT saas.promotion_json_keys(b,ARRAY['kind','buyQuantity','receiveQuantity','discountPercentageBps','reward'],ARRAY['kind','buyQuantity','receiveQuantity','discountPercentageBps','reward']) OR NOT saas.promotion_json_integer(b->'buyQuantity',1,1000000) OR NOT saas.promotion_json_integer(b->'receiveQuantity',1,1000000) OR NOT saas.promotion_json_integer(b->'discountPercentageBps',1,10000) OR pg_catalog.jsonb_typeof(b->'reward')<>'object' THEN RETURN false; END IF; x:=b->'reward'; IF x->>'strategy'='same_product_cheapest' THEN RETURN saas.promotion_json_keys(x,ARRAY['strategy'],ARRAY['strategy']); ELSIF x->>'strategy'='specific_variant' THEN RETURN saas.promotion_json_keys(x,ARRAY['strategy','variantId'],ARRAY['strategy','variantId']) AND saas.promotion_json_uuid(x->'variantId'); ELSIF x->>'strategy'='selected_products_cheapest' THEN IF NOT saas.promotion_json_keys(x,ARRAY['strategy','productIds'],ARRAY['strategy','productIds']) OR pg_catalog.jsonb_typeof(x->'productIds')<>'array' OR NOT saas.promotion_json_array_unique(x->'productIds') OR pg_catalog.jsonb_array_length(x->'productIds') NOT BETWEEN 1 AND 100 THEN RETURN false; END IF; FOR y IN SELECT value FROM pg_catalog.jsonb_array_elements(x->'productIds') LOOP IF NOT saas.promotion_json_uuid(y) THEN RETURN false; END IF; END LOOP; RETURN true; ELSE RETURN false; END IF; ELSE RETURN false; END CASE;
END $fn$;

DO $fn$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.promotions'::regclass AND conname='promotions_rule_document_check') THEN
    ALTER TABLE saas.promotions ADD CONSTRAINT promotions_rule_document_check CHECK (saas.promotion_rule_document_valid(rule_document)) NOT VALID;
    ALTER TABLE saas.promotions VALIDATE CONSTRAINT promotions_rule_document_check;
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_normalize_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE WHEN p_code !~ '^[A-Za-z0-9_ıİşŞçÇğĞöÖüÜ-]{1,64}$' THEN NULL ELSE pg_catalog.upper(pg_catalog.translate(p_code,'İIıiÇçĞğÖöŞşÜü','IIiiCCGgOoSsUu')) END
$fn$;
CREATE OR REPLACE FUNCTION saas.promotion_operation_fingerprint(p_kind text,p_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_kind||':'||p_payload::text,'UTF8')),'hex')
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_audit_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN RAISE EXCEPTION 'promotion audit events are append-only'; END $fn$;
DROP TRIGGER IF EXISTS promotion_audit_events_immutable ON saas.promotion_audit_events;
CREATE TRIGGER promotion_audit_events_immutable BEFORE UPDATE OR DELETE ON saas.promotion_audit_events FOR EACH ROW EXECUTE FUNCTION saas.promotion_audit_append_only();

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_empty_result(p_currency text,p_reason text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT pg_catalog.jsonb_build_object('eligiblePromotionIds','[]'::jsonb,'appliedPromotions','[]'::jsonb,'rejectedPromotions','[]'::jsonb,'lineEffects','[]'::jsonb,'shippingEffects','[]'::jsonb,'gifts','[]'::jsonb,'subtotalBeforeDiscountMinor',0,'lineDiscountTotalMinor',0,'shippingBeforeDiscountMinor',0,'shippingDiscountTotalMinor',0,'discountTotalMinor',0,'grandTotalMinor',0,'currency',CASE WHEN p_currency ~ '^[A-Z]{3}$' THEN p_currency ELSE 'TRY' END,'progressMessages','[]'::jsonb,'merchantExplanation',p_reason)
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_context_valid(p_store_id uuid,p_context jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = pg_catalog, saas AS $fn$
DECLARE line jsonb; line_ids text[]:=ARRAY[]::text[]; positions integer[]:=ARRAY[]::integer[]; subtotal numeric:=0; currency text; local_time timestamptz;
BEGIN
  IF p_store_id IS NULL OR NOT saas.promotion_json_keys(p_context,ARRAY['storeId','customerId','paidOrderCount','customerSegmentIds','customerTagIds','cartLines','shippingMethodId','paymentMethodId','shippingBeforeDiscountMinor','currency','storeLocalTime','salesChannel','submittedCodes','abandonedCart'],ARRAY['storeId','customerId','paidOrderCount','customerSegmentIds','customerTagIds','cartLines','shippingMethodId','paymentMethodId','shippingBeforeDiscountMinor','currency','storeLocalTime','salesChannel','submittedCodes','abandonedCart']) OR NOT saas.promotion_json_uuid(p_context->'storeId') OR (p_context->>'storeId')::uuid<>p_store_id OR NOT saas.promotion_json_integer(p_context->'paidOrderCount',0,1000000000) THEN RETURN false; END IF;
  currency:=p_context->>'currency';
  IF currency !~ '^[A-Z]{3}$' OR pg_catalog.jsonb_typeof(p_context->'customerId') NOT IN ('null','string') OR (p_context->'customerId'<>'null'::jsonb AND NOT saas.promotion_json_uuid(p_context->'customerId')) OR pg_catalog.jsonb_typeof(p_context->'shippingMethodId') NOT IN ('null','string') OR (p_context->'shippingMethodId'<>'null'::jsonb AND NOT saas.promotion_json_uuid(p_context->'shippingMethodId')) OR pg_catalog.jsonb_typeof(p_context->'paymentMethodId') NOT IN ('null','string') OR (p_context->'paymentMethodId'<>'null'::jsonb AND NOT saas.promotion_json_uuid(p_context->'paymentMethodId')) OR NOT saas.promotion_json_integer(p_context->'shippingBeforeDiscountMinor',0,8000000000) OR p_context->>'storeLocalTime' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' OR p_context->>'salesChannel' !~ '^[^[:cntrl:] ]([^[:cntrl:]]{0,62}[^[:cntrl:] ])?$' THEN RETURN false; END IF;
  BEGIN local_time:=(p_context->>'storeLocalTime')::timestamptz; EXCEPTION WHEN others THEN RETURN false; END;
  IF pg_catalog.to_char(local_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_context->>'storeLocalTime' THEN RETURN false; END IF;
  IF pg_catalog.jsonb_typeof(p_context->'cartLines')<>'array' OR pg_catalog.jsonb_array_length(p_context->'cartLines')>20 OR pg_catalog.jsonb_typeof(p_context->'customerSegmentIds')<>'array' OR pg_catalog.jsonb_array_length(p_context->'customerSegmentIds')>100 OR pg_catalog.jsonb_typeof(p_context->'customerTagIds')<>'array' OR pg_catalog.jsonb_array_length(p_context->'customerTagIds')>100 OR pg_catalog.jsonb_typeof(p_context->'submittedCodes')<>'array' OR pg_catalog.jsonb_array_length(p_context->'submittedCodes')>5 OR NOT saas.promotion_json_array_unique(p_context->'customerSegmentIds') OR NOT saas.promotion_json_array_unique(p_context->'customerTagIds') OR NOT saas.promotion_json_array_unique(p_context->'submittedCodes') THEN RETURN false; END IF;
  FOR line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_context->'customerSegmentIds') UNION ALL SELECT value FROM pg_catalog.jsonb_array_elements(p_context->'customerTagIds') LOOP IF NOT saas.promotion_json_uuid(line) THEN RETURN false; END IF; END LOOP;
  FOR line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_context->'submittedCodes') LOOP IF pg_catalog.jsonb_typeof(line)<>'string' OR saas.promotion_normalize_code(line#>>'{}')<>(line#>>'{}') THEN RETURN false; END IF; END LOOP;
  IF pg_catalog.jsonb_typeof(p_context->'abandonedCart')='null' THEN NULL; ELSIF NOT saas.promotion_json_keys(p_context->'abandonedCart',ARRAY['id'],ARRAY['id']) OR NOT saas.promotion_json_uuid(p_context->'abandonedCart'->'id') THEN RETURN false; END IF;
  FOR line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_context->'cartLines') LOOP
    IF NOT saas.promotion_json_keys(line,ARRAY['lineId','position','productId','variantId','quantity','unitPriceMinor','unitCostMinor','currency','categoryIds','brandId','collectionIds'],ARRAY['lineId','position','productId','variantId','quantity','unitPriceMinor','unitCostMinor','currency','categoryIds','brandId','collectionIds']) OR NOT saas.promotion_json_uuid(line->'lineId') OR NOT saas.promotion_json_uuid(line->'productId') OR NOT saas.promotion_json_uuid(line->'variantId') OR NOT saas.promotion_json_integer(line->'position',0,19) OR NOT saas.promotion_json_integer(line->'quantity',1,1000000) OR NOT saas.promotion_json_integer(line->'unitPriceMinor',0,8000000000) OR (line->'unitCostMinor'<>'null'::jsonb AND NOT saas.promotion_json_integer(line->'unitCostMinor',0,8000000000)) OR line->>'currency'<>currency OR pg_catalog.jsonb_typeof(line->'categoryIds')<>'array' OR pg_catalog.jsonb_array_length(line->'categoryIds')>100 OR pg_catalog.jsonb_typeof(line->'collectionIds')<>'array' OR pg_catalog.jsonb_array_length(line->'collectionIds')>100 OR NOT saas.promotion_json_array_unique(line->'categoryIds') OR NOT saas.promotion_json_array_unique(line->'collectionIds') OR pg_catalog.jsonb_typeof(line->'brandId') NOT IN ('null','string') OR (line->'brandId'<>'null'::jsonb AND NOT saas.promotion_json_uuid(line->'brandId')) THEN RETURN false; END IF;
    IF line->>'lineId'=ANY(line_ids) OR (line->>'position')::integer=ANY(positions) THEN RETURN false; END IF; line_ids:=array_append(line_ids,line->>'lineId'); positions:=array_append(positions,(line->>'position')::integer); subtotal:=subtotal+(line->>'quantity')::numeric*(line->>'unitPriceMinor')::numeric;
    FOR line IN SELECT value FROM pg_catalog.jsonb_array_elements(line->'categoryIds') UNION ALL SELECT value FROM pg_catalog.jsonb_array_elements(line->'collectionIds') LOOP IF NOT saas.promotion_json_uuid(line) THEN RETURN false; END IF; END LOOP;
  END LOOP;
  RETURN subtotal<=8000000000;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_line_matches(p_targets jsonb,p_line jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  WITH refs AS (SELECT value ref FROM pg_catalog.jsonb_array_elements(COALESCE(p_targets->'include','[]'::jsonb))), blocked AS (SELECT value ref FROM pg_catalog.jsonb_array_elements(COALESCE(p_targets->'exclude','[]'::jsonb))), match_ref AS (SELECT ref, CASE ref->>'kind' WHEN 'product' THEN ref->>'id'=p_line->>'productId' WHEN 'variant' THEN ref->>'id'=p_line->>'variantId' WHEN 'category' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_line->'categoryIds') id WHERE id=ref->>'id') WHEN 'brand' THEN ref->>'id'=p_line->>'brandId' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_line->'brandIds','[]'::jsonb)) id WHERE id=ref->>'id') WHEN 'collection' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_line->'collectionIds') id WHERE id=ref->>'id') ELSE false END hit FROM refs), block_ref AS (SELECT CASE ref->>'kind' WHEN 'product' THEN ref->>'id'=p_line->>'productId' WHEN 'variant' THEN ref->>'id'=p_line->>'variantId' WHEN 'category' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_line->'categoryIds') id WHERE id=ref->>'id') WHEN 'brand' THEN ref->>'id'=p_line->>'brandId' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_line->'brandIds','[]'::jsonb)) id WHERE id=ref->>'id') WHEN 'collection' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_line->'collectionIds') id WHERE id=ref->>'id') ELSE false END hit FROM blocked) SELECT (p_targets->>'mode'='all' OR EXISTS(SELECT 1 FROM match_ref WHERE hit)) AND NOT EXISTS(SELECT 1 FROM block_ref WHERE hit)
$fn$;

SET LOCAL check_function_bodies = off;
-- One bounded candidate/fact relation is shared by every evaluation.  Keeping
-- this as an inlineable SQL function makes its plan observable in the PG16
-- harness and prevents a hidden per-product repository/query fan-out.
CREATE OR REPLACE FUNCTION saas.promotion_evaluator_candidate_facts(p_store_id uuid,p_context jsonb,p_now timestamptz)
RETURNS TABLE(id uuid,name text,version bigint,rule_document jsonb,created_at timestamptz,used bigint,budget bigint,customer_used bigint,eligible_value bigint,gift_variant_valid boolean)
LANGUAGE sql STABLE SET search_path = pg_catalog, saas AS $fn$
  WITH lines AS MATERIALIZED (SELECT value line FROM pg_catalog.jsonb_array_elements(p_context->'cartLines')),
  usage AS MATERIALIZED (
    SELECT r.promotion_id,count(*) FILTER (WHERE r.status='committed' OR (r.status='reserved' AND r.expires_at>p_now))::bigint used,
      COALESCE(sum(r.reserved_budget_minor) FILTER (WHERE r.status='committed' OR (r.status='reserved' AND r.expires_at>p_now)),0)::bigint budget
    FROM saas.promotion_usage_reservations r WHERE r.store_id=p_store_id GROUP BY r.promotion_id
  ), customer_usage AS MATERIALIZED (
    SELECT r.promotion_id,count(*) FILTER (WHERE r.status='committed' OR (r.status='reserved' AND r.expires_at>p_now))::bigint used
    FROM saas.promotion_usage_reservations r WHERE r.store_id=p_store_id AND r.customer_id IS NOT DISTINCT FROM CASE WHEN p_context->'customerId'='null'::jsonb THEN NULL ELSE (p_context->>'customerId')::uuid END GROUP BY r.promotion_id
  ), gift_variants AS MATERIALIZED (
    SELECT DISTINCT (p.rule_document->'benefit'->>'giftVariantId')::uuid variant_id
    FROM saas.promotions p
    WHERE p.store_id=p_store_id AND p.status='active' AND saas.promotion_rule_document_valid(p.rule_document) AND p.rule_document->'benefit'->>'kind'='gift'
  ), valid_gift_variants AS MATERIALIZED (
    SELECT gift.variant_id FROM gift_variants gift
    JOIN saas.product_variants variant ON variant.store_id=p_store_id AND variant.id=gift.variant_id AND variant.status='active'
    JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
  ), aggregated AS MATERIALIZED (
    SELECT p.id,p.name,p.version,p.rule_document,p.created_at,COALESCE(u.used,0)::bigint used,COALESCE(u.budget,0)::bigint budget,COALESCE(cu.used,0)::bigint customer_used,
      COALESCE(sum((l.line->>'unitPriceMinor')::bigint*(l.line->>'quantity')::bigint) FILTER (WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,p_context->>'currency',p.rule_document->'targets',l.line)),0)::bigint eligible_value,
      COALESCE(sum((l.line->>'quantity')::bigint) FILTER (WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,p_context->>'currency',p.rule_document->'targets',l.line)),0)::bigint eligible_quantity,
      COALESCE(sum(GREATEST(0,(l.line->>'unitPriceMinor')::bigint*(l.line->>'quantity')::bigint-COALESCE((l.line->>'unitCostMinor')::bigint,0)*(l.line->>'quantity')::bigint)) FILTER (WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,p_context->>'currency',p.rule_document->'targets',l.line)),0)::bigint eligible_margin,
      CASE WHEN p.rule_document->'benefit'->>'kind'<>'gift' THEN true ELSE EXISTS(SELECT 1 FROM valid_gift_variants gift WHERE gift.variant_id=(p.rule_document->'benefit'->>'giftVariantId')::uuid) END gift_variant_valid
    FROM saas.promotions p LEFT JOIN lines l ON true LEFT JOIN usage u ON u.promotion_id=p.id LEFT JOIN customer_usage cu ON cu.promotion_id=p.id
    WHERE p.store_id=p_store_id AND p.status='active' AND saas.promotion_rule_document_valid(p.rule_document)
      AND (p.rule_document->'schedule'->>'startsAt' IS NULL OR (p.rule_document->'schedule'->>'startsAt')::timestamptz<=p_now)
      AND (p.rule_document->'schedule'->>'endsAt' IS NULL OR p_now<(p.rule_document->'schedule'->>'endsAt')::timestamptz)
    GROUP BY p.id,p.name,p.version,p.rule_document,p.created_at,u.used,u.budget,cu.used
  ), ranked AS (
    SELECT a.*,LEAST(
      CASE a.rule_document->'benefit'->>'kind'
        WHEN 'percentage' THEN a.eligible_value*(a.rule_document->'benefit'->>'percentageBps')::bigint/10000
        WHEN 'fixed_amount' THEN CASE WHEN a.rule_document->'benefit'->>'currency'=p_context->>'currency' THEN LEAST(a.eligible_value,(a.rule_document->'benefit'->>'amountMinor')::bigint) ELSE 0 END
        WHEN 'free_shipping' THEN (p_context->>'shippingBeforeDiscountMinor')::bigint
        WHEN 'quantity_tiers' THEN a.eligible_value*COALESCE((SELECT max((tier->>'percentageBps')::bigint) FROM pg_catalog.jsonb_array_elements(a.rule_document->'benefit'->'tiers') tier WHERE (tier->>'minimumQuantity')::bigint<=a.eligible_quantity),0)/10000
        WHEN 'bundle_price' THEN CASE WHEN a.rule_document->'benefit'->>'currency'=p_context->>'currency' THEN GREATEST(0,COALESCE(bundle.complete_value,0)-(a.eligible_quantity/(a.rule_document->'benefit'->>'bundleQuantity')::bigint)*(a.rule_document->'benefit'->>'bundlePriceMinor')::bigint) ELSE 0 END
        WHEN 'buy_x_get_y' THEN COALESCE(xy.saving,0)
        ELSE 0 END,
      COALESCE((a.rule_document->'limits'->>'orderMaximumMinor')::bigint,8000000000),
      CASE WHEN a.rule_document->'limits'->>'budgetMinor' IS NULL THEN 8000000000 ELSE GREATEST(0,(a.rule_document->'limits'->>'budgetMinor')::bigint-a.budget) END,
      CASE a.rule_document->'marginPolicy'->>'kind' WHEN 'floor_at_cost' THEN a.eligible_margin WHEN 'maximum_percentage' THEN a.eligible_value*(a.rule_document->'marginPolicy'->>'maximumPercentageBps')::bigint/10000 ELSE 8000000000 END
    ) saving
    FROM aggregated a
    LEFT JOIN LATERAL (
      WITH bundle_lines AS MATERIALIZED (
        SELECT l.line,(l.line->>'quantity')::bigint quantity,(l.line->>'unitPriceMinor')::bigint price,
          sum((l.line->>'quantity')::bigint) OVER (ORDER BY (l.line->>'position')::integer,l.line->>'lineId')-(l.line->>'quantity')::bigint prior_quantity
        FROM lines l WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,p_context->>'currency',a.rule_document->'targets',l.line)
      ), complete_bundle AS (SELECT (a.eligible_quantity/(a.rule_document->'benefit'->>'bundleQuantity')::bigint)*(a.rule_document->'benefit'->>'bundleQuantity')::bigint quantity)
      SELECT COALESCE(sum(bundle_lines.price*LEAST(bundle_lines.quantity,GREATEST(0,complete_bundle.quantity-bundle_lines.prior_quantity))),0)::bigint complete_value FROM bundle_lines CROSS JOIN complete_bundle
    ) bundle ON a.rule_document->'benefit'->>'kind'='bundle_price'
    LEFT JOIN LATERAL (
      WITH reward_lines AS MATERIALIZED (
        SELECT l.line,(l.line->>'quantity')::bigint quantity,(l.line->>'unitPriceMinor')::bigint price,
          sum((l.line->>'quantity')::bigint) OVER (ORDER BY (l.line->>'unitPriceMinor')::bigint,(l.line->>'position')::integer,l.line->>'lineId')-(l.line->>'quantity')::bigint prior_quantity
        FROM lines l WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,p_context->>'currency',a.rule_document->'targets',l.line)
          AND (a.rule_document->'benefit'->'reward'->>'strategy'<>'specific_variant' OR l.line->>'variantId'=a.rule_document->'benefit'->'reward'->>'variantId')
          AND (a.rule_document->'benefit'->'reward'->>'strategy'<>'selected_products_cheapest' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(a.rule_document->'benefit'->'reward'->'productIds') product(id) WHERE product.id=l.line->>'productId'))
      ), groups AS (SELECT (a.eligible_quantity/((a.rule_document->'benefit'->>'buyQuantity')::bigint+(a.rule_document->'benefit'->>'receiveQuantity')::bigint))*(a.rule_document->'benefit'->>'receiveQuantity')::bigint reward_count)
      SELECT COALESCE(sum(price*LEAST(quantity,GREATEST(0,reward_count-prior_quantity))*(a.rule_document->'benefit'->>'discountPercentageBps')::bigint/10000),0)::bigint saving FROM reward_lines CROSS JOIN groups
    ) xy ON a.rule_document->'benefit'->>'kind'='buy_x_get_y'
  )
  SELECT id,name,version,rule_document,created_at,used,budget,customer_used,eligible_value,gift_variant_valid FROM ranked
  ORDER BY CASE rule_document->'benefit'->>'kind' WHEN 'percentage' THEN 1 WHEN 'fixed_amount' THEN 1 WHEN 'bundle_price' THEN 2 WHEN 'quantity_tiers' THEN 2 WHEN 'buy_x_get_y' THEN 2 WHEN 'free_shipping' THEN 3 ELSE 4 END,
    saving DESC,(rule_document->>'priority')::integer DESC,created_at,id
$fn$;

SET LOCAL check_function_bodies = on;
-- Catalog authority is resolved exactly once for the bounded cart.  All
-- downstream candidate and allocation work operates on these trusted facts.
CREATE OR REPLACE FUNCTION saas.promotion_evaluator_materialize_lines(p_store_id uuid,p_currency text,p_context jsonb)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  WITH input_lines AS MATERIALIZED (
    SELECT value line FROM pg_catalog.jsonb_array_elements(p_context->'cartLines')
  ), catalog_lines AS MATERIALIZED (
    SELECT input_lines.line,product.id product_id,variant.id variant_id
    FROM input_lines
    JOIN saas.products product ON product.store_id=p_store_id AND product.id=(input_lines.line->>'productId')::uuid AND product.status='active' AND product.currency=p_currency
    JOIN saas.product_variants variant ON variant.store_id=product.store_id AND variant.product_id=product.id AND variant.id=(input_lines.line->>'variantId')::uuid AND variant.status='active'
  ), catalog_products AS MATERIALIZED (
    SELECT DISTINCT product_id FROM catalog_lines
  ), category_facts AS MATERIALIZED (
    SELECT category.product_id,pg_catalog.jsonb_agg(category.category_id::text ORDER BY category.category_id) category_ids
    FROM saas.catalog_product_categories category
    JOIN catalog_products product ON product.product_id=category.product_id
    WHERE category.store_id=p_store_id
    GROUP BY category.product_id
  ), resource_facts AS MATERIALIZED (
    SELECT resource_product.product_id,
      COALESCE(pg_catalog.jsonb_agg(resource_product.resource_id::text ORDER BY resource_product.resource_id) FILTER (WHERE resource.resource_kind='collection'),'[]'::jsonb) collection_ids,
      COALESCE(pg_catalog.jsonb_agg(resource_product.resource_id::text ORDER BY resource_product.resource_id) FILTER (WHERE resource.resource_kind='brand'),'[]'::jsonb) brand_ids
    FROM saas.catalog_admin_resource_products resource_product
    JOIN catalog_products product ON product.product_id=resource_product.product_id
    JOIN saas.catalog_admin_resources resource ON resource.store_id=resource_product.store_id AND resource.id=resource_product.resource_id AND resource.status='active' AND resource.resource_kind IN ('collection','brand')
    WHERE resource_product.store_id=p_store_id
    GROUP BY resource_product.product_id
  ), enriched AS (
    SELECT catalog_lines.line,
      COALESCE(category_facts.category_ids,'[]'::jsonb) category_ids,
      COALESCE(resource_facts.collection_ids,'[]'::jsonb) collection_ids,
      COALESCE(resource_facts.brand_ids,'[]'::jsonb) brand_ids
    FROM catalog_lines
    LEFT JOIN category_facts ON category_facts.product_id=catalog_lines.product_id
    LEFT JOIN resource_facts ON resource_facts.product_id=catalog_lines.product_id
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_set(pg_catalog.jsonb_set(pg_catalog.jsonb_set(pg_catalog.jsonb_set(line,'{categoryIds}',category_ids),'{collectionIds}',collection_ids),'{brandIds}',brand_ids),'{brandId}',COALESCE(brand_ids->0,'null'::jsonb)) ORDER BY (line->>'position')::integer,line->>'lineId'),'[]'::jsonb) FROM enriched
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_audience_facts(p_store_id uuid,p_context jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  WITH customer AS (SELECT CASE WHEN p_context->'customerId'='null'::jsonb THEN NULL::uuid ELSE (p_context->>'customerId')::uuid END id)
  SELECT pg_catalog.jsonb_build_object(
    'firstPaidOrder',NOT EXISTS(SELECT 1 FROM saas.orders order_row,customer WHERE order_row.store_id=p_store_id AND order_row.customer_id=customer.id AND (order_row.paid_at IS NOT NULL OR order_row.payment_status IN ('completed','refunded'))),
    'segmentIds',COALESCE((SELECT pg_catalog.jsonb_agg(segment_id::text) FROM saas.customer_segment_memberships membership,customer WHERE membership.store_id=p_store_id AND membership.customer_id=customer.id),'[]'::jsonb),
    'tagIds',COALESCE((SELECT pg_catalog.jsonb_agg(tag_id::text) FROM saas.customer_tag_assignments membership,customer WHERE membership.store_id=p_store_id AND membership.customer_id=customer.id),'[]'::jsonb),
    'activeCustomer',EXISTS(SELECT 1 FROM saas.customers customer_row,customer WHERE customer_row.store_id=p_store_id AND customer_row.id=customer.id AND customer_row.status='active'),
    'abandonedCart',EXISTS(SELECT 1 FROM saas.abandoned_carts cart WHERE cart.store_id=p_store_id AND cart.id=(p_context->'abandonedCart'->>'id')::uuid AND cart.status='abandoned' AND cart.abandoned_at IS NOT NULL AND cart.abandoned_at>=p_now-pg_catalog.interval '30 days' AND cart.abandoned_at<=p_now))
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_code_facts(p_store_id uuid,p_context jsonb)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  WITH matches AS MATERIALIZED (
    SELECT DISTINCT ON (code.promotion_id) code.promotion_id,code.code
    FROM saas.promotion_codes code JOIN pg_catalog.jsonb_array_elements_text(p_context->'submittedCodes') submitted(code_value) ON submitted.code_value=code.code
    WHERE code.store_id=p_store_id AND code.status='active'
    ORDER BY code.promotion_id,code.code
  ) SELECT COALESCE(pg_catalog.jsonb_object_agg(promotion_id::text,code),'{}'::jsonb) FROM matches
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluate_v1(p_store_id uuid,p_context jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_currency text:=p_context->>'currency'; v_lines jsonb:=COALESCE(p_context->'cartLines','[]'::jsonb); v_fact_context jsonb; v_subtotal bigint:=0; v_shipping bigint:=0; v_line_discount bigint:=0; v_shipping_discount bigint:=0; v_paid jsonb:='{}'::jsonb; v_candidate record; v_rule jsonb; v_benefit jsonb; v_saving bigint; v_eligible_value bigint; v_eligible_quantity bigint; v_available bigint; v_cap bigint; v_bps integer; v_line jsonb; v_reward_line record; v_bundle_line record; v_line_id text; v_line_value bigint; v_allocation bigint; v_remaining bigint; v_count integer; v_index integer; v_normalized_code text; v_eligible jsonb:='[]'::jsonb; v_applied jsonb:='[]'::jsonb; v_applied_rules jsonb:='[]'::jsonb; v_rejected jsonb:='[]'::jsonb; v_effects jsonb:='[]'::jsonb; v_shipping_effects jsonb:='[]'::jsonb; v_gifts jsonb:='[]'::jsonb; v_used_non_shipping boolean:=false; v_kind text; v_reward_count bigint; v_line_quantity bigint; v_take bigint; v_bundle_quantity bigint; v_complete_quantity bigint;
BEGIN
  IF p_now IS NULL OR NOT saas.promotion_evaluator_context_valid(p_store_id,p_context) THEN RETURN saas.promotion_evaluator_empty_result(v_currency,'invalid context'); END IF;
  v_lines:=saas.promotion_evaluator_materialize_lines(p_store_id,v_currency,p_context);
  v_fact_context:=p_context||pg_catalog.jsonb_build_object('cartLines',v_lines,'audienceFacts',saas.promotion_evaluator_audience_facts(p_store_id,p_context,p_now),'codeFacts',saas.promotion_evaluator_code_facts(p_store_id,p_context));
  SELECT COALESCE(sum((line->>'unitPriceMinor')::bigint*(line->>'quantity')::bigint),0) INTO v_subtotal FROM pg_catalog.jsonb_array_elements(v_lines) line;
  v_shipping:=(p_context->>'shippingBeforeDiscountMinor')::bigint;
  FOR v_candidate IN SELECT * FROM saas.promotion_evaluator_candidate_facts(p_store_id,v_fact_context,p_now) LOOP
    v_rule:=v_candidate.rule_document; v_benefit:=v_rule->'benefit'; v_kind:=v_benefit->>'kind'; v_normalized_code:=NULL;
    IF v_rule->'trigger'->>'kind'='code' THEN v_normalized_code:=v_fact_context->'codeFacts'->>v_candidate.id::text; IF v_normalized_code IS NULL THEN CONTINUE; END IF; END IF;
    IF NOT saas.promotion_evaluator_audience_matches(p_store_id,v_rule->'audience',v_fact_context) THEN CONTINUE; END IF;
    SELECT COALESCE(sum((line->>'unitPriceMinor')::bigint*(line->>'quantity')::bigint),0),COALESCE(sum((line->>'quantity')::bigint),0) INTO v_eligible_value,v_eligible_quantity FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line);
    IF (v_rule->'targets'->>'mode'='selected' AND v_eligible_value=0) OR v_subtotal<(v_rule->'conditions'->>'minimumBasketMinor')::bigint OR (SELECT COALESCE(sum((line->>'quantity')::bigint),0) FROM pg_catalog.jsonb_array_elements(v_lines) line)<(v_rule->'conditions'->>'minimumQuantity')::bigint OR v_eligible_quantity<(v_rule->'conditions'->>'minimumProductQuantity')::bigint OR (v_rule->'conditions' ? 'paymentMethodIds' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_rule->'conditions'->'paymentMethodIds') id WHERE id=p_context->>'paymentMethodId')) OR (v_rule->'conditions' ? 'shippingMethodIds' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_rule->'conditions'->'shippingMethodIds') id WHERE id=p_context->>'shippingMethodId')) OR (v_rule->'conditions' ? 'salesChannels' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_rule->'conditions'->'salesChannels') channel WHERE channel=p_context->>'salesChannel')) OR ((v_rule->'limits'->>'totalUsage') IS NOT NULL AND v_candidate.used>=(v_rule->'limits'->>'totalUsage')::bigint) OR ((v_rule->'limits'->>'perCustomerUsage') IS NOT NULL AND v_candidate.customer_used>=(v_rule->'limits'->>'perCustomerUsage')::bigint) THEN CONTINUE; END IF;
    v_eligible:=v_eligible||pg_catalog.jsonb_build_array(v_candidate.id); v_saving:=0;
    IF v_kind='percentage' THEN v_saving:=v_eligible_value*(v_benefit->>'percentageBps')::integer/10000;
    ELSIF v_kind='fixed_amount' AND v_benefit->>'currency'=v_currency THEN v_saving:=LEAST(v_eligible_value,(v_benefit->>'amountMinor')::bigint);
    ELSIF v_kind='free_shipping' THEN v_saving:=GREATEST(0,v_shipping-v_shipping_discount);
    ELSIF v_kind='quantity_tiers' THEN SELECT COALESCE(max((tier->>'percentageBps')::integer),0) INTO v_bps FROM pg_catalog.jsonb_array_elements(v_benefit->'tiers') tier WHERE (tier->>'minimumQuantity')::integer<=v_eligible_quantity; v_saving:=v_eligible_value*v_bps/10000;
    ELSIF v_kind='bundle_price' AND v_benefit->>'currency'=v_currency THEN
      v_bundle_quantity:=(v_benefit->>'bundleQuantity')::bigint; v_complete_quantity:=(v_eligible_quantity/v_bundle_quantity)*v_bundle_quantity;
      WITH ordered AS MATERIALIZED (
        SELECT line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
          sum((line->>'quantity')::bigint) OVER (ORDER BY (line->>'position')::integer,line->>'lineId')-(line->>'quantity')::bigint prior_quantity
        FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
      ) SELECT COALESCE(sum(price*LEAST(quantity,GREATEST(0,v_complete_quantity-prior_quantity))),0) INTO v_cap FROM ordered;
      v_saving:=GREATEST(0,v_cap-(v_eligible_quantity/v_bundle_quantity)*(v_benefit->>'bundlePriceMinor')::bigint);
    ELSIF v_kind='buy_x_get_y' THEN
      WITH reward_lines AS MATERIALIZED (
        SELECT line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
          sum((line->>'quantity')::bigint) OVER (ORDER BY (line->>'unitPriceMinor')::bigint,(line->>'position')::integer,line->>'lineId') - (line->>'quantity')::bigint prior_quantity
        FROM pg_catalog.jsonb_array_elements(v_lines) line
        WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
          AND (v_benefit->'reward'->>'strategy'<>'specific_variant' OR line->>'variantId'=v_benefit->'reward'->>'variantId')
          AND (v_benefit->'reward'->>'strategy'<>'selected_products_cheapest' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_benefit->'reward'->'productIds') id WHERE id=line->>'productId'))
      ), groups AS (SELECT (v_eligible_quantity/((v_benefit->>'buyQuantity')::integer+(v_benefit->>'receiveQuantity')::integer))*(v_benefit->>'receiveQuantity')::bigint reward_count)
      SELECT COALESCE(sum(price*LEAST(quantity,GREATEST(0,reward_count-prior_quantity))*(v_benefit->>'discountPercentageBps')::bigint/10000),0),COALESCE(max(reward_count),0) INTO v_saving,v_reward_count FROM reward_lines CROSS JOIN groups;
    ELSIF v_kind='gift' AND v_candidate.gift_variant_valid THEN v_saving:=0; ELSE CONTINUE; END IF;
    IF v_kind<>'gift' THEN v_saving:=LEAST(v_saving,COALESCE((v_rule->'limits'->>'orderMaximumMinor')::bigint,v_saving)); IF (v_rule->'limits'->>'budgetMinor') IS NOT NULL THEN v_saving:=LEAST(v_saving,GREATEST(0,(v_rule->'limits'->>'budgetMinor')::bigint-v_candidate.budget)); END IF; IF v_rule->'marginPolicy'->>'kind'='floor_at_cost' THEN SELECT COALESCE(sum(GREATEST(0,(line->>'unitPriceMinor')::bigint*(line->>'quantity')::bigint-COALESCE((line->>'unitCostMinor')::bigint,0)*(line->>'quantity')::bigint)),0) INTO v_cap FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line); v_saving:=LEAST(v_saving,v_cap); ELSIF v_rule->'marginPolicy'->>'kind'='maximum_percentage' THEN v_saving:=LEAST(v_saving,v_eligible_value*(v_rule->'marginPolicy'->>'maximumPercentageBps')::integer/10000); END IF; END IF;
    IF v_kind='buy_x_get_y' THEN
      WITH reward_lines AS MATERIALIZED (
        SELECT line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
          sum((line->>'quantity')::bigint) OVER (ORDER BY (line->>'unitPriceMinor')::bigint,(line->>'position')::integer,line->>'lineId')-(line->>'quantity')::bigint prior_quantity
        FROM pg_catalog.jsonb_array_elements(v_lines) line
        WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
          AND (v_benefit->'reward'->>'strategy'<>'specific_variant' OR line->>'variantId'=v_benefit->'reward'->>'variantId')
          AND (v_benefit->'reward'->>'strategy'<>'selected_products_cheapest' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_benefit->'reward'->'productIds') id WHERE id=line->>'productId'))
      ), groups AS (SELECT (v_eligible_quantity/((v_benefit->>'buyQuantity')::integer+(v_benefit->>'receiveQuantity')::integer))*(v_benefit->>'receiveQuantity')::bigint reward_count)
      SELECT COALESCE(sum(LEAST(price*LEAST(quantity,GREATEST(0,reward_count-prior_quantity))*(v_benefit->>'discountPercentageBps')::bigint/10000,GREATEST(0,price*quantity-COALESCE((v_paid->>(line->>'lineId'))::bigint,0)))),0)
      INTO v_available FROM reward_lines CROSS JOIN groups;
      v_saving:=LEAST(v_saving,v_available);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_applied_rules) prior WHERE NOT saas.promotion_combination_compatible(prior,v_rule)) THEN v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','not_combinable')); CONTINUE; END IF;
    IF v_saving=0 AND v_kind<>'gift' THEN v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','not_eligible')); CONTINUE; END IF;
    IF v_kind='free_shipping' THEN v_shipping_discount:=v_shipping_discount+v_saving; v_shipping_effects:=v_shipping_effects||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'discountMinor',v_saving));
    ELSIF v_kind='gift' THEN v_gifts:=v_gifts||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'variantId',v_benefit->>'giftVariantId','quantity',1,'paidMinor',0));
    ELSIF v_kind='buy_x_get_y' THEN
      v_remaining:=v_saving;
      FOR v_reward_line IN
        WITH reward_lines AS MATERIALIZED (
          SELECT line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
            sum((line->>'quantity')::bigint) OVER (ORDER BY (line->>'unitPriceMinor')::bigint,(line->>'position')::integer,line->>'lineId') - (line->>'quantity')::bigint prior_quantity
          FROM pg_catalog.jsonb_array_elements(v_lines) line
          WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
            AND (v_benefit->'reward'->>'strategy'<>'specific_variant' OR line->>'variantId'=v_benefit->'reward'->>'variantId')
            AND (v_benefit->'reward'->>'strategy'<>'selected_products_cheapest' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_benefit->'reward'->'productIds') id WHERE id=line->>'productId'))
        ), groups AS (SELECT (v_eligible_quantity/((v_benefit->>'buyQuantity')::integer+(v_benefit->>'receiveQuantity')::integer))*(v_benefit->>'receiveQuantity')::bigint reward_count)
        SELECT line,LEAST(quantity,GREATEST(0,reward_count-prior_quantity)) take_quantity FROM reward_lines CROSS JOIN groups WHERE reward_count>prior_quantity ORDER BY price,(line->>'position')::integer,line->>'lineId'
      LOOP
        v_line_id:=v_reward_line.line->>'lineId'; v_take:=v_reward_line.take_quantity; v_line_value:=LEAST((v_reward_line.line->>'unitPriceMinor')::bigint*v_take*(v_benefit->>'discountPercentageBps')::bigint/10000,GREATEST(0,(v_reward_line.line->>'unitPriceMinor')::bigint*(v_reward_line.line->>'quantity')::bigint-COALESCE((v_paid->>v_line_id)::bigint,0)));
        v_allocation:=LEAST(v_remaining,v_line_value); v_remaining:=v_remaining-v_allocation;
        IF v_allocation>0 THEN v_effects:=v_effects||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'lineId',v_line_id,'discountMinor',v_allocation,'giftQuantity',0)); v_paid:=pg_catalog.jsonb_set(v_paid,ARRAY[v_line_id],pg_catalog.to_jsonb(COALESCE((v_paid->>v_line_id)::bigint,0)+v_allocation),true); END IF;
      END LOOP;
      v_line_discount:=v_line_discount+v_saving; v_used_non_shipping:=true;
    ELSIF v_kind='bundle_price' THEN
      v_bundle_quantity:=(v_benefit->>'bundleQuantity')::bigint; v_complete_quantity:=(v_eligible_quantity/v_bundle_quantity)*v_bundle_quantity;
      WITH ordered AS MATERIALIZED (
        SELECT line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
          sum((line->>'quantity')::bigint) OVER (ORDER BY (line->>'position')::integer,line->>'lineId')-(line->>'quantity')::bigint prior_quantity
        FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
      ), complete_lines AS (
        SELECT line,price,quantity,LEAST(quantity,GREATEST(0,v_complete_quantity-prior_quantity)) take_quantity FROM ordered WHERE prior_quantity<v_complete_quantity
      )
      SELECT COALESCE(sum(LEAST(price*take_quantity,GREATEST(0,price*quantity-COALESCE((v_paid->>(line->>'lineId'))::bigint,0)))),0),count(*)
      INTO v_available,v_count FROM complete_lines;
      v_saving:=LEAST(v_saving,v_available); v_remaining:=v_saving; v_index:=0;
      FOR v_bundle_line IN
        WITH ordered AS MATERIALIZED (
          SELECT line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
            sum((line->>'quantity')::bigint) OVER (ORDER BY (line->>'position')::integer,line->>'lineId')-(line->>'quantity')::bigint prior_quantity
          FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
        ) SELECT line,LEAST(quantity,GREATEST(0,v_complete_quantity-prior_quantity)) take_quantity FROM ordered WHERE prior_quantity<v_complete_quantity ORDER BY (line->>'position')::integer,line->>'lineId'
      LOOP
        v_index:=v_index+1; v_line_id:=v_bundle_line.line->>'lineId'; v_line_value:=LEAST((v_bundle_line.line->>'unitPriceMinor')::bigint*v_bundle_line.take_quantity,GREATEST(0,(v_bundle_line.line->>'unitPriceMinor')::bigint*(v_bundle_line.line->>'quantity')::bigint-COALESCE((v_paid->>v_line_id)::bigint,0))); v_allocation:=CASE WHEN v_index=v_count THEN v_remaining ELSE LEAST(v_line_value,pg_catalog.floor(v_saving::numeric*v_line_value::numeric/v_available::numeric)::bigint) END; v_remaining:=v_remaining-v_allocation; IF v_allocation>0 THEN v_effects:=v_effects||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'lineId',v_line_id,'discountMinor',v_allocation,'giftQuantity',0)); v_paid:=pg_catalog.jsonb_set(v_paid,ARRAY[v_line_id],pg_catalog.to_jsonb(COALESCE((v_paid->>v_line_id)::bigint,0)+v_allocation),true); END IF;
      END LOOP;
      v_line_discount:=v_line_discount+v_saving; v_used_non_shipping:=true;
    ELSE
      SELECT COALESCE(sum((line->>'unitPriceMinor')::bigint*(line->>'quantity')::bigint-COALESCE((v_paid->>(line->>'lineId'))::bigint,0)),0),count(*) INTO v_available,v_count FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line); v_saving:=LEAST(v_saving,v_available); v_remaining:=v_saving; v_index:=0;
      FOR v_line IN SELECT line FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line) ORDER BY (line->>'position')::integer,line->>'lineId' LOOP v_index:=v_index+1; v_line_id:=v_line->>'lineId'; v_line_value:=(v_line->>'unitPriceMinor')::bigint*(v_line->>'quantity')::bigint-COALESCE((v_paid->>v_line_id)::bigint,0); v_allocation:=CASE WHEN v_index=v_count THEN v_remaining ELSE LEAST(v_line_value,pg_catalog.floor(v_saving::numeric*v_line_value::numeric/v_available::numeric)::bigint) END; v_remaining:=v_remaining-v_allocation; IF v_allocation>0 THEN v_effects:=v_effects||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'lineId',v_line_id,'discountMinor',v_allocation,'giftQuantity',0)); v_paid:=pg_catalog.jsonb_set(v_paid,ARRAY[v_line_id],pg_catalog.to_jsonb(COALESCE((v_paid->>v_line_id)::bigint,0)+v_allocation),true); END IF; END LOOP; v_line_discount:=v_line_discount+v_saving; v_used_non_shipping:=true;
    END IF;
    v_applied:=v_applied||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'version',v_candidate.version,'name',v_candidate.name,'benefitKind',v_kind,'lineDiscountMinor',CASE WHEN v_kind IN ('free_shipping','gift') THEN 0 ELSE v_saving END,'shippingDiscountMinor',CASE WHEN v_kind='free_shipping' THEN v_saving ELSE 0 END,'discountTotalMinor',CASE WHEN v_kind='gift' THEN 0 ELSE v_saving END)||CASE WHEN v_normalized_code IS NULL THEN '{}'::jsonb ELSE pg_catalog.jsonb_build_object('normalizedCode',v_normalized_code) END);
    v_applied_rules:=v_applied_rules||pg_catalog.jsonb_build_array(v_rule);
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('eligiblePromotionIds',v_eligible,'appliedPromotions',v_applied,'rejectedPromotions',v_rejected,'lineEffects',v_effects,'shippingEffects',v_shipping_effects,'gifts',v_gifts,'subtotalBeforeDiscountMinor',v_subtotal,'lineDiscountTotalMinor',v_line_discount,'shippingBeforeDiscountMinor',v_shipping,'shippingDiscountTotalMinor',v_shipping_discount,'discountTotalMinor',v_line_discount+v_shipping_discount,'grandTotalMinor',v_subtotal-v_line_discount+v_shipping-v_shipping_discount,'currency',v_currency,'progressMessages','[]'::jsonb,'merchantExplanation','evaluated');
END $fn$;

-- The cart payload is transport only.  Product taxonomy and customer audience
-- membership are always re-derived from store-bound relations below.
CREATE OR REPLACE FUNCTION saas.promotion_evaluator_catalog_line_matches(p_store_id uuid,p_currency text,p_targets jsonb,p_line jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT saas.promotion_evaluator_line_matches(p_targets,p_line)
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_audience_matches(p_store_id uuid,p_audience jsonb,p_context jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE p_audience->>'mode'
    WHEN 'everyone' THEN true
    WHEN 'first_paid_order' THEN (p_context->'customerId'<>'null'::jsonb) AND COALESCE((p_context->'audienceFacts'->>'firstPaidOrder')::boolean,false)
    WHEN 'customer_segments' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_audience->'referenceIds') ref(id) JOIN pg_catalog.jsonb_array_elements_text(p_context->'audienceFacts'->'segmentIds') fact(id) ON fact.id=ref.id)
    WHEN 'customer_tags' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_audience->'referenceIds') ref(id) JOIN pg_catalog.jsonb_array_elements_text(p_context->'audienceFacts'->'tagIds') fact(id) ON fact.id=ref.id)
    WHEN 'masked_customers' THEN COALESCE((p_context->'audienceFacts'->>'activeCustomer')::boolean,false) AND EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_audience->'referenceIds') ref(id) WHERE ref.id=p_context->>'customerId')
    WHEN 'abandoned_cart' THEN COALESCE((p_context->'audienceFacts'->>'abandonedCart')::boolean,false)
    ELSE false END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_gift_variant_valid(p_store_id uuid,p_variant_id uuid)
RETURNS boolean LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT EXISTS(SELECT 1 FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id WHERE v.store_id=p_store_id AND v.id=p_variant_id AND v.status='active' AND p.status='active')
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_combination_compatible(p_left jsonb,p_right jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  WITH kinds AS (SELECT p_left->'benefit'->>'kind' left_kind,p_right->'benefit'->>'kind' right_kind), policies AS (
    SELECT p_left->'combinationPolicy' left_policy,p_right->'combinationPolicy' right_policy FROM kinds
  )
  SELECT CASE
    WHEN left_policy->>'kind'='none' OR right_policy->>'kind'='none' THEN false
    WHEN left_policy->>'kind'='shipping_only' AND right_policy->>'kind'='shipping_only' THEN left_kind='free_shipping' OR right_kind='free_shipping'
    WHEN left_policy->>'kind'='shipping_only' THEN right_kind='free_shipping'
    WHEN right_policy->>'kind'='shipping_only' THEN left_kind='free_shipping'
    ELSE EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(left_policy->'benefitClasses') item WHERE item=right_kind)
      AND EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(right_policy->'benefitClasses') item WHERE item=left_kind)
  END FROM policies,kinds
$fn$;

-- The cart identifier is opaque transport data.  Its audience eligibility is
-- derived only from the durable, store-bound abandoned-cart episode and is
-- deliberately bounded so an old recovery link cannot revive a campaign.
CREATE OR REPLACE FUNCTION saas.promotion_evaluator_abandoned_cart_valid(p_store_id uuid,p_context jsonb,p_now timestamptz)
RETURNS boolean LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT p_now IS NOT NULL AND EXISTS(
    SELECT 1 FROM saas.abandoned_carts c
    WHERE c.store_id=p_store_id AND c.id=(p_context->'abandonedCart'->>'id')::uuid
      AND c.status='abandoned' AND c.abandoned_at IS NOT NULL
      AND c.abandoned_at<=p_now AND c.abandoned_at>p_now-interval '30 days'
  )
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  IF p_action NOT IN ('promotions.read','promotions.manage','promotions.archive') THEN RETURN 'durable_authority_invalid'; END IF;
  v_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions',p_action);
  RETURN v_error;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_projection(p_store_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT pg_catalog.jsonb_build_object('id',p.id,'version',p.version,'name',p.name,'status',p.status,'ruleDocument',p.rule_document,'createdAt',pg_catalog.to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedAt',pg_catalog.to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) FROM saas.promotions p WHERE p.store_id=p_store_id AND p.id=p_id
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_record_operation(p_store_id uuid,p_operation_id uuid,p_kind text,p_fingerprint text,p_result jsonb,p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN
  INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_payload,created_at)
  VALUES (p_operation_id,p_store_id,p_operation_id,p_kind,p_fingerprint,p_result,p_now);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_create_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_promotion_id uuid,p_name text,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_operation saas.promotion_operations%ROWTYPE; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||':'||p_operation_id::text,0));
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN IF v_operation.operation_kind<>'create' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF; RETURN; END IF;
  IF p_promotion_id IS NULL OR p_operation_id IS NULL OR p_fingerprint<>saas.promotion_operation_fingerprint('create',pg_catalog.jsonb_build_object('id',p_promotion_id,'name',p_name,'ruleDocument',p_rule_document)) OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR p_name~'[[:cntrl:]]' OR NOT saas.promotion_rule_document_valid(p_rule_document) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES(p_promotion_id,p_store_id,p_name,'draft',1,p_rule_document,p_now,p_now);
  INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(p_promotion_id,p_store_id,p_promotion_id,1,p_rule_document,p_now);
  v_result:=saas.promotion_projection(p_store_id,p_promotion_id); PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'create',p_fingerprint,v_result,p_now); INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at) VALUES(p_operation_id,p_store_id,p_promotion_id,p_principal_id,'created','{}'::jsonb,p_now); RETURN QUERY SELECT 'created',v_result;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'conflict',NULL::jsonb;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_update_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_promotion_id uuid,p_expected_version bigint,p_name text,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_current saas.promotions%ROWTYPE; v_operation saas.promotion_operations%ROWTYPE; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||':'||p_promotion_id::text,0)); SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE; IF FOUND THEN IF v_operation.operation_kind<>'update' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint<>saas.promotion_operation_fingerprint('update',pg_catalog.jsonb_build_object('id',p_promotion_id,'expectedVersion',p_expected_version,'name',p_name,'ruleDocument',p_rule_document)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF; IF v_current.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF; IF v_current.status='archived' OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR NOT saas.promotion_rule_document_valid(p_rule_document) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  UPDATE saas.promotions SET name=p_name,rule_document=p_rule_document,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_promotion_id; INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(p_operation_id,p_store_id,p_promotion_id,v_current.version+1,p_rule_document,p_now); v_result:=saas.promotion_projection(p_store_id,p_promotion_id); PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'update',p_fingerprint,v_result,p_now); RETURN QUERY SELECT 'updated',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_lifecycle_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_promotion_id uuid,p_expected_version bigint,p_next_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_action text; v_error text; v_current saas.promotions%ROWTYPE; v_operation saas.promotion_operations%ROWTYPE; v_result jsonb;
BEGIN
  v_action:=CASE WHEN p_next_status='archived' THEN 'promotions.archive' ELSE 'promotions.manage' END; v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,v_action); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF; IF p_next_status NOT IN ('scheduled','active','paused','archived') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||':'||p_promotion_id::text,0)); SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE; IF FOUND THEN IF v_operation.operation_kind<>'lifecycle' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF; RETURN; END IF; IF p_operation_id IS NULL OR p_fingerprint<>saas.promotion_operation_fingerprint('lifecycle',pg_catalog.jsonb_build_object('id',p_promotion_id,'expectedVersion',p_expected_version,'nextStatus',p_next_status)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF; IF v_current.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF; IF v_current.status='archived' OR (p_next_status='active' AND NOT saas.promotion_rule_document_valid(v_current.rule_document)) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  UPDATE saas.promotions SET status=p_next_status,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_promotion_id; v_result:=saas.promotion_projection(p_store_id,p_promotion_id); PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'lifecycle',p_fingerprint,v_result,p_now); RETURN QUERY SELECT 'updated',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_list_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_search text,p_statuses text[],p_limit integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF; IF p_limit NOT BETWEEN 1 AND 100 OR COALESCE(pg_catalog.array_length(p_statuses,1),0)>5 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.promotion_projection(p_store_id,x.id) ORDER BY x.updated_at DESC,x.id DESC) FROM (SELECT id,updated_at FROM saas.promotions WHERE store_id=p_store_id AND (p_search IS NULL OR name ILIKE '%'||p_search||'%') AND (COALESCE(pg_catalog.array_length(p_statuses,1),0)=0 OR status=ANY(p_statuses)) ORDER BY updated_at DESC,id DESC LIMIT p_limit) x),'[]'::jsonb)); END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_simulate_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_context jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; BEGIN v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF; RETURN QUERY SELECT 'simulated',pg_catalog.jsonb_build_object('evaluation',saas.promotion_evaluate_v1(p_store_id,p_context,p_now),'mutated',false); END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_detail_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  v_result:=saas.promotion_projection(p_store_id,p_promotion_id);
  IF v_result IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; ELSE RETURN QUERY SELECT 'found',v_result; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_conflicts_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF NOT saas.promotion_rule_document_valid(p_rule_document) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'checked',pg_catalog.jsonb_build_object('blocking',false,'conflicts','[]'::jsonb,'margin','warn');
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_create_code_batch_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_batch_id uuid,p_promotion_id uuid,p_count integer,p_prefix text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_operation saas.promotion_operations%ROWTYPE; v_code text; v_index integer; v_attempt integer; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_batch_id IS NULL OR p_count NOT BETWEEN 1 AND 10000 OR p_prefix !~ '^[A-Z0-9_-]{0,20}$' OR p_fingerprint<>saas.promotion_operation_fingerprint('code_batch',pg_catalog.jsonb_build_object('id',p_batch_id,'promotionId',p_promotion_id,'count',p_count,'prefix',p_prefix)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||':'||p_promotion_id::text,0)); SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN IF v_operation.operation_kind<>'code_batch' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id AND status<>'archived') THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.promotion_code_batches(id,store_id,promotion_id,status,requested_count,operation_id,created_at) VALUES(p_batch_id,p_store_id,p_promotion_id,'active',p_count,p_operation_id,p_now);
  FOR v_index IN 1..p_count LOOP
    v_attempt:=0;
    LOOP
      v_attempt:=v_attempt+1; IF v_attempt>20 THEN RAISE EXCEPTION 'promotion code entropy collision limit'; END IF;
      v_code:=saas.promotion_normalize_code(p_prefix||pg_catalog.substr(pg_catalog.encode(pg_catalog.gen_random_bytes(16),'hex'),1,20));
      BEGIN INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_promotion_id,p_batch_id,v_code,'active',p_now); EXIT; EXCEPTION WHEN unique_violation THEN END;
    END LOOP;
  END LOOP;
  v_result:=pg_catalog.jsonb_build_object('id',p_batch_id,'promotionId',p_promotion_id,'status','active','count',p_count,'createdAt',pg_catalog.to_char(p_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'code_batch',p_fingerprint,v_result,p_now); RETURN QUERY SELECT 'created',v_result;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'code_conflict',NULL::jsonb;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_codes_csv_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_batch_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.promotion_code_batches WHERE store_id=p_store_id AND id=p_batch_id) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('rows',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code',c.code,'status',c.status) ORDER BY c.code) FROM saas.promotion_codes c WHERE c.store_id=p_store_id AND c.batch_id=p_batch_id),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_analytics_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('currency',currency,'redemptions',redemptions,'discountMinor',discount_minor,'revenueMinor',0,'conversionBps',0) ORDER BY currency) FROM (SELECT currency,count(*)::bigint redemptions,COALESCE(sum(discount_minor),0)::bigint discount_minor FROM saas.promotion_redemptions WHERE store_id=p_store_id AND promotion_id=p_promotion_id GROUP BY currency) x),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_code_batch_status_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_batch_id uuid,p_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_status NOT IN ('active','paused','revoked') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  UPDATE saas.promotion_code_batches SET status=p_status WHERE store_id=p_store_id AND id=p_batch_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  UPDATE saas.promotion_codes SET status=p_status WHERE store_id=p_store_id AND batch_id=p_batch_id AND status<>'revoked';
  RETURN QUERY SELECT 'updated',pg_catalog.jsonb_build_object('id',p_batch_id,'status',p_status);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_legacy_list_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('legacyRecordId',r.id,'promotionId',p.id,'reason',CASE WHEN p.id IS NOT NULL THEN 'adopted' WHEN r.config ? 'code' AND saas.promotion_normalize_code(r.config->>'code') IS NOT NULL AND (EXISTS (SELECT 1 FROM saas.promotion_codes c WHERE c.store_id=r.store_id AND c.code=saas.promotion_normalize_code(r.config->>'code')) OR EXISTS (SELECT 1 FROM saas.merchant_admin_records other_record WHERE other_record.store_id=r.store_id AND other_record.record_kind='discount' AND other_record.id<>r.id AND saas.promotion_normalize_code(other_record.config->>'code')=saas.promotion_normalize_code(r.config->>'code'))) THEN 'code_conflict' ELSE 'legacy_discount_requires_review' END) ORDER BY r.created_at,r.id) FROM saas.merchant_admin_records r LEFT JOIN saas.promotions p ON p.store_id=r.store_id AND p.legacy_record_id=r.id WHERE r.store_id=p_store_id AND r.record_kind='discount'),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_margin_check_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT * FROM saas.promotion_conflicts_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_rule_document)
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_reserve_v1(p_store_id uuid,p_promotion_id uuid,p_code_id uuid,p_customer_id uuid,p_operation_id uuid,p_source_reference text,p_budget_minor bigint,p_now timestamptz,p_expires_at timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_existing saas.promotion_usage_reservations%ROWTYPE; v_used bigint;
BEGIN
  IF p_store_id IS NULL OR p_promotion_id IS NULL OR p_operation_id IS NULL OR p_source_reference IS NULL OR p_expires_at<=p_now OR p_budget_minor<0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_store_id::text||':'||p_promotion_id::text,0)); SELECT * INTO v_existing FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE; IF FOUND THEN RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object('reservationId',v_existing.id,'status',v_existing.status); RETURN; END IF;
  SELECT count(*) INTO v_used FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND promotion_id=p_promotion_id AND (status='committed' OR (status='reserved' AND expires_at>p_now)); IF NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id AND status='active') THEN RETURN QUERY SELECT 'not_eligible',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,code_id,customer_id,operation_id,source_reference,reserved_budget_minor,status,expires_at,created_at,updated_at) VALUES(p_operation_id,p_store_id,p_promotion_id,p_code_id,p_customer_id,p_operation_id,p_source_reference,p_budget_minor,'reserved',p_expires_at,p_now,p_now); RETURN QUERY SELECT 'reserved',pg_catalog.jsonb_build_object('reservationId',p_operation_id,'contendedUses',v_used+1);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_release_expired_v1(p_store_id uuid,p_now timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_count integer; BEGIN UPDATE saas.promotion_usage_reservations SET status='expired',updated_at=p_now WHERE store_id=p_store_id AND status='reserved' AND expires_at<=p_now; GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count; END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_release_reservation_v1(p_store_id uuid,p_reservation_id uuid,p_operation_id uuid,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_reservation saas.promotion_usage_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_reservation FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_reservation.operation_id<>p_operation_id THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  IF v_reservation.status='committed' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF v_reservation.status='reserved' THEN UPDATE saas.promotion_usage_reservations SET status='released',updated_at=p_now WHERE store_id=p_store_id AND id=p_reservation_id; END IF;
  RETURN QUERY SELECT 'released',pg_catalog.jsonb_build_object('reservationId',p_reservation_id);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_commit_reservation_v1(p_store_id uuid,p_reservation_id uuid,p_operation_id uuid,p_redemption_id uuid,p_order_id uuid,p_discount_minor bigint,p_currency text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_reservation saas.promotion_usage_reservations%ROWTYPE;
BEGIN
  IF p_discount_minor<0 OR p_currency !~ '^[A-Z]{3}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_reservation FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_reservation.operation_id<>p_operation_id THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  IF v_reservation.status='committed' THEN RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object('reservationId',p_reservation_id); RETURN; END IF;
  IF v_reservation.status<>'reserved' OR v_reservation.expires_at<=p_now THEN RETURN QUERY SELECT 'not_eligible',NULL::jsonb; RETURN; END IF;
  UPDATE saas.promotion_usage_reservations SET status='committed',updated_at=p_now WHERE store_id=p_store_id AND id=p_reservation_id;
  INSERT INTO saas.promotion_redemptions(id,store_id,promotion_id,reservation_id,order_id,customer_id,discount_minor,currency,created_at) VALUES(p_redemption_id,p_store_id,v_reservation.promotion_id,p_reservation_id,p_order_id,v_reservation.customer_id,p_discount_minor,p_currency,p_now);
  RETURN QUERY SELECT 'committed',pg_catalog.jsonb_build_object('reservationId',p_reservation_id,'redemptionId',p_redemption_id);
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object('reservationId',p_reservation_id); END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_recover_operation_v1(p_store_id uuid,p_operation_id uuid,p_kind text,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_operation saas.promotion_operations%ROWTYPE;
BEGIN
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_operation.operation_kind<>p_kind OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_adopt_legacy_discounts_v1(p_store_id uuid,p_now timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE r record; v_rule jsonb; v_code text; v_count integer:=0; v_name text;
BEGIN
  FOR r IN SELECT * FROM saas.merchant_admin_records WHERE store_id=p_store_id AND record_kind='discount' LOOP
    IF pg_catalog.jsonb_typeof(r.config)<>'object' OR NOT saas.promotion_json_keys(r.config,ARRAY['discountType','value'],ARRAY['code','discountType','value','minimumOrderCents','usageLimit']) OR r.config->>'discountType' NOT IN ('percent','fixed') OR pg_catalog.btrim(r.name)<>r.name OR length(r.name) NOT BETWEEN 1 AND 200 OR r.name~'[[:cntrl:]]' THEN CONTINUE; END IF;
    IF r.config->>'discountType'='percent' AND (r.config->>'value' !~ '^(0|[1-9][0-9]{0,2})([.][0-9]{1,2})?$' OR ((r.config->>'value')::numeric*100)::bigint NOT BETWEEN 1 AND 10000) THEN CONTINUE; END IF;
    IF r.config->>'discountType'='fixed' AND (r.config->>'value' !~ '^[1-9][0-9]{0,9}$' OR (r.config->>'value')::numeric>8000000000) THEN CONTINUE; END IF;
    IF r.config ? 'usageLimit' AND r.config->>'usageLimit' !~ '^(0|[1-9][0-9]{0,9})$' THEN CONTINUE; END IF;
    IF r.config ? 'minimumOrderCents' AND r.config->>'minimumOrderCents' !~ '^(0|[1-9][0-9]{0,9})$' THEN CONTINUE; END IF;
    v_code:=CASE WHEN r.config ? 'code' THEN saas.promotion_normalize_code(r.config->>'code') ELSE NULL END;
    IF r.config ? 'code' AND (v_code IS NULL OR v_code !~ '^[A-Z0-9][A-Z0-9_-]{0,63}$') THEN CONTINUE; END IF;
    IF v_code IS NOT NULL AND (EXISTS (SELECT 1 FROM saas.promotion_codes c WHERE c.store_id=p_store_id AND c.code=v_code) OR (SELECT count(*) FROM saas.merchant_admin_records other_record WHERE other_record.store_id=p_store_id AND other_record.record_kind='discount' AND other_record.id<>r.id AND saas.promotion_normalize_code(other_record.config->>'code')=v_code)>0) THEN CONTINUE; END IF;
    v_rule:=pg_catalog.jsonb_build_object('schemaVersion',1,'benefit',CASE WHEN r.config->>'discountType'='percent' THEN pg_catalog.jsonb_build_object('kind','percentage','percentageBps',((r.config->>'value')::numeric*100)::integer) ELSE pg_catalog.jsonb_build_object('kind','fixed_amount','amountMinor',(r.config->>'value')::bigint,'currency','TRY') END,'targets',pg_catalog.jsonb_build_object('mode','all','include','[]'::jsonb,'exclude','[]'::jsonb),'audience',pg_catalog.jsonb_build_object('mode','everyone'),'trigger',CASE WHEN v_code IS NULL THEN pg_catalog.jsonb_build_object('kind','automatic') ELSE pg_catalog.jsonb_build_object('kind','code','codes',pg_catalog.jsonb_build_array(v_code)) END,'schedule',pg_catalog.jsonb_build_object('timezone','Europe/Istanbul'),'limits',pg_catalog.jsonb_build_object('totalUsage',CASE WHEN r.config ? 'usageLimit' THEN (r.config->>'usageLimit')::integer ELSE NULL END,'perCustomerUsage',NULL,'budgetMinor',NULL,'orderMaximumMinor',NULL),'conditions',pg_catalog.jsonb_build_object('minimumBasketMinor',CASE WHEN r.config ? 'minimumOrderCents' THEN (r.config->>'minimumOrderCents')::bigint ELSE 0 END,'minimumQuantity',0,'minimumProductQuantity',0),'combinationPolicy',pg_catalog.jsonb_build_object('kind','none'),'priority',0,'marginPolicy',pg_catalog.jsonb_build_object('kind','warn'),'progressMessagePolicy',pg_catalog.jsonb_build_object('enabled',false));
    IF NOT saas.promotion_rule_document_valid(v_rule) THEN CONTINUE; END IF;
    INSERT INTO saas.promotions(id,store_id,legacy_record_id,name,status,version,rule_document,created_at,updated_at) VALUES(r.id,r.store_id,r.id,r.name,'draft',1,v_rule,p_now,p_now) ON CONFLICT (store_id,legacy_record_id) DO NOTHING;
    IF FOUND THEN INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(r.id,r.store_id,r.id,1,v_rule,p_now); IF v_code IS NOT NULL THEN INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES(pg_catalog.gen_random_uuid(),r.store_id,r.id,NULL,v_code,'active',p_now); END IF; v_count:=v_count+1; END IF;
  END LOOP; RETURN v_count;
END $fn$;

-- History rows are immutable. Reservations are the sole transition record and may only change status/timestamps.
CREATE OR REPLACE FUNCTION saas.promotion_history_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN RAISE EXCEPTION 'promotion history is append-only'; END $fn$;
CREATE OR REPLACE FUNCTION saas.promotion_reservation_transition_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN
  IF TG_OP='DELETE' OR NEW.store_id<>OLD.store_id OR NEW.id<>OLD.id OR NEW.promotion_id<>OLD.promotion_id OR NEW.code_id IS DISTINCT FROM OLD.code_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.operation_id<>OLD.operation_id OR NEW.source_reference<>OLD.source_reference OR NEW.reserved_uses<>OLD.reserved_uses OR NEW.reserved_budget_minor<>OLD.reserved_budget_minor OR NEW.expires_at<>OLD.expires_at OR NEW.created_at<>OLD.created_at OR NEW.status NOT IN ('reserved','committed','released','expired') OR (OLD.status='reserved' AND NEW.status NOT IN ('reserved','committed','released','expired')) OR (OLD.status<>'reserved' AND NEW.status<>OLD.status) THEN RAISE EXCEPTION 'promotion reservation transition invalid'; END IF;
  RETURN NEW;
END $fn$;
DO $fn$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['promotion_versions','promotion_operations','promotion_redemptions','order_promotion_snapshots','order_discount_allocations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON saas.%I',t||'_immutable',t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.promotion_history_append_only()',t||'_immutable',t);
  END LOOP;
  DROP TRIGGER IF EXISTS promotion_usage_reservations_transition_only ON saas.promotion_usage_reservations;
  CREATE TRIGGER promotion_usage_reservations_transition_only BEFORE UPDATE OR DELETE ON saas.promotion_usage_reservations FOR EACH ROW EXECUTE FUNCTION saas.promotion_reservation_transition_only();
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.promotion_redemptions'::regclass AND conname='promotion_redemptions_order_store_fk') THEN ALTER TABLE saas.promotion_redemptions ADD CONSTRAINT promotion_redemptions_order_store_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.order_promotion_snapshots'::regclass AND conname='order_promotion_snapshots_order_store_fk') THEN ALTER TABLE saas.order_promotion_snapshots ADD CONSTRAINT order_promotion_snapshots_order_store_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id); ALTER TABLE saas.order_promotion_snapshots ADD CONSTRAINT order_promotion_snapshots_version_store_fk FOREIGN KEY(store_id,promotion_id,promotion_version) REFERENCES saas.promotion_versions(store_id,promotion_id,version); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.order_discount_allocations'::regclass AND conname='order_discount_allocations_order_store_fk') THEN ALTER TABLE saas.order_discount_allocations ADD CONSTRAINT order_discount_allocations_order_store_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id); END IF;
END $fn$;

DO $fn$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['promotions','promotion_versions','promotion_targets','promotion_codes','promotion_code_batches','promotion_usage_reservations','promotion_redemptions','promotion_audit_events','promotion_operations','order_promotion_snapshots','order_discount_allocations'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',v_table); EXECUTE pg_catalog.format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity',v_table);
    EXECUTE pg_catalog.format('DROP POLICY IF EXISTS promotions_owner_only ON saas.%I',v_table); EXECUTE pg_catalog.format('CREATE POLICY promotions_owner_only ON saas.%I TO celebix_saas_owner USING (true) WITH CHECK (true)',v_table);
  END LOOP;
END $fn$;
ALTER FUNCTION saas.promotion_evaluate_v1(uuid,jsonb,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.promotion_lifecycle_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],integer) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.promotion_evaluate_v1(uuid,jsonb,timestamptz) FROM PUBLIC;
DO $fn$
DECLARE p record;
BEGIN
  FOR p IN SELECT oid,proname,pg_catalog.pg_get_function_identity_arguments(oid) AS args FROM pg_catalog.pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'promotion_%' LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION saas.%I(%s) OWNER TO celebix_saas_owner',p.proname,p.args);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION saas.%I(%s) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity',p.proname,p.args);
  END LOOP;
END $fn$;
GRANT EXECUTE ON FUNCTION saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb),saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb),saas.promotion_lifecycle_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],integer),saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_detail_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_margin_check_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,integer,text),saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.promotion_codes_csv_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_analytics_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
COMMIT;
