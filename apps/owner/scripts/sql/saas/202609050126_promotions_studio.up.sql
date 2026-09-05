-- Promotions Studio v1 is additive. Checkout/order entry points deliberately remain untouched.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS saas.promotions (
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  legacy_record_id uuid NULL,
  name text NOT NULL CHECK (name=pg_catalog.btrim(name) AND pg_catalog.length(name) BETWEEN 1 AND 200 AND pg_catalog.octet_length(name)<=800 AND name!~'[[:cntrl:]]'),
  status text NOT NULL CHECK (status IN ('draft','scheduled','active','paused','archived')),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  rule_document jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(rule_document)='object' AND pg_catalog.pg_column_size(rule_document)<=262144),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id),
  UNIQUE (id),
  UNIQUE (store_id,legacy_record_id),
  CONSTRAINT promotions_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_versions (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991), rule_document jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(rule_document)='object' AND pg_catalog.pg_column_size(rule_document)<=262144),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,promotion_id,version),
  CONSTRAINT promotion_versions_promotion_store_fk FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_targets (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('product','variant','category','brand','collection')),
  target_id uuid NOT NULL, inclusion text NOT NULL CHECK (inclusion IN ('include','exclude')),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,promotion_id,target_kind,target_id,inclusion),
  CONSTRAINT promotion_targets_promotion_store_fk FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_code_batches (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  requested_count integer NOT NULL CHECK (requested_count BETWEEN 1 AND 10000),
  operation_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,operation_id), UNIQUE (store_id,promotion_id,id),
  CONSTRAINT promotion_code_batches_promotion_store_fk FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_codes (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL, batch_id uuid NULL,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), CONSTRAINT promotion_codes_store_code_key UNIQUE (store_id,code), UNIQUE (store_id,promotion_id,id), UNIQUE (store_id,promotion_id,id,code),
  CONSTRAINT promotion_codes_promotion_store_fk FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id),
  CONSTRAINT promotion_codes_batch_store_fk FOREIGN KEY (store_id,promotion_id,batch_id) REFERENCES saas.promotion_code_batches(store_id,promotion_id,id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_operations (
  id uuid NOT NULL, store_id uuid NOT NULL, operation_id uuid NOT NULL,
  operation_kind text NOT NULL CHECK (operation_kind IN ('create','update','lifecycle','archive','duplicate','code_batch','code_batch_status','reserve','release','commit','expire')),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  result_entity_kind text NOT NULL CHECK (result_entity_kind IN ('promotion','code_batch','reservation_group','redemption_group')),
  result_entity_id uuid NOT NULL,
  result_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,operation_id),
  UNIQUE (store_id,operation_id,operation_kind,fingerprint,result_entity_id),
  CONSTRAINT promotion_operations_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id),
  CONSTRAINT promotion_operations_result_payload_check CHECK (pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=327680),
  CONSTRAINT promotion_operations_kind_entity_check CHECK (
    (operation_kind IN ('create','update','lifecycle','archive','duplicate') AND result_entity_kind='promotion')
    OR (operation_kind IN ('code_batch','code_batch_status') AND result_entity_kind='code_batch')
    OR (operation_kind IN ('reserve','release','expire') AND result_entity_kind='reservation_group')
    OR (operation_kind='commit' AND result_entity_kind='redemption_group')
  )
);
CREATE TABLE IF NOT EXISTS saas.promotion_usage_reservations (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL, code_id uuid NULL,
  promotion_version bigint NOT NULL CHECK (promotion_version BETWEEN 1 AND 9007199254740991),
  normalized_code text NULL CHECK (normalized_code IS NULL OR normalized_code ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  reservation_group_id uuid NOT NULL, customer_id uuid NULL,
  operation_id uuid NOT NULL, operation_kind text NOT NULL DEFAULT 'reserve' CHECK (operation_kind='reserve'),
  operation_fingerprint text NOT NULL CHECK (operation_fingerprint ~ '^[a-f0-9]{64}$'),
  source_kind text NOT NULL CHECK (source_kind IN ('hosted_checkout','offline_checkout')),
  source_reference text NOT NULL CHECK (source_reference=pg_catalog.btrim(source_reference) AND pg_catalog.length(source_reference) BETWEEN 1 AND 200 AND pg_catalog.octet_length(source_reference)<=800 AND source_reference!~'[[:cntrl:]]'),
  reserved_uses integer NOT NULL DEFAULT 1 CHECK (reserved_uses = 1),
  reserved_budget_minor bigint NOT NULL CHECK (reserved_budget_minor BETWEEN 0 AND 8000000000),
  discount_minor bigint NOT NULL CHECK (discount_minor BETWEEN 0 AND 8000000000 AND discount_minor=reserved_budget_minor),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  evaluator_snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(evaluator_snapshot)='object' AND pg_catalog.pg_column_size(evaluator_snapshot)<=262144),
  evaluator_fingerprint text NOT NULL CHECK (evaluator_fingerprint ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','committed','released','expired')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,promotion_id,id),
  UNIQUE (store_id,reservation_group_id,promotion_id),
  UNIQUE (store_id,reservation_group_id,promotion_id,id),
  CONSTRAINT promotion_usage_reservations_version_store_fk FOREIGN KEY (store_id,promotion_id,promotion_version) REFERENCES saas.promotion_versions(store_id,promotion_id,version),
  CONSTRAINT promotion_usage_reservations_code_store_fk FOREIGN KEY (store_id,promotion_id,code_id,normalized_code) REFERENCES saas.promotion_codes(store_id,promotion_id,id,code),
  CONSTRAINT promotion_usage_reservations_operation_store_fk FOREIGN KEY (store_id,operation_id,operation_kind,operation_fingerprint,reservation_group_id) REFERENCES saas.promotion_operations(store_id,operation_id,operation_kind,fingerprint,result_entity_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT promotion_usage_reservations_customer_store_fk FOREIGN KEY (store_id,customer_id) REFERENCES saas.customers(store_id,id),
  CONSTRAINT promotion_usage_reservations_code_snapshot_check CHECK ((code_id IS NULL)=(normalized_code IS NULL)),
  CONSTRAINT promotion_usage_reservations_time_check CHECK (expires_at>created_at AND updated_at>=created_at)
);
CREATE TABLE IF NOT EXISTS saas.promotion_redemptions (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL, reservation_id uuid NOT NULL,
  reservation_group_id uuid NOT NULL, redemption_group_id uuid NOT NULL,
  operation_id uuid NOT NULL, operation_kind text NOT NULL DEFAULT 'commit' CHECK (operation_kind='commit'),
  operation_fingerprint text NOT NULL CHECK (operation_fingerprint ~ '^[a-f0-9]{64}$'),
  promotion_version bigint NOT NULL CHECK (promotion_version BETWEEN 1 AND 9007199254740991), code_id uuid NULL,
  normalized_code text NULL CHECK (normalized_code IS NULL OR normalized_code ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  order_id uuid NOT NULL, customer_id uuid NULL, discount_minor bigint NOT NULL CHECK (discount_minor BETWEEN 0 AND 8000000000), currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  evaluator_fingerprint text NOT NULL CHECK (evaluator_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  UNIQUE (store_id,reservation_id), UNIQUE (store_id,redemption_group_id,promotion_id),
  CONSTRAINT promotion_redemptions_version_store_fk FOREIGN KEY (store_id,promotion_id,promotion_version) REFERENCES saas.promotion_versions(store_id,promotion_id,version),
  CONSTRAINT promotion_redemptions_code_store_fk FOREIGN KEY (store_id,promotion_id,code_id,normalized_code) REFERENCES saas.promotion_codes(store_id,promotion_id,id,code),
  CONSTRAINT promotion_redemptions_reservation_store_fk FOREIGN KEY (store_id,reservation_group_id,promotion_id,reservation_id) REFERENCES saas.promotion_usage_reservations(store_id,reservation_group_id,promotion_id,id),
  CONSTRAINT promotion_redemptions_operation_store_fk FOREIGN KEY (store_id,operation_id,operation_kind,operation_fingerprint,redemption_group_id) REFERENCES saas.promotion_operations(store_id,operation_id,operation_kind,fingerprint,result_entity_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT promotion_redemptions_customer_store_fk FOREIGN KEY (store_id,customer_id) REFERENCES saas.customers(store_id,id),
  CONSTRAINT promotion_redemptions_code_snapshot_check CHECK ((code_id IS NULL)=(normalized_code IS NULL))
);
CREATE TABLE IF NOT EXISTS saas.promotion_audit_events (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NULL, actor_principal_id uuid NULL,
  event_kind text NOT NULL CHECK (event_kind ~ '^[a-z_]{1,64}$'), payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_catalog.jsonb_typeof(payload)='object' AND pg_catalog.pg_column_size(payload)<=32768),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  CONSTRAINT promotion_audit_events_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id),
  CONSTRAINT promotion_audit_events_promotion_store_fk FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id),
  CONSTRAINT promotion_audit_events_actor_fk FOREIGN KEY (actor_principal_id) REFERENCES saas.principals(id)
);
CREATE TABLE IF NOT EXISTS saas.order_promotion_snapshots (
  id uuid NOT NULL, store_id uuid NOT NULL, order_id uuid NOT NULL, promotion_id uuid NOT NULL,
  promotion_version bigint NOT NULL CHECK (promotion_version BETWEEN 1 AND 9007199254740991), normalized_code text NULL CHECK (normalized_code IS NULL OR normalized_code ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'), discount_minor bigint NOT NULL CHECK (discount_minor BETWEEN 0 AND 8000000000), evaluator_fingerprint text NOT NULL CHECK (evaluator_fingerprint ~ '^[a-f0-9]{64}$'),
  snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(snapshot)='object' AND pg_catalog.pg_column_size(snapshot)<=262144),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  UNIQUE (store_id,order_id,promotion_id,promotion_version), UNIQUE (store_id,order_id,id),
  CONSTRAINT order_promotion_snapshots_promotion_store_fk FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.order_discount_allocations (
  id uuid NOT NULL, store_id uuid NOT NULL, order_id uuid NOT NULL, snapshot_id uuid NOT NULL,
  line_id uuid NULL, line_position integer NOT NULL CHECK (line_position >= 0), discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(), PRIMARY KEY (store_id,id),
  CONSTRAINT order_discount_allocations_snapshot_store_fk FOREIGN KEY (store_id,order_id,snapshot_id) REFERENCES saas.order_promotion_snapshots(store_id,order_id,id)
);

DO $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.promotion_code_batches'::regclass AND conname='promotion_code_batches_operation_store_fk') THEN
    ALTER TABLE saas.promotion_code_batches ADD CONSTRAINT promotion_code_batches_operation_store_fk FOREIGN KEY (store_id,operation_id) REFERENCES saas.promotion_operations(store_id,operation_id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.order_discount_allocations'::regclass AND conname='order_discount_allocations_line_store_fk') THEN
    ALTER TABLE saas.order_discount_allocations ADD CONSTRAINT order_discount_allocations_line_store_fk FOREIGN KEY (store_id,order_id,line_id) REFERENCES saas.order_items(store_id,order_id,id);
  END IF;
END $fn$;

CREATE INDEX IF NOT EXISTS promotion_targets_lookup_idx ON saas.promotion_targets(store_id,target_kind,target_id,promotion_id);
CREATE INDEX IF NOT EXISTS promotion_code_batches_promotion_status_idx ON saas.promotion_code_batches(store_id,promotion_id,status,id);
CREATE INDEX IF NOT EXISTS promotion_codes_promotion_status_idx ON saas.promotion_codes(store_id,promotion_id,status,id);
CREATE UNIQUE INDEX IF NOT EXISTS promotion_operations_reservation_group_owner_key ON saas.promotion_operations(store_id,result_entity_id) WHERE operation_kind='reserve' AND result_entity_kind='reservation_group';
CREATE UNIQUE INDEX IF NOT EXISTS promotion_operations_redemption_group_owner_key ON saas.promotion_operations(store_id,result_entity_id) WHERE operation_kind='commit' AND result_entity_kind='redemption_group';
CREATE INDEX IF NOT EXISTS promotion_usage_reservations_limit_idx ON saas.promotion_usage_reservations(store_id,promotion_id,status,expires_at,id);
CREATE INDEX IF NOT EXISTS promotion_usage_reservations_group_status_idx ON saas.promotion_usage_reservations(store_id,reservation_group_id,status,promotion_id,id);
CREATE INDEX IF NOT EXISTS promotion_usage_reservations_customer_limit_idx ON saas.promotion_usage_reservations(store_id,promotion_id,customer_id,status,expires_at,id);
CREATE INDEX IF NOT EXISTS promotion_usage_reservations_code_limit_idx ON saas.promotion_usage_reservations(store_id,code_id,status,expires_at,id);
CREATE INDEX IF NOT EXISTS promotion_redemptions_analytics_idx ON saas.promotion_redemptions(store_id,promotion_id,currency,created_at,id);
CREATE INDEX IF NOT EXISTS promotion_redemptions_group_idx ON saas.promotion_redemptions(store_id,redemption_group_id,promotion_id,id);
CREATE INDEX IF NOT EXISTS promotion_redemptions_usage_idx ON saas.promotion_redemptions(store_id,promotion_id,created_at,id);
CREATE INDEX IF NOT EXISTS promotion_redemptions_customer_usage_idx ON saas.promotion_redemptions(store_id,promotion_id,customer_id,created_at,id);
CREATE INDEX IF NOT EXISTS promotion_redemptions_code_usage_idx ON saas.promotion_redemptions(store_id,code_id,created_at,id);
CREATE INDEX IF NOT EXISTS order_promotion_snapshots_order_idx ON saas.order_promotion_snapshots(store_id,order_id,id);
CREATE INDEX IF NOT EXISTS promotions_list_keyset_idx ON saas.promotions(store_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS promotions_published_cap_idx ON saas.promotions(store_id,status,id) WHERE status IN ('active','scheduled');

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
  IF p_document IS NULL OR pg_catalog.jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR pg_catalog.pg_column_size(p_document)>262144 THEN RETURN false; END IF;
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
  SELECT CASE WHEN p_code !~ '^[A-Za-z0-9ıİşŞçÇğĞöÖüÜ][A-Za-z0-9_ıİşŞçÇğĞöÖüÜ-]{0,63}$' THEN NULL ELSE pg_catalog.upper(pg_catalog.translate(p_code,'İIıiÇçĞğÖöŞşÜü','IIiiCCGgOoSsUu')) END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_shipping_method_current(p_store_id uuid,p_id uuid)
RETURNS boolean LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT EXISTS(
    SELECT 1 FROM saas.merchant_admin_records shipping
    WHERE shipping.store_id=p_store_id AND shipping.id=p_id
      AND shipping.record_kind='shipping_setting' AND shipping.status='active'
      AND shipping.archived_at IS NULL
      AND saas.merchant_admin_config_valid('shipping_setting',shipping.config)
  )
$fn$;

-- Every definition identifier is resolved against current, same-store
-- catalog/customer/payment/shipping authority here.  This predicate is also
-- used by the evaluator so an archived include *or exclude* reference fails
-- the entire promotion closed instead of broadening its eligibility.
CREATE OR REPLACE FUNCTION saas.promotion_definition_references_valid(p_store_id uuid,p_document jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = pg_catalog, saas AS $fn$
BEGIN
  IF p_store_id IS NULL OR saas.promotion_rule_document_valid(p_document) IS NOT TRUE THEN RETURN false; END IF;
  RETURN (WITH target_refs AS MATERIALIZED (
    SELECT ref->>'kind' kind,(ref->>'id')::uuid id
    FROM (
      SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'include')
      UNION ALL
      SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'exclude')
    ) source
  ), audience_refs AS MATERIALIZED (
    SELECT value::uuid id FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_document->'audience'->'referenceIds','[]'::jsonb)) value
  ), payment_refs AS MATERIALIZED (
    SELECT value::uuid id FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_document->'conditions'->'paymentMethodIds','[]'::jsonb)) value
  ), shipping_refs AS MATERIALIZED (
    SELECT value::uuid id FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_document->'conditions'->'shippingMethodIds','[]'::jsonb)) value
  ), reward_product_refs AS MATERIALIZED (
    SELECT value::uuid id FROM pg_catalog.jsonb_array_elements_text(
      CASE WHEN p_document->'benefit'->>'kind'='buy_x_get_y'
             AND p_document->'benefit'->'reward'->>'strategy'='selected_products_cheapest'
        THEN p_document->'benefit'->'reward'->'productIds' ELSE '[]'::jsonb END
    ) value
  )
  SELECT NOT EXISTS (
      SELECT 1 FROM target_refs ref WHERE NOT CASE ref.kind
        WHEN 'product' THEN EXISTS(SELECT 1 FROM saas.products product WHERE product.store_id=p_store_id AND product.id=ref.id AND product.status='active' AND product.archived_at IS NULL)
        WHEN 'variant' THEN EXISTS(SELECT 1 FROM saas.product_variants variant JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id WHERE variant.store_id=p_store_id AND variant.id=ref.id AND variant.status='active' AND variant.archived_at IS NULL AND product.status='active' AND product.archived_at IS NULL)
        WHEN 'category' THEN EXISTS(SELECT 1 FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=ref.id AND category.status='active' AND category.archived_at IS NULL)
        WHEN 'brand' THEN EXISTS(SELECT 1 FROM saas.catalog_admin_resources resource WHERE resource.store_id=p_store_id AND resource.id=ref.id AND resource.resource_kind='brand' AND resource.status='active' AND resource.archived_at IS NULL)
        WHEN 'collection' THEN EXISTS(SELECT 1 FROM saas.catalog_admin_resources resource WHERE resource.store_id=p_store_id AND resource.id=ref.id AND resource.resource_kind='collection' AND resource.status='active' AND resource.archived_at IS NULL)
        ELSE false END
    )
    AND CASE p_document->'audience'->>'mode'
      WHEN 'customer_tags' THEN NOT EXISTS(SELECT 1 FROM audience_refs ref WHERE NOT EXISTS(SELECT 1 FROM saas.customer_tags tag WHERE tag.store_id=p_store_id AND tag.id=ref.id AND tag.archived_at IS NULL))
      WHEN 'customer_segments' THEN NOT EXISTS(SELECT 1 FROM audience_refs ref WHERE NOT EXISTS(SELECT 1 FROM saas.customer_segments segment WHERE segment.store_id=p_store_id AND segment.id=ref.id AND segment.archived_at IS NULL))
      WHEN 'masked_customers' THEN NOT EXISTS(SELECT 1 FROM audience_refs ref WHERE NOT EXISTS(SELECT 1 FROM saas.customers customer WHERE customer.store_id=p_store_id AND customer.id=ref.id AND customer.status='active' AND customer.archived_at IS NULL))
      ELSE true END
    AND NOT EXISTS(SELECT 1 FROM payment_refs ref WHERE NOT EXISTS(SELECT 1 FROM saas.payment_methods method WHERE method.store_id=p_store_id AND method.id=ref.id AND method.state='active'))
    AND NOT EXISTS(SELECT 1 FROM shipping_refs ref WHERE saas.promotion_shipping_method_current(p_store_id,ref.id) IS NOT TRUE)
    AND NOT EXISTS(SELECT 1 FROM reward_product_refs ref WHERE NOT EXISTS(SELECT 1 FROM saas.products product WHERE product.store_id=p_store_id AND product.id=ref.id AND product.status='active' AND product.archived_at IS NULL))
    AND CASE WHEN p_document->'benefit'->>'kind'='gift' THEN
      EXISTS(SELECT 1 FROM saas.product_variants variant JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id WHERE variant.store_id=p_store_id AND variant.id=(p_document->'benefit'->>'giftVariantId')::uuid AND variant.status='active' AND variant.archived_at IS NULL AND product.status='active' AND product.archived_at IS NULL)
      WHEN p_document->'benefit'->>'kind'='buy_x_get_y' AND p_document->'benefit'->'reward'->>'strategy'='specific_variant' THEN
      EXISTS(SELECT 1 FROM saas.product_variants variant JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id WHERE variant.store_id=p_store_id AND variant.id=(p_document->'benefit'->'reward'->>'variantId')::uuid AND variant.status='active' AND variant.archived_at IS NULL AND product.status='active' AND product.archived_at IS NULL)
      ELSE true END
  );
