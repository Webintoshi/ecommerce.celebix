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
  IF s ? 'startsAt' THEN IF pg_catalog.jsonb_typeof(s->'startsAt')<>'string' OR s->>'startsAt' !~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}[.]\\d{3}Z$' THEN RETURN false; END IF; BEGIN starts:=(s->>'startsAt')::timestamptz; EXCEPTION WHEN others THEN RETURN false; END; END IF; IF s ? 'endsAt' THEN IF NOT(s ? 'startsAt') OR pg_catalog.jsonb_typeof(s->'endsAt')<>'string' OR s->>'endsAt' !~ '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}[.]\\d{3}Z$' THEN RETURN false; END IF; BEGIN ends:=(s->>'endsAt')::timestamptz; EXCEPTION WHEN others THEN RETURN false; END; IF ends<=starts THEN RETURN false; END IF; END IF;
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

CREATE OR REPLACE FUNCTION saas.promotion_evaluate_v1(p_store_id uuid,p_context jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_currency text:=p_context->>'currency'; v_subtotal bigint:=0; v_shipping bigint:=0; v_line_discount bigint:=0; v_shipping_discount bigint:=0; v_lines jsonb:=COALESCE(p_context->'cartLines','[]'::jsonb); v_candidate record; v_rule jsonb; v_saving bigint; v_quantity integer:=0; v_bps integer:=0; v_gifts jsonb:='[]'::jsonb; v_applied jsonb:='[]'::jsonb; v_effects jsonb:='[]'::jsonb; v_shipping_effects jsonb:='[]'::jsonb; v_eligible jsonb:='[]'::jsonb; v_first_line_id text;
BEGIN
  IF p_store_id IS NULL OR p_context IS NULL OR p_now IS NULL OR v_currency !~ '^[A-Z]{3}$' OR pg_catalog.jsonb_typeof(v_lines)<>'array' THEN
    RETURN pg_catalog.jsonb_build_object('eligiblePromotionIds','[]'::jsonb,'appliedPromotions','[]'::jsonb,'rejectedPromotions','[]'::jsonb,'lineEffects','[]'::jsonb,'shippingEffects','[]'::jsonb,'gifts','[]'::jsonb,'subtotalBeforeDiscountMinor',0,'lineDiscountTotalMinor',0,'shippingBeforeDiscountMinor',0,'shippingDiscountTotalMinor',0,'discountTotalMinor',0,'grandTotalMinor',0,'currency',COALESCE(v_currency,'TRY'),'progressMessages','[]'::jsonb,'merchantExplanation','invalid context');
  END IF;
  SELECT COALESCE(sum((line->>'unitPriceMinor')::bigint * (line->>'quantity')::integer),0) INTO v_subtotal FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE (line->>'unitPriceMinor') ~ '^[0-9]+$' AND (line->>'quantity') ~ '^[1-9][0-9]*$';
  v_shipping:=CASE WHEN p_context->>'shippingBeforeDiscountMinor' ~ '^[0-9]+$' THEN (p_context->>'shippingBeforeDiscountMinor')::bigint ELSE 0 END;
  FOR v_candidate IN SELECT p.* FROM saas.promotions p WHERE p.store_id=p_store_id AND p.status IN ('active','scheduled') AND saas.promotion_rule_document_valid(p.rule_document) AND (p.rule_document->'schedule'->>'startsAt' IS NULL OR (p.rule_document->'schedule'->>'startsAt')::timestamptz <= p_now) AND (p.rule_document->'schedule'->>'endsAt' IS NULL OR p_now < (p.rule_document->'schedule'->>'endsAt')::timestamptz) ORDER BY p.created_at,p.id LOOP
    v_rule:=v_candidate.rule_document;
    IF v_rule->'trigger'->>'kind'='code' AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_context->'submittedCodes','[]'::jsonb)) c JOIN saas.promotion_codes code ON code.store_id=p_store_id AND code.promotion_id=v_candidate.id AND code.code=saas.promotion_normalize_code(c) AND code.status='active') THEN CONTINUE; END IF;
    v_eligible:=v_eligible || pg_catalog.jsonb_build_array(v_candidate.id); SELECT COALESCE(sum((line->>'quantity')::integer),0) INTO v_quantity FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE (line->>'quantity') ~ '^[1-9][0-9]*$';
    IF v_rule->'benefit'->>'kind'='free_shipping' THEN v_saving:=v_shipping;
    ELSIF v_rule->'benefit'->>'kind'='percentage' THEN v_saving:=LEAST(v_subtotal, GREATEST(0::bigint,(v_subtotal*COALESCE((v_rule->'benefit'->>'percentageBps')::integer,0))/10000));
    ELSIF v_rule->'benefit'->>'kind'='fixed_amount' AND v_rule->'benefit'->>'currency'=v_currency THEN v_saving:=LEAST(v_subtotal,COALESCE((v_rule->'benefit'->>'amountMinor')::bigint,0));
    ELSIF v_rule->'benefit'->>'kind'='quantity_tiers' THEN SELECT COALESCE(max((tier->>'percentageBps')::integer),0) INTO v_bps FROM pg_catalog.jsonb_array_elements(COALESCE(v_rule->'benefit'->'tiers','[]'::jsonb)) tier WHERE (tier->>'minimumQuantity')::integer<=v_quantity; v_saving:=LEAST(v_subtotal,GREATEST(0::bigint,(v_subtotal*v_bps)/10000));
    ELSIF v_rule->'benefit'->>'kind'='bundle_price' AND v_rule->'benefit'->>'currency'=v_currency THEN v_saving:=GREATEST(0::bigint,v_subtotal-((v_quantity/NULLIF((v_rule->'benefit'->>'bundleQuantity')::integer,0))*(v_rule->'benefit'->>'bundlePriceMinor')::bigint));
    ELSIF v_rule->'benefit'->>'kind'='buy_x_get_y' THEN v_saving:=LEAST(v_subtotal,GREATEST(0::bigint,((v_quantity/NULLIF(((v_rule->'benefit'->>'buyQuantity')::integer+(v_rule->'benefit'->>'receiveQuantity')::integer),0))*COALESCE((SELECT min((line->>'unitPriceMinor')::bigint) FROM pg_catalog.jsonb_array_elements(v_lines) line),0)*(v_rule->'benefit'->>'discountPercentageBps')::integer)/10000));
    ELSIF v_rule->'benefit'->>'kind'='gift' THEN v_saving:=0; v_gifts:=v_gifts||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'variantId',v_rule->'benefit'->>'giftVariantId','quantity',1,'paidMinor',0));
    ELSE v_saving:=0; END IF;
    v_saving:=LEAST(v_saving,COALESCE(NULLIF(v_rule->'limits'->>'orderMaximumMinor','')::bigint,v_saving));
    IF v_saving>0 OR v_rule->'benefit'->>'kind'='gift' THEN
      IF v_rule->'benefit'->>'kind'='free_shipping' THEN v_shipping_discount:=v_shipping_discount+v_saving; v_shipping_effects:=v_shipping_effects||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'discountMinor',v_saving));
      ELSE v_line_discount:=v_line_discount+v_saving; SELECT line->>'lineId' INTO v_first_line_id FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE line->>'lineId' ~ '^[0-9a-f]{8}-' ORDER BY CASE WHEN line->>'position' ~ '^[0-9]+$' THEN (line->>'position')::integer ELSE 101 END LIMIT 1; IF v_saving>0 AND v_first_line_id IS NOT NULL THEN v_effects:=v_effects||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'lineId',v_first_line_id,'discountMinor',v_saving,'giftQuantity',0)); END IF; END IF;
      v_applied:=v_applied || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'version',v_candidate.version,'name',v_candidate.name,'benefitKind',v_rule->'benefit'->>'kind','lineDiscountMinor',CASE WHEN v_rule->'benefit'->>'kind'='free_shipping' THEN 0 ELSE v_saving END,'shippingDiscountMinor',CASE WHEN v_rule->'benefit'->>'kind'='free_shipping' THEN v_saving ELSE 0 END,'discountTotalMinor',v_saving));
    END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('eligiblePromotionIds',v_eligible,'appliedPromotions',v_applied,'rejectedPromotions','[]'::jsonb,'lineEffects',v_effects,'shippingEffects',v_shipping_effects,'gifts',v_gifts,'subtotalBeforeDiscountMinor',v_subtotal,'lineDiscountTotalMinor',v_line_discount,'shippingBeforeDiscountMinor',v_shipping,'shippingDiscountTotalMinor',v_shipping_discount,'discountTotalMinor',v_line_discount+v_shipping_discount,'grandTotalMinor',GREATEST(0::bigint,v_subtotal+v_shipping-v_line_discount-v_shipping_discount),'currency',v_currency,'progressMessages','[]'::jsonb,'merchantExplanation','evaluated');
END $fn$;

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