EXCEPTION WHEN others THEN RETURN false;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_lock_definition_references(p_store_id uuid,p_document jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN
  IF saas.promotion_definition_references_valid(p_store_id,p_document) IS NOT TRUE THEN RETURN false; END IF;
  PERFORM 1 FROM saas.products product
  WHERE product.store_id=p_store_id AND product.id IN (
    WITH variant_ids AS MATERIALIZED (
      SELECT (ref->>'id')::uuid id FROM (
        SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'include')
        UNION ALL SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'exclude')
      ) target WHERE target.ref->>'kind'='variant'
      UNION SELECT (p_document->'benefit'->>'giftVariantId')::uuid WHERE p_document->'benefit'->>'kind'='gift'
      UNION SELECT (p_document->'benefit'->'reward'->>'variantId')::uuid WHERE p_document->'benefit'->>'kind'='buy_x_get_y' AND p_document->'benefit'->'reward'->>'strategy'='specific_variant'
    )
    SELECT (ref->>'id')::uuid FROM (
      SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'include')
      UNION ALL SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'exclude')
    ) target WHERE target.ref->>'kind'='product'
    UNION SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(CASE WHEN p_document->'benefit'->>'kind'='buy_x_get_y' AND p_document->'benefit'->'reward'->>'strategy'='selected_products_cheapest' THEN p_document->'benefit'->'reward'->'productIds' ELSE '[]'::jsonb END) value
    UNION SELECT variant.product_id FROM saas.product_variants variant JOIN variant_ids ON variant_ids.id=variant.id WHERE variant.store_id=p_store_id
  ) ORDER BY product.id FOR SHARE;
  PERFORM 1 FROM saas.product_variants variant
  WHERE variant.store_id=p_store_id AND variant.id IN (
    SELECT (ref->>'id')::uuid FROM (
      SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'include')
      UNION ALL SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'exclude')
    ) target WHERE target.ref->>'kind'='variant'
    UNION SELECT (p_document->'benefit'->>'giftVariantId')::uuid WHERE p_document->'benefit'->>'kind'='gift'
    UNION SELECT (p_document->'benefit'->'reward'->>'variantId')::uuid WHERE p_document->'benefit'->>'kind'='buy_x_get_y' AND p_document->'benefit'->'reward'->>'strategy'='specific_variant'
  ) ORDER BY variant.id FOR SHARE;
  PERFORM 1 FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id IN (
    SELECT (ref->>'id')::uuid FROM (SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'include') UNION ALL SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'exclude')) target WHERE target.ref->>'kind'='category'
  ) ORDER BY category.id FOR SHARE;
  PERFORM 1 FROM saas.catalog_admin_resources resource WHERE resource.store_id=p_store_id AND resource.id IN (
    SELECT (ref->>'id')::uuid FROM (SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'include') UNION ALL SELECT value ref FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'exclude')) target WHERE target.ref->>'kind' IN ('brand','collection')
  ) ORDER BY resource.id FOR SHARE;
  PERFORM 1 FROM saas.customer_tags tag WHERE tag.store_id=p_store_id AND tag.id IN (SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(CASE WHEN p_document->'audience'->>'mode'='customer_tags' THEN p_document->'audience'->'referenceIds' ELSE '[]'::jsonb END) value) ORDER BY tag.id FOR SHARE;
  PERFORM 1 FROM saas.customer_segments segment WHERE segment.store_id=p_store_id AND segment.id IN (SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(CASE WHEN p_document->'audience'->>'mode'='customer_segments' THEN p_document->'audience'->'referenceIds' ELSE '[]'::jsonb END) value) ORDER BY segment.id FOR SHARE;
  PERFORM 1 FROM saas.customers customer WHERE customer.store_id=p_store_id AND customer.id IN (SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(CASE WHEN p_document->'audience'->>'mode'='masked_customers' THEN p_document->'audience'->'referenceIds' ELSE '[]'::jsonb END) value) ORDER BY customer.id FOR SHARE;
  PERFORM 1 FROM saas.payment_methods method WHERE method.store_id=p_store_id AND method.id IN (SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_document->'conditions'->'paymentMethodIds','[]'::jsonb)) value) ORDER BY method.id FOR SHARE;
  PERFORM 1 FROM saas.merchant_admin_records shipping
  WHERE shipping.store_id=p_store_id AND shipping.record_kind='shipping_setting'
    AND shipping.id IN (SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_document->'conditions'->'shippingMethodIds','[]'::jsonb)) value)
  ORDER BY shipping.id FOR SHARE;
  RETURN saas.promotion_definition_references_valid(p_store_id,p_document);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_materialize_targets(p_store_id uuid,p_promotion_id uuid,p_document jsonb)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN
  DELETE FROM saas.promotion_targets target
  WHERE target.store_id=p_store_id AND target.promotion_id=p_promotion_id
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT value ref,'include'::text inclusion FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'include')
        UNION ALL
        SELECT value ref,'exclude'::text inclusion FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'exclude')
      ) desired
      WHERE desired.ref->>'kind'=target.target_kind AND (desired.ref->>'id')::uuid=target.target_id AND desired.inclusion=target.inclusion
    );
  INSERT INTO saas.promotion_targets(id,store_id,promotion_id,target_kind,target_id,inclusion)
  SELECT pg_catalog.gen_random_uuid(),p_store_id,p_promotion_id,desired.ref->>'kind',(desired.ref->>'id')::uuid,desired.inclusion
  FROM (
    SELECT value ref,'include'::text inclusion FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'include')
    UNION ALL
    SELECT value ref,'exclude'::text inclusion FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'exclude')
  ) desired
  WHERE NOT EXISTS (
    SELECT 1 FROM saas.promotion_targets target
    WHERE target.store_id=p_store_id AND target.promotion_id=p_promotion_id
      AND target.target_kind=desired.ref->>'kind' AND target.target_id=(desired.ref->>'id')::uuid AND target.inclusion=desired.inclusion
  );
END $fn$;

-- The same store-scoped lock domain is reused by CRUD/duplicate today and by
-- batch generation in the next slice.  It makes collision preflight and write
-- one atomic serialization point instead of leaking a raw UNIQUE violation.
CREATE OR REPLACE FUNCTION saas.promotion_sync_direct_codes(p_store_id uuid,p_promotion_id uuid,p_document jsonb,p_now timestamptz)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_is_code boolean:=p_document->'trigger'->>'kind'='code'; v_constraint text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code:'||p_store_id::text,0));
  IF NOT v_is_code AND EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.promotion_id=p_promotion_id AND batch.status IN ('active','paused')) THEN RETURN 'active_code_batches'; END IF;
  IF v_is_code AND EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_document->'trigger'->'codes') desired(code)
    JOIN saas.promotion_codes existing ON existing.store_id=p_store_id AND existing.code=desired.code
    WHERE existing.promotion_id<>p_promotion_id OR (existing.promotion_id=p_promotion_id AND existing.batch_id IS NULL AND existing.status='revoked')
  ) THEN RETURN 'code_conflict'; END IF;
  UPDATE saas.promotion_codes code SET status='revoked'
  WHERE code.store_id=p_store_id AND code.promotion_id=p_promotion_id AND code.batch_id IS NULL AND code.status<>'revoked'
    AND (NOT v_is_code OR NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_document->'trigger'->'codes') desired(value) WHERE desired.value=code.code));
  IF v_is_code THEN
    UPDATE saas.promotion_codes code SET status='active'
    WHERE code.store_id=p_store_id AND code.promotion_id=p_promotion_id AND code.batch_id IS NULL AND code.status='paused'
      AND EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_document->'trigger'->'codes') desired(value) WHERE desired.value=code.code);
    INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at)
    SELECT pg_catalog.gen_random_uuid(),p_store_id,p_promotion_id,NULL,desired.value,'active',p_now
    FROM pg_catalog.jsonb_array_elements_text(p_document->'trigger'->'codes') desired(value)
    WHERE NOT EXISTS(SELECT 1 FROM saas.promotion_codes code WHERE code.store_id=p_store_id AND code.promotion_id=p_promotion_id AND code.batch_id IS NULL AND code.code=desired.value);
  END IF;
  RETURN NULL;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
  IF v_constraint='promotion_codes_store_code_key' THEN RETURN 'code_conflict'; END IF;
  RAISE;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_lifecycle_transition_valid(p_current text,p_next text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE p_current
    WHEN 'draft' THEN p_next IN ('scheduled','active','archived')
    WHEN 'scheduled' THEN p_next IN ('paused','active','archived')
    WHEN 'active' THEN p_next IN ('paused','archived')
    WHEN 'paused' THEN p_next IN ('scheduled','active','archived')
    ELSE false END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_effective_status_v1(p_status text,p_document jsonb,p_used bigint,p_budget bigint,p_now timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE
    WHEN p_status IN ('draft','paused','archived') THEN p_status
    WHEN p_document->'schedule'->>'endsAt' IS NOT NULL AND (p_document->'schedule'->>'endsAt')::timestamptz<=p_now THEN 'ended'
    WHEN p_document->'schedule'->>'startsAt' IS NOT NULL AND (p_document->'schedule'->>'startsAt')::timestamptz>p_now THEN 'scheduled'
    WHEN p_document->'limits'->>'totalUsage' IS NOT NULL AND p_used>= (p_document->'limits'->>'totalUsage')::bigint THEN 'usage_exhausted'
    WHEN p_document->'limits'->>'budgetMinor' IS NOT NULL AND p_budget>= (p_document->'limits'->>'budgetMinor')::bigint THEN 'budget_exhausted'
    ELSE 'active' END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_money_tr_v1(p_minor bigint,p_currency text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
DECLARE v_digits text:=(p_minor/100)::text; v_grouped text:=''; v_cents integer:=(p_minor%100)::integer;
BEGIN
  WHILE pg_catalog.length(v_digits)>3 LOOP
    v_grouped:='.'||pg_catalog.right(v_digits,3)||v_grouped;
    v_digits:=pg_catalog.left(v_digits,pg_catalog.length(v_digits)-3);
  END LOOP;
  v_grouped:=v_digits||v_grouped;
  IF v_cents<>0 THEN v_grouped:=v_grouped||','||pg_catalog.lpad(v_cents::text,2,'0'); END IF;
  RETURN v_grouped||' '||CASE p_currency WHEN 'TRY' THEN 'TL' ELSE p_currency END;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_human_mechanic_v1(p_currency text,p_document jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
DECLARE v_prefix text:=''; v_target_prefix text:=''; v_percentage numeric; v_tiers text;
BEGIN
  IF COALESCE((p_document->'conditions'->>'minimumBasketMinor')::bigint,0)>0 THEN
    v_prefix:=saas.promotion_money_tr_v1((p_document->'conditions'->>'minimumBasketMinor')::bigint,p_currency)||' üzeri ';
  END IF;
  IF p_document->'targets'->>'mode'='selected' THEN
    SELECT CASE
      WHEN count(DISTINCT target->>'kind')<>1 THEN 'seçili hedeflerde '
      WHEN min(target->>'kind')='category' THEN 'seçili kategoride '
      WHEN min(target->>'kind')='collection' THEN 'seçili koleksiyonda '
      WHEN min(target->>'kind')='brand' THEN 'seçili markada '
      ELSE 'seçili ürünlerde ' END
    INTO v_target_prefix
    FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'include') target;
  END IF;
  CASE p_document->'benefit'->>'kind'
    WHEN 'percentage' THEN
      v_percentage:=(p_document->'benefit'->>'percentageBps')::numeric/100;
      RETURN v_prefix||v_target_prefix||'%'||CASE WHEN v_percentage=pg_catalog.trunc(v_percentage) THEN pg_catalog.trunc(v_percentage)::text ELSE v_percentage::text END||' indirim';
    WHEN 'fixed_amount' THEN RETURN v_prefix||v_target_prefix||saas.promotion_money_tr_v1((p_document->'benefit'->>'amountMinor')::bigint,p_document->'benefit'->>'currency')||' indirim';
    WHEN 'free_shipping' THEN RETURN v_prefix||'ücretsiz kargo';
    WHEN 'quantity_tiers' THEN
      SELECT pg_catalog.string_agg((tier->>'minimumQuantity')||' adette %'||CASE WHEN (tier->>'percentageBps')::integer%100=0 THEN ((tier->>'percentageBps')::integer/100)::text ELSE ((tier->>'percentageBps')::numeric/100)::text END,', ' ORDER BY (tier->>'minimumQuantity')::integer)
      INTO v_tiers FROM pg_catalog.jsonb_array_elements(p_document->'benefit'->'tiers') tier;
      RETURN v_prefix||v_target_prefix||v_tiers||' indirim';
    WHEN 'bundle_price' THEN RETURN v_prefix||v_target_prefix||(p_document->'benefit'->>'bundleQuantity')||' ürün '||saas.promotion_money_tr_v1((p_document->'benefit'->>'bundlePriceMinor')::bigint,p_document->'benefit'->>'currency');
    WHEN 'buy_x_get_y' THEN
      v_percentage:=(p_document->'benefit'->>'discountPercentageBps')::numeric/100;
      RETURN v_prefix||v_target_prefix||(p_document->'benefit'->>'buyQuantity')||' al, '||(p_document->'benefit'->>'receiveQuantity')||CASE WHEN v_percentage=100 THEN ' bedava' ELSE ' üründe %'||CASE WHEN v_percentage=pg_catalog.trunc(v_percentage) THEN pg_catalog.trunc(v_percentage)::text ELSE v_percentage::text END||' indirim' END;
    WHEN 'gift' THEN RETURN v_prefix||'hediye ürün';
    ELSE RETURN 'Kampanya';
  END CASE;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_safe_timestamptz(p_value text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog AS $fn$
DECLARE v_value timestamptz;
BEGIN
  v_value:=p_value::timestamptz;
  RETURN CASE WHEN pg_catalog.isfinite(v_value) THEN v_value ELSE NULL END;
EXCEPTION WHEN others THEN RETURN NULL;
END $fn$;
CREATE OR REPLACE FUNCTION saas.promotion_operation_fingerprint(p_kind text,p_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE
    WHEN p_kind IN ('create','update','lifecycle','archive','duplicate','code_batch','code_batch_status','reserve','release','commit','expire')
      AND pg_catalog.jsonb_typeof(p_payload)='object'
      AND pg_catalog.pg_column_size(p_payload)<=262144
    THEN pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_kind||':'||p_payload::text,'UTF8')),'hex')
    ELSE NULL
  END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_fingerprint_canonical_json(p_value jsonb,p_parent_key text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_type text;
  v_numeric numeric;
  v_total bigint;
  v_valid bigint;
  v_body text;
  v_set_like boolean:=p_parent_key IN ('include','exclude','referenceIds','codes','productIds','paymentMethodIds','shippingMethodIds','salesChannels','benefitClasses','customerSegmentIds','customerTagIds','cartLines','categoryIds','collectionIds','submittedCodes');
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;
  v_type:=pg_catalog.jsonb_typeof(p_value);
  IF v_type IN ('null','boolean','string') THEN RETURN p_value::text; END IF;
  IF v_type='number' THEN
    BEGIN v_numeric:=(p_value::text)::numeric; EXCEPTION WHEN others THEN RETURN NULL; END;
    IF v_numeric<>pg_catalog.trunc(v_numeric) OR v_numeric NOT BETWEEN -9007199254740991 AND 9007199254740991 THEN RETURN NULL; END IF;
    RETURN (v_numeric::bigint)::text;
  END IF;
  IF v_type='array' THEN
    SELECT count(*),count(serialized),pg_catalog.string_agg(serialized,',' ORDER BY CASE WHEN v_set_like THEN pg_catalog.convert_to(serialized,'UTF8') END,ordinality)
      INTO v_total,v_valid,v_body
      FROM (SELECT ordinality,saas.promotion_fingerprint_canonical_json(value,NULL) AS serialized FROM pg_catalog.jsonb_array_elements(p_value) WITH ORDINALITY) child;
    IF v_total<>v_valid THEN RETURN NULL; END IF;
    RETURN '['||COALESCE(v_body,'')||']';
  END IF;
  IF v_type='object' THEN
    SELECT count(*),count(serialized),pg_catalog.string_agg(pg_catalog.to_jsonb(key)::text||':'||serialized,',' ORDER BY pg_catalog.convert_to(key,'UTF8'))
      INTO v_total,v_valid,v_body
      FROM (SELECT key,saas.promotion_fingerprint_canonical_json(value,key) AS serialized FROM pg_catalog.jsonb_each(p_value)) child;
    IF v_total<>v_valid THEN RETURN NULL; END IF;
    RETURN '{'||COALESCE(v_body,'')||'}';
  END IF;
  RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_operation_fingerprint_v2(p_kind text,p_store_id uuid,p_payload jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, saas AS $fn$
DECLARE v_canonical text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('create','update','lifecycle','archive','duplicate','code_batch','code_batch_status','reserve','release','commit','expire')
     OR p_store_id IS NULL OR p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR pg_catalog.pg_column_size(p_payload)>327680
  THEN RETURN NULL; END IF;
  v_canonical:=saas.promotion_fingerprint_canonical_json(pg_catalog.jsonb_build_object('kind',p_kind,'storeId',p_store_id,'payload',p_payload),NULL);
  IF v_canonical IS NULL THEN RETURN NULL; END IF;
  RETURN pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_canonical,'UTF8')),'hex');
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_json_utc_timestamp(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog AS $fn$
DECLARE v_timestamp timestamptz; v_text text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value)<>'string' THEN RETURN false; END IF;
  v_text:=p_value#>>'{}';
  IF v_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' THEN RETURN false; END IF;
  BEGIN v_timestamp:=v_text::timestamptz; EXCEPTION WHEN others THEN RETURN false; END;
  RETURN pg_catalog.to_char(v_timestamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')=v_text;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_operation_result_valid(p_kind text,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_item jsonb;
  v_key text;
  v_previous bytea;
  v_promotion_ids text[]:=ARRAY[]::text[];
  v_reservation_ids text[]:=ARRAY[]::text[];
  v_redemption_ids text[]:=ARRAY[]::text[];
  v_discount_total bigint:=0;
BEGIN
  IF pg_catalog.jsonb_typeof(p_result)<>'object' OR pg_catalog.pg_column_size(p_result)>327680 THEN RETURN false; END IF;
  IF p_kind IN ('create','update','lifecycle','archive','duplicate') THEN
    IF (saas.promotion_json_keys(p_result,ARRAY['id','version','name','status','ruleDocument','createdAt','updatedAt'],ARRAY['id','version','name','status','ruleDocument','createdAt','updatedAt'])
      AND saas.promotion_json_uuid(p_result->'id')
      AND saas.promotion_json_integer(p_result->'version',1,9007199254740991)
      AND pg_catalog.jsonb_typeof(p_result->'name')='string'
      AND pg_catalog.length(p_result->>'name') BETWEEN 1 AND 200
      AND pg_catalog.octet_length(p_result->>'name')<=800
      AND p_result->>'name'=pg_catalog.btrim(p_result->>'name')
      AND p_result->>'name'!~'[[:cntrl:]]'
      AND p_result->>'status' IN ('draft','scheduled','active','paused','archived')
      AND saas.promotion_rule_document_valid(p_result->'ruleDocument')
      AND saas.promotion_json_utc_timestamp(p_result->'createdAt')
      AND saas.promotion_json_utc_timestamp(p_result->'updatedAt')) IS NOT TRUE THEN RETURN false; END IF;
    RETURN (p_result->>'updatedAt')::timestamptz >= (p_result->>'createdAt')::timestamptz;
  ELSIF p_kind='code_batch' THEN
    RETURN (saas.promotion_json_keys(p_result,ARRAY['id','promotionId','status','count','createdAt'],ARRAY['id','promotionId','status','count','createdAt'])
      AND saas.promotion_json_uuid(p_result->'id') AND saas.promotion_json_uuid(p_result->'promotionId')
      AND p_result->>'status'='active' AND saas.promotion_json_integer(p_result->'count',1,10000)
      AND saas.promotion_json_utc_timestamp(p_result->'createdAt')) IS TRUE;
  ELSIF p_kind='code_batch_status' THEN
    RETURN (saas.promotion_json_keys(p_result,ARRAY['id','status'],ARRAY['id','status'])
      AND saas.promotion_json_uuid(p_result->'id') AND p_result->>'status' IN ('active','paused','revoked')) IS TRUE;
  ELSIF p_kind IN ('reserve','release','expire') THEN
    IF (saas.promotion_json_keys(p_result,ARRAY['schemaVersion','reservationGroupId','status','currency','discountTotalMinor','expiresAt','evaluatorFingerprint','reservations'],ARRAY['schemaVersion','reservationGroupId','status','currency','discountTotalMinor','expiresAt','evaluatorFingerprint','reservations'])
      AND saas.promotion_json_integer(p_result->'schemaVersion',1,1)
      AND saas.promotion_json_uuid(p_result->'reservationGroupId')
      AND p_result->>'status'=CASE p_kind WHEN 'reserve' THEN 'reserved' WHEN 'release' THEN 'released' ELSE 'expired' END
      AND p_result->>'currency' ~ '^[A-Z]{3}$'
      AND saas.promotion_json_integer(p_result->'discountTotalMinor',0,8000000000)
      AND saas.promotion_json_utc_timestamp(p_result->'expiresAt')
      AND pg_catalog.jsonb_typeof(p_result->'evaluatorFingerprint')='string'
      AND p_result->>'evaluatorFingerprint' ~ '^[a-f0-9]{64}$'
      AND pg_catalog.jsonb_typeof(p_result->'reservations')='array'
      AND pg_catalog.jsonb_array_length(p_result->'reservations') BETWEEN 1 AND 100) IS NOT TRUE THEN RETURN false; END IF;
    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_result->'reservations') LOOP
      IF (saas.promotion_json_keys(v_item,ARRAY['promotionId','reservationId','promotionVersion','normalizedCode','discountMinor'],ARRAY['promotionId','reservationId','promotionVersion','normalizedCode','discountMinor'])
          AND saas.promotion_json_uuid(v_item->'promotionId') AND saas.promotion_json_uuid(v_item->'reservationId')
          AND saas.promotion_json_integer(v_item->'promotionVersion',1,9007199254740991)
          AND pg_catalog.jsonb_typeof(v_item->'normalizedCode') IN ('null','string')
          AND (v_item->'normalizedCode'='null'::jsonb OR v_item->>'normalizedCode' ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$')
          AND saas.promotion_json_integer(v_item->'discountMinor',0,8000000000)) IS NOT TRUE THEN RETURN false; END IF;
      IF v_item->>'promotionId'=ANY(v_promotion_ids) OR v_item->>'reservationId'=ANY(v_reservation_ids) THEN RETURN false; END IF;
      v_key:=(v_item->>'promotionId')||':'||(v_item->>'reservationId');
      IF v_previous IS NOT NULL AND pg_catalog.convert_to(v_key,'UTF8')<=v_previous THEN RETURN false; END IF;
      v_previous:=pg_catalog.convert_to(v_key,'UTF8'); v_promotion_ids:=pg_catalog.array_append(v_promotion_ids,v_item->>'promotionId'); v_reservation_ids:=pg_catalog.array_append(v_reservation_ids,v_item->>'reservationId'); v_discount_total:=v_discount_total+(v_item->>'discountMinor')::bigint;
    END LOOP;
    RETURN v_discount_total=(p_result->>'discountTotalMinor')::bigint;
  ELSIF p_kind='commit' THEN
    IF (saas.promotion_json_keys(p_result,ARRAY['schemaVersion','reservationGroupId','redemptionGroupId','status','orderId','currency','discountTotalMinor','evaluatorFingerprint','redemptions'],ARRAY['schemaVersion','reservationGroupId','redemptionGroupId','status','orderId','currency','discountTotalMinor','evaluatorFingerprint','redemptions'])
      AND saas.promotion_json_integer(p_result->'schemaVersion',1,1)
      AND saas.promotion_json_uuid(p_result->'reservationGroupId') AND saas.promotion_json_uuid(p_result->'redemptionGroupId') AND saas.promotion_json_uuid(p_result->'orderId')
      AND p_result->>'currency' ~ '^[A-Z]{3}$' AND saas.promotion_json_integer(p_result->'discountTotalMinor',0,8000000000)
      AND pg_catalog.jsonb_typeof(p_result->'evaluatorFingerprint')='string'
      AND p_result->>'evaluatorFingerprint' ~ '^[a-f0-9]{64}$'
      AND p_result->>'status'='committed' AND pg_catalog.jsonb_typeof(p_result->'redemptions')='array'
      AND pg_catalog.jsonb_array_length(p_result->'redemptions') BETWEEN 1 AND 100) IS NOT TRUE THEN RETURN false; END IF;
    FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_result->'redemptions') LOOP
      IF (saas.promotion_json_keys(v_item,ARRAY['promotionId','reservationId','redemptionId','promotionVersion','normalizedCode','discountMinor'],ARRAY['promotionId','reservationId','redemptionId','promotionVersion','normalizedCode','discountMinor'])
          AND saas.promotion_json_uuid(v_item->'promotionId') AND saas.promotion_json_uuid(v_item->'reservationId') AND saas.promotion_json_uuid(v_item->'redemptionId')
          AND saas.promotion_json_integer(v_item->'promotionVersion',1,9007199254740991)
          AND pg_catalog.jsonb_typeof(v_item->'normalizedCode') IN ('null','string')
          AND (v_item->'normalizedCode'='null'::jsonb OR v_item->>'normalizedCode' ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$')
          AND saas.promotion_json_integer(v_item->'discountMinor',0,8000000000)) IS NOT TRUE THEN RETURN false; END IF;
      IF v_item->>'promotionId'=ANY(v_promotion_ids) OR v_item->>'reservationId'=ANY(v_reservation_ids) OR v_item->>'redemptionId'=ANY(v_redemption_ids) THEN RETURN false; END IF;
      v_key:=(v_item->>'promotionId')||':'||(v_item->>'redemptionId');
      IF v_previous IS NOT NULL AND pg_catalog.convert_to(v_key,'UTF8')<=v_previous THEN RETURN false; END IF;
      v_previous:=pg_catalog.convert_to(v_key,'UTF8'); v_promotion_ids:=pg_catalog.array_append(v_promotion_ids,v_item->>'promotionId'); v_reservation_ids:=pg_catalog.array_append(v_reservation_ids,v_item->>'reservationId'); v_redemption_ids:=pg_catalog.array_append(v_redemption_ids,v_item->>'redemptionId'); v_discount_total:=v_discount_total+(v_item->>'discountMinor')::bigint;
    END LOOP;
    RETURN v_discount_total=(p_result->>'discountTotalMinor')::bigint;
  ELSE
    RETURN false;
  END IF;
EXCEPTION WHEN others THEN RETURN false;
END $fn$;

DO $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.promotion_operations'::regclass AND conname='promotion_operations_result_contract_check') THEN
    ALTER TABLE saas.promotion_operations ADD CONSTRAINT promotion_operations_result_contract_check CHECK (saas.promotion_operation_result_valid(operation_kind,result_payload) IS TRUE) NOT VALID;
  END IF;
  ALTER TABLE saas.promotion_operations VALIDATE CONSTRAINT promotion_operations_result_contract_check;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_operation_entity_kind(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE
    WHEN p_kind IN ('create','update','lifecycle','archive','duplicate') THEN 'promotion'
    WHEN p_kind IN ('code_batch','code_batch_status') THEN 'code_batch'
    WHEN p_kind IN ('reserve','release','expire') THEN 'reservation_group'
    WHEN p_kind='commit' THEN 'redemption_group'
    ELSE NULL
  END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_operation_entity_id(p_kind text,p_result jsonb)
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = pg_catalog, saas AS $fn$
DECLARE v_value jsonb;
BEGIN
  IF saas.promotion_operation_result_valid(p_kind,p_result) IS NOT TRUE THEN RETURN NULL; END IF;
  v_value:=CASE WHEN p_kind IN ('reserve','release','expire') THEN p_result->'reservationGroupId' WHEN p_kind='commit' THEN p_result->'redemptionGroupId' ELSE p_result->'id' END;
  IF saas.promotion_json_uuid(v_value) IS NOT TRUE THEN RETURN NULL; END IF;
  RETURN (v_value#>>'{}')::uuid;
EXCEPTION WHEN others THEN RETURN NULL;
END $fn$;

DO $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.promotion_operations'::regclass AND conname='promotion_operations_result_entity_check') THEN
    ALTER TABLE saas.promotion_operations ADD CONSTRAINT promotion_operations_result_entity_check CHECK (result_entity_id IS NOT DISTINCT FROM saas.promotion_operation_entity_id(operation_kind,result_payload)) NOT VALID;
  END IF;
  ALTER TABLE saas.promotion_operations VALIDATE CONSTRAINT promotion_operations_result_entity_check;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_operation_recovery_action(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE WHEN p_kind IN ('create','update','lifecycle','duplicate','code_batch','code_batch_status') THEN 'promotions.manage' WHEN p_kind='archive' THEN 'promotions.archive' ELSE NULL END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_audit_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN RAISE EXCEPTION 'promotion audit events are append-only'; END $fn$;
DROP TRIGGER IF EXISTS promotion_audit_events_immutable ON saas.promotion_audit_events;
CREATE TRIGGER promotion_audit_events_immutable BEFORE UPDATE OR DELETE ON saas.promotion_audit_events FOR EACH ROW EXECUTE FUNCTION saas.promotion_audit_append_only();

CREATE OR REPLACE FUNCTION saas.promotion_created_at_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'promotion created_at is immutable'; END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS promotions_created_at_immutable ON saas.promotions;
CREATE TRIGGER promotions_created_at_immutable BEFORE UPDATE ON saas.promotions FOR EACH ROW EXECUTE FUNCTION saas.promotion_created_at_immutable();

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_empty_result(p_currency text,p_reason text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT pg_catalog.jsonb_build_object('eligiblePromotionIds','[]'::jsonb,'appliedPromotions','[]'::jsonb,'rejectedPromotions','[]'::jsonb,'lineEffects','[]'::jsonb,'shippingEffects','[]'::jsonb,'gifts','[]'::jsonb,'subtotalBeforeDiscountMinor',0,'lineDiscountTotalMinor',0,'shippingBeforeDiscountMinor',0,'shippingDiscountTotalMinor',0,'discountTotalMinor',0,'grandTotalMinor',0,'currency',CASE WHEN p_currency ~ '^[A-Z]{3}$' THEN p_currency ELSE 'TRY' END,'progressMessages','[]'::jsonb,'merchantExplanation',p_reason)
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_context_valid(p_store_id uuid,p_context jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = pg_catalog, saas AS $fn$
DECLARE line jsonb; line_ids text[]:=ARRAY[]::text[]; positions integer[]:=ARRAY[]::integer[]; subtotal numeric:=0; v_currency text; local_time timestamptz;
BEGIN
  IF p_store_id IS NULL OR saas.promotion_json_keys(p_context,ARRAY['storeId','customerId','paidOrderCount','customerSegmentIds','customerTagIds','cartLines','shippingMethodId','paymentMethodId','shippingBeforeDiscountMinor','currency','storeLocalTime','salesChannel','submittedCodes','abandonedCart'],ARRAY['storeId','customerId','paidOrderCount','customerSegmentIds','customerTagIds','cartLines','shippingMethodId','paymentMethodId','shippingBeforeDiscountMinor','currency','storeLocalTime','salesChannel','submittedCodes','abandonedCart']) IS NOT TRUE THEN RETURN false; END IF;
  IF saas.promotion_json_uuid(p_context->'storeId') IS NOT TRUE OR saas.promotion_json_integer(p_context->'paidOrderCount',0,1000000000) IS NOT TRUE THEN RETURN false; END IF;
  IF (p_context->>'storeId')::uuid<>p_store_id THEN RETURN false; END IF;
  v_currency:=p_context->>'currency';
  IF v_currency !~ '^[A-Z]{3}$' OR NOT EXISTS(SELECT 1 FROM saas.stores store_row WHERE store_row.id=p_store_id AND store_row.status='active' AND store_row.currency=v_currency)
     OR pg_catalog.jsonb_typeof(p_context->'customerId') NOT IN ('null','string') OR (p_context->'customerId'<>'null'::jsonb AND NOT saas.promotion_json_uuid(p_context->'customerId'))
     OR pg_catalog.jsonb_typeof(p_context->'shippingMethodId') NOT IN ('null','string') OR (p_context->'shippingMethodId'<>'null'::jsonb AND NOT saas.promotion_json_uuid(p_context->'shippingMethodId')) OR pg_catalog.jsonb_typeof(p_context->'paymentMethodId') NOT IN ('null','string') OR (p_context->'paymentMethodId'<>'null'::jsonb AND NOT saas.promotion_json_uuid(p_context->'paymentMethodId')) OR NOT saas.promotion_json_integer(p_context->'shippingBeforeDiscountMinor',0,8000000000) OR p_context->>'storeLocalTime' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' OR p_context->>'salesChannel' NOT IN ('storefront','quick_order') THEN RETURN false; END IF;
  IF p_context->'customerId'<>'null'::jsonb AND NOT EXISTS(
    SELECT 1 FROM saas.customers customer
    WHERE customer.store_id=p_store_id AND customer.id=(p_context->>'customerId')::uuid
      AND customer.status='active' AND customer.archived_at IS NULL
  ) THEN RETURN false; END IF;
  BEGIN local_time:=(p_context->>'storeLocalTime')::timestamptz; EXCEPTION WHEN others THEN RETURN false; END;
  IF pg_catalog.to_char(local_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>p_context->>'storeLocalTime' THEN RETURN false; END IF;
  IF pg_catalog.jsonb_typeof(p_context->'cartLines')<>'array' OR pg_catalog.jsonb_array_length(p_context->'cartLines')>20 OR pg_catalog.jsonb_typeof(p_context->'customerSegmentIds')<>'array' OR pg_catalog.jsonb_array_length(p_context->'customerSegmentIds')>100 OR pg_catalog.jsonb_typeof(p_context->'customerTagIds')<>'array' OR pg_catalog.jsonb_array_length(p_context->'customerTagIds')>100 OR pg_catalog.jsonb_typeof(p_context->'submittedCodes')<>'array' OR pg_catalog.jsonb_array_length(p_context->'submittedCodes')>5 OR NOT saas.promotion_json_array_unique(p_context->'customerSegmentIds') OR NOT saas.promotion_json_array_unique(p_context->'customerTagIds') OR NOT saas.promotion_json_array_unique(p_context->'submittedCodes') THEN RETURN false; END IF;
  FOR line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_context->'customerSegmentIds') UNION ALL SELECT value FROM pg_catalog.jsonb_array_elements(p_context->'customerTagIds') LOOP IF NOT saas.promotion_json_uuid(line) THEN RETURN false; END IF; END LOOP;
  FOR line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_context->'submittedCodes') LOOP IF pg_catalog.jsonb_typeof(line)<>'string' OR saas.promotion_normalize_code(line#>>'{}')<>(line#>>'{}') THEN RETURN false; END IF; END LOOP;
  IF pg_catalog.jsonb_typeof(p_context->'abandonedCart')='null' THEN NULL; ELSIF NOT saas.promotion_json_keys(p_context->'abandonedCart',ARRAY['id'],ARRAY['id']) OR NOT saas.promotion_json_uuid(p_context->'abandonedCart'->'id') THEN RETURN false; END IF;
  FOR line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_context->'cartLines') LOOP
    IF NOT saas.promotion_json_keys(line,ARRAY['lineId','position','productId','variantId','quantity','unitPriceMinor','unitCostMinor','currency','categoryIds','brandId','collectionIds'],ARRAY['lineId','position','productId','variantId','quantity','unitPriceMinor','unitCostMinor','currency','categoryIds','brandId','collectionIds']) OR NOT saas.promotion_json_uuid(line->'lineId') OR NOT saas.promotion_json_uuid(line->'productId') OR NOT saas.promotion_json_uuid(line->'variantId') OR NOT saas.promotion_json_integer(line->'position',0,19) OR NOT saas.promotion_json_integer(line->'quantity',1,1000000) OR NOT saas.promotion_json_integer(line->'unitPriceMinor',0,8000000000) OR (line->'unitCostMinor'<>'null'::jsonb AND NOT saas.promotion_json_integer(line->'unitCostMinor',0,8000000000)) OR line->>'currency' !~ '^[A-Z]{3}$' OR pg_catalog.jsonb_typeof(line->'categoryIds')<>'array' OR pg_catalog.jsonb_array_length(line->'categoryIds')>100 OR pg_catalog.jsonb_typeof(line->'collectionIds')<>'array' OR pg_catalog.jsonb_array_length(line->'collectionIds')>100 OR NOT saas.promotion_json_array_unique(line->'categoryIds') OR NOT saas.promotion_json_array_unique(line->'collectionIds') OR pg_catalog.jsonb_typeof(line->'brandId') NOT IN ('null','string') OR (line->'brandId'<>'null'::jsonb AND NOT saas.promotion_json_uuid(line->'brandId')) THEN RETURN false; END IF;
    IF line->>'lineId'=ANY(line_ids) OR (line->>'position')::integer=ANY(positions) THEN RETURN false; END IF; line_ids:=array_append(line_ids,line->>'lineId'); positions:=array_append(positions,(line->>'position')::integer); subtotal:=subtotal+(line->>'quantity')::numeric*(line->>'unitPriceMinor')::numeric;
    FOR line IN SELECT value FROM pg_catalog.jsonb_array_elements(line->'categoryIds') UNION ALL SELECT value FROM pg_catalog.jsonb_array_elements(line->'collectionIds') LOOP IF NOT saas.promotion_json_uuid(line) THEN RETURN false; END IF; END LOOP;
  END LOOP;
  RETURN subtotal+(p_context->>'shippingBeforeDiscountMinor')::numeric<=8000000000;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_line_matches(p_targets jsonb,p_line jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  WITH refs AS (SELECT value ref FROM pg_catalog.jsonb_array_elements(COALESCE(p_targets->'include','[]'::jsonb))), blocked AS (SELECT value ref FROM pg_catalog.jsonb_array_elements(COALESCE(p_targets->'exclude','[]'::jsonb))), match_ref AS (SELECT ref, CASE ref->>'kind' WHEN 'product' THEN ref->>'id'=p_line->>'productId' WHEN 'variant' THEN ref->>'id'=p_line->>'variantId' WHEN 'category' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_line->'categoryIds') id WHERE id=ref->>'id') WHEN 'brand' THEN ref->>'id'=p_line->>'brandId' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_line->'brandIds','[]'::jsonb)) id WHERE id=ref->>'id') WHEN 'collection' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_line->'collectionIds') id WHERE id=ref->>'id') ELSE false END hit FROM refs), block_ref AS (SELECT CASE ref->>'kind' WHEN 'product' THEN ref->>'id'=p_line->>'productId' WHEN 'variant' THEN ref->>'id'=p_line->>'variantId' WHEN 'category' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_line->'categoryIds') id WHERE id=ref->>'id') WHEN 'brand' THEN ref->>'id'=p_line->>'brandId' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_line->'brandIds','[]'::jsonb)) id WHERE id=ref->>'id') WHEN 'collection' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_line->'collectionIds') id WHERE id=ref->>'id') ELSE false END hit FROM blocked) SELECT (p_targets->>'mode'='all' OR EXISTS(SELECT 1 FROM match_ref WHERE hit)) AND NOT EXISTS(SELECT 1 FROM block_ref WHERE hit)
$fn$;

SET LOCAL check_function_bodies = off;
-- One bounded candidate/fact relation is shared by every evaluation.  Keeping
-- this as an inlineable SQL function makes its plan observable in the PG16
-- harness and prevents a hidden per-product repository/query fan-out.
CREATE OR REPLACE FUNCTION saas.promotion_evaluator_candidate_facts(p_store_id uuid,p_context jsonb,p_now timestamptz,p_selected jsonb)
RETURNS TABLE(id uuid,name text,version bigint,rule_document jsonb,created_at timestamptz,used bigint,budget bigint,customer_used bigint,eligible_value bigint,gift_variant_valid boolean,selected_override boolean)
LANGUAGE sql STABLE SET search_path = pg_catalog, saas AS $fn$
  WITH lines AS MATERIALIZED (SELECT value line FROM pg_catalog.jsonb_array_elements(p_context->'cartLines')),
  candidates AS MATERIALIZED (
    SELECT p.id,p.name,p.version,p.rule_document,p.created_at,false selected_override
    FROM saas.promotions p
    WHERE p.store_id=p_store_id AND p.status IN ('active','scheduled')
      AND (p_selected IS NULL OR p.id<>(p_selected->>'id')::uuid)
    UNION ALL
    SELECT
      CASE WHEN saas.promotion_json_uuid(p_selected->'id') THEN (p_selected->>'id')::uuid END,
      p_selected->>'name',
      CASE WHEN saas.promotion_json_integer(p_selected->'version',1,9007199254740991) THEN (p_selected->>'version')::bigint END,
      p_selected->'ruleDocument',
      saas.promotion_safe_timestamptz(p_selected->>'createdAt'),
      true
    WHERE p_selected IS NOT NULL
      AND saas.promotion_json_keys(p_selected,ARRAY['id','name','version','ruleDocument','createdAt'],ARRAY['id','name','version','ruleDocument','createdAt'])
      AND saas.promotion_json_uuid(p_selected->'id')
      AND saas.promotion_json_integer(p_selected->'version',1,9007199254740991)
      AND saas.promotion_safe_timestamptz(p_selected->>'createdAt') IS NOT NULL
      AND pg_catalog.jsonb_typeof(p_selected->'name')='string'
      AND saas.promotion_rule_document_valid(p_selected->'ruleDocument')
  ),
  usage AS MATERIALIZED (
    SELECT candidate.id promotion_id,count(r.id) FILTER (WHERE r.status='committed' OR (r.status='reserved' AND r.expires_at>p_now))::bigint used,
      COALESCE(sum(r.reserved_budget_minor) FILTER (WHERE r.status='committed' OR (r.status='reserved' AND r.expires_at>p_now)),0)::bigint budget
    FROM candidates candidate
    LEFT JOIN saas.promotion_usage_reservations r ON r.store_id=p_store_id AND r.promotion_id=candidate.id
    GROUP BY candidate.id
  ), customer_usage AS MATERIALIZED (
    SELECT candidate.id promotion_id,count(r.id) FILTER (WHERE r.status='committed' OR (r.status='reserved' AND r.expires_at>p_now))::bigint used
    FROM candidates candidate
    LEFT JOIN saas.promotion_usage_reservations r ON r.store_id=p_store_id AND r.promotion_id=candidate.id
      AND p_context->'customerId'<>'null'::jsonb
      AND r.customer_id=CASE WHEN saas.promotion_json_uuid(p_context->'customerId') THEN (p_context->>'customerId')::uuid END
    GROUP BY candidate.id
  ), gift_variants AS MATERIALIZED (
    SELECT DISTINCT CASE
      WHEN p.rule_document->'benefit'->>'kind'='gift' THEN (p.rule_document->'benefit'->>'giftVariantId')::uuid
      ELSE (p.rule_document->'benefit'->'reward'->>'variantId')::uuid
    END variant_id
    FROM candidates p
    WHERE saas.promotion_rule_document_valid(p.rule_document)
      AND (p.rule_document->'benefit'->>'kind'='gift'
        OR (p.rule_document->'benefit'->>'kind'='buy_x_get_y' AND p.rule_document->'benefit'->'reward'->>'strategy'='specific_variant'))
  ), valid_gift_variants AS MATERIALIZED (
    SELECT gift.variant_id FROM gift_variants gift
    JOIN saas.product_variants variant ON variant.store_id=p_store_id AND variant.id=gift.variant_id AND variant.status='active'
    JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
  ), target_refs AS MATERIALIZED (
    SELECT candidate.id promotion_id,ref->>'kind' kind,(ref->>'id')::uuid reference_id
    FROM candidates candidate CROSS JOIN LATERAL (
      SELECT value ref FROM pg_catalog.jsonb_array_elements(candidate.rule_document->'targets'->'include')
      UNION ALL SELECT value ref FROM pg_catalog.jsonb_array_elements(candidate.rule_document->'targets'->'exclude')
    ) reference
  ), audience_refs AS MATERIALIZED (
    SELECT candidate.id promotion_id,candidate.rule_document->'audience'->>'mode' mode,value::uuid reference_id
    FROM candidates candidate CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(COALESCE(candidate.rule_document->'audience'->'referenceIds','[]'::jsonb)) value
  ), payment_refs AS MATERIALIZED (
    SELECT candidate.id promotion_id,value::uuid reference_id
    FROM candidates candidate CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(COALESCE(candidate.rule_document->'conditions'->'paymentMethodIds','[]'::jsonb)) value
  ), shipping_refs AS MATERIALIZED (
    SELECT candidate.id promotion_id,value::uuid reference_id
    FROM candidates candidate CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(COALESCE(candidate.rule_document->'conditions'->'shippingMethodIds','[]'::jsonb)) value
  ), invalid_references AS MATERIALIZED (
    SELECT reference.promotion_id FROM target_refs reference LEFT JOIN saas.products product ON product.store_id=p_store_id AND product.id=reference.reference_id AND product.status='active' AND product.archived_at IS NULL WHERE reference.kind='product' AND product.id IS NULL
    UNION
    SELECT reference.promotion_id FROM target_refs reference LEFT JOIN saas.product_variants variant ON variant.store_id=p_store_id AND variant.id=reference.reference_id AND variant.status='active' AND variant.archived_at IS NULL LEFT JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active' AND product.archived_at IS NULL WHERE reference.kind='variant' AND (variant.id IS NULL OR product.id IS NULL)
    UNION
    SELECT reference.promotion_id FROM target_refs reference LEFT JOIN saas.catalog_categories category ON category.store_id=p_store_id AND category.id=reference.reference_id AND category.status='active' AND category.archived_at IS NULL WHERE reference.kind='category' AND category.id IS NULL
    UNION
    SELECT reference.promotion_id FROM target_refs reference LEFT JOIN saas.catalog_admin_resources resource ON resource.store_id=p_store_id AND resource.id=reference.reference_id AND resource.resource_kind='brand' AND resource.status='active' AND resource.archived_at IS NULL WHERE reference.kind='brand' AND resource.id IS NULL
    UNION
    SELECT reference.promotion_id FROM target_refs reference LEFT JOIN saas.catalog_admin_resources resource ON resource.store_id=p_store_id AND resource.id=reference.reference_id AND resource.resource_kind='collection' AND resource.status='active' AND resource.archived_at IS NULL WHERE reference.kind='collection' AND resource.id IS NULL
    UNION
    SELECT reference.promotion_id FROM audience_refs reference LEFT JOIN saas.customer_tags tag ON tag.store_id=p_store_id AND tag.id=reference.reference_id AND tag.archived_at IS NULL WHERE reference.mode='customer_tags' AND tag.id IS NULL
    UNION
    SELECT reference.promotion_id FROM audience_refs reference LEFT JOIN saas.customer_segments segment ON segment.store_id=p_store_id AND segment.id=reference.reference_id AND segment.archived_at IS NULL WHERE reference.mode='customer_segments' AND segment.id IS NULL
    UNION
    SELECT reference.promotion_id FROM audience_refs reference LEFT JOIN saas.customers customer ON customer.store_id=p_store_id AND customer.id=reference.reference_id AND customer.status='active' AND customer.archived_at IS NULL WHERE reference.mode='masked_customers' AND customer.id IS NULL
    UNION
    SELECT reference.promotion_id FROM payment_refs reference LEFT JOIN saas.payment_methods method ON method.store_id=p_store_id AND method.id=reference.reference_id AND method.state='active' WHERE method.id IS NULL
    UNION
    SELECT reference.promotion_id FROM shipping_refs reference WHERE saas.promotion_shipping_method_current(p_store_id,reference.reference_id) IS NOT TRUE
    UNION
    SELECT candidate.id FROM candidates candidate LEFT JOIN valid_gift_variants variant ON variant.variant_id=(candidate.rule_document->'benefit'->>'giftVariantId')::uuid WHERE candidate.rule_document->'benefit'->>'kind'='gift' AND variant.variant_id IS NULL
    UNION
    SELECT candidate.id FROM candidates candidate LEFT JOIN valid_gift_variants variant ON variant.variant_id=(candidate.rule_document->'benefit'->'reward'->>'variantId')::uuid WHERE candidate.rule_document->'benefit'->>'kind'='buy_x_get_y' AND candidate.rule_document->'benefit'->'reward'->>'strategy'='specific_variant' AND variant.variant_id IS NULL
    UNION
    SELECT candidate.id FROM candidates candidate CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(candidate.rule_document->'benefit'->'reward'->'productIds') reference(value) LEFT JOIN saas.products product ON product.store_id=p_store_id AND product.id=reference.value::uuid AND product.status='active' AND product.archived_at IS NULL WHERE candidate.rule_document->'benefit'->>'kind'='buy_x_get_y' AND candidate.rule_document->'benefit'->'reward'->>'strategy'='selected_products_cheapest' AND product.id IS NULL
  ), aggregated AS MATERIALIZED (
    SELECT p.id,p.name,p.version,p.rule_document,p.created_at,p.selected_override,COALESCE(u.used,0)::bigint used,COALESCE(u.budget,0)::bigint budget,COALESCE(cu.used,0)::bigint customer_used,
      COALESCE(sum((l.line->>'unitPriceMinor')::bigint*(l.line->>'quantity')::bigint) FILTER (WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,p_context->>'currency',p.rule_document->'targets',l.line)),0)::bigint eligible_value,
      COALESCE(sum((l.line->>'quantity')::bigint) FILTER (WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,p_context->>'currency',p.rule_document->'targets',l.line)),0)::bigint eligible_quantity,
      COALESCE(sum(saas.promotion_evaluator_line_capacity(p.rule_document,l.line,0)) FILTER (WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,p_context->>'currency',p.rule_document->'targets',l.line)),0)::bigint eligible_margin,
      CASE WHEN p.rule_document->'benefit'->>'kind'<>'gift' THEN true ELSE EXISTS(SELECT 1 FROM valid_gift_variants gift WHERE gift.variant_id=(p.rule_document->'benefit'->>'giftVariantId')::uuid) END gift_variant_valid
    FROM candidates p LEFT JOIN lines l ON true LEFT JOIN usage u ON u.promotion_id=p.id LEFT JOIN customer_usage cu ON cu.promotion_id=p.id
    WHERE saas.promotion_rule_document_valid(p.rule_document)
      AND NOT EXISTS(SELECT 1 FROM invalid_references invalid WHERE invalid.promotion_id=p.id)
      AND (p.rule_document->'schedule'->>'startsAt' IS NULL OR (p.rule_document->'schedule'->>'startsAt')::timestamptz<=p_now)
      AND (p.rule_document->'schedule'->>'endsAt' IS NULL OR p_now<(p.rule_document->'schedule'->>'endsAt')::timestamptz)
    GROUP BY p.id,p.name,p.version,p.rule_document,p.created_at,p.selected_override,u.used,u.budget,cu.used
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
      WITH reward_base AS MATERIALIZED (
        SELECT l.line,(l.line->>'quantity')::bigint quantity,(l.line->>'unitPriceMinor')::bigint price,
          CASE WHEN a.rule_document->'benefit'->'reward'->>'strategy'='same_product_cheapest' THEN l.line->>'productId' ELSE '' END group_key
        FROM lines l WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,p_context->>'currency',a.rule_document->'targets',l.line)
          AND (a.rule_document->'benefit'->'reward'->>'strategy'<>'specific_variant' OR l.line->>'variantId'=a.rule_document->'benefit'->'reward'->>'variantId')
          AND (a.rule_document->'benefit'->'reward'->>'strategy'<>'selected_products_cheapest' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(a.rule_document->'benefit'->'reward'->'productIds') product(id) WHERE product.id=l.line->>'productId'))
      ), reward_lines AS MATERIALIZED (
        SELECT line,quantity,price,group_key,
          CASE WHEN group_key<>'' THEN sum(quantity) OVER (PARTITION BY group_key) ELSE a.eligible_quantity END total_quantity,
          sum(quantity) OVER (PARTITION BY group_key ORDER BY price,(line->>'position')::integer,line->>'lineId')-quantity prior_quantity
        FROM reward_base
      ), rewarded AS (
        SELECT *,
          pg_catalog.floor(total_quantity/((a.rule_document->'benefit'->>'buyQuantity')::bigint+(a.rule_document->'benefit'->>'receiveQuantity')::bigint))::bigint*(a.rule_document->'benefit'->>'receiveQuantity')::bigint reward_count
        FROM reward_lines
      )
      SELECT COALESCE(sum(price*LEAST(quantity,GREATEST(0,reward_count-prior_quantity))*(a.rule_document->'benefit'->>'discountPercentageBps')::bigint/10000),0)::bigint saving FROM rewarded
    ) xy ON a.rule_document->'benefit'->>'kind'='buy_x_get_y'
  )
  SELECT id,name,version,rule_document,created_at,used,budget,customer_used,eligible_value,gift_variant_valid,selected_override FROM ranked
  ORDER BY CASE rule_document->'benefit'->>'kind' WHEN 'percentage' THEN 1 WHEN 'fixed_amount' THEN 1 WHEN 'bundle_price' THEN 2 WHEN 'quantity_tiers' THEN 2 WHEN 'buy_x_get_y' THEN 2 WHEN 'free_shipping' THEN 3 ELSE 4 END,
    saving DESC,(rule_document->>'priority')::integer DESC,created_at,id
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_candidate_facts(p_store_id uuid,p_context jsonb,p_now timestamptz)
RETURNS TABLE(id uuid,name text,version bigint,rule_document jsonb,created_at timestamptz,used bigint,budget bigint,customer_used bigint,eligible_value bigint,gift_variant_valid boolean)
LANGUAGE sql STABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT id,name,version,rule_document,created_at,used,budget,customer_used,eligible_value,gift_variant_valid
  FROM saas.promotion_evaluator_candidate_facts(p_store_id,p_context,p_now,NULL)
$fn$;

SET LOCAL check_function_bodies = on;
-- Catalog authority is resolved exactly once for the bounded cart.  All
-- downstream candidate and allocation work operates on these trusted facts.
CREATE OR REPLACE FUNCTION saas.promotion_evaluator_materialize_lines(p_store_id uuid,p_currency text,p_context jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  WITH customer_authority AS MATERIALIZED (
    SELECT customer.email
    FROM saas.customers customer
    WHERE p_context->'customerId'<>'null'::jsonb
      AND customer.store_id=p_store_id
      AND customer.id=(p_context->>'customerId')::uuid
      AND customer.status='active' AND customer.archived_at IS NULL
  ), input_lines AS MATERIALIZED (
    SELECT value line FROM pg_catalog.jsonb_array_elements(p_context->'cartLines')
  ), catalog_lines AS MATERIALIZED (
    SELECT input_lines.line||pg_catalog.jsonb_build_object(
      'productId',product.id,'variantId',variant.id,
      'unitPriceMinor',resolved.price_cents,'unitCostMinor',variant.cost_cents,
      'currency',product.currency
    ) line,product.id product_id,variant.id variant_id
    FROM input_lines
    CROSS JOIN LATERAL (
      SELECT product_row.id,product_row.store_id,product_row.currency
      FROM saas.products product_row
      WHERE product_row.store_id=p_store_id AND product_row.id=(input_lines.line->>'productId')::uuid
        AND product_row.status='active' AND product_row.archived_at IS NULL AND product_row.currency=p_currency
      LIMIT 1 OFFSET 0
    ) product
    CROSS JOIN LATERAL (
      SELECT variant_row.id,variant_row.product_id,variant_row.store_id,variant_row.cost_cents
      FROM saas.product_variants variant_row
      WHERE variant_row.store_id=product.store_id AND variant_row.product_id=product.id
        AND variant_row.id=(input_lines.line->>'variantId')::uuid
        AND variant_row.status='active' AND variant_row.archived_at IS NULL
      LIMIT 1 OFFSET 0
    ) variant
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(
      p_store_id,variant.id,p_context->>'salesChannel',p_now,
      CASE WHEN p_context->>'salesChannel'='quick_order' THEN (SELECT email FROM customer_authority) ELSE NULL END
    ) resolved
    WHERE resolved.outcome='found' AND resolved.price_cents BETWEEN 0 AND 8000000000
  ), catalog_products AS MATERIALIZED (
    SELECT DISTINCT product_id FROM catalog_lines
  ), current_category_memberships AS MATERIALIZED (
    SELECT category.product_id,category.category_id
    FROM catalog_products product
    JOIN saas.catalog_product_categories category ON category.store_id=p_store_id AND category.product_id=product.product_id
    JOIN saas.catalog_categories current_category ON current_category.store_id=category.store_id AND current_category.id=category.category_id AND current_category.status='active' AND current_category.archived_at IS NULL
  ), category_facts AS MATERIALIZED (
    SELECT category.product_id,pg_catalog.jsonb_agg(category.category_id::text ORDER BY category.category_id) category_ids
    FROM current_category_memberships category
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

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_line_capacity(p_rule jsonb,p_line jsonb,p_prior_discount bigint)
RETURNS bigint LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE p_rule->'marginPolicy'->>'kind'
    WHEN 'floor_at_cost' THEN CASE WHEN p_line->>'unitCostMinor' IS NULL THEN 0 ELSE GREATEST(0,
      (p_line->>'unitPriceMinor')::bigint*(p_line->>'quantity')::bigint
      -(p_line->>'unitCostMinor')::bigint*(p_line->>'quantity')::bigint-p_prior_discount) END
    ELSE GREATEST(0,(p_line->>'unitPriceMinor')::bigint*(p_line->>'quantity')::bigint-p_prior_discount)
  END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_audience_facts(p_store_id uuid,p_context jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  WITH customer AS MATERIALIZED (
    SELECT customer_row.id
    FROM saas.customers customer_row
    WHERE p_context->'customerId'<>'null'::jsonb
      AND customer_row.store_id=p_store_id AND customer_row.id=(p_context->>'customerId')::uuid
      AND customer_row.status='active' AND customer_row.archived_at IS NULL
  )
  SELECT pg_catalog.jsonb_build_object(
    'firstPaidOrder',EXISTS(SELECT 1 FROM customer) AND NOT EXISTS(SELECT 1 FROM saas.orders order_row,customer WHERE order_row.store_id=p_store_id AND order_row.customer_id=customer.id AND (order_row.paid_at IS NOT NULL OR order_row.payment_status IN ('completed','refunded'))),
    'segmentIds',COALESCE((SELECT pg_catalog.jsonb_agg(membership.segment_id::text) FROM saas.customer_segment_memberships membership JOIN saas.customer_segments segment ON segment.store_id=membership.store_id AND segment.id=membership.segment_id AND segment.archived_at IS NULL,customer WHERE membership.store_id=p_store_id AND membership.customer_id=customer.id),'[]'::jsonb),
    'tagIds',COALESCE((SELECT pg_catalog.jsonb_agg(membership.tag_id::text) FROM saas.customer_tag_assignments membership JOIN saas.customer_tags tag ON tag.store_id=membership.store_id AND tag.id=membership.tag_id AND tag.archived_at IS NULL,customer WHERE membership.store_id=p_store_id AND membership.customer_id=customer.id),'[]'::jsonb),
    'activeCustomer',EXISTS(SELECT 1 FROM customer),
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

CREATE OR REPLACE FUNCTION saas.promotion_evaluate_internal_v1(p_store_id uuid,p_context jsonb,p_now timestamptz,p_selected jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_currency text:=p_context->>'currency'; v_lines jsonb:=COALESCE(p_context->'cartLines','[]'::jsonb); v_fact_context jsonb; v_subtotal bigint:=0; v_shipping bigint:=0; v_line_discount bigint:=0; v_shipping_discount bigint:=0; v_paid jsonb:='{}'::jsonb; v_candidate record; v_rule jsonb; v_benefit jsonb; v_saving bigint; v_eligible_value bigint; v_eligible_quantity bigint; v_available bigint; v_remaining_available bigint; v_cap bigint; v_bps integer; v_line jsonb; v_allocation_line record; v_reward_line record; v_bundle_line record; v_line_id text; v_line_value bigint; v_allocation bigint; v_remaining bigint; v_count integer; v_candidate_count bigint; v_index integer; v_normalized_code text; v_eligible jsonb:='[]'::jsonb; v_applied jsonb:='[]'::jsonb; v_applied_rules jsonb:='[]'::jsonb; v_rejected jsonb:='[]'::jsonb; v_effects jsonb:='[]'::jsonb; v_shipping_effects jsonb:='[]'::jsonb; v_gifts jsonb:='[]'::jsonb; v_used_non_shipping boolean:=false; v_kind text; v_line_quantity bigint; v_take bigint; v_bundle_quantity bigint; v_complete_quantity bigint;
BEGIN
  IF p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR saas.promotion_evaluator_context_valid(p_store_id,p_context) IS NOT TRUE THEN RETURN saas.promotion_evaluator_empty_result(v_currency,'promotion_context_unavailable'); END IF;
  SELECT count(*) INTO v_candidate_count FROM saas.promotions promotion
  WHERE promotion.store_id=p_store_id AND promotion.status IN ('active','scheduled')
    AND promotion.id IS DISTINCT FROM CASE WHEN saas.promotion_json_uuid(p_selected->'id') THEN (p_selected->>'id')::uuid END;
  v_candidate_count:=v_candidate_count+CASE WHEN p_selected IS NULL THEN 0 ELSE 1 END;
  IF v_candidate_count>100 THEN RETURN saas.promotion_evaluator_empty_result(v_currency,'promotion_configuration_limit_exceeded'); END IF;
  v_lines:=saas.promotion_evaluator_materialize_lines(p_store_id,v_currency,p_context,p_now);
  IF pg_catalog.jsonb_array_length(v_lines)<>pg_catalog.jsonb_array_length(p_context->'cartLines') THEN RETURN saas.promotion_evaluator_empty_result(v_currency,'promotion_context_unavailable'); END IF;
  SELECT COALESCE(sum((line->>'unitPriceMinor')::numeric*(line->>'quantity')::numeric),0) INTO v_subtotal FROM pg_catalog.jsonb_array_elements(v_lines) line;
  v_shipping:=(p_context->>'shippingBeforeDiscountMinor')::bigint;
  IF v_subtotal::numeric+v_shipping::numeric>8000000000 THEN RETURN saas.promotion_evaluator_empty_result(v_currency,'promotion_context_unavailable'); END IF;
  v_fact_context:=p_context||pg_catalog.jsonb_build_object('cartLines',v_lines,'audienceFacts',saas.promotion_evaluator_audience_facts(p_store_id,p_context,p_now),'codeFacts',saas.promotion_evaluator_code_facts(p_store_id,p_context));
  FOR v_candidate IN SELECT * FROM saas.promotion_evaluator_candidate_facts(p_store_id,v_fact_context,p_now,p_selected) LOOP
    v_rule:=v_candidate.rule_document; v_benefit:=v_rule->'benefit'; v_kind:=v_benefit->>'kind'; v_normalized_code:=NULL;
    IF v_rule->'trigger'->>'kind'='code' THEN
      IF v_candidate.selected_override THEN
        SELECT submitted.value INTO v_normalized_code
        FROM pg_catalog.jsonb_array_elements_text(v_fact_context->'submittedCodes') submitted(value)
        WHERE EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_rule->'trigger'->'codes') allowed(value) WHERE allowed.value=submitted.value)
        ORDER BY submitted.value LIMIT 1;
      ELSE v_normalized_code:=v_fact_context->'codeFacts'->>v_candidate.id::text;
      END IF;
      IF v_normalized_code IS NULL THEN CONTINUE; END IF;
    END IF;
    IF NOT saas.promotion_evaluator_audience_matches(p_store_id,v_rule->'audience',v_fact_context) THEN CONTINUE; END IF;
    SELECT COALESCE(sum((line->>'unitPriceMinor')::bigint*(line->>'quantity')::bigint),0),COALESCE(sum((line->>'quantity')::bigint),0) INTO v_eligible_value,v_eligible_quantity FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line);
    IF (v_rule->'limits'->>'perCustomerUsage') IS NOT NULL AND p_context->'customerId'='null'::jsonb THEN
      v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','customer_identity_required'));
      CONTINUE;
    END IF;
    IF v_rule->'marginPolicy'->>'kind'='floor_at_cost' AND EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_lines) line
      WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
        AND line->'unitCostMinor'='null'::jsonb
    ) THEN
      v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','margin_unknown_cost'));
      CONTINUE;
    END IF;
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
      WITH reward_base AS MATERIALIZED (
        SELECT line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
          CASE WHEN v_benefit->'reward'->>'strategy'='same_product_cheapest' THEN line->>'productId' ELSE '' END group_key
        FROM pg_catalog.jsonb_array_elements(v_lines) line
        WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
          AND (v_benefit->'reward'->>'strategy'<>'specific_variant' OR line->>'variantId'=v_benefit->'reward'->>'variantId')
          AND (v_benefit->'reward'->>'strategy'<>'selected_products_cheapest' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_benefit->'reward'->'productIds') id WHERE id=line->>'productId'))
      ), reward_lines AS MATERIALIZED (
        SELECT line,quantity,price,group_key,
          CASE WHEN group_key<>'' THEN sum(quantity) OVER (PARTITION BY group_key) ELSE v_eligible_quantity END total_quantity,
          sum(quantity) OVER (PARTITION BY group_key ORDER BY price,(line->>'position')::integer,line->>'lineId')-quantity prior_quantity
        FROM reward_base
      ), rewarded AS (
        SELECT *,
          pg_catalog.floor(total_quantity/((v_benefit->>'buyQuantity')::bigint+(v_benefit->>'receiveQuantity')::bigint))::bigint*(v_benefit->>'receiveQuantity')::bigint reward_count
        FROM reward_lines
      )
      SELECT COALESCE(sum(price*LEAST(quantity,GREATEST(0,reward_count-prior_quantity))*(v_benefit->>'discountPercentageBps')::bigint/10000),0) INTO v_saving FROM rewarded;
    ELSIF v_kind='gift' AND v_candidate.gift_variant_valid THEN v_saving:=0; ELSE CONTINUE; END IF;
    IF v_kind<>'gift' THEN v_saving:=LEAST(v_saving,COALESCE((v_rule->'limits'->>'orderMaximumMinor')::bigint,v_saving)); IF (v_rule->'limits'->>'budgetMinor') IS NOT NULL THEN v_saving:=LEAST(v_saving,GREATEST(0,(v_rule->'limits'->>'budgetMinor')::bigint-v_candidate.budget)); END IF; IF v_rule->'marginPolicy'->>'kind'='floor_at_cost' THEN SELECT COALESCE(sum(saas.promotion_evaluator_line_capacity(v_rule,line,COALESCE((v_paid->>(line->>'lineId'))::bigint,0))),0) INTO v_cap FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line); v_saving:=LEAST(v_saving,v_cap); ELSIF v_rule->'marginPolicy'->>'kind'='maximum_percentage' THEN v_saving:=LEAST(v_saving,v_eligible_value*(v_rule->'marginPolicy'->>'maximumPercentageBps')::integer/10000); END IF; END IF;
    IF v_kind='buy_x_get_y' THEN
      WITH reward_base AS MATERIALIZED (
        SELECT line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
          CASE WHEN v_benefit->'reward'->>'strategy'='same_product_cheapest' THEN line->>'productId' ELSE '' END group_key
        FROM pg_catalog.jsonb_array_elements(v_lines) line
        WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
          AND (v_benefit->'reward'->>'strategy'<>'specific_variant' OR line->>'variantId'=v_benefit->'reward'->>'variantId')
          AND (v_benefit->'reward'->>'strategy'<>'selected_products_cheapest' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_benefit->'reward'->'productIds') id WHERE id=line->>'productId'))
      ), reward_lines AS MATERIALIZED (
        SELECT line,quantity,price,group_key,
          CASE WHEN group_key<>'' THEN sum(quantity) OVER (PARTITION BY group_key) ELSE v_eligible_quantity END total_quantity,
          sum(quantity) OVER (PARTITION BY group_key ORDER BY price,(line->>'position')::integer,line->>'lineId')-quantity prior_quantity
        FROM reward_base
      ), rewarded AS (
        SELECT *,
          pg_catalog.floor(total_quantity/((v_benefit->>'buyQuantity')::bigint+(v_benefit->>'receiveQuantity')::bigint))::bigint*(v_benefit->>'receiveQuantity')::bigint reward_count
        FROM reward_lines
      )
      SELECT COALESCE(sum(LEAST(price*LEAST(quantity,GREATEST(0,reward_count-prior_quantity))*(v_benefit->>'discountPercentageBps')::bigint/10000,saas.promotion_evaluator_line_capacity(v_rule,line,COALESCE((v_paid->>(line->>'lineId'))::bigint,0)))),0)
      INTO v_available FROM rewarded;
      v_saving:=LEAST(v_saving,v_available);
    END IF;
    IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_applied_rules) prior WHERE NOT saas.promotion_combination_compatible(prior,v_rule)) THEN v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','not_combinable')); CONTINUE; END IF;
    IF v_saving=0 AND v_kind<>'gift' THEN v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','not_eligible')); CONTINUE; END IF;
    IF v_kind='free_shipping' THEN v_shipping_discount:=v_shipping_discount+v_saving; v_shipping_effects:=v_shipping_effects||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'discountMinor',v_saving));
    ELSIF v_kind='gift' THEN v_gifts:=v_gifts||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'variantId',v_benefit->>'giftVariantId','quantity',1,'paidMinor',0));
    ELSIF v_kind='buy_x_get_y' THEN
      v_remaining:=v_saving;
      FOR v_reward_line IN
        WITH reward_base AS MATERIALIZED (
          SELECT line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
            CASE WHEN v_benefit->'reward'->>'strategy'='same_product_cheapest' THEN line->>'productId' ELSE '' END group_key
          FROM pg_catalog.jsonb_array_elements(v_lines) line
          WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
            AND (v_benefit->'reward'->>'strategy'<>'specific_variant' OR line->>'variantId'=v_benefit->'reward'->>'variantId')
            AND (v_benefit->'reward'->>'strategy'<>'selected_products_cheapest' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_benefit->'reward'->'productIds') id WHERE id=line->>'productId'))
        ), reward_lines AS MATERIALIZED (
          SELECT line,quantity,price,group_key,
            CASE WHEN group_key<>'' THEN sum(quantity) OVER (PARTITION BY group_key) ELSE v_eligible_quantity END total_quantity,
            sum(quantity) OVER (PARTITION BY group_key ORDER BY price,(line->>'position')::integer,line->>'lineId')-quantity prior_quantity
          FROM reward_base
        ), rewarded AS (
          SELECT *,
            pg_catalog.floor(total_quantity/((v_benefit->>'buyQuantity')::bigint+(v_benefit->>'receiveQuantity')::bigint))::bigint*(v_benefit->>'receiveQuantity')::bigint reward_count
          FROM reward_lines
        )
        SELECT line,LEAST(quantity,GREATEST(0,reward_count-prior_quantity)) take_quantity FROM rewarded WHERE reward_count>prior_quantity ORDER BY group_key,price,(line->>'position')::integer,line->>'lineId'
      LOOP
        v_line_id:=v_reward_line.line->>'lineId'; v_take:=v_reward_line.take_quantity; v_line_value:=LEAST((v_reward_line.line->>'unitPriceMinor')::bigint*v_take*(v_benefit->>'discountPercentageBps')::bigint/10000,saas.promotion_evaluator_line_capacity(v_rule,v_reward_line.line,COALESCE((v_paid->>v_line_id)::bigint,0)));
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
      ), allocation_lines AS MATERIALIZED (
        SELECT line,LEAST(
          price*LEAST(quantity,GREATEST(0,v_complete_quantity-prior_quantity)),
          saas.promotion_evaluator_line_capacity(v_rule,line,COALESCE((v_paid->>(line->>'lineId'))::bigint,0))
        )::bigint line_value
        FROM ordered WHERE prior_quantity<v_complete_quantity
      )
      SELECT COALESCE(sum(line_value),0),count(*) INTO v_available,v_count FROM allocation_lines WHERE line_value>0;
      v_saving:=LEAST(v_saving,v_available);
      IF v_saving<=0 OR v_available<=0 THEN v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','not_eligible')); CONTINUE; END IF;
      v_remaining:=v_saving; v_remaining_available:=v_available;
      FOR v_bundle_line IN
        WITH ordered AS MATERIALIZED (
          SELECT line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
            sum((line->>'quantity')::bigint) OVER (ORDER BY (line->>'position')::integer,line->>'lineId')-(line->>'quantity')::bigint prior_quantity
          FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
        ), allocation_lines AS MATERIALIZED (
          SELECT line,LEAST(
            price*LEAST(quantity,GREATEST(0,v_complete_quantity-prior_quantity)),
            saas.promotion_evaluator_line_capacity(v_rule,line,COALESCE((v_paid->>(line->>'lineId'))::bigint,0))
          )::bigint line_value
          FROM ordered WHERE prior_quantity<v_complete_quantity
        ) SELECT line,line_value FROM allocation_lines WHERE line_value>0 ORDER BY (line->>'position')::integer,line->>'lineId'
      LOOP
        v_line_id:=v_bundle_line.line->>'lineId'; v_line_value:=v_bundle_line.line_value;
        v_allocation:=CASE WHEN v_remaining_available=v_line_value THEN v_remaining ELSE LEAST(v_line_value,pg_catalog.floor(v_remaining::numeric*v_line_value::numeric/v_remaining_available::numeric)::bigint) END;
        v_remaining:=v_remaining-v_allocation; v_remaining_available:=v_remaining_available-v_line_value;
        IF v_allocation>0 THEN v_effects:=v_effects||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'lineId',v_line_id,'discountMinor',v_allocation,'giftQuantity',0)); v_paid:=pg_catalog.jsonb_set(v_paid,ARRAY[v_line_id],pg_catalog.to_jsonb(COALESCE((v_paid->>v_line_id)::bigint,0)+v_allocation),true); END IF;
        EXIT WHEN v_remaining=0;
      END LOOP;
      v_line_discount:=v_line_discount+v_saving; v_used_non_shipping:=true;
    ELSE
      WITH allocation_lines AS MATERIALIZED (
        SELECT line,saas.promotion_evaluator_line_capacity(v_rule,line,COALESCE((v_paid->>(line->>'lineId'))::bigint,0))::bigint line_value
        FROM pg_catalog.jsonb_array_elements(v_lines) line
        WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
      ) SELECT COALESCE(sum(line_value),0),count(*) INTO v_available,v_count FROM allocation_lines WHERE line_value>0;
      v_saving:=LEAST(v_saving,v_available);
      IF v_saving<=0 OR v_available<=0 THEN v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','not_eligible')); CONTINUE; END IF;
      v_remaining:=v_saving; v_remaining_available:=v_available;
      FOR v_allocation_line IN
        WITH allocation_lines AS MATERIALIZED (
          SELECT line,saas.promotion_evaluator_line_capacity(v_rule,line,COALESCE((v_paid->>(line->>'lineId'))::bigint,0))::bigint line_value
          FROM pg_catalog.jsonb_array_elements(v_lines) line
          WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
        ) SELECT line,line_value FROM allocation_lines WHERE line_value>0 ORDER BY (line->>'position')::integer,line->>'lineId'
      LOOP
        v_line_id:=v_allocation_line.line->>'lineId'; v_line_value:=v_allocation_line.line_value;
        v_allocation:=CASE WHEN v_remaining_available=v_line_value THEN v_remaining ELSE LEAST(v_line_value,pg_catalog.floor(v_remaining::numeric*v_line_value::numeric/v_remaining_available::numeric)::bigint) END;
        v_remaining:=v_remaining-v_allocation; v_remaining_available:=v_remaining_available-v_line_value;
        IF v_allocation>0 THEN v_effects:=v_effects||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'lineId',v_line_id,'discountMinor',v_allocation,'giftQuantity',0)); v_paid:=pg_catalog.jsonb_set(v_paid,ARRAY[v_line_id],pg_catalog.to_jsonb(COALESCE((v_paid->>v_line_id)::bigint,0)+v_allocation),true); END IF;
        EXIT WHEN v_remaining=0;
      END LOOP;
      v_line_discount:=v_line_discount+v_saving; v_used_non_shipping:=true;
    END IF;
    v_applied:=v_applied||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'version',v_candidate.version,'name',v_candidate.name,'benefitKind',v_kind,'lineDiscountMinor',CASE WHEN v_kind IN ('free_shipping','gift') THEN 0 ELSE v_saving END,'shippingDiscountMinor',CASE WHEN v_kind='free_shipping' THEN v_saving ELSE 0 END,'discountTotalMinor',CASE WHEN v_kind='gift' THEN 0 ELSE v_saving END)||CASE WHEN v_normalized_code IS NULL THEN '{}'::jsonb ELSE pg_catalog.jsonb_build_object('normalizedCode',v_normalized_code) END);
    v_applied_rules:=v_applied_rules||pg_catalog.jsonb_build_array(v_rule);
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('eligiblePromotionIds',v_eligible,'appliedPromotions',v_applied,'rejectedPromotions',v_rejected,'lineEffects',v_effects,'shippingEffects',v_shipping_effects,'gifts',v_gifts,'subtotalBeforeDiscountMinor',v_subtotal,'lineDiscountTotalMinor',v_line_discount,'shippingBeforeDiscountMinor',v_shipping,'shippingDiscountTotalMinor',v_shipping_discount,'discountTotalMinor',v_line_discount+v_shipping_discount,'grandTotalMinor',v_subtotal-v_line_discount+v_shipping-v_shipping_discount,'currency',v_currency,'progressMessages','[]'::jsonb,'merchantExplanation','evaluated');
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluate_v1(p_store_id uuid,p_context jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT saas.promotion_evaluate_internal_v1(p_store_id,p_context,p_now,NULL)
$fn$;

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
  SELECT
    CASE left_policy->>'kind'
      WHEN 'shipping_only' THEN left_kind='free_shipping' OR right_kind='free_shipping'
      WHEN 'benefit_classes' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(left_policy->'benefitClasses') item WHERE item=right_kind)
      ELSE false END
    AND
    CASE right_policy->>'kind'
      WHEN 'shipping_only' THEN right_kind='free_shipping' OR left_kind='free_shipping'
      WHEN 'benefit_classes' THEN EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(right_policy->'benefitClasses') item WHERE item=left_kind)
      ELSE false END
  FROM policies,kinds
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
  IF p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE THEN RETURN 'invalid_input'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('promotions.read','promotions.manage','promotions.archive') THEN RETURN 'durable_authority_invalid'; END IF;
  v_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions',p_action);
  RETURN v_error;
END $fn$;

-- Every promotion mutation and recovery operation uses this exact lock order:
-- operation advisory lock, store, membership, subscription, plan, feature,
-- authority recheck, and only then operation/business rows in the caller.
CREATE OR REPLACE FUNCTION saas.promotion_operation_authority_lock_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_action text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL THEN RETURN 'durable_authority_invalid'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-operation:'||p_store_id::text||':'||p_operation_id::text,0));
  PERFORM 1 FROM saas.stores store_row WHERE store_row.id=p_store_id FOR SHARE;
  PERFORM 1 FROM saas.memberships membership WHERE membership.id=p_membership_id AND membership.store_id=p_store_id AND membership.principal_id=p_principal_id FOR SHARE;
  PERFORM 1 FROM saas.subscriptions subscription WHERE subscription.store_id=p_store_id AND subscription.plan_id=p_plan_id AND subscription.plan_code=p_plan_code AND subscription.plan_version=p_plan_version FOR SHARE;
  PERFORM 1 FROM saas.plans plan WHERE plan.id=p_plan_id AND plan.plan_code=p_plan_code AND plan.version=p_plan_version FOR SHARE;
  PERFORM 1 FROM saas.plan_features feature WHERE feature.plan_id=p_plan_id AND feature.feature_key='promotions' ORDER BY feature.feature_ordinal,feature.feature_key FOR SHARE;
  RETURN saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_action);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_projection(p_store_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT pg_catalog.jsonb_build_object('id',p.id,'version',p.version,'name',p.name,'status',p.status,'ruleDocument',p.rule_document,'createdAt',pg_catalog.to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updatedAt',pg_catalog.to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) FROM saas.promotions p WHERE p.store_id=p_store_id AND p.id=p_id
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_catalog_reference_matches_variant_v1(p_store_id uuid,p_reference jsonb,p_product_id uuid,p_variant_id uuid)
RETURNS boolean LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE p_reference->>'kind'
    WHEN 'product' THEN p_reference->>'id'=p_product_id::text
    WHEN 'variant' THEN p_reference->>'id'=p_variant_id::text
    WHEN 'category' THEN EXISTS(
      SELECT 1 FROM saas.catalog_product_categories membership
      JOIN saas.catalog_categories category ON category.store_id=membership.store_id AND category.id=membership.category_id
      WHERE membership.store_id=p_store_id AND membership.product_id=p_product_id
        AND category.id=(p_reference->>'id')::uuid AND category.status='active' AND category.archived_at IS NULL
    )
    WHEN 'brand' THEN EXISTS(
      SELECT 1 FROM saas.catalog_admin_resource_products membership
      JOIN saas.catalog_admin_resources resource ON resource.store_id=membership.store_id AND resource.id=membership.resource_id
      WHERE membership.store_id=p_store_id AND membership.product_id=p_product_id
        AND resource.id=(p_reference->>'id')::uuid AND resource.resource_kind='brand' AND resource.status='active' AND resource.archived_at IS NULL
    )
    WHEN 'collection' THEN EXISTS(
      SELECT 1 FROM saas.catalog_admin_resource_products membership
      JOIN saas.catalog_admin_resources resource ON resource.store_id=membership.store_id AND resource.id=membership.resource_id
      WHERE membership.store_id=p_store_id AND membership.product_id=p_product_id
        AND resource.id=(p_reference->>'id')::uuid AND resource.resource_kind='collection' AND resource.status='active' AND resource.archived_at IS NULL
    )
    ELSE false END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_variant_matches_targets_v1(p_store_id uuid,p_targets jsonb,p_product_id uuid,p_variant_id uuid)
RETURNS boolean LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT
    (p_targets->>'mode'='all' OR EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_targets->'include') reference
      WHERE saas.promotion_catalog_reference_matches_variant_v1(p_store_id,reference,p_product_id,p_variant_id)
    ))
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_targets->'exclude') reference
      WHERE saas.promotion_catalog_reference_matches_variant_v1(p_store_id,reference,p_product_id,p_variant_id)
    )
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_definition_variant_facts_v1(p_store_id uuid,p_document jsonb,p_now timestamptz)
RETURNS TABLE(variant_id uuid,product_id uuid,currency text,price_minor bigint,cost_minor bigint,stock_tracking boolean,stock_quantity bigint)
LANGUAGE sql STABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT variant.id,product.id,product.currency,resolved.price_cents,variant.cost_cents,variant.stock_tracking,variant.stock_quantity
  FROM saas.products product
  JOIN saas.product_variants variant ON variant.store_id=product.store_id AND variant.product_id=product.id
  CROSS JOIN LATERAL saas.resolve_effective_variant_price(p_store_id,variant.id,'storefront',p_now,NULL) resolved
  WHERE product.store_id=p_store_id AND product.status='active' AND product.archived_at IS NULL
    AND variant.status='active' AND variant.archived_at IS NULL
    AND resolved.outcome='found' AND resolved.price_cents BETWEEN 0 AND 8000000000
    AND saas.promotion_variant_matches_targets_v1(p_store_id,p_document->'targets',product.id,variant.id)
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_definition_windows_overlap_v1(p_left jsonb,p_right jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT
    (p_left->'schedule'->>'endsAt' IS NULL OR p_right->'schedule'->>'startsAt' IS NULL OR (p_left->'schedule'->>'endsAt')::timestamptz>(p_right->'schedule'->>'startsAt')::timestamptz)
    AND
    (p_right->'schedule'->>'endsAt' IS NULL OR p_left->'schedule'->>'startsAt' IS NULL OR (p_right->'schedule'->>'endsAt')::timestamptz>(p_left->'schedule'->>'startsAt')::timestamptz)
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_definition_dimensions_overlap_v1(p_store_id uuid,p_left jsonb,p_right jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
BEGIN
  IF p_left->'conditions'->'salesChannels' IS NOT NULL AND p_right->'conditions'->'salesChannels' IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_left->'conditions'->'salesChannels') left_value(value)
    JOIN pg_catalog.jsonb_array_elements_text(p_right->'conditions'->'salesChannels') right_value(value) USING(value)
  ) THEN RETURN false; END IF;
  IF p_left->'conditions'->'paymentMethodIds' IS NOT NULL AND p_right->'conditions'->'paymentMethodIds' IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_left->'conditions'->'paymentMethodIds') left_value(value)
    JOIN pg_catalog.jsonb_array_elements_text(p_right->'conditions'->'paymentMethodIds') right_value(value) USING(value)
  ) THEN RETURN false; END IF;
  IF p_left->'conditions'->'shippingMethodIds' IS NOT NULL AND p_right->'conditions'->'shippingMethodIds' IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_left->'conditions'->'shippingMethodIds') left_value(value)
    JOIN pg_catalog.jsonb_array_elements_text(p_right->'conditions'->'shippingMethodIds') right_value(value) USING(value)
  ) THEN RETURN false; END IF;
  RETURN EXISTS(
    SELECT 1
    FROM saas.products product
    JOIN saas.product_variants variant ON variant.store_id=product.store_id AND variant.product_id=product.id
    WHERE product.store_id=p_store_id
      AND product.status='active' AND product.archived_at IS NULL
      AND variant.status='active' AND variant.archived_at IS NULL
      AND saas.promotion_variant_matches_targets_v1(p_store_id,p_left->'targets',product.id,variant.id)
      AND saas.promotion_variant_matches_targets_v1(p_store_id,p_right->'targets',product.id,variant.id)
    LIMIT 1
  );
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_conflict_projection_v1(p_store_id uuid,p_now timestamptz,p_document jsonb,p_exclude_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, saas AS $fn$
DECLARE v_findings jsonb; v_count bigint; v_store_currency text; v_kind text:=p_document->'benefit'->>'kind';
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR saas.promotion_rule_document_valid(p_document) IS NOT TRUE THEN RETURN NULL; END IF;
  IF saas.promotion_definition_references_valid(p_store_id,p_document) IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object('blocking',true,'findings',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('code','reference_unavailable','severity','blocking','relatedPromotionId',NULL,'relatedPromotionName',NULL)));
  END IF;
  SELECT store_row.currency INTO v_store_currency FROM saas.stores store_row WHERE store_row.id=p_store_id AND store_row.status='active';
  IF v_store_currency IS NULL THEN RETURN NULL; END IF;
  WITH blocker_codes(code) AS (
    SELECT 'benefit_currency_mismatch' WHERE v_kind IN ('fixed_amount','bundle_price') AND p_document->'benefit'->>'currency'<>v_store_currency
    UNION ALL SELECT 'budget_zero' WHERE p_document->'limits'->>'budgetMinor'='0'
    UNION ALL SELECT 'coupon_code_conflict' WHERE p_document->'trigger'->>'kind'='code' AND EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_document->'trigger'->'codes') desired(code)
      JOIN saas.promotion_codes existing ON existing.store_id=p_store_id AND existing.code=desired.code
      WHERE p_exclude_id IS NULL OR existing.promotion_id<>p_exclude_id OR existing.batch_id IS NOT NULL OR existing.status='revoked'
    )
    UNION ALL SELECT 'customer_usage_limit_zero' WHERE p_document->'limits'->>'perCustomerUsage'='0'
    UNION ALL SELECT 'gift_stock_unavailable' WHERE v_kind='gift' AND EXISTS(
      SELECT 1 FROM saas.product_variants variant
      WHERE variant.store_id=p_store_id AND variant.id=(p_document->'benefit'->>'giftVariantId')::uuid
        AND variant.stock_tracking AND saas.storefront_available_stock(p_store_id,variant.id,p_now,NULL)<1
    )
    UNION ALL SELECT 'margin_percentage_zero' WHERE v_kind<>'gift' AND p_document->'marginPolicy'->>'kind'='maximum_percentage' AND p_document->'marginPolicy'->>'maximumPercentageBps'='0'
    UNION ALL SELECT 'no_eligible_catalog_items' WHERE v_kind NOT IN ('free_shipping','gift') AND NOT EXISTS(SELECT 1 FROM saas.promotion_definition_variant_facts_v1(p_store_id,p_document,p_now))
    UNION ALL SELECT 'order_maximum_zero' WHERE v_kind<>'gift' AND p_document->'limits'->>'orderMaximumMinor'='0'
    UNION ALL SELECT 'schedule_ended' WHERE p_document->'schedule'->>'endsAt' IS NOT NULL AND (p_document->'schedule'->>'endsAt')::timestamptz<=p_now
    UNION ALL SELECT 'target_include_exclude_conflict' WHERE EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_document->'targets'->'include') included
      JOIN pg_catalog.jsonb_array_elements(p_document->'targets'->'exclude') excluded ON included=excluded
    )
    UNION ALL SELECT 'usage_limit_zero' WHERE p_document->'limits'->>'totalUsage'='0'
  ), blockers AS MATERIALIZED (
    SELECT code,'blocking'::text severity,NULL::uuid related_id,NULL::text related_name FROM blocker_codes
  )
  SELECT count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code',code,'severity',severity,'relatedPromotionId',related_id,'relatedPromotionName',related_name) ORDER BY code),'[]'::jsonb)
  INTO v_count,v_findings FROM blockers;
  IF v_count>100 THEN RETURN NULL; END IF;
  IF v_count>0 THEN RETURN pg_catalog.jsonb_build_object('blocking',true,'findings',v_findings); END IF;

  WITH warning_rows AS MATERIALIZED (
    SELECT 'schedule_target_overlap'::text code,'warning'::text severity,promotion.id related_id,promotion.name related_name
    FROM saas.promotions promotion
    WHERE promotion.store_id=p_store_id AND promotion.status IN ('active','scheduled') AND promotion.id IS DISTINCT FROM p_exclude_id
      AND saas.promotion_definition_references_valid(p_store_id,promotion.rule_document)
      AND saas.promotion_definition_windows_overlap_v1(p_document,promotion.rule_document)
      AND saas.promotion_definition_dimensions_overlap_v1(p_store_id,p_document,promotion.rule_document)
      AND (promotion.rule_document->'schedule'->>'endsAt' IS NULL OR (promotion.rule_document->'schedule'->>'endsAt')::timestamptz>p_now)
    UNION ALL
    SELECT 'discount_may_exceed_item_price','warning',NULL::uuid,NULL::text
    WHERE v_kind='fixed_amount' AND EXISTS(
      SELECT 1 FROM saas.promotion_definition_variant_facts_v1(p_store_id,p_document,p_now) fact
      WHERE (p_document->'benefit'->>'amountMinor')::bigint>fact.price_minor
    )
  )
  SELECT count(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code',code,'severity',severity,'relatedPromotionId',related_id,'relatedPromotionName',related_name) ORDER BY code,related_id),'[]'::jsonb)
  INTO v_count,v_findings FROM warning_rows;
  IF v_count>100 THEN RETURN NULL; END IF;
  RETURN pg_catalog.jsonb_build_object('blocking',false,'findings',v_findings);
EXCEPTION WHEN others THEN RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_margin_projection_v1(p_store_id uuid,p_now timestamptz,p_document jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, saas AS $fn$
DECLARE v_result jsonb;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR saas.promotion_rule_document_valid(p_document) IS NOT TRUE THEN RETURN NULL; END IF;
  WITH facts AS MATERIALIZED (
    SELECT fact.*,
      CASE p_document->'benefit'->>'kind'
        WHEN 'percentage' THEN fact.price_minor*(p_document->'benefit'->>'percentageBps')::bigint/10000
        WHEN 'fixed_amount' THEN CASE WHEN fact.currency=p_document->'benefit'->>'currency' THEN LEAST(fact.price_minor,(p_document->'benefit'->>'amountMinor')::bigint) ELSE 0 END
        WHEN 'quantity_tiers' THEN fact.price_minor*COALESCE((SELECT max((tier->>'percentageBps')::bigint) FROM pg_catalog.jsonb_array_elements(p_document->'benefit'->'tiers') tier),0)/10000
        WHEN 'bundle_price' THEN CASE WHEN fact.currency=p_document->'benefit'->>'currency' THEN GREATEST(0,fact.price_minor-(p_document->'benefit'->>'bundlePriceMinor')::bigint/(p_document->'benefit'->>'bundleQuantity')::bigint) ELSE 0 END
        WHEN 'buy_x_get_y' THEN fact.price_minor*(p_document->'benefit'->>'discountPercentageBps')::bigint/10000
        ELSE 0 END advertised_discount
    FROM saas.promotion_definition_variant_facts_v1(p_store_id,p_document,p_now) fact
    WHERE p_document->'benefit'->>'kind' NOT IN ('free_shipping','gift')
  ), capped AS MATERIALIZED (
    SELECT facts.*,CASE WHEN p_document->'marginPolicy'->>'kind'='maximum_percentage'
      THEN LEAST(advertised_discount,price_minor*(p_document->'marginPolicy'->>'maximumPercentageBps')::bigint/10000)
      ELSE advertised_discount END effective_discount
    FROM facts
  ), aggregate AS MATERIALIZED (
    SELECT count(*)::bigint evaluated_count,count(cost_minor)::bigint known_count,count(*) FILTER (WHERE cost_minor IS NULL)::bigint unknown_count,
      count(*) FILTER (WHERE cost_minor IS NOT NULL AND price_minor-effective_discount<cost_minor)::bigint risk_count
    FROM capped
  ), findings AS MATERIALIZED (
    SELECT 'below_cost_risk'::text code,'warning'::text severity,(SELECT risk_count FROM aggregate) finding_count,
      COALESCE((SELECT pg_catalog.jsonb_agg(variant_id ORDER BY variant_id) FROM (SELECT variant_id FROM capped WHERE cost_minor IS NOT NULL AND price_minor-effective_discount<cost_minor ORDER BY variant_id LIMIT 20) sample),'[]'::jsonb) sample_ids
    WHERE (SELECT risk_count FROM aggregate)>0
    UNION ALL
    SELECT 'cost_unknown','warning',(SELECT unknown_count FROM aggregate),
      COALESCE((SELECT pg_catalog.jsonb_agg(variant_id ORDER BY variant_id) FROM (SELECT variant_id FROM capped WHERE cost_minor IS NULL ORDER BY variant_id LIMIT 20) sample),'[]'::jsonb)
    WHERE (SELECT unknown_count FROM aggregate)>0
  )
  SELECT CASE WHEN aggregate.evaluated_count>1000000000 OR aggregate.known_count>1000000000 OR aggregate.unknown_count>1000000000 OR aggregate.risk_count>1000000000 THEN NULL ELSE
    pg_catalog.jsonb_build_object(
      'blocking',false,
      'status',CASE WHEN aggregate.risk_count>0 THEN 'warning' WHEN aggregate.unknown_count>0 THEN 'unknown' ELSE 'clear' END,
      'summary',pg_catalog.jsonb_build_object('evaluatedVariantCount',aggregate.evaluated_count,'knownCostVariantCount',aggregate.known_count,'unknownCostVariantCount',aggregate.unknown_count,'atRiskVariantCount',aggregate.risk_count),
      'findings',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code',code,'severity',severity,'count',finding_count,'sampleVariantIds',sample_ids) ORDER BY code) FROM findings),'[]'::jsonb)
    ) END INTO v_result FROM aggregate;
  RETURN v_result;
EXCEPTION WHEN others THEN RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_record_operation(p_store_id uuid,p_operation_id uuid,p_kind text,p_fingerprint text,p_result jsonb,p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_entity_kind text; v_entity_id uuid;
BEGIN
  v_entity_kind:=saas.promotion_operation_entity_kind(p_kind);
  v_entity_id:=saas.promotion_operation_entity_id(p_kind,p_result);
  IF p_store_id IS NULL OR p_operation_id IS NULL OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR v_entity_kind IS NULL OR v_entity_id IS NULL OR saas.promotion_operation_result_valid(p_kind,p_result) IS NOT TRUE THEN
    RAISE EXCEPTION 'promotion operation result invalid';
  END IF;
  INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at)
  VALUES (p_operation_id,p_store_id,p_operation_id,p_kind,p_fingerprint,v_entity_kind,v_entity_id,p_result,p_now);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_create_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_promotion_id uuid,p_name text,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_operation saas.promotion_operations%ROWTYPE; v_result jsonb; v_failure text;
BEGIN
  IF p_promotion_id IS NULL OR p_operation_id IS NULL OR p_fingerprint IS DISTINCT FROM saas.promotion_operation_fingerprint_v2('create',p_store_id,pg_catalog.jsonb_build_object('name',p_name,'ruleDocument',p_rule_document)) OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR pg_catalog.length(p_name) NOT BETWEEN 1 AND 200 OR pg_catalog.octet_length(p_name)>800 OR p_name~'[[:cntrl:]]' OR saas.promotion_rule_document_valid(p_rule_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'create' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF saas.promotion_operation_result_valid('create',v_operation.result_payload) IS NOT TRUE OR v_operation.result_entity_kind<>'promotion' OR v_operation.result_entity_id IS DISTINCT FROM saas.promotion_operation_entity_id('create',v_operation.result_payload) THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF;
    RETURN;
  END IF;
  IF saas.promotion_lock_definition_references(p_store_id,p_rule_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb; RETURN; END IF;
  BEGIN
    INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES(p_promotion_id,p_store_id,p_name,'draft',1,p_rule_document,p_now,p_now) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'promotion_mutation:conflict'; END IF;
    v_error:=saas.promotion_sync_direct_codes(p_store_id,p_promotion_id,p_rule_document,p_now);
    IF v_error IS NOT NULL THEN RAISE EXCEPTION 'promotion_mutation:%',v_error; END IF;
    PERFORM saas.promotion_materialize_targets(p_store_id,p_promotion_id,p_rule_document);
    INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_promotion_id,1,p_rule_document,p_now);
    v_result:=saas.promotion_projection(p_store_id,p_promotion_id);
    PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'create',p_fingerprint,v_result,p_now);
    INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at) VALUES(p_operation_id,p_store_id,p_promotion_id,p_principal_id,'created',pg_catalog.jsonb_build_object('version',1),p_now);
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_failure=MESSAGE_TEXT;
    IF v_failure LIKE 'promotion_mutation:%' THEN RETURN QUERY SELECT pg_catalog.substr(v_failure,20),NULL::jsonb; RETURN; END IF;
    RAISE;
  END;
  RETURN QUERY SELECT 'created',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_update_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_promotion_id uuid,p_expected_version bigint,p_name text,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_observed saas.promotions%ROWTYPE; v_current saas.promotions%ROWTYPE; v_operation saas.promotion_operations%ROWTYPE; v_result jsonb; v_readiness jsonb; v_failure text; v_used bigint:=0; v_budget bigint:=0;
BEGIN
  IF p_promotion_id IS NULL OR p_operation_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_fingerprint IS DISTINCT FROM saas.promotion_operation_fingerprint_v2('update',p_store_id,pg_catalog.jsonb_build_object('id',p_promotion_id,'expectedVersion',p_expected_version,'name',p_name,'ruleDocument',p_rule_document)) OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR pg_catalog.length(p_name) NOT BETWEEN 1 AND 200 OR pg_catalog.octet_length(p_name)>800 OR p_name~'[[:cntrl:]]' OR saas.promotion_rule_document_valid(p_rule_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'update' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF saas.promotion_operation_result_valid('update',v_operation.result_payload) IS NOT TRUE OR v_operation.result_entity_kind<>'promotion' OR v_operation.result_entity_id IS DISTINCT FROM saas.promotion_operation_entity_id('update',v_operation.result_payload) THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF;
    RETURN;
  END IF;
  -- Observe without a row lock, acquire all catalog/reference locks first, and
  -- only then lock the promotion. Checkout uses that same refs -> promotion
  -- order, so the two paths cannot form a promotion <-> variant cycle.
  SELECT * INTO v_observed FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_observed.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF;
  IF v_observed.version=9007199254740991 OR v_observed.status='archived' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF saas.promotion_lock_definition_references(p_store_id,p_rule_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_current.version IS DISTINCT FROM p_expected_version
     OR v_current.version IS DISTINCT FROM v_observed.version
     OR v_current.status IS DISTINCT FROM v_observed.status
     OR v_current.name IS DISTINCT FROM v_observed.name
     OR v_current.rule_document IS DISTINCT FROM v_observed.rule_document
  THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF;
  IF v_current.version=9007199254740991 OR v_current.status='archived' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF v_current.status='scheduled' AND (p_rule_document->'schedule'->>'startsAt' IS NULL OR (p_rule_document->'schedule'->>'startsAt')::timestamptz<=p_now) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF v_current.status='active' THEN
    SELECT count(*) FILTER (WHERE reservation.status='committed' OR (reservation.status='reserved' AND reservation.expires_at>p_now))::bigint,
      COALESCE(sum(reservation.reserved_budget_minor) FILTER (WHERE reservation.status='committed' OR (reservation.status='reserved' AND reservation.expires_at>p_now)),0)::bigint
      INTO v_used,v_budget FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=p_store_id AND reservation.promotion_id=p_promotion_id;
    IF saas.promotion_effective_status_v1('active',p_rule_document,COALESCE(v_used,0),COALESCE(v_budget,0),p_now)<>'active' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  END IF;
  IF v_current.status IN ('active','scheduled') THEN
    -- Freeze the same store-wide code namespace used by direct and batch
    -- materialization before deriving the publish-readiness projection.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code:'||p_store_id::text,0));
    v_readiness:=saas.promotion_conflict_projection_v1(p_store_id,p_now,p_rule_document,p_promotion_id);
    IF v_readiness IS NULL THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
    IF (v_readiness->>'blocking')::boolean THEN RETURN QUERY SELECT 'publish_blocked',v_readiness; RETURN; END IF;
  END IF;
  BEGIN
    v_error:=saas.promotion_sync_direct_codes(p_store_id,p_promotion_id,p_rule_document,p_now);
    IF v_error IS NOT NULL THEN RAISE EXCEPTION 'promotion_mutation:%',v_error; END IF;
    PERFORM saas.promotion_materialize_targets(p_store_id,p_promotion_id,p_rule_document);
    UPDATE saas.promotions SET name=p_name,rule_document=p_rule_document,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_promotion_id;
    INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_promotion_id,v_current.version+1,p_rule_document,p_now);
    v_result:=saas.promotion_projection(p_store_id,p_promotion_id);
    PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'update',p_fingerprint,v_result,p_now);
    INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at) VALUES(p_operation_id,p_store_id,p_promotion_id,p_principal_id,'updated',pg_catalog.jsonb_build_object('fromVersion',v_current.version,'toVersion',v_current.version+1),p_now);
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_failure=MESSAGE_TEXT;
    IF v_failure LIKE 'promotion_mutation:%' THEN RETURN QUERY SELECT pg_catalog.substr(v_failure,20),NULL::jsonb; RETURN; END IF;
    RAISE;
  END;
  RETURN QUERY SELECT 'updated',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_lifecycle_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_promotion_id uuid,p_expected_version bigint,p_next_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_action text; v_kind text; v_error text; v_observed saas.promotions%ROWTYPE; v_current saas.promotions%ROWTYPE; v_operation saas.promotion_operations%ROWTYPE; v_result jsonb; v_readiness jsonb; v_used bigint:=0; v_budget bigint:=0;
BEGIN
  IF p_next_status IS NULL OR p_next_status NOT IN ('scheduled','active','paused','archived') OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_action:=CASE WHEN p_next_status='archived' THEN 'promotions.archive' ELSE 'promotions.manage' END;
  v_kind:=CASE WHEN p_next_status='archived' THEN 'archive' ELSE 'lifecycle' END;
  IF p_promotion_id IS NULL OR p_operation_id IS NULL OR p_fingerprint IS DISTINCT FROM saas.promotion_operation_fingerprint_v2(v_kind,p_store_id,pg_catalog.jsonb_build_object('id',p_promotion_id,'expectedVersion',p_expected_version,'nextStatus',p_next_status)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,v_action); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.operation_kind<>v_kind OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF saas.promotion_operation_result_valid(v_kind,v_operation.result_payload) IS NOT TRUE OR v_operation.result_entity_kind<>'promotion' OR v_operation.result_entity_id IS DISTINCT FROM saas.promotion_operation_entity_id(v_kind,v_operation.result_payload) THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF;
    RETURN;
  END IF;
  SELECT * INTO v_observed FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_observed.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF;
  IF v_observed.version=9007199254740991 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF saas.promotion_lifecycle_transition_valid(v_observed.status,p_next_status) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF p_next_status IN ('scheduled','active') AND saas.promotion_lock_definition_references(p_store_id,v_observed.rule_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb; RETURN; END IF;
  IF v_observed.status NOT IN ('active','scheduled') AND p_next_status IN ('active','scheduled') THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-published-cap:'||p_store_id::text,0));
  END IF;
  SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_current.version IS DISTINCT FROM p_expected_version
     OR v_current.version IS DISTINCT FROM v_observed.version
     OR v_current.status IS DISTINCT FROM v_observed.status
     OR v_current.name IS DISTINCT FROM v_observed.name
     OR v_current.rule_document IS DISTINCT FROM v_observed.rule_document
  THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF;
  IF v_current.version=9007199254740991 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF saas.promotion_lifecycle_transition_valid(v_current.status,p_next_status) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF v_current.status NOT IN ('active','scheduled') AND p_next_status IN ('active','scheduled')
     AND (SELECT count(*) FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.status IN ('active','scheduled'))>=100
  THEN RETURN QUERY SELECT 'promotion_limit_reached',NULL::jsonb; RETURN; END IF;
  IF p_next_status IN ('active','scheduled') THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code:'||p_store_id::text,0));
    v_readiness:=saas.promotion_conflict_projection_v1(p_store_id,p_now,v_current.rule_document,p_promotion_id);
    IF v_readiness IS NULL THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
    IF (v_readiness->>'blocking')::boolean THEN RETURN QUERY SELECT 'publish_blocked',v_readiness; RETURN; END IF;
  END IF;
  IF p_next_status='scheduled' AND (v_current.rule_document->'schedule'->>'startsAt' IS NULL OR (v_current.rule_document->'schedule'->>'startsAt')::timestamptz<=p_now) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF p_next_status='active' THEN
    IF (v_current.rule_document->'schedule'->>'startsAt' IS NOT NULL AND (v_current.rule_document->'schedule'->>'startsAt')::timestamptz>p_now)
       OR (v_current.rule_document->'schedule'->>'endsAt' IS NOT NULL AND (v_current.rule_document->'schedule'->>'endsAt')::timestamptz<=p_now) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
    SELECT count(*) FILTER (WHERE reservation.status='committed' OR (reservation.status='reserved' AND reservation.expires_at>p_now))::bigint,
      COALESCE(sum(reservation.reserved_budget_minor) FILTER (WHERE reservation.status='committed' OR (reservation.status='reserved' AND reservation.expires_at>p_now)),0)::bigint
      INTO v_used,v_budget FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=p_store_id AND reservation.promotion_id=p_promotion_id;
    IF saas.promotion_effective_status_v1('active',v_current.rule_document,COALESCE(v_used,0),COALESCE(v_budget,0),p_now)<>'active' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  END IF;
  UPDATE saas.promotions SET status=p_next_status,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_promotion_id;
  INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_promotion_id,v_current.version+1,v_current.rule_document,p_now);
  v_result:=saas.promotion_projection(p_store_id,p_promotion_id);
  PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,v_kind,p_fingerprint,v_result,p_now);
  INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at) VALUES(p_operation_id,p_store_id,p_promotion_id,p_principal_id,CASE WHEN p_next_status='archived' THEN 'archived' ELSE 'status_changed' END,pg_catalog.jsonb_build_object('fromStatus',v_current.status,'toStatus',p_next_status,'version',v_current.version+1),p_now);
  RETURN QUERY SELECT 'updated',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_duplicate_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_destination_id uuid,p_source_id uuid,p_expected_version bigint,p_name text,p_codes text[])
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_operation saas.promotion_operations%ROWTYPE; v_observed saas.promotions%ROWTYPE; v_source saas.promotions%ROWTYPE; v_document jsonb; v_result jsonb; v_failure text;
BEGIN
  IF p_operation_id IS NULL OR p_destination_id IS NULL OR p_source_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR pg_catalog.length(p_name) NOT BETWEEN 1 AND 200 OR pg_catalog.octet_length(p_name)>800 OR p_name~'[[:cntrl:]]'
     OR p_codes IS NULL OR COALESCE(pg_catalog.array_ndims(p_codes),1)>1 OR pg_catalog.cardinality(p_codes)>10000 OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_codes) code WHERE code IS NULL OR saas.promotion_normalize_code(code) IS DISTINCT FROM code)
     OR (SELECT count(*) FROM pg_catalog.unnest(p_codes) code)<>(SELECT count(DISTINCT code) FROM pg_catalog.unnest(p_codes) code)
     OR p_fingerprint IS DISTINCT FROM saas.promotion_operation_fingerprint_v2('duplicate',p_store_id,pg_catalog.jsonb_build_object('sourcePromotionId',p_source_id,'expectedVersion',p_expected_version,'name',p_name,'codes',pg_catalog.to_jsonb(p_codes)))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'duplicate' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF saas.promotion_operation_result_valid('duplicate',v_operation.result_payload) IS NOT TRUE OR v_operation.result_entity_kind<>'promotion' OR v_operation.result_entity_id IS DISTINCT FROM saas.promotion_operation_entity_id('duplicate',v_operation.result_payload) THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF;
    RETURN;
  END IF;
  SELECT * INTO v_observed FROM saas.promotions WHERE store_id=p_store_id AND id=p_source_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_observed.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_source_id); RETURN; END IF;
  IF v_observed.rule_document->'trigger'->>'kind'='automatic' AND COALESCE(pg_catalog.array_length(p_codes,1),0)<>0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF v_observed.rule_document->'trigger'->>'kind'='code' AND COALESCE(pg_catalog.array_length(p_codes,1),0)=0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_document:=CASE WHEN v_observed.rule_document->'trigger'->>'kind'='code' THEN pg_catalog.jsonb_set(v_observed.rule_document,'{trigger,codes}',COALESCE((SELECT pg_catalog.jsonb_agg(code ORDER BY code) FROM pg_catalog.unnest(p_codes) code),'[]'::jsonb)) ELSE v_observed.rule_document END;
  IF saas.promotion_lock_definition_references(p_store_id,v_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_source FROM saas.promotions WHERE store_id=p_store_id AND id=p_source_id FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_source.version IS DISTINCT FROM p_expected_version
     OR v_source.version IS DISTINCT FROM v_observed.version
     OR v_source.status IS DISTINCT FROM v_observed.status
     OR v_source.name IS DISTINCT FROM v_observed.name
     OR v_source.rule_document IS DISTINCT FROM v_observed.rule_document
  THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_source_id); RETURN; END IF;
  BEGIN
    INSERT INTO saas.promotions(id,store_id,legacy_record_id,name,status,version,rule_document,created_at,updated_at) VALUES(p_destination_id,p_store_id,NULL,p_name,'draft',1,v_document,p_now,p_now) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'promotion_mutation:conflict'; END IF;
    v_error:=saas.promotion_sync_direct_codes(p_store_id,p_destination_id,v_document,p_now);
    IF v_error IS NOT NULL THEN RAISE EXCEPTION 'promotion_mutation:%',v_error; END IF;
    PERFORM saas.promotion_materialize_targets(p_store_id,p_destination_id,v_document);
    INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_destination_id,1,v_document,p_now);
    v_result:=saas.promotion_projection(p_store_id,p_destination_id);
    PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'duplicate',p_fingerprint,v_result,p_now);
    INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at) VALUES(p_operation_id,p_store_id,p_destination_id,p_principal_id,'duplicated',pg_catalog.jsonb_build_object('sourcePromotionId',p_source_id,'sourceVersion',p_expected_version),p_now);
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_failure=MESSAGE_TEXT;
    IF v_failure LIKE 'promotion_mutation:%' THEN RETURN QUERY SELECT pg_catalog.substr(v_failure,20),NULL::jsonb; RETURN; END IF;
    RAISE;
  END;
  RETURN QUERY SELECT 'created',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_list_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_search text,p_effective_statuses text[],p_trigger_kinds text[],p_benefit_kinds text[],p_audience_modes text[],p_schedule_from timestamptz,p_schedule_to timestamptz,p_limit integer,p_snapshot_at timestamptz,p_after_created_at timestamptz,p_after_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_snapshot timestamptz; v_currency text; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_effective_statuses IS NULL OR p_trigger_kinds IS NULL OR p_benefit_kinds IS NULL OR p_audience_modes IS NULL
     OR COALESCE(pg_catalog.array_ndims(p_effective_statuses),1)>1 OR COALESCE(pg_catalog.array_ndims(p_trigger_kinds),1)>1 OR COALESCE(pg_catalog.array_ndims(p_benefit_kinds),1)>1 OR COALESCE(pg_catalog.array_ndims(p_audience_modes),1)>1
     OR pg_catalog.cardinality(p_effective_statuses)>8 OR pg_catalog.cardinality(p_trigger_kinds)>2 OR pg_catalog.cardinality(p_benefit_kinds)>7 OR pg_catalog.cardinality(p_audience_modes)>6
     OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_effective_statuses) value WHERE value IS NULL OR value NOT IN ('draft','scheduled','active','paused','usage_exhausted','budget_exhausted','ended','archived'))
     OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_trigger_kinds) value WHERE value IS NULL OR value NOT IN ('automatic','code'))
     OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_benefit_kinds) value WHERE value IS NULL OR value NOT IN ('percentage','fixed_amount','free_shipping','buy_x_get_y','quantity_tiers','bundle_price','gift'))
     OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_audience_modes) value WHERE value IS NULL OR value NOT IN ('everyone','first_paid_order','customer_segments','customer_tags','masked_customers','abandoned_cart'))
     OR (SELECT count(*) FROM pg_catalog.unnest(p_effective_statuses) value)<>(SELECT count(DISTINCT value) FROM pg_catalog.unnest(p_effective_statuses) value)
     OR (SELECT count(*) FROM pg_catalog.unnest(p_trigger_kinds) value)<>(SELECT count(DISTINCT value) FROM pg_catalog.unnest(p_trigger_kinds) value)
     OR (SELECT count(*) FROM pg_catalog.unnest(p_benefit_kinds) value)<>(SELECT count(DISTINCT value) FROM pg_catalog.unnest(p_benefit_kinds) value)
     OR (SELECT count(*) FROM pg_catalog.unnest(p_audience_modes) value)<>(SELECT count(DISTINCT value) FROM pg_catalog.unnest(p_audience_modes) value)
     OR (p_search IS NOT NULL AND (p_search<>pg_catalog.btrim(p_search) OR pg_catalog.length(p_search) NOT BETWEEN 1 AND 100 OR pg_catalog.octet_length(p_search)>400 OR p_search~'[[:cntrl:]]'))
     OR ((p_schedule_from IS NULL)<>(p_schedule_to IS NULL)) OR (p_schedule_from IS NOT NULL AND p_schedule_from>=p_schedule_to)
     OR (p_schedule_from IS NOT NULL AND (pg_catalog.isfinite(p_schedule_from) IS NOT TRUE OR pg_catalog.isfinite(p_schedule_to) IS NOT TRUE))
     OR NOT (((p_snapshot_at IS NULL) AND (p_after_created_at IS NULL) AND (p_after_id IS NULL)) OR ((p_snapshot_at IS NOT NULL) AND (p_after_created_at IS NOT NULL) AND (p_after_id IS NOT NULL)))
     OR (p_snapshot_at IS NOT NULL AND (pg_catalog.isfinite(p_snapshot_at) IS NOT TRUE OR pg_catalog.isfinite(p_after_created_at) IS NOT TRUE))
     OR (p_snapshot_at IS NOT NULL AND (p_snapshot_at>p_now OR p_after_created_at>p_snapshot_at))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_snapshot:=COALESCE(p_snapshot_at,p_now);
  SELECT store_row.currency INTO v_currency FROM saas.stores store_row WHERE store_row.id=p_store_id;
  WITH candidates AS MATERIALIZED (
    SELECT p.id,p.version,p.name,p.status,p.rule_document,p.created_at,p.updated_at
    FROM saas.promotions p
    WHERE p.store_id=p_store_id AND p.created_at<=v_snapshot
      AND (p_after_created_at IS NULL OR (p.created_at,p.id)<(p_after_created_at,p_after_id))
      AND (p_search IS NULL OR pg_catalog.strpos(pg_catalog.lower(p.name),pg_catalog.lower(p_search))>0 OR EXISTS(SELECT 1 FROM saas.promotion_codes code WHERE code.store_id=p_store_id AND code.promotion_id=p.id AND code.status='active' AND pg_catalog.strpos(pg_catalog.lower(code.code),pg_catalog.lower(p_search))>0))
      AND (COALESCE(pg_catalog.array_length(p_trigger_kinds,1),0)=0 OR p.rule_document->'trigger'->>'kind'=ANY(p_trigger_kinds))
      AND (COALESCE(pg_catalog.array_length(p_benefit_kinds,1),0)=0 OR p.rule_document->'benefit'->>'kind'=ANY(p_benefit_kinds))
      AND (COALESCE(pg_catalog.array_length(p_audience_modes,1),0)=0 OR p.rule_document->'audience'->>'mode'=ANY(p_audience_modes))
      AND (p_schedule_from IS NULL OR (p.rule_document->'schedule'->>'endsAt' IS NULL OR (p.rule_document->'schedule'->>'endsAt')::timestamptz>p_schedule_from) AND (p.rule_document->'schedule'->>'startsAt' IS NULL OR (p.rule_document->'schedule'->>'startsAt')::timestamptz<p_schedule_to))
  ), usage AS MATERIALIZED (
    SELECT candidate.id promotion_id,
      count(reservation.id) FILTER (WHERE reservation.status='committed' OR (reservation.status='reserved' AND reservation.expires_at>v_snapshot))::bigint used,
      COALESCE(sum(reservation.reserved_budget_minor) FILTER (WHERE reservation.status='committed' OR (reservation.status='reserved' AND reservation.expires_at>v_snapshot)),0)::bigint budget
    FROM candidates candidate
    LEFT JOIN saas.promotion_usage_reservations reservation ON reservation.store_id=p_store_id AND reservation.promotion_id=candidate.id
    GROUP BY candidate.id
  ), base AS MATERIALIZED (
    SELECT candidate.*,COALESCE(usage.used,0)::bigint used,COALESCE(usage.budget,0)::bigint budget,
      saas.promotion_effective_status_v1(candidate.status,candidate.rule_document,COALESCE(usage.used,0),COALESCE(usage.budget,0),v_snapshot) effective_status
    FROM candidates candidate JOIN usage ON usage.promotion_id=candidate.id
  ), filtered AS MATERIALIZED (
    SELECT * FROM base WHERE COALESCE(pg_catalog.array_length(p_effective_statuses,1),0)=0 OR effective_status=ANY(p_effective_statuses)
  ), page AS MATERIALIZED (
    SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT p_limit+1
  ), visible AS MATERIALIZED (
    SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT p_limit
  ), financial_orders AS MATERIALIZED (
    SELECT item.id promotion_id,redemption.currency,redemption.order_id,
      count(redemption.id)::bigint redemptions,
      COALESCE(sum(redemption.discount_minor),0)::bigint discount_minor,
      max(order_row.total_cents)::bigint revenue_minor
    FROM visible item
    JOIN saas.promotion_redemptions redemption ON redemption.store_id=p_store_id AND redemption.promotion_id=item.id
    JOIN saas.orders order_row ON order_row.store_id=redemption.store_id AND order_row.id=redemption.order_id AND order_row.currency=redemption.currency
    GROUP BY item.id,redemption.currency,redemption.order_id
  ), financial_totals AS MATERIALIZED (
    SELECT promotion_id,currency,sum(redemptions)::bigint redemptions,sum(discount_minor)::bigint discount_minor,sum(revenue_minor)::bigint revenue_minor
    FROM financial_orders GROUP BY promotion_id,currency
  ), financials AS MATERIALIZED (
    SELECT promotion_id,pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'currency',currency,'redemptions',redemptions,'discountMinor',discount_minor,'revenueMinor',revenue_minor
    ) ORDER BY currency) payload
    FROM financial_totals GROUP BY promotion_id
  ), active_codes AS MATERIALIZED (
    SELECT item.id promotion_id,count(code.id)::bigint active_count
    FROM visible item
    JOIN saas.promotion_codes code ON code.store_id=p_store_id AND code.promotion_id=item.id AND code.status='active'
    GROUP BY item.id
  ), metadata AS (
    SELECT (SELECT count(*) FROM page)>p_limit has_more,(SELECT created_at FROM visible ORDER BY created_at,id LIMIT 1) anchor_created_at,(SELECT id FROM visible ORDER BY created_at,id LIMIT 1) anchor_id
  )
  SELECT pg_catalog.jsonb_build_object(
    'items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',item.id,'version',item.version,'name',item.name,'status',item.status,'effectiveStatus',item.effective_status,
      'triggerKind',item.rule_document->'trigger'->>'kind','benefitKind',item.rule_document->'benefit'->>'kind','audienceMode',item.rule_document->'audience'->>'mode',
      'humanMechanic',saas.promotion_human_mechanic_v1(v_currency,item.rule_document),'startsAt',item.rule_document->'schedule'->>'startsAt','endsAt',item.rule_document->'schedule'->>'endsAt',
      'usage',pg_catalog.jsonb_build_object('used',item.used,'budgetMinor',item.budget),'financials',COALESCE(financials.payload,'[]'::jsonb),
      'activeCodeCount',CASE WHEN item.rule_document->'trigger'->>'kind'='automatic' THEN 0 ELSE COALESCE(active_codes.active_count,0) END,
      'createdAt',pg_catalog.to_char(item.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'updatedAt',pg_catalog.to_char(item.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ) ORDER BY item.created_at DESC,item.id DESC) FROM visible item LEFT JOIN financials ON financials.promotion_id=item.id LEFT JOIN active_codes ON active_codes.promotion_id=item.id),'[]'::jsonb),
    'hasMore',metadata.has_more,'snapshotAt',pg_catalog.to_char(v_snapshot AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'cursorAnchor',CASE WHEN metadata.has_more THEN pg_catalog.jsonb_build_object('createdAt',pg_catalog.to_char(metadata.anchor_created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',metadata.anchor_id) ELSE 'null'::jsonb END
  ) INTO v_result FROM metadata;
  RETURN QUERY SELECT 'listed',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_list_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_search text,p_statuses text[],p_limit integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF; IF p_limit NOT BETWEEN 1 AND 100 OR COALESCE(pg_catalog.array_length(p_statuses,1),0)>5 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.promotion_projection(p_store_id,x.id) ORDER BY x.updated_at DESC,x.id DESC) FROM (SELECT id,updated_at FROM saas.promotions WHERE store_id=p_store_id AND (p_search IS NULL OR name ILIKE '%'||p_search||'%') AND (COALESCE(pg_catalog.array_length(p_statuses,1),0)=0 OR status=ANY(p_statuses)) ORDER BY updated_at DESC,id DESC LIMIT p_limit) x),'[]'::jsonb)); END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_picker_source_v1(p_store_id uuid,p_kind text)
RETURNS TABLE(kind text,id uuid,label text,status text) LANGUAGE sql STABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT 'product',product.id,product.title,CASE WHEN product.status='active' AND product.archived_at IS NULL THEN 'active' ELSE 'unavailable' END
  FROM saas.products product WHERE p_kind='product' AND product.store_id=p_store_id
  UNION ALL
  SELECT 'variant',variant.id,product.title||' • '||variant.title,
    CASE WHEN variant.status='active' AND variant.archived_at IS NULL AND product.status='active' AND product.archived_at IS NULL THEN 'active' ELSE 'unavailable' END
  FROM saas.product_variants variant JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE p_kind='variant' AND variant.store_id=p_store_id
  UNION ALL
  SELECT 'category',category.id,category.name,CASE WHEN category.status='active' AND category.archived_at IS NULL THEN 'active' ELSE 'unavailable' END
  FROM saas.catalog_categories category WHERE p_kind='category' AND category.store_id=p_store_id
  UNION ALL
  SELECT resource.resource_kind,resource.id,resource.name,CASE WHEN resource.status='active' AND resource.archived_at IS NULL THEN 'active' ELSE 'unavailable' END
  FROM saas.catalog_admin_resources resource WHERE p_kind IN ('brand','collection') AND resource.store_id=p_store_id AND resource.resource_kind=p_kind
  UNION ALL
  SELECT 'customer_segment',segment.id,segment.name,CASE WHEN segment.archived_at IS NULL THEN 'active' ELSE 'unavailable' END
  FROM saas.customer_segments segment WHERE p_kind='customer_segment' AND segment.store_id=p_store_id
  UNION ALL
  SELECT 'customer_tag',tag.id,tag.name,CASE WHEN tag.archived_at IS NULL THEN 'active' ELSE 'unavailable' END
  FROM saas.customer_tags tag WHERE p_kind='customer_tag' AND tag.store_id=p_store_id
  UNION ALL
  SELECT 'masked_customer',customer.id,'Maskeli müşteri ••••'||pg_catalog.right(pg_catalog.replace(customer.id::text,'-',''),4),
    CASE WHEN customer.status='active' AND customer.archived_at IS NULL THEN 'active' ELSE 'unavailable' END
  FROM saas.customers customer WHERE p_kind='masked_customer' AND customer.store_id=p_store_id
  UNION ALL
  SELECT 'payment_method',method.id,method.label,CASE WHEN method.state='active' THEN 'active' ELSE 'unavailable' END
  FROM saas.payment_methods method WHERE p_kind='payment_method' AND method.store_id=p_store_id
  UNION ALL
  SELECT 'shipping_method',shipping.id,shipping.name,
    CASE WHEN saas.promotion_shipping_method_current(p_store_id,shipping.id) THEN 'active' ELSE 'unavailable' END
  FROM saas.merchant_admin_records shipping
  WHERE p_kind='shipping_method' AND shipping.store_id=p_store_id AND shipping.record_kind='shipping_setting'
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_picker_list_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_search text,p_limit integer,p_after_sort_key text,p_after_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('product','variant','category','brand','collection','customer_segment','customer_tag','masked_customer','payment_method','shipping_method')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
     OR (p_search IS NOT NULL AND (p_search<>pg_catalog.btrim(p_search) OR pg_catalog.length(p_search) NOT BETWEEN 1 AND 100 OR pg_catalog.octet_length(p_search)>400 OR p_search~'[[:cntrl:]]'))
     OR ((p_after_sort_key IS NULL)<>(p_after_id IS NULL))
     OR (p_after_sort_key IS NOT NULL AND (p_after_sort_key<>pg_catalog.lower(p_after_sort_key) OR p_after_sort_key<>pg_catalog.btrim(p_after_sort_key) OR pg_catalog.length(p_after_sort_key) NOT BETWEEN 1 AND 500 OR pg_catalog.octet_length(p_after_sort_key)>2000 OR p_after_sort_key~'[[:cntrl:]]'))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  WITH source AS MATERIALIZED (
    SELECT picker.kind,picker.id,picker.label,picker.status,pg_catalog.lower(picker.label) sort_key
    FROM saas.promotion_picker_source_v1(p_store_id,p_kind) picker
    WHERE picker.status='active'
      AND (p_search IS NULL OR pg_catalog.strpos(pg_catalog.lower(picker.label),pg_catalog.lower(p_search))>0)
      AND (p_after_sort_key IS NULL OR pg_catalog.lower(picker.label) COLLATE "C">p_after_sort_key COLLATE "C" OR (pg_catalog.lower(picker.label) COLLATE "C"=p_after_sort_key COLLATE "C" AND picker.id>p_after_id))
  ), page AS MATERIALIZED (
    SELECT * FROM source ORDER BY sort_key COLLATE "C",id LIMIT p_limit+1
  ), visible AS MATERIALIZED (
    SELECT * FROM page ORDER BY sort_key COLLATE "C",id LIMIT p_limit
  ), metadata AS (
    SELECT (SELECT count(*) FROM page)>p_limit has_more,
      (SELECT sort_key FROM visible ORDER BY sort_key COLLATE "C" DESC,id DESC LIMIT 1) anchor_sort_key,
      (SELECT id FROM visible ORDER BY sort_key COLLATE "C" DESC,id DESC LIMIT 1) anchor_id
  )
  SELECT pg_catalog.jsonb_build_object(
    'items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind',kind,'id',id,'label',label,'status',status) ORDER BY sort_key COLLATE "C",id) FROM visible),'[]'::jsonb),
    'hasMore',metadata.has_more,
    'cursorAnchor',CASE WHEN metadata.has_more THEN pg_catalog.jsonb_build_object('sortKey',metadata.anchor_sort_key,'id',metadata.anchor_id) ELSE 'null'::jsonb END
  ) INTO v_result FROM metadata;
  RETURN QUERY SELECT 'listed',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_picker_resolve_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_ids uuid[])
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('product','variant','category','brand','collection','customer_segment','customer_tag','masked_customer','payment_method','shipping_method')
     OR p_ids IS NULL OR pg_catalog.array_ndims(p_ids) IS DISTINCT FROM 1 OR pg_catalog.cardinality(p_ids) NOT BETWEEN 1 AND 500
     OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_ids) requested_id WHERE requested_id IS NULL)
     OR (SELECT count(*) FROM pg_catalog.unnest(p_ids) requested_id)<>(SELECT count(DISTINCT requested_id) FROM pg_catalog.unnest(p_ids) requested_id)
     OR p_ids IS DISTINCT FROM ARRAY(SELECT requested_id FROM pg_catalog.unnest(p_ids) requested_id ORDER BY requested_id)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.jsonb_build_object('items',COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('kind',picker.kind,'id',picker.id,'label',picker.label,'status',picker.status) ORDER BY pg_catalog.lower(picker.label) COLLATE "C",picker.id),'[]'::jsonb))
  INTO v_result
  FROM saas.promotion_picker_source_v1(p_store_id,p_kind) picker
  WHERE picker.id=ANY(p_ids);
  RETURN QUERY SELECT 'resolved',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_simulate_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_context jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; BEGIN v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF; IF saas.promotion_evaluator_context_valid(p_store_id,p_context) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; RETURN QUERY SELECT 'simulated',pg_catalog.jsonb_build_object('evaluation',saas.promotion_evaluate_v1(p_store_id,p_context,p_now),'mutated',false); END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_simulate_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_selected jsonb,p_context jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_id uuid; v_expected bigint; v_current saas.promotions%ROWTYPE; v_internal jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF saas.promotion_evaluator_context_valid(p_store_id,p_context) IS NOT TRUE OR saas.promotion_json_keys(p_selected,ARRAY['id','expectedVersion','name','ruleDocument'],ARRAY['id','expectedVersion','name','ruleDocument']) IS NOT TRUE OR saas.promotion_json_uuid(p_selected->'id') IS NOT TRUE
     OR pg_catalog.jsonb_typeof(p_selected->'expectedVersion') NOT IN ('null','number') OR (p_selected->'expectedVersion'<>'null'::jsonb AND saas.promotion_json_integer(p_selected->'expectedVersion',1,9007199254740991) IS NOT TRUE)
     OR pg_catalog.jsonb_typeof(p_selected->'name')<>'string' OR p_selected->>'name'<>pg_catalog.btrim(p_selected->>'name') OR pg_catalog.length(p_selected->>'name') NOT BETWEEN 1 AND 200 OR pg_catalog.octet_length(p_selected->>'name')>800 OR p_selected->>'name'~'[[:cntrl:]]'
     OR saas.promotion_rule_document_valid(p_selected->'ruleDocument') IS NOT TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_id:=(p_selected->>'id')::uuid; v_expected:=CASE WHEN p_selected->'expectedVersion'='null'::jsonb THEN NULL ELSE (p_selected->>'expectedVersion')::bigint END;
  SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=v_id;
  IF v_expected IS NULL THEN
    IF FOUND THEN RETURN QUERY SELECT 'conflict',NULL::jsonb; RETURN; END IF;
    v_internal:=pg_catalog.jsonb_build_object('id',v_id,'name',p_selected->>'name','version',1,'ruleDocument',p_selected->'ruleDocument','createdAt',p_now);
  ELSE
    IF NOT FOUND OR v_current.status='archived' THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF v_current.version<>v_expected THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,v_id); RETURN; END IF;
    v_internal:=pg_catalog.jsonb_build_object('id',v_id,'name',p_selected->>'name','version',v_current.version,'ruleDocument',p_selected->'ruleDocument','createdAt',v_current.created_at);
  END IF;
  IF saas.promotion_definition_references_valid(p_store_id,p_selected->'ruleDocument') IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'simulated',pg_catalog.jsonb_build_object('evaluation',saas.promotion_evaluate_internal_v1(p_store_id,p_context,p_now,v_internal),'mutated',false);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_detail_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  v_result:=saas.promotion_projection(p_store_id,p_promotion_id);
  IF v_result IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; ELSE RETURN QUERY SELECT 'found',v_result; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_conflicts_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid,p_expected_version bigint,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_current saas.promotions%ROWTYPE; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF saas.promotion_rule_document_valid(p_rule_document) IS NOT TRUE
     OR ((p_promotion_id IS NULL)<>(p_expected_version IS NULL))
     OR (p_expected_version IS NOT NULL AND p_expected_version NOT BETWEEN 1 AND 9007199254740991)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF p_promotion_id IS NOT NULL THEN
    SELECT * INTO v_current FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=p_promotion_id AND promotion.status<>'archived';
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF v_current.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF;
  END IF;
  v_result:=saas.promotion_conflict_projection_v1(p_store_id,p_now,p_rule_document,p_promotion_id);
  IF v_result IS NULL THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; ELSE RETURN QUERY SELECT 'checked',v_result; END IF;
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
DECLARE v_error text; v_operation saas.promotion_operations%ROWTYPE; v_code text; v_index integer; v_attempt integer; v_result jsonb; v_constraint text;
BEGIN
  IF p_operation_id IS NULL OR p_batch_id IS NULL OR p_promotion_id IS NULL OR p_count IS NULL OR p_count NOT BETWEEN 1 AND 10000 OR p_prefix IS NULL OR p_prefix !~ '^(?:|[A-Z0-9][A-Z0-9_-]{0,19})$' OR p_fingerprint IS DISTINCT FROM saas.promotion_operation_fingerprint_v2('code_batch',p_store_id,pg_catalog.jsonb_build_object('promotionId',p_promotion_id,'count',p_count,'prefix',p_prefix)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.manage'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'code_batch' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF saas.promotion_operation_result_valid('code_batch',v_operation.result_payload) IS NOT TRUE OR v_operation.result_entity_kind<>'code_batch' OR v_operation.result_entity_id IS DISTINCT FROM saas.promotion_operation_entity_id('code_batch',v_operation.result_payload) THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id AND status<>'archived') THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.promotion_code_batches(id,store_id,promotion_id,status,requested_count,operation_id,created_at) VALUES(p_batch_id,p_store_id,p_promotion_id,'active',p_count,p_operation_id,p_now) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN QUERY SELECT 'code_conflict',NULL::jsonb; RETURN; END IF;
  FOR v_index IN 1..p_count LOOP
    v_attempt:=0;
    LOOP
      v_attempt:=v_attempt+1; IF v_attempt>20 THEN RAISE EXCEPTION 'promotion code entropy collision limit'; END IF;
      v_code:=saas.promotion_normalize_code(p_prefix||pg_catalog.substr(pg_catalog.encode(pg_catalog.gen_random_bytes(16),'hex'),1,20));
      BEGIN
        INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_promotion_id,p_batch_id,v_code,'active',p_now);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
        IF v_constraint NOT IN ('promotion_codes_store_code_key','promotion_codes_pkey') THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
  v_result:=pg_catalog.jsonb_build_object('id',p_batch_id,'promotionId',p_promotion_id,'status','active','count',p_count,'createdAt',pg_catalog.to_char(p_now AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'code_batch',p_fingerprint,v_result,p_now); RETURN QUERY SELECT 'created',v_result;
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

CREATE OR REPLACE FUNCTION saas.promotion_margin_check_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid,p_expected_version bigint,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_current saas.promotions%ROWTYPE; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF saas.promotion_rule_document_valid(p_rule_document) IS NOT TRUE
     OR ((p_promotion_id IS NULL)<>(p_expected_version IS NULL))
     OR (p_expected_version IS NOT NULL AND p_expected_version NOT BETWEEN 1 AND 9007199254740991)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF p_promotion_id IS NOT NULL THEN
    SELECT * INTO v_current FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=p_promotion_id AND promotion.status<>'archived';
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF v_current.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF;
  END IF;
  v_result:=saas.promotion_margin_projection_v1(p_store_id,p_now,p_rule_document);
  IF v_result IS NULL THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; ELSE RETURN QUERY SELECT 'checked',v_result; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_margin_check_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT * FROM saas.promotion_conflicts_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_rule_document)
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_reserve_v1(p_store_id uuid,p_promotion_id uuid,p_code_id uuid,p_customer_id uuid,p_operation_id uuid,p_source_reference text,p_budget_minor bigint,p_now timestamptz,p_expires_at timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT 'settlement_not_ready'::text,NULL::jsonb
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_release_expired_v1(p_store_id uuid,p_now timestamptz)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT 0
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_expire_due_reservations_v1(p_now timestamptz,p_limit integer)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE WHEN p_now IS NOT NULL AND p_limit BETWEEN 1 AND 500 THEN 0 ELSE 0 END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_release_reservation_v1(p_store_id uuid,p_reservation_id uuid,p_operation_id uuid,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT 'settlement_not_ready'::text,NULL::jsonb
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_commit_reservation_v1(p_store_id uuid,p_reservation_id uuid,p_operation_id uuid,p_redemption_id uuid,p_order_id uuid,p_discount_minor bigint,p_currency text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT 'settlement_not_ready'::text,NULL::jsonb
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_recover_operation_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_kind text,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_action text; v_error text; v_operation saas.promotion_operations%ROWTYPE; v_entity_kind text; v_entity_id uuid;
BEGIN
  v_action:=saas.promotion_operation_recovery_action(p_kind);
  IF p_store_id IS NULL OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR v_action IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,v_action);
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_operation.operation_kind<>p_kind OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  v_entity_kind:=saas.promotion_operation_entity_kind(p_kind);
  v_entity_id:=saas.promotion_operation_entity_id(p_kind,v_operation.result_payload);
  IF saas.promotion_operation_result_valid(p_kind,v_operation.result_payload) IS NOT TRUE
     OR v_operation.result_entity_kind IS DISTINCT FROM v_entity_kind
     OR v_operation.result_entity_id IS DISTINCT FROM v_entity_id
     OR (v_entity_kind='promotion' AND NOT EXISTS (SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=v_entity_id))
     OR (v_entity_kind='code_batch' AND NOT EXISTS (SELECT 1 FROM saas.promotion_code_batches WHERE store_id=p_store_id AND id=v_entity_id))
  THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload;
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
    IF FOUND THEN INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(pg_catalog.gen_random_uuid(),r.store_id,r.id,1,v_rule,p_now); IF v_code IS NOT NULL THEN INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at) VALUES(pg_catalog.gen_random_uuid(),r.store_id,r.id,NULL,v_code,'active',p_now); END IF; v_count:=v_count+1; END IF;
  END LOOP; RETURN v_count;
END $fn$;

-- History rows are immutable. Reservations are the sole transition record and may only change status/timestamps.
CREATE OR REPLACE FUNCTION saas.promotion_history_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN RAISE EXCEPTION 'promotion history is append-only'; END $fn$;
CREATE OR REPLACE FUNCTION saas.promotion_reservation_transition_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN
  IF TG_OP='DELETE'
     OR NEW.store_id<>OLD.store_id OR NEW.id<>OLD.id OR NEW.promotion_id<>OLD.promotion_id
     OR NEW.promotion_version<>OLD.promotion_version OR NEW.code_id IS DISTINCT FROM OLD.code_id
     OR NEW.normalized_code IS DISTINCT FROM OLD.normalized_code OR NEW.reservation_group_id<>OLD.reservation_group_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.operation_id<>OLD.operation_id OR NEW.operation_kind<>OLD.operation_kind OR NEW.operation_fingerprint<>OLD.operation_fingerprint
     OR NEW.source_kind<>OLD.source_kind OR NEW.source_reference<>OLD.source_reference OR NEW.reserved_uses<>OLD.reserved_uses
     OR NEW.reserved_budget_minor<>OLD.reserved_budget_minor OR NEW.discount_minor<>OLD.discount_minor
     OR NEW.currency<>OLD.currency OR NEW.evaluator_snapshot<>OLD.evaluator_snapshot
     OR NEW.evaluator_fingerprint<>OLD.evaluator_fingerprint OR NEW.expires_at<>OLD.expires_at
     OR NEW.created_at<>OLD.created_at OR NEW.updated_at<OLD.updated_at
     OR NEW.status IS NULL OR NEW.status NOT IN ('reserved','committed','released','expired')
     OR (OLD.status<>'reserved' AND NEW.status<>OLD.status)
  THEN RAISE EXCEPTION 'promotion reservation transition invalid'; END IF;
  RETURN NEW;
END $fn$;

-- A reservation row is a projection of its immutable reserve-operation result.
-- The exact operation tuple is checked here as well as by the deferred FK so a
-- forged member, currency, expiry or evaluator digest cannot enter settlement.
CREATE OR REPLACE FUNCTION saas.promotion_reservation_matches_operation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_operation saas.promotion_operations%ROWTYPE;
  v_member jsonb;
BEGIN
  SELECT operation_row.* INTO v_operation
  FROM saas.promotion_operations operation_row
  WHERE operation_row.store_id=NEW.store_id
    AND operation_row.operation_id=NEW.operation_id
    AND operation_row.operation_kind=NEW.operation_kind
    AND operation_row.fingerprint=NEW.operation_fingerprint
    AND operation_row.result_entity_kind='reservation_group'
    AND operation_row.result_entity_id=NEW.reservation_group_id
  FOR SHARE;
  IF NOT FOUND
     OR NEW.operation_kind IS DISTINCT FROM 'reserve'
     OR NEW.status IS DISTINCT FROM 'reserved'
     OR saas.promotion_operation_result_valid('reserve',v_operation.result_payload) IS NOT TRUE
     OR (v_operation.result_payload->>'reservationGroupId')::uuid IS DISTINCT FROM NEW.reservation_group_id
     OR v_operation.result_payload->>'currency' IS DISTINCT FROM NEW.currency
     OR (v_operation.result_payload->>'expiresAt')::timestamptz IS DISTINCT FROM NEW.expires_at
     OR v_operation.result_payload->>'evaluatorFingerprint' IS DISTINCT FROM NEW.evaluator_fingerprint
  THEN RAISE EXCEPTION 'promotion reservation operation binding invalid'; END IF;

  SELECT member.value INTO v_member
  FROM pg_catalog.jsonb_array_elements(v_operation.result_payload->'reservations') member
  WHERE member.value->>'promotionId'=NEW.promotion_id::text
    AND member.value->>'reservationId'=NEW.id::text;
  IF NOT FOUND
     OR (v_member->>'promotionVersion')::bigint IS DISTINCT FROM NEW.promotion_version
     OR v_member->>'normalizedCode' IS DISTINCT FROM NEW.normalized_code
     OR (v_member->>'discountMinor')::bigint IS DISTINCT FROM NEW.discount_minor
  THEN RAISE EXCEPTION 'promotion reservation operation member invalid'; END IF;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
  RAISE EXCEPTION 'promotion reservation operation binding invalid';
END $fn$;

-- Settlement may only copy frozen reservation authority facts.  The operation
-- result is also bound member-for-member, making caller-supplied money, code,
-- customer, version and evaluator facts unrepresentable in the ledger.
CREATE OR REPLACE FUNCTION saas.promotion_redemption_matches_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_reservation saas.promotion_usage_reservations%ROWTYPE;
  v_operation saas.promotion_operations%ROWTYPE;
  v_member jsonb;
BEGIN
  SELECT reservation_row.* INTO v_reservation
  FROM saas.promotion_usage_reservations reservation_row
  WHERE reservation_row.store_id=NEW.store_id
    AND reservation_row.reservation_group_id=NEW.reservation_group_id
    AND reservation_row.promotion_id=NEW.promotion_id
    AND reservation_row.id=NEW.reservation_id
  FOR SHARE;
  IF NOT FOUND
     OR v_reservation.status IS DISTINCT FROM 'committed'
     OR NEW.promotion_version IS DISTINCT FROM v_reservation.promotion_version
     OR NEW.code_id IS DISTINCT FROM v_reservation.code_id
     OR NEW.normalized_code IS DISTINCT FROM v_reservation.normalized_code
     OR NEW.customer_id IS DISTINCT FROM v_reservation.customer_id
     OR NEW.discount_minor IS DISTINCT FROM v_reservation.discount_minor
     OR NEW.currency IS DISTINCT FROM v_reservation.currency
     OR NEW.evaluator_fingerprint IS DISTINCT FROM v_reservation.evaluator_fingerprint
  THEN RAISE EXCEPTION 'promotion redemption reservation binding invalid'; END IF;

  SELECT operation_row.* INTO v_operation
  FROM saas.promotion_operations operation_row
  WHERE operation_row.store_id=NEW.store_id
    AND operation_row.operation_id=NEW.operation_id
    AND operation_row.operation_kind=NEW.operation_kind
    AND operation_row.fingerprint=NEW.operation_fingerprint
    AND operation_row.result_entity_kind='redemption_group'
    AND operation_row.result_entity_id=NEW.redemption_group_id
  FOR SHARE;
  IF NOT FOUND
     OR NEW.operation_kind IS DISTINCT FROM 'commit'
     OR saas.promotion_operation_result_valid('commit',v_operation.result_payload) IS NOT TRUE
     OR (v_operation.result_payload->>'reservationGroupId')::uuid IS DISTINCT FROM NEW.reservation_group_id
     OR (v_operation.result_payload->>'redemptionGroupId')::uuid IS DISTINCT FROM NEW.redemption_group_id
     OR (v_operation.result_payload->>'orderId')::uuid IS DISTINCT FROM NEW.order_id
     OR v_operation.result_payload->>'currency' IS DISTINCT FROM NEW.currency
     OR v_operation.result_payload->>'evaluatorFingerprint' IS DISTINCT FROM NEW.evaluator_fingerprint
  THEN RAISE EXCEPTION 'promotion redemption operation binding invalid'; END IF;

  SELECT member.value INTO v_member
  FROM pg_catalog.jsonb_array_elements(v_operation.result_payload->'redemptions') member
  WHERE member.value->>'promotionId'=NEW.promotion_id::text
    AND member.value->>'reservationId'=NEW.reservation_id::text
    AND member.value->>'redemptionId'=NEW.id::text;
  IF NOT FOUND
     OR (v_member->>'promotionVersion')::bigint IS DISTINCT FROM NEW.promotion_version
     OR v_member->>'normalizedCode' IS DISTINCT FROM NEW.normalized_code
     OR (v_member->>'discountMinor')::bigint IS DISTINCT FROM NEW.discount_minor
  THEN RAISE EXCEPTION 'promotion redemption operation member invalid'; END IF;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
  RAISE EXCEPTION 'promotion redemption operation binding invalid';
END $fn$;

-- Group operations are finalized at transaction end, after every member row is
-- present.  This closes the reverse direction of the binding: the payload may
-- neither omit a durable member nor claim a member that was never persisted.
CREATE OR REPLACE FUNCTION saas.promotion_operation_group_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_expected integer;
  v_actual integer;
  v_status text;
BEGIN
  IF NEW.operation_kind IN ('reserve','release','expire') THEN
    IF saas.promotion_operation_result_valid(NEW.operation_kind,NEW.result_payload) IS NOT TRUE
       OR NEW.result_entity_kind IS DISTINCT FROM 'reservation_group'
       OR NEW.result_entity_id IS DISTINCT FROM (NEW.result_payload->>'reservationGroupId')::uuid
    THEN RAISE EXCEPTION 'promotion reservation group result invalid'; END IF;
    v_expected:=pg_catalog.jsonb_array_length(NEW.result_payload->'reservations');
    v_status:=CASE NEW.operation_kind WHEN 'reserve' THEN 'reserved' WHEN 'release' THEN 'released' ELSE 'expired' END;
    SELECT count(*) INTO v_actual
    FROM saas.promotion_usage_reservations reservation_row
    WHERE reservation_row.store_id=NEW.store_id
      AND reservation_row.reservation_group_id=NEW.result_entity_id;
    IF v_actual IS DISTINCT FROM v_expected OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(NEW.result_payload->'reservations') member
      WHERE NOT EXISTS (
        SELECT 1
        FROM saas.promotion_usage_reservations reservation_row
        WHERE reservation_row.store_id=NEW.store_id
          AND reservation_row.reservation_group_id=NEW.result_entity_id
          AND reservation_row.promotion_id=(member.value->>'promotionId')::uuid
          AND reservation_row.id=(member.value->>'reservationId')::uuid
          AND reservation_row.promotion_version=(member.value->>'promotionVersion')::bigint
          AND reservation_row.normalized_code IS NOT DISTINCT FROM member.value->>'normalizedCode'
          AND reservation_row.discount_minor=(member.value->>'discountMinor')::bigint
          AND reservation_row.currency=NEW.result_payload->>'currency'
          AND reservation_row.expires_at=(NEW.result_payload->>'expiresAt')::timestamptz
          AND reservation_row.evaluator_fingerprint=NEW.result_payload->>'evaluatorFingerprint'
          AND reservation_row.status=v_status
      )
    ) THEN RAISE EXCEPTION 'promotion reservation group is incomplete'; END IF;
  ELSIF NEW.operation_kind='commit' THEN
    IF saas.promotion_operation_result_valid('commit',NEW.result_payload) IS NOT TRUE
       OR NEW.result_entity_kind IS DISTINCT FROM 'redemption_group'
       OR NEW.result_entity_id IS DISTINCT FROM (NEW.result_payload->>'redemptionGroupId')::uuid
    THEN RAISE EXCEPTION 'promotion redemption group result invalid'; END IF;
    v_expected:=pg_catalog.jsonb_array_length(NEW.result_payload->'redemptions');
    SELECT count(*) INTO v_actual
    FROM saas.promotion_redemptions redemption_row
    WHERE redemption_row.store_id=NEW.store_id
      AND redemption_row.redemption_group_id=NEW.result_entity_id;
    IF v_actual IS DISTINCT FROM v_expected OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(NEW.result_payload->'redemptions') member
      WHERE NOT EXISTS (
        SELECT 1
        FROM saas.promotion_redemptions redemption_row
        WHERE redemption_row.store_id=NEW.store_id
          AND redemption_row.redemption_group_id=NEW.result_entity_id
          AND redemption_row.reservation_group_id=(NEW.result_payload->>'reservationGroupId')::uuid
          AND redemption_row.order_id=(NEW.result_payload->>'orderId')::uuid
          AND redemption_row.promotion_id=(member.value->>'promotionId')::uuid
          AND redemption_row.reservation_id=(member.value->>'reservationId')::uuid
          AND redemption_row.id=(member.value->>'redemptionId')::uuid
          AND redemption_row.promotion_version=(member.value->>'promotionVersion')::bigint
          AND redemption_row.normalized_code IS NOT DISTINCT FROM member.value->>'normalizedCode'
          AND redemption_row.discount_minor=(member.value->>'discountMinor')::bigint
          AND redemption_row.currency=NEW.result_payload->>'currency'
          AND redemption_row.evaluator_fingerprint=NEW.result_payload->>'evaluatorFingerprint'
      )
    ) THEN RAISE EXCEPTION 'promotion redemption group is incomplete'; END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow THEN
  RAISE EXCEPTION 'promotion operation group binding invalid';
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
  DROP TRIGGER IF EXISTS promotion_usage_reservations_insert_binding ON saas.promotion_usage_reservations;
  CREATE TRIGGER promotion_usage_reservations_insert_binding BEFORE INSERT ON saas.promotion_usage_reservations FOR EACH ROW EXECUTE FUNCTION saas.promotion_reservation_matches_operation();
  DROP TRIGGER IF EXISTS promotion_redemptions_insert_binding ON saas.promotion_redemptions;
  CREATE TRIGGER promotion_redemptions_insert_binding BEFORE INSERT ON saas.promotion_redemptions FOR EACH ROW EXECUTE FUNCTION saas.promotion_redemption_matches_reservation();
  DROP TRIGGER IF EXISTS promotion_operations_group_complete ON saas.promotion_operations;
  CREATE CONSTRAINT TRIGGER promotion_operations_group_complete AFTER INSERT ON saas.promotion_operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION saas.promotion_operation_group_complete();
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.promotion_redemptions'::regclass AND conname='promotion_redemptions_order_store_fk') THEN ALTER TABLE saas.promotion_redemptions ADD CONSTRAINT promotion_redemptions_order_store_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.order_promotion_snapshots'::regclass AND conname='order_promotion_snapshots_order_store_fk') THEN ALTER TABLE saas.order_promotion_snapshots ADD CONSTRAINT order_promotion_snapshots_order_store_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.order_promotion_snapshots'::regclass AND conname='order_promotion_snapshots_version_store_fk') THEN ALTER TABLE saas.order_promotion_snapshots ADD CONSTRAINT order_promotion_snapshots_version_store_fk FOREIGN KEY(store_id,promotion_id,promotion_version) REFERENCES saas.promotion_versions(store_id,promotion_id,version); END IF;
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
GRANT EXECUTE ON FUNCTION saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb),saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb),saas.promotion_lifecycle_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),saas.promotion_duplicate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text[]),saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],integer),saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],text[],text[],text[],timestamptz,timestamptz,integer,timestamptz,timestamptz,uuid),saas.promotion_picker_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,integer,text,uuid),saas.promotion_picker_resolve_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[]),saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb,jsonb),saas.promotion_detail_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb),saas.promotion_margin_check_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_margin_check_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb),saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,integer,text),saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.promotion_codes_csv_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_analytics_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.promotion_recover_operation_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.promotion_expire_due_reservations_v1(timestamptz,integer) TO celebix_saas_workflow;
COMMIT;
