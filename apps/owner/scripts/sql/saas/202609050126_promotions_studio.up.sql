-- Promotions Studio v1 is additive. Legacy checkout ABIs remain exact while V2 entry points are additive.
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
  created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (store_id,id),
  UNIQUE (id),
  UNIQUE (store_id,legacy_record_id),
  CONSTRAINT promotions_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id)
);
CREATE TABLE IF NOT EXISTS saas.promotion_versions (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991), rule_document jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(rule_document)='object' AND pg_catalog.pg_column_size(rule_document)<=262144),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()),
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
  operation_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()),
  version bigint NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 9007199254740991),
  prefix text NOT NULL CHECK (prefix ~ '^(|[A-Z0-9][A-Z0-9_-]{0,19})$'),
  code_length integer NOT NULL CHECK (code_length BETWEEN 16 AND 64 AND code_length-pg_catalog.char_length(prefix)>=16),
  per_customer_usage integer NOT NULL CHECK (per_customer_usage BETWEEN 1 AND 1000000),
  expires_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()),
  PRIMARY KEY (store_id,id), UNIQUE (id), UNIQUE (store_id,operation_id), UNIQUE (store_id,promotion_id,id),
  CONSTRAINT promotion_code_batches_time_check CHECK (pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at) AND updated_at>=created_at AND pg_catalog.date_trunc('milliseconds',created_at)=created_at AND pg_catalog.date_trunc('milliseconds',updated_at)=updated_at AND (expires_at IS NULL OR (pg_catalog.isfinite(expires_at) AND pg_catalog.date_trunc('milliseconds',expires_at)=expires_at AND expires_at>created_at))),
  CONSTRAINT promotion_code_batches_promotion_store_fk FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id)
);
CREATE INDEX IF NOT EXISTS promotion_code_batches_list_idx ON saas.promotion_code_batches(store_id,promotion_id,created_at DESC,id DESC);
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
  created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,operation_id),
  UNIQUE (store_id,operation_id,operation_kind,fingerprint,result_entity_id),
  CONSTRAINT promotion_operations_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id),
  CONSTRAINT promotion_operations_result_payload_check CHECK (pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=327680),
  CONSTRAINT promotion_operations_created_at_check CHECK (pg_catalog.isfinite(created_at) AND pg_catalog.date_trunc('milliseconds',created_at)=created_at),
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
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()), updated_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()),
  PRIMARY KEY (store_id,id), UNIQUE (store_id,promotion_id,id),
  UNIQUE (store_id,reservation_group_id,promotion_id),
  UNIQUE (store_id,reservation_group_id,promotion_id,id),
  CONSTRAINT promotion_usage_reservations_version_store_fk FOREIGN KEY (store_id,promotion_id,promotion_version) REFERENCES saas.promotion_versions(store_id,promotion_id,version),
  CONSTRAINT promotion_usage_reservations_code_store_fk FOREIGN KEY (store_id,promotion_id,code_id,normalized_code) REFERENCES saas.promotion_codes(store_id,promotion_id,id,code),
  CONSTRAINT promotion_usage_reservations_operation_store_fk FOREIGN KEY (store_id,operation_id,operation_kind,operation_fingerprint,reservation_group_id) REFERENCES saas.promotion_operations(store_id,operation_id,operation_kind,fingerprint,result_entity_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT promotion_usage_reservations_customer_store_fk FOREIGN KEY (store_id,customer_id) REFERENCES saas.customers(store_id,id),
  CONSTRAINT promotion_usage_reservations_code_snapshot_check CHECK ((code_id IS NULL)=(normalized_code IS NULL)),
  CONSTRAINT promotion_usage_reservations_time_check CHECK (pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at) AND pg_catalog.isfinite(expires_at) AND pg_catalog.date_trunc('milliseconds',created_at)=created_at AND pg_catalog.date_trunc('milliseconds',updated_at)=updated_at AND pg_catalog.date_trunc('milliseconds',expires_at)=expires_at AND expires_at>created_at AND updated_at>=created_at)
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
  created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()), PRIMARY KEY (store_id,id),
  UNIQUE (store_id,reservation_id), UNIQUE (store_id,redemption_group_id,promotion_id),
  CONSTRAINT promotion_redemptions_version_store_fk FOREIGN KEY (store_id,promotion_id,promotion_version) REFERENCES saas.promotion_versions(store_id,promotion_id,version),
  CONSTRAINT promotion_redemptions_code_store_fk FOREIGN KEY (store_id,promotion_id,code_id,normalized_code) REFERENCES saas.promotion_codes(store_id,promotion_id,id,code),
  CONSTRAINT promotion_redemptions_reservation_store_fk FOREIGN KEY (store_id,reservation_group_id,promotion_id,reservation_id) REFERENCES saas.promotion_usage_reservations(store_id,reservation_group_id,promotion_id,id),
  CONSTRAINT promotion_redemptions_operation_store_fk FOREIGN KEY (store_id,operation_id,operation_kind,operation_fingerprint,redemption_group_id) REFERENCES saas.promotion_operations(store_id,operation_id,operation_kind,fingerprint,result_entity_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT promotion_redemptions_customer_store_fk FOREIGN KEY (store_id,customer_id) REFERENCES saas.customers(store_id,id),
  CONSTRAINT promotion_redemptions_code_snapshot_check CHECK ((code_id IS NULL)=(normalized_code IS NULL)),
  CONSTRAINT promotion_redemptions_created_at_check CHECK (pg_catalog.isfinite(created_at) AND pg_catalog.date_trunc('milliseconds',created_at)=created_at)
);
CREATE TABLE IF NOT EXISTS saas.promotion_audit_events (
  id uuid NOT NULL, store_id uuid NOT NULL, promotion_id uuid NULL, actor_principal_id uuid NULL,
  event_kind text NOT NULL CHECK (event_kind ~ '^[a-z_]{1,64}$'), payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_catalog.jsonb_typeof(payload)='object' AND pg_catalog.pg_column_size(payload)<=32768),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()), PRIMARY KEY (store_id,id),
  CONSTRAINT promotion_audit_events_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id),
  CONSTRAINT promotion_audit_events_promotion_store_fk FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id),
  CONSTRAINT promotion_audit_events_actor_fk FOREIGN KEY (actor_principal_id) REFERENCES saas.principals(id)
);
CREATE TABLE IF NOT EXISTS saas.order_promotion_snapshots (
  id uuid NOT NULL, store_id uuid NOT NULL, order_id uuid NOT NULL, promotion_id uuid NOT NULL, redemption_id uuid NOT NULL,
  promotion_version bigint NOT NULL CHECK (promotion_version BETWEEN 1 AND 9007199254740991), normalized_code text NULL CHECK (normalized_code IS NULL OR normalized_code ~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'), discount_minor bigint NOT NULL CHECK (discount_minor BETWEEN 0 AND 8000000000), evaluator_fingerprint text NOT NULL CHECK (evaluator_fingerprint ~ '^[a-f0-9]{64}$'),
  snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(snapshot)='object' AND pg_catalog.pg_column_size(snapshot)<=262144),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()), PRIMARY KEY (store_id,id),
  UNIQUE (store_id,order_id,promotion_id,promotion_version), UNIQUE (store_id,order_id,id),
  CONSTRAINT order_promotion_snapshots_promotion_store_fk FOREIGN KEY (store_id,promotion_id) REFERENCES saas.promotions(store_id,id),
  CONSTRAINT order_promotion_snapshots_created_at_check CHECK (pg_catalog.isfinite(created_at) AND pg_catalog.date_trunc('milliseconds',created_at)=created_at)
);
CREATE TABLE IF NOT EXISTS saas.order_discount_allocations (
  id uuid NOT NULL, store_id uuid NOT NULL, order_id uuid NOT NULL, snapshot_id uuid NOT NULL,
  line_id uuid NULL, line_position integer NOT NULL CHECK (line_position BETWEEN 0 AND 99), discount_minor bigint NOT NULL CHECK (discount_minor BETWEEN 0 AND 8000000000),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()), PRIMARY KEY (store_id,id),
  CONSTRAINT order_discount_allocations_snapshot_store_fk FOREIGN KEY (store_id,order_id,snapshot_id) REFERENCES saas.order_promotion_snapshots(store_id,order_id,id),
  CONSTRAINT order_discount_allocations_created_at_check CHECK (pg_catalog.isfinite(created_at) AND pg_catalog.date_trunc('milliseconds',created_at)=created_at)
);

-- Settlement snapshots are introduced by this migration and every row must
-- have one immutable redemption authority.
ALTER TABLE saas.order_promotion_snapshots
  ADD COLUMN IF NOT EXISTS redemption_id uuid;
ALTER TABLE saas.order_promotion_snapshots
  ALTER COLUMN redemption_id SET NOT NULL;

DO $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.promotion_code_batches'::regclass AND conname='promotion_code_batches_operation_store_fk') THEN
    ALTER TABLE saas.promotion_code_batches ADD CONSTRAINT promotion_code_batches_operation_store_fk FOREIGN KEY (store_id,operation_id) REFERENCES saas.promotion_operations(store_id,operation_id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.order_discount_allocations'::regclass AND conname='order_discount_allocations_line_store_fk') THEN
    ALTER TABLE saas.order_discount_allocations ADD CONSTRAINT order_discount_allocations_line_store_fk FOREIGN KEY (store_id,order_id,line_id) REFERENCES saas.order_items(store_id,order_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.order_promotion_snapshots'::regclass AND conname='order_promotion_snapshots_redemption_store_fk') THEN
    ALTER TABLE saas.order_promotion_snapshots ADD CONSTRAINT order_promotion_snapshots_redemption_store_fk FOREIGN KEY (store_id,redemption_id) REFERENCES saas.promotion_redemptions(store_id,id);
  END IF;
END $fn$;

CREATE INDEX IF NOT EXISTS promotion_targets_lookup_idx ON saas.promotion_targets(store_id,target_kind,target_id,promotion_id);
CREATE INDEX IF NOT EXISTS promotion_code_batches_promotion_status_idx ON saas.promotion_code_batches(store_id,promotion_id,status,id);
CREATE INDEX IF NOT EXISTS promotion_codes_promotion_status_idx ON saas.promotion_codes(store_id,promotion_id,status,id);
CREATE UNIQUE INDEX IF NOT EXISTS promotion_operations_reservation_group_owner_key ON saas.promotion_operations(store_id,result_entity_id) WHERE operation_kind='reserve' AND result_entity_kind='reservation_group';
CREATE UNIQUE INDEX IF NOT EXISTS promotion_operations_redemption_group_owner_key ON saas.promotion_operations(store_id,result_entity_id) WHERE operation_kind='commit' AND result_entity_kind='redemption_group';
CREATE UNIQUE INDEX IF NOT EXISTS promotion_operations_settlement_entity_kind_key ON saas.promotion_operations(store_id,operation_kind,result_entity_kind,result_entity_id) WHERE operation_kind IN ('reserve','release','commit','expire');
CREATE INDEX IF NOT EXISTS promotion_usage_reservations_limit_idx ON saas.promotion_usage_reservations(store_id,promotion_id,status,expires_at,id);
CREATE INDEX IF NOT EXISTS promotion_usage_reservations_group_status_idx ON saas.promotion_usage_reservations(store_id,reservation_group_id,status,promotion_id,id);
CREATE INDEX IF NOT EXISTS promotion_usage_reservations_source_idx ON saas.promotion_usage_reservations(store_id,source_kind,source_reference,reservation_group_id,promotion_id,id);
CREATE INDEX IF NOT EXISTS promotion_usage_reservations_customer_limit_idx ON saas.promotion_usage_reservations(store_id,promotion_id,customer_id,status,expires_at,id);
CREATE INDEX IF NOT EXISTS promotion_usage_reservations_code_limit_idx ON saas.promotion_usage_reservations(store_id,code_id,status,expires_at,id);
CREATE INDEX IF NOT EXISTS promotion_usage_reservations_due_idx ON saas.promotion_usage_reservations(expires_at,store_id,reservation_group_id,id) WHERE status='reserved';
CREATE INDEX IF NOT EXISTS promotion_redemptions_analytics_idx ON saas.promotion_redemptions(store_id,promotion_id,currency,created_at,id);
CREATE INDEX IF NOT EXISTS promotion_redemptions_group_idx ON saas.promotion_redemptions(store_id,redemption_group_id,promotion_id,id);
CREATE INDEX IF NOT EXISTS promotion_redemptions_usage_idx ON saas.promotion_redemptions(store_id,promotion_id,created_at,id);
CREATE INDEX IF NOT EXISTS promotion_redemptions_customer_usage_idx ON saas.promotion_redemptions(store_id,promotion_id,customer_id,created_at,id);
CREATE INDEX IF NOT EXISTS promotion_redemptions_code_usage_idx ON saas.promotion_redemptions(store_id,code_id,created_at,id);
CREATE INDEX IF NOT EXISTS order_promotion_snapshots_order_idx ON saas.order_promotion_snapshots(store_id,order_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS order_promotion_snapshots_redemption_key ON saas.order_promotion_snapshots(store_id,redemption_id);
CREATE UNIQUE INDEX IF NOT EXISTS order_discount_allocations_snapshot_line_key ON saas.order_discount_allocations(store_id,snapshot_id,line_position,line_id) WHERE line_id IS NOT NULL;
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
DECLARE b jsonb:=p_document->'benefit'; t jsonb:=p_document->'targets'; a jsonb:=p_document->'audience'; tr jsonb:=p_document->'trigger'; s jsonb:=p_document->'schedule'; l jsonb:=p_document->'limits'; c jsonb:=p_document->'conditions'; cp jsonb:=p_document->'combinationPolicy'; m jsonb:=p_document->'marginPolicy'; x jsonb; y jsonb; starts timestamptz; ends timestamptz; last_quantity integer:=0; total_quantity bigint:=0;
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
  CASE b->>'kind'
    WHEN 'percentage' THEN RETURN saas.promotion_json_keys(b,ARRAY['kind','percentageBps'],ARRAY['kind','percentageBps']) AND saas.promotion_json_integer(b->'percentageBps',1,10000);
    WHEN 'fixed_amount' THEN RETURN saas.promotion_json_keys(b,ARRAY['kind','amountMinor','currency'],ARRAY['kind','amountMinor','currency']) AND saas.promotion_json_integer(b->'amountMinor',1,8000000000) AND b->>'currency' ~ '^[A-Z]{3}$';
    WHEN 'free_shipping' THEN RETURN saas.promotion_json_keys(b,ARRAY['kind'],ARRAY['kind']);
    WHEN 'quantity_tiers' THEN
      IF NOT saas.promotion_json_keys(b,ARRAY['kind','tiers'],ARRAY['kind','tiers']) OR pg_catalog.jsonb_typeof(b->'tiers')<>'array' OR pg_catalog.jsonb_array_length(b->'tiers') NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
      FOR x IN SELECT value FROM pg_catalog.jsonb_array_elements(b->'tiers') LOOP IF NOT saas.promotion_json_keys(x,ARRAY['minimumQuantity','percentageBps'],ARRAY['minimumQuantity','percentageBps']) OR NOT saas.promotion_json_integer(x->'minimumQuantity',1,1000000) OR NOT saas.promotion_json_integer(x->'percentageBps',1,10000) OR (x->>'minimumQuantity')::integer<=last_quantity THEN RETURN false; END IF; last_quantity:=(x->>'minimumQuantity')::integer; END LOOP;
      RETURN true;
    WHEN 'bundle_price' THEN
      IF NOT saas.promotion_json_keys(b,ARRAY['kind','items','bundlePriceMinor','currency'],ARRAY['kind','items','bundlePriceMinor','currency'])
         OR pg_catalog.jsonb_typeof(b->'items')<>'array' OR pg_catalog.jsonb_array_length(b->'items') NOT BETWEEN 2 AND 20
         OR NOT saas.promotion_json_integer(b->'bundlePriceMinor',0,8000000000) OR b->>'currency' !~ '^[A-Z]{3}$'
         OR t->>'mode'<>'selected' OR pg_catalog.jsonb_array_length(t->'exclude')<>0
      THEN RETURN false; END IF;
      FOR x IN SELECT value FROM pg_catalog.jsonb_array_elements(b->'items') LOOP
        IF NOT saas.promotion_json_keys(x,ARRAY['variantId','quantity'],ARRAY['variantId','quantity']) OR NOT saas.promotion_json_uuid(x->'variantId') OR NOT saas.promotion_json_integer(x->'quantity',1,1000000) THEN RETURN false; END IF;
        total_quantity:=total_quantity+(x->>'quantity')::bigint;
      END LOOP;
      IF total_quantity>1000000
         OR (SELECT count(*)<>count(DISTINCT item->>'variantId') FROM pg_catalog.jsonb_array_elements(b->'items') item)
         OR pg_catalog.jsonb_array_length(t->'include')<>pg_catalog.jsonb_array_length(b->'items')
         OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(t->'include') target WHERE target->>'kind'<>'variant' OR NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(b->'items') item WHERE item->>'variantId'=target->>'id'))
      THEN RETURN false; END IF;
      RETURN true;
    WHEN 'gift' THEN RETURN saas.promotion_json_keys(b,ARRAY['kind','giftVariantId','quantity','autoAdd'],ARRAY['kind','giftVariantId','quantity','autoAdd']) AND saas.promotion_json_uuid(b->'giftVariantId') AND saas.promotion_json_integer(b->'quantity',1,1000000) AND pg_catalog.jsonb_typeof(b->'autoAdd')='boolean';
    WHEN 'buy_x_get_y' THEN
      IF NOT saas.promotion_json_keys(b,ARRAY['kind','buyQuantity','receiveQuantity','discountPercentageBps','reward'],ARRAY['kind','buyQuantity','receiveQuantity','discountPercentageBps','reward']) OR NOT saas.promotion_json_integer(b->'buyQuantity',1,1000000) OR NOT saas.promotion_json_integer(b->'receiveQuantity',1,1000000) OR NOT saas.promotion_json_integer(b->'discountPercentageBps',1,10000) OR pg_catalog.jsonb_typeof(b->'reward')<>'object' THEN RETURN false; END IF;
      x:=b->'reward';
      IF x->>'strategy'='same_product_cheapest' THEN RETURN saas.promotion_json_keys(x,ARRAY['strategy'],ARRAY['strategy']);
      ELSIF x->>'strategy'='specific_variant' THEN RETURN saas.promotion_json_keys(x,ARRAY['strategy','variantId'],ARRAY['strategy','variantId']) AND saas.promotion_json_uuid(x->'variantId');
      ELSIF x->>'strategy'='selected_products_cheapest' THEN IF NOT saas.promotion_json_keys(x,ARRAY['strategy','productIds'],ARRAY['strategy','productIds']) OR pg_catalog.jsonb_typeof(x->'productIds')<>'array' OR NOT saas.promotion_json_array_unique(x->'productIds') OR pg_catalog.jsonb_array_length(x->'productIds') NOT BETWEEN 1 AND 100 THEN RETURN false; END IF; FOR y IN SELECT value FROM pg_catalog.jsonb_array_elements(x->'productIds') LOOP IF NOT saas.promotion_json_uuid(y) THEN RETURN false; END IF; END LOOP; RETURN true;
      ELSE RETURN false; END IF;
    ELSE RETURN false;
  END CASE;
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
    WHEN 'bundle_price' THEN RETURN v_prefix||v_target_prefix||(SELECT sum((item->>'quantity')::bigint) FROM pg_catalog.jsonb_array_elements(p_document->'benefit'->'items') item)||' ürün '||saas.promotion_money_tr_v1((p_document->'benefit'->>'bundlePriceMinor')::bigint,p_document->'benefit'->>'currency');
    WHEN 'buy_x_get_y' THEN
      v_percentage:=(p_document->'benefit'->>'discountPercentageBps')::numeric/100;
      RETURN v_prefix||v_target_prefix||(p_document->'benefit'->>'buyQuantity')||' al, '||(p_document->'benefit'->>'receiveQuantity')||CASE WHEN v_percentage=100 THEN ' bedava' ELSE ' üründe %'||CASE WHEN v_percentage=pg_catalog.trunc(v_percentage) THEN pg_catalog.trunc(v_percentage)::text ELSE v_percentage::text END||' indirim' END;
    WHEN 'gift' THEN RETURN v_prefix||(p_document->'benefit'->>'quantity')||' adet hediye ürün'||CASE WHEN (p_document->'benefit'->>'autoAdd')::boolean THEN ' otomatik eklenir' ELSE ' sepette seçilir' END;
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
  v_set_like boolean:=p_parent_key IN ('include','exclude','referenceIds','codes','productIds','items','paymentMethodIds','shippingMethodIds','salesChannels','benefitClasses','customerSegmentIds','customerTagIds','cartLines','categoryIds','collectionIds','submittedCodes');
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
     OR p_store_id IS NULL OR p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR pg_catalog.pg_column_size(p_payload)>786432
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
  ELSIF p_kind IN ('code_batch','code_batch_status') THEN
    IF (saas.promotion_json_keys(p_result,ARRAY['id','promotionId','version','status','count','prefix','codeLength','perCustomerUsage','expiresAt','createdAt','updatedAt'],ARRAY['id','promotionId','version','status','count','prefix','codeLength','perCustomerUsage','expiresAt','createdAt','updatedAt'])
      AND saas.promotion_json_uuid(p_result->'id') AND saas.promotion_json_uuid(p_result->'promotionId')
      AND saas.promotion_json_integer(p_result->'version',1,9007199254740991)
      AND p_result->>'status' IN ('active','paused','revoked')
      AND (p_kind<>'code_batch' OR p_result->>'status'='active')
      AND saas.promotion_json_integer(p_result->'count',1,10000)
      AND pg_catalog.jsonb_typeof(p_result->'prefix')='string' AND p_result->>'prefix' ~ '^(|[A-Z0-9][A-Z0-9_-]{0,19})$'
      AND saas.promotion_json_integer(p_result->'codeLength',16,64)
      AND (p_result->>'codeLength')::integer-pg_catalog.char_length(p_result->>'prefix')>=16
      AND saas.promotion_json_integer(p_result->'perCustomerUsage',1,1000000)
      AND pg_catalog.jsonb_typeof(p_result->'expiresAt') IN ('null','string')
      AND (p_result->'expiresAt'='null'::jsonb OR saas.promotion_json_utc_timestamp(p_result->'expiresAt'))
      AND saas.promotion_json_utc_timestamp(p_result->'createdAt') AND saas.promotion_json_utc_timestamp(p_result->'updatedAt')) IS NOT TRUE THEN RETURN false; END IF;
    RETURN (p_result->>'updatedAt')::timestamptz >= (p_result->>'createdAt')::timestamptz
      AND (p_result->'expiresAt'='null'::jsonb OR (p_result->>'expiresAt')::timestamptz>(p_result->>'createdAt')::timestamptz);
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
  SELECT CASE WHEN p_kind IN ('create','update','duplicate') THEN 'promotions.manage_draft' WHEN p_kind IN ('lifecycle','code_batch','code_batch_status') THEN 'promotions.publish' WHEN p_kind='archive' THEN 'promotions.archive' ELSE NULL END
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
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
DECLARE v_reference jsonb; v_included boolean:=p_targets->>'mode'='all'; v_hit boolean;
BEGIN
  IF NOT v_included THEN
    FOR v_reference IN SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(p_targets->'include','[]'::jsonb)) LOOP
      v_hit:=CASE v_reference->>'kind'
        WHEN 'product' THEN v_reference->>'id'=p_line->>'productId'
        WHEN 'variant' THEN v_reference->>'id'=p_line->>'variantId'
        WHEN 'category' THEN COALESCE(p_line->'categoryIds','[]'::jsonb) @> pg_catalog.jsonb_build_array(v_reference->>'id')
        WHEN 'brand' THEN v_reference->>'id'=p_line->>'brandId' OR COALESCE(p_line->'brandIds','[]'::jsonb) @> pg_catalog.jsonb_build_array(v_reference->>'id')
        WHEN 'collection' THEN COALESCE(p_line->'collectionIds','[]'::jsonb) @> pg_catalog.jsonb_build_array(v_reference->>'id')
        ELSE false END;
      IF v_hit THEN v_included:=true; EXIT; END IF;
    END LOOP;
  END IF;
  IF NOT v_included THEN RETURN false; END IF;
  FOR v_reference IN SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(p_targets->'exclude','[]'::jsonb)) LOOP
    v_hit:=CASE v_reference->>'kind'
      WHEN 'product' THEN v_reference->>'id'=p_line->>'productId'
      WHEN 'variant' THEN v_reference->>'id'=p_line->>'variantId'
      WHEN 'category' THEN COALESCE(p_line->'categoryIds','[]'::jsonb) @> pg_catalog.jsonb_build_array(v_reference->>'id')
      WHEN 'brand' THEN v_reference->>'id'=p_line->>'brandId' OR COALESCE(p_line->'brandIds','[]'::jsonb) @> pg_catalog.jsonb_build_array(v_reference->>'id')
      WHEN 'collection' THEN COALESCE(p_line->'collectionIds','[]'::jsonb) @> pg_catalog.jsonb_build_array(v_reference->>'id')
      ELSE false END;
    IF v_hit THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$fn$;

SET LOCAL check_function_bodies = off;
CREATE OR REPLACE FUNCTION saas.promotion_evaluator_consumed_line_capacity(p_rule jsonb,p_line jsonb,p_consumed_quantity bigint,p_prior_discount bigint)
RETURNS bigint LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE
    WHEN p_consumed_quantity<0 OR p_consumed_quantity>(p_line->>'quantity')::bigint THEN 0
    WHEN p_rule->'marginPolicy'->>'kind'='floor_at_cost' THEN CASE WHEN p_line->>'unitCostMinor' IS NULL THEN 0 ELSE GREATEST(0,
      ((p_line->>'unitPriceMinor')::bigint-(p_line->>'unitCostMinor')::bigint)*p_consumed_quantity-p_prior_discount) END
    ELSE GREATEST(0,(p_line->>'unitPriceMinor')::bigint*p_consumed_quantity-p_prior_discount)
  END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_bundle_facts_v1(p_benefit jsonb,p_lines jsonb)
RETURNS TABLE(bundle_count bigint,complete_value bigint,floor_capacity bigint,unknown_cost boolean) LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  WITH items AS MATERIALIZED (
    SELECT item->>'variantId' variant_id,(item->>'quantity')::bigint required_quantity
    FROM pg_catalog.jsonb_array_elements(p_benefit->'items') item
  ), availability AS MATERIALIZED (
    SELECT items.variant_id,items.required_quantity,COALESCE(sum((line->>'quantity')::bigint),0)::bigint available_quantity
    FROM items LEFT JOIN pg_catalog.jsonb_array_elements(p_lines) line ON line->>'variantId'=items.variant_id
    GROUP BY items.variant_id,items.required_quantity
  ), complete AS MATERIALIZED (
    SELECT COALESCE(min(available_quantity/required_quantity),0)::bigint bundle_count FROM availability
  ), ordered AS MATERIALIZED (
    SELECT items.variant_id,items.required_quantity,line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
      CASE WHEN line->>'unitCostMinor' IS NULL THEN NULL ELSE (line->>'unitCostMinor')::bigint END cost,
      sum((line->>'quantity')::bigint) OVER (PARTITION BY items.variant_id ORDER BY (line->>'position')::integer,line->>'lineId')-(line->>'quantity')::bigint prior_quantity
    FROM items JOIN pg_catalog.jsonb_array_elements(p_lines) line ON line->>'variantId'=items.variant_id
  ), consumed AS MATERIALIZED (
    SELECT ordered.*,LEAST(ordered.quantity,GREATEST(0,complete.bundle_count*ordered.required_quantity-ordered.prior_quantity))::bigint take_quantity
    FROM complete JOIN ordered ON ordered.prior_quantity<complete.bundle_count*ordered.required_quantity
  )
  SELECT complete.bundle_count,
    COALESCE(sum(consumed.price*consumed.take_quantity),0)::bigint,
    COALESCE(sum(CASE WHEN consumed.cost IS NULL THEN 0 ELSE GREATEST(0,(consumed.price-consumed.cost)*consumed.take_quantity) END),0)::bigint,
    COALESCE(bool_or(consumed.cost IS NULL) FILTER (WHERE consumed.take_quantity>0),false)
  FROM complete LEFT JOIN consumed ON consumed.take_quantity>0
  GROUP BY complete.bundle_count
$fn$;

-- One bounded candidate/fact relation is shared by every evaluation.  Keeping
-- this as an inlineable SQL function makes its plan observable in the PG16
-- harness and prevents a hidden per-product repository/query fan-out.
CREATE OR REPLACE FUNCTION saas.promotion_evaluator_candidate_facts(p_store_id uuid,p_context jsonb,p_now timestamptz,p_selected jsonb)
RETURNS TABLE(id uuid,name text,version bigint,rule_document jsonb,created_at timestamptz,used bigint,budget bigint,customer_used bigint,eligible_value bigint,eligible_quantity bigint,gift_variant_valid boolean,gift_stock_tracking boolean,gift_available_quantity bigint,selected_override boolean)
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
  candidate_lines AS MATERIALIZED (
    SELECT candidate.id promotion_id,lines.line,
      saas.promotion_evaluator_catalog_line_matches(p_store_id,p_context->>'currency',candidate.rule_document->'targets',lines.line) matched,
      saas.promotion_evaluator_line_capacity(candidate.rule_document,lines.line,0) capacity
    FROM candidates candidate CROSS JOIN lines
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
    SELECT p.id promotion_id,(p.rule_document->'benefit'->>'giftVariantId')::uuid variant_id,(p.rule_document->'benefit'->>'quantity')::bigint required_quantity,true enforce_stock
    FROM candidates p
    WHERE p.rule_document->'benefit'->>'kind'='gift'
    UNION ALL
    SELECT p.id,(p.rule_document->'benefit'->'reward'->>'variantId')::uuid,0::bigint,false
    FROM candidates p WHERE p.rule_document->'benefit'->>'kind'='buy_x_get_y' AND p.rule_document->'benefit'->'reward'->>'strategy'='specific_variant'
  ), gift_variant_authority AS MATERIALIZED (
    SELECT requested.variant_id,variant.stock_tracking,
      CASE WHEN variant.stock_tracking THEN saas.storefront_available_stock(p_store_id,variant.id,p_now,NULL) ELSE 9007199254740991::bigint END available_quantity
    FROM (SELECT DISTINCT variant_id FROM gift_variants) requested
    JOIN saas.product_variants variant ON variant.store_id=p_store_id AND variant.id=requested.variant_id AND variant.status='active' AND variant.archived_at IS NULL
    JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active' AND product.archived_at IS NULL
  ), valid_gift_variants AS MATERIALIZED (
    SELECT gift.promotion_id,gift.variant_id FROM gift_variants gift
    JOIN gift_variant_authority authority ON authority.variant_id=gift.variant_id
    WHERE NOT gift.enforce_stock OR NOT authority.stock_tracking OR authority.available_quantity>=gift.required_quantity
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
    SELECT candidate.id FROM candidates candidate LEFT JOIN valid_gift_variants variant ON variant.promotion_id=candidate.id AND variant.variant_id=(candidate.rule_document->'benefit'->'reward'->>'variantId')::uuid WHERE candidate.rule_document->'benefit'->>'kind'='buy_x_get_y' AND candidate.rule_document->'benefit'->'reward'->>'strategy'='specific_variant' AND variant.variant_id IS NULL
    UNION
    SELECT candidate.id FROM candidates candidate CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(candidate.rule_document->'benefit'->'reward'->'productIds') reference(value) LEFT JOIN saas.products product ON product.store_id=p_store_id AND product.id=reference.value::uuid AND product.status='active' AND product.archived_at IS NULL WHERE candidate.rule_document->'benefit'->>'kind'='buy_x_get_y' AND candidate.rule_document->'benefit'->'reward'->>'strategy'='selected_products_cheapest' AND product.id IS NULL
  ), aggregated AS MATERIALIZED (
    SELECT p.id,p.name,p.version,p.rule_document,p.created_at,p.selected_override,COALESCE(u.used,0)::bigint used,COALESCE(u.budget,0)::bigint budget,COALESCE(cu.used,0)::bigint customer_used,
      COALESCE(sum((l.line->>'unitPriceMinor')::bigint*(l.line->>'quantity')::bigint) FILTER (WHERE l.matched),0)::bigint eligible_value,
      COALESCE(sum((l.line->>'quantity')::bigint) FILTER (WHERE l.matched),0)::bigint eligible_quantity,
      COALESCE(sum(l.capacity) FILTER (WHERE l.matched),0)::bigint eligible_margin,
      CASE WHEN p.rule_document->'benefit'->>'kind'<>'gift' THEN true ELSE EXISTS(SELECT 1 FROM valid_gift_variants gift WHERE gift.promotion_id=p.id AND gift.variant_id=(p.rule_document->'benefit'->>'giftVariantId')::uuid) END gift_variant_valid,
      COALESCE(gift_authority.stock_tracking,false) gift_stock_tracking,
      COALESCE(gift_authority.available_quantity,0)::bigint gift_available_quantity
    FROM candidates p LEFT JOIN candidate_lines l ON l.promotion_id=p.id LEFT JOIN usage u ON u.promotion_id=p.id LEFT JOIN customer_usage cu ON cu.promotion_id=p.id
    LEFT JOIN gift_variant_authority gift_authority
      ON p.rule_document->'benefit'->>'kind'='gift'
      AND gift_authority.variant_id=(p.rule_document->'benefit'->>'giftVariantId')::uuid
    WHERE NOT EXISTS(SELECT 1 FROM invalid_references invalid WHERE invalid.promotion_id=p.id)
      AND (p.rule_document->'schedule'->>'startsAt' IS NULL OR (p.rule_document->'schedule'->>'startsAt')::timestamptz<=p_now)
      AND (p.rule_document->'schedule'->>'endsAt' IS NULL OR p_now<(p.rule_document->'schedule'->>'endsAt')::timestamptz)
    GROUP BY p.id,p.name,p.version,p.rule_document,p.created_at,p.selected_override,u.used,u.budget,cu.used,gift_authority.stock_tracking,gift_authority.available_quantity
  ), ranked AS (
    SELECT a.*,LEAST(
      CASE a.rule_document->'benefit'->>'kind'
        WHEN 'percentage' THEN a.eligible_value*(a.rule_document->'benefit'->>'percentageBps')::bigint/10000
        WHEN 'fixed_amount' THEN CASE WHEN a.rule_document->'benefit'->>'currency'=p_context->>'currency' THEN LEAST(a.eligible_value,(a.rule_document->'benefit'->>'amountMinor')::bigint) ELSE 0 END
        WHEN 'free_shipping' THEN (p_context->>'shippingBeforeDiscountMinor')::bigint
        WHEN 'quantity_tiers' THEN a.eligible_value*COALESCE((SELECT max((tier->>'percentageBps')::bigint) FROM pg_catalog.jsonb_array_elements(a.rule_document->'benefit'->'tiers') tier WHERE (tier->>'minimumQuantity')::bigint<=a.eligible_quantity),0)/10000
        WHEN 'bundle_price' THEN CASE WHEN a.rule_document->'benefit'->>'currency'=p_context->>'currency' THEN GREATEST(0,COALESCE(bundle.complete_value,0)-COALESCE(bundle.bundle_count,0)*(a.rule_document->'benefit'->>'bundlePriceMinor')::bigint) ELSE 0 END
        WHEN 'buy_x_get_y' THEN COALESCE(xy.saving,0)
        WHEN 'gift' THEN CASE
          WHEN a.rule_document->'benefit'->>'autoAdd'='true' THEN 0
          WHEN gift.full_saving IS NULL OR gift.full_saving<=0
            OR gift.full_saving>a.eligible_value
            OR gift.full_saving>COALESCE((a.rule_document->'limits'->>'orderMaximumMinor')::bigint,8000000000)
            OR gift.full_saving>CASE WHEN a.rule_document->'limits'->>'budgetMinor' IS NULL THEN 8000000000 ELSE GREATEST(0,(a.rule_document->'limits'->>'budgetMinor')::bigint-a.budget) END
            OR gift.full_saving>gift.line_capacity
            OR (a.rule_document->'marginPolicy'->>'kind'='maximum_percentage' AND gift.full_saving>a.eligible_value*(a.rule_document->'marginPolicy'->>'maximumPercentageBps')::bigint/10000)
          THEN 0 ELSE gift.full_saving END
        ELSE 0 END,
      COALESCE((a.rule_document->'limits'->>'orderMaximumMinor')::bigint,8000000000),
      CASE WHEN a.rule_document->'limits'->>'budgetMinor' IS NULL THEN 8000000000 ELSE GREATEST(0,(a.rule_document->'limits'->>'budgetMinor')::bigint-a.budget) END,
      CASE a.rule_document->'marginPolicy'->>'kind'
        WHEN 'floor_at_cost' THEN CASE WHEN a.rule_document->'benefit'->>'kind'='gift' THEN 8000000000 WHEN a.rule_document->'benefit'->>'kind'='bundle_price' THEN CASE WHEN COALESCE(bundle.unknown_cost,false) THEN 0 ELSE COALESCE(bundle.floor_capacity,0) END ELSE a.eligible_margin END
        WHEN 'maximum_percentage' THEN CASE WHEN a.rule_document->'benefit'->>'kind'='gift' THEN 8000000000 ELSE CASE WHEN a.rule_document->'benefit'->>'kind'='bundle_price' THEN COALESCE(bundle.complete_value,0) ELSE a.eligible_value END*(a.rule_document->'marginPolicy'->>'maximumPercentageBps')::bigint/10000 END
        ELSE 8000000000 END
    ) saving
    FROM aggregated a
    LEFT JOIN LATERAL saas.promotion_bundle_facts_v1(a.rule_document->'benefit',(SELECT COALESCE(pg_catalog.jsonb_agg(line ORDER BY (line->>'position')::integer,line->>'lineId'),'[]'::jsonb) FROM lines)) bundle ON a.rule_document->'benefit'->>'kind'='bundle_price'
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
    LEFT JOIN LATERAL (
      SELECT
        (line.line->>'unitPriceMinor')::bigint*(a.rule_document->'benefit'->>'quantity')::bigint full_saving,
        saas.promotion_evaluator_consumed_line_capacity(a.rule_document,line.line,(a.rule_document->'benefit'->>'quantity')::bigint,0) line_capacity
      FROM lines line
      WHERE line.line->>'variantId'=a.rule_document->'benefit'->>'giftVariantId'
        AND (line.line->>'quantity')::bigint>=(a.rule_document->'benefit'->>'quantity')::bigint
      ORDER BY (line.line->>'position')::integer,line.line->>'lineId'
      LIMIT 1
    ) gift ON a.rule_document->'benefit'->>'kind'='gift' AND a.rule_document->'benefit'->>'autoAdd'='false'
  )
  SELECT id,name,version,rule_document,created_at,used,budget,customer_used,eligible_value,eligible_quantity,gift_variant_valid,gift_stock_tracking,gift_available_quantity,selected_override FROM ranked
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

CREATE OR REPLACE FUNCTION saas.promotion_code_batch_integrity_valid_v1(p_store_id uuid,p_batch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT COALESCE((
    SELECT (SELECT count(*) FROM saas.promotion_codes code WHERE code.store_id=batch.store_id AND code.batch_id=batch.id)=batch.requested_count
      AND NOT EXISTS(
        SELECT 1 FROM saas.promotion_codes code
        WHERE code.store_id=batch.store_id AND code.batch_id=batch.id
          AND (code.promotion_id<>batch.promotion_id OR code.code !~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'
            OR pg_catalog.char_length(code.code)<>batch.code_length
            OR pg_catalog.left(code.code,pg_catalog.char_length(batch.prefix))<>batch.prefix
            OR pg_catalog.substr(code.code,pg_catalog.char_length(batch.prefix)+1) !~ '^[A-F0-9]+$'
            OR code.status NOT IN ('active','paused','revoked')
            OR (batch.status='active' AND code.status NOT IN ('active','revoked'))
            OR (batch.status='paused' AND code.status NOT IN ('paused','revoked'))
            OR (batch.status='revoked' AND code.status<>'revoked'))
      )
    FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=p_batch_id
  ),false)
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluator_code_facts(p_store_id uuid,p_context jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
  WITH durable_customer AS MATERIALIZED (
    SELECT customer.id
    FROM saas.customers customer
    WHERE p_context->'customerId'<>'null'::jsonb AND customer.store_id=p_store_id
      AND customer.id=(p_context->>'customerId')::uuid AND customer.status='active' AND customer.archived_at IS NULL
  ), submitted_matches AS MATERIALIZED (
    SELECT code.store_id,code.promotion_id,code.id,code.batch_id,code.code,code.status
    FROM saas.promotion_codes code
    JOIN pg_catalog.jsonb_array_elements_text(p_context->'submittedCodes') submitted(code_value) ON submitted.code_value=code.code
    WHERE code.store_id=p_store_id
  ), batch_integrity AS MATERIALIZED (
    SELECT submitted.batch_id,saas.promotion_code_batch_integrity_valid_v1(p_store_id,submitted.batch_id) valid
    FROM (SELECT DISTINCT match.batch_id FROM submitted_matches match WHERE match.batch_id IS NOT NULL) submitted
  ), matches AS MATERIALIZED (
    SELECT DISTINCT ON (code.promotion_id) code.promotion_id,code.id code_id,code.batch_id,code.code
    FROM submitted_matches code
    LEFT JOIN saas.promotion_code_batches batch ON batch.store_id=code.store_id AND batch.promotion_id=code.promotion_id AND batch.id=code.batch_id
    LEFT JOIN batch_integrity integrity ON integrity.batch_id=code.batch_id
    WHERE code.status='active' AND (
      code.batch_id IS NULL OR (
        integrity.valid IS TRUE AND batch.status='active' AND (batch.expires_at IS NULL OR p_now<batch.expires_at)
        AND EXISTS(SELECT 1 FROM durable_customer)
        AND NOT EXISTS(SELECT 1 FROM saas.promotion_redemptions redemption WHERE redemption.store_id=code.store_id AND redemption.code_id=code.id)
        AND NOT EXISTS(SELECT 1 FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=code.store_id AND reservation.code_id=code.id AND reservation.status='reserved' AND reservation.expires_at>p_now)
        AND (
          SELECT count(DISTINCT usage_code_id) FROM (
            SELECT redemption.code_id usage_code_id FROM saas.promotion_redemptions redemption,durable_customer customer
            WHERE redemption.store_id=code.store_id AND redemption.customer_id=customer.id AND redemption.code_id IS NOT NULL
              AND EXISTS(SELECT 1 FROM saas.promotion_codes used_code WHERE used_code.store_id=redemption.store_id AND used_code.id=redemption.code_id AND used_code.batch_id=batch.id)
            UNION
            SELECT reservation.code_id FROM saas.promotion_usage_reservations reservation,durable_customer customer
            WHERE reservation.store_id=code.store_id AND reservation.customer_id=customer.id AND reservation.code_id IS NOT NULL
              AND reservation.status='reserved' AND reservation.expires_at>p_now
              AND EXISTS(SELECT 1 FROM saas.promotion_codes held_code WHERE held_code.store_id=reservation.store_id AND held_code.id=reservation.code_id AND held_code.batch_id=batch.id)
          ) usage
        )<batch.per_customer_usage
      )
    )
    ORDER BY code.promotion_id,pg_catalog.convert_to(code.code,'UTF8'),code.id
  )
  SELECT COALESCE(pg_catalog.jsonb_object_agg(promotion_id::text,pg_catalog.jsonb_build_object('code',code,'codeId',code_id,'batchId',batch_id)),'{}'::jsonb) FROM matches
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluate_internal_v1(p_store_id uuid,p_context jsonb,p_now timestamptz,p_selected jsonb,p_materialized_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_currency text:=p_context->>'currency'; v_lines jsonb:=COALESCE(p_materialized_lines,'[]'::jsonb); v_fact_context jsonb; v_subtotal bigint:=0; v_shipping bigint:=0; v_line_discount bigint:=0; v_shipping_discount bigint:=0; v_paid jsonb:='{}'::jsonb; v_candidate record; v_rule jsonb; v_benefit jsonb; v_saving bigint; v_eligible_value bigint; v_eligible_quantity bigint; v_available bigint; v_remaining_available bigint; v_cap bigint; v_bps integer; v_line jsonb; v_allocation_line record; v_reward_line record; v_bundle_line record; v_line_id text; v_line_value bigint; v_allocation bigint; v_remaining bigint; v_count integer; v_candidate_count bigint; v_index integer; v_normalized_code text; v_eligible jsonb:='[]'::jsonb; v_applied jsonb:='[]'::jsonb; v_applied_rules jsonb:='[]'::jsonb; v_rejected jsonb:='[]'::jsonb; v_effects jsonb:='[]'::jsonb; v_shipping_effects jsonb:='[]'::jsonb; v_gifts jsonb:='[]'::jsonb; v_used_non_shipping boolean:=false; v_bundle_unknown boolean:=false; v_kind text; v_line_quantity bigint; v_take bigint; v_bundle_quantity bigint; v_complete_quantity bigint; v_cart_variant_quantities jsonb:='{}'::jsonb; v_cart_variant_quantity bigint; v_auto_gift_quantities jsonb:='{}'::jsonb; v_auto_gift_prior_quantity bigint; v_auto_gift_next_quantity bigint; v_auto_gift_prior_chunks integer; v_auto_gift_next_chunks integer; v_order_line_count integer;
BEGIN
  IF p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR saas.promotion_evaluator_context_valid(p_store_id,p_context) IS NOT TRUE
     OR pg_catalog.jsonb_typeof(p_materialized_lines) IS DISTINCT FROM 'array'
  THEN RETURN saas.promotion_evaluator_empty_result(v_currency,'promotion_context_unavailable'); END IF;
  SELECT count(*) INTO v_candidate_count FROM saas.promotions promotion
  WHERE promotion.store_id=p_store_id AND promotion.status IN ('active','scheduled')
    AND promotion.id IS DISTINCT FROM CASE WHEN saas.promotion_json_uuid(p_selected->'id') THEN (p_selected->>'id')::uuid END;
  v_candidate_count:=v_candidate_count+CASE WHEN p_selected IS NULL THEN 0 ELSE 1 END;
  IF v_candidate_count>100 THEN RETURN saas.promotion_evaluator_empty_result(v_currency,'promotion_configuration_limit_exceeded'); END IF;
  IF pg_catalog.jsonb_array_length(v_lines)<>pg_catalog.jsonb_array_length(p_context->'cartLines') THEN RETURN saas.promotion_evaluator_empty_result(v_currency,'promotion_context_unavailable'); END IF;
  v_order_line_count:=pg_catalog.jsonb_array_length(v_lines);
  SELECT COALESCE(pg_catalog.jsonb_object_agg(variant_quantity.variant_id,variant_quantity.quantity),'{}'::jsonb)
  INTO v_cart_variant_quantities
  FROM (
    SELECT line->>'variantId' variant_id,sum((line->>'quantity')::bigint)::bigint quantity
    FROM pg_catalog.jsonb_array_elements(v_lines) line
    GROUP BY line->>'variantId'
  ) variant_quantity;
  SELECT COALESCE(sum((line->>'unitPriceMinor')::numeric*(line->>'quantity')::numeric),0) INTO v_subtotal FROM pg_catalog.jsonb_array_elements(v_lines) line;
  v_shipping:=(p_context->>'shippingBeforeDiscountMinor')::bigint;
  IF v_subtotal::numeric+v_shipping::numeric>8000000000 THEN RETURN saas.promotion_evaluator_empty_result(v_currency,'promotion_context_unavailable'); END IF;
  v_fact_context:=p_context||pg_catalog.jsonb_build_object('cartLines',v_lines,'audienceFacts',saas.promotion_evaluator_audience_facts(p_store_id,p_context,p_now),'codeFacts',saas.promotion_evaluator_code_facts(p_store_id,p_context,p_now));
  FOR v_candidate IN SELECT * FROM saas.promotion_evaluator_candidate_facts(p_store_id,v_fact_context,p_now,p_selected) LOOP
    v_rule:=v_candidate.rule_document; v_benefit:=v_rule->'benefit'; v_kind:=v_benefit->>'kind'; v_normalized_code:=NULL;
    IF v_rule->'trigger'->>'kind'='code' THEN
      IF v_candidate.selected_override THEN
        v_normalized_code:=CASE WHEN (v_fact_context->'codeFacts')->(v_candidate.id::text)->>'batchId' IS NOT NULL
          THEN (v_fact_context->'codeFacts')->(v_candidate.id::text)->>'code' ELSE NULL END;
        IF v_normalized_code IS NULL THEN
        SELECT submitted.value INTO v_normalized_code
        FROM pg_catalog.jsonb_array_elements_text(v_fact_context->'submittedCodes') submitted(value)
        WHERE EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_rule->'trigger'->'codes') allowed(value) WHERE allowed.value=submitted.value)
          AND (
            NOT EXISTS(SELECT 1 FROM saas.promotion_codes persisted WHERE persisted.store_id=p_store_id AND persisted.code=submitted.value)
            OR EXISTS(
              SELECT 1 FROM saas.promotion_codes persisted
              WHERE persisted.store_id=p_store_id AND persisted.promotion_id=v_candidate.id
                AND persisted.batch_id IS NULL AND persisted.code=submitted.value AND persisted.status='active'
            )
          )
        ORDER BY submitted.value LIMIT 1;
        END IF;
      ELSE v_normalized_code:=(v_fact_context->'codeFacts')->(v_candidate.id::text)->>'code';
      END IF;
      IF v_normalized_code IS NULL THEN CONTINUE; END IF;
    END IF;
    IF NOT saas.promotion_evaluator_audience_matches(p_store_id,v_rule->'audience',v_fact_context) THEN CONTINUE; END IF;
    v_eligible_value:=v_candidate.eligible_value;
    v_eligible_quantity:=v_candidate.eligible_quantity;
    IF (v_rule->'limits'->>'perCustomerUsage') IS NOT NULL AND p_context->'customerId'='null'::jsonb THEN
      v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','customer_identity_required'));
      CONTINUE;
    END IF;
    IF v_rule->'marginPolicy'->>'kind'='floor_at_cost' AND NOT (v_kind='gift' AND v_benefit->>'autoAdd'='true') THEN
      IF v_kind='bundle_price' THEN
        SELECT unknown_cost INTO v_bundle_unknown FROM saas.promotion_bundle_facts_v1(v_benefit,v_lines);
      ELSE
        SELECT EXISTS(
          SELECT 1 FROM pg_catalog.jsonb_array_elements(v_lines) line
          WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line)
            AND line->'unitCostMinor'='null'::jsonb
        ) INTO v_bundle_unknown;
      END IF;
      IF v_bundle_unknown THEN
        v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','margin_unknown_cost'));
        CONTINUE;
      END IF;
    END IF;
    IF (v_rule->'targets'->>'mode'='selected' AND v_eligible_value=0) OR v_subtotal<(v_rule->'conditions'->>'minimumBasketMinor')::bigint OR (SELECT COALESCE(sum((line->>'quantity')::bigint),0) FROM pg_catalog.jsonb_array_elements(v_lines) line)<(v_rule->'conditions'->>'minimumQuantity')::bigint OR v_eligible_quantity<(v_rule->'conditions'->>'minimumProductQuantity')::bigint OR (v_rule->'conditions' ? 'paymentMethodIds' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_rule->'conditions'->'paymentMethodIds') id WHERE id=p_context->>'paymentMethodId')) OR (v_rule->'conditions' ? 'shippingMethodIds' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_rule->'conditions'->'shippingMethodIds') id WHERE id=p_context->>'shippingMethodId')) OR (v_rule->'conditions' ? 'salesChannels' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_rule->'conditions'->'salesChannels') channel WHERE channel=p_context->>'salesChannel')) OR ((v_rule->'limits'->>'totalUsage') IS NOT NULL AND v_candidate.used>=(v_rule->'limits'->>'totalUsage')::bigint) OR ((v_rule->'limits'->>'perCustomerUsage') IS NOT NULL AND v_candidate.customer_used>=(v_rule->'limits'->>'perCustomerUsage')::bigint) THEN CONTINUE; END IF;
    IF v_kind='gift' AND v_candidate.gift_variant_valid IS NOT TRUE THEN
      v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','conditions_not_met'));
      CONTINUE;
    END IF;
    IF v_kind='gift' AND v_benefit->>'autoAdd'='false' AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_lines) gift_line
      WHERE gift_line->>'variantId'=v_benefit->>'giftVariantId' AND (gift_line->>'quantity')::bigint>=(v_benefit->>'quantity')::bigint
    ) THEN
      v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','conditions_not_met'));
      CONTINUE;
    END IF;
    v_eligible:=v_eligible||pg_catalog.jsonb_build_array(v_candidate.id);
    IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_applied_rules) prior WHERE NOT saas.promotion_combination_compatible(prior,v_rule)) THEN
      v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','not_combinable'));
      CONTINUE;
    END IF;
    v_saving:=0;
    IF v_kind='percentage' THEN v_saving:=v_eligible_value*(v_benefit->>'percentageBps')::integer/10000;
    ELSIF v_kind='fixed_amount' AND v_benefit->>'currency'=v_currency THEN v_saving:=LEAST(v_eligible_value,(v_benefit->>'amountMinor')::bigint);
    ELSIF v_kind='free_shipping' THEN v_saving:=GREATEST(0,v_shipping-v_shipping_discount);
    ELSIF v_kind='quantity_tiers' THEN SELECT COALESCE(max((tier->>'percentageBps')::integer),0) INTO v_bps FROM pg_catalog.jsonb_array_elements(v_benefit->'tiers') tier WHERE (tier->>'minimumQuantity')::integer<=v_eligible_quantity; v_saving:=v_eligible_value*v_bps/10000;
    ELSIF v_kind='bundle_price' AND v_benefit->>'currency'=v_currency THEN
      SELECT bundle_count,complete_value INTO v_complete_quantity,v_cap FROM saas.promotion_bundle_facts_v1(v_benefit,v_lines);
      v_saving:=GREATEST(0,v_cap-v_complete_quantity*(v_benefit->>'bundlePriceMinor')::bigint);
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
    ELSIF v_kind='gift' AND v_candidate.gift_variant_valid THEN
      IF v_benefit->>'autoAdd'='true' THEN v_saving:=0;
      ELSE
        SELECT gift_line INTO v_line FROM pg_catalog.jsonb_array_elements(v_lines) gift_line
        WHERE gift_line->>'variantId'=v_benefit->>'giftVariantId' AND (gift_line->>'quantity')::bigint>=(v_benefit->>'quantity')::bigint
        ORDER BY (gift_line->>'position')::integer,gift_line->>'lineId' LIMIT 1;
        v_saving:=(v_line->>'unitPriceMinor')::bigint*(v_benefit->>'quantity')::bigint;
      END IF;
    ELSE CONTINUE; END IF;
    IF v_kind='gift' AND v_benefit->>'autoAdd'='false' THEN
      v_cap:=LEAST(
        v_eligible_value,
        COALESCE((v_rule->'limits'->>'orderMaximumMinor')::bigint,8000000000),
        CASE WHEN v_rule->'limits'->>'budgetMinor' IS NULL THEN 8000000000 ELSE GREATEST(0,(v_rule->'limits'->>'budgetMinor')::bigint-v_candidate.budget) END,
        saas.promotion_evaluator_consumed_line_capacity(v_rule,v_line,(v_benefit->>'quantity')::bigint,COALESCE((v_paid->>(v_line->>'lineId'))::bigint,0))
      );
      IF v_rule->'marginPolicy'->>'kind'='maximum_percentage' THEN
        v_cap:=LEAST(v_cap,v_eligible_value*(v_rule->'marginPolicy'->>'maximumPercentageBps')::bigint/10000);
      END IF;
      IF v_saving<=0 OR v_cap<v_saving THEN
        v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','conditions_not_met'));
        CONTINUE;
      END IF;
    ELSIF v_kind<>'gift' THEN
      v_saving:=LEAST(v_saving,COALESCE((v_rule->'limits'->>'orderMaximumMinor')::bigint,v_saving));
      IF (v_rule->'limits'->>'budgetMinor') IS NOT NULL THEN v_saving:=LEAST(v_saving,GREATEST(0,(v_rule->'limits'->>'budgetMinor')::bigint-v_candidate.budget)); END IF;
      IF v_rule->'marginPolicy'->>'kind'='floor_at_cost' THEN
        IF v_kind='bundle_price' THEN
          WITH items AS MATERIALIZED (
            SELECT item->>'variantId' variant_id,(item->>'quantity')::bigint required_quantity FROM pg_catalog.jsonb_array_elements(v_benefit->'items') item
          ), ordered AS MATERIALIZED (
            SELECT line,items.required_quantity,(line->>'quantity')::bigint quantity,
              sum((line->>'quantity')::bigint) OVER (PARTITION BY items.variant_id ORDER BY (line->>'position')::integer,line->>'lineId')-(line->>'quantity')::bigint prior_quantity
            FROM items JOIN pg_catalog.jsonb_array_elements(v_lines) line ON line->>'variantId'=items.variant_id
          )
          SELECT COALESCE(sum(saas.promotion_evaluator_consumed_line_capacity(v_rule,line,LEAST(quantity,GREATEST(0,v_complete_quantity*required_quantity-prior_quantity))::bigint,COALESCE((v_paid->>(line->>'lineId'))::bigint,0))),0)
          INTO v_cap FROM ordered WHERE prior_quantity<v_complete_quantity*required_quantity;
        ELSE
          SELECT COALESCE(sum(saas.promotion_evaluator_line_capacity(v_rule,line,COALESCE((v_paid->>(line->>'lineId'))::bigint,0))),0) INTO v_cap
          FROM pg_catalog.jsonb_array_elements(v_lines) line WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,v_currency,v_rule->'targets',line);
        END IF;
        v_saving:=LEAST(v_saving,v_cap);
      ELSIF v_rule->'marginPolicy'->>'kind'='maximum_percentage' THEN
        v_saving:=LEAST(v_saving,CASE WHEN v_kind='bundle_price' THEN v_cap ELSE v_eligible_value END*(v_rule->'marginPolicy'->>'maximumPercentageBps')::integer/10000);
      END IF;
    END IF;
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
    IF v_saving=0 AND (v_kind<>'gift' OR v_benefit->>'autoAdd'='false') THEN v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason',CASE WHEN v_kind='gift' THEN 'conditions_not_met' ELSE 'not_eligible' END)); CONTINUE; END IF;
    IF v_kind='gift' AND v_benefit->>'autoAdd'='true' THEN
      v_auto_gift_prior_quantity:=COALESCE((v_auto_gift_quantities->>(v_benefit->>'giftVariantId'))::bigint,0);
      v_auto_gift_next_quantity:=v_auto_gift_prior_quantity+(v_benefit->>'quantity')::bigint;
      v_cart_variant_quantity:=COALESCE((v_cart_variant_quantities->>(v_benefit->>'giftVariantId'))::bigint,0);
      IF v_candidate.gift_stock_tracking IS TRUE
         AND v_cart_variant_quantity+v_auto_gift_next_quantity>v_candidate.gift_available_quantity
      THEN
        v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','conditions_not_met'));
        CONTINUE;
      END IF;
      v_auto_gift_prior_chunks:=CASE WHEN v_auto_gift_prior_quantity=0 THEN 0 ELSE ((v_auto_gift_prior_quantity+9998)/9999)::integer END;
      v_auto_gift_next_chunks:=((v_auto_gift_next_quantity+9998)/9999)::integer;
      IF v_order_line_count+v_auto_gift_next_chunks-v_auto_gift_prior_chunks>100 THEN
        v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','order_line_limit'));
        CONTINUE;
      END IF;
      v_order_line_count:=v_order_line_count+v_auto_gift_next_chunks-v_auto_gift_prior_chunks;
      v_auto_gift_quantities:=pg_catalog.jsonb_set(v_auto_gift_quantities,ARRAY[v_benefit->>'giftVariantId'],pg_catalog.to_jsonb(v_auto_gift_next_quantity),true);
    END IF;
    IF v_kind='free_shipping' THEN v_shipping_discount:=v_shipping_discount+v_saving; v_shipping_effects:=v_shipping_effects||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'discountMinor',v_saving));
    ELSIF v_kind='gift' THEN
      IF v_benefit->>'autoAdd'='true' THEN
        v_gifts:=v_gifts||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'variantId',v_benefit->>'giftVariantId','quantity',(v_benefit->>'quantity')::bigint,'paidMinor',0,'autoAdd',true));
      ELSE
        v_line_id:=v_line->>'lineId';
        v_effects:=v_effects||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'lineId',v_line_id,'discountMinor',v_saving,'giftQuantity',0));
        v_paid:=pg_catalog.jsonb_set(v_paid,ARRAY[v_line_id],pg_catalog.to_jsonb(COALESCE((v_paid->>v_line_id)::bigint,0)+v_saving),true);
        v_line_discount:=v_line_discount+v_saving; v_used_non_shipping:=true;
        v_gifts:=v_gifts||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'variantId',v_benefit->>'giftVariantId','quantity',(v_benefit->>'quantity')::bigint,'paidMinor',0,'autoAdd',false,'lineId',v_line_id));
      END IF;
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
      SELECT bundle_count INTO v_complete_quantity FROM saas.promotion_bundle_facts_v1(v_benefit,v_lines);
      WITH items AS MATERIALIZED (
        SELECT item->>'variantId' variant_id,(item->>'quantity')::bigint required_quantity FROM pg_catalog.jsonb_array_elements(v_benefit->'items') item
      ), ordered AS MATERIALIZED (
        SELECT line,items.required_quantity,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
          sum((line->>'quantity')::bigint) OVER (PARTITION BY items.variant_id ORDER BY (line->>'position')::integer,line->>'lineId')-(line->>'quantity')::bigint prior_quantity
        FROM items JOIN pg_catalog.jsonb_array_elements(v_lines) line ON line->>'variantId'=items.variant_id
      ), allocation_lines AS MATERIALIZED (
        SELECT line,saas.promotion_evaluator_consumed_line_capacity(v_rule,line,LEAST(quantity,GREATEST(0,v_complete_quantity*required_quantity-prior_quantity))::bigint,COALESCE((v_paid->>(line->>'lineId'))::bigint,0))::bigint line_value
        FROM ordered WHERE prior_quantity<v_complete_quantity*required_quantity
      )
      SELECT COALESCE(sum(line_value),0),count(*) INTO v_available,v_count FROM allocation_lines WHERE line_value>0;
      v_saving:=LEAST(v_saving,v_available);
      IF v_saving<=0 OR v_available<=0 THEN v_rejected:=v_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'reason','not_eligible')); CONTINUE; END IF;
      v_remaining:=v_saving; v_remaining_available:=v_available;
      FOR v_bundle_line IN
        WITH items AS MATERIALIZED (
          SELECT item->>'variantId' variant_id,(item->>'quantity')::bigint required_quantity FROM pg_catalog.jsonb_array_elements(v_benefit->'items') item
        ), ordered AS MATERIALIZED (
          SELECT line,items.required_quantity,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
            sum((line->>'quantity')::bigint) OVER (PARTITION BY items.variant_id ORDER BY (line->>'position')::integer,line->>'lineId')-(line->>'quantity')::bigint prior_quantity
          FROM items JOIN pg_catalog.jsonb_array_elements(v_lines) line ON line->>'variantId'=items.variant_id
        ), allocation_lines AS MATERIALIZED (
          SELECT line,saas.promotion_evaluator_consumed_line_capacity(v_rule,line,LEAST(quantity,GREATEST(0,v_complete_quantity*required_quantity-prior_quantity))::bigint,COALESCE((v_paid->>(line->>'lineId'))::bigint,0))::bigint line_value
          FROM ordered WHERE prior_quantity<v_complete_quantity*required_quantity
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
    v_applied:=v_applied||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_candidate.id,'version',v_candidate.version,'name',v_candidate.name,'benefitKind',v_kind,'lineDiscountMinor',CASE WHEN v_kind='free_shipping' OR (v_kind='gift' AND v_benefit->>'autoAdd'='true') THEN 0 ELSE v_saving END,'shippingDiscountMinor',CASE WHEN v_kind='free_shipping' THEN v_saving ELSE 0 END,'discountTotalMinor',CASE WHEN v_kind='gift' AND v_benefit->>'autoAdd'='true' THEN 0 ELSE v_saving END)||CASE WHEN v_normalized_code IS NULL THEN '{}'::jsonb ELSE pg_catalog.jsonb_build_object('normalizedCode',v_normalized_code) END);
    v_applied_rules:=v_applied_rules||pg_catalog.jsonb_build_array(v_rule);
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('eligiblePromotionIds',v_eligible,'appliedPromotions',v_applied,'rejectedPromotions',v_rejected,'lineEffects',v_effects,'shippingEffects',v_shipping_effects,'gifts',v_gifts,'subtotalBeforeDiscountMinor',v_subtotal,'lineDiscountTotalMinor',v_line_discount,'shippingBeforeDiscountMinor',v_shipping,'shippingDiscountTotalMinor',v_shipping_discount,'discountTotalMinor',v_line_discount+v_shipping_discount,'grandTotalMinor',v_subtotal-v_line_discount+v_shipping-v_shipping_discount,'currency',v_currency,'progressMessages','[]'::jsonb,'merchantExplanation','evaluated');
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_evaluate_internal_v1(p_store_id uuid,p_context jsonb,p_now timestamptz,p_selected jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_currency text:=p_context->>'currency'; v_lines jsonb;
BEGIN
  IF p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR saas.promotion_evaluator_context_valid(p_store_id,p_context) IS NOT TRUE THEN RETURN saas.promotion_evaluator_empty_result(v_currency,'promotion_context_unavailable'); END IF;
  v_lines:=saas.promotion_evaluator_materialize_lines(p_store_id,v_currency,p_context,p_now);
  RETURN saas.promotion_evaluate_internal_v1(p_store_id,p_context,p_now,p_selected,v_lines);
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

-- Storefront callers send a canonical, bounded semantic code set.  Keeping the
-- bytewise order in the database makes quote authority stable across locales
-- and prevents a direct RPC caller from bypassing the repository normalizer.
CREATE OR REPLACE FUNCTION saas.promotion_checkout_codes_valid_v1(p_codes text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT p_codes IS NOT NULL
    AND pg_catalog.cardinality(p_codes) BETWEEN 0 AND 5
    AND (pg_catalog.cardinality(p_codes)=0 OR pg_catalog.array_ndims(p_codes)=1)
    AND COALESCE(pg_catalog.array_lower(p_codes,1),1)=1
    AND NOT EXISTS(
      SELECT 1
      FROM pg_catalog.unnest(p_codes) submitted(code)
      WHERE submitted.code IS NULL
        OR saas.promotion_normalize_code(submitted.code) IS DISTINCT FROM submitted.code
    )
    AND pg_catalog.cardinality(p_codes)=(
      SELECT pg_catalog.count(DISTINCT submitted.code)
      FROM pg_catalog.unnest(p_codes) submitted(code)
    )
    AND p_codes IS NOT DISTINCT FROM COALESCE((
      SELECT pg_catalog.array_agg(submitted.code ORDER BY pg_catalog.convert_to(submitted.code,'UTF8'))
      FROM pg_catalog.unnest(p_codes) submitted(code)
    ),ARRAY[]::text[])
$fn$;

-- Promotion-aware checkout quotation is deliberately read-only.  It mirrors
-- the canonical checkout readiness decisions without calling the legacy quote
-- wrappers, because those wrappers lock source rows and persist analytics.
-- Completion re-derives these facts before spending any promotion authority.
CREATE OR REPLACE FUNCTION saas.public_checkout_quote_v2(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
  p_customer_credentials jsonb,p_normalized_codes text[],p_attribution jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_store_id uuid;
  v_cart saas.storefront_carts%ROWTYPE;
  v_intent saas.storefront_checkout_intents%ROWTYPE;
  v_source_id uuid;
  v_source_version bigint;
  v_customer_id uuid;
  v_bound_customer_id uuid;
  v_shipping_method_id uuid;
  v_cart_payload jsonb;
  v_shipping jsonb;
  v_payments jsonb;
  v_context jsonb;
  v_materialized_lines jsonb;
  v_evaluation jsonb;
  v_code_facts jsonb:='{}'::jsonb;
  v_public_items jsonb:='[]'::jsonb;
  v_public_applied jsonb:='[]'::jsonb;
  v_public_rejected jsonb:='[]'::jsonb;
  v_public_gifts jsonb:='[]'::jsonb;
  v_public_cart jsonb;
  v_public_quote jsonb;
  v_authority jsonb;
  v_authority_digest text;
  v_customer_segments jsonb:='[]'::jsonb;
  v_customer_tags jsonb:='[]'::jsonb;
  v_abandoned_cart jsonb:='null'::jsonb;
  v_feature_enabled boolean:=false;
  v_price_drift boolean:=false;
  v_line_count integer;
  v_paid_order_count bigint:=0;
  v_line_discount bigint:=0;
  v_shipping_discount bigint:=0;
  v_discount_total bigint:=0;
  v_grand_total bigint:=0;
  v_projected_line_discount numeric:=0;
  v_projected_applied_discount numeric:=0;
  v_line_effect numeric;
  v_line_total bigint;
  v_line_id text;
  v_evaluation_mode text:='evaluated';
  v_payment_selection_required boolean:=false;
  v_item jsonb;
  v_public_item jsonb;
  v_applied jsonb;
  v_gift record;
  v_gift_product record;
  v_gift_remaining bigint;
  v_gift_chunk integer;
  v_code text;
  v_code_applied boolean;
  v_code_recognized boolean;
  v_code_deferred boolean;
  v_ordinality bigint;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('cart','buy_now')
     OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE
     OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
     OR saas.storefront_credential_candidates_valid(p_credentials,false) IS NOT TRUE
     OR saas.storefront_credential_candidates_valid(p_customer_credentials,true) IS NOT TRUE
     OR saas.promotion_checkout_codes_valid_v1(p_normalized_codes) IS NOT TRUE
     OR saas.commerce_attribution_valid(p_attribution) IS NOT TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  v_store_id:=saas.storefront_public_store(p_hostname,p_now);
  IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  v_shipping:=saas.storefront_shipping_projection(v_store_id);
  IF v_shipping IS NULL THEN RETURN QUERY SELECT 'shipping_unavailable',NULL::jsonb; RETURN; END IF;
  v_payments:=saas.storefront_payment_methods_projection(v_store_id);
  IF pg_catalog.jsonb_typeof(v_payments) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(v_payments)=0
  THEN RETURN QUERY SELECT 'payment_unavailable',NULL::jsonb; RETURN; END IF;

  SELECT shipping.id INTO v_shipping_method_id
  FROM saas.merchant_admin_records shipping
  WHERE shipping.store_id=v_store_id AND shipping.record_kind='shipping_setting'
    AND shipping.status='active' AND shipping.archived_at IS NULL
    AND saas.merchant_admin_config_valid('shipping_setting',shipping.config)
  ORDER BY shipping.updated_at DESC,shipping.id DESC LIMIT 1;

  IF p_kind='cart' THEN
    SELECT cart.* INTO v_cart
    FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential
      ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=v_store_id AND credential.expires_at>p_now
    ORDER BY cart.created_at DESC,cart.id LIMIT 1;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF v_cart.status<>'active' OR v_cart.expires_at<=p_now THEN RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN; END IF;
    IF NOT EXISTS(SELECT 1 FROM saas.storefront_cart_items item WHERE item.store_id=v_store_id AND item.cart_id=v_cart.id)
    THEN RETURN QUERY SELECT 'cart_empty',NULL::jsonb; RETURN; END IF;
    SELECT EXISTS(
      SELECT 1
      FROM saas.storefront_cart_items item
      CROSS JOIN LATERAL saas.resolve_effective_variant_price(item.store_id,item.variant_id,'storefront',p_now,NULL) resolved
      WHERE item.store_id=v_store_id AND item.cart_id=v_cart.id
        AND (resolved.outcome<>'found' OR resolved.price_cents<>item.unit_price_cents)
    ) INTO v_price_drift;
    IF v_price_drift THEN
      RETURN QUERY SELECT 'price_changed',saas.storefront_cart_projection(v_store_id,v_cart.id,p_now); RETURN;
    END IF;
    v_source_id:=v_cart.id; v_source_version:=v_cart.version;
    v_cart_payload:=saas.storefront_cart_projection(v_store_id,v_cart.id,p_now);
  ELSE
    SELECT intent.* INTO v_intent
    FROM saas.storefront_checkout_intents intent
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
    WHERE intent.store_id=v_store_id
    ORDER BY intent.created_at DESC,intent.id LIMIT 1;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF v_intent.status<>'active' OR v_intent.expires_at<=p_now THEN RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN; END IF;
    SELECT resolved.outcome<>'found' OR resolved.price_cents<>v_intent.unit_price_cents INTO v_price_drift
    FROM saas.resolve_effective_variant_price(v_store_id,v_intent.variant_id,'storefront',p_now,NULL) resolved;
    IF v_price_drift THEN
      RETURN QUERY SELECT 'price_changed',saas.storefront_intent_projection(v_store_id,v_intent.id,p_now); RETURN;
    END IF;
    v_source_id:=v_intent.id; v_source_version:=1;
    v_cart_payload:=saas.storefront_intent_projection(v_store_id,v_intent.id,p_now);
  END IF;
  IF v_cart_payload IS NULL OR pg_catalog.jsonb_typeof(v_cart_payload) IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(v_cart_payload->'items') IS DISTINCT FROM 'array'
  THEN RETURN QUERY SELECT 'stock_unavailable',v_cart_payload; RETURN; END IF;
  IF COALESCE((v_cart_payload->>'checkoutReady')::boolean,false) IS DISTINCT FROM true
  THEN RETURN QUERY SELECT 'stock_unavailable',v_cart_payload; RETURN; END IF;
  v_line_count:=pg_catalog.jsonb_array_length(v_cart_payload->'items');
  IF v_line_count NOT BETWEEN 1 AND 100 THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;

  SELECT credential.customer_id INTO v_customer_id
  FROM saas.storefront_customer_credentials credential
  JOIN pg_catalog.jsonb_array_elements(p_customer_credentials) candidate
    ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  JOIN saas.customers customer
    ON customer.store_id=credential.store_id AND customer.id=credential.customer_id
      AND customer.status='active' AND customer.archived_at IS NULL
  WHERE credential.store_id=v_store_id AND credential.expires_at>p_now
  ORDER BY credential.created_at DESC,credential.id LIMIT 1;
  IF p_kind='cart' AND v_customer_id IS NOT NULL THEN
    SELECT abandoned.customer_id INTO v_bound_customer_id
    FROM saas.abandoned_carts abandoned
    WHERE abandoned.store_id=v_store_id AND abandoned.source_cart_id=v_source_id
    ORDER BY abandoned.last_activity_at DESC,abandoned.id DESC LIMIT 1;
    IF FOUND AND v_bound_customer_id IS NOT NULL AND v_bound_customer_id<>v_customer_id
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  END IF;

  IF v_customer_id IS NOT NULL THEN
    SELECT count(*) INTO v_paid_order_count
    FROM saas.orders order_row
    WHERE order_row.store_id=v_store_id AND order_row.customer_id=v_customer_id
      AND (order_row.paid_at IS NOT NULL OR order_row.payment_status IN ('completed','refunded'));
    SELECT COALESCE(pg_catalog.jsonb_agg(fact.id::text ORDER BY fact.id),'[]'::jsonb) INTO v_customer_segments
    FROM (
      SELECT DISTINCT membership.segment_id id
      FROM saas.customer_segment_memberships membership
      JOIN saas.customer_segments segment ON segment.store_id=membership.store_id AND segment.id=membership.segment_id AND segment.archived_at IS NULL
      WHERE membership.store_id=v_store_id AND membership.customer_id=v_customer_id
    ) fact;
    SELECT COALESCE(pg_catalog.jsonb_agg(fact.id::text ORDER BY fact.id),'[]'::jsonb) INTO v_customer_tags
    FROM (
      SELECT DISTINCT membership.tag_id id
      FROM saas.customer_tag_assignments membership
      JOIN saas.customer_tags tag ON tag.store_id=membership.store_id AND tag.id=membership.tag_id AND tag.archived_at IS NULL
      WHERE membership.store_id=v_store_id AND membership.customer_id=v_customer_id
    ) fact;
  END IF;
  IF v_paid_order_count>1000000000
     OR pg_catalog.jsonb_array_length(v_customer_segments)>100
     OR pg_catalog.jsonb_array_length(v_customer_tags)>100
  THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  IF p_kind='cart' THEN
    SELECT pg_catalog.jsonb_build_object('id',abandoned.id) INTO v_abandoned_cart
    FROM saas.abandoned_carts abandoned
    WHERE abandoned.store_id=v_store_id AND abandoned.source_cart_id=v_source_id
      AND abandoned.status='abandoned' AND abandoned.abandoned_at IS NOT NULL
      AND abandoned.abandoned_at<=p_now AND abandoned.abandoned_at>p_now-pg_catalog.interval '30 days'
    ORDER BY abandoned.abandoned_at DESC,abandoned.id DESC LIMIT 1;
    v_abandoned_cart:=COALESCE(v_abandoned_cart,'null'::jsonb);
  END IF;

  -- More than twenty lines is an explicit advisory boundary.  No prefix is
  -- evaluated, so the customer sees the exact gross cart rather than a partial
  -- discount that completion could never honor.
  IF v_line_count>20 THEN
    v_evaluation_mode:='cart_line_limit';
  ELSE
    SELECT EXISTS(
      SELECT 1
      FROM saas.subscriptions subscription
      JOIN saas.plans plan ON plan.id=subscription.plan_id
        AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
        AND plan.status='active' AND plan.valid_from<=p_now
        AND (plan.valid_until IS NULL OR p_now<plan.valid_until)
      JOIN saas.plan_features feature ON feature.plan_id=plan.id
        AND feature.feature_key='promotions' AND feature.enabled
      WHERE subscription.store_id=v_store_id AND subscription.status='active'
        AND subscription.valid_from<=p_now
        AND (subscription.valid_until IS NULL OR p_now<subscription.valid_until)
    ) INTO v_feature_enabled;
    IF v_feature_enabled THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'lineId',saas.storefront_commerce_uuid(
          'promotion-quote-v1:'||v_store_id::text||':'||p_kind||':'||v_source_id::text||':'||v_source_version::text||':'||(source.ordinality-1)::text||':'||(source.item->>'variantId')
        ),
        'position',(source.ordinality-1)::integer,
        'productId',source.item->>'productId','variantId',source.item->>'variantId',
        'quantity',(source.item->>'quantity')::bigint,'unitPriceMinor',(source.item->>'unitPriceCents')::bigint,
        'unitCostMinor',NULL,'currency',v_cart_payload->>'currency','categoryIds','[]'::jsonb,
        'brandId',NULL,'collectionIds','[]'::jsonb
      ) ORDER BY source.ordinality),'[]'::jsonb) INTO v_materialized_lines
      FROM pg_catalog.jsonb_array_elements(v_cart_payload->'items') WITH ORDINALITY source(item,ordinality);
      v_context:=pg_catalog.jsonb_build_object(
        'storeId',v_store_id,'customerId',v_customer_id,'paidOrderCount',v_paid_order_count,
        'customerSegmentIds',v_customer_segments,'customerTagIds',v_customer_tags,
        'cartLines',v_materialized_lines,'shippingMethodId',v_shipping_method_id,'paymentMethodId',NULL,
        'shippingBeforeDiscountMinor',(v_cart_payload->>'shippingCents')::bigint,
        'currency',v_cart_payload->>'currency','storeLocalTime',saas.storefront_commerce_timestamp(p_now),
        'salesChannel','storefront','submittedCodes',pg_catalog.to_jsonb(p_normalized_codes),
        'abandonedCart',v_abandoned_cart
      );
      IF saas.promotion_evaluator_context_valid(v_store_id,v_context) IS NOT TRUE
      THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
      v_materialized_lines:=saas.promotion_evaluator_materialize_lines(v_store_id,v_cart_payload->>'currency',v_context,p_now);
      IF pg_catalog.jsonb_typeof(v_materialized_lines) IS DISTINCT FROM 'array'
         OR pg_catalog.jsonb_array_length(v_materialized_lines)<>v_line_count
      THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
      v_evaluation:=saas.promotion_evaluate_internal_v1(v_store_id,v_context,p_now,NULL,v_materialized_lines);
      IF v_evaluation->>'merchantExplanation'<>'evaluated'
         OR v_evaluation->>'currency' IS DISTINCT FROM v_cart_payload->>'currency'
         OR (v_evaluation->>'subtotalBeforeDiscountMinor')::bigint IS DISTINCT FROM (v_cart_payload->>'subtotalCents')::bigint
         OR (v_evaluation->>'shippingBeforeDiscountMinor')::bigint IS DISTINCT FROM (v_cart_payload->>'shippingCents')::bigint
      THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
      v_code_facts:=saas.promotion_evaluator_code_facts(v_store_id,v_context,p_now);
      v_line_discount:=(v_evaluation->>'lineDiscountTotalMinor')::bigint;
      v_shipping_discount:=(v_evaluation->>'shippingDiscountTotalMinor')::bigint;
      v_discount_total:=(v_evaluation->>'discountTotalMinor')::bigint;
      v_grand_total:=(v_evaluation->>'grandTotalMinor')::bigint;
      IF v_line_discount<0 OR v_shipping_discount<0 OR v_discount_total<>v_line_discount+v_shipping_discount
         OR v_shipping_discount>(v_cart_payload->>'shippingCents')::bigint
         OR v_grand_total<>(v_cart_payload->>'subtotalCents')::bigint+(v_cart_payload->>'shippingCents')::bigint-v_discount_total
         OR v_grand_total<0
         OR EXISTS(
           SELECT 1 FROM pg_catalog.jsonb_array_elements(v_evaluation->'lineEffects') effect
           WHERE NOT EXISTS(
             SELECT 1 FROM pg_catalog.jsonb_array_elements(v_context->'cartLines') line
             WHERE line->>'lineId'=effect->>'lineId'
           )
         )
      THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;

      FOR v_applied IN SELECT applied.value FROM pg_catalog.jsonb_array_elements(v_evaluation->'appliedPromotions') WITH ORDINALITY applied(value,ordinality) ORDER BY applied.ordinality LOOP
        v_public_applied:=v_public_applied||pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'name',v_applied->>'name','benefitKind',v_applied->>'benefitKind',
          'normalizedCode',CASE WHEN v_applied ? 'normalizedCode' THEN v_applied->>'normalizedCode' END,
          'lineDiscountCents',(v_applied->>'lineDiscountMinor')::bigint,
          'shippingDiscountCents',(v_applied->>'shippingDiscountMinor')::bigint,
          'discountCents',(v_applied->>'discountTotalMinor')::bigint
        )));
        v_projected_applied_discount:=v_projected_applied_discount+(v_applied->>'discountTotalMinor')::numeric;
      END LOOP;
      IF v_projected_applied_discount<>v_discount_total
      THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;

      FOR v_code IN SELECT submitted.code FROM pg_catalog.unnest(p_normalized_codes) submitted(code) LOOP
        SELECT EXISTS(
          SELECT 1 FROM pg_catalog.jsonb_array_elements(v_evaluation->'appliedPromotions') applied
          WHERE applied->>'normalizedCode'=v_code
        ) INTO v_code_applied;
        IF v_code_applied THEN CONTINUE; END IF;
        WITH matched AS MATERIALIZED (
          SELECT promotion.id,promotion.rule_document
          FROM saas.promotions promotion
          WHERE promotion.store_id=v_store_id AND promotion.status IN ('active','scheduled')
            AND (
              EXISTS(
                SELECT 1 FROM pg_catalog.jsonb_each(v_code_facts) fact
                WHERE fact.key=promotion.id::text AND fact.value->>'code'=v_code
              )
              OR (
                NOT EXISTS(SELECT 1 FROM saas.promotion_codes persisted WHERE persisted.store_id=v_store_id AND persisted.code=v_code)
                AND EXISTS(
                  SELECT 1 FROM pg_catalog.jsonb_array_elements_text(COALESCE(promotion.rule_document->'trigger'->'codes','[]'::jsonb)) direct(code)
                  WHERE direct.code=v_code
                )
              )
            )
        )
        SELECT EXISTS(SELECT 1 FROM matched),EXISTS(
          SELECT 1 FROM matched
          WHERE matched.rule_document->'conditions' ? 'paymentMethodIds'
            AND pg_catalog.jsonb_array_length(matched.rule_document->'conditions'->'paymentMethodIds')>0
        ) INTO v_code_recognized,v_code_deferred;
        IF v_code_deferred THEN v_payment_selection_required:=true; CONTINUE; END IF;
        v_public_rejected:=v_public_rejected||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'normalizedCode',v_code,'reason',CASE WHEN v_code_recognized THEN 'not_eligible' ELSE 'invalid_code' END
        ));
      END LOOP;

      IF EXISTS(
        SELECT 1 FROM (
          SELECT gift->>'variantId' variant_id,(gift->>'autoAdd')::boolean auto_add,
            pg_catalog.sum((gift->>'quantity')::numeric) quantity
          FROM pg_catalog.jsonb_array_elements(v_evaluation->'gifts') gift
          GROUP BY gift->>'variantId',(gift->>'autoAdd')::boolean
        ) grouped WHERE grouped.quantity NOT BETWEEN 1 AND 1000000
      ) THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'variantId',grouped.variant_id,'quantity',grouped.quantity::bigint,'autoAdd',grouped.auto_add
      ) ORDER BY grouped.variant_id::uuid,grouped.auto_add),'[]'::jsonb) INTO v_public_gifts
      FROM (
        SELECT gift->>'variantId' variant_id,(gift->>'autoAdd')::boolean auto_add,
          pg_catalog.sum((gift->>'quantity')::numeric) quantity
        FROM pg_catalog.jsonb_array_elements(v_evaluation->'gifts') gift
        GROUP BY gift->>'variantId',(gift->>'autoAdd')::boolean
      ) grouped;

    END IF;
  END IF;

  FOR v_item,v_ordinality IN
    SELECT source.item,source.ordinality
    FROM pg_catalog.jsonb_array_elements(v_cart_payload->'items') WITH ORDINALITY source(item,ordinality)
    ORDER BY source.ordinality
  LOOP
    v_line_total:=(v_item->>'lineTotalCents')::bigint;
    v_line_effect:=0;
    IF v_feature_enabled AND v_evaluation_mode='evaluated' THEN
      SELECT line->>'lineId' INTO v_line_id
      FROM pg_catalog.jsonb_array_elements(v_context->'cartLines') line
      WHERE (line->>'position')::integer=(v_ordinality-1)::integer;
      SELECT COALESCE(pg_catalog.sum((effect->>'discountMinor')::numeric),0) INTO v_line_effect
      FROM pg_catalog.jsonb_array_elements(v_evaluation->'lineEffects') effect
      WHERE effect->>'lineId'=v_line_id;
    END IF;
    IF v_line_effect<0 OR v_line_effect>v_line_total OR pg_catalog.trunc(v_line_effect)<>v_line_effect
    THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
    v_projected_line_discount:=v_projected_line_discount+v_line_effect;
    v_public_item:=pg_catalog.jsonb_build_object(
      'productId',v_item->>'productId','variantId',v_item->>'variantId','slug',v_item->>'slug',
      'title',v_item->>'title','variantTitle',v_item->>'variantTitle',
      'quantity',(v_item->>'quantity')::bigint,'unitPriceCents',(v_item->>'unitPriceCents')::bigint,
      'lineTotalCents',v_line_total,'discountCents',v_line_effect::bigint,
      'payableCents',v_line_total-v_line_effect::bigint,'available',(v_item->>'available')::boolean
    );
    IF v_item ? 'categoryId' THEN v_public_item:=v_public_item||pg_catalog.jsonb_build_object('categoryId',v_item->>'categoryId'); END IF;
    IF v_item ? 'media' THEN v_public_item:=v_public_item||pg_catalog.jsonb_build_object('media',v_item->'media'); END IF;
    v_public_items:=v_public_items||pg_catalog.jsonb_build_array(v_public_item);
  END LOOP;
  IF v_feature_enabled AND v_evaluation_mode='evaluated' AND v_projected_line_discount<>v_line_discount
  THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  IF NOT v_feature_enabled OR v_evaluation_mode='cart_line_limit' THEN
    v_line_discount:=0; v_shipping_discount:=0; v_discount_total:=0;
    v_grand_total:=(v_cart_payload->>'totalCents')::bigint;
    v_public_applied:='[]'::jsonb; v_public_rejected:='[]'::jsonb; v_public_gifts:='[]'::jsonb;
  ELSE
    FOR v_gift IN
      SELECT (gift->>'variantId')::uuid variant_id,(gift->>'quantity')::bigint quantity
      FROM pg_catalog.jsonb_array_elements(v_public_gifts) gift
      WHERE (gift->>'autoAdd')::boolean
      ORDER BY (gift->>'variantId')::uuid
    LOOP
      SELECT product.id product_id,product.slug product_slug,product.title product_title,
        variant.id variant_id,variant.title variant_title
      INTO v_gift_product
      FROM saas.product_variants variant
      JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
      WHERE variant.store_id=v_store_id AND variant.id=v_gift.variant_id
        AND variant.status='active' AND variant.archived_at IS NULL
        AND product.status='active' AND product.archived_at IS NULL;
      IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
      v_gift_remaining:=v_gift.quantity;
      WHILE v_gift_remaining>0 LOOP
        v_gift_chunk:=LEAST(v_gift_remaining,9999)::integer;
        v_public_items:=v_public_items||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'productId',v_gift_product.product_id,'variantId',v_gift_product.variant_id,
          'slug',v_gift_product.product_slug,'title',v_gift_product.product_title,
          'variantTitle',v_gift_product.variant_title,'quantity',v_gift_chunk,
          'unitPriceCents',0,'lineTotalCents',0,'discountCents',0,'payableCents',0,'available',true
        ));
        v_gift_remaining:=v_gift_remaining-v_gift_chunk;
      END LOOP;
    END LOOP;
    IF pg_catalog.jsonb_array_length(v_public_items)>100
    THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  END IF;
  v_public_cart:=pg_catalog.jsonb_build_object(
    'version',(v_cart_payload->>'version')::bigint,'currency',v_cart_payload->>'currency',
    'itemCount',(v_cart_payload->>'itemCount')::bigint,'subtotalCents',(v_cart_payload->>'subtotalCents')::bigint,
    'shippingCents',(v_cart_payload->>'shippingCents')::bigint,
    'lineDiscountCents',v_line_discount,'shippingDiscountCents',v_shipping_discount,
    'discountCents',v_discount_total,'totalCents',v_grand_total,
    'checkoutReady',(v_cart_payload->>'checkoutReady')::boolean,'checkoutBlocker',COALESCE(v_cart_payload->'checkoutBlocker','null'::jsonb),
    'items',v_public_items
  );
  v_public_quote:=pg_catalog.jsonb_build_object(
    'cart',v_public_cart,'paymentMethods',v_payments,
    'promotionStatus',CASE WHEN v_evaluation_mode='cart_line_limit'
      THEN pg_catalog.jsonb_build_object('kind','not_evaluated','reason','cart_line_limit')
      ELSE pg_catalog.jsonb_build_object('kind','evaluated') END,
    'appliedPromotions',v_public_applied,'rejectedPromotions',v_public_rejected,'gifts',v_public_gifts,
    'progressMessages',CASE WHEN v_evaluation_mode='cart_line_limit'
      THEN pg_catalog.jsonb_build_array('Sepetinizde çok fazla ürün satırı olduğu için promosyon uygulanamadı.')
      WHEN v_feature_enabled THEN COALESCE(v_evaluation->'progressMessages','[]'::jsonb)
      ELSE '[]'::jsonb END
  );
  -- jsonb_strip_nulls is recursive and would remove the public cart contract's
  -- required checkoutBlocker:null.  Add only the genuinely optional shipping
  -- estimate instead of stripping the completed quote tree.
  IF v_shipping ? 'estimatedDays' AND v_shipping->'estimatedDays'<>'null'::jsonb THEN
    v_public_quote:=v_public_quote||pg_catalog.jsonb_build_object('estimatedDays',v_shipping->'estimatedDays');
  END IF;
  v_authority:=pg_catalog.jsonb_build_object(
    'schemaVersion',1,'storeId',v_store_id,'sourceKind',p_kind,'sourceId',v_source_id,
    'sourceVersion',v_source_version,'customerId',v_customer_id,'normalizedCodes',pg_catalog.to_jsonb(p_normalized_codes),
    'evaluationMode',v_evaluation_mode,'featureEnabled',v_feature_enabled,
    'paymentSelectionRequired',v_payment_selection_required,'quote',v_public_quote,
    'evaluatorContext',CASE WHEN v_feature_enabled AND v_evaluation_mode='evaluated' THEN v_context ELSE NULL END,
    'materializedLines',CASE WHEN v_feature_enabled AND v_evaluation_mode='evaluated' THEN v_materialized_lines ELSE NULL END,
    'evaluation',CASE WHEN v_feature_enabled AND v_evaluation_mode='evaluated' THEN v_evaluation ELSE NULL END
  );
  IF pg_catalog.pg_column_size(v_authority)>786432 THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  v_authority_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_authority::text,'UTF8')),'hex');
  RETURN QUERY SELECT 'quoted',pg_catalog.jsonb_build_object('quote',v_public_quote,'authorityDigest',v_authority_digest);
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $fn$;

-- Offline checkout V2 owns its operation row from the outset.  The V1 checkout
-- ledger is immutable, so wrapping V1 and rewriting its gross receipt would be
-- both unsafe and impossible.  This additive path preserves the V1 definition,
-- resolves the customer first, then derives and settles promotion authority in
-- the same exception-backed subtransaction as the order and inventory writes.
SET LOCAL check_function_bodies = off;
CREATE OR REPLACE FUNCTION saas.public_checkout_complete_v2(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_customer_credentials jsonb,
  p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_delivery jsonb,p_payment_kind text,
  p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,
  p_receipt_id uuid,p_receipt_key_id text,p_receipt_digest text,p_receipt_expires_at timestamptz,
  p_customer_credential_id uuid,p_customer_key_id text,p_customer_digest text,p_customer_expires_at timestamptz,
  p_normalized_codes text[]
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_store_id uuid;
  v_currency text;
  v_cart saas.storefront_carts%ROWTYPE;
  v_intent saas.storefront_checkout_intents%ROWTYPE;
  v_existing_operation saas.storefront_checkout_operations%ROWTYPE;
  v_payment saas.payment_methods%ROWTYPE;
  v_customer saas.customers%ROWTYPE;
  v_address saas.customer_addresses%ROWTYPE;
  v_customer_credential saas.storefront_customer_credentials%ROWTYPE;
  v_line record;
  v_resolved record;
  v_gift_variant record;
  v_source_cart_id uuid;
  v_source_intent_id uuid;
  v_shipping_method_id uuid;
  v_bound_customer_id uuid;
  v_cart_payload jsonb;
  v_shipping_projection jsonb;
  v_context jsonb;
  v_materialized_lines jsonb;
  v_evaluation jsonb;
  v_public_items jsonb:='[]'::jsonb;
  v_public_applied jsonb:='[]'::jsonb;
  v_public_gifts jsonb:='[]'::jsonb;
  v_receipt jsonb;
  v_result jsonb;
  v_reserve_result jsonb;
  v_commit_result jsonb;
  v_customer_segments jsonb:='[]'::jsonb;
  v_customer_tags jsonb:='[]'::jsonb;
  v_abandoned_cart jsonb:='null'::jsonb;
  v_subtotal bigint:=0;
  v_shipping bigint:=0;
  v_line_discount bigint:=0;
  v_shipping_discount bigint:=0;
  v_discount_total bigint:=0;
  v_grand_total bigint:=0;
  v_paid_order_count bigint:=0;
  v_line_count integer;
  v_matching_customer_count integer:=0;
  v_position integer:=0;
  v_line_effect numeric;
  v_projected_line_discount numeric:=0;
  v_projected_applied_discount numeric:=0;
  v_line_id uuid;
  v_feature_enabled boolean:=false;
  v_customer_credential_created boolean:=false;
  v_evaluation_mode text:='evaluated';
  v_order_number text;
  v_reserve_operation_id uuid;
  v_commit_operation_id uuid;
  v_reservation_group_id uuid;
  v_reserve_fingerprint text;
  v_commit_fingerprint text;
  v_checkout_outcome text;
  v_rollback_outcome text;
  v_item jsonb;
  v_public_item jsonb;
  v_applied jsonb;
  v_gift jsonb;
  v_ordinality bigint;
  v_gift_quantity bigint;
  v_gift_remaining bigint;
  v_gift_chunk integer;
BEGIN
  IF p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE
     OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
     OR p_kind IS NULL OR p_kind NOT IN ('cart','buy_now')
     OR saas.storefront_credential_candidates_valid(p_credentials,false) IS NOT TRUE
     OR saas.storefront_credential_candidates_valid(p_customer_credentials,true) IS NOT TRUE
     OR saas.promotion_checkout_codes_valid_v1(p_normalized_codes) IS NOT TRUE
     OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_expected_version IS NULL OR p_expected_version<1
     OR saas.storefront_delivery_valid(p_delivery) IS NOT TRUE
     OR p_payment_kind IS NULL OR p_payment_kind NOT IN ('bank_transfer','cash_on_delivery')
     OR p_order_id IS NULL OR p_customer_id IS NULL OR p_address_id IS NULL OR p_event_id IS NULL
     OR p_receipt_id IS NULL OR p_customer_credential_id IS NULL
     OR p_receipt_key_id IS NULL OR p_receipt_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
     OR p_receipt_digest IS NULL OR p_receipt_digest!~'^[a-f0-9]{64}$'
     OR p_receipt_expires_at IS NULL OR pg_catalog.isfinite(p_receipt_expires_at) IS NOT TRUE
     OR pg_catalog.date_trunc('milliseconds',p_receipt_expires_at)<>p_receipt_expires_at
     OR p_receipt_expires_at<=p_now OR p_receipt_expires_at>p_now+pg_catalog.interval '1 day'
     OR p_customer_key_id IS NULL OR p_customer_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
     OR p_customer_digest IS NULL OR p_customer_digest!~'^[a-f0-9]{64}$'
     OR p_customer_expires_at IS NULL OR pg_catalog.isfinite(p_customer_expires_at) IS NOT TRUE
     OR pg_catalog.date_trunc('milliseconds',p_customer_expires_at)<>p_customer_expires_at
     OR p_customer_expires_at<=p_now OR p_customer_expires_at>p_now+pg_catalog.interval '31 days'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  v_store_id:=saas.storefront_public_store(p_hostname,p_now);
  IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.checkout.operation:'||p_operation_id::text,0));
  SELECT operation_row.* INTO v_existing_operation
  FROM saas.storefront_checkout_operations operation_row
  WHERE operation_row.operation_id=p_operation_id
  FOR SHARE;
  IF FOUND THEN
    IF v_existing_operation.store_id<>v_store_id OR v_existing_operation.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF pg_catalog.jsonb_typeof(v_existing_operation.result_payload->'receipt') IS DISTINCT FROM 'object'
       OR NOT (v_existing_operation.result_payload->'receipt' ?& ARRAY[
         'lineDiscountCents','shippingDiscountCents','discountCents','promotionStatus','appliedPromotions','gifts'
       ]) THEN
      RETURN QUERY SELECT 'unavailable',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'operation_replayed',v_existing_operation.result_payload;
    END IF;
    RETURN;
  END IF;

  SELECT store.currency INTO v_currency
  FROM saas.stores store
  WHERE store.id=v_store_id
  FOR SHARE;
  IF NOT FOUND OR v_currency IS DISTINCT FROM 'TRY'
  THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;

  PERFORM credential.id
  FROM saas.storefront_customer_credentials credential
  JOIN pg_catalog.jsonb_array_elements(p_customer_credentials) candidate
    ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  WHERE credential.store_id=v_store_id AND credential.expires_at>p_now
  ORDER BY credential.id
  FOR UPDATE OF credential;
  SELECT pg_catalog.count(DISTINCT credential.customer_id) INTO v_matching_customer_count
  FROM saas.storefront_customer_credentials credential
  JOIN pg_catalog.jsonb_array_elements(p_customer_credentials) candidate
    ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  WHERE credential.store_id=v_store_id AND credential.expires_at>p_now;
  IF v_matching_customer_count>1
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT credential.* INTO v_customer_credential
  FROM saas.storefront_customer_credentials credential
  JOIN pg_catalog.jsonb_array_elements(p_customer_credentials) candidate
    ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  WHERE credential.store_id=v_store_id AND credential.expires_at>p_now
  ORDER BY credential.created_at DESC,credential.id
  LIMIT 1 FOR UPDATE OF credential;

  IF p_kind='cart' THEN
    SELECT cart.* INTO v_cart
    FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential
      ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=v_store_id AND credential.expires_at>p_now
    ORDER BY cart.created_at DESC,cart.id LIMIT 1 FOR UPDATE OF cart;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    v_source_cart_id:=v_cart.id;
    IF v_cart.status<>'active' OR v_cart.expires_at<=p_now THEN RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN; END IF;
    IF v_cart.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.storefront_cart_projection(v_store_id,v_cart.id,p_now); RETURN; END IF;
    IF NOT EXISTS(SELECT 1 FROM saas.storefront_cart_items item WHERE item.store_id=v_store_id AND item.cart_id=v_cart.id)
    THEN RETURN QUERY SELECT 'cart_empty',NULL::jsonb; RETURN; END IF;
    v_cart_payload:=saas.storefront_cart_projection(v_store_id,v_cart.id,p_now);
  ELSE
    SELECT intent.* INTO v_intent
    FROM saas.storefront_checkout_intents intent
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
    WHERE intent.store_id=v_store_id
    ORDER BY intent.created_at DESC,intent.id LIMIT 1 FOR UPDATE OF intent;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    v_source_intent_id:=v_intent.id;
    IF v_intent.status<>'active' OR v_intent.expires_at<=p_now THEN RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN; END IF;
    IF p_expected_version<>1 THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
    v_cart_payload:=saas.storefront_intent_projection(v_store_id,v_intent.id,p_now);
  END IF;
  IF v_cart_payload IS NULL OR pg_catalog.jsonb_typeof(v_cart_payload) IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(v_cart_payload->'items') IS DISTINCT FROM 'array'
  THEN RETURN QUERY SELECT 'stock_unavailable',v_cart_payload; RETURN; END IF;
  IF v_cart_payload->>'currency' IS DISTINCT FROM v_currency
  THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  IF COALESCE((v_cart_payload->>'checkoutReady')::boolean,false) IS DISTINCT FROM true
  THEN RETURN QUERY SELECT 'stock_unavailable',v_cart_payload; RETURN; END IF;
  v_line_count:=pg_catalog.jsonb_array_length(v_cart_payload->'items');
  IF v_line_count NOT BETWEEN 1 AND 100 THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;

  v_shipping_projection:=saas.storefront_shipping_projection(v_store_id);
  IF v_shipping_projection IS NULL THEN RETURN QUERY SELECT 'shipping_unavailable',NULL::jsonb; RETURN; END IF;
  v_shipping:=(v_shipping_projection->>'shippingCents')::bigint;
  SELECT shipping.id INTO v_shipping_method_id
  FROM saas.merchant_admin_records shipping
  WHERE shipping.store_id=v_store_id AND shipping.record_kind='shipping_setting'
    AND shipping.status='active' AND shipping.archived_at IS NULL
    AND saas.merchant_admin_config_valid('shipping_setting',shipping.config)
  ORDER BY shipping.updated_at DESC,shipping.id DESC LIMIT 1 FOR KEY SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'shipping_unavailable',NULL::jsonb; RETURN; END IF;
  SELECT method.* INTO v_payment
  FROM saas.payment_methods method
  WHERE method.store_id=v_store_id AND method.kind=p_payment_kind AND method.state='active'
    AND saas.built_in_payment_method_config_valid(method.kind,method.config)
  ORDER BY method.position,method.id LIMIT 1 FOR KEY SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'payment_unavailable',NULL::jsonb; RETURN; END IF;

  IF p_kind='cart' THEN
    FOR v_line IN
      SELECT item.*,variant.stock_tracking,variant.title variant_title,variant.sku,
        variant.status variant_status,product.title product_title,product.status product_status
      FROM saas.storefront_cart_items item
      JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id AND variant.product_id=item.product_id
      JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id
      WHERE item.store_id=v_store_id AND item.cart_id=v_source_cart_id
      ORDER BY item.position,item.variant_id FOR UPDATE OF variant
    LOOP
      IF v_line.product_status<>'active' OR v_line.variant_status<>'active'
      THEN RETURN QUERY SELECT 'stock_unavailable',v_cart_payload; RETURN; END IF;
      SELECT * INTO v_resolved FROM saas.resolve_effective_variant_price(v_store_id,v_line.variant_id,'storefront',p_now,NULL);
      IF v_resolved.outcome<>'found' OR v_resolved.price_cents<>v_line.unit_price_cents
      THEN RETURN QUERY SELECT 'price_changed',v_cart_payload; RETURN; END IF;
      IF v_line.stock_tracking AND saas.storefront_available_stock(v_store_id,v_line.variant_id,p_now,NULL)<v_line.quantity
      THEN RETURN QUERY SELECT 'stock_unavailable',v_cart_payload; RETURN; END IF;
      v_subtotal:=v_subtotal+v_resolved.price_cents*v_line.quantity;
    END LOOP;
  ELSE
    SELECT variant.stock_tracking,variant.title variant_title,variant.sku,variant.status variant_status,
      product.title product_title,product.status product_status,v_intent.product_id,v_intent.variant_id,
      v_intent.quantity,v_intent.unit_price_cents,0 position
    INTO v_line
    FROM saas.product_variants variant
    JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=v_store_id AND variant.id=v_intent.variant_id AND product.id=v_intent.product_id
    FOR UPDATE OF variant;
    IF NOT FOUND OR v_line.product_status<>'active' OR v_line.variant_status<>'active'
    THEN RETURN QUERY SELECT 'stock_unavailable',v_cart_payload; RETURN; END IF;
    SELECT * INTO v_resolved FROM saas.resolve_effective_variant_price(v_store_id,v_line.variant_id,'storefront',p_now,NULL);
    IF v_resolved.outcome<>'found' OR v_resolved.price_cents<>v_line.unit_price_cents
    THEN RETURN QUERY SELECT 'price_changed',v_cart_payload; RETURN; END IF;
    IF v_line.stock_tracking AND saas.storefront_available_stock(v_store_id,v_line.variant_id,p_now,NULL)<v_line.quantity
    THEN RETURN QUERY SELECT 'stock_unavailable',v_cart_payload; RETURN; END IF;
    v_subtotal:=v_resolved.price_cents*v_line.quantity;
  END IF;
  IF v_subtotal IS DISTINCT FROM (v_cart_payload->>'subtotalCents')::bigint
     OR v_shipping IS DISTINCT FROM (v_cart_payload->>'shippingCents')::bigint
  THEN RAISE EXCEPTION 'checkout v2 gross projection changed'; END IF;

  IF v_customer_credential.id IS NOT NULL THEN
    SELECT customer.* INTO v_customer FROM saas.customers customer
    WHERE customer.store_id=v_store_id AND customer.id=v_customer_credential.customer_id
    FOR UPDATE;
    IF NOT FOUND OR v_customer.status<>'active' OR v_customer.archived_at IS NOT NULL
       OR v_customer.email<>p_delivery->'contact'->>'email'
       OR v_customer.phone IS DISTINCT FROM p_delivery->'contact'->>'phone'
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    UPDATE saas.customers
    SET first_name=p_delivery->'contact'->>'firstName',last_name=p_delivery->'contact'->>'lastName',
      version=version+1,updated_at=p_now
    WHERE store_id=v_store_id AND id=v_customer.id RETURNING * INTO v_customer;
    UPDATE saas.storefront_customer_credentials SET last_seen_at=GREATEST(last_seen_at,p_now)
    WHERE store_id=v_store_id AND id=v_customer_credential.id;
  ELSE
    PERFORM customer.id FROM saas.customers customer
    WHERE customer.store_id=v_store_id
      AND (customer.email=p_delivery->'contact'->>'email' OR customer.phone=p_delivery->'contact'->>'phone')
    ORDER BY customer.id FOR UPDATE;
    SELECT customer.* INTO v_customer FROM saas.customers customer
    WHERE customer.store_id=v_store_id
      AND (customer.email=p_delivery->'contact'->>'email' OR customer.phone=p_delivery->'contact'->>'phone')
    ORDER BY customer.id LIMIT 1;
    IF FOUND THEN
      IF v_customer.email<>p_delivery->'contact'->>'email'
         OR v_customer.phone IS DISTINCT FROM p_delivery->'contact'->>'phone'
         OR v_customer.status<>'active' OR v_customer.archived_at IS NOT NULL
         OR EXISTS(
           SELECT 1 FROM saas.customers customer
           WHERE customer.store_id=v_store_id AND customer.id<>v_customer.id
             AND (customer.email=p_delivery->'contact'->>'email' OR customer.phone=p_delivery->'contact'->>'phone')
         )
      THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
      UPDATE saas.customers
      SET first_name=p_delivery->'contact'->>'firstName',last_name=p_delivery->'contact'->>'lastName',
        phone=p_delivery->'contact'->>'phone',version=version+1,updated_at=p_now
      WHERE store_id=v_store_id AND id=v_customer.id RETURNING * INTO v_customer;
    ELSE
      INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at)
      VALUES(p_customer_id,v_store_id,'active',p_delivery->'contact'->>'firstName',p_delivery->'contact'->>'lastName',
        p_delivery->'contact'->>'email',p_delivery->'contact'->>'phone',1,p_now,p_now)
      RETURNING * INTO v_customer;
    END IF;
  END IF;

  IF p_kind='cart' THEN
    SELECT abandoned.customer_id INTO v_bound_customer_id
    FROM saas.abandoned_carts abandoned
    WHERE abandoned.store_id=v_store_id AND abandoned.source_cart_id=v_source_cart_id
    ORDER BY abandoned.last_activity_at DESC,abandoned.id DESC LIMIT 1;
    IF FOUND AND v_bound_customer_id IS NOT NULL AND v_bound_customer_id<>v_customer.id THEN
      v_rollback_outcome:='invalid_input';
      RAISE EXCEPTION 'checkout v2 customer binding changed';
    END IF;
  END IF;

  SELECT address.* INTO v_address FROM saas.customer_addresses address
  WHERE address.store_id=v_store_id AND address.customer_id=v_customer.id AND address.is_default FOR UPDATE;
  IF FOUND THEN
    UPDATE saas.customer_addresses
    SET recipient_name=v_customer.first_name||' '||v_customer.last_name,
      line1=p_delivery->'shippingAddress'->>'line1',line2=p_delivery->'shippingAddress'->>'line2',
      city=p_delivery->'shippingAddress'->>'city',district=p_delivery->'shippingAddress'->>'district',
      postal_code=p_delivery->'shippingAddress'->>'postalCode',country=p_delivery->'shippingAddress'->>'country',
      version=version+1,updated_at=p_now
    WHERE store_id=v_store_id AND id=v_address.id RETURNING * INTO v_address;
  ELSE
    INSERT INTO saas.customer_addresses(id,store_id,customer_id,label,recipient_name,line1,line2,city,district,postal_code,country,is_default,version,created_at,updated_at)
    VALUES(p_address_id,v_store_id,v_customer.id,'Teslimat',v_customer.first_name||' '||v_customer.last_name,
      p_delivery->'shippingAddress'->>'line1',p_delivery->'shippingAddress'->>'line2',p_delivery->'shippingAddress'->>'city',
      p_delivery->'shippingAddress'->>'district',p_delivery->'shippingAddress'->>'postalCode',p_delivery->'shippingAddress'->>'country',true,1,p_now,p_now)
    RETURNING * INTO v_address;
  END IF;

  -- Audience authority is intentionally loaded only after customer resolution.
  SELECT count(*) INTO v_paid_order_count FROM saas.orders order_row
  WHERE order_row.store_id=v_store_id AND order_row.customer_id=v_customer.id
    AND (order_row.paid_at IS NOT NULL OR order_row.payment_status IN ('completed','refunded'));
  SELECT COALESCE(pg_catalog.jsonb_agg(fact.id::text ORDER BY fact.id),'[]'::jsonb) INTO v_customer_segments
  FROM (
    SELECT DISTINCT membership.segment_id id
    FROM saas.customer_segment_memberships membership
    JOIN saas.customer_segments segment ON segment.store_id=membership.store_id AND segment.id=membership.segment_id AND segment.archived_at IS NULL
    WHERE membership.store_id=v_store_id AND membership.customer_id=v_customer.id
  ) fact;
  SELECT COALESCE(pg_catalog.jsonb_agg(fact.id::text ORDER BY fact.id),'[]'::jsonb) INTO v_customer_tags
  FROM (
    SELECT DISTINCT membership.tag_id id
    FROM saas.customer_tag_assignments membership
    JOIN saas.customer_tags tag ON tag.store_id=membership.store_id AND tag.id=membership.tag_id AND tag.archived_at IS NULL
    WHERE membership.store_id=v_store_id AND membership.customer_id=v_customer.id
  ) fact;
  IF v_paid_order_count>1000000000 OR pg_catalog.jsonb_array_length(v_customer_segments)>100
     OR pg_catalog.jsonb_array_length(v_customer_tags)>100
  THEN RAISE EXCEPTION 'checkout v2 audience authority unavailable'; END IF;
  IF p_kind='cart' THEN
    SELECT pg_catalog.jsonb_build_object('id',abandoned.id) INTO v_abandoned_cart
    FROM saas.abandoned_carts abandoned
    WHERE abandoned.store_id=v_store_id AND abandoned.source_cart_id=v_source_cart_id
      AND abandoned.status='abandoned' AND abandoned.abandoned_at IS NOT NULL
      AND abandoned.abandoned_at<=p_now AND abandoned.abandoned_at>p_now-pg_catalog.interval '30 days'
    ORDER BY abandoned.abandoned_at DESC,abandoned.id DESC LIMIT 1;
    v_abandoned_cart:=COALESCE(v_abandoned_cart,'null'::jsonb);
  END IF;

  IF v_line_count>20 THEN
    v_evaluation_mode:='cart_line_limit';
  ELSE
    SELECT EXISTS(
      SELECT 1
      FROM saas.subscriptions subscription
      JOIN saas.plans plan ON plan.id=subscription.plan_id
        AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
        AND plan.status='active' AND plan.valid_from<=p_now
        AND (plan.valid_until IS NULL OR p_now<plan.valid_until)
      JOIN saas.plan_features feature ON feature.plan_id=plan.id
        AND feature.feature_key='promotions' AND feature.enabled
      WHERE subscription.store_id=v_store_id AND subscription.status='active'
        AND subscription.valid_from<=p_now
        AND (subscription.valid_until IS NULL OR p_now<subscription.valid_until)
    ) INTO v_feature_enabled;
    IF v_feature_enabled THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'lineId',saas.storefront_commerce_uuid(p_order_id::text||':item:'||(source.ordinality-1)::text),
        'position',(source.ordinality-1)::integer,
        'productId',source.item->>'productId','variantId',source.item->>'variantId',
        'quantity',(source.item->>'quantity')::bigint,'unitPriceMinor',(source.item->>'unitPriceCents')::bigint,
        'unitCostMinor',NULL,'currency',v_cart_payload->>'currency','categoryIds','[]'::jsonb,
        'brandId',NULL,'collectionIds','[]'::jsonb
      ) ORDER BY source.ordinality),'[]'::jsonb) INTO v_context
      FROM pg_catalog.jsonb_array_elements(v_cart_payload->'items') WITH ORDINALITY source(item,ordinality);
      v_context:=pg_catalog.jsonb_build_object(
        'storeId',v_store_id,'customerId',v_customer.id,'paidOrderCount',v_paid_order_count,
        'customerSegmentIds',v_customer_segments,'customerTagIds',v_customer_tags,
        'cartLines',v_context,'shippingMethodId',v_shipping_method_id,'paymentMethodId',v_payment.id,
        'shippingBeforeDiscountMinor',v_shipping,'currency',v_cart_payload->>'currency',
        'storeLocalTime',saas.storefront_commerce_timestamp(p_now),'salesChannel','storefront',
        'submittedCodes',pg_catalog.to_jsonb(p_normalized_codes),'abandonedCart',v_abandoned_cart
      );
      IF saas.promotion_evaluator_context_valid(v_store_id,v_context) IS NOT TRUE
      THEN RAISE EXCEPTION 'checkout v2 evaluator context unavailable'; END IF;
      v_materialized_lines:=saas.promotion_evaluator_materialize_lines(v_store_id,v_cart_payload->>'currency',v_context,p_now);
      IF pg_catalog.jsonb_typeof(v_materialized_lines) IS DISTINCT FROM 'array'
         OR pg_catalog.jsonb_array_length(v_materialized_lines)<>v_line_count
      THEN RAISE EXCEPTION 'checkout v2 materialization unavailable'; END IF;
      v_evaluation:=saas.promotion_evaluate_internal_v1(v_store_id,v_context,p_now,NULL,v_materialized_lines);
      IF pg_catalog.jsonb_typeof(v_evaluation) IS DISTINCT FROM 'object'
         OR v_evaluation->>'merchantExplanation' IS DISTINCT FROM 'evaluated'
         OR v_evaluation->>'currency' IS DISTINCT FROM v_cart_payload->>'currency'
         OR (v_evaluation->>'subtotalBeforeDiscountMinor')::bigint IS DISTINCT FROM v_subtotal
         OR (v_evaluation->>'shippingBeforeDiscountMinor')::bigint IS DISTINCT FROM v_shipping
      THEN RAISE EXCEPTION 'checkout v2 evaluation unavailable'; END IF;
      v_line_discount:=(v_evaluation->>'lineDiscountTotalMinor')::bigint;
      v_shipping_discount:=(v_evaluation->>'shippingDiscountTotalMinor')::bigint;
      v_discount_total:=(v_evaluation->>'discountTotalMinor')::bigint;
      v_grand_total:=(v_evaluation->>'grandTotalMinor')::bigint;
      IF v_line_discount<0 OR v_shipping_discount<0 OR v_discount_total<>v_line_discount+v_shipping_discount
         OR v_shipping_discount>v_shipping OR v_grand_total<>v_subtotal+v_shipping-v_discount_total
         OR v_grand_total<0 OR EXISTS(
           SELECT 1 FROM pg_catalog.jsonb_array_elements(v_evaluation->'lineEffects') effect
           WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_context->'cartLines') context_line WHERE context_line->>'lineId'=effect->>'lineId')
         )
      THEN RAISE EXCEPTION 'checkout v2 financial projection unavailable'; END IF;

      FOR v_applied IN
        SELECT applied.value FROM pg_catalog.jsonb_array_elements(v_evaluation->'appliedPromotions') WITH ORDINALITY applied(value,ordinality)
        ORDER BY applied.ordinality
      LOOP
        v_public_applied:=v_public_applied||pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'name',v_applied->>'name','benefitKind',v_applied->>'benefitKind',
          'normalizedCode',CASE WHEN v_applied ? 'normalizedCode' THEN v_applied->>'normalizedCode' END,
          'lineDiscountCents',(v_applied->>'lineDiscountMinor')::bigint,
          'shippingDiscountCents',(v_applied->>'shippingDiscountMinor')::bigint,
          'discountCents',(v_applied->>'discountTotalMinor')::bigint
        )));
        v_projected_applied_discount:=v_projected_applied_discount+(v_applied->>'discountTotalMinor')::numeric;
      END LOOP;
      IF v_projected_applied_discount<>v_discount_total
      THEN RAISE EXCEPTION 'checkout v2 applied projection unavailable'; END IF;
      IF EXISTS(
        SELECT 1 FROM (
          SELECT gift->>'variantId' variant_id,(gift->>'autoAdd')::boolean auto_add,
            pg_catalog.sum((gift->>'quantity')::numeric) quantity
          FROM pg_catalog.jsonb_array_elements(v_evaluation->'gifts') gift
          GROUP BY gift->>'variantId',(gift->>'autoAdd')::boolean
        ) grouped WHERE grouped.quantity NOT BETWEEN 1 AND 1000000
      ) THEN RAISE EXCEPTION 'checkout v2 gift projection unavailable'; END IF;
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'variantId',grouped.variant_id,'quantity',grouped.quantity::bigint,'autoAdd',grouped.auto_add
      ) ORDER BY grouped.variant_id::uuid,grouped.auto_add),'[]'::jsonb) INTO v_public_gifts
      FROM (
        SELECT gift->>'variantId' variant_id,(gift->>'autoAdd')::boolean auto_add,
          pg_catalog.sum((gift->>'quantity')::numeric) quantity
        FROM pg_catalog.jsonb_array_elements(v_evaluation->'gifts') gift
        GROUP BY gift->>'variantId',(gift->>'autoAdd')::boolean
      ) grouped;

      -- A sale line and an auto-added gift may consume the same variant. Lock
      -- every required variant first, then validate the aggregate requirement;
      -- independent sale/gift checks would otherwise admit oversubscription.
      PERFORM variant.id
      FROM saas.product_variants variant
      WHERE variant.store_id=v_store_id AND variant.id IN (
        SELECT (item->>'variantId')::uuid
        FROM pg_catalog.jsonb_array_elements(v_cart_payload->'items') item
        UNION
        SELECT (gift->>'variantId')::uuid
        FROM pg_catalog.jsonb_array_elements(v_evaluation->'gifts') gift
        WHERE (gift->>'autoAdd')::boolean
      )
      ORDER BY variant.id
      FOR UPDATE OF variant;
      IF EXISTS(
        SELECT 1
        FROM (
          SELECT required_line.variant_id,pg_catalog.sum(required_line.quantity)::bigint required_quantity
          FROM (
            SELECT (item->>'variantId')::uuid variant_id,(item->>'quantity')::bigint quantity
            FROM pg_catalog.jsonb_array_elements(v_cart_payload->'items') item
            UNION ALL
            SELECT (gift->>'variantId')::uuid,(gift->>'quantity')::bigint
            FROM pg_catalog.jsonb_array_elements(v_evaluation->'gifts') gift
            WHERE (gift->>'autoAdd')::boolean
          ) required_line
          GROUP BY required_line.variant_id
        ) required
        LEFT JOIN saas.product_variants variant
          ON variant.store_id=v_store_id AND variant.id=required.variant_id
        WHERE variant.id IS NULL
           OR (variant.stock_tracking AND
             saas.storefront_available_stock(v_store_id,required.variant_id,p_now,NULL)<required.required_quantity)
      ) THEN RAISE EXCEPTION 'checkout v2 aggregate stock unavailable'; END IF;
    END IF;
  END IF;

  FOR v_item,v_ordinality IN
    SELECT source.item,source.ordinality
    FROM pg_catalog.jsonb_array_elements(v_cart_payload->'items') WITH ORDINALITY source(item,ordinality)
    ORDER BY source.ordinality
  LOOP
    v_line_id:=saas.storefront_commerce_uuid(p_order_id::text||':item:'||(v_ordinality-1)::text);
    v_line_effect:=0;
    IF v_feature_enabled AND v_evaluation_mode='evaluated' THEN
      SELECT COALESCE(pg_catalog.sum((effect->>'discountMinor')::numeric),0) INTO v_line_effect
      FROM pg_catalog.jsonb_array_elements(v_evaluation->'lineEffects') effect
      WHERE effect->>'lineId'=v_line_id::text;
    END IF;
    IF v_line_effect<0 OR v_line_effect>(v_item->>'lineTotalCents')::bigint
       OR pg_catalog.trunc(v_line_effect)<>v_line_effect
    THEN RAISE EXCEPTION 'checkout v2 line projection unavailable'; END IF;
    v_projected_line_discount:=v_projected_line_discount+v_line_effect;
    v_public_item:=pg_catalog.jsonb_build_object(
      'productId',v_item->>'productId','variantId',v_item->>'variantId','slug',v_item->>'slug',
      'title',v_item->>'title','variantTitle',v_item->>'variantTitle',
      'quantity',(v_item->>'quantity')::bigint,'unitPriceCents',(v_item->>'unitPriceCents')::bigint,
      'lineTotalCents',(v_item->>'lineTotalCents')::bigint,'discountCents',v_line_effect::bigint,
      'payableCents',(v_item->>'lineTotalCents')::bigint-v_line_effect::bigint,
      'available',(v_item->>'available')::boolean
    );
    IF v_item ? 'categoryId' THEN v_public_item:=v_public_item||pg_catalog.jsonb_build_object('categoryId',v_item->>'categoryId'); END IF;
    IF v_item ? 'media' THEN v_public_item:=v_public_item||pg_catalog.jsonb_build_object('media',v_item->'media'); END IF;
    v_public_items:=v_public_items||pg_catalog.jsonb_build_array(v_public_item);
  END LOOP;
  IF v_feature_enabled AND v_evaluation_mode='evaluated' AND v_projected_line_discount<>v_line_discount
  THEN RAISE EXCEPTION 'checkout v2 line reconciliation unavailable'; END IF;
  IF NOT v_feature_enabled OR v_evaluation_mode='cart_line_limit' THEN
    v_line_discount:=0; v_shipping_discount:=0; v_discount_total:=0;
    v_grand_total:=v_subtotal+v_shipping;
    v_public_applied:='[]'::jsonb; v_public_gifts:='[]'::jsonb;
  END IF;

  IF v_feature_enabled AND v_evaluation_mode='evaluated'
     AND pg_catalog.jsonb_array_length(v_evaluation->'appliedPromotions')>0 THEN
    v_reserve_operation_id:=saas.storefront_commerce_uuid('promotion-checkout-v2:'||p_operation_id::text||':reserve');
    v_reserve_fingerprint:=saas.promotion_operation_fingerprint_v2('reserve',v_store_id,pg_catalog.jsonb_build_object(
      'sourceKind','offline_checkout','sourceReference',p_order_id::text,'evaluatorContext',v_context
    ));
    IF v_reserve_fingerprint IS NULL THEN RAISE EXCEPTION 'checkout v2 reserve fingerprint unavailable'; END IF;
    SELECT reserve.outcome,reserve.result_payload INTO v_checkout_outcome,v_reserve_result
    FROM saas.promotion_reserve_group_v1(v_store_id,v_reserve_operation_id,v_reserve_fingerprint,
      'offline_checkout',p_order_id::text,v_context,p_now) reserve;
    IF v_checkout_outcome<>'reserved' OR pg_catalog.jsonb_typeof(v_reserve_result) IS DISTINCT FROM 'object'
    THEN RAISE EXCEPTION 'checkout v2 reserve failed'; END IF;
    v_reservation_group_id:=(v_reserve_result->>'reservationGroupId')::uuid;
  END IF;

  v_order_number:='SF-'||pg_catalog.upper(pg_catalog.replace(p_order_id::text,'-',''));
  INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,tracking,
    version,created_at,updated_at,customer_id)
  VALUES(p_order_id,v_store_id,v_order_number,'storefront',v_customer.first_name||' '||v_customer.last_name,
    v_customer.email,v_customer.phone,v_currency,v_subtotal,v_shipping,v_discount_total,v_grand_total,'pending','pending',
    p_delivery->'shippingAddress',NULL,1,p_now,p_now,v_customer.id);

  PERFORM pg_catalog.set_config('saas.inventory.source_marker','checkout_sale',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id',p_order_id::text,true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
  IF p_kind='cart' THEN
    v_position:=0;
    FOR v_line IN
      SELECT item.*,variant.stock_tracking,variant.title variant_title,variant.sku,product.title product_title
      FROM saas.storefront_cart_items item
      JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id
      JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id
      WHERE item.store_id=v_store_id AND item.cart_id=v_source_cart_id ORDER BY item.position,item.variant_id
    LOOP
      v_line_id:=saas.storefront_commerce_uuid(p_order_id::text||':item:'||v_position::text);
      v_line_effect:=0;
      IF v_feature_enabled AND v_evaluation_mode='evaluated' THEN
        SELECT COALESCE(pg_catalog.sum((effect->>'discountMinor')::numeric),0) INTO v_line_effect
        FROM pg_catalog.jsonb_array_elements(v_evaluation->'lineEffects') effect WHERE effect->>'lineId'=v_line_id::text;
      END IF;
      INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
      VALUES(v_line_id,v_store_id,p_order_id,v_line.product_id,v_line.variant_id,v_position,v_line.product_title,v_line.variant_title,v_line.sku,
        v_line.unit_price_cents,v_line.quantity,v_line_effect::bigint,v_line.unit_price_cents*v_line.quantity-v_line_effect::bigint,p_now);
      v_position:=v_position+1;
    END LOOP;
  ELSE
    v_line_id:=saas.storefront_commerce_uuid(p_order_id::text||':item:0');
    v_line_effect:=0;
    IF v_feature_enabled AND v_evaluation_mode='evaluated' THEN
      SELECT COALESCE(pg_catalog.sum((effect->>'discountMinor')::numeric),0) INTO v_line_effect
      FROM pg_catalog.jsonb_array_elements(v_evaluation->'lineEffects') effect WHERE effect->>'lineId'=v_line_id::text;
    END IF;
    INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
    VALUES(v_line_id,v_store_id,p_order_id,v_line.product_id,v_line.variant_id,0,v_line.product_title,v_line.variant_title,v_line.sku,
      v_line.unit_price_cents,v_line.quantity,v_line_effect::bigint,v_line.unit_price_cents*v_line.quantity-v_line_effect::bigint,p_now);
    v_position:=1;
  END IF;

  IF v_feature_enabled AND v_evaluation_mode='evaluated' THEN
    FOR v_gift IN
      SELECT pg_catalog.jsonb_build_object('variantId',gift->>'variantId','quantity',pg_catalog.sum((gift->>'quantity')::numeric)::bigint)
      FROM pg_catalog.jsonb_array_elements(v_evaluation->'gifts') gift
      WHERE (gift->>'autoAdd')::boolean
      GROUP BY gift->>'variantId'
      ORDER BY (gift->>'variantId')::uuid
    LOOP
      v_gift_quantity:=(v_gift->>'quantity')::bigint;
      SELECT variant.id variant_id,variant.product_id,variant.title variant_title,variant.sku,variant.stock_tracking,
        variant.status variant_status,product.slug product_slug,product.title product_title,product.status product_status
      INTO v_gift_variant
      FROM saas.product_variants variant
      JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
      WHERE variant.store_id=v_store_id AND variant.id=(v_gift->>'variantId')::uuid
      FOR UPDATE OF variant;
      IF NOT FOUND OR v_gift_variant.variant_status<>'active' OR v_gift_variant.product_status<>'active'
         OR (v_gift_variant.stock_tracking AND saas.storefront_available_stock(v_store_id,v_gift_variant.variant_id,p_now,NULL)<v_gift_quantity)
      THEN RAISE EXCEPTION 'checkout v2 gift stock unavailable'; END IF;
      v_gift_remaining:=v_gift_quantity;
      WHILE v_gift_remaining>0 LOOP
        IF v_position>99 THEN RAISE EXCEPTION 'checkout v2 gift line limit unavailable'; END IF;
        v_gift_chunk:=LEAST(v_gift_remaining,9999)::integer;
        INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
        VALUES(saas.storefront_commerce_uuid(p_order_id::text||':item:'||v_position::text),v_store_id,p_order_id,
          v_gift_variant.product_id,v_gift_variant.variant_id,v_position,v_gift_variant.product_title,v_gift_variant.variant_title,
          v_gift_variant.sku,0,v_gift_chunk,0,0,p_now);
        v_public_items:=v_public_items||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'productId',v_gift_variant.product_id,'variantId',v_gift_variant.variant_id,
          'slug',v_gift_variant.product_slug,'title',v_gift_variant.product_title,
          'variantTitle',v_gift_variant.variant_title,'quantity',v_gift_chunk,
          'unitPriceCents',0,'lineTotalCents',0,'discountCents',0,'payableCents',0,'available',true
        ));
        v_position:=v_position+1;
        v_gift_remaining:=v_gift_remaining-v_gift_chunk;
      END LOOP;
    END LOOP;
  END IF;

  -- One inventory mutation per variant is required by the immutable movement
  -- identity (order/source + variant + location + direction). It also makes the
  -- checked aggregate exactly equal to the quantity ultimately consumed.
  FOR v_line IN
    SELECT item.variant_id,pg_catalog.sum(item.quantity)::bigint required_quantity
    FROM saas.order_items item
    JOIN saas.product_variants variant
      ON variant.store_id=item.store_id AND variant.id=item.variant_id
    WHERE item.store_id=v_store_id AND item.order_id=p_order_id AND variant.stock_tracking
    GROUP BY item.variant_id
    ORDER BY item.variant_id
  LOOP
    UPDATE saas.product_variants variant
    SET stock_quantity=variant.stock_quantity-v_line.required_quantity,
      version=variant.version+1,updated_at=p_now
    WHERE variant.store_id=v_store_id AND variant.id=v_line.variant_id
      AND variant.stock_quantity>=v_line.required_quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'checkout v2 aggregate stock changed'; END IF;
  END LOOP;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);

  INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at)
  VALUES(p_event_id,v_store_id,p_order_id,NULL,'order_created',NULL,'pending','Storefront siparişi oluşturuldu.',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('paymentKind',p_payment_kind,'note',p_delivery->'note')),p_now);
  IF v_customer_credential.id IS NULL THEN
    INSERT INTO saas.storefront_customer_credentials(id,store_id,customer_id,key_id,credential_digest,expires_at,created_at,last_seen_at)
    VALUES(p_customer_credential_id,v_store_id,v_customer.id,p_customer_key_id,p_customer_digest,p_customer_expires_at,p_now,p_now)
    RETURNING * INTO v_customer_credential;
    v_customer_credential_created:=true;
  END IF;
  INSERT INTO saas.storefront_order_receipts(id,store_id,order_id,customer_credential_id,key_id,credential_digest,expires_at,created_at)
  VALUES(p_receipt_id,v_store_id,p_order_id,v_customer_credential.id,p_receipt_key_id,p_receipt_digest,p_receipt_expires_at,p_now);

  IF v_reservation_group_id IS NOT NULL THEN
    v_commit_operation_id:=saas.storefront_commerce_uuid('promotion-checkout-v2:'||p_operation_id::text||':commit');
    v_commit_fingerprint:=saas.promotion_operation_fingerprint_v2('commit',v_store_id,pg_catalog.jsonb_build_object(
      'reservationGroupId',v_reservation_group_id,'orderId',p_order_id
    ));
    IF v_commit_fingerprint IS NULL THEN RAISE EXCEPTION 'checkout v2 commit fingerprint unavailable'; END IF;
    SELECT committed.outcome,committed.result_payload INTO v_checkout_outcome,v_commit_result
    FROM saas.promotion_commit_reservation_group_v1(v_store_id,v_commit_operation_id,v_commit_fingerprint,
      v_reservation_group_id,p_order_id,p_now) committed;
    IF v_checkout_outcome<>'committed' OR pg_catalog.jsonb_typeof(v_commit_result) IS DISTINCT FROM 'object'
    THEN RAISE EXCEPTION 'checkout v2 commit failed'; END IF;
  END IF;

  v_receipt:=pg_catalog.jsonb_build_object(
    'orderReference',v_order_number,'currency',v_currency,'subtotalCents',v_subtotal,'shippingCents',v_shipping,
    'lineDiscountCents',v_line_discount,'shippingDiscountCents',v_shipping_discount,
    'discountCents',v_discount_total,'totalCents',v_grand_total,'paymentStatus','pending',
    'paymentMethod',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'kind',v_payment.kind,'label',v_payment.label,'instructions',v_payment.config->>'instructions',
      'bankName',CASE WHEN v_payment.kind='bank_transfer' THEN v_payment.config->>'bankName' END,
      'accountHolder',CASE WHEN v_payment.kind='bank_transfer' THEN v_payment.config->>'accountHolder' END,
      'iban',CASE WHEN v_payment.kind='bank_transfer' THEN v_payment.config->>'iban' END
    )),
    'delivery',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',v_customer.first_name||' '||v_customer.last_name,
      'addressLine1',p_delivery->'shippingAddress'->>'line1','addressLine2',p_delivery->'shippingAddress'->>'line2',
      'city',p_delivery->'shippingAddress'->>'city','district',p_delivery->'shippingAddress'->>'district',
      'postalCode',p_delivery->'shippingAddress'->>'postalCode','country','TR'
    )),
    'items',v_public_items,
    'promotionStatus',CASE WHEN v_evaluation_mode='cart_line_limit'
      THEN pg_catalog.jsonb_build_object('kind','not_evaluated','reason','cart_line_limit')
      ELSE pg_catalog.jsonb_build_object('kind','evaluated') END,
    'appliedPromotions',v_public_applied,'gifts',v_public_gifts,
    'createdAt',saas.storefront_commerce_timestamp(p_now)
  );
  v_result:=pg_catalog.jsonb_build_object(
    'receipt',v_receipt,
    'credentialPersistence',pg_catalog.jsonb_build_object(
      'receipt',true,'customer',v_customer_credential_created,
      'receiptKeyId',p_receipt_key_id,'customerKeyId',v_customer_credential.key_id
    )
  );
  IF pg_catalog.pg_column_size(v_result)>262144 THEN RAISE EXCEPTION 'checkout v2 receipt unavailable'; END IF;
  INSERT INTO saas.storefront_checkout_operations(operation_id,store_id,cart_id,intent_id,order_id,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,v_store_id,v_source_cart_id,v_source_intent_id,p_order_id,p_fingerprint,v_result,p_now);
  IF p_kind='cart' THEN
    UPDATE saas.storefront_carts SET status='converted',version=version+1,updated_at=p_now
    WHERE store_id=v_store_id AND id=v_source_cart_id;
  ELSE
    UPDATE saas.storefront_checkout_intents SET status='converted'
    WHERE store_id=v_store_id AND id=v_source_intent_id;
  END IF;
  RETURN QUERY SELECT 'committed',v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT COALESCE(v_rollback_outcome,'unavailable'),NULL::jsonb;
END $fn$;
SET LOCAL check_function_bodies = on;

ALTER FUNCTION saas.public_checkout_complete_v2(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[]) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.public_checkout_complete_v2(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[])
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_checkout_complete_v2(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[])
TO celebix_saas_host_resolver;

-- Code-only rollback keeps the legacy receipt ABI exact. Legacy readers hide
-- V2 receipts rather than fabricating an inaccurate gross-only V1 projection;
-- additive readers return the immutable stored V1 or V2 projection verbatim.
CREATE OR REPLACE FUNCTION saas.public_checkout_recover(
  p_hostname text,p_now timestamptz,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_store uuid; selected_operation saas.storefront_checkout_operations%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_operation FROM saas.storefront_checkout_operations WHERE operation_id=p_operation_id AND store_id=selected_store;
  IF NOT FOUND OR (selected_operation.result_payload->'receipt' ? 'promotionStatus') IS TRUE THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;
  ELSIF selected_operation.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',selected_operation.result_payload; END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION saas.public_receipt_get(
  p_hostname text,p_now timestamptz,p_receipt_credentials jsonb,p_customer_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_store uuid; selected_receipt saas.storefront_order_receipts%ROWTYPE; result jsonb;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_receipt_credentials,false)
    OR NOT saas.storefront_credential_candidates_valid(p_customer_credentials,false)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT receipt.* INTO selected_receipt FROM saas.storefront_order_receipts receipt
  JOIN pg_catalog.jsonb_array_elements(p_receipt_credentials) receipt_candidate
    ON receipt_candidate->>'keyId'=receipt.key_id AND receipt_candidate->>'digest'=receipt.credential_digest
  JOIN saas.storefront_customer_credentials customer_credential
    ON customer_credential.store_id=receipt.store_id AND customer_credential.id=receipt.customer_credential_id
  JOIN pg_catalog.jsonb_array_elements(p_customer_credentials) customer_candidate
    ON customer_candidate->>'keyId'=customer_credential.key_id AND customer_candidate->>'digest'=customer_credential.credential_digest
  WHERE receipt.store_id=selected_store AND receipt.expires_at>p_now AND customer_credential.expires_at>p_now
  ORDER BY receipt.created_at DESC,receipt.id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT operation.result_payload->'receipt' INTO result FROM saas.storefront_checkout_operations operation
  WHERE operation.store_id=selected_store AND operation.order_id=selected_receipt.order_id
    AND (operation.result_payload->'receipt' ? 'promotionStatus') IS NOT TRUE;
  RETURN QUERY SELECT CASE WHEN result IS NULL THEN 'not_found' ELSE 'found' END,result;
END
$fn$;

CREATE OR REPLACE FUNCTION saas.public_account_orders(
  p_hostname text,p_now timestamptz,p_credentials jsonb,p_limit integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_store uuid; selected_credential saas.storefront_customer_credentials%ROWTYPE; items jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR NOT saas.storefront_credential_candidates_valid(p_credentials,false) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT credential.* INTO selected_credential FROM saas.storefront_customer_credentials credential
  JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  WHERE credential.store_id=selected_store AND credential.expires_at>p_now ORDER BY credential.created_at DESC,credential.id LIMIT 1 FOR UPDATE OF credential;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  UPDATE saas.storefront_customer_credentials SET last_seen_at=GREATEST(last_seen_at,p_now)
    WHERE store_id=selected_store AND id=selected_credential.id;
  SELECT COALESCE(pg_catalog.jsonb_agg(entry.receipt ORDER BY entry.created_at DESC,entry.order_id DESC),'[]'::jsonb) INTO items FROM (
    SELECT operation.result_payload->'receipt' receipt,orders.created_at,orders.id order_id
    FROM saas.storefront_order_receipts receipt
    JOIN saas.orders orders ON orders.store_id=receipt.store_id AND orders.id=receipt.order_id
    JOIN saas.storefront_checkout_operations operation ON operation.store_id=orders.store_id AND operation.order_id=orders.id
    WHERE receipt.store_id=selected_store AND receipt.customer_credential_id=selected_credential.id
      AND (operation.result_payload->'receipt' ? 'promotionStatus') IS NOT TRUE
    ORDER BY receipt.created_at DESC,receipt.order_id DESC LIMIT p_limit
  ) entry;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('items',items);
END
$fn$;

CREATE OR REPLACE FUNCTION saas.public_checkout_recover_v2(
  p_hostname text,p_now timestamptz,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_store uuid; selected_operation saas.storefront_checkout_operations%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_operation FROM saas.storefront_checkout_operations WHERE operation_id=p_operation_id AND store_id=selected_store;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;
  ELSIF selected_operation.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',selected_operation.result_payload; END IF;
END
$fn$;

CREATE OR REPLACE FUNCTION saas.public_receipt_get_v2(
  p_hostname text,p_now timestamptz,p_receipt_credentials jsonb,p_customer_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_store uuid; selected_receipt saas.storefront_order_receipts%ROWTYPE; result jsonb;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_receipt_credentials,false)
    OR NOT saas.storefront_credential_candidates_valid(p_customer_credentials,false)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT receipt.* INTO selected_receipt FROM saas.storefront_order_receipts receipt
  JOIN pg_catalog.jsonb_array_elements(p_receipt_credentials) receipt_candidate
    ON receipt_candidate->>'keyId'=receipt.key_id AND receipt_candidate->>'digest'=receipt.credential_digest
  JOIN saas.storefront_customer_credentials customer_credential
    ON customer_credential.store_id=receipt.store_id AND customer_credential.id=receipt.customer_credential_id
  JOIN pg_catalog.jsonb_array_elements(p_customer_credentials) customer_candidate
    ON customer_candidate->>'keyId'=customer_credential.key_id AND customer_candidate->>'digest'=customer_credential.credential_digest
  WHERE receipt.store_id=selected_store AND receipt.expires_at>p_now AND customer_credential.expires_at>p_now
  ORDER BY receipt.created_at DESC,receipt.id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT operation.result_payload->'receipt' INTO result FROM saas.storefront_checkout_operations operation
  WHERE operation.store_id=selected_store AND operation.order_id=selected_receipt.order_id;
  RETURN QUERY SELECT CASE WHEN result IS NULL THEN 'not_found' ELSE 'found' END,result;
END
$fn$;

CREATE OR REPLACE FUNCTION saas.public_account_orders_v2(
  p_hostname text,p_now timestamptz,p_credentials jsonb,p_limit integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_store uuid; selected_credential saas.storefront_customer_credentials%ROWTYPE; items jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR NOT saas.storefront_credential_candidates_valid(p_credentials,false) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT credential.* INTO selected_credential FROM saas.storefront_customer_credentials credential
  JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  WHERE credential.store_id=selected_store AND credential.expires_at>p_now ORDER BY credential.created_at DESC,credential.id LIMIT 1 FOR UPDATE OF credential;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  UPDATE saas.storefront_customer_credentials SET last_seen_at=GREATEST(last_seen_at,p_now)
    WHERE store_id=selected_store AND id=selected_credential.id;
  SELECT COALESCE(pg_catalog.jsonb_agg(entry.receipt ORDER BY entry.created_at DESC,entry.order_id DESC),'[]'::jsonb) INTO items FROM (
    SELECT operation.result_payload->'receipt' receipt,orders.created_at,orders.id order_id
    FROM saas.storefront_order_receipts receipt
    JOIN saas.orders orders ON orders.store_id=receipt.store_id AND orders.id=receipt.order_id
    JOIN saas.storefront_checkout_operations operation ON operation.store_id=orders.store_id AND operation.order_id=orders.id
    WHERE receipt.store_id=selected_store AND receipt.customer_credential_id=selected_credential.id
    ORDER BY receipt.created_at DESC,receipt.order_id DESC LIMIT p_limit
  ) entry;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('items',items);
END
$fn$;

ALTER FUNCTION saas.public_checkout_recover(text,timestamptz,uuid,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.public_receipt_get(text,timestamptz,jsonb,jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.public_account_orders(text,timestamptz,jsonb,integer) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.public_checkout_recover_v2(text,timestamptz,uuid,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.public_receipt_get_v2(text,timestamptz,jsonb,jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.public_account_orders_v2(text,timestamptz,jsonb,integer) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.public_checkout_recover(text,timestamptz,uuid,text),saas.public_receipt_get(text,timestamptz,jsonb,jsonb),saas.public_account_orders(text,timestamptz,jsonb,integer),saas.public_checkout_recover_v2(text,timestamptz,uuid,text),saas.public_receipt_get_v2(text,timestamptz,jsonb,jsonb),saas.public_account_orders_v2(text,timestamptz,jsonb,integer)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_checkout_recover(text,timestamptz,uuid,text),saas.public_receipt_get(text,timestamptz,jsonb,jsonb),saas.public_account_orders(text,timestamptz,jsonb,integer),saas.public_checkout_recover_v2(text,timestamptz,uuid,text),saas.public_receipt_get_v2(text,timestamptz,jsonb,jsonb),saas.public_account_orders_v2(text,timestamptz,jsonb,integer)
TO celebix_saas_host_resolver;

CREATE OR REPLACE FUNCTION saas.promotion_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_role text; v_base_action text;
BEGIN
  IF p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE THEN RETURN 'invalid_input'; END IF;
  IF p_action IS NULL OR p_action NOT IN ('promotions.read','promotions.manage','promotions.manage_draft','promotions.publish','promotions.export_codes','promotions.archive') THEN RETURN 'durable_authority_invalid'; END IF;
  v_base_action:=CASE WHEN p_action IN ('promotions.manage','promotions.archive') THEN p_action ELSE 'promotions.read' END;
  v_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions',v_base_action);
  IF v_error IS NOT NULL THEN RETURN v_error; END IF;
  SELECT membership.role INTO v_role FROM saas.memberships membership
  WHERE membership.id=p_membership_id AND membership.store_id=p_store_id AND membership.principal_id=p_principal_id AND membership.status='active';
  IF p_action='promotions.manage_draft' AND v_role NOT IN ('store_owner','admin','editor') THEN RETURN 'membership_denied'; END IF;
  IF p_action IN ('promotions.publish','promotions.export_codes') AND v_role NOT IN ('store_owner','admin') THEN RETURN 'membership_denied'; END IF;
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
        AND variant.stock_tracking AND saas.storefront_available_stock(p_store_id,variant.id,p_now,NULL)<(p_document->'benefit'->>'quantity')::bigint
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
  WITH raw_facts AS MATERIALIZED (
    SELECT fact.* FROM saas.promotion_definition_variant_facts_v1(p_store_id,p_document,p_now) fact
    WHERE p_document->'benefit'->>'kind' NOT IN ('free_shipping','gift')
  ), bundle_items AS MATERIALIZED (
    SELECT (item->>'variantId')::uuid variant_id,(item->>'quantity')::bigint quantity
    FROM pg_catalog.jsonb_array_elements(CASE WHEN p_document->'benefit'->>'kind'='bundle_price' THEN p_document->'benefit'->'items' ELSE '[]'::jsonb END) item
  ), composition AS MATERIALIZED (
    SELECT fact.variant_id,fact.product_id,fact.currency,
      fact.price_minor*CASE WHEN p_document->'benefit'->>'kind'='bundle_price' THEN item.quantity ELSE 1 END price_minor,
      CASE WHEN fact.cost_minor IS NULL THEN NULL ELSE fact.cost_minor*CASE WHEN p_document->'benefit'->>'kind'='bundle_price' THEN item.quantity ELSE 1 END END cost_minor,
      fact.stock_tracking,fact.stock_quantity
    FROM raw_facts fact LEFT JOIN bundle_items item ON item.variant_id=fact.variant_id
    WHERE p_document->'benefit'->>'kind'<>'bundle_price' OR item.variant_id IS NOT NULL
  ), weighted AS MATERIALIZED (
    SELECT composition.*,
      COALESCE(sum(price_minor) OVER (),0)::bigint gross_value,
      CASE WHEN p_document->'benefit'->>'kind'='bundle_price' AND currency=p_document->'benefit'->>'currency'
        THEN GREATEST(0,COALESCE(sum(price_minor) OVER (),0)::bigint-(p_document->'benefit'->>'bundlePriceMinor')::bigint) ELSE 0 END bundle_saving,
      pg_catalog.row_number() OVER (ORDER BY variant_id) bundle_row,
      count(*) OVER () bundle_rows
    FROM composition
  ), shares AS MATERIALIZED (
    SELECT weighted.*,
      CASE WHEN gross_value>0 THEN bundle_saving*price_minor/gross_value ELSE 0 END bundle_floor_share
    FROM weighted
  ), facts AS MATERIALIZED (
    SELECT fact.*,
      CASE p_document->'benefit'->>'kind'
        WHEN 'percentage' THEN fact.price_minor*(p_document->'benefit'->>'percentageBps')::bigint/10000
        WHEN 'fixed_amount' THEN CASE WHEN fact.currency=p_document->'benefit'->>'currency' THEN LEAST(fact.price_minor,(p_document->'benefit'->>'amountMinor')::bigint) ELSE 0 END
        WHEN 'quantity_tiers' THEN fact.price_minor*COALESCE((SELECT max((tier->>'percentageBps')::bigint) FROM pg_catalog.jsonb_array_elements(p_document->'benefit'->'tiers') tier),0)/10000
        WHEN 'bundle_price' THEN CASE WHEN fact.bundle_row=fact.bundle_rows
          THEN fact.bundle_saving-(sum(fact.bundle_floor_share) OVER ()-fact.bundle_floor_share)
          ELSE fact.bundle_floor_share END
        WHEN 'buy_x_get_y' THEN fact.price_minor*(p_document->'benefit'->>'discountPercentageBps')::bigint/10000
        ELSE 0 END advertised_discount
    FROM shares fact
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
  VALUES (p_operation_id,p_store_id,p_operation_id,p_kind,p_fingerprint,v_entity_kind,v_entity_id,p_result,pg_catalog.date_trunc('milliseconds',p_now));
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_create_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_promotion_id uuid,p_name text,p_rule_document jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_operation saas.promotion_operations%ROWTYPE; v_result jsonb; v_failure text;
BEGIN
  IF p_promotion_id IS NULL OR p_operation_id IS NULL OR p_fingerprint IS DISTINCT FROM saas.promotion_operation_fingerprint_v2('create',p_store_id,pg_catalog.jsonb_build_object('name',p_name,'ruleDocument',p_rule_document)) OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR pg_catalog.length(p_name) NOT BETWEEN 1 AND 200 OR pg_catalog.octet_length(p_name)>800 OR p_name~'[[:cntrl:]]' OR saas.promotion_rule_document_valid(p_rule_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.manage_draft'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'create' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF saas.promotion_operation_result_valid('create',v_operation.result_payload) IS NOT TRUE OR v_operation.result_entity_kind<>'promotion' OR v_operation.result_entity_id IS DISTINCT FROM saas.promotion_operation_entity_id('create',v_operation.result_payload) THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF;
    RETURN;
  END IF;
  IF saas.promotion_lock_definition_references(p_store_id,p_rule_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-create:'||p_store_id::text,0));
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
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.manage_draft'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'update' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF saas.promotion_operation_result_valid('update',v_operation.result_payload) IS NOT TRUE OR v_operation.result_entity_kind<>'promotion' OR v_operation.result_entity_id IS DISTINCT FROM saas.promotion_operation_entity_id('update',v_operation.result_payload) THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb;
    ELSE
      IF v_operation.result_payload->>'status'<>'draft' THEN
        v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.publish');
        IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
      END IF;
      RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload;
    END IF;
    RETURN;
  END IF;
  -- Observe without a row lock, acquire all catalog/reference locks first, and
  -- only then lock the promotion. Checkout uses that same refs -> promotion
  -- order, so the two paths cannot form a promotion <-> variant cycle.
  SELECT * INTO v_observed FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_observed.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF;
  IF v_observed.version=9007199254740991 OR v_observed.status='archived' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF v_observed.status<>'draft' THEN
    v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.publish');
    IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  END IF;
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
  v_action:=CASE WHEN p_next_status='archived' THEN 'promotions.archive' ELSE 'promotions.publish' END;
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
  IF p_next_status='archived' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code:'||p_store_id::text,0));
    PERFORM 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.promotion_id=p_promotion_id ORDER BY batch.id FOR UPDATE;
    PERFORM 1 FROM saas.promotion_codes code WHERE code.store_id=p_store_id AND code.promotion_id=p_promotion_id ORDER BY code.id FOR UPDATE;
    UPDATE saas.promotion_code_batches
    SET status='revoked',version=CASE WHEN version<9007199254740991 THEN version+1 ELSE version END,updated_at=GREATEST(updated_at,pg_catalog.date_trunc('milliseconds',p_now))
    WHERE store_id=p_store_id AND promotion_id=p_promotion_id AND status<>'revoked';
    UPDATE saas.promotion_codes SET status='revoked'
    WHERE store_id=p_store_id AND promotion_id=p_promotion_id AND status<>'revoked';
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
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.manage_draft'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
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
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-create:'||p_store_id::text,0));
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
  SELECT 'abandoned_cart',cart.id,'Terk edilmiş sepet ••••'||pg_catalog.right(pg_catalog.replace(cart.id::text,'-',''),4),
    CASE WHEN cart.status='abandoned' AND cart.recovered_at IS NULL AND cart.archived_at IS NULL THEN 'active' ELSE 'unavailable' END
  FROM saas.abandoned_carts cart WHERE p_kind='abandoned_cart' AND cart.store_id=p_store_id
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
  IF p_kind IS NULL OR p_kind NOT IN ('product','variant','category','brand','collection','customer_segment','customer_tag','masked_customer','abandoned_cart','payment_method','shipping_method')
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
  IF p_kind IS NULL OR p_kind NOT IN ('product','variant','category','brand','collection','customer_segment','customer_tag','masked_customer','abandoned_cart','payment_method','shipping_method')
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

CREATE OR REPLACE FUNCTION saas.promotion_code_batch_projection_v1(p_store_id uuid,p_batch_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'id',batch.id,'promotionId',batch.promotion_id,'version',batch.version,'status',batch.status,
    'count',batch.requested_count,'prefix',batch.prefix,'codeLength',batch.code_length,
    'perCustomerUsage',batch.per_customer_usage,
    'expiresAt',CASE WHEN batch.expires_at IS NULL THEN NULL ELSE pg_catalog.to_char(batch.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'createdAt',pg_catalog.to_char(batch.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',pg_catalog.to_char(batch.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  FROM saas.promotion_code_batches batch
  WHERE batch.store_id=p_store_id AND batch.id=p_batch_id
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_code_batch_result_matches_v1(p_store_id uuid,p_operation_id uuid,p_kind text,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
BEGIN
  IF saas.promotion_operation_result_valid(p_kind,p_result) IS NOT TRUE THEN RETURN false; END IF;
  RETURN COALESCE((
    SELECT
      batch.promotion_id::text=p_result->>'promotionId'
      AND batch.version>=(p_result->>'version')::bigint
      AND batch.requested_count=(p_result->>'count')::integer
      AND batch.prefix=p_result->>'prefix'
      AND batch.code_length=(p_result->>'codeLength')::integer
      AND batch.per_customer_usage=(p_result->>'perCustomerUsage')::integer
      AND batch.expires_at IS NOT DISTINCT FROM CASE WHEN p_result->'expiresAt'='null'::jsonb THEN NULL ELSE (p_result->>'expiresAt')::timestamptz END
      AND batch.created_at=(p_result->>'createdAt')::timestamptz
      AND batch.updated_at>=(p_result->>'updatedAt')::timestamptz
      AND saas.promotion_code_batch_integrity_valid_v1(batch.store_id,batch.id)
      AND EXISTS(
        SELECT 1 FROM saas.promotion_operations ledger
        WHERE ledger.store_id=batch.store_id AND ledger.operation_id=p_operation_id
          AND ledger.operation_kind=p_kind AND ledger.created_at=(p_result->>'updatedAt')::timestamptz
      )
      AND CASE p_kind
        WHEN 'code_batch' THEN batch.operation_id=p_operation_id AND (p_result->>'version')::bigint=1 AND p_result->>'status'='active'
          AND p_result->>'updatedAt'=p_result->>'createdAt'
          AND EXISTS(
            SELECT 1 FROM saas.promotion_audit_events audit
            WHERE audit.store_id=batch.store_id AND audit.id=p_operation_id AND audit.promotion_id=batch.promotion_id
              AND audit.event_kind='code_batch_created' AND audit.payload->>'batchId'=batch.id::text
              AND audit.created_at=(p_result->>'createdAt')::timestamptz
          )
        WHEN 'code_batch_status' THEN EXISTS(
          SELECT 1 FROM saas.promotion_audit_events audit
          WHERE audit.store_id=batch.store_id AND audit.id=p_operation_id AND audit.promotion_id=batch.promotion_id
            AND audit.event_kind='code_batch_status_changed' AND audit.payload->>'batchId'=batch.id::text
            AND audit.payload->>'toStatus'=p_result->>'status' AND (audit.payload->>'version')::bigint=(p_result->>'version')::bigint
            AND audit.created_at=(p_result->>'updatedAt')::timestamptz
        )
        ELSE false
      END
    FROM saas.promotion_code_batches batch
    WHERE batch.store_id=p_store_id AND batch.id=(p_result->>'id')::uuid
  ),false);
EXCEPTION WHEN others THEN RETURN false;
END
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_create_code_batch_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_batch_id uuid,p_promotion_id uuid,p_count integer,p_prefix text,p_code_length integer,p_per_customer_usage integer,p_expires_at timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_error text; v_operation saas.promotion_operations%ROWTYPE; v_promotion saas.promotions%ROWTYPE;
  v_code text; v_code_id uuid; v_index integer; v_attempt integer; v_result jsonb; v_inserted boolean; v_constraint text;
  v_expires_text text:=CASE WHEN p_expires_at IS NULL THEN NULL ELSE pg_catalog.to_char(p_expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END;
  v_full_fingerprint text; v_legacy_fingerprint text;
BEGIN
  v_full_fingerprint:=saas.promotion_operation_fingerprint_v2('code_batch',p_store_id,pg_catalog.jsonb_build_object('promotionId',p_promotion_id,'count',p_count,'prefix',p_prefix,'codeLength',p_code_length,'perCustomerUsage',p_per_customer_usage,'expiresAt',v_expires_text));
  v_legacy_fingerprint:=saas.promotion_operation_fingerprint_v2('code_batch',p_store_id,pg_catalog.jsonb_build_object('promotionId',p_promotion_id,'count',p_count,'prefix',p_prefix));
  IF p_store_id IS NULL OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
     OR p_operation_id IS NULL OR p_batch_id IS NULL OR p_promotion_id IS NULL
     OR p_count IS NULL OR p_count NOT BETWEEN 1 AND 10000
     OR p_prefix IS NULL OR p_prefix !~ '^(|[A-Z0-9][A-Z0-9_-]{0,19})$'
     OR p_code_length IS NULL OR p_code_length NOT BETWEEN 16 AND 64 OR p_code_length-pg_catalog.char_length(p_prefix)<16
     OR p_per_customer_usage IS NULL OR p_per_customer_usage NOT BETWEEN 1 AND 1000000
     OR (p_expires_at IS NOT NULL AND (pg_catalog.isfinite(p_expires_at) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_expires_at)<>p_expires_at))
     OR (p_fingerprint IS DISTINCT FROM v_full_fingerprint
       AND NOT (p_code_length=pg_catalog.char_length(p_prefix)+20 AND p_per_customer_usage=1 AND p_expires_at IS NULL AND p_fingerprint IS NOT DISTINCT FROM v_legacy_fingerprint))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.publish');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'code_batch' OR NOT (
      v_operation.fingerprint=p_fingerprint
      OR (p_code_length=pg_catalog.char_length(p_prefix)+20 AND p_per_customer_usage=1 AND p_expires_at IS NULL
        AND v_operation.fingerprint IN (v_full_fingerprint,v_legacy_fingerprint)
        AND p_fingerprint IN (v_full_fingerprint,v_legacy_fingerprint))
    ) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF saas.promotion_operation_result_valid('code_batch',v_operation.result_payload) IS NOT TRUE OR v_operation.result_entity_kind<>'code_batch' OR v_operation.result_entity_id IS DISTINCT FROM saas.promotion_operation_entity_id('code_batch',v_operation.result_payload) OR saas.promotion_code_batch_result_matches_v1(p_store_id,p_operation_id,'code_batch',v_operation.result_payload) IS NOT TRUE THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF;
    RETURN;
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at<=p_now THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_promotion FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=p_promotion_id FOR UPDATE;
  IF NOT FOUND OR v_promotion.status='archived' THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_promotion.rule_document->'trigger'->>'kind'<>'code' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF p_expires_at IS NOT NULL AND v_promotion.rule_document->'schedule'->>'endsAt' IS NOT NULL AND p_expires_at>(v_promotion.rule_document->'schedule'->>'endsAt')::timestamptz THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code:'||p_store_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code-batch:'||p_batch_id::text,0));
  IF EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.id=p_batch_id OR (batch.store_id=p_store_id AND batch.operation_id=p_operation_id)) THEN RETURN QUERY SELECT 'code_conflict',NULL::jsonb; RETURN; END IF;
  BEGIN
    INSERT INTO saas.promotion_code_batches(id,store_id,promotion_id,status,requested_count,operation_id,created_at,version,prefix,code_length,per_customer_usage,expires_at,updated_at)
    VALUES(p_batch_id,p_store_id,p_promotion_id,'active',p_count,p_operation_id,p_now,1,p_prefix,p_code_length,p_per_customer_usage,p_expires_at,p_now);
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
    IF v_constraint IN ('promotion_code_batches_pkey','promotion_code_batches_id_key','promotion_code_batches_store_id_operation_id_key','promotion_code_batches_store_id_promotion_id_id_key') THEN
      RETURN QUERY SELECT 'code_conflict',NULL::jsonb; RETURN;
    END IF;
    RAISE;
  END;
  FOR v_index IN 1..p_count LOOP
    v_inserted:=false;
    FOR v_attempt IN 1..32 LOOP
      v_code_id:=pg_catalog.gen_random_uuid();
      v_code:=p_prefix||pg_catalog.substr(pg_catalog.upper(pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.gen_random_uuid()::text||':'||pg_catalog.gen_random_uuid()::text||':'||pg_catalog.gen_random_uuid()::text,'UTF8')),'hex')),1,p_code_length-pg_catalog.char_length(p_prefix));
      BEGIN
        INSERT INTO saas.promotion_codes(id,store_id,promotion_id,batch_id,code,status,created_at)
        VALUES(v_code_id,p_store_id,p_promotion_id,p_batch_id,v_code,'active',p_now);
        v_inserted:=true;
      EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint=CONSTRAINT_NAME;
        IF v_constraint NOT IN ('promotion_codes_store_code_key','promotion_codes_pkey') THEN RAISE; END IF;
      END;
      IF v_inserted THEN EXIT; END IF;
    END LOOP;
    IF NOT v_inserted THEN RAISE EXCEPTION 'promotion code entropy collision limit'; END IF;
  END LOOP;
  IF saas.promotion_code_batch_integrity_valid_v1(p_store_id,p_batch_id) IS NOT TRUE THEN RAISE EXCEPTION 'promotion code batch cardinality invalid'; END IF;
  v_result:=saas.promotion_code_batch_projection_v1(p_store_id,p_batch_id);
  PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'code_batch',p_fingerprint,v_result,p_now);
  INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at)
  VALUES(p_operation_id,p_store_id,p_promotion_id,p_principal_id,'code_batch_created',pg_catalog.jsonb_build_object('batchId',p_batch_id,'count',p_count,'version',1),p_now);
  RETURN QUERY SELECT 'created',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_create_code_batch_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_batch_id uuid,p_promotion_id uuid,p_count integer,p_prefix text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_outcome text; v_result jsonb;
BEGIN
  SELECT created.outcome,created.result_payload INTO v_outcome,v_result
  FROM saas.promotion_create_code_batch_v1(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    pg_catalog.date_trunc('milliseconds',p_now),p_operation_id,p_fingerprint,p_batch_id,p_promotion_id,p_count,p_prefix,
    pg_catalog.char_length(p_prefix)+20,1,NULL
  ) created;
  RETURN QUERY SELECT v_outcome,CASE WHEN v_result IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
    'id',v_result->'id','promotionId',v_result->'promotionId','status',v_result->'status','count',v_result->'count','createdAt',v_result->'createdAt'
  ) END;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_codes_csv_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_batch_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_batch saas.promotion_code_batches%ROWTYPE;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.export_codes'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_batch FROM saas.promotion_code_batches WHERE store_id=p_store_id AND id=p_batch_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF saas.promotion_code_batch_integrity_valid_v1(p_store_id,p_batch_id) IS NOT TRUE THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'exported',pg_catalog.jsonb_build_object('rows',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('code',c.code,'status',c.status) ORDER BY pg_catalog.convert_to(c.code,'UTF8'),c.id) FROM saas.promotion_codes c WHERE c.store_id=p_store_id AND c.batch_id=p_batch_id),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_analytics_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('currency',currency,'redemptions',redemptions,'discountMinor',discount_minor,'revenueMinor',0,'conversionBps',0) ORDER BY currency) FROM (SELECT currency,count(*)::bigint redemptions,COALESCE(sum(discount_minor),0)::bigint discount_minor FROM saas.promotion_redemptions WHERE store_id=p_store_id AND promotion_id=p_promotion_id GROUP BY currency) x),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_overview_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_days integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_active bigint; v_currencies jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_days IS NULL OR p_days NOT IN (7,30,90) OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT count(*) INTO v_active FROM saas.promotions promotion
  LEFT JOIN LATERAL (SELECT count(*)::bigint used,COALESCE(sum(redemption.discount_minor),0)::bigint budget FROM saas.promotion_redemptions redemption WHERE redemption.store_id=promotion.store_id AND redemption.promotion_id=promotion.id) usage ON true
  WHERE promotion.store_id=p_store_id AND saas.promotion_effective_status_v1(promotion.status,promotion.rule_document,usage.used,usage.budget,p_now)='active';
  WITH affected AS MATERIALIZED (
    SELECT redemption.order_id,redemption.currency,sum(redemption.discount_minor)::bigint discount_minor
    FROM saas.promotion_redemptions redemption
    WHERE redemption.store_id=p_store_id AND redemption.created_at>=p_now-pg_catalog.make_interval(days=>p_days) AND redemption.created_at<=p_now
    GROUP BY redemption.order_id,redemption.currency
  ), paid AS MATERIALIZED (
    SELECT affected.*,orders.total_cents,
      EXISTS(SELECT 1 FROM saas.order_commerce_attribution attribution JOIN saas.abandoned_carts cart ON cart.store_id=attribution.store_id AND cart.id=attribution.source_cart_id WHERE attribution.store_id=orders.store_id AND attribution.order_id=orders.id AND cart.recovered_at IS NOT NULL) recovered
    FROM affected JOIN saas.orders orders ON orders.store_id=p_store_id AND orders.id=affected.order_id
    WHERE orders.payment_status='completed' AND orders.currency=affected.currency
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency',currency,'affectedOrders',affected_orders,'discountMinor',discount_minor,'revenueMinor',revenue_minor,
    'recoveredOrders',recovered_orders,'recoveredRevenueMinor',recovered_revenue_minor
  ) ORDER BY currency),'[]'::jsonb) INTO v_currencies
  FROM (SELECT currency,count(*)::bigint affected_orders,COALESCE(sum(discount_minor),0)::bigint discount_minor,COALESCE(sum(total_cents),0)::bigint revenue_minor,count(*) FILTER(WHERE recovered)::bigint recovered_orders,COALESCE(sum(total_cents) FILTER(WHERE recovered),0)::bigint recovered_revenue_minor FROM paid GROUP BY currency) totals;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('periodDays',p_days,'activePromotions',v_active,'currencies',v_currencies);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_analytics_orders_v2(p_store_id uuid,p_promotion_id uuid,p_now timestamptz,p_days integer)
RETURNS TABLE(order_id uuid,currency text,usage_count bigint,discount_minor bigint,total_cents bigint,subtotal_cents bigint,shipping_cents bigint,customer_id uuid,recovered boolean,new_customer boolean)
LANGUAGE sql STABLE SET search_path = pg_catalog, saas AS $fn$
  SELECT orders.id,orders.currency,count(redemption.id)::bigint,sum(redemption.discount_minor)::bigint,orders.total_cents,orders.subtotal_cents,orders.shipping_cents,orders.customer_id,
    EXISTS(SELECT 1 FROM saas.order_commerce_attribution attribution JOIN saas.abandoned_carts cart ON cart.store_id=attribution.store_id AND cart.id=attribution.source_cart_id WHERE attribution.store_id=orders.store_id AND attribution.order_id=orders.id AND cart.recovered_at IS NOT NULL),
    orders.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.orders earlier WHERE earlier.store_id=orders.store_id AND earlier.customer_id=orders.customer_id AND earlier.payment_status='completed' AND (earlier.created_at,earlier.id)<(orders.created_at,orders.id))
  FROM saas.promotion_redemptions redemption JOIN saas.orders orders ON orders.store_id=redemption.store_id AND orders.id=redemption.order_id
  WHERE redemption.store_id=p_store_id AND redemption.promotion_id=p_promotion_id AND redemption.created_at>=p_now-pg_catalog.make_interval(days=>p_days) AND redemption.created_at<=p_now AND orders.payment_status='completed'
  GROUP BY orders.id,orders.currency,orders.total_cents,orders.subtotal_cents,orders.shipping_cents,orders.customer_id,orders.store_id,orders.created_at
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_analytics_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid,p_days integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_currencies jsonb; v_attribution jsonb; v_products jsonb; v_categories jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_days IS NULL OR p_days NOT IN (7,30,90) OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR p_promotion_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=p_promotion_id) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency',currency,'usageCount',usage_count,'affectedOrders',affected_orders,'discountMinor',discount_minor,
    'grossRevenueMinor',gross_revenue_minor,'netRevenueMinor',net_revenue_minor,'averageOrderMinor',average_order_minor,
    'newCustomerOrders',new_customer_orders,'recoveredOrders',recovered_orders,'recoveredRevenueMinor',recovered_revenue_minor
  ) ORDER BY currency),'[]'::jsonb) INTO v_currencies FROM (
    SELECT currency,sum(usage_count)::bigint usage_count,count(*)::bigint affected_orders,sum(discount_minor)::bigint discount_minor,
      sum(subtotal_cents+shipping_cents)::bigint gross_revenue_minor,sum(total_cents)::bigint net_revenue_minor,pg_catalog.floor(avg(total_cents))::bigint average_order_minor,
      count(*) FILTER(WHERE new_customer)::bigint new_customer_orders,count(*) FILTER(WHERE recovered)::bigint recovered_orders,COALESCE(sum(total_cents) FILTER(WHERE recovered),0)::bigint recovered_revenue_minor
    FROM saas.promotion_analytics_orders_v2(p_store_id,p_promotion_id,p_now,p_days) GROUP BY currency
  ) totals;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('source',source,'medium',medium,'campaign',campaign,'currency',currency,'orders',orders,'revenueMinor',revenue_minor) ORDER BY orders DESC,source,medium,campaign NULLS LAST,currency),'[]'::jsonb) INTO v_attribution FROM (
    SELECT attribution.last_touch_source source,attribution.last_touch_medium medium,attribution.last_touch_campaign campaign,affected.currency,count(*)::bigint orders,sum(affected.total_cents)::bigint revenue_minor
    FROM saas.promotion_analytics_orders_v2(p_store_id,p_promotion_id,p_now,p_days) affected JOIN saas.order_commerce_attribution attribution ON attribution.store_id=p_store_id AND attribution.order_id=affected.order_id
    GROUP BY attribution.last_touch_source,attribution.last_touch_medium,attribution.last_touch_campaign,affected.currency ORDER BY orders DESC LIMIT 100
  ) rows;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('productId',product_id,'label',label,'currency',currency,'quantity',quantity,'revenueMinor',revenue_minor) ORDER BY quantity DESC,product_id NULLS LAST,currency),'[]'::jsonb) INTO v_products FROM (
    SELECT item.product_id,min(item.product_name) label,affected.currency,sum(item.quantity)::bigint quantity,sum(item.line_total_cents)::bigint revenue_minor
    FROM saas.promotion_analytics_orders_v2(p_store_id,p_promotion_id,p_now,p_days) affected JOIN saas.order_items item ON item.store_id=p_store_id AND item.order_id=affected.order_id
    GROUP BY item.product_id,affected.currency ORDER BY quantity DESC LIMIT 20
  ) rows;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('categoryId',category_id,'label',label,'currency',currency,'quantity',quantity,'revenueMinor',revenue_minor) ORDER BY quantity DESC,category_id NULLS LAST,currency),'[]'::jsonb) INTO v_categories FROM (
    SELECT selected.category_id,COALESCE(selected.category_name,'Kategorisiz') label,affected.currency,sum(item.quantity)::bigint quantity,sum(item.line_total_cents)::bigint revenue_minor
    FROM saas.promotion_analytics_orders_v2(p_store_id,p_promotion_id,p_now,p_days) affected JOIN saas.order_items item ON item.store_id=p_store_id AND item.order_id=affected.order_id
    LEFT JOIN LATERAL (SELECT category.id category_id,category.name category_name FROM saas.catalog_product_categories assignment JOIN saas.catalog_categories category ON category.store_id=assignment.store_id AND category.id=assignment.category_id WHERE assignment.store_id=p_store_id AND assignment.product_id=item.product_id ORDER BY assignment.position,category.id LIMIT 1) selected ON true
    GROUP BY selected.category_id,selected.category_name,affected.currency ORDER BY quantity DESC LIMIT 20
  ) rows;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('periodDays',p_days,'currencies',v_currencies,'attribution',v_attribution,'topProducts',v_products,'topCategories',v_categories);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_code_batch_status_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_batch_id uuid,p_expected_version bigint,p_next_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_error text; v_operation saas.promotion_operations%ROWTYPE; v_batch saas.promotion_code_batches%ROWTYPE;
  v_promotion_id uuid; v_promotion_status text; v_result jsonb;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now OR p_operation_id IS NULL OR p_batch_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_next_status IS NULL OR p_next_status NOT IN ('active','paused','revoked')
     OR p_fingerprint IS DISTINCT FROM saas.promotion_operation_fingerprint_v2('code_batch_status',p_store_id,pg_catalog.jsonb_build_object('batchId',p_batch_id,'expectedVersion',p_expected_version,'nextStatus',p_next_status))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.publish');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'code_batch_status' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF saas.promotion_operation_result_valid('code_batch_status',v_operation.result_payload) IS NOT TRUE OR v_operation.result_entity_kind<>'code_batch' OR v_operation.result_entity_id IS DISTINCT FROM saas.promotion_operation_entity_id('code_batch_status',v_operation.result_payload) OR saas.promotion_code_batch_result_matches_v1(p_store_id,p_operation_id,'code_batch_status',v_operation.result_payload) IS NOT TRUE THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF;
    RETURN;
  END IF;
  SELECT batch.promotion_id INTO v_promotion_id FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=p_batch_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT promotion.status INTO v_promotion_status FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=v_promotion_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code:'||p_store_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code-batch:'||p_batch_id::text,0));
  SELECT * INTO v_batch FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.promotion_codes code WHERE code.store_id=p_store_id AND code.batch_id=p_batch_id ORDER BY code.id FOR UPDATE;
  IF saas.promotion_code_batch_integrity_valid_v1(p_store_id,p_batch_id) IS NOT TRUE THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  IF p_now<v_batch.updated_at THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF v_batch.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_code_batch_projection_v1(p_store_id,p_batch_id); RETURN; END IF;
  IF v_batch.version=9007199254740991 OR v_batch.status='revoked' OR v_batch.status=p_next_status
     OR (v_batch.status='active' AND p_next_status NOT IN ('paused','revoked'))
     OR (v_batch.status='paused' AND p_next_status NOT IN ('active','revoked'))
     OR (p_next_status='active' AND v_promotion_status='archived')
  THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  UPDATE saas.promotion_code_batches SET status=p_next_status,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_batch_id;
  UPDATE saas.promotion_codes SET status=p_next_status WHERE store_id=p_store_id AND batch_id=p_batch_id AND status<>'revoked';
  v_result:=saas.promotion_code_batch_projection_v1(p_store_id,p_batch_id);
  PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'code_batch_status',p_fingerprint,v_result,p_now);
  INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at)
  VALUES(p_operation_id,p_store_id,v_promotion_id,p_principal_id,'code_batch_status_changed',pg_catalog.jsonb_build_object('batchId',p_batch_id,'fromStatus',v_batch.status,'toStatus',p_next_status,'version',v_batch.version+1),p_now);
  RETURN QUERY SELECT 'updated',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_code_batch_status_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_batch_id uuid,p_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_version bigint; v_current_status text; v_digest text; v_operation_id uuid; v_fingerprint text; v_outcome text; v_result jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_store_id IS NULL OR p_batch_id IS NULL OR p_status IS NULL OR p_status NOT IN ('active','paused','revoked') OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT batch.version,batch.status INTO v_version,v_current_status FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=p_batch_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_current_status=p_status THEN
    SELECT batch.version,batch.status INTO v_version,v_current_status FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=p_batch_id FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    PERFORM 1 FROM saas.promotion_codes code WHERE code.store_id=p_store_id AND code.batch_id=p_batch_id ORDER BY code.id FOR UPDATE;
    v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.manage');
    IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
    IF saas.promotion_code_batch_integrity_valid_v1(p_store_id,p_batch_id) IS NOT TRUE THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
    IF v_current_status=p_status THEN RETURN QUERY SELECT 'updated',pg_catalog.jsonb_build_object('id',p_batch_id,'status',p_status);
    ELSIF v_current_status='revoked' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'version_conflict',NULL::jsonb; END IF;
    RETURN;
  END IF;
  IF saas.promotion_code_batch_integrity_valid_v1(p_store_id,p_batch_id) IS NOT TRUE THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  IF v_current_status='revoked' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  v_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('promotion-code-batch-status-legacy-v1:'||p_store_id::text||':'||p_batch_id::text||':'||v_version::text||':'||p_status,'UTF8')),'hex');
  v_operation_id:=(pg_catalog.substr(v_digest,1,8)||'-'||pg_catalog.substr(v_digest,9,4)||'-4'||pg_catalog.substr(v_digest,14,3)||'-8'||pg_catalog.substr(v_digest,18,3)||'-'||pg_catalog.substr(v_digest,21,12))::uuid;
  v_fingerprint:=saas.promotion_operation_fingerprint_v2('code_batch_status',p_store_id,pg_catalog.jsonb_build_object('batchId',p_batch_id,'expectedVersion',v_version,'nextStatus',p_status));
  SELECT changed.outcome,changed.result_payload INTO v_outcome,v_result
  FROM saas.promotion_code_batch_status_v1(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    pg_catalog.date_trunc('milliseconds',p_now),v_operation_id,v_fingerprint,p_batch_id,v_version,p_status
  ) changed;
  RETURN QUERY SELECT v_outcome,CASE WHEN v_result IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object('id',v_result->'id','status',v_result->'status') END;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_code_batch_list_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_promotion_id uuid,p_limit integer,p_snapshot_at timestamptz,p_after_created_at timestamptz,p_after_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_error text; v_snapshot timestamptz:=COALESCE(p_snapshot_at,pg_catalog.date_trunc('milliseconds',p_now)); v_items jsonb; v_has_more boolean; v_cursor jsonb; v_page_count integer;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
     OR p_promotion_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR pg_catalog.isfinite(v_snapshot) IS NOT TRUE OR v_snapshot>p_now
     OR NOT ((p_snapshot_at IS NULL AND p_after_created_at IS NULL AND p_after_id IS NULL) OR (p_snapshot_at IS NOT NULL AND p_after_created_at IS NOT NULL AND p_after_id IS NOT NULL))
     OR (p_snapshot_at IS NOT NULL AND pg_catalog.date_trunc('milliseconds',p_snapshot_at)<>p_snapshot_at)
     OR (p_after_created_at IS NOT NULL AND (pg_catalog.isfinite(p_after_created_at) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_after_created_at)<>p_after_created_at OR p_after_created_at>v_snapshot))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.id=p_promotion_id) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  WITH page AS MATERIALIZED (
    SELECT batch.*
    FROM saas.promotion_code_batches batch
    WHERE batch.store_id=p_store_id AND batch.promotion_id=p_promotion_id AND batch.created_at<=v_snapshot
      AND (p_after_created_at IS NULL OR (batch.created_at,batch.id)<(p_after_created_at,p_after_id))
    ORDER BY batch.created_at DESC,batch.id DESC LIMIT p_limit+1
  ), metrics AS MATERIALIZED (
    SELECT page.*,
      count(*) FILTER (WHERE EXISTS(SELECT 1 FROM saas.promotion_redemptions redemption WHERE redemption.store_id=code.store_id AND redemption.code_id=code.id))::bigint used,
      count(*) FILTER (WHERE NOT EXISTS(SELECT 1 FROM saas.promotion_redemptions redemption WHERE redemption.store_id=code.store_id AND redemption.code_id=code.id) AND EXISTS(SELECT 1 FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=code.store_id AND reservation.code_id=code.id AND reservation.status='reserved' AND reservation.expires_at>p_now))::bigint held,
      count(*) FILTER (WHERE page.status='active' AND code.status='active' AND (page.expires_at IS NULL OR p_now<page.expires_at) AND NOT EXISTS(SELECT 1 FROM saas.promotion_redemptions redemption WHERE redemption.store_id=code.store_id AND redemption.code_id=code.id) AND NOT EXISTS(SELECT 1 FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=code.store_id AND reservation.code_id=code.id AND reservation.status='reserved' AND reservation.expires_at>p_now))::bigint remaining,
      count(code.id)::bigint actual_count
    FROM page LEFT JOIN saas.promotion_codes code ON code.store_id=page.store_id AND code.batch_id=page.id
    GROUP BY page.id,page.store_id,page.promotion_id,page.status,page.requested_count,page.operation_id,page.created_at,page.version,page.prefix,page.code_length,page.per_customer_usage,page.expires_at,page.updated_at
  ), visible AS MATERIALIZED (
    SELECT * FROM metrics ORDER BY created_at DESC,id DESC LIMIT p_limit
  )
  SELECT
    (SELECT count(*) FROM metrics),
    COALESCE((SELECT pg_catalog.jsonb_agg(saas.promotion_code_batch_projection_v1(store_id,id)||pg_catalog.jsonb_build_object('used',used,'held',held,'remaining',remaining) ORDER BY created_at DESC,id DESC) FROM visible),'[]'::jsonb),
    (SELECT count(*)>p_limit FROM metrics),
    CASE WHEN (SELECT count(*)>p_limit FROM metrics) THEN (SELECT pg_catalog.jsonb_build_object('createdAt',pg_catalog.to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'id',id) FROM visible ORDER BY created_at,id LIMIT 1) ELSE NULL END
  INTO v_page_count,v_items,v_has_more,v_cursor;
  IF EXISTS(
    WITH page AS (
      SELECT batch.id,batch.requested_count FROM saas.promotion_code_batches batch
      WHERE batch.store_id=p_store_id AND batch.promotion_id=p_promotion_id AND batch.created_at<=v_snapshot
        AND (p_after_created_at IS NULL OR (batch.created_at,batch.id)<(p_after_created_at,p_after_id))
      ORDER BY batch.created_at DESC,batch.id DESC LIMIT p_limit+1
    ) SELECT 1 FROM page WHERE saas.promotion_code_batch_integrity_valid_v1(p_store_id,page.id) IS NOT TRUE
  ) THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',v_items,'hasMore',v_has_more,'snapshotAt',pg_catalog.to_char(v_snapshot AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'cursorAnchor',v_cursor);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_legacy_review_reason_v1(p_store_id uuid,p_record_id uuid,p_name text,p_config jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = pg_catalog, saas AS $fn$
DECLARE v_type text; v_value text; v_minimum text; v_usage text; v_code text; v_numeric numeric;
BEGIN
  IF p_store_id IS NULL OR p_record_id IS NULL OR p_name IS NULL THEN RETURN 'invalid_legacy_record'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.merchant_admin_records record
    WHERE record.store_id=p_store_id AND record.id=p_record_id
      AND record.record_kind='discount' AND record.status='active'
      AND pg_catalog.isfinite(record.created_at) AND pg_catalog.isfinite(record.updated_at)
  ) THEN RETURN 'invalid_legacy_record'; END IF;
  IF p_name<>pg_catalog.btrim(p_name) OR pg_catalog.length(p_name) NOT BETWEEN 1 AND 200 OR pg_catalog.octet_length(p_name)>800 OR p_name~'[[:cntrl:]]' THEN RETURN 'invalid_legacy_record'; END IF;
  IF pg_catalog.jsonb_typeof(p_config)<>'object' THEN RETURN 'invalid_legacy_record'; END IF;
  IF saas.promotion_json_keys(p_config,ARRAY['discountType','value'],ARRAY['code','discountType','value','minimumOrderCents','usageLimit']) IS NOT TRUE THEN RETURN 'invalid_legacy_record'; END IF;
  IF pg_catalog.jsonb_typeof(p_config->'discountType')<>'string' THEN RETURN 'invalid_legacy_record'; END IF;
  v_type:=p_config->>'discountType'; v_value:=p_config->>'value';
  IF v_type NOT IN ('percent','fixed') THEN RETURN 'unsupported_discount_type'; END IF;
  IF pg_catalog.jsonb_typeof(p_config->'value') NOT IN ('string','number') THEN RETURN 'invalid_value'; END IF;
  IF v_type='percent' THEN
    IF pg_catalog.octet_length(v_value)>64 OR v_value !~ '^(0|[1-9][0-9]{0,2})([.][0-9]+)?$' THEN RETURN 'invalid_value'; END IF;
    BEGIN v_numeric:=v_value::numeric; EXCEPTION WHEN others THEN RETURN 'invalid_value'; END;
    IF v_numeric<0.01 OR v_numeric>100 OR v_numeric*100<>pg_catalog.trunc(v_numeric*100) THEN RETURN 'invalid_value'; END IF;
  ELSE
    IF pg_catalog.octet_length(v_value)>64 OR v_value !~ '^[1-9][0-9]{0,18}([.]0+)?$' THEN RETURN 'invalid_value'; END IF;
    BEGIN v_numeric:=v_value::numeric; EXCEPTION WHEN others THEN RETURN 'invalid_value'; END;
    IF v_numeric>8000000000 OR v_numeric<>pg_catalog.trunc(v_numeric) THEN RETURN 'invalid_value'; END IF;
  END IF;
  IF p_config ? 'minimumOrderCents' AND p_config->'minimumOrderCents'<>'null'::jsonb THEN
    v_minimum:=p_config->>'minimumOrderCents';
    IF pg_catalog.jsonb_typeof(p_config->'minimumOrderCents')<>'number' THEN RETURN 'invalid_minimum_order'; END IF;
    IF pg_catalog.octet_length(v_minimum)>64 OR v_minimum !~ '^(0|[1-9][0-9]{0,18})([.]0+)?$' THEN RETURN 'invalid_minimum_order'; END IF;
    BEGIN v_numeric:=v_minimum::numeric; EXCEPTION WHEN others THEN RETURN 'invalid_minimum_order'; END;
    IF v_numeric>8000000000 OR v_numeric<>pg_catalog.trunc(v_numeric) THEN RETURN 'invalid_minimum_order'; END IF;
  END IF;
  IF p_config ? 'usageLimit' AND p_config->'usageLimit'<>'null'::jsonb THEN
    v_usage:=p_config->>'usageLimit';
    IF pg_catalog.jsonb_typeof(p_config->'usageLimit')<>'number' THEN RETURN 'invalid_usage_limit'; END IF;
    IF pg_catalog.octet_length(v_usage)>64 OR v_usage !~ '^(0|[1-9][0-9]{0,18})([.]0+)?$' THEN RETURN 'invalid_usage_limit'; END IF;
    BEGIN v_numeric:=v_usage::numeric; EXCEPTION WHEN others THEN RETURN 'invalid_usage_limit'; END;
    IF v_numeric>1000000000 OR v_numeric<>pg_catalog.trunc(v_numeric) THEN RETURN 'invalid_usage_limit'; END IF;
  END IF;
  IF p_config ? 'code' AND p_config->'code'<>'null'::jsonb THEN
    IF pg_catalog.jsonb_typeof(p_config->'code')<>'string' THEN RETURN 'invalid_code'; END IF;
    v_code:=saas.promotion_normalize_code(p_config->>'code');
    IF v_code IS NULL OR v_code !~ '^[A-Z0-9][A-Z0-9_-]{0,63}$' THEN RETURN 'invalid_code'; END IF;
    IF EXISTS(SELECT 1 FROM saas.promotion_codes code WHERE code.store_id=p_store_id AND code.code=v_code)
       OR EXISTS(SELECT 1 FROM saas.merchant_admin_records sibling WHERE sibling.store_id=p_store_id AND sibling.record_kind='discount' AND sibling.id<>p_record_id AND pg_catalog.jsonb_typeof(sibling.config)='object' AND sibling.config ? 'code' AND sibling.config->'code'<>'null'::jsonb AND saas.promotion_normalize_code(sibling.config->>'code')=v_code)
    THEN RETURN 'code_conflict'; END IF;
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN RETURN 'invalid_legacy_record';
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_store_timezone_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_timezone text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT record.config->>'timezone' INTO v_timezone
  FROM saas.merchant_admin_records record
  WHERE record.store_id=p_store_id AND record.record_kind='general_setting' AND record.status='active'
  ORDER BY record.updated_at DESC,record.id DESC LIMIT 1;
  v_timezone:=COALESCE(v_timezone,'Europe/Istanbul');
  IF pg_catalog.length(v_timezone) NOT BETWEEN 1 AND 64
     OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names zone WHERE zone.name=v_timezone)
  THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('timezone',v_timezone);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_storefront_origin_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_hostname text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT domain.hostname INTO v_hostname FROM saas.store_domains domain
  WHERE domain.store_id=p_store_id AND domain.status='active' AND domain.is_primary AND domain.verified_at IS NOT NULL AND domain.verified_at<=p_now
  ORDER BY domain.hostname LIMIT 1;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('origin',CASE WHEN v_hostname IS NULL THEN NULL ELSE 'https://'||v_hostname END);
END $fn$;

-- Advisory, validated static read model for the optional Redis cache. Checkout
-- still evaluates current PostgreSQL usage, reservations and lifecycle facts.
CREATE OR REPLACE FUNCTION saas.public_promotion_compiled_read_v1(p_hostname text,p_now timestamptz,p_currency text,p_sales_channel text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_store_id uuid; v_store_currency text; v_enabled boolean:=false; v_count integer; v_definitions jsonb;
BEGIN
  IF p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname) OR p_hostname<>pg_catalog.btrim(p_hostname)
     OR pg_catalog.length(p_hostname) NOT BETWEEN 3 AND 253 OR p_hostname!~'^[a-z0-9.-]+$'
     OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
     OR p_currency IS NULL OR p_currency!~'^[A-Z]{3}$' OR p_sales_channel NOT IN ('storefront','quick_order')
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_store_id:=saas.storefront_public_store(p_hostname,p_now);
  IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT store.currency INTO v_store_currency FROM saas.stores store WHERE store.id=v_store_id AND store.status='active';
  IF v_store_currency IS DISTINCT FROM p_currency THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT EXISTS(
    SELECT 1 FROM saas.subscriptions subscription
    JOIN saas.plans plan ON plan.id=subscription.plan_id AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
      AND plan.status='active' AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR p_now<plan.valid_until)
    JOIN saas.plan_features feature ON feature.plan_id=plan.id AND feature.feature_key='promotions' AND feature.enabled
    WHERE subscription.store_id=v_store_id AND subscription.status='active' AND subscription.valid_from<=p_now AND (subscription.valid_until IS NULL OR p_now<subscription.valid_until)
  ) INTO v_enabled;
  IF NOT v_enabled THEN
    RETURN QUERY SELECT 'compiled',pg_catalog.jsonb_build_object('schemaVersion',1,'storeId',v_store_id,'currency',p_currency,'salesChannel',p_sales_channel,'definitions','[]'::jsonb); RETURN;
  END IF;
  WITH candidates AS MATERIALIZED (
    SELECT promotion.id,promotion.version,promotion.rule_document
    FROM saas.promotions promotion
    WHERE promotion.store_id=v_store_id AND promotion.status='active'
      AND saas.promotion_rule_document_valid(promotion.rule_document)
      AND (promotion.rule_document->'schedule'->>'startsAt' IS NULL OR (promotion.rule_document->'schedule'->>'startsAt')::timestamptz<=p_now)
      AND (promotion.rule_document->'schedule'->>'endsAt' IS NULL OR p_now<(promotion.rule_document->'schedule'->>'endsAt')::timestamptz)
      AND (NOT (promotion.rule_document->'conditions' ? 'salesChannels') OR promotion.rule_document->'conditions'->'salesChannels' ? p_sales_channel)
      AND (promotion.rule_document->'benefit'->>'kind' NOT IN ('fixed_amount','bundle_price') OR promotion.rule_document->'benefit'->>'currency'=p_currency)
    ORDER BY promotion.id LIMIT 101
  )
  SELECT count(*)::integer,COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',id,'version',version,'ruleDocument',rule_document) ORDER BY id),'[]'::jsonb)
  INTO v_count,v_definitions FROM candidates;
  IF v_count>100 THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'compiled',pg_catalog.jsonb_build_object('schemaVersion',1,'storeId',v_store_id,'currency',p_currency,'salesChannel',p_sales_channel,'definitions',v_definitions);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_legacy_list_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF (SELECT count(*) FROM (SELECT 1 FROM saas.merchant_admin_records record WHERE record.store_id=p_store_id AND record.record_kind='discount' LIMIT 101) bounded)>100 THEN
    RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'legacyRecordId',r.id,'promotionId',p.id,
    'reason',CASE WHEN p.id IS NOT NULL THEN 'adopted' ELSE COALESCE(saas.promotion_legacy_review_reason_v1(r.store_id,r.id,r.name,r.config),'invalid_legacy_record') END
  ) ORDER BY r.created_at,r.id) FROM saas.merchant_admin_records r LEFT JOIN saas.promotions p ON p.store_id=r.store_id AND p.legacy_record_id=r.id WHERE r.store_id=p_store_id AND r.record_kind='discount'),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_legacy_list_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_limit integer,p_snapshot_at timestamptz,p_after_created_at timestamptz,p_after_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_snapshot timestamptz:=COALESCE(p_snapshot_at,pg_catalog.date_trunc('milliseconds',p_now)); v_items jsonb; v_has_more boolean; v_cursor jsonb;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR NOT ((p_snapshot_at IS NULL AND p_after_created_at IS NULL AND p_after_id IS NULL) OR (p_snapshot_at IS NOT NULL AND p_after_created_at IS NOT NULL AND p_after_id IS NOT NULL))
     OR pg_catalog.isfinite(v_snapshot) IS NOT TRUE OR v_snapshot>p_now OR (p_snapshot_at IS NOT NULL AND pg_catalog.date_trunc('milliseconds',p_snapshot_at)<>p_snapshot_at)
     OR (p_after_created_at IS NOT NULL AND (pg_catalog.isfinite(p_after_created_at) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_after_created_at)<>p_after_created_at OR p_after_created_at>v_snapshot))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  WITH records AS MATERIALIZED (
    SELECT record.*,
      CASE WHEN pg_catalog.isfinite(record.created_at) THEN pg_catalog.date_trunc('milliseconds',record.created_at) ELSE '0001-01-01T00:00:00.000Z'::timestamptz END cursor_created_at
    FROM saas.merchant_admin_records record
    WHERE record.store_id=p_store_id AND record.record_kind='discount'
      AND (pg_catalog.isfinite(record.created_at) IS NOT TRUE OR record.created_at<=v_snapshot)
  ), page AS MATERIALIZED (
    SELECT record.id,record.cursor_created_at created_at,promotion.id promotion_id,
      CASE WHEN promotion.id IS NOT NULL THEN 'adopted' ELSE COALESCE(saas.promotion_legacy_review_reason_v1(record.store_id,record.id,record.name,record.config),'invalid_legacy_record') END reason
    FROM records record
    LEFT JOIN saas.promotions promotion ON promotion.store_id=record.store_id AND promotion.legacy_record_id=record.id
    WHERE p_after_created_at IS NULL OR (record.cursor_created_at,record.id)<(p_after_created_at,p_after_id)
    ORDER BY record.cursor_created_at DESC,record.id DESC LIMIT p_limit+1
  ), visible AS MATERIALIZED (SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT p_limit)
  SELECT COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('legacyRecordId',id,'promotionId',promotion_id,'reason',reason) ORDER BY created_at DESC,id DESC) FROM visible),'[]'::jsonb),
    (SELECT count(*)>p_limit FROM page),
    CASE WHEN (SELECT count(*)>p_limit FROM page) THEN (SELECT pg_catalog.jsonb_build_object('createdAt',pg_catalog.to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'id',id) FROM visible ORDER BY created_at,id LIMIT 1) ELSE NULL END
  INTO v_items,v_has_more,v_cursor;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',v_items,'hasMore',v_has_more,'snapshotAt',pg_catalog.to_char(v_snapshot AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'cursorAnchor',v_cursor);
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_legacy_resolve_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_legacy_record_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_error text; v_record saas.merchant_admin_records%ROWTYPE; v_promotion_id uuid; v_reason text;
BEGIN
  v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.read');
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF p_legacy_record_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT record.* INTO v_record
  FROM saas.merchant_admin_records record
  WHERE record.store_id=p_store_id AND record.id=p_legacy_record_id AND record.record_kind='discount';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT promotion.id INTO v_promotion_id
  FROM saas.promotions promotion
  WHERE promotion.store_id=p_store_id AND promotion.legacy_record_id=v_record.id;
  v_reason:=CASE WHEN v_promotion_id IS NOT NULL THEN 'adopted' ELSE COALESCE(saas.promotion_legacy_review_reason_v1(v_record.store_id,v_record.id,v_record.name,v_record.config),'invalid_legacy_record') END;
  RETURN QUERY SELECT 'resolved',pg_catalog.jsonb_build_object(
    'legacyRecordId',v_record.id,
    'promotionId',v_promotion_id,
    'reason',v_reason
  );
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

-- Settlement freezes one exact, bounded per-promotion order projection.  This
-- validator is shared by reservation creation, settlement and recovery so a
-- structurally valid but financially different snapshot cannot be consumed.
CREATE OR REPLACE FUNCTION saas.promotion_order_snapshot_valid_v1(p_snapshot jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE STRICT SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_line jsonb; v_range jsonb; v_gift jsonb; v_rule jsonb;
  v_kind text; v_currency text; v_previous_kind text; v_previous_line uuid;
  v_previous_gross bigint; v_previous_discount bigint; v_previous_position integer:=-1;
  v_previous_end bigint; v_line_discount numeric; v_total_discount numeric:=0;
  v_gift_quantity bigint:=0; v_line_ids text[]:=ARRAY[]::text[]; v_positions integer[]:=ARRAY[]::integer[];
BEGIN
  IF pg_catalog.jsonb_typeof(p_snapshot)<>'object'
     OR pg_catalog.octet_length(p_snapshot::text)>131072
     OR pg_catalog.pg_column_size(p_snapshot)>262144
     OR saas.promotion_json_keys(p_snapshot,
       ARRAY['promotionId','promotionVersion','promotionName','couponCode','benefit','targets','discountLines','shippingDiscountMinor','giftLines','discountTotalMinor','currency','evaluatedAt'],
       ARRAY['promotionId','promotionVersion','promotionName','couponCode','benefit','targets','discountLines','shippingDiscountMinor','giftLines','discountTotalMinor','currency','evaluatedAt']) IS NOT TRUE
     OR saas.promotion_json_uuid(p_snapshot->'promotionId') IS NOT TRUE
     OR saas.promotion_json_integer(p_snapshot->'promotionVersion',1,9007199254740991) IS NOT TRUE
     OR pg_catalog.jsonb_typeof(p_snapshot->'promotionName')<>'string'
     OR p_snapshot->>'promotionName'<>pg_catalog.btrim(p_snapshot->>'promotionName')
     OR pg_catalog.length(p_snapshot->>'promotionName') NOT BETWEEN 1 AND 200
     OR pg_catalog.octet_length(p_snapshot->>'promotionName')>800
     OR p_snapshot->>'promotionName'~'[[:cntrl:]]'
     OR pg_catalog.jsonb_typeof(p_snapshot->'couponCode') NOT IN ('null','string')
     OR (p_snapshot->'couponCode'<>'null'::jsonb AND saas.promotion_normalize_code(p_snapshot->>'couponCode') IS DISTINCT FROM p_snapshot->>'couponCode')
     OR pg_catalog.jsonb_typeof(p_snapshot->'discountLines')<>'array'
     OR pg_catalog.jsonb_array_length(p_snapshot->'discountLines')>20
     OR pg_catalog.jsonb_typeof(p_snapshot->'giftLines')<>'array'
     OR pg_catalog.jsonb_array_length(p_snapshot->'giftLines')>1
     OR saas.promotion_json_integer(p_snapshot->'shippingDiscountMinor',0,8000000000) IS NOT TRUE
     OR saas.promotion_json_integer(p_snapshot->'discountTotalMinor',0,8000000000) IS NOT TRUE
     OR pg_catalog.jsonb_typeof(p_snapshot->'currency')<>'string'
     OR p_snapshot->>'currency'!~'^[A-Z]{3}$'
     OR saas.promotion_json_utc_timestamp(p_snapshot->'evaluatedAt') IS NOT TRUE
  THEN RETURN false; END IF;

  v_currency:=p_snapshot->>'currency'; v_kind:=p_snapshot->'benefit'->>'kind';
  v_rule:=pg_catalog.jsonb_build_object(
    'schemaVersion',1,'benefit',p_snapshot->'benefit','targets',p_snapshot->'targets',
    'audience',pg_catalog.jsonb_build_object('mode','everyone'),
    'trigger',pg_catalog.jsonb_build_object('kind','automatic'),
    'schedule',pg_catalog.jsonb_build_object('timezone','Europe/Istanbul'),
    'limits',pg_catalog.jsonb_build_object('totalUsage',NULL,'perCustomerUsage',NULL,'budgetMinor',NULL,'orderMaximumMinor',NULL),
    'conditions',pg_catalog.jsonb_build_object('minimumBasketMinor',0,'minimumQuantity',0,'minimumProductQuantity',0),
    'combinationPolicy',pg_catalog.jsonb_build_object('kind','none'),'priority',0,
    'marginPolicy',pg_catalog.jsonb_build_object('kind','warn'),
    'progressMessagePolicy',pg_catalog.jsonb_build_object('enabled',false));
  IF saas.promotion_rule_document_valid(v_rule) IS NOT TRUE
     OR (v_kind IN ('fixed_amount','bundle_price') AND p_snapshot->'benefit'->>'currency'<>v_currency)
  THEN RETURN false; END IF;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_snapshot->'discountLines') LOOP
    IF saas.promotion_json_keys(v_line,ARRAY['lineId','position','discountMinor','capturedRanges'],ARRAY['lineId','position','discountMinor','capturedRanges']) IS NOT TRUE
       OR saas.promotion_json_uuid(v_line->'lineId') IS NOT TRUE
       OR saas.promotion_json_integer(v_line->'position',0,99) IS NOT TRUE
       OR saas.promotion_json_integer(v_line->'discountMinor',1,8000000000) IS NOT TRUE
       OR pg_catalog.jsonb_typeof(v_line->'capturedRanges')<>'array'
       OR pg_catalog.jsonb_array_length(v_line->'capturedRanges') NOT BETWEEN 1 AND 64
       OR v_line->>'lineId'=ANY(v_line_ids)
       OR (v_line->>'position')::integer=ANY(v_positions)
       OR (v_line->>'position')::integer<v_previous_position
       OR ((v_line->>'position')::integer=v_previous_position AND (v_line->>'lineId')::uuid<=v_previous_line)
    THEN RETURN false; END IF;
    v_previous_position:=(v_line->>'position')::integer; v_previous_line:=(v_line->>'lineId')::uuid;
    v_line_ids:=pg_catalog.array_append(v_line_ids,v_line->>'lineId'); v_positions:=pg_catalog.array_append(v_positions,v_previous_position);
    v_previous_end:=0; v_previous_kind:=NULL; v_previous_gross:=NULL; v_previous_discount:=NULL; v_line_discount:=0; v_gift_quantity:=0;
    FOR v_range IN SELECT value FROM pg_catalog.jsonb_array_elements(v_line->'capturedRanges') LOOP
      IF saas.promotion_json_keys(v_range,ARRAY['startOrdinal','quantity','grossUnitMinor','discountUnitMinor','kind'],ARRAY['startOrdinal','quantity','grossUnitMinor','discountUnitMinor','kind']) IS NOT TRUE
         OR saas.promotion_json_integer(v_range->'startOrdinal',0,999999) IS NOT TRUE
         OR saas.promotion_json_integer(v_range->'quantity',1,1000000) IS NOT TRUE
         OR (v_range->>'startOrdinal')::bigint<>v_previous_end
         OR (v_range->>'startOrdinal')::numeric+(v_range->>'quantity')::numeric>1000000
         OR saas.promotion_json_integer(v_range->'grossUnitMinor',0,8000000000) IS NOT TRUE
         OR saas.promotion_json_integer(v_range->'discountUnitMinor',0,8000000000) IS NOT TRUE
         OR (v_range->>'discountUnitMinor')::bigint>(v_range->>'grossUnitMinor')::bigint
         OR pg_catalog.jsonb_typeof(v_range->'kind')<>'string'
         OR v_range->>'kind' NOT IN ('sale','gift','buy_x_get_y')
         OR (v_range->>'kind'='gift' AND (v_range->>'discountUnitMinor')::bigint<>(v_range->>'grossUnitMinor')::bigint)
         OR (v_previous_kind=v_range->>'kind' AND v_previous_gross=(v_range->>'grossUnitMinor')::bigint AND v_previous_discount=(v_range->>'discountUnitMinor')::bigint)
      THEN RETURN false; END IF;
      IF v_kind IN ('gift','buy_x_get_y') AND v_range->>'kind'='sale' AND (v_range->>'discountUnitMinor')::bigint<>0 THEN RETURN false; END IF;
      IF v_kind='gift' AND v_range->>'kind' NOT IN ('sale','gift') THEN RETURN false; END IF;
      IF v_kind='buy_x_get_y' AND v_range->>'kind' NOT IN ('sale','buy_x_get_y') THEN RETURN false; END IF;
      IF v_kind NOT IN ('gift','buy_x_get_y') AND v_range->>'kind'<>'sale' THEN RETURN false; END IF;
      v_previous_end:=(v_range->>'startOrdinal')::bigint+(v_range->>'quantity')::bigint;
      v_previous_kind:=v_range->>'kind'; v_previous_gross:=(v_range->>'grossUnitMinor')::bigint; v_previous_discount:=(v_range->>'discountUnitMinor')::bigint;
      v_line_discount:=v_line_discount+(v_range->>'quantity')::numeric*(v_range->>'discountUnitMinor')::numeric;
      IF v_range->>'kind'='gift' THEN v_gift_quantity:=v_gift_quantity+(v_range->>'quantity')::bigint; END IF;
    END LOOP;
    IF v_line_discount<>(v_line->>'discountMinor')::numeric THEN RETURN false; END IF;
    IF v_kind='gift' AND v_gift_quantity<>(p_snapshot->'benefit'->>'quantity')::bigint THEN RETURN false; END IF;
    IF v_kind='buy_x_get_y' AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(v_line->'capturedRanges') range_row WHERE range_row->>'kind'='buy_x_get_y') THEN RETURN false; END IF;
    v_total_discount:=v_total_discount+v_line_discount;
  END LOOP;

  IF pg_catalog.jsonb_array_length(p_snapshot->'giftLines')=1 THEN
    v_gift:=p_snapshot->'giftLines'->0;
    IF v_kind<>'gift' OR pg_catalog.jsonb_typeof(v_gift)<>'object'
       OR NOT (saas.promotion_json_keys(v_gift,ARRAY['variantId','quantity','paidMinor','autoAdd'],ARRAY['variantId','quantity','paidMinor','autoAdd'])
               OR saas.promotion_json_keys(v_gift,ARRAY['variantId','quantity','paidMinor','autoAdd','lineId'],ARRAY['variantId','quantity','paidMinor','autoAdd','lineId']))
       OR saas.promotion_json_uuid(v_gift->'variantId') IS NOT TRUE
       OR saas.promotion_json_integer(v_gift->'quantity',1,1000000) IS NOT TRUE
       OR v_gift->'paidMinor'<>'0'::jsonb
       OR pg_catalog.jsonb_typeof(v_gift->'autoAdd')<>'boolean'
       OR v_gift->>'variantId'<>p_snapshot->'benefit'->>'giftVariantId'
       OR (v_gift->>'quantity')::bigint<>(p_snapshot->'benefit'->>'quantity')::bigint
       OR (v_gift->>'autoAdd')::boolean<>(p_snapshot->'benefit'->>'autoAdd')::boolean
       OR ((v_gift->>'autoAdd')::boolean AND v_gift ? 'lineId')
       OR (NOT (v_gift->>'autoAdd')::boolean AND (saas.promotion_json_uuid(v_gift->'lineId') IS NOT TRUE OR NOT (v_gift->>'lineId'=ANY(v_line_ids))))
    THEN RETURN false; END IF;
  END IF;
  IF v_kind='free_shipping' THEN
    IF pg_catalog.jsonb_array_length(p_snapshot->'discountLines')<>0 OR pg_catalog.jsonb_array_length(p_snapshot->'giftLines')<>0 THEN RETURN false; END IF;
  ELSIF v_kind='gift' THEN
    IF pg_catalog.jsonb_array_length(p_snapshot->'giftLines')<>1 OR (p_snapshot->>'shippingDiscountMinor')::bigint<>0
       OR ((p_snapshot->'benefit'->>'autoAdd')::boolean AND pg_catalog.jsonb_array_length(p_snapshot->'discountLines')<>0)
       OR (NOT (p_snapshot->'benefit'->>'autoAdd')::boolean AND (pg_catalog.jsonb_array_length(p_snapshot->'discountLines')<>1 OR v_gift->>'lineId' IS DISTINCT FROM v_line_ids[1]))
    THEN RETURN false; END IF;
  ELSE
    IF pg_catalog.jsonb_array_length(p_snapshot->'giftLines')<>0 OR (p_snapshot->>'shippingDiscountMinor')::bigint<>0 THEN RETURN false; END IF;
  END IF;
  v_total_discount:=v_total_discount+(p_snapshot->>'shippingDiscountMinor')::numeric;
  IF v_total_discount<>(p_snapshot->>'discountTotalMinor')::numeric
     OR (NOT (v_kind='gift' AND (p_snapshot->'benefit'->>'autoAdd')::boolean) AND v_total_discount<=0)
     OR (v_kind='gift' AND (p_snapshot->'benefit'->>'autoAdd')::boolean AND v_total_discount<>0)
  THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_captured_ranges_v1(p_quantity bigint,p_gross_unit_minor bigint,p_discount_minor bigint,p_kind text,p_kind_quantity bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, saas AS $fn$
DECLARE v_result jsonb:='[]'::jsonb; v_sale_quantity bigint; v_discount_quantity bigint; v_each bigint; v_remainder bigint; v_start bigint:=0;
BEGIN
  IF p_quantity NOT BETWEEN 1 AND 1000000 OR p_gross_unit_minor NOT BETWEEN 0 AND 8000000000 OR p_discount_minor NOT BETWEEN 0 AND 8000000000 OR p_kind NOT IN ('sale','gift','buy_x_get_y') THEN RETURN NULL; END IF;
  IF p_kind='sale' THEN v_sale_quantity:=0; v_discount_quantity:=p_quantity;
  ELSE v_discount_quantity:=p_kind_quantity; v_sale_quantity:=p_quantity-v_discount_quantity; END IF;
  IF v_discount_quantity IS NULL OR v_discount_quantity<1 OR v_sale_quantity<0 OR p_discount_minor>p_gross_unit_minor*v_discount_quantity THEN RETURN NULL; END IF;
  IF p_kind='gift' AND p_discount_minor<>p_gross_unit_minor*v_discount_quantity THEN RETURN NULL; END IF;
  IF v_sale_quantity>0 THEN
    v_result:=v_result||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('startOrdinal',0,'quantity',v_sale_quantity,'grossUnitMinor',p_gross_unit_minor,'discountUnitMinor',0,'kind','sale'));
    v_start:=v_sale_quantity;
  END IF;
  v_each:=p_discount_minor/v_discount_quantity; v_remainder:=p_discount_minor%v_discount_quantity;
  IF v_remainder>0 THEN
    v_result:=v_result||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('startOrdinal',v_start,'quantity',v_remainder,'grossUnitMinor',p_gross_unit_minor,'discountUnitMinor',v_each+1,'kind',p_kind));
    v_start:=v_start+v_remainder;
  END IF;
  IF v_discount_quantity-v_remainder>0 THEN
    v_result:=v_result||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('startOrdinal',v_start,'quantity',v_discount_quantity-v_remainder,'grossUnitMinor',p_gross_unit_minor,'discountUnitMinor',v_each,'kind',p_kind));
  END IF;
  RETURN v_result;
EXCEPTION WHEN numeric_value_out_of_range THEN RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_buy_x_get_y_line_take_v1(p_store_id uuid,p_currency text,p_rule jsonb,p_lines jsonb,p_line_id uuid)
RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, saas AS $fn$
  WITH eligible AS MATERIALIZED (
    SELECT COALESCE(sum((line->>'quantity')::bigint),0)::bigint eligible_quantity
    FROM pg_catalog.jsonb_array_elements(p_lines) line
    WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,p_currency,p_rule->'targets',line)
  ), reward_base AS MATERIALIZED (
    SELECT line,(line->>'quantity')::bigint quantity,(line->>'unitPriceMinor')::bigint price,
      CASE WHEN p_rule->'benefit'->'reward'->>'strategy'='same_product_cheapest' THEN line->>'productId' ELSE '' END group_key
    FROM pg_catalog.jsonb_array_elements(p_lines) line
    WHERE saas.promotion_evaluator_catalog_line_matches(p_store_id,p_currency,p_rule->'targets',line)
      AND (p_rule->'benefit'->'reward'->>'strategy'<>'specific_variant' OR line->>'variantId'=p_rule->'benefit'->'reward'->>'variantId')
      AND (p_rule->'benefit'->'reward'->>'strategy'<>'selected_products_cheapest' OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_rule->'benefit'->'reward'->'productIds') id WHERE id=line->>'productId'))
  ), ordered AS MATERIALIZED (
    SELECT line,quantity,group_key,
      CASE WHEN group_key<>'' THEN sum(quantity) OVER(PARTITION BY group_key) ELSE eligible.eligible_quantity END total_quantity,
      sum(quantity) OVER(PARTITION BY group_key ORDER BY price,(line->>'position')::integer,line->>'lineId')-quantity prior_quantity
    FROM reward_base CROSS JOIN eligible
  )
  SELECT COALESCE(max(LEAST(quantity,GREATEST(0,pg_catalog.floor(total_quantity/((p_rule->'benefit'->>'buyQuantity')::bigint+(p_rule->'benefit'->>'receiveQuantity')::bigint))::bigint*(p_rule->'benefit'->>'receiveQuantity')::bigint-prior_quantity))) FILTER (WHERE line->>'lineId'=p_line_id::text),0)::bigint FROM ordered
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_order_snapshot_build_v1(p_store_id uuid,p_context jsonb,p_evaluation jsonb,p_promotion_id uuid,p_evaluated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_promotion saas.promotions%ROWTYPE; v_applied jsonb; v_effect jsonb; v_line jsonb; v_gift jsonb;
  v_lines jsonb:='[]'::jsonb; v_gifts jsonb:='[]'::jsonb; v_ranges jsonb; v_snapshot jsonb;
  v_kind text; v_take bigint; v_quantity bigint; v_discount bigint; v_currency text:=p_evaluation->>'currency';
BEGIN
  SELECT * INTO v_promotion FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id;
  SELECT value INTO v_applied FROM pg_catalog.jsonb_array_elements(p_evaluation->'appliedPromotions') WHERE value->>'promotionId'=p_promotion_id::text;
  IF NOT FOUND OR v_applied IS NULL OR (v_applied->>'version')::bigint<>v_promotion.version OR v_applied->>'name'<>v_promotion.name THEN RETURN NULL; END IF;
  v_kind:=v_promotion.rule_document->'benefit'->>'kind';
  FOR v_effect IN SELECT value FROM pg_catalog.jsonb_array_elements(p_evaluation->'lineEffects') WHERE value->>'promotionId'=p_promotion_id::text ORDER BY value->>'lineId' LOOP
    SELECT value INTO v_line FROM pg_catalog.jsonb_array_elements(p_context->'cartLines') WHERE value->>'lineId'=v_effect->>'lineId';
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_quantity:=(v_line->>'quantity')::bigint; v_discount:=(v_effect->>'discountMinor')::bigint;
    IF v_kind='gift' THEN
      v_take:=(v_promotion.rule_document->'benefit'->>'quantity')::bigint;
      v_ranges:=saas.promotion_captured_ranges_v1(v_quantity,(v_line->>'unitPriceMinor')::bigint,v_discount,'gift',v_take);
    ELSIF v_kind='buy_x_get_y' THEN
      v_take:=saas.promotion_buy_x_get_y_line_take_v1(p_store_id,v_currency,v_promotion.rule_document,p_context->'cartLines',(v_line->>'lineId')::uuid);
      v_ranges:=saas.promotion_captured_ranges_v1(v_quantity,(v_line->>'unitPriceMinor')::bigint,v_discount,'buy_x_get_y',v_take);
    ELSE
      v_ranges:=saas.promotion_captured_ranges_v1(v_quantity,(v_line->>'unitPriceMinor')::bigint,v_discount,'sale',NULL);
    END IF;
    IF v_ranges IS NULL THEN RETURN NULL; END IF;
    v_lines:=v_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('lineId',v_line->>'lineId','position',(v_line->>'position')::integer,'discountMinor',v_discount,'capturedRanges',v_ranges));
  END LOOP;
  SELECT COALESCE(pg_catalog.jsonb_agg(value-'promotionId' ORDER BY value->>'lineId' NULLS FIRST),'[]'::jsonb) INTO v_gifts
  FROM pg_catalog.jsonb_array_elements(p_evaluation->'gifts') WHERE value->>'promotionId'=p_promotion_id::text;
  SELECT COALESCE(pg_catalog.jsonb_agg(value ORDER BY (value->>'position')::integer,value->>'lineId'),'[]'::jsonb) INTO v_lines FROM pg_catalog.jsonb_array_elements(v_lines) value;
  v_snapshot:=pg_catalog.jsonb_build_object(
    'promotionId',p_promotion_id,'promotionVersion',v_promotion.version,'promotionName',v_promotion.name,
    'couponCode',CASE WHEN v_applied ? 'normalizedCode' THEN pg_catalog.to_jsonb(v_applied->>'normalizedCode') ELSE 'null'::jsonb END,
    'benefit',v_promotion.rule_document->'benefit','targets',v_promotion.rule_document->'targets','discountLines',v_lines,
    'shippingDiscountMinor',(v_applied->>'shippingDiscountMinor')::bigint,'giftLines',v_gifts,
    'discountTotalMinor',(v_applied->>'discountTotalMinor')::bigint,'currency',v_currency,
    'evaluatedAt',pg_catalog.to_char(p_evaluated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  IF saas.promotion_order_snapshot_valid_v1(v_snapshot) IS NOT TRUE OR pg_catalog.pg_column_size(v_snapshot)>262144 THEN RETURN NULL; END IF;
  RETURN v_snapshot;
EXCEPTION WHEN others THEN RETURN NULL;
END $fn$;

-- Hosted V2 reserves promotions to the receipt horizon while legacy hosted
-- sessions continue to inherit their original fifteen-minute hold horizon.
-- These nullable facts are immutable under the existing session row guard.
ALTER TABLE saas.storefront_hosted_checkout_sessions
  ADD COLUMN IF NOT EXISTS evaluator_authority_digest char(64),
  ADD COLUMN IF NOT EXISTS promotion_evaluator_context jsonb,
  ADD COLUMN IF NOT EXISTS promotion_evaluation jsonb,
  ADD COLUMN IF NOT EXISTS promotion_normalized_codes jsonb,
  ADD COLUMN IF NOT EXISTS promotion_reservation_group_id uuid,
  ADD COLUMN IF NOT EXISTS promotion_reservation_expires_at timestamptz,
  DROP CONSTRAINT IF EXISTS storefront_hosted_checkout_sessions_v2_facts_check,
  ADD CONSTRAINT storefront_hosted_checkout_sessions_v2_facts_check CHECK (
    (
      evaluator_authority_digest IS NULL
      AND promotion_evaluator_context IS NULL
      AND promotion_evaluation IS NULL
      AND promotion_normalized_codes IS NULL
      AND promotion_reservation_group_id IS NULL
      AND promotion_reservation_expires_at IS NULL
    )
    OR
    (
      evaluator_authority_digest~'^[a-f0-9]{64}$'
      AND pg_catalog.jsonb_typeof(promotion_evaluator_context)='object'
      AND pg_catalog.jsonb_typeof(promotion_evaluation)='object'
      AND pg_catalog.jsonb_typeof(promotion_normalized_codes)='array'
      AND pg_catalog.jsonb_array_length(promotion_normalized_codes) BETWEEN 0 AND 5
      AND pg_catalog.pg_column_size(promotion_evaluator_context)<=131072
      AND pg_catalog.pg_column_size(promotion_evaluation)<=131072
      AND pg_catalog.pg_column_size(promotion_normalized_codes)<=2048
      AND (promotion_reservation_group_id IS NULL)=(promotion_reservation_expires_at IS NULL)
      AND (
        promotion_reservation_expires_at IS NULL
        OR (
          pg_catalog.isfinite(promotion_reservation_expires_at)
          AND promotion_reservation_expires_at=receipt_expires_at
        )
      )
    )
  );

ALTER TABLE saas.storefront_hosted_checkout_operations
  DROP CONSTRAINT storefront_hosted_checkout_operations_result_payload_check,
  ADD CONSTRAINT storefront_hosted_checkout_operations_result_payload_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
    AND pg_catalog.pg_column_size(result_payload)<=786432
  );

SET LOCAL check_function_bodies = off;
CREATE OR REPLACE FUNCTION saas.promotion_reservation_source_valid_v1(p_store_id uuid,p_source_kind text,p_source_reference text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_source_id uuid;
BEGIN
  IF p_store_id IS NULL OR p_source_kind IS NULL OR p_source_kind NOT IN ('hosted_checkout','offline_checkout')
     OR p_source_reference IS NULL OR p_source_reference<>pg_catalog.btrim(p_source_reference)
  THEN RETURN false; END IF;
  v_source_id:=p_source_reference::uuid;
  IF p_source_reference<>v_source_id::text THEN RETURN false; END IF;
  IF p_source_kind='offline_checkout' THEN RETURN true; END IF;
  RETURN EXISTS(
    SELECT 1 FROM saas.storefront_hosted_checkout_sessions hosted
    WHERE hosted.store_id=p_store_id AND hosted.id=v_source_id
  );
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_reservation_group_integrity_valid_v1(p_store_id uuid,p_reservation_group_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_operation saas.promotion_operations%ROWTYPE; v_count integer; v_member jsonb;
BEGIN
  SELECT * INTO v_operation FROM saas.promotion_operations operation_row
  WHERE operation_row.store_id=p_store_id AND operation_row.operation_kind='reserve'
    AND operation_row.result_entity_kind='reservation_group' AND operation_row.result_entity_id=p_reservation_group_id;
  IF NOT FOUND OR saas.promotion_operation_result_valid('reserve',v_operation.result_payload) IS NOT TRUE
     OR v_operation.result_payload<>saas.promotion_reservation_result_v1(p_store_id,p_reservation_group_id,'reserved')
  THEN RETURN false; END IF;
  SELECT count(*) INTO v_count FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=p_reservation_group_id;
  IF v_count NOT BETWEEN 1 AND 100 OR v_count<>pg_catalog.jsonb_array_length(v_operation.result_payload->'reservations')
     OR (SELECT count(DISTINCT status) FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=p_reservation_group_id)<>1
     OR (SELECT count(DISTINCT (customer_id,source_kind,source_reference,currency,expires_at,evaluator_fingerprint,operation_id,operation_fingerprint,created_at)) FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=p_reservation_group_id)<>1
     OR EXISTS(
       SELECT 1 FROM saas.promotion_usage_reservations reservation_row
       WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=p_reservation_group_id
         AND (reservation_row.operation_id<>v_operation.operation_id
           OR reservation_row.operation_fingerprint<>v_operation.fingerprint
           OR reservation_row.operation_kind<>'reserve'
           OR reservation_row.created_at<>v_operation.created_at
           OR (reservation_row.status='reserved' AND reservation_row.updated_at<>v_operation.created_at)
           OR (reservation_row.source_kind='offline_checkout'
             AND reservation_row.expires_at<>reservation_row.created_at+pg_catalog.interval '15 minutes')
           OR (reservation_row.source_kind='hosted_checkout' AND NOT EXISTS(
             SELECT 1
             FROM saas.storefront_hosted_checkout_sessions hosted
             WHERE hosted.store_id=reservation_row.store_id
               AND hosted.id=reservation_row.source_reference::uuid
               AND COALESCE(hosted.promotion_reservation_expires_at,hosted.hold_expires_at)=reservation_row.expires_at
               AND hosted.customer_id IS NOT DISTINCT FROM reservation_row.customer_id
               AND hosted.currency IS NOT DISTINCT FROM reservation_row.currency
               AND (hosted.evaluator_authority_digest IS NULL
                 OR hosted.promotion_reservation_group_id=reservation_row.reservation_group_id)
               AND reservation_row.created_at<COALESCE(hosted.promotion_reservation_expires_at,hosted.hold_expires_at)))
           OR pg_catalog.isfinite(reservation_row.created_at) IS NOT TRUE OR pg_catalog.isfinite(reservation_row.updated_at) IS NOT TRUE
           OR pg_catalog.date_trunc('milliseconds',reservation_row.created_at)<>reservation_row.created_at
           OR pg_catalog.date_trunc('milliseconds',reservation_row.updated_at)<>reservation_row.updated_at
           OR saas.promotion_reservation_source_valid_v1(reservation_row.store_id,reservation_row.source_kind,reservation_row.source_reference) IS NOT TRUE
           OR saas.promotion_order_snapshot_valid_v1(reservation_row.evaluator_snapshot) IS NOT TRUE
           OR (reservation_row.evaluator_snapshot->>'promotionId')::uuid<>reservation_row.promotion_id
           OR (reservation_row.evaluator_snapshot->>'promotionVersion')::bigint<>reservation_row.promotion_version
           OR reservation_row.evaluator_snapshot->>'couponCode' IS DISTINCT FROM reservation_row.normalized_code
           OR reservation_row.evaluator_snapshot->>'currency' IS DISTINCT FROM reservation_row.currency
           OR (reservation_row.evaluator_snapshot->>'discountTotalMinor')::bigint<>reservation_row.discount_minor
           OR (reservation_row.evaluator_snapshot->>'evaluatedAt')::timestamptz<>reservation_row.created_at
           OR NOT EXISTS(
             SELECT 1
             FROM saas.promotion_versions version_row
             WHERE version_row.store_id=reservation_row.store_id
               AND version_row.promotion_id=reservation_row.promotion_id
               AND version_row.version=reservation_row.promotion_version
               AND reservation_row.evaluator_snapshot->'benefit'=version_row.rule_document->'benefit'
               AND reservation_row.evaluator_snapshot->'targets'=version_row.rule_document->'targets')
           OR (reservation_row.code_id IS NOT NULL AND NOT EXISTS(
             SELECT 1 FROM saas.promotion_codes code WHERE code.store_id=reservation_row.store_id AND code.promotion_id=reservation_row.promotion_id
               AND code.id=reservation_row.code_id AND code.code=reservation_row.normalized_code))))
  THEN RETURN false; END IF;
  FOR v_member IN SELECT value FROM pg_catalog.jsonb_array_elements(v_operation.result_payload->'reservations') LOOP
    IF NOT EXISTS(
      SELECT 1 FROM saas.promotion_usage_reservations reservation_row
      WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=p_reservation_group_id
        AND reservation_row.promotion_id=(v_member->>'promotionId')::uuid AND reservation_row.id=(v_member->>'reservationId')::uuid
        AND reservation_row.promotion_version=(v_member->>'promotionVersion')::bigint
        AND reservation_row.normalized_code IS NOT DISTINCT FROM v_member->>'normalizedCode'
        AND reservation_row.discount_minor=(v_member->>'discountMinor')::bigint)
    THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_reservation_result_v1(p_store_id uuid,p_reservation_group_id uuid,p_status text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE WHEN p_status NOT IN ('reserved','released','expired') OR count(*) NOT BETWEEN 1 AND 100 THEN NULL ELSE pg_catalog.jsonb_build_object(
    'schemaVersion',1,'reservationGroupId',p_reservation_group_id,'status',p_status,
    'currency',min(currency),'discountTotalMinor',sum(discount_minor)::bigint,
    'expiresAt',pg_catalog.to_char(min(expires_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'evaluatorFingerprint',min(evaluator_fingerprint),
    'reservations',pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'promotionId',promotion_id,'reservationId',id,'promotionVersion',promotion_version,
      'normalizedCode',normalized_code,'discountMinor',discount_minor) ORDER BY promotion_id,id)) END
  FROM saas.promotion_usage_reservations
  WHERE store_id=p_store_id AND reservation_group_id=p_reservation_group_id
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_settlement_operation_result_matches_v1(p_store_id uuid,p_operation_id uuid,p_kind text,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_operation saas.promotion_operations%ROWTYPE; v_transition saas.promotion_operations%ROWTYPE; v_group_id uuid; v_expected_status text; v_expected_fingerprint text; v_members jsonb; v_current_status text;
BEGIN
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF NOT FOUND OR v_operation.operation_kind<>p_kind OR v_operation.result_payload<>p_result
     OR saas.promotion_operation_result_valid(p_kind,p_result) IS NOT TRUE THEN RETURN false; END IF;
  IF p_kind IN ('reserve','release','expire') THEN
    v_group_id:=(p_result->>'reservationGroupId')::uuid;
    IF v_operation.result_entity_kind<>'reservation_group' OR v_operation.result_entity_id<>v_group_id
       OR saas.promotion_reservation_group_integrity_valid_v1(p_store_id,v_group_id) IS NOT TRUE THEN RETURN false; END IF;
    v_expected_status:=CASE p_kind WHEN 'reserve' THEN 'reserved' WHEN 'release' THEN 'released' ELSE 'expired' END;
    IF p_result<>saas.promotion_reservation_result_v1(p_store_id,v_group_id,v_expected_status) THEN RETURN false; END IF;
    IF p_kind<>'reserve' AND EXISTS(SELECT 1 FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=v_group_id AND status<>v_expected_status) THEN RETURN false; END IF;
    RETURN true;
  END IF;
  RETURN false;
EXCEPTION WHEN others THEN RETURN false;
END $fn$;
SET LOCAL check_function_bodies = on;

CREATE OR REPLACE FUNCTION saas.promotion_reserve_group_v1(p_store_id uuid,p_operation_id uuid,p_fingerprint text,p_source_kind text,p_source_reference text,p_evaluator_context jsonb,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_operation saas.promotion_operations%ROWTYPE; v_store saas.stores%ROWTYPE; v_subscription saas.subscriptions%ROWTYPE; v_plan saas.plans%ROWTYPE;
  v_expected_fingerprint text; v_evaluation jsonb; v_recheck jsonb; v_materialized_lines jsonb; v_snapshot_context jsonb;
  v_evaluator_fingerprint text; v_result jsonb; v_members jsonb:='[]'::jsonb; v_rows jsonb:='[]'::jsonb;
  v_applied jsonb; v_row jsonb; v_snapshot jsonb; v_code_id uuid; v_code_batch_id uuid; v_reservation_id uuid;
  v_reservation_group_id uuid:=saas.storefront_commerce_uuid('promotion-reservation-group-v1:'||p_store_id::text||':'||p_operation_id::text); p_expires_at timestamptz; v_plan_id uuid; v_customer_id uuid;
  v_applied_count integer; v_locked_count integer; v_source_id uuid; v_hosted_expires_at timestamptz; v_hosted_customer_id uuid; v_hosted_currency text; v_hosted_reservation_group_id uuid;
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_source_kind IS NULL OR p_source_kind NOT IN ('hosted_checkout','offline_checkout') OR p_source_reference IS NULL OR p_source_reference<>pg_catalog.btrim(p_source_reference)
     OR pg_catalog.length(p_source_reference) NOT BETWEEN 1 AND 200 OR pg_catalog.octet_length(p_source_reference)>800 OR p_source_reference~'[[:cntrl:]]'
     OR p_evaluator_context IS NULL OR pg_catalog.jsonb_typeof(p_evaluator_context)<>'object' OR pg_catalog.pg_column_size(p_evaluator_context)>262144
     OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_expected_fingerprint:=saas.promotion_operation_fingerprint_v2('reserve',p_store_id,pg_catalog.jsonb_build_object('sourceKind',p_source_kind,'sourceReference',p_source_reference,'evaluatorContext',p_evaluator_context));
  IF p_fingerprint IS DISTINCT FROM v_expected_fingerprint THEN RETURN QUERY SELECT 'idempotency_mismatch',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-operation:'||p_store_id::text||':'||p_operation_id::text,0));
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR SHARE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'reserve' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'idempotency_mismatch',NULL::jsonb; RETURN; END IF;
    IF saas.promotion_settlement_operation_result_matches_v1(p_store_id,p_operation_id,'reserve',v_operation.result_payload) IS NOT TRUE THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb; RETURN; END IF;
    RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; RETURN;
  END IF;

  SELECT * INTO v_store FROM saas.stores store_row WHERE store_row.id=p_store_id FOR SHARE;
  IF NOT FOUND OR v_store.status<>'active' THEN RETURN QUERY SELECT 'feature_unavailable',NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_subscription FROM saas.subscriptions subscription_row
  WHERE subscription_row.store_id=p_store_id AND subscription_row.status='active' AND subscription_row.valid_from<=p_now
    AND (subscription_row.valid_until IS NULL OR p_now<subscription_row.valid_until) FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'feature_unavailable',NULL::jsonb; RETURN; END IF;
  v_plan_id:=v_subscription.plan_id;
  SELECT * INTO v_plan FROM saas.plans plan_row WHERE plan_row.id=v_plan_id FOR SHARE;
  IF NOT FOUND OR v_plan.plan_code<>v_subscription.plan_code OR v_plan.version<>v_subscription.plan_version OR v_plan.status<>'active'
     OR v_plan.valid_from>p_now OR (v_plan.valid_until IS NOT NULL AND p_now>=v_plan.valid_until) THEN RETURN QUERY SELECT 'feature_unavailable',NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.plan_features feature WHERE feature.plan_id=v_plan_id AND feature.feature_key='promotions' AND feature.enabled FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'feature_unavailable',NULL::jsonb; RETURN; END IF;
  IF saas.promotion_evaluator_context_valid(p_store_id,p_evaluator_context) IS NOT TRUE THEN RETURN QUERY SELECT 'promotion_context_unavailable',NULL::jsonb; RETURN; END IF;

  BEGIN
    v_source_id:=p_source_reference::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN QUERY SELECT 'promotion_context_unavailable',NULL::jsonb; RETURN;
  END;
  IF p_source_reference<>v_source_id::text THEN RETURN QUERY SELECT 'promotion_context_unavailable',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-source:'||p_store_id::text||':'||p_source_kind||':'||p_source_reference,0));
  IF p_source_kind='hosted_checkout' THEN
    SELECT COALESCE(hosted.promotion_reservation_expires_at,hosted.hold_expires_at),hosted.customer_id,hosted.currency,hosted.promotion_reservation_group_id
    INTO v_hosted_expires_at,v_hosted_customer_id,v_hosted_currency,v_hosted_reservation_group_id
    FROM saas.storefront_hosted_checkout_sessions hosted
    WHERE hosted.store_id=p_store_id AND hosted.id=v_source_id
      AND hosted.status IN ('active','provider_ready','processing')
      AND hosted.terminal_at IS NULL
    FOR SHARE OF hosted;
    IF NOT FOUND OR v_hosted_expires_at<=p_now
       OR pg_catalog.date_trunc('milliseconds',v_hosted_expires_at)<>v_hosted_expires_at
       OR (CASE WHEN p_evaluator_context->'customerId'='null'::jsonb THEN NULL ELSE (p_evaluator_context->>'customerId')::uuid END) IS DISTINCT FROM v_hosted_customer_id
       OR p_evaluator_context->>'currency' IS DISTINCT FROM v_hosted_currency
       OR (v_hosted_reservation_group_id IS NOT NULL
         AND v_hosted_reservation_group_id IS DISTINCT FROM v_reservation_group_id)
    THEN RETURN QUERY SELECT 'promotion_context_unavailable',NULL::jsonb; RETURN; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.promotion_usage_reservations reservation_row WHERE reservation_row.store_id=p_store_id AND reservation_row.source_kind=p_source_kind AND reservation_row.source_reference=p_source_reference) THEN RETURN QUERY SELECT 'source_conflict',NULL::jsonb; RETURN; END IF;

  v_materialized_lines:=saas.promotion_evaluator_materialize_lines(p_store_id,p_evaluator_context->>'currency',p_evaluator_context,p_now);
  IF pg_catalog.jsonb_array_length(v_materialized_lines)<>pg_catalog.jsonb_array_length(p_evaluator_context->'cartLines') THEN RETURN QUERY SELECT 'promotion_context_unavailable',NULL::jsonb; RETURN; END IF;
  v_evaluation:=saas.promotion_evaluate_internal_v1(p_store_id,p_evaluator_context,p_now,NULL,v_materialized_lines);
  v_applied_count:=pg_catalog.jsonb_array_length(v_evaluation->'appliedPromotions');
  IF v_evaluation->>'merchantExplanation'<>'evaluated' OR v_applied_count NOT BETWEEN 1 AND 100 THEN RETURN QUERY SELECT 'conditions_not_met',NULL::jsonb; RETURN; END IF;
  SELECT count(*) INTO v_locked_count FROM (
    SELECT promotion.id FROM saas.promotions promotion
    JOIN pg_catalog.jsonb_array_elements(v_evaluation->'appliedPromotions') applied ON applied->>'promotionId'=promotion.id::text
    WHERE promotion.store_id=p_store_id ORDER BY promotion.id FOR UPDATE OF promotion
  ) locked;
  IF v_locked_count<>v_applied_count THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code:'||p_store_id::text,0));
  PERFORM batch.id FROM saas.promotion_code_batches batch
  JOIN saas.promotion_codes code ON code.store_id=batch.store_id AND code.batch_id=batch.id
  JOIN pg_catalog.jsonb_array_elements(v_evaluation->'appliedPromotions') applied ON applied ? 'normalizedCode' AND applied->>'promotionId'=code.promotion_id::text AND applied->>'normalizedCode'=code.code
  WHERE batch.store_id=p_store_id ORDER BY batch.id FOR UPDATE OF batch;
  PERFORM code.id FROM saas.promotion_codes code
  JOIN pg_catalog.jsonb_array_elements(v_evaluation->'appliedPromotions') applied ON applied ? 'normalizedCode' AND applied->>'promotionId'=code.promotion_id::text AND applied->>'normalizedCode'=code.code
  WHERE code.store_id=p_store_id ORDER BY code.id FOR UPDATE OF code;
  v_customer_id:=CASE WHEN p_evaluator_context->'customerId'='null'::jsonb THEN NULL ELSE (p_evaluator_context->>'customerId')::uuid END;
  IF v_customer_id IS NOT NULL THEN PERFORM 1 FROM saas.customers customer WHERE customer.store_id=p_store_id AND customer.id=v_customer_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'promotion_context_unavailable',NULL::jsonb; RETURN; END IF; END IF;
  v_recheck:=saas.promotion_evaluate_internal_v1(p_store_id,p_evaluator_context,p_now,NULL,v_materialized_lines);
  IF v_recheck IS DISTINCT FROM v_evaluation THEN RETURN QUERY SELECT 'conditions_not_met',NULL::jsonb; RETURN; END IF;

  v_snapshot_context:=pg_catalog.jsonb_set(p_evaluator_context,'{cartLines}',v_materialized_lines,false);
  v_evaluator_fingerprint:=saas.promotion_operation_fingerprint_v2('reserve',p_store_id,pg_catalog.jsonb_build_object('sourceKind',p_source_kind,'sourceReference',p_source_reference,'evaluatorContext',p_evaluator_context,'materializedLines',v_materialized_lines,'evaluation',v_evaluation));
  IF v_evaluator_fingerprint IS NULL THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  p_expires_at:=CASE WHEN p_source_kind='hosted_checkout' THEN v_hosted_expires_at ELSE p_now+pg_catalog.interval '15 minutes' END;
  FOR v_applied IN SELECT value FROM pg_catalog.jsonb_array_elements(v_evaluation->'appliedPromotions') ORDER BY value->>'promotionId' LOOP
    v_code_id:=NULL; v_code_batch_id:=NULL;
    IF v_applied ? 'normalizedCode' THEN
      SELECT code.id,code.batch_id INTO v_code_id,v_code_batch_id FROM saas.promotion_codes code
      WHERE code.store_id=p_store_id AND code.promotion_id=(v_applied->>'promotionId')::uuid AND code.code=v_applied->>'normalizedCode';
      IF NOT FOUND THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
    END IF;
    v_reservation_id:=pg_catalog.gen_random_uuid();
    v_snapshot:=saas.promotion_order_snapshot_build_v1(p_store_id,v_snapshot_context,v_evaluation,(v_applied->>'promotionId')::uuid,p_now);
    IF v_snapshot IS NULL OR pg_catalog.pg_column_size(v_snapshot)>262144 THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
    v_members:=v_members||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_applied->>'promotionId','reservationId',v_reservation_id,'promotionVersion',(v_applied->>'version')::bigint,'normalizedCode',CASE WHEN v_applied ? 'normalizedCode' THEN pg_catalog.to_jsonb(v_applied->>'normalizedCode') ELSE 'null'::jsonb END,'discountMinor',(v_applied->>'discountTotalMinor')::bigint));
    v_rows:=v_rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_applied->>'promotionId','reservationId',v_reservation_id,'promotionVersion',(v_applied->>'version')::bigint,'codeId',v_code_id,'normalizedCode',CASE WHEN v_applied ? 'normalizedCode' THEN pg_catalog.to_jsonb(v_applied->>'normalizedCode') ELSE 'null'::jsonb END,'discountMinor',(v_applied->>'discountTotalMinor')::bigint,'snapshot',v_snapshot));
  END LOOP;
  v_result:=pg_catalog.jsonb_build_object('schemaVersion',1,'reservationGroupId',v_reservation_group_id,'status','reserved','currency',v_evaluation->>'currency','discountTotalMinor',(v_evaluation->>'discountTotalMinor')::bigint,'expiresAt',pg_catalog.to_char(p_expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'evaluatorFingerprint',v_evaluator_fingerprint,'reservations',v_members);
  IF saas.promotion_operation_result_valid('reserve',v_result) IS NOT TRUE THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at)
  VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_operation_id,'reserve',p_fingerprint,'reservation_group',v_reservation_group_id,v_result,p_now);
  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(v_rows) LOOP
    INSERT INTO saas.promotion_usage_reservations(id,store_id,promotion_id,promotion_version,code_id,normalized_code,reservation_group_id,customer_id,operation_id,operation_fingerprint,source_kind,source_reference,reserved_uses,reserved_budget_minor,discount_minor,currency,evaluator_snapshot,evaluator_fingerprint,status,expires_at,created_at,updated_at)
    VALUES((v_row->>'reservationId')::uuid,p_store_id,(v_row->>'promotionId')::uuid,(v_row->>'promotionVersion')::bigint,CASE WHEN v_row->'codeId'='null'::jsonb THEN NULL ELSE (v_row->>'codeId')::uuid END,v_row->>'normalizedCode',v_reservation_group_id,v_customer_id,p_operation_id,p_fingerprint,p_source_kind,p_source_reference,1,(v_row->>'discountMinor')::bigint,(v_row->>'discountMinor')::bigint,v_evaluation->>'currency',v_row->'snapshot',v_evaluator_fingerprint,'reserved',p_expires_at,p_now,p_now);
  END LOOP;
  RETURN QUERY SELECT 'reserved',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_release_reservation_group_v1(p_store_id uuid,p_operation_id uuid,p_fingerprint text,p_reservation_group_id uuid,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_operation saas.promotion_operations%ROWTYPE; v_reserve_operation saas.promotion_operations%ROWTYPE; v_expected text; v_result jsonb; v_status text; v_max_updated timestamptz;
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL OR p_reservation_group_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_expected:=saas.promotion_operation_fingerprint_v2('release',p_store_id,pg_catalog.jsonb_build_object('reservationGroupId',p_reservation_group_id));
  IF p_fingerprint<>v_expected THEN RETURN QUERY SELECT 'idempotency_mismatch',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-operation:'||p_store_id::text||':'||p_operation_id::text,0));
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR SHARE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'release' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'idempotency_mismatch',NULL::jsonb; RETURN; END IF;
    IF saas.promotion_settlement_operation_result_matches_v1(p_store_id,p_operation_id,'release',v_operation.result_payload) IS NOT TRUE THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb; RETURN; END IF;
    RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; RETURN;
  END IF;
  SELECT * INTO v_reserve_operation FROM saas.promotion_operations operation_row WHERE operation_row.store_id=p_store_id AND operation_row.operation_kind='reserve' AND operation_row.result_entity_kind='reservation_group' AND operation_row.result_entity_id=p_reservation_group_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  PERFORM reservation_row.id FROM saas.promotion_usage_reservations reservation_row WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=p_reservation_group_id ORDER BY reservation_row.promotion_id,reservation_row.id FOR UPDATE;
  IF saas.promotion_reservation_group_integrity_valid_v1(p_store_id,p_reservation_group_id) IS NOT TRUE THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  SELECT min(status),max(updated_at) INTO v_status,v_max_updated FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=p_reservation_group_id;
  IF v_status<>'reserved' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF p_now<v_max_updated THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_result:=saas.promotion_reservation_result_v1(p_store_id,p_reservation_group_id,'released');
  IF saas.promotion_operation_result_valid('release',v_result) IS NOT TRUE THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at)
  VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_operation_id,'release',p_fingerprint,'reservation_group',p_reservation_group_id,v_result,p_now);
  UPDATE saas.promotion_usage_reservations SET status='released',updated_at=p_now WHERE store_id=p_store_id AND reservation_group_id=p_reservation_group_id;
  RETURN QUERY SELECT 'released',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_commit_result_v1(p_store_id uuid,p_redemption_group_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT CASE WHEN count(*) NOT BETWEEN 1 AND 100 THEN NULL ELSE pg_catalog.jsonb_build_object(
    'schemaVersion',1,'reservationGroupId',max(reservation_group_id::text)::uuid,'redemptionGroupId',p_redemption_group_id,
    'status','committed','orderId',max(order_id::text)::uuid,'currency',min(currency),'discountTotalMinor',sum(discount_minor)::bigint,
    'evaluatorFingerprint',min(evaluator_fingerprint),
    'redemptions',pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'promotionId',promotion_id,'reservationId',reservation_id,'redemptionId',id,'promotionVersion',promotion_version,
      'normalizedCode',normalized_code,'discountMinor',discount_minor) ORDER BY promotion_id,id)) END
  FROM saas.promotion_redemptions WHERE store_id=p_store_id AND redemption_group_id=p_redemption_group_id
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_reservation_source_order_valid_v1(
  p_store_id uuid,p_source_kind text,p_source_reference text,p_order_id uuid
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_source_id uuid;
BEGIN
  IF p_store_id IS NULL OR p_order_id IS NULL OR p_source_reference IS NULL
     OR p_source_reference<>pg_catalog.btrim(p_source_reference)
  THEN RETURN false; END IF;
  IF p_source_kind='offline_checkout' THEN
    RETURN p_source_reference=p_order_id::text;
  ELSIF p_source_kind='hosted_checkout' THEN
    v_source_id:=p_source_reference::uuid;
    IF p_source_reference<>v_source_id::text THEN RETURN false; END IF;
    RETURN EXISTS(
      SELECT 1
      FROM saas.storefront_hosted_checkout_sessions hosted
      JOIN saas.orders order_row ON order_row.store_id=hosted.store_id AND order_row.id=hosted.order_id
      WHERE hosted.store_id=p_store_id AND hosted.id=v_source_id AND hosted.order_id=p_order_id
        AND order_row.customer_id IS NOT DISTINCT FROM hosted.customer_id
        AND order_row.currency IS NOT DISTINCT FROM hosted.currency
    );
  END IF;
  RETURN false;
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $fn$;

SET LOCAL check_function_bodies = off;
CREATE OR REPLACE FUNCTION saas.promotion_captured_unit_refund_minor_v1(
  p_store_id uuid,p_order_id uuid,p_line_id uuid,p_previously_returned_ranges jsonb,p_returned_ranges jsonb,
  p_already_refunded_minor bigint,p_requested_cash_refund_minor bigint
)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_line saas.order_items%ROWTYPE; v_range jsonb; v_previous_end bigint:=0; v_returned_end bigint:=0;
  v_start bigint; v_quantity bigint; v_previous_entitlement numeric:=0; v_returned_entitlement numeric:=0;
  v_previous_gross numeric:=0; v_returned_gross numeric:=0; v_previous_discount numeric:=0; v_returned_discount numeric:=0;
  v_snapshot_count integer; v_captured_range_count integer;
BEGIN
  IF p_store_id IS NULL OR p_order_id IS NULL OR p_line_id IS NULL
     OR p_already_refunded_minor IS NULL OR p_already_refunded_minor NOT BETWEEN 0 AND 8000000000
     OR p_requested_cash_refund_minor IS NULL OR p_requested_cash_refund_minor NOT BETWEEN 0 AND 8000000000
     OR p_previously_returned_ranges IS NULL OR pg_catalog.jsonb_typeof(p_previously_returned_ranges)<>'array'
     OR p_returned_ranges IS NULL OR pg_catalog.jsonb_typeof(p_returned_ranges)<>'array'
     OR pg_catalog.jsonb_array_length(p_previously_returned_ranges)>2000
     OR pg_catalog.jsonb_array_length(p_returned_ranges) NOT BETWEEN 1 AND 2000
     OR pg_catalog.pg_column_size(p_previously_returned_ranges)>131072
     OR pg_catalog.pg_column_size(p_returned_ranges)>131072
  THEN RETURN NULL; END IF;
  SELECT * INTO v_line FROM saas.order_items item
  WHERE item.store_id=p_store_id AND item.order_id=p_order_id AND item.id=p_line_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  FOR v_range IN SELECT value FROM pg_catalog.jsonb_array_elements(p_previously_returned_ranges) LOOP
    IF saas.promotion_json_keys(v_range,ARRAY['startOrdinal','quantity'],ARRAY['startOrdinal','quantity']) IS NOT TRUE
       OR saas.promotion_json_integer(v_range->'startOrdinal',0,999999) IS NOT TRUE
       OR saas.promotion_json_integer(v_range->'quantity',1,1000000) IS NOT TRUE
    THEN RETURN NULL; END IF;
    v_start:=(v_range->>'startOrdinal')::bigint; v_quantity:=(v_range->>'quantity')::bigint;
    IF v_start<v_previous_end OR v_start+v_quantity>v_line.quantity THEN RETURN NULL; END IF;
    v_previous_end:=v_start+v_quantity; v_previous_gross:=v_previous_gross+v_quantity::numeric*v_line.unit_price_cents::numeric;
  END LOOP;
  FOR v_range IN SELECT value FROM pg_catalog.jsonb_array_elements(p_returned_ranges) LOOP
    IF saas.promotion_json_keys(v_range,ARRAY['startOrdinal','quantity'],ARRAY['startOrdinal','quantity']) IS NOT TRUE
       OR saas.promotion_json_integer(v_range->'startOrdinal',0,999999) IS NOT TRUE
       OR saas.promotion_json_integer(v_range->'quantity',1,1000000) IS NOT TRUE
    THEN RETURN NULL; END IF;
    v_start:=(v_range->>'startOrdinal')::bigint; v_quantity:=(v_range->>'quantity')::bigint;
    IF v_start<v_returned_end OR v_start+v_quantity>v_line.quantity THEN RETURN NULL; END IF;
    v_returned_end:=v_start+v_quantity; v_returned_gross:=v_returned_gross+v_quantity::numeric*v_line.unit_price_cents::numeric;
  END LOOP;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_previously_returned_ranges) previous_row
    CROSS JOIN pg_catalog.jsonb_array_elements(p_returned_ranges) returned_row
    WHERE GREATEST((previous_row->>'startOrdinal')::bigint,(returned_row->>'startOrdinal')::bigint)
      < LEAST((previous_row->>'startOrdinal')::bigint+(previous_row->>'quantity')::bigint,
                         (returned_row->>'startOrdinal')::bigint+(returned_row->>'quantity')::bigint)
  ) THEN RETURN NULL; END IF;

  SELECT count(DISTINCT snapshot.id),count(captured_range) INTO v_snapshot_count,v_captured_range_count
  FROM saas.order_promotion_snapshots snapshot
  JOIN saas.promotion_redemptions redemption
    ON redemption.store_id=snapshot.store_id AND redemption.id=snapshot.redemption_id AND redemption.order_id=snapshot.order_id
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(snapshot.snapshot->'discountLines') frozen_line
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(frozen_line->'capturedRanges') captured_range
  WHERE snapshot.store_id=p_store_id AND snapshot.order_id=p_order_id AND frozen_line->>'lineId'=p_line_id::text;
  IF v_snapshot_count NOT BETWEEN 1 AND 100 OR v_captured_range_count NOT BETWEEN 1 AND 6400 OR EXISTS(
    SELECT 1 FROM saas.promotion_redemptions redemption
    WHERE redemption.store_id=p_store_id AND redemption.order_id=p_order_id
      AND EXISTS(SELECT 1 FROM saas.order_promotion_snapshots snapshot CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(snapshot.snapshot->'discountLines') frozen_line
        WHERE snapshot.store_id=redemption.store_id AND snapshot.redemption_id=redemption.id AND frozen_line->>'lineId'=p_line_id::text)
      AND saas.promotion_commit_integrity_valid_v1(p_store_id,redemption.redemption_group_id) IS NOT TRUE
  ) THEN RETURN NULL; END IF;

  IF EXISTS(
    WITH captured AS (
      SELECT (captured_range->>'startOrdinal')::bigint AS start_ordinal,
        (captured_range->>'startOrdinal')::bigint+(captured_range->>'quantity')::bigint AS end_ordinal,
        (captured_range->>'discountUnitMinor')::numeric AS discount_unit_minor
      FROM saas.order_promotion_snapshots snapshot
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(snapshot.snapshot->'discountLines') frozen_line
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(frozen_line->'capturedRanges') captured_range
      WHERE snapshot.store_id=p_store_id AND snapshot.order_id=p_order_id AND snapshot.redemption_id IS NOT NULL
        AND frozen_line->>'lineId'=p_line_id::text
    ), boundaries AS (
      SELECT 0::bigint AS ordinal UNION SELECT v_line.quantity::bigint
      UNION SELECT start_ordinal FROM captured UNION SELECT end_ordinal FROM captured
    ), spans AS (
      SELECT ordinal,pg_catalog.lead(ordinal) OVER(ORDER BY ordinal) AS end_ordinal FROM boundaries
    )
    SELECT 1 FROM spans
    WHERE end_ordinal>ordinal AND (SELECT COALESCE(sum(discount_unit_minor),0) FROM captured WHERE start_ordinal<=spans.ordinal AND captured.end_ordinal>=spans.end_ordinal)>v_line.unit_price_cents
  ) THEN RETURN NULL; END IF;

  SELECT COALESCE(sum(
    GREATEST(0,LEAST((selection->>'startOrdinal')::bigint+(selection->>'quantity')::bigint,
      (captured_range->>'startOrdinal')::bigint+(captured_range->>'quantity')::bigint)
      -GREATEST((selection->>'startOrdinal')::bigint,(captured_range->>'startOrdinal')::bigint))::numeric
      *(captured_range->>'discountUnitMinor')::numeric),0)
  INTO v_previous_discount
  FROM pg_catalog.jsonb_array_elements(p_previously_returned_ranges) selection
  CROSS JOIN saas.order_promotion_snapshots snapshot
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(snapshot.snapshot->'discountLines') frozen_line
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(frozen_line->'capturedRanges') captured_range
  WHERE snapshot.store_id=p_store_id AND snapshot.order_id=p_order_id AND snapshot.redemption_id IS NOT NULL
    AND frozen_line->>'lineId'=p_line_id::text;
  SELECT COALESCE(sum(
    GREATEST(0,LEAST((selection->>'startOrdinal')::bigint+(selection->>'quantity')::bigint,
      (captured_range->>'startOrdinal')::bigint+(captured_range->>'quantity')::bigint)
      -GREATEST((selection->>'startOrdinal')::bigint,(captured_range->>'startOrdinal')::bigint))::numeric
      *(captured_range->>'discountUnitMinor')::numeric),0)
  INTO v_returned_discount
  FROM pg_catalog.jsonb_array_elements(p_returned_ranges) selection
  CROSS JOIN saas.order_promotion_snapshots snapshot
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(snapshot.snapshot->'discountLines') frozen_line
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(frozen_line->'capturedRanges') captured_range
  WHERE snapshot.store_id=p_store_id AND snapshot.order_id=p_order_id AND snapshot.redemption_id IS NOT NULL
    AND frozen_line->>'lineId'=p_line_id::text;
  v_previous_entitlement:=v_previous_gross-v_previous_discount;
  v_returned_entitlement:=v_returned_gross-v_returned_discount;
  IF v_previous_entitlement<0 OR v_returned_entitlement<0
     OR p_already_refunded_minor>v_previous_entitlement OR p_already_refunded_minor>v_line.line_total_cents
  THEN RETURN NULL; END IF;
  RETURN LEAST(p_requested_cash_refund_minor::numeric,v_returned_entitlement,
    v_line.line_total_cents::numeric-p_already_refunded_minor::numeric)::bigint;
EXCEPTION WHEN others THEN RETURN NULL;
END $fn$;
SET LOCAL check_function_bodies = on;

CREATE OR REPLACE FUNCTION saas.promotion_order_snapshot_insert_binding_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_binding record;
BEGIN
  SELECT redemption.order_id,redemption.promotion_id,redemption.promotion_version,redemption.normalized_code,
    redemption.currency,redemption.discount_minor,redemption.evaluator_fingerprint,redemption.created_at,
    reservation.evaluator_snapshot
  INTO v_binding
  FROM saas.promotion_redemptions redemption
  JOIN saas.promotion_usage_reservations reservation
    ON reservation.store_id=redemption.store_id AND reservation.id=redemption.reservation_id
      AND reservation.reservation_group_id=redemption.reservation_group_id
      AND reservation.promotion_id=redemption.promotion_id
  WHERE redemption.store_id=NEW.store_id AND redemption.id=NEW.redemption_id
  FOR SHARE OF redemption,reservation;
  IF NOT FOUND OR saas.promotion_order_snapshot_valid_v1(NEW.snapshot) IS NOT TRUE
     OR NEW.order_id<>v_binding.order_id OR NEW.promotion_id<>v_binding.promotion_id
     OR NEW.promotion_version<>v_binding.promotion_version OR NEW.normalized_code IS DISTINCT FROM v_binding.normalized_code
     OR NEW.currency<>v_binding.currency OR NEW.discount_minor<>v_binding.discount_minor
     OR NEW.evaluator_fingerprint<>v_binding.evaluator_fingerprint OR NEW.created_at<>v_binding.created_at
     OR NEW.snapshot<>v_binding.evaluator_snapshot
     OR (NEW.snapshot->>'promotionId')::uuid<>NEW.promotion_id OR (NEW.snapshot->>'promotionVersion')::bigint<>NEW.promotion_version
     OR NEW.snapshot->>'couponCode' IS DISTINCT FROM NEW.normalized_code OR NEW.snapshot->>'currency' IS DISTINCT FROM NEW.currency
     OR (NEW.snapshot->>'discountTotalMinor')::bigint<>NEW.discount_minor
  THEN RAISE EXCEPTION 'promotion order snapshot binding invalid'; END IF;
  RETURN NEW;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'promotion order snapshot binding invalid';
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_order_allocation_insert_binding_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_snapshot saas.order_promotion_snapshots%ROWTYPE; v_line saas.order_items%ROWTYPE; v_snapshot_line jsonb;
BEGIN
  SELECT * INTO v_snapshot FROM saas.order_promotion_snapshots WHERE store_id=NEW.store_id AND order_id=NEW.order_id AND id=NEW.snapshot_id FOR SHARE;
  IF NOT FOUND OR v_snapshot.redemption_id IS NULL OR NEW.line_id IS NULL THEN RAISE EXCEPTION 'promotion order allocation binding invalid'; END IF;
  SELECT * INTO v_line FROM saas.order_items WHERE store_id=NEW.store_id AND order_id=NEW.order_id AND id=NEW.line_id FOR SHARE;
  SELECT value INTO v_snapshot_line FROM pg_catalog.jsonb_array_elements(v_snapshot.snapshot->'discountLines') WHERE value->>'lineId'=NEW.line_id::text;
  IF NOT FOUND OR NEW.line_position<>v_line.position OR (v_snapshot_line->>'position')::integer<>NEW.line_position
     OR (v_snapshot_line->>'discountMinor')::bigint<>NEW.discount_minor OR NEW.created_at<>v_snapshot.created_at
  THEN RAISE EXCEPTION 'promotion order allocation binding invalid'; END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_auto_gift_order_lines_valid_v1(
  p_store_id uuid,p_order_id uuid,p_reservation_group_id uuid
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_required_lines bigint; v_total_lines bigint; v_min_position integer; v_max_position integer;
BEGIN
  IF p_store_id IS NULL OR p_order_id IS NULL OR p_reservation_group_id IS NULL THEN RETURN false; END IF;
  WITH required_gifts AS (
    SELECT (gift->>'variantId')::uuid variant_id,pg_catalog.sum((gift->>'quantity')::bigint)::bigint required_quantity
    FROM saas.promotion_usage_reservations reservation_row
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(reservation_row.evaluator_snapshot->'giftLines') gift
    WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=p_reservation_group_id
      AND (gift->>'autoAdd')::boolean
    GROUP BY (gift->>'variantId')::uuid
  )
  SELECT COALESCE(pg_catalog.sum((required_quantity+9998)/9999),0)::bigint INTO v_required_lines FROM required_gifts;
  IF v_required_lines=0 THEN RETURN true; END IF;
  SELECT count(*)::bigint,min(position),max(position) INTO v_total_lines,v_min_position,v_max_position
  FROM saas.order_items WHERE store_id=p_store_id AND order_id=p_order_id;
  IF v_total_lines<v_required_lines OR v_min_position<>0 OR v_max_position::bigint<>v_total_lines-1 THEN RETURN false; END IF;
  RETURN NOT EXISTS(
    WITH required_gifts AS (
      SELECT (gift->>'variantId')::uuid variant_id,pg_catalog.sum((gift->>'quantity')::bigint)::bigint required_quantity
      FROM saas.promotion_usage_reservations reservation_row
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(reservation_row.evaluator_snapshot->'giftLines') gift
      WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=p_reservation_group_id
        AND (gift->>'autoAdd')::boolean
      GROUP BY (gift->>'variantId')::uuid
    ), expected_chunks AS (
      SELECT required.variant_id,chunk.ordinality,
        LEAST(9999,required.required_quantity-chunk.ordinality*9999)::integer expected_quantity,
        pg_catalog.row_number() OVER(ORDER BY required.variant_id,chunk.ordinality)-1 gift_offset
      FROM required_gifts required
      CROSS JOIN LATERAL pg_catalog.generate_series(0::bigint,(required.required_quantity+9998)/9999-1) chunk(ordinality)
    ), expected_lines AS (
      SELECT expected.variant_id,expected.expected_quantity,
        (v_total_lines-v_required_lines+expected.gift_offset)::integer expected_position
      FROM expected_chunks expected
    )
    SELECT 1 FROM expected_lines expected
    LEFT JOIN saas.order_items item
      ON item.store_id=p_store_id AND item.order_id=p_order_id AND item.position=expected.expected_position
    WHERE item.id IS NULL
      OR item.variant_id IS DISTINCT FROM expected.variant_id
      OR item.quantity IS DISTINCT FROM expected.expected_quantity
      OR item.unit_price_cents<>0 OR item.discount_cents<>0 OR item.line_total_cents<>0
  );
EXCEPTION WHEN others THEN RETURN false;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_commit_integrity_valid_v1(p_store_id uuid,p_redemption_group_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_operation saas.promotion_operations%ROWTYPE; v_result jsonb; v_order saas.orders%ROWTYPE; v_group_id uuid; v_count integer;
  v_source_kind text; v_source_reference text; v_max_reservation_updated timestamptz; v_group_expires timestamptz;
BEGIN
  SELECT * INTO v_operation FROM saas.promotion_operations operation_row WHERE operation_row.store_id=p_store_id AND operation_row.operation_kind='commit' AND operation_row.result_entity_kind='redemption_group' AND operation_row.result_entity_id=p_redemption_group_id;
  IF NOT FOUND OR saas.promotion_operation_result_valid('commit',v_operation.result_payload) IS NOT TRUE THEN RETURN false; END IF;
  v_result:=saas.promotion_commit_result_v1(p_store_id,p_redemption_group_id);
  IF v_result IS NULL OR v_result<>v_operation.result_payload THEN RETURN false; END IF;
  v_group_id:=(v_result->>'reservationGroupId')::uuid;
  IF saas.promotion_reservation_group_integrity_valid_v1(p_store_id,v_group_id) IS NOT TRUE
     OR EXISTS(SELECT 1 FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=v_group_id AND status<>'committed')
  THEN RETURN false; END IF;
  SELECT min(source_kind),min(source_reference),max(updated_at),min(expires_at)
  INTO v_source_kind,v_source_reference,v_max_reservation_updated,v_group_expires
  FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=v_group_id;
  SELECT * INTO v_order FROM saas.orders WHERE store_id=p_store_id AND id=(v_result->>'orderId')::uuid;
  IF NOT FOUND OR v_order.currency<>v_result->>'currency' OR v_order.discount_cents<>(v_result->>'discountTotalMinor')::bigint
     OR v_order.subtotal_cents<>(SELECT COALESCE(sum(item.unit_price_cents::numeric*item.quantity::numeric),0)::bigint FROM saas.order_items item WHERE item.store_id=p_store_id AND item.order_id=v_order.id)
     OR EXISTS(
       SELECT 1
       FROM saas.order_promotion_snapshots snapshot
       WHERE snapshot.store_id=p_store_id
         AND snapshot.redemption_id IN (SELECT id FROM saas.promotion_redemptions WHERE store_id=p_store_id AND redemption_group_id=p_redemption_group_id)
       HAVING COALESCE(sum((snapshot.snapshot->>'shippingDiscountMinor')::bigint),0)>0
          AND COALESCE(sum((snapshot.snapshot->>'shippingDiscountMinor')::bigint),0) IS DISTINCT FROM v_order.shipping_cents)
     OR v_order.customer_id IS DISTINCT FROM (SELECT max(customer_id::text)::uuid FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=v_group_id)
     OR saas.promotion_reservation_source_order_valid_v1(p_store_id,v_source_kind,v_source_reference,v_order.id) IS NOT TRUE
     OR v_operation.created_at<v_order.created_at OR v_operation.created_at>=v_group_expires OR v_operation.created_at IS DISTINCT FROM v_max_reservation_updated
     OR EXISTS(SELECT 1 FROM saas.promotion_usage_reservations reservation_row WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=v_group_id AND reservation_row.updated_at IS DISTINCT FROM v_operation.created_at)
  THEN RETURN false; END IF;
  SELECT count(*) INTO v_count FROM saas.promotion_redemptions WHERE store_id=p_store_id AND redemption_group_id=p_redemption_group_id;
  IF v_count<>(SELECT count(*) FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=v_group_id)
     OR EXISTS(
       SELECT 1 FROM saas.promotion_usage_reservations reservation_row
       LEFT JOIN saas.promotion_redemptions redemption
         ON redemption.store_id=reservation_row.store_id
        AND redemption.reservation_group_id=reservation_row.reservation_group_id
        AND redemption.reservation_id=reservation_row.id
        AND redemption.redemption_group_id=p_redemption_group_id
       WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=v_group_id
         AND redemption.id IS NULL)
     OR v_count<>(SELECT count(*) FROM saas.order_promotion_snapshots WHERE store_id=p_store_id AND order_id=v_order.id AND redemption_id IN (SELECT id FROM saas.promotion_redemptions WHERE store_id=p_store_id AND redemption_group_id=p_redemption_group_id))
     OR EXISTS(
       SELECT 1 FROM saas.promotion_redemptions redemption
       LEFT JOIN saas.promotion_usage_reservations reservation
         ON reservation.store_id=redemption.store_id AND reservation.id=redemption.reservation_id
           AND reservation.reservation_group_id=redemption.reservation_group_id AND reservation.promotion_id=redemption.promotion_id
       LEFT JOIN saas.order_promotion_snapshots snapshot ON snapshot.store_id=redemption.store_id AND snapshot.redemption_id=redemption.id
       WHERE redemption.store_id=p_store_id AND redemption.redemption_group_id=p_redemption_group_id
         AND (reservation.id IS NULL OR snapshot.id IS NULL OR snapshot.snapshot<>reservation.evaluator_snapshot
           OR saas.promotion_order_snapshot_valid_v1(snapshot.snapshot) IS NOT TRUE
           OR redemption.created_at<>v_operation.created_at
           OR snapshot.order_id<>redemption.order_id OR snapshot.promotion_id<>redemption.promotion_id OR snapshot.promotion_version<>redemption.promotion_version
           OR snapshot.normalized_code IS DISTINCT FROM redemption.normalized_code OR snapshot.currency<>redemption.currency
           OR snapshot.discount_minor<>redemption.discount_minor OR snapshot.evaluator_fingerprint<>redemption.evaluator_fingerprint
           OR snapshot.created_at<>redemption.created_at))
     OR EXISTS(
       SELECT 1 FROM saas.order_promotion_snapshots snapshot
       CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(snapshot.snapshot->'discountLines') frozen_line
       LEFT JOIN saas.order_items order_line ON order_line.store_id=snapshot.store_id AND order_line.order_id=snapshot.order_id AND order_line.id=(frozen_line->>'lineId')::uuid
       LEFT JOIN saas.order_discount_allocations allocation ON allocation.store_id=snapshot.store_id AND allocation.order_id=snapshot.order_id AND allocation.snapshot_id=snapshot.id AND allocation.line_id=order_line.id
       WHERE snapshot.store_id=p_store_id AND snapshot.redemption_id IN (SELECT id FROM saas.promotion_redemptions WHERE store_id=p_store_id AND redemption_group_id=p_redemption_group_id)
         AND (order_line.id IS NULL OR order_line.position<>(frozen_line->>'position')::integer
           OR (SELECT COALESCE(max((range_row->>'startOrdinal')::bigint+(range_row->>'quantity')::bigint),0) FROM pg_catalog.jsonb_array_elements(frozen_line->'capturedRanges') range_row)<>order_line.quantity
           OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(frozen_line->'capturedRanges') range_row WHERE (range_row->>'grossUnitMinor')::bigint<>order_line.unit_price_cents)
           OR allocation.id IS NULL OR allocation.line_position<>order_line.position OR allocation.discount_minor<>(frozen_line->>'discountMinor')::bigint))
     OR (SELECT count(*) FROM saas.order_discount_allocations allocation WHERE allocation.store_id=p_store_id AND allocation.order_id=v_order.id AND allocation.snapshot_id IN (SELECT snapshot.id FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id=p_store_id AND snapshot.redemption_id IN (SELECT id FROM saas.promotion_redemptions WHERE store_id=p_store_id AND redemption_group_id=p_redemption_group_id)))
        <>(SELECT COALESCE(sum(pg_catalog.jsonb_array_length(snapshot.snapshot->'discountLines')),0) FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id=p_store_id AND snapshot.redemption_id IN (SELECT id FROM saas.promotion_redemptions WHERE store_id=p_store_id AND redemption_group_id=p_redemption_group_id))
     OR (SELECT COALESCE(sum(allocation.discount_minor),0) FROM saas.order_discount_allocations allocation WHERE allocation.store_id=p_store_id AND allocation.order_id=v_order.id AND allocation.snapshot_id IN (SELECT snapshot.id FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id=p_store_id AND snapshot.redemption_id IN (SELECT id FROM saas.promotion_redemptions WHERE store_id=p_store_id AND redemption_group_id=p_redemption_group_id)))
        <>(SELECT COALESCE(sum(item.discount_cents),0) FROM saas.order_items item WHERE item.store_id=p_store_id AND item.order_id=v_order.id)
     OR (SELECT COALESCE(sum((snapshot.snapshot->>'shippingDiscountMinor')::bigint),0) FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id=p_store_id AND snapshot.redemption_id IN (SELECT id FROM saas.promotion_redemptions WHERE store_id=p_store_id AND redemption_group_id=p_redemption_group_id))
        +(SELECT COALESCE(sum(allocation.discount_minor),0) FROM saas.order_discount_allocations allocation WHERE allocation.store_id=p_store_id AND allocation.order_id=v_order.id AND allocation.snapshot_id IN (SELECT snapshot.id FROM saas.order_promotion_snapshots snapshot WHERE snapshot.store_id=p_store_id AND snapshot.redemption_id IN (SELECT id FROM saas.promotion_redemptions WHERE store_id=p_store_id AND redemption_group_id=p_redemption_group_id)))<>v_order.discount_cents
     OR EXISTS(
       SELECT 1
       FROM saas.order_promotion_snapshots snapshot
       CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(snapshot.snapshot->'giftLines') gift
       LEFT JOIN saas.order_items gift_line
         ON gift_line.store_id=snapshot.store_id
        AND gift_line.order_id=snapshot.order_id
        AND gift_line.id=(gift->>'lineId')::uuid
       WHERE snapshot.store_id=p_store_id
         AND snapshot.redemption_id IN (SELECT id FROM saas.promotion_redemptions WHERE store_id=p_store_id AND redemption_group_id=p_redemption_group_id)
         AND (gift->>'autoAdd')::boolean IS FALSE
         AND (gift_line.id IS NULL OR gift_line.variant_id IS DISTINCT FROM (gift->>'variantId')::uuid)
     )
     OR saas.promotion_auto_gift_order_lines_valid_v1(p_store_id,v_order.id,v_group_id) IS NOT TRUE
  THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_settlement_operation_result_matches_v1(p_store_id uuid,p_operation_id uuid,p_kind text,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_operation saas.promotion_operations%ROWTYPE; v_transition saas.promotion_operations%ROWTYPE; v_group_id uuid; v_expected_status text; v_expected_fingerprint text; v_members jsonb; v_current_status text;
BEGIN
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF NOT FOUND OR v_operation.operation_kind<>p_kind OR v_operation.result_payload<>p_result OR saas.promotion_operation_result_valid(p_kind,p_result) IS NOT TRUE THEN RETURN false; END IF;
  IF p_kind IN ('reserve','release','expire') THEN
    v_group_id:=(p_result->>'reservationGroupId')::uuid;
    IF v_operation.result_entity_kind<>'reservation_group' OR v_operation.result_entity_id<>v_group_id OR saas.promotion_reservation_group_integrity_valid_v1(p_store_id,v_group_id) IS NOT TRUE THEN RETURN false; END IF;
    v_expected_status:=CASE p_kind WHEN 'reserve' THEN 'reserved' WHEN 'release' THEN 'released' ELSE 'expired' END;
    IF p_result<>saas.promotion_reservation_result_v1(p_store_id,v_group_id,v_expected_status) THEN RETURN false; END IF;
    IF p_kind='reserve' THEN
      SELECT min(status) INTO v_current_status FROM saas.promotion_usage_reservations
      WHERE store_id=p_store_id AND reservation_group_id=v_group_id;
      IF v_current_status='reserved' THEN RETURN true;
      ELSIF v_current_status='committed' THEN
        RETURN EXISTS(
          SELECT 1 FROM saas.promotion_operations transition
          WHERE transition.store_id=p_store_id AND transition.operation_kind='commit'
            AND transition.result_entity_kind='redemption_group'
            AND transition.result_payload->>'reservationGroupId'=v_group_id::text
            AND saas.promotion_commit_integrity_valid_v1(p_store_id,transition.result_entity_id) IS TRUE);
      ELSIF v_current_status IN ('released','expired') THEN
        v_expected_status:=v_current_status;
        SELECT * INTO v_transition FROM saas.promotion_operations transition
        WHERE transition.store_id=p_store_id
          AND transition.operation_kind=CASE v_current_status WHEN 'released' THEN 'release' ELSE 'expire' END
          AND transition.result_entity_kind='reservation_group' AND transition.result_entity_id=v_group_id;
        IF NOT FOUND OR saas.promotion_operation_result_valid(v_transition.operation_kind,v_transition.result_payload) IS NOT TRUE
           OR v_transition.result_payload<>saas.promotion_reservation_result_v1(p_store_id,v_group_id,v_current_status)
           OR EXISTS(SELECT 1 FROM saas.promotion_usage_reservations reservation_row
             WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=v_group_id
               AND (reservation_row.status<>v_current_status OR reservation_row.updated_at<>v_transition.created_at))
        THEN RETURN false; END IF;
        IF v_current_status='released' THEN
          v_expected_fingerprint:=saas.promotion_operation_fingerprint_v2('release',p_store_id,pg_catalog.jsonb_build_object('reservationGroupId',v_group_id));
        ELSE
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'promotionId',reservation_row.promotion_id,'reservationId',reservation_row.id,
            'promotionVersion',reservation_row.promotion_version,'normalizedCode',reservation_row.normalized_code,
            'discountMinor',reservation_row.discount_minor) ORDER BY reservation_row.promotion_id,reservation_row.id)
          INTO v_members FROM saas.promotion_usage_reservations reservation_row
          WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=v_group_id;
          v_expected_fingerprint:=saas.promotion_operation_fingerprint_v2('expire',p_store_id,pg_catalog.jsonb_build_object('reservationGroupId',v_group_id,'reservations',v_members));
          IF EXISTS(SELECT 1 FROM saas.promotion_usage_reservations reservation_row
            WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=v_group_id
              AND v_transition.created_at<reservation_row.expires_at) THEN RETURN false; END IF;
        END IF;
        RETURN v_transition.fingerprint IS NOT DISTINCT FROM v_expected_fingerprint;
      END IF;
      RETURN false;
    END IF;
    IF p_kind='release' THEN
      v_expected_fingerprint:=saas.promotion_operation_fingerprint_v2('release',p_store_id,pg_catalog.jsonb_build_object('reservationGroupId',v_group_id));
      IF v_operation.fingerprint IS DISTINCT FROM v_expected_fingerprint THEN RETURN false; END IF;
    ELSIF p_kind='expire' THEN
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'promotionId',reservation_row.promotion_id,'reservationId',reservation_row.id,
        'promotionVersion',reservation_row.promotion_version,'normalizedCode',reservation_row.normalized_code,
        'discountMinor',reservation_row.discount_minor) ORDER BY reservation_row.promotion_id,reservation_row.id)
      INTO v_members
      FROM saas.promotion_usage_reservations reservation_row
      WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=v_group_id;
      v_expected_fingerprint:=saas.promotion_operation_fingerprint_v2('expire',p_store_id,pg_catalog.jsonb_build_object('reservationGroupId',v_group_id,'reservations',v_members));
      IF v_operation.fingerprint IS DISTINCT FROM v_expected_fingerprint THEN RETURN false; END IF;
    END IF;
    IF p_kind<>'reserve' AND EXISTS(SELECT 1 FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=v_group_id AND (status<>v_expected_status OR updated_at<>v_operation.created_at)) THEN RETURN false; END IF;
    IF p_kind='expire' AND EXISTS(SELECT 1 FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=v_group_id AND v_operation.created_at<expires_at) THEN RETURN false; END IF;
    RETURN true;
  ELSIF p_kind='commit' THEN
    v_expected_fingerprint:=saas.promotion_operation_fingerprint_v2('commit',p_store_id,pg_catalog.jsonb_build_object('reservationGroupId',(p_result->>'reservationGroupId')::uuid,'orderId',(p_result->>'orderId')::uuid));
    RETURN v_operation.result_entity_kind='redemption_group'
      AND v_operation.result_entity_id=(p_result->>'redemptionGroupId')::uuid
      AND v_operation.fingerprint IS NOT DISTINCT FROM v_expected_fingerprint
      AND saas.promotion_commit_integrity_valid_v1(p_store_id,v_operation.result_entity_id);
  END IF;
  RETURN false;
EXCEPTION WHEN others THEN RETURN false;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_commit_reservation_group_v1(p_store_id uuid,p_operation_id uuid,p_fingerprint text,p_reservation_group_id uuid,p_order_id uuid,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE
  v_operation saas.promotion_operations%ROWTYPE; v_reserve_operation saas.promotion_operations%ROWTYPE; v_order saas.orders%ROWTYPE;
  v_expected text; v_result jsonb; v_redemption_group_id uuid:=pg_catalog.gen_random_uuid(); v_members jsonb:='[]'::jsonb; v_rows jsonb:='[]'::jsonb;
  v_reservation saas.promotion_usage_reservations%ROWTYPE; v_row jsonb; v_snapshot_id uuid; v_redemption_id uuid; v_line jsonb;
  v_status text; v_expires_at timestamptz; v_customer_id uuid; v_currency text; v_discount bigint; v_line_total bigint; v_shipping_total bigint; v_item_subtotal bigint;
  v_source_kind text; v_source_reference text; v_max_reservation_updated timestamptz;
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL OR p_reservation_group_id IS NULL OR p_order_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_expected:=saas.promotion_operation_fingerprint_v2('commit',p_store_id,pg_catalog.jsonb_build_object('reservationGroupId',p_reservation_group_id,'orderId',p_order_id));
  IF p_fingerprint<>v_expected THEN RETURN QUERY SELECT 'idempotency_mismatch',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-operation:'||p_store_id::text||':'||p_operation_id::text,0));
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR SHARE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'commit' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'idempotency_mismatch',NULL::jsonb; RETURN; END IF;
    IF saas.promotion_settlement_operation_result_matches_v1(p_store_id,p_operation_id,'commit',v_operation.result_payload) IS NOT TRUE THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb; RETURN; END IF;
    RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; RETURN;
  END IF;
  SELECT * INTO v_reserve_operation FROM saas.promotion_operations operation_row WHERE operation_row.store_id=p_store_id AND operation_row.operation_kind='reserve' AND operation_row.result_entity_kind='reservation_group' AND operation_row.result_entity_id=p_reservation_group_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  PERFORM reservation_row.id FROM saas.promotion_usage_reservations reservation_row WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=p_reservation_group_id ORDER BY reservation_row.promotion_id,reservation_row.id FOR UPDATE;
  IF saas.promotion_reservation_group_integrity_valid_v1(p_store_id,p_reservation_group_id) IS NOT TRUE THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  SELECT min(status),min(expires_at),max(customer_id::text)::uuid,min(currency),sum(discount_minor)::bigint,
    min(source_kind),min(source_reference),max(updated_at)
  INTO v_status,v_expires_at,v_customer_id,v_currency,v_discount,v_source_kind,v_source_reference,v_max_reservation_updated
  FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=p_reservation_group_id;
  IF v_status<>'reserved' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF p_now<v_max_reservation_updated THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF p_now>=v_expires_at THEN RETURN QUERY SELECT 'reservation_expired',NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_order FROM saas.orders order_row WHERE order_row.store_id=p_store_id AND order_row.id=p_order_id FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'order_not_found',NULL::jsonb; RETURN; END IF;
  IF v_order.currency<>v_currency OR v_order.customer_id IS DISTINCT FROM v_customer_id OR v_order.discount_cents<>v_discount
     OR v_order.created_at<v_reserve_operation.created_at OR p_now<v_order.created_at
     OR saas.promotion_reservation_source_order_valid_v1(p_store_id,v_source_kind,v_source_reference,p_order_id) IS NOT TRUE
  THEN RETURN QUERY SELECT 'order_mismatch',NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(sum(item.discount_cents),0),COALESCE(sum(item.unit_price_cents::numeric*item.quantity::numeric),0)::bigint INTO v_line_total,v_item_subtotal FROM saas.order_items item WHERE item.store_id=p_store_id AND item.order_id=p_order_id;
  SELECT COALESCE(sum((reservation_row.evaluator_snapshot->>'shippingDiscountMinor')::bigint),0) INTO v_shipping_total FROM saas.promotion_usage_reservations reservation_row WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=p_reservation_group_id;
  IF v_item_subtotal<>v_order.subtotal_cents OR (v_shipping_total>0 AND v_shipping_total<>v_order.shipping_cents)
     OR v_line_total+v_shipping_total<>v_discount OR EXISTS(
    SELECT 1 FROM saas.order_items item WHERE item.store_id=p_store_id AND item.order_id=p_order_id AND item.discount_cents<>COALESCE((
      SELECT sum((frozen_line->>'discountMinor')::bigint) FROM saas.promotion_usage_reservations reservation_row CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(reservation_row.evaluator_snapshot->'discountLines') frozen_line
      WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=p_reservation_group_id AND frozen_line->>'lineId'=item.id::text),0))
    OR EXISTS(
      SELECT 1 FROM saas.promotion_usage_reservations reservation_row CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(reservation_row.evaluator_snapshot->'discountLines') frozen_line
      LEFT JOIN saas.order_items item ON item.store_id=reservation_row.store_id AND item.order_id=p_order_id AND item.id=(frozen_line->>'lineId')::uuid
      WHERE reservation_row.store_id=p_store_id AND reservation_row.reservation_group_id=p_reservation_group_id
        AND (item.id IS NULL OR item.position<>(frozen_line->>'position')::integer
          OR (SELECT COALESCE(max((range_row->>'startOrdinal')::bigint+(range_row->>'quantity')::bigint),0) FROM pg_catalog.jsonb_array_elements(frozen_line->'capturedRanges') range_row)<>item.quantity
          OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(frozen_line->'capturedRanges') range_row WHERE (range_row->>'grossUnitMinor')::bigint<>item.unit_price_cents)))
    OR EXISTS(
      SELECT 1
      FROM saas.promotion_usage_reservations reservation_row
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(reservation_row.evaluator_snapshot->'giftLines') gift
      LEFT JOIN saas.order_items gift_line
        ON gift_line.store_id=reservation_row.store_id
       AND gift_line.order_id=p_order_id
       AND gift_line.id=(gift->>'lineId')::uuid
      WHERE reservation_row.store_id=p_store_id
        AND reservation_row.reservation_group_id=p_reservation_group_id
        AND (gift->>'autoAdd')::boolean IS FALSE
        AND (gift_line.id IS NULL OR gift_line.variant_id IS DISTINCT FROM (gift->>'variantId')::uuid))
    OR saas.promotion_auto_gift_order_lines_valid_v1(p_store_id,p_order_id,p_reservation_group_id) IS NOT TRUE
  THEN RETURN QUERY SELECT 'order_mismatch',NULL::jsonb; RETURN; END IF;

  FOR v_reservation IN SELECT * FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=p_reservation_group_id ORDER BY promotion_id,id LOOP
    v_redemption_id:=pg_catalog.gen_random_uuid();
    v_members:=v_members||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('promotionId',v_reservation.promotion_id,'reservationId',v_reservation.id,'redemptionId',v_redemption_id,'promotionVersion',v_reservation.promotion_version,'normalizedCode',v_reservation.normalized_code,'discountMinor',v_reservation.discount_minor));
    v_rows:=v_rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('reservationId',v_reservation.id,'promotionId',v_reservation.promotion_id,'redemptionId',v_redemption_id));
  END LOOP;
  SELECT pg_catalog.jsonb_build_object('schemaVersion',1,'reservationGroupId',p_reservation_group_id,'redemptionGroupId',v_redemption_group_id,'status','committed','orderId',p_order_id,'currency',v_currency,'discountTotalMinor',v_discount,'evaluatorFingerprint',min(evaluator_fingerprint),'redemptions',v_members)
    INTO v_result FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND reservation_group_id=p_reservation_group_id;
  IF saas.promotion_operation_result_valid('commit',v_result) IS NOT TRUE THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at)
  VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_operation_id,'commit',p_fingerprint,'redemption_group',v_redemption_group_id,v_result,p_now);
  UPDATE saas.promotion_usage_reservations SET status='committed',updated_at=p_now WHERE store_id=p_store_id AND reservation_group_id=p_reservation_group_id;
  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(v_rows) LOOP
    SELECT * INTO v_reservation FROM saas.promotion_usage_reservations WHERE store_id=p_store_id AND id=(v_row->>'reservationId')::uuid;
    INSERT INTO saas.promotion_redemptions(id,store_id,promotion_id,reservation_id,reservation_group_id,redemption_group_id,operation_id,operation_fingerprint,promotion_version,code_id,normalized_code,order_id,customer_id,discount_minor,currency,evaluator_fingerprint,created_at)
    VALUES((v_row->>'redemptionId')::uuid,p_store_id,v_reservation.promotion_id,v_reservation.id,p_reservation_group_id,v_redemption_group_id,p_operation_id,p_fingerprint,v_reservation.promotion_version,v_reservation.code_id,v_reservation.normalized_code,p_order_id,v_reservation.customer_id,v_reservation.discount_minor,v_reservation.currency,v_reservation.evaluator_fingerprint,p_now);
    v_snapshot_id:=pg_catalog.gen_random_uuid();
    INSERT INTO saas.order_promotion_snapshots(id,store_id,order_id,promotion_id,redemption_id,promotion_version,normalized_code,currency,discount_minor,evaluator_fingerprint,snapshot,created_at)
    VALUES(v_snapshot_id,p_store_id,p_order_id,v_reservation.promotion_id,(v_row->>'redemptionId')::uuid,v_reservation.promotion_version,v_reservation.normalized_code,v_reservation.currency,v_reservation.discount_minor,v_reservation.evaluator_fingerprint,v_reservation.evaluator_snapshot,p_now);
    FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(v_reservation.evaluator_snapshot->'discountLines') LOOP
      INSERT INTO saas.order_discount_allocations(id,store_id,order_id,snapshot_id,line_id,line_position,discount_minor,created_at)
      VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_order_id,v_snapshot_id,(v_line->>'lineId')::uuid,(v_line->>'position')::integer,(v_line->>'discountMinor')::bigint,p_now);
    END LOOP;
  END LOOP;
  IF saas.promotion_commit_integrity_valid_v1(p_store_id,v_redemption_group_id) IS NOT TRUE THEN RAISE EXCEPTION 'promotion commit integrity invalid'; END IF;
  RETURN QUERY SELECT 'committed',v_result;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_reserve_v1(p_store_id uuid,p_promotion_id uuid,p_code_id uuid,p_customer_id uuid,p_operation_id uuid,p_source_reference text,p_budget_minor bigint,p_now timestamptz,p_expires_at timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT 'settlement_not_ready'::text,NULL::jsonb
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_release_expired_v1(p_store_id uuid,p_now timestamptz)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT 0
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_expire_due_reservations_v1(p_now timestamptz,p_limit integer)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_reserve_operation saas.promotion_operations%ROWTYPE; v_operation_id uuid; v_fingerprint text; v_result jsonb; v_members jsonb; v_count integer:=0;
BEGIN
  IF p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RETURN 0; END IF;
  FOR v_reserve_operation IN
    SELECT operation_row.*
    FROM saas.promotion_usage_reservations due
    JOIN saas.promotion_operations operation_row
      ON operation_row.store_id=due.store_id
     AND operation_row.operation_kind='reserve'
     AND operation_row.result_entity_kind='reservation_group'
     AND operation_row.result_entity_id=due.reservation_group_id
    WHERE due.status='reserved' AND due.expires_at<=p_now
      AND due.id=(
        SELECT member.id
        FROM saas.promotion_usage_reservations member
        WHERE member.store_id=due.store_id AND member.reservation_group_id=due.reservation_group_id
        ORDER BY member.promotion_id,member.id LIMIT 1)
    ORDER BY due.expires_at,due.store_id,due.reservation_group_id
    FOR UPDATE OF operation_row SKIP LOCKED LIMIT p_limit
  LOOP
    PERFORM reservation_row.id FROM saas.promotion_usage_reservations reservation_row WHERE reservation_row.store_id=v_reserve_operation.store_id AND reservation_row.reservation_group_id=v_reserve_operation.result_entity_id ORDER BY reservation_row.promotion_id,reservation_row.id FOR UPDATE;
    IF saas.promotion_reservation_group_integrity_valid_v1(v_reserve_operation.store_id,v_reserve_operation.result_entity_id) IS NOT TRUE
       OR EXISTS(SELECT 1 FROM saas.promotion_usage_reservations reservation_row WHERE reservation_row.store_id=v_reserve_operation.store_id AND reservation_row.reservation_group_id=v_reserve_operation.result_entity_id AND (reservation_row.status<>'reserved' OR reservation_row.expires_at>p_now))
       OR EXISTS(SELECT 1 FROM saas.promotion_operations operation_row WHERE operation_row.store_id=v_reserve_operation.store_id AND operation_row.operation_kind='expire' AND operation_row.result_entity_kind='reservation_group' AND operation_row.result_entity_id=v_reserve_operation.result_entity_id)
    THEN CONTINUE; END IF;
    SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('promotionId',promotion_id,'reservationId',id,'promotionVersion',promotion_version,'normalizedCode',normalized_code,'discountMinor',discount_minor) ORDER BY promotion_id,id)
      INTO v_members FROM saas.promotion_usage_reservations WHERE store_id=v_reserve_operation.store_id AND reservation_group_id=v_reserve_operation.result_entity_id;
    v_operation_id:=pg_catalog.gen_random_uuid();
    v_fingerprint:=saas.promotion_operation_fingerprint_v2('expire',v_reserve_operation.store_id,pg_catalog.jsonb_build_object('reservationGroupId',v_reserve_operation.result_entity_id,'reservations',v_members));
    v_result:=saas.promotion_reservation_result_v1(v_reserve_operation.store_id,v_reserve_operation.result_entity_id,'expired');
    IF v_fingerprint IS NULL OR saas.promotion_operation_result_valid('expire',v_result) IS NOT TRUE THEN CONTINUE; END IF;
    INSERT INTO saas.promotion_operations(id,store_id,operation_id,operation_kind,fingerprint,result_entity_kind,result_entity_id,result_payload,created_at)
    VALUES(pg_catalog.gen_random_uuid(),v_reserve_operation.store_id,v_operation_id,'expire',v_fingerprint,'reservation_group',v_reserve_operation.result_entity_id,v_result,p_now);
    UPDATE saas.promotion_usage_reservations SET status='expired',updated_at=p_now WHERE store_id=v_reserve_operation.store_id AND reservation_group_id=v_reserve_operation.result_entity_id;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_release_reservation_v1(p_store_id uuid,p_reservation_id uuid,p_operation_id uuid,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT 'settlement_not_ready'::text,NULL::jsonb
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_commit_reservation_v1(p_store_id uuid,p_reservation_id uuid,p_operation_id uuid,p_redemption_id uuid,p_order_id uuid,p_discount_minor bigint,p_currency text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
  SELECT 'settlement_not_ready'::text,NULL::jsonb
$fn$;

CREATE OR REPLACE FUNCTION saas.promotion_recover_settlement_operation_v1(p_store_id uuid,p_now timestamptz,p_operation_id uuid,p_kind text,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_operation saas.promotion_operations%ROWTYPE;
BEGIN
  IF p_store_id IS NULL OR p_operation_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('reserve','release','commit','expire') OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('promotion-operation:'||p_store_id::text||':'||p_operation_id::text,0));
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_operation.operation_kind<>p_kind OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'idempotency_mismatch',NULL::jsonb; RETURN; END IF;
  IF saas.promotion_settlement_operation_result_matches_v1(p_store_id,p_operation_id,p_kind,v_operation.result_payload) IS NOT TRUE THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'recovered',v_operation.result_payload;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_recover_operation_v1(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_kind text,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_action text; v_error text; v_operation saas.promotion_operations%ROWTYPE; v_entity_kind text; v_entity_id uuid; v_full_fingerprint text; v_legacy_fingerprint text; v_cross_version_match boolean:=false;
BEGIN
  v_action:=saas.promotion_operation_recovery_action(p_kind);
  IF p_store_id IS NULL OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR v_action IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,v_action);
  IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_operation.operation_kind<>p_kind THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  IF v_operation.fingerprint<>p_fingerprint AND p_kind='code_batch' THEN
    IF saas.promotion_operation_result_valid('code_batch',v_operation.result_payload) IS TRUE THEN
      BEGIN
        IF (v_operation.result_payload->>'codeLength')::integer=pg_catalog.char_length(v_operation.result_payload->>'prefix')+20
           AND (v_operation.result_payload->>'perCustomerUsage')::integer=1
           AND v_operation.result_payload->'expiresAt'='null'::jsonb
        THEN
          v_full_fingerprint:=saas.promotion_operation_fingerprint_v2('code_batch',p_store_id,pg_catalog.jsonb_build_object(
            'promotionId',(v_operation.result_payload->>'promotionId')::uuid,'count',(v_operation.result_payload->>'count')::integer,
            'prefix',v_operation.result_payload->>'prefix','codeLength',(v_operation.result_payload->>'codeLength')::integer,
            'perCustomerUsage',(v_operation.result_payload->>'perCustomerUsage')::integer,'expiresAt',NULL
          ));
          v_legacy_fingerprint:=saas.promotion_operation_fingerprint_v2('code_batch',p_store_id,pg_catalog.jsonb_build_object(
            'promotionId',(v_operation.result_payload->>'promotionId')::uuid,'count',(v_operation.result_payload->>'count')::integer,'prefix',v_operation.result_payload->>'prefix'
          ));
          v_cross_version_match:=v_operation.fingerprint IN (v_full_fingerprint,v_legacy_fingerprint)
            AND p_fingerprint IN (v_full_fingerprint,v_legacy_fingerprint);
        END IF;
      EXCEPTION WHEN others THEN
        v_cross_version_match:=false;
      END;
    END IF;
  END IF;
  IF v_operation.fingerprint<>p_fingerprint AND v_cross_version_match IS NOT TRUE THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  v_entity_kind:=saas.promotion_operation_entity_kind(p_kind);
  v_entity_id:=saas.promotion_operation_entity_id(p_kind,v_operation.result_payload);
  IF saas.promotion_operation_result_valid(p_kind,v_operation.result_payload) IS NOT TRUE
     OR v_operation.result_entity_kind IS DISTINCT FROM v_entity_kind
     OR v_operation.result_entity_id IS DISTINCT FROM v_entity_id
     OR (v_entity_kind='promotion' AND NOT EXISTS (SELECT 1 FROM saas.promotions WHERE store_id=p_store_id AND id=v_entity_id))
     OR (v_entity_kind='code_batch' AND NOT EXISTS (SELECT 1 FROM saas.promotion_code_batches WHERE store_id=p_store_id AND id=v_entity_id))
     OR (p_kind IN ('code_batch','code_batch_status') AND saas.promotion_code_batch_result_matches_v1(p_store_id,p_operation_id,p_kind,v_operation.result_payload) IS NOT TRUE)
  THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_adopt_legacy_discounts_v1(p_store_id uuid,p_now timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE r record; v_rule jsonb; v_code text; v_count integer:=0; v_promotion_id uuid; v_error text; v_created_at timestamptz; v_timezone text; v_digest text;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR pg_catalog.isfinite(p_now) IS NOT TRUE THEN RETURN 0; END IF;
  p_now:=pg_catalog.date_trunc('milliseconds',p_now);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-legacy:'||p_store_id::text,0));
  PERFORM 1 FROM saas.stores store WHERE store.id=p_store_id FOR SHARE;
  IF NOT FOUND THEN RETURN 0; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-create:'||p_store_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code:'||p_store_id::text,0));
  SELECT setting.config->>'timezone' INTO v_timezone
  FROM saas.merchant_admin_records setting
  WHERE setting.store_id=p_store_id AND setting.record_kind='general_setting' AND setting.status='active'
    AND setting.config ? 'timezone' AND pg_catalog.jsonb_typeof(setting.config->'timezone')='string'
    AND EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names zone WHERE zone.name=setting.config->>'timezone')
  ORDER BY setting.updated_at DESC,setting.id DESC LIMIT 1;
  v_timezone:=COALESCE(v_timezone,'Europe/Istanbul');
  FOR r IN SELECT * FROM saas.merchant_admin_records record WHERE record.store_id=p_store_id AND record.record_kind='discount' ORDER BY record.created_at,record.id FOR SHARE LOOP
    IF EXISTS(SELECT 1 FROM saas.promotions promotion WHERE promotion.store_id=p_store_id AND promotion.legacy_record_id=r.id) OR saas.promotion_legacy_review_reason_v1(p_store_id,r.id,r.name,r.config) IS NOT NULL THEN CONTINUE; END IF;
    BEGIN
      v_code:=CASE WHEN r.config ? 'code' AND r.config->'code'<>'null'::jsonb THEN saas.promotion_normalize_code(r.config->>'code') ELSE NULL END;
      v_created_at:=pg_catalog.date_trunc('milliseconds',r.created_at);
      v_rule:=pg_catalog.jsonb_build_object(
        'schemaVersion',1,
        'benefit',CASE WHEN r.config->>'discountType'='percent' THEN pg_catalog.jsonb_build_object('kind','percentage','percentageBps',((r.config->>'value')::numeric*100)::bigint) ELSE pg_catalog.jsonb_build_object('kind','fixed_amount','amountMinor',(r.config->>'value')::numeric::bigint,'currency','TRY') END,
        'targets',pg_catalog.jsonb_build_object('mode','all','include','[]'::jsonb,'exclude','[]'::jsonb),
        'audience',pg_catalog.jsonb_build_object('mode','everyone'),
        'trigger',CASE WHEN v_code IS NULL THEN pg_catalog.jsonb_build_object('kind','automatic') ELSE pg_catalog.jsonb_build_object('kind','code','codes',pg_catalog.jsonb_build_array(v_code)) END,
        'schedule',pg_catalog.jsonb_build_object('timezone',v_timezone),
        'limits',pg_catalog.jsonb_build_object('totalUsage',CASE WHEN r.config ? 'usageLimit' AND r.config->'usageLimit'<>'null'::jsonb THEN (r.config->>'usageLimit')::numeric::bigint ELSE NULL END,'perCustomerUsage',NULL,'budgetMinor',NULL,'orderMaximumMinor',NULL),
        'conditions',pg_catalog.jsonb_build_object('minimumBasketMinor',CASE WHEN r.config ? 'minimumOrderCents' AND r.config->'minimumOrderCents'<>'null'::jsonb THEN (r.config->>'minimumOrderCents')::numeric::bigint ELSE 0 END,'minimumQuantity',0,'minimumProductQuantity',0),
        'combinationPolicy',pg_catalog.jsonb_build_object('kind','none'),'priority',0,'marginPolicy',pg_catalog.jsonb_build_object('kind','warn'),'progressMessagePolicy',pg_catalog.jsonb_build_object('enabled',false)
      );
      IF saas.promotion_rule_document_valid(v_rule) IS NOT TRUE THEN CONTINUE; END IF;
      v_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('promotion-legacy-v1:'||p_store_id::text||':'||r.id::text,'UTF8')),'hex');
      v_promotion_id:=(pg_catalog.substr(v_digest,1,8)||'-'||pg_catalog.substr(v_digest,9,4)||'-4'||pg_catalog.substr(v_digest,14,3)||'-8'||pg_catalog.substr(v_digest,18,3)||'-'||pg_catalog.substr(v_digest,21,12))::uuid;
      IF v_promotion_id=r.id OR EXISTS(SELECT 1 FROM saas.promotions promotion WHERE promotion.id=v_promotion_id AND (promotion.store_id<>p_store_id OR promotion.legacy_record_id IS DISTINCT FROM r.id)) THEN CONTINUE; END IF;
      INSERT INTO saas.promotions(id,store_id,legacy_record_id,name,status,version,rule_document,created_at,updated_at)
      VALUES(v_promotion_id,p_store_id,r.id,r.name,'draft',1,v_rule,v_created_at,v_created_at);
      INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(pg_catalog.gen_random_uuid(),p_store_id,v_promotion_id,1,v_rule,v_created_at);
      v_error:=saas.promotion_sync_direct_codes(p_store_id,v_promotion_id,v_rule,v_created_at);
      IF v_error IS NOT NULL THEN RAISE EXCEPTION 'legacy adoption code conflict'; END IF;
      INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at)
      VALUES(pg_catalog.gen_random_uuid(),p_store_id,v_promotion_id,NULL,'legacy_adopted',pg_catalog.jsonb_build_object('legacyRecordId',r.id),p_now);
      v_count:=v_count+1;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END LOOP;
  RETURN v_count;
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
     OR (NEW.status=OLD.status AND NEW.updated_at<>OLD.updated_at)
  THEN RAISE EXCEPTION 'promotion reservation transition invalid'; END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION saas.promotion_reservation_group_transition_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas AS $fn$
DECLARE v_min_status text; v_max_status text; v_count integer; v_check_id uuid; v_expected_kind text;
BEGIN
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  SELECT count(*),min(status),max(status),min(id::text)::uuid INTO v_count,v_min_status,v_max_status,v_check_id
  FROM saas.promotion_usage_reservations reservation_row
  WHERE reservation_row.store_id=NEW.store_id AND reservation_row.reservation_group_id=NEW.reservation_group_id;
  IF v_count NOT BETWEEN 1 AND 100 OR v_min_status IS DISTINCT FROM v_max_status OR v_min_status<>NEW.status THEN
    RAISE EXCEPTION 'promotion reservation group transition incomplete';
  END IF;
  -- This constraint trigger fires once for every member at commit time.  Every
  -- invocation proves the cheap all-or-nothing status invariant above, while a
  -- single deterministic member performs the bounded ledger/graph scan below.
  -- A partial transition still sees mixed statuses and fails before this gate.
  IF NEW.id<>v_check_id THEN RETURN NEW; END IF;
  IF NEW.status='committed' THEN
    IF NOT EXISTS(
      SELECT 1 FROM saas.promotion_operations operation_row
      WHERE operation_row.store_id=NEW.store_id AND operation_row.operation_kind='commit'
        AND operation_row.result_entity_kind='redemption_group'
        AND operation_row.result_payload->>'reservationGroupId'=NEW.reservation_group_id::text
        AND saas.promotion_commit_integrity_valid_v1(NEW.store_id,operation_row.result_entity_id) IS TRUE
    ) THEN RAISE EXCEPTION 'promotion committed group ledger incomplete'; END IF;
  ELSIF NEW.status IN ('released','expired') THEN
    v_expected_kind:=CASE NEW.status WHEN 'released' THEN 'release' ELSE 'expire' END;
    IF NOT EXISTS(
      SELECT 1 FROM saas.promotion_operations operation_row
      WHERE operation_row.store_id=NEW.store_id AND operation_row.operation_kind=v_expected_kind
        AND operation_row.result_entity_kind='reservation_group' AND operation_row.result_entity_id=NEW.reservation_group_id
        AND saas.promotion_settlement_operation_result_matches_v1(NEW.store_id,operation_row.operation_id,v_expected_kind,operation_row.result_payload) IS TRUE
    ) THEN RAISE EXCEPTION 'promotion terminal group ledger incomplete'; END IF;
  ELSE
    RAISE EXCEPTION 'promotion reservation group transition invalid';
  END IF;
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
  v_operation_found boolean;
  v_rule_document jsonb;
  v_promotion_name text;
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
  v_operation_found:=FOUND;

  SELECT version_row.rule_document,promotion_row.name
  INTO v_rule_document,v_promotion_name
  FROM saas.promotion_versions version_row
  JOIN saas.promotions promotion_row
    ON promotion_row.store_id=version_row.store_id
   AND promotion_row.id=version_row.promotion_id
  WHERE version_row.store_id=NEW.store_id
    AND version_row.promotion_id=NEW.promotion_id
    AND version_row.version=NEW.promotion_version
  FOR SHARE OF version_row,promotion_row;

  IF NOT FOUND
     OR v_operation_found IS NOT TRUE
     OR NEW.operation_kind IS DISTINCT FROM 'reserve'
     OR NEW.status IS DISTINCT FROM 'reserved'
     OR saas.promotion_operation_result_valid('reserve',v_operation.result_payload) IS NOT TRUE
     OR (v_operation.result_payload->>'reservationGroupId')::uuid IS DISTINCT FROM NEW.reservation_group_id
     OR v_operation.result_payload->>'currency' IS DISTINCT FROM NEW.currency
     OR (v_operation.result_payload->>'expiresAt')::timestamptz IS DISTINCT FROM NEW.expires_at
     OR v_operation.result_payload->>'evaluatorFingerprint' IS DISTINCT FROM NEW.evaluator_fingerprint
     OR saas.promotion_order_snapshot_valid_v1(NEW.evaluator_snapshot) IS NOT TRUE
     OR (NEW.evaluator_snapshot->>'promotionId')::uuid IS DISTINCT FROM NEW.promotion_id
     OR (NEW.evaluator_snapshot->>'promotionVersion')::bigint IS DISTINCT FROM NEW.promotion_version
     OR NEW.evaluator_snapshot->>'promotionName' IS DISTINCT FROM v_promotion_name
     OR NEW.evaluator_snapshot->'benefit' IS DISTINCT FROM v_rule_document->'benefit'
     OR NEW.evaluator_snapshot->'targets' IS DISTINCT FROM v_rule_document->'targets'
     OR NEW.evaluator_snapshot->>'couponCode' IS DISTINCT FROM NEW.normalized_code
     OR NEW.evaluator_snapshot->>'currency' IS DISTINCT FROM NEW.currency
     OR (NEW.evaluator_snapshot->>'discountTotalMinor')::bigint IS DISTINCT FROM NEW.discount_minor
     OR (NEW.evaluator_snapshot->>'evaluatedAt')::timestamptz IS DISTINCT FROM NEW.created_at
     OR saas.promotion_reservation_source_valid_v1(NEW.store_id,NEW.source_kind,NEW.source_reference) IS NOT TRUE
     OR (NEW.source_kind='offline_checkout'
       AND NEW.expires_at IS DISTINCT FROM NEW.created_at+pg_catalog.interval '15 minutes')
     OR (NEW.source_kind='hosted_checkout' AND NOT EXISTS(
       SELECT 1
       FROM saas.storefront_hosted_checkout_sessions hosted
       WHERE hosted.store_id=NEW.store_id
         AND hosted.id=NEW.source_reference::uuid
         AND COALESCE(hosted.promotion_reservation_expires_at,hosted.hold_expires_at)=NEW.expires_at
         AND hosted.customer_id IS NOT DISTINCT FROM NEW.customer_id
         AND hosted.currency IS NOT DISTINCT FROM NEW.currency
         AND NEW.created_at<COALESCE(hosted.promotion_reservation_expires_at,hosted.hold_expires_at)))
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
     OR NEW.created_at IS DISTINCT FROM v_operation.created_at
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
  v_max_status text;
BEGIN
  IF NEW.operation_kind IN ('reserve','release','expire') THEN
    IF saas.promotion_operation_result_valid(NEW.operation_kind,NEW.result_payload) IS NOT TRUE
       OR NEW.result_entity_kind IS DISTINCT FROM 'reservation_group'
       OR NEW.result_entity_id IS DISTINCT FROM (NEW.result_payload->>'reservationGroupId')::uuid
    THEN RAISE EXCEPTION 'promotion reservation group result invalid'; END IF;
    v_expected:=pg_catalog.jsonb_array_length(NEW.result_payload->'reservations');
    SELECT count(*),min(status),max(status) INTO v_actual,v_status,v_max_status
    FROM saas.promotion_usage_reservations reservation_row
    WHERE reservation_row.store_id=NEW.store_id
      AND reservation_row.reservation_group_id=NEW.result_entity_id;
    IF v_actual IS DISTINCT FROM v_expected OR v_status IS DISTINCT FROM v_max_status
       OR saas.promotion_reservation_group_integrity_valid_v1(NEW.store_id,NEW.result_entity_id) IS NOT TRUE
       OR (NEW.operation_kind='release' AND v_status IS DISTINCT FROM 'released')
       OR (NEW.operation_kind='expire' AND v_status IS DISTINCT FROM 'expired')
       OR (NEW.operation_kind='reserve' AND v_status NOT IN ('reserved','committed','released','expired'))
       OR (NEW.operation_kind='reserve' AND v_status='committed' AND NOT EXISTS(
         SELECT 1 FROM saas.promotion_operations transition
         WHERE transition.store_id=NEW.store_id AND transition.operation_kind='commit'
           AND transition.result_entity_kind='redemption_group'
           AND transition.result_payload->>'reservationGroupId'=NEW.result_entity_id::text
           AND saas.promotion_commit_integrity_valid_v1(NEW.store_id,transition.result_entity_id) IS TRUE
       ))
       OR (NEW.operation_kind='reserve' AND v_status IN ('released','expired') AND NOT EXISTS(
         SELECT 1 FROM saas.promotion_operations transition
         WHERE transition.store_id=NEW.store_id
           AND transition.operation_kind=CASE v_status WHEN 'released' THEN 'release' ELSE 'expire' END
           AND transition.result_entity_kind='reservation_group' AND transition.result_entity_id=NEW.result_entity_id
           AND saas.promotion_settlement_operation_result_matches_v1(NEW.store_id,transition.operation_id,transition.operation_kind,transition.result_payload) IS TRUE
       ))
       OR EXISTS (
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
    IF v_actual IS DISTINCT FROM v_expected
       OR saas.promotion_commit_integrity_valid_v1(NEW.store_id,NEW.result_entity_id) IS NOT TRUE
       OR EXISTS (
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
  DROP TRIGGER IF EXISTS promotion_usage_reservations_group_transition_complete ON saas.promotion_usage_reservations;
  CREATE CONSTRAINT TRIGGER promotion_usage_reservations_group_transition_complete AFTER UPDATE ON saas.promotion_usage_reservations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION saas.promotion_reservation_group_transition_complete();
  DROP TRIGGER IF EXISTS promotion_usage_reservations_insert_binding ON saas.promotion_usage_reservations;
  CREATE TRIGGER promotion_usage_reservations_insert_binding BEFORE INSERT ON saas.promotion_usage_reservations FOR EACH ROW EXECUTE FUNCTION saas.promotion_reservation_matches_operation();
  DROP TRIGGER IF EXISTS promotion_redemptions_insert_binding ON saas.promotion_redemptions;
  CREATE TRIGGER promotion_redemptions_insert_binding BEFORE INSERT ON saas.promotion_redemptions FOR EACH ROW EXECUTE FUNCTION saas.promotion_redemption_matches_reservation();
  DROP TRIGGER IF EXISTS order_promotion_snapshots_insert_binding ON saas.order_promotion_snapshots;
  CREATE TRIGGER order_promotion_snapshots_insert_binding BEFORE INSERT ON saas.order_promotion_snapshots FOR EACH ROW EXECUTE FUNCTION saas.promotion_order_snapshot_insert_binding_v1();
  DROP TRIGGER IF EXISTS order_discount_allocations_insert_binding ON saas.order_discount_allocations;
  CREATE TRIGGER order_discount_allocations_insert_binding BEFORE INSERT ON saas.order_discount_allocations FOR EACH ROW EXECUTE FUNCTION saas.promotion_order_allocation_insert_binding_v1();
  DROP TRIGGER IF EXISTS promotion_operations_group_complete ON saas.promotion_operations;
  CREATE CONSTRAINT TRIGGER promotion_operations_group_complete AFTER INSERT ON saas.promotion_operations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION saas.promotion_operation_group_complete();
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.promotion_redemptions'::regclass AND conname='promotion_redemptions_order_store_fk') THEN ALTER TABLE saas.promotion_redemptions ADD CONSTRAINT promotion_redemptions_order_store_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.order_promotion_snapshots'::regclass AND conname='order_promotion_snapshots_order_store_fk') THEN ALTER TABLE saas.order_promotion_snapshots ADD CONSTRAINT order_promotion_snapshots_order_store_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.order_promotion_snapshots'::regclass AND conname='order_promotion_snapshots_version_store_fk') THEN ALTER TABLE saas.order_promotion_snapshots ADD CONSTRAINT order_promotion_snapshots_version_store_fk FOREIGN KEY(store_id,promotion_id,promotion_version) REFERENCES saas.promotion_versions(store_id,promotion_id,version); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.order_discount_allocations'::regclass AND conname='order_discount_allocations_order_store_fk') THEN ALTER TABLE saas.order_discount_allocations ADD CONSTRAINT order_discount_allocations_order_store_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id); END IF;
END $fn$;

DO $fn$
DECLARE legacy_store record;
BEGIN
  FOR legacy_store IN SELECT DISTINCT record.store_id FROM saas.merchant_admin_records record WHERE record.record_kind='discount' ORDER BY record.store_id LOOP
    BEGIN
      PERFORM saas.promotion_adopt_legacy_discounts_v1(legacy_store.store_id,pg_catalog.date_trunc('milliseconds',pg_catalog.clock_timestamp()));
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END LOOP;
END $fn$;

-- Task 4 hosted checkout V2. Keep the callable surface isolated from the V1
-- hosted checkout routines and from the migration-wide ownership/ACL tail.

CREATE OR REPLACE FUNCTION saas.storefront_hosted_checkout_promotion_codes_valid_v2(p_codes jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas
AS $fn$
  SELECT p_codes IS NOT NULL
    AND pg_catalog.jsonb_typeof(p_codes)='array'
    AND pg_catalog.jsonb_array_length(p_codes) BETWEEN 0 AND 5
    AND pg_catalog.pg_column_size(p_codes)<=2048
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_codes) WITH ORDINALITY code(value,ordinality)
      WHERE pg_catalog.jsonb_typeof(code.value)<>'string'
        OR code.value#>>'{}' !~ '^[A-Z0-9][A-Z0-9_-]{0,63}$'
        OR EXISTS (
          SELECT 1
          FROM pg_catalog.jsonb_array_elements(p_codes) WITH ORDINALITY duplicate(value,ordinality)
          WHERE duplicate.ordinality<code.ordinality AND duplicate.value=code.value
        )
    )
$fn$;

CREATE OR REPLACE FUNCTION saas.storefront_hosted_checkout_customer_prepare_v2(
  p_store_id uuid,p_now timestamptz,p_customer_candidates jsonb,p_delivery jsonb,
  p_prospective_customer_id uuid,p_allow_create boolean
)
RETURNS TABLE(outcome text,customer_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $fn$
DECLARE
  v_email text;
  v_phone text;
  v_authenticated uuid[];
  v_matching uuid[];
  v_customer_id uuid;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
    OR saas.storefront_credential_candidates_valid(p_customer_candidates,true) IS DISTINCT FROM TRUE
    OR saas.storefront_delivery_valid(p_delivery) IS DISTINCT FROM TRUE
    OR p_prospective_customer_id IS NULL OR p_allow_create IS NULL
  THEN RETURN QUERY SELECT 'invalid_input',NULL::uuid; RETURN; END IF;
  v_email:=p_delivery->'contact'->>'email';
  v_phone:=p_delivery->'contact'->>'phone';
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.storefront.hosted.customer.prepare.v2:'||p_store_id::text||':'||v_email||':'||v_phone,0));

  SELECT COALESCE(pg_catalog.array_agg(resolved.id ORDER BY resolved.id),'{}'::uuid[])
  INTO v_authenticated
  FROM (
    SELECT DISTINCT customer.id
    FROM saas.storefront_customer_credentials credential
    JOIN pg_catalog.jsonb_array_elements(p_customer_candidates) candidate
      ON candidate->>'keyId'=credential.key_id
      AND candidate->>'digest'=credential.credential_digest
    JOIN saas.customers customer
      ON customer.store_id=credential.store_id AND customer.id=credential.customer_id
    WHERE credential.store_id=p_store_id AND credential.expires_at>p_now
      AND customer.status='active' AND customer.archived_at IS NULL
  ) resolved;
  IF pg_catalog.cardinality(v_authenticated)>1
  THEN RETURN QUERY SELECT 'invalid_input',NULL::uuid; RETURN; END IF;

  PERFORM customer.id
  FROM saas.customers customer
  WHERE customer.store_id=p_store_id AND (customer.email=v_email OR customer.phone=v_phone)
  ORDER BY customer.id FOR UPDATE OF customer;
  SELECT COALESCE(pg_catalog.array_agg(customer.id ORDER BY customer.id),'{}'::uuid[])
  INTO v_matching
  FROM saas.customers customer
  WHERE customer.store_id=p_store_id AND (customer.email=v_email OR customer.phone=v_phone);

  IF pg_catalog.cardinality(v_authenticated)=1 THEN
    v_customer_id:=v_authenticated[1];
    IF pg_catalog.cardinality(v_matching)<>1 OR v_matching[1]<>v_customer_id
      OR NOT EXISTS(
        SELECT 1 FROM saas.customers customer
        WHERE customer.store_id=p_store_id AND customer.id=v_customer_id
          AND customer.status='active' AND customer.archived_at IS NULL
          AND customer.email IS NOT DISTINCT FROM v_email
          AND customer.phone IS NOT DISTINCT FROM v_phone
      )
    THEN RETURN QUERY SELECT 'invalid_input',NULL::uuid; RETURN; END IF;
    RETURN QUERY SELECT 'found',v_customer_id; RETURN;
  END IF;

  IF pg_catalog.cardinality(v_matching)>0 THEN
    IF pg_catalog.cardinality(v_matching)<>1 OR NOT EXISTS(
      SELECT 1 FROM saas.customers customer
      WHERE customer.store_id=p_store_id AND customer.id=v_matching[1]
        AND customer.status='active' AND customer.archived_at IS NULL
        AND customer.email IS NOT DISTINCT FROM v_email
        AND customer.phone IS NOT DISTINCT FROM v_phone
    )
    THEN RETURN QUERY SELECT 'invalid_input',NULL::uuid; RETURN; END IF;
    RETURN QUERY SELECT 'found',v_matching[1]; RETURN;
  END IF;

  IF NOT p_allow_create THEN RETURN QUERY SELECT 'not_found',NULL::uuid; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.customers customer WHERE customer.id=p_prospective_customer_id)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::uuid; RETURN; END IF;
  INSERT INTO saas.customers(
    id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at
  ) VALUES(
    p_prospective_customer_id,p_store_id,'active',p_delivery->'contact'->>'firstName',
    p_delivery->'contact'->>'lastName',v_email,v_phone,1,p_now,p_now
  );
  RETURN QUERY SELECT 'found',p_prospective_customer_id;
EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation
  OR numeric_value_out_of_range OR datetime_field_overflow THEN
  RETURN QUERY SELECT 'invalid_input',NULL::uuid;
END
$fn$;

CREATE OR REPLACE FUNCTION saas.storefront_hosted_checkout_authority_v2_projection(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
  p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
  p_customer_id uuid,p_normalized_codes jsonb,p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $fn$
DECLARE
  v_base jsonb;
  v_store_id uuid;
  v_source_id uuid;
  v_source_version bigint;
  v_line_count integer;
  v_shipping_method_id uuid;
  v_paid_order_count bigint:=0;
  v_customer_segments jsonb:='[]'::jsonb;
  v_customer_tags jsonb:='[]'::jsonb;
  v_abandoned_cart jsonb:='null'::jsonb;
  v_feature_enabled boolean:=false;
  v_evaluation_mode text:='evaluated';
  v_context jsonb:='{}'::jsonb;
  v_materialized_lines jsonb:='[]'::jsonb;
  v_evaluation jsonb:='{}'::jsonb;
  v_public_items jsonb:='[]'::jsonb;
  v_public_applied jsonb:='[]'::jsonb;
  v_public_gifts jsonb:='[]'::jsonb;
  v_basket jsonb:='[]'::jsonb;
  v_item jsonb;
  v_public_item jsonb;
  v_applied jsonb;
  v_gift record;
  v_product saas.products%ROWTYPE;
  v_variant saas.product_variants%ROWTYPE;
  v_ordinality bigint;
  v_line_id text;
  v_line_total bigint;
  v_line_effect numeric;
  v_projected_line_discount numeric:=0;
  v_projected_applied_discount numeric:=0;
  v_line_discount bigint:=0;
  v_shipping_discount bigint:=0;
  v_discount_total bigint:=0;
  v_grand_total bigint;
  v_shipping_payable bigint;
  v_evaluator_facts jsonb;
  v_evaluator_digest text;
  v_authority_facts jsonb;
  v_authority_digest text;
  v_result jsonb;
  v_basket_count integer;
  v_basket_total numeric;
  v_gift_remaining bigint;
  v_gift_chunk integer;
BEGIN
  IF p_hostname IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
    OR p_kind IS NULL OR p_kind NOT IN('cart','buy_now')
    OR saas.storefront_credential_candidates_valid(p_credentials,false) IS DISTINCT FROM TRUE
    OR saas.storefront_delivery_valid(p_delivery) IS DISTINCT FROM TRUE
    OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
    OR p_payment_method_id IS NULL OR p_customer_id IS NULL OR p_order_id IS NULL
    OR saas.storefront_hosted_checkout_promotion_codes_valid_v2(p_normalized_codes) IS DISTINCT FROM TRUE
  THEN RETURN NULL; END IF;
  v_base:=saas.storefront_hosted_checkout_authority_projection(
    p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id);
  IF v_base IS NULL THEN RETURN NULL; END IF;
  v_store_id:=(v_base->>'storeId')::uuid;
  v_source_id:=(v_base->>'sourceId')::uuid;
  v_source_version:=(v_base->>'sourceVersion')::bigint;
  v_line_count:=pg_catalog.jsonb_array_length(v_base->'items');
  v_grand_total:=(v_base->>'totalMinor')::bigint;

  SELECT shipping.id INTO v_shipping_method_id
  FROM saas.merchant_admin_records shipping
  WHERE shipping.store_id=v_store_id AND shipping.record_kind='shipping_setting'
    AND shipping.status='active' AND shipping.archived_at IS NULL
    AND saas.merchant_admin_config_valid('shipping_setting',shipping.config)
  ORDER BY shipping.updated_at DESC,shipping.id DESC LIMIT 1;
  SELECT count(*) INTO v_paid_order_count
  FROM saas.orders order_row
  WHERE order_row.store_id=v_store_id AND order_row.customer_id=p_customer_id
    AND (order_row.paid_at IS NOT NULL OR order_row.payment_status IN('completed','refunded'));
  SELECT COALESCE(pg_catalog.jsonb_agg(fact.id::text ORDER BY fact.id),'[]'::jsonb) INTO v_customer_segments
  FROM (
    SELECT DISTINCT membership.segment_id id
    FROM saas.customer_segment_memberships membership
    JOIN saas.customer_segments segment
      ON segment.store_id=membership.store_id AND segment.id=membership.segment_id
      AND segment.archived_at IS NULL
    WHERE membership.store_id=v_store_id AND membership.customer_id=p_customer_id
  ) fact;
  SELECT COALESCE(pg_catalog.jsonb_agg(fact.id::text ORDER BY fact.id),'[]'::jsonb) INTO v_customer_tags
  FROM (
    SELECT DISTINCT membership.tag_id id
    FROM saas.customer_tag_assignments membership
    JOIN saas.customer_tags tag
      ON tag.store_id=membership.store_id AND tag.id=membership.tag_id AND tag.archived_at IS NULL
    WHERE membership.store_id=v_store_id AND membership.customer_id=p_customer_id
  ) fact;
  IF v_paid_order_count>1000000000 OR pg_catalog.jsonb_array_length(v_customer_segments)>100
    OR pg_catalog.jsonb_array_length(v_customer_tags)>100
  THEN RETURN NULL; END IF;
  IF p_kind='cart' THEN
    SELECT pg_catalog.jsonb_build_object('id',abandoned.id) INTO v_abandoned_cart
    FROM saas.abandoned_carts abandoned
    WHERE abandoned.store_id=v_store_id AND abandoned.source_cart_id=v_source_id
      AND abandoned.status='abandoned' AND abandoned.abandoned_at IS NOT NULL
      AND abandoned.abandoned_at<=p_now AND abandoned.abandoned_at>p_now-pg_catalog.interval '30 days'
    ORDER BY abandoned.abandoned_at DESC,abandoned.id DESC LIMIT 1;
    v_abandoned_cart:=COALESCE(v_abandoned_cart,'null'::jsonb);
  END IF;

  IF v_line_count>20 THEN
    v_evaluation_mode:='cart_line_limit';
  ELSE
    SELECT EXISTS(
      SELECT 1
      FROM saas.subscriptions subscription
      JOIN saas.plans plan ON plan.id=subscription.plan_id
        AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
        AND plan.status='active' AND plan.valid_from<=p_now
        AND (plan.valid_until IS NULL OR p_now<plan.valid_until)
      JOIN saas.plan_features feature ON feature.plan_id=plan.id
        AND feature.feature_key='promotions' AND feature.enabled
      WHERE subscription.store_id=v_store_id AND subscription.status='active'
        AND subscription.valid_from<=p_now
        AND (subscription.valid_until IS NULL OR p_now<subscription.valid_until)
    ) INTO v_feature_enabled;
    IF v_feature_enabled THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'lineId',saas.storefront_commerce_uuid(p_order_id::text||':item:'||(source.ordinality-1)::text),
        'position',(source.ordinality-1)::integer,
        'productId',source.item->>'productId','variantId',source.item->>'variantId',
        'quantity',(source.item->>'quantity')::bigint,
        'unitPriceMinor',(source.item->>'unitPriceCents')::bigint,
        'unitCostMinor',NULL,'currency',v_base->>'currency','categoryIds','[]'::jsonb,
        'brandId',NULL,'collectionIds','[]'::jsonb
      ) ORDER BY source.ordinality),'[]'::jsonb) INTO v_materialized_lines
      FROM pg_catalog.jsonb_array_elements(v_base->'items') WITH ORDINALITY source(item,ordinality);
      v_context:=pg_catalog.jsonb_build_object(
        'storeId',v_store_id,'customerId',p_customer_id,'paidOrderCount',v_paid_order_count,
        'customerSegmentIds',v_customer_segments,'customerTagIds',v_customer_tags,
        'cartLines',v_materialized_lines,'shippingMethodId',v_shipping_method_id,
        'paymentMethodId',p_payment_method_id,
        'shippingBeforeDiscountMinor',(v_base->>'shippingMinor')::bigint,
        'currency',v_base->>'currency','storeLocalTime',saas.storefront_commerce_timestamp(p_now),
        'salesChannel','storefront','submittedCodes',p_normalized_codes,'abandonedCart',v_abandoned_cart
      );
      IF saas.promotion_evaluator_context_valid(v_store_id,v_context) IS NOT TRUE THEN RETURN NULL; END IF;
      v_materialized_lines:=saas.promotion_evaluator_materialize_lines(v_store_id,v_base->>'currency',v_context,p_now);
      IF pg_catalog.jsonb_typeof(v_materialized_lines) IS DISTINCT FROM 'array'
        OR pg_catalog.jsonb_array_length(v_materialized_lines)<>v_line_count
      THEN RETURN NULL; END IF;
      v_evaluation:=saas.promotion_evaluate_internal_v1(v_store_id,v_context,p_now,NULL,v_materialized_lines);
      IF v_evaluation->>'merchantExplanation'<>'evaluated'
        OR v_evaluation->>'currency' IS DISTINCT FROM v_base->>'currency'
        OR (v_evaluation->>'subtotalBeforeDiscountMinor')::bigint IS DISTINCT FROM (v_base->>'subtotalMinor')::bigint
        OR (v_evaluation->>'shippingBeforeDiscountMinor')::bigint IS DISTINCT FROM (v_base->>'shippingMinor')::bigint
      THEN RETURN NULL; END IF;
      v_line_discount:=(v_evaluation->>'lineDiscountTotalMinor')::bigint;
      v_shipping_discount:=(v_evaluation->>'shippingDiscountTotalMinor')::bigint;
      v_discount_total:=(v_evaluation->>'discountTotalMinor')::bigint;
      v_grand_total:=(v_evaluation->>'grandTotalMinor')::bigint;
      IF v_line_discount<0 OR v_shipping_discount<0
        OR v_discount_total<>v_line_discount+v_shipping_discount
        OR v_shipping_discount>(v_base->>'shippingMinor')::bigint
        OR v_grand_total<>(v_base->>'subtotalMinor')::bigint+(v_base->>'shippingMinor')::bigint-v_discount_total
        OR v_grand_total<0
      THEN RETURN NULL; END IF;
      FOR v_applied IN
        SELECT applied.value FROM pg_catalog.jsonb_array_elements(v_evaluation->'appliedPromotions') WITH ORDINALITY applied(value,ordinality)
        ORDER BY applied.ordinality
      LOOP
        v_public_applied:=v_public_applied||pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'name',v_applied->>'name','benefitKind',v_applied->>'benefitKind',
          'normalizedCode',CASE WHEN v_applied ? 'normalizedCode' THEN v_applied->>'normalizedCode' END,
          'lineDiscountCents',(v_applied->>'lineDiscountMinor')::bigint,
          'shippingDiscountCents',(v_applied->>'shippingDiscountMinor')::bigint,
          'discountCents',(v_applied->>'discountTotalMinor')::bigint
        )));
        v_projected_applied_discount:=v_projected_applied_discount+(v_applied->>'discountTotalMinor')::numeric;
      END LOOP;
      IF v_projected_applied_discount<>v_discount_total THEN RETURN NULL; END IF;
      IF EXISTS(
        SELECT 1 FROM (
          SELECT gift->>'variantId' variant_id,(gift->>'autoAdd')::boolean auto_add,
            pg_catalog.sum((gift->>'quantity')::numeric) quantity
          FROM pg_catalog.jsonb_array_elements(v_evaluation->'gifts') gift
          GROUP BY gift->>'variantId',(gift->>'autoAdd')::boolean
        ) grouped WHERE grouped.quantity NOT BETWEEN 1 AND 1000000
      ) THEN RETURN NULL; END IF;
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'variantId',grouped.variant_id,'quantity',grouped.quantity::bigint,'autoAdd',grouped.auto_add
      ) ORDER BY grouped.variant_id::uuid,grouped.auto_add),'[]'::jsonb) INTO v_public_gifts
      FROM (
        SELECT gift->>'variantId' variant_id,(gift->>'autoAdd')::boolean auto_add,
          pg_catalog.sum((gift->>'quantity')::numeric) quantity
        FROM pg_catalog.jsonb_array_elements(v_evaluation->'gifts') gift
        GROUP BY gift->>'variantId',(gift->>'autoAdd')::boolean
      ) grouped;
    END IF;
  END IF;

  FOR v_item,v_ordinality IN
    SELECT source.item,source.ordinality
    FROM pg_catalog.jsonb_array_elements(v_base->'items') WITH ORDINALITY source(item,ordinality)
    ORDER BY source.ordinality
  LOOP
    v_line_total:=(v_item->>'lineTotalCents')::bigint;
    v_line_effect:=0;
    IF v_feature_enabled AND v_evaluation_mode='evaluated' THEN
      v_line_id:=saas.storefront_commerce_uuid(p_order_id::text||':item:'||(v_ordinality-1)::text)::text;
      SELECT COALESCE(pg_catalog.sum((effect->>'discountMinor')::numeric),0) INTO v_line_effect
      FROM pg_catalog.jsonb_array_elements(v_evaluation->'lineEffects') effect
      WHERE effect->>'lineId'=v_line_id;
    END IF;
    IF v_line_effect<0 OR v_line_effect>v_line_total OR pg_catalog.trunc(v_line_effect)<>v_line_effect
    THEN RETURN NULL; END IF;
    v_projected_line_discount:=v_projected_line_discount+v_line_effect;
    v_public_item:=pg_catalog.jsonb_build_object(
      'productId',v_item->>'productId','variantId',v_item->>'variantId','slug',v_item->>'slug',
      'title',v_item->>'title','variantTitle',v_item->>'variantTitle',
      'quantity',(v_item->>'quantity')::bigint,'unitPriceCents',(v_item->>'unitPriceCents')::bigint,
      'lineTotalCents',v_line_total,'discountCents',v_line_effect::bigint,
      'payableCents',v_line_total-v_line_effect::bigint,'available',(v_item->>'available')::boolean
    );
    IF v_item ? 'categoryId' THEN v_public_item:=v_public_item||pg_catalog.jsonb_build_object('categoryId',v_item->>'categoryId'); END IF;
    IF v_item ? 'media' THEN v_public_item:=v_public_item||pg_catalog.jsonb_build_object('media',v_item->'media'); END IF;
    v_public_items:=v_public_items||pg_catalog.jsonb_build_array(v_public_item);
  END LOOP;
  IF v_feature_enabled AND v_evaluation_mode='evaluated' AND v_projected_line_discount<>v_line_discount
  THEN RETURN NULL; END IF;
  IF NOT v_feature_enabled OR v_evaluation_mode='cart_line_limit' THEN
    v_line_discount:=0; v_shipping_discount:=0; v_discount_total:=0;
    v_grand_total:=(v_base->>'totalMinor')::bigint;
    v_public_applied:='[]'::jsonb; v_public_gifts:='[]'::jsonb;
  END IF;

  IF v_feature_enabled AND v_evaluation_mode='evaluated' THEN
    FOR v_gift IN
      SELECT (gift->>'variantId')::uuid variant_id,pg_catalog.sum((gift->>'quantity')::bigint)::bigint quantity
      FROM pg_catalog.jsonb_array_elements(v_evaluation->'gifts') gift
      WHERE (gift->>'autoAdd')::boolean
      GROUP BY (gift->>'variantId')::uuid ORDER BY (gift->>'variantId')::uuid
    LOOP
      SELECT variant.* INTO v_variant
      FROM saas.product_variants variant
      WHERE variant.store_id=v_store_id AND variant.id=v_gift.variant_id
        AND variant.status='active' AND variant.archived_at IS NULL;
      IF NOT FOUND THEN RETURN NULL; END IF;
      SELECT product.* INTO v_product
      FROM saas.products product
      WHERE product.store_id=v_store_id AND product.id=v_variant.product_id
        AND product.status='active' AND product.archived_at IS NULL;
      IF NOT FOUND THEN RETURN NULL; END IF;
      v_gift_remaining:=v_gift.quantity;
      WHILE v_gift_remaining>0 LOOP
        v_gift_chunk:=LEAST(v_gift_remaining,9999)::integer;
        v_public_items:=v_public_items||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'productId',v_product.id,'variantId',v_variant.id,'slug',v_product.slug,'title',v_product.title,
          'variantTitle',v_variant.title,'quantity',v_gift_chunk,'unitPriceCents',0,
          'lineTotalCents',0,'discountCents',0,'payableCents',0,'available',true
        ));
        v_gift_remaining:=v_gift_remaining-v_gift_chunk;
      END LOOP;
    END LOOP;
  END IF;

  IF EXISTS(
    SELECT 1
    FROM (
      SELECT (item->>'variantId')::uuid variant_id,
        pg_catalog.sum((item->>'quantity')::numeric) quantity
      FROM pg_catalog.jsonb_array_elements(v_public_items) item
      GROUP BY (item->>'variantId')::uuid
    ) required
    WHERE required.quantity NOT BETWEEN 1 AND 1000000
      OR saas.storefront_available_stock(v_store_id,required.variant_id,p_now,NULL)<required.quantity
  ) THEN RETURN NULL; END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'reference',source.item->>'variantId','name',source.item->>'title','quantity',1,
    'unitAmountMinor',(source.item->>'payableCents')::bigint,'itemType','PHYSICAL'
  ) ORDER BY source.ordinality),'[]'::jsonb) INTO v_basket
  FROM pg_catalog.jsonb_array_elements(v_public_items) WITH ORDINALITY source(item,ordinality)
  WHERE (source.item->>'payableCents')::bigint>0;
  v_shipping_payable:=(v_base->>'shippingMinor')::bigint-v_shipping_discount;
  IF v_shipping_payable>0 THEN
    v_basket:=v_basket||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'reference','shipping:standard','name','Kargo','quantity',1,
      'unitAmountMinor',v_shipping_payable,'itemType','VIRTUAL'));
  END IF;
  v_basket_count:=pg_catalog.jsonb_array_length(v_basket);
  SELECT COALESCE(pg_catalog.sum((entry->>'unitAmountMinor')::numeric),0) INTO v_basket_total
  FROM pg_catalog.jsonb_array_elements(v_basket) entry;
  IF v_grand_total<1 OR v_basket_count NOT BETWEEN 1 AND 100 OR v_basket_total<>v_grand_total
  THEN RETURN NULL; END IF;

  v_evaluator_facts:=pg_catalog.jsonb_build_object(
    'schemaVersion',1,'storeId',v_store_id,'sourceKind',p_kind,'sourceId',v_source_id,
    'sourceVersion',v_source_version,'orderId',p_order_id,'customerId',p_customer_id,
    'paymentMethodId',p_payment_method_id,'normalizedCodes',p_normalized_codes,
    'evaluationMode',v_evaluation_mode,'featureEnabled',v_feature_enabled,
    'evaluatorContext',CASE WHEN v_feature_enabled AND v_evaluation_mode='evaluated' THEN v_context ELSE NULL END,
    'materializedLines',CASE WHEN v_feature_enabled AND v_evaluation_mode='evaluated' THEN v_materialized_lines ELSE NULL END,
    'evaluation',CASE WHEN v_feature_enabled AND v_evaluation_mode='evaluated' THEN v_evaluation ELSE NULL END
  );
  IF pg_catalog.pg_column_size(v_evaluator_facts)>786432 THEN RETURN NULL; END IF;
  v_evaluator_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_evaluator_facts::text,'UTF8')),'hex');
  v_authority_facts:=(v_base-ARRAY['authorityDigest','subtotalMinor','shippingMinor','discountMinor','totalMinor','items','basket'])
    ||pg_catalog.jsonb_build_object(
      'orderId',p_order_id,'customerId',p_customer_id,'evaluatorAuthorityDigest',v_evaluator_digest,
      'subtotalMinor',(v_base->>'subtotalMinor')::bigint,'shippingMinor',(v_base->>'shippingMinor')::bigint,
      'lineDiscountMinor',v_line_discount,'shippingDiscountMinor',v_shipping_discount,
      'discountMinor',v_discount_total,'totalMinor',v_grand_total,
      'promotionStatus',CASE WHEN v_evaluation_mode='cart_line_limit'
        THEN pg_catalog.jsonb_build_object('kind','not_evaluated','reason','cart_line_limit')
        ELSE pg_catalog.jsonb_build_object('kind','evaluated') END,
      'appliedPromotions',v_public_applied,'gifts',v_public_gifts,'items',v_public_items,'basket',v_basket
    );
  v_authority_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_authority_facts::text,'UTF8')),'hex');
  v_result:=v_authority_facts||pg_catalog.jsonb_build_object(
    'authorityDigest',v_authority_digest,
    '_evaluatorContext',CASE WHEN v_feature_enabled AND v_evaluation_mode='evaluated' THEN v_context ELSE '{}'::jsonb END,
    '_materializedLines',CASE WHEN v_feature_enabled AND v_evaluation_mode='evaluated' THEN v_materialized_lines ELSE '[]'::jsonb END,
    '_evaluation',CASE WHEN v_feature_enabled AND v_evaluation_mode='evaluated' THEN v_evaluation ELSE '{}'::jsonb END
  );
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END
$fn$;

CREATE OR REPLACE FUNCTION saas.public_storefront_hosted_checkout_authority_v2(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
  p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
  p_customer_candidates jsonb,p_normalized_codes jsonb,p_order_id uuid,
  p_prospective_customer_id uuid,p_operation_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $fn$
DECLARE
  v_store_id uuid;
  v_source_ids uuid[];
  v_customer_outcome text;
  v_customer_id uuid;
  v_operation saas.storefront_hosted_checkout_operations%ROWTYPE;
  v_session saas.storefront_hosted_checkout_sessions%ROWTYPE;
  v_public_authority jsonb;
  v_result jsonb;
BEGIN
  IF p_hostname IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
    OR p_kind IS NULL OR p_kind NOT IN('cart','buy_now')
    OR saas.storefront_credential_candidates_valid(p_credentials,false) IS DISTINCT FROM TRUE
    OR saas.storefront_credential_candidates_valid(p_customer_candidates,true) IS DISTINCT FROM TRUE
    OR saas.storefront_delivery_valid(p_delivery) IS DISTINCT FROM TRUE
    OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
    OR p_payment_method_id IS NULL
    OR saas.storefront_hosted_checkout_promotion_codes_valid_v2(p_normalized_codes) IS DISTINCT FROM TRUE
    OR p_order_id IS NULL OR p_prospective_customer_id IS NULL OR p_operation_id IS NULL
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_store_id:=saas.storefront_public_store(p_hostname,p_now);
  IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));
  SELECT hosted_operation.* INTO v_operation
  FROM saas.storefront_hosted_checkout_operations hosted_operation
  WHERE hosted_operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF v_operation.store_id IS DISTINCT FROM v_store_id
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
    IF v_operation.operation_kind IS DISTINCT FROM 'start'
    THEN RETURN QUERY SELECT 'authority_unavailable',NULL::jsonb; RETURN; END IF;
    SELECT session.* INTO v_session
    FROM saas.storefront_hosted_checkout_sessions session
    WHERE session.store_id=v_store_id AND session.id=v_operation.session_id
      AND session.payment_attempt_id=p_operation_id;
    IF NOT FOUND OR v_session.evaluator_authority_digest IS NULL
      OR v_session.status NOT IN('active','provider_ready','processing')
      OR v_session.terminal_at IS NOT NULL OR p_now>=v_session.payment_session_expires_at
    THEN RETURN QUERY SELECT 'authority_unavailable',NULL::jsonb; RETURN; END IF;

    IF p_kind='cart' THEN
      SELECT COALESCE(pg_catalog.array_agg(resolved.id ORDER BY resolved.id),'{}'::uuid[])
      INTO v_source_ids
      FROM (
        SELECT DISTINCT cart.id
        FROM saas.storefront_carts cart
        JOIN saas.storefront_cart_credentials credential
          ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
        JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
          ON candidate->>'keyId'=credential.key_id
          AND candidate->>'digest'=credential.credential_digest
        WHERE cart.store_id=v_store_id AND cart.status='active' AND cart.expires_at>p_now
          AND credential.expires_at>p_now AND cart.version=p_expected_version
      ) resolved;
    ELSE
      SELECT COALESCE(pg_catalog.array_agg(resolved.id ORDER BY resolved.id),'{}'::uuid[])
      INTO v_source_ids
      FROM (
        SELECT DISTINCT intent.id
        FROM saas.storefront_checkout_intents intent
        JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
          ON candidate->>'keyId'=intent.key_id
          AND candidate->>'digest'=intent.credential_digest
        WHERE intent.store_id=v_store_id AND intent.status='active' AND intent.expires_at>p_now
          AND intent.version=p_expected_version
      ) resolved;
    END IF;
    SELECT prepared.outcome,prepared.customer_id INTO v_customer_outcome,v_customer_id
    FROM saas.storefront_hosted_checkout_customer_prepare_v2(
      v_store_id,p_now,p_customer_candidates,p_delivery,p_prospective_customer_id,false) prepared;
    IF pg_catalog.cardinality(v_source_ids)<>1
      OR (p_kind='cart' AND (v_session.cart_id IS NULL OR v_source_ids[1] IS DISTINCT FROM v_session.cart_id))
      OR (p_kind='buy_now' AND (v_session.intent_id IS NULL OR v_source_ids[1] IS DISTINCT FROM v_session.intent_id))
      OR v_session.source_version IS DISTINCT FROM p_expected_version
      OR v_session.delivery_snapshot IS DISTINCT FROM p_delivery
      OR v_session.payment_method_id IS DISTINCT FROM p_payment_method_id
      OR v_session.promotion_normalized_codes IS DISTINCT FROM p_normalized_codes
      OR v_session.order_id IS DISTINCT FROM p_order_id
      OR v_customer_outcome IS DISTINCT FROM 'found'
      OR v_customer_id IS DISTINCT FROM v_session.customer_id
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;

    v_public_authority:=v_operation.result_payload->'authority';
    IF pg_catalog.jsonb_typeof(v_operation.result_payload) IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(v_public_authority) IS DISTINCT FROM 'object'
      OR v_operation.committed_at IS DISTINCT FROM v_session.created_at
      OR v_operation.result_payload->>'attemptId' IS DISTINCT FROM p_operation_id::text
      OR v_operation.result_payload->>'storeId' IS DISTINCT FROM v_store_id::text
      OR v_operation.result_payload->>'paymentMethodId' IS DISTINCT FROM v_session.payment_method_id::text
      OR v_operation.result_payload->>'profileId' IS DISTINCT FROM v_session.profile_id::text
      OR v_operation.result_payload->>'providerCode' IS DISTINCT FROM v_session.provider_code
      OR v_operation.result_payload->>'environment' IS DISTINCT FROM v_session.environment
      OR (v_operation.result_payload->>'credentialVersion')::bigint IS DISTINCT FROM v_session.credential_version
      OR (v_operation.result_payload->>'executionAdapterVersion')::integer IS DISTINCT FROM v_session.execution_adapter_version
      OR v_operation.result_payload->>'executionEvidenceDigest' IS DISTINCT FROM v_session.execution_evidence_digest
      OR (v_operation.result_payload->>'amountMinor')::bigint IS DISTINCT FROM v_session.total_minor
      OR v_operation.result_payload->>'currency' IS DISTINCT FROM v_session.currency
      OR v_operation.result_payload->>'sessionId' IS DISTINCT FROM v_session.id::text
      OR v_operation.result_payload->>'sessionStatus' IS DISTINCT FROM 'active'
      OR (v_operation.result_payload->>'sessionVersion')::bigint IS DISTINCT FROM 1
      OR (v_operation.result_payload->>'receiptExpiresAt')::timestamptz IS DISTINCT FROM v_session.receipt_expires_at
      OR v_public_authority ?| ARRAY['_evaluatorContext','_materializedLines','_evaluation']
      OR v_public_authority->>'storeId' IS DISTINCT FROM v_store_id::text
      OR v_public_authority->>'sourceKind' IS DISTINCT FROM p_kind
      OR v_public_authority->>'sourceId' IS DISTINCT FROM v_source_ids[1]::text
      OR (v_public_authority->>'sourceVersion')::bigint IS DISTINCT FROM v_session.source_version
      OR v_public_authority->>'paymentMethodId' IS DISTINCT FROM v_session.payment_method_id::text
      OR v_public_authority->>'profileId' IS DISTINCT FROM v_session.profile_id::text
      OR v_public_authority->>'providerCode' IS DISTINCT FROM v_session.provider_code
      OR v_public_authority->>'environment' IS DISTINCT FROM v_session.environment
      OR v_public_authority->>'orderId' IS DISTINCT FROM v_session.order_id::text
      OR v_public_authority->>'customerId' IS DISTINCT FROM v_session.customer_id::text
      OR v_public_authority->>'authorityDigest' IS DISTINCT FROM v_session.commerce_authority_digest
      OR v_public_authority->>'evaluatorAuthorityDigest' IS DISTINCT FROM v_session.evaluator_authority_digest
      OR (v_public_authority->>'subtotalMinor')::bigint IS DISTINCT FROM v_session.subtotal_minor
      OR (v_public_authority->>'shippingMinor')::bigint IS DISTINCT FROM v_session.shipping_minor
      OR (v_public_authority->>'discountMinor')::bigint IS DISTINCT FROM v_session.discount_minor
      OR (v_public_authority->>'totalMinor')::bigint IS DISTINCT FROM v_session.total_minor
      OR v_public_authority->>'currency' IS DISTINCT FROM v_session.currency
      OR v_public_authority->'items' IS DISTINCT FROM v_session.item_snapshot
      OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        (v_public_authority-'authorityDigest')::text,'UTF8')),'hex')
        IS DISTINCT FROM v_session.commerce_authority_digest
      OR (v_session.promotion_reservation_group_id IS NULL AND
        v_operation.result_payload->'promotionReservation' IS DISTINCT FROM 'null'::jsonb)
      OR (v_session.promotion_reservation_group_id IS NOT NULL AND (
        pg_catalog.jsonb_typeof(v_operation.result_payload->'promotionReservation') IS DISTINCT FROM 'object'
        OR v_operation.result_payload->'promotionReservation'->>'reservationGroupId'
          IS DISTINCT FROM v_session.promotion_reservation_group_id::text
        OR v_operation.result_payload->'promotionReservation'->>'status' IS DISTINCT FROM 'reserved'
        OR (v_operation.result_payload->'promotionReservation'->>'expiresAt')::timestamptz
          IS DISTINCT FROM v_session.promotion_reservation_expires_at
      ))
    THEN RETURN QUERY SELECT 'authority_unavailable',NULL::jsonb; RETURN; END IF;
    RETURN QUERY SELECT 'found',v_public_authority; RETURN;
  END IF;

  SELECT prepared.outcome,prepared.customer_id INTO v_customer_outcome,v_customer_id
  FROM saas.storefront_hosted_checkout_customer_prepare_v2(
    v_store_id,p_now,p_customer_candidates,p_delivery,p_prospective_customer_id,true) prepared;
  IF v_customer_outcome<>'found' THEN RETURN QUERY SELECT v_customer_outcome,NULL::jsonb; RETURN; END IF;
  v_result:=saas.storefront_hosted_checkout_authority_v2_projection(
    p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,
    v_customer_id,p_normalized_codes,p_order_id);
  IF v_result IS NULL THEN RETURN QUERY SELECT 'authority_unavailable',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',v_result-ARRAY['_evaluatorContext','_materializedLines','_evaluation'];
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 'authority_unavailable',NULL::jsonb;
END
$fn$;

CREATE OR REPLACE FUNCTION saas.public_storefront_hosted_checkout_begin_v2(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
  p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
  p_expected_authority_digest text,p_operation_id uuid,p_fingerprint text,
  p_session_id uuid,p_callback_binding_digest text,
  p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,
  p_receipt_id uuid,p_customer_credential_id uuid,
  p_payment_session_key_id text,p_payment_session_digest text,
  p_receipt_key_id text,p_receipt_digest text,
  p_customer_key_id text,p_customer_digest text,
  p_customer_candidates jsonb,p_normalized_codes jsonb,
  p_expected_evaluator_authority_digest text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $fn$
DECLARE
  v_store_id uuid;
  v_source_id uuid;
  v_customer_outcome text;
  v_resolved_customer_id uuid;
  v_authority jsonb;
  v_public_authority jsonb;
  v_operation saas.storefront_hosted_checkout_operations%ROWTYPE;
  v_begin_outcome text;
  v_begin_result jsonb;
  v_entry jsonb;
  v_available_quantity bigint;
  v_result jsonb;
  v_requires_promotion boolean;
  v_reserve_operation_id uuid;
  v_reservation_group_id uuid;
  v_reserve_fingerprint text;
  v_reserve_outcome text;
  v_reserve_result jsonb;
  v_expected_evaluator_fingerprint text;
  v_promotion_reservation jsonb:='null'::jsonb;
BEGIN
  IF p_hostname IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
    OR p_kind IS NULL OR p_kind NOT IN('cart','buy_now')
    OR saas.storefront_credential_candidates_valid(p_credentials,false) IS DISTINCT FROM TRUE
    OR saas.storefront_credential_candidates_valid(p_customer_candidates,true) IS DISTINCT FROM TRUE
    OR saas.storefront_delivery_valid(p_delivery) IS DISTINCT FROM TRUE
    OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
    OR p_payment_method_id IS NULL
    OR p_expected_authority_digest IS NULL OR p_expected_authority_digest!~'^[a-f0-9]{64}$'
    OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_session_id IS NULL OR p_callback_binding_digest IS NULL OR p_callback_binding_digest!~'^[a-f0-9]{64}$'
    OR p_order_id IS NULL OR p_customer_id IS NULL OR p_address_id IS NULL OR p_event_id IS NULL
    OR p_receipt_id IS NULL OR p_customer_credential_id IS NULL
    OR p_payment_session_key_id IS NULL OR p_payment_session_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
    OR p_payment_session_digest IS NULL OR p_payment_session_digest!~'^[a-f0-9]{64}$'
    OR p_receipt_key_id IS NULL OR p_receipt_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
    OR p_receipt_digest IS NULL OR p_receipt_digest!~'^[a-f0-9]{64}$'
    OR p_customer_key_id IS NULL OR p_customer_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
    OR p_customer_digest IS NULL OR p_customer_digest!~'^[a-f0-9]{64}$'
    OR p_expected_evaluator_authority_digest IS NULL OR p_expected_evaluator_authority_digest!~'^[a-f0-9]{64}$'
    OR saas.storefront_hosted_checkout_promotion_codes_valid_v2(p_normalized_codes) IS DISTINCT FROM TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_store_id:=saas.storefront_public_store(p_hostname,p_now);
  IF v_store_id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));
  SELECT hosted_operation.* INTO v_operation
  FROM saas.storefront_hosted_checkout_operations hosted_operation
  WHERE hosted_operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF v_operation.store_id<>v_store_id OR v_operation.operation_kind<>'start'
      OR v_operation.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload;
    END IF;
    RETURN;
  END IF;

  SELECT prepared.outcome,prepared.customer_id INTO v_customer_outcome,v_resolved_customer_id
  FROM saas.storefront_hosted_checkout_customer_prepare_v2(
    v_store_id,p_now,p_customer_candidates,p_delivery,p_customer_id,false) prepared;
  IF v_customer_outcome<>'found' OR v_resolved_customer_id IS DISTINCT FROM p_customer_id
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;

  IF p_kind='cart' THEN
    SELECT cart.id INTO v_source_id
    FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential
      ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=v_store_id ORDER BY cart.created_at DESC,cart.id LIMIT 1;
  ELSE
    SELECT intent.id INTO v_source_id
    FROM saas.storefront_checkout_intents intent
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
    WHERE intent.store_id=v_store_id ORDER BY intent.created_at DESC,intent.id LIMIT 1;
  END IF;
  IF v_source_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM saas.storefront_hosted_checkout_sessions session
    WHERE session.store_id=v_store_id
      AND ((p_kind='cart' AND session.cart_id=v_source_id) OR (p_kind='buy_now' AND session.intent_id=v_source_id))
      AND session.status IN('active','provider_ready','processing')
  ) THEN RETURN QUERY SELECT 'attempt_in_progress',NULL::jsonb; RETURN; END IF;

  v_authority:=saas.storefront_hosted_checkout_authority_v2_projection(
    p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,
    p_customer_id,p_normalized_codes,p_order_id);
  IF v_authority IS NULL
    OR v_authority->>'authorityDigest' IS DISTINCT FROM p_expected_authority_digest
    OR v_authority->>'evaluatorAuthorityDigest' IS DISTINCT FROM p_expected_evaluator_authority_digest
    OR (v_authority->>'orderId')::uuid IS DISTINCT FROM p_order_id
    OR (v_authority->>'customerId')::uuid IS DISTINCT FROM p_customer_id
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  v_source_id:=(v_authority->>'sourceId')::uuid;
  IF p_kind='cart' THEN
    PERFORM cart.id FROM saas.storefront_carts cart
    WHERE cart.store_id=v_store_id AND cart.id=v_source_id FOR UPDATE OF cart;
  ELSE
    PERFORM intent.id FROM saas.storefront_checkout_intents intent
    WHERE intent.store_id=v_store_id AND intent.id=v_source_id FOR UPDATE OF intent;
  END IF;
  PERFORM variant.id FROM saas.product_variants variant
  WHERE variant.store_id=v_store_id AND EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_authority->'items') item
    WHERE (item->>'variantId')::uuid=variant.id
  ) ORDER BY variant.id FOR UPDATE OF variant;
  v_authority:=saas.storefront_hosted_checkout_authority_v2_projection(
    p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id,
    p_customer_id,p_normalized_codes,p_order_id);
  IF v_authority IS NULL
    OR v_authority->>'authorityDigest' IS DISTINCT FROM p_expected_authority_digest
    OR v_authority->>'evaluatorAuthorityDigest' IS DISTINCT FROM p_expected_evaluator_authority_digest
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM saas.storefront_hosted_checkout_sessions session
    WHERE session.store_id=v_store_id
      AND ((p_kind='cart' AND session.cart_id=v_source_id) OR (p_kind='buy_now' AND session.intent_id=v_source_id))
      AND session.status IN('active','provider_ready','processing')
  ) THEN RETURN QUERY SELECT 'attempt_in_progress',NULL::jsonb; RETURN; END IF;
  FOR v_entry IN
    SELECT pg_catalog.jsonb_build_object(
      'variantId',item->>'variantId','quantity',pg_catalog.sum((item->>'quantity')::numeric))
    FROM pg_catalog.jsonb_array_elements(v_authority->'items') item
    GROUP BY item->>'variantId'
  LOOP
    v_available_quantity:=saas.storefront_available_stock(
      v_store_id,(v_entry->>'variantId')::uuid,p_now,NULL);
    IF (v_entry->>'quantity')::numeric NOT BETWEEN 1 AND 1000000
      OR pg_catalog.trunc((v_entry->>'quantity')::numeric)<>(v_entry->>'quantity')::numeric
      OR v_available_quantity IS NULL OR v_available_quantity<(v_entry->>'quantity')::bigint
    THEN RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb; RETURN; END IF;
  END LOOP;

  v_requires_promotion:=pg_catalog.jsonb_array_length(v_authority->'appliedPromotions')>0
    OR pg_catalog.jsonb_array_length(v_authority->'gifts')>0;
  IF NOT v_requires_promotion AND (
    (v_authority->>'discountMinor')::bigint<>0
    OR pg_catalog.jsonb_array_length(v_authority->'appliedPromotions')<>0
    OR pg_catalog.jsonb_array_length(v_authority->'gifts')<>0
  ) THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF v_requires_promotion AND pg_catalog.jsonb_typeof(v_authority->'_evaluatorContext') IS DISTINCT FROM 'object'
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF v_requires_promotion THEN
    v_reserve_operation_id:=saas.storefront_commerce_uuid('hosted-promotion-reserve-v2:'||p_session_id::text);
    v_reservation_group_id:=saas.storefront_commerce_uuid(
      'promotion-reservation-group-v1:'||v_store_id::text||':'||v_reserve_operation_id::text);
  END IF;
  v_public_authority:=v_authority-ARRAY['_evaluatorContext','_materializedLines','_evaluation'];

  BEGIN
    SELECT begun.outcome,begun.result_payload INTO v_begin_outcome,v_begin_result
    FROM saas.payment_attempt_begin(
      v_store_id,p_now,p_operation_id,p_fingerprint,p_payment_method_id,
      v_authority->>'orderReference',(v_authority->>'totalMinor')::bigint,
      v_authority->>'currency',p_callback_binding_digest
    ) begun;
    IF v_begin_outcome NOT IN('created','operation_replayed')
    THEN RETURN QUERY SELECT v_begin_outcome,v_begin_result; RETURN; END IF;
    IF v_begin_outcome='operation_replayed'
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;

    INSERT INTO saas.storefront_hosted_checkout_sessions(
      id,store_id,cart_id,intent_id,payment_attempt_id,payment_method_id,profile_id,
      provider_code,environment,credential_version,execution_adapter_version,
      execution_evidence_digest,order_reference,order_id,customer_id,address_id,event_id,
      receipt_id,customer_credential_id,source_version,commerce_authority_digest,currency,
      subtotal_minor,shipping_minor,discount_minor,total_minor,delivery_snapshot,item_snapshot,
      status,safe_code,hold_expires_at,terminal_at,version,payment_session_key_id,
      payment_session_credential_digest,payment_session_expires_at,receipt_key_id,
      receipt_credential_digest,receipt_expires_at,customer_key_id,customer_credential_digest,
      customer_expires_at,created_at,updated_at,evaluator_authority_digest,
      promotion_evaluator_context,promotion_evaluation,promotion_normalized_codes,
      promotion_reservation_group_id,promotion_reservation_expires_at
    ) VALUES(
      p_session_id,v_store_id,CASE WHEN p_kind='cart' THEN v_source_id END,
      CASE WHEN p_kind='buy_now' THEN v_source_id END,p_operation_id,p_payment_method_id,
      (v_authority->>'profileId')::uuid,v_authority->>'providerCode',v_authority->>'environment',
      (v_authority->>'credentialVersion')::bigint,(v_authority->>'executionAdapterVersion')::integer,
      v_authority->>'executionEvidenceDigest',v_authority->>'orderReference',p_order_id,p_customer_id,
      p_address_id,p_event_id,p_receipt_id,p_customer_credential_id,p_expected_version,
      p_expected_authority_digest,v_authority->>'currency',(v_authority->>'subtotalMinor')::bigint,
      (v_authority->>'shippingMinor')::bigint,(v_authority->>'discountMinor')::bigint,
      (v_authority->>'totalMinor')::bigint,p_delivery,v_authority->'items','active','payment_started',
      p_now+pg_catalog.interval '15 minutes',NULL,1,p_payment_session_key_id,p_payment_session_digest,
      p_now+pg_catalog.interval '15 minutes',p_receipt_key_id,p_receipt_digest,p_now+pg_catalog.interval '1 day',
      p_customer_key_id,p_customer_digest,p_now+pg_catalog.interval '30 days',p_now,p_now,
      p_expected_evaluator_authority_digest,v_authority->'_evaluatorContext',v_authority->'_evaluation',
      p_normalized_codes,v_reservation_group_id,
      CASE WHEN v_requires_promotion THEN p_now+pg_catalog.interval '1 day' END
    );
    IF v_requires_promotion THEN
      v_reserve_fingerprint:=saas.promotion_operation_fingerprint_v2(
        'reserve',v_store_id,pg_catalog.jsonb_build_object(
          'sourceKind','hosted_checkout','sourceReference',p_session_id::text,
          'evaluatorContext',v_authority->'_evaluatorContext'));
      SELECT reserved.outcome,reserved.result_payload INTO v_reserve_outcome,v_reserve_result
      FROM saas.promotion_reserve_group_v1(
        v_store_id,v_reserve_operation_id,v_reserve_fingerprint,'hosted_checkout',p_session_id::text,
        v_authority->'_evaluatorContext',p_now) reserved;
      v_expected_evaluator_fingerprint:=saas.promotion_operation_fingerprint_v2(
        'reserve',v_store_id,pg_catalog.jsonb_build_object(
          'sourceKind','hosted_checkout','sourceReference',p_session_id::text,
          'evaluatorContext',v_authority->'_evaluatorContext',
          'materializedLines',v_authority->'_materializedLines',
          'evaluation',v_authority->'_evaluation'));
      IF v_reserve_outcome<>'reserved'
        OR (v_reserve_result->>'reservationGroupId')::uuid IS DISTINCT FROM v_reservation_group_id
        OR v_reserve_result->>'status' IS DISTINCT FROM 'reserved'
        OR (v_reserve_result->>'expiresAt')::timestamptz IS DISTINCT FROM p_now+pg_catalog.interval '1 day'
        OR v_reserve_result->>'evaluatorFingerprint' IS DISTINCT FROM v_expected_evaluator_fingerprint
        OR (v_reserve_result->>'discountTotalMinor')::bigint IS DISTINCT FROM (v_authority->>'discountMinor')::bigint
      THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_V2_RESERVATION_INVALID'; END IF;
      v_promotion_reservation:=pg_catalog.jsonb_build_object(
        'reservationGroupId',v_reservation_group_id,'status','reserved',
        'expiresAt',v_reserve_result->>'expiresAt',
        'evaluatorFingerprint',v_reserve_result->>'evaluatorFingerprint');
    END IF;

    -- The reserve function re-evaluates gift availability while the source and
    -- variant rows are locked above.  Insert this session's own inventory hold
    -- only after that recheck, otherwise a tracked exact-stock gift would count
    -- its future hold twice.  Both graphs remain in this same subtransaction.
    INSERT INTO saas.checkout_inventory_reservations(
      id,store_id,attempt_id,payment_attempt_id,quick_order_link_id,storefront_hosted_session_id,
      product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at
    )
    SELECT
      saas.storefront_commerce_uuid('hosted-reservation:'||p_session_id::text||':'||required.variant_id::text),
      v_store_id,NULL,p_operation_id,NULL,p_session_id,required.product_id,required.variant_id,
      required.quantity::bigint,variant.stock_tracking,'held',p_now,1,p_now
    FROM (
      SELECT (item->>'productId')::uuid product_id,(item->>'variantId')::uuid variant_id,
        pg_catalog.sum((item->>'quantity')::numeric) quantity
      FROM pg_catalog.jsonb_array_elements(v_authority->'items') item
      GROUP BY (item->>'productId')::uuid,(item->>'variantId')::uuid
    ) required
    JOIN saas.product_variants variant
      ON variant.store_id=v_store_id AND variant.id=required.variant_id
      AND variant.product_id=required.product_id
    ORDER BY required.variant_id;

    v_result:=v_begin_result||pg_catalog.jsonb_build_object(
      'sessionId',p_session_id,'sessionStatus','active','sessionVersion',1,
      'paymentSessionKeyId',p_payment_session_key_id,'receiptKeyId',p_receipt_key_id,
      'customerKeyId',p_customer_key_id,
      'paymentSessionExpiresAt',saas.storefront_commerce_timestamp(p_now+pg_catalog.interval '15 minutes'),
      'receiptExpiresAt',saas.storefront_commerce_timestamp(p_now+pg_catalog.interval '1 day'),
      'customerExpiresAt',saas.storefront_commerce_timestamp(p_now+pg_catalog.interval '30 days'),
      'authority',v_public_authority,'promotionReservation',v_promotion_reservation
    );
    IF pg_catalog.pg_column_size(v_result)>786432
    THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_V2_RESULT_TOO_LARGE'; END IF;
    INSERT INTO saas.storefront_hosted_checkout_operations(
      operation_id,store_id,session_id,operation_kind,payload_fingerprint,result_payload,committed_at
    ) VALUES(p_operation_id,v_store_id,p_session_id,'start',p_fingerprint,v_result,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation
    OR numeric_value_out_of_range OR datetime_field_overflow OR raise_exception THEN
    RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'created',v_result;
END
$fn$;

CREATE OR REPLACE FUNCTION saas.storefront_hosted_checkout_promotion_release_v2(
  p_store_id uuid,p_session_id uuid,p_reservation_group_id uuid,p_now timestamptz
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $fn$
DECLARE
  v_operation_id uuid;
  v_fingerprint text;
  v_outcome text;
BEGIN
  IF p_store_id IS NULL OR p_session_id IS NULL OR p_now IS NULL
    OR NOT pg_catalog.isfinite(p_now) OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
  THEN RETURN false; END IF;
  IF p_reservation_group_id IS NULL THEN RETURN true; END IF;
  v_operation_id:=saas.storefront_commerce_uuid('hosted-promotion-release-v2:'||p_session_id::text);
  v_fingerprint:=saas.promotion_operation_fingerprint_v2(
    'release',p_store_id,pg_catalog.jsonb_build_object('reservationGroupId',p_reservation_group_id));
  SELECT released.outcome INTO v_outcome
  FROM saas.promotion_release_reservation_group_v1(
    p_store_id,v_operation_id,v_fingerprint,p_reservation_group_id,p_now) released;
  IF v_outcome IN('released','operation_replayed') THEN RETURN true; END IF;
  RETURN v_outcome='invalid_transition' AND EXISTS(
    SELECT 1 FROM saas.promotion_usage_reservations reservation
    WHERE reservation.store_id=p_store_id AND reservation.reservation_group_id=p_reservation_group_id
    HAVING count(*) BETWEEN 1 AND 100
      AND bool_and(reservation.status IN('released','expired'))
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END
$fn$;

CREATE OR REPLACE FUNCTION saas.storefront_hosted_checkout_promotion_terminal_v2()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $fn$
DECLARE
  v_session saas.storefront_hosted_checkout_sessions%ROWTYPE;
  v_customer saas.customers%ROWTYPE;
  v_address saas.customer_addresses%ROWTYPE;
  v_authority jsonb;
  v_line jsonb;
  v_receipt jsonb;
  v_operation_result jsonb;
  v_order_number text;
  v_position integer:=0;
  v_held_count bigint;
  v_tracked_count bigint;
  v_updated_count bigint;
  v_settlement_conflict boolean:=false;
  v_commit_operation_id uuid;
  v_commit_fingerprint text;
  v_commit_outcome text;
  v_commit_result jsonb;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT session.* INTO v_session
  FROM saas.storefront_hosted_checkout_sessions session
  WHERE session.store_id=NEW.store_id AND session.payment_attempt_id=NEW.id
  FOR UPDATE;
  IF NOT FOUND OR v_session.evaluator_authority_digest IS NULL
    OR v_session.status IN('captured','failed','cancelled','expired','stock_conflict')
  THEN RETURN NEW; END IF;
  SELECT hosted_operation.result_payload->'authority' INTO v_authority
  FROM saas.storefront_hosted_checkout_operations hosted_operation
  WHERE hosted_operation.store_id=v_session.store_id
    AND hosted_operation.operation_id=v_session.payment_attempt_id
    AND hosted_operation.session_id=v_session.id
    AND hosted_operation.operation_kind='start';
  IF pg_catalog.jsonb_typeof(v_authority) IS DISTINCT FROM 'object'
    OR v_authority->>'authorityDigest' IS DISTINCT FROM v_session.commerce_authority_digest
    OR v_authority->>'evaluatorAuthorityDigest' IS DISTINCT FROM v_session.evaluator_authority_digest
    OR (v_authority->>'orderId')::uuid IS DISTINCT FROM v_session.order_id
    OR (v_authority->>'customerId')::uuid IS DISTINCT FROM v_session.customer_id
    OR (v_authority->>'totalMinor')::bigint IS DISTINCT FROM v_session.total_minor
    OR v_authority->'items' IS DISTINCT FROM v_session.item_snapshot
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_V2_FROZEN_AUTHORITY_INVALID'; END IF;

  IF NEW.status IN('provider_outcome_unknown','reconciliation_required') THEN
    IF v_session.status IN('active','provider_ready') THEN
      UPDATE saas.storefront_hosted_checkout_sessions SET
        status='processing',safe_code=NEW.safe_code,version=version+1,updated_at=NEW.updated_at
      WHERE store_id=v_session.store_id AND id=v_session.id;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN('captured','failed','cancelled','expired') THEN RETURN NEW; END IF;

  IF v_session.cart_id IS NOT NULL THEN
    PERFORM cart.id FROM saas.storefront_carts cart
    WHERE cart.store_id=v_session.store_id AND cart.id=v_session.cart_id FOR UPDATE OF cart;
  ELSE
    PERFORM intent.id FROM saas.storefront_checkout_intents intent
    WHERE intent.store_id=v_session.store_id AND intent.id=v_session.intent_id FOR UPDATE OF intent;
  END IF;
  PERFORM variant.id FROM saas.product_variants variant
  WHERE variant.store_id=v_session.store_id AND EXISTS(
    SELECT 1 FROM saas.checkout_inventory_reservations reservation
    WHERE reservation.store_id=v_session.store_id
      AND reservation.storefront_hosted_session_id=v_session.id
      AND reservation.variant_id=variant.id
  ) ORDER BY variant.id FOR UPDATE OF variant;
  PERFORM reservation.id FROM saas.checkout_inventory_reservations reservation
  WHERE reservation.store_id=v_session.store_id
    AND reservation.storefront_hosted_session_id=v_session.id
  ORDER BY reservation.variant_id,reservation.id FOR UPDATE;

  IF NEW.status IN('failed','cancelled','expired') THEN
    IF saas.storefront_hosted_checkout_promotion_release_v2(
      v_session.store_id,v_session.id,v_session.promotion_reservation_group_id,NEW.updated_at) IS NOT TRUE
    THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_V2_PROMOTION_RELEASE_FAILED'; END IF;
    UPDATE saas.checkout_inventory_reservations SET
      status=CASE WHEN NEW.status='expired' THEN 'expired' ELSE 'released' END,
      expired_at=CASE WHEN NEW.status='expired' THEN NEW.updated_at ELSE NULL END,
      released_at=CASE WHEN NEW.status='expired' THEN NULL ELSE NEW.updated_at END,
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=v_session.store_id
      AND storefront_hosted_session_id=v_session.id AND status='held';
    UPDATE saas.storefront_hosted_checkout_sessions SET
      status=NEW.status,safe_code=NEW.safe_code,terminal_at=NEW.updated_at,
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=v_session.store_id AND id=v_session.id;
    RETURN NEW;
  END IF;

  IF v_session.promotion_reservation_group_id IS NOT NULL
    AND (v_session.promotion_reservation_expires_at IS NULL
      OR NEW.updated_at>=v_session.promotion_reservation_expires_at)
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_V2_PROMOTION_EXPIRED'; END IF;
  SELECT pg_catalog.count(*) INTO v_held_count
  FROM saas.checkout_inventory_reservations reservation
  WHERE reservation.store_id=v_session.store_id
    AND reservation.storefront_hosted_session_id=v_session.id;
  v_settlement_conflict:=v_held_count<>(
      SELECT pg_catalog.count(*)
      FROM (
        SELECT item->>'productId',item->>'variantId'
        FROM pg_catalog.jsonb_array_elements(v_session.item_snapshot) item
        GROUP BY item->>'productId',item->>'variantId'
      ) grouped
    )
    OR EXISTS(
      SELECT 1 FROM saas.checkout_inventory_reservations reservation
      WHERE reservation.store_id=v_session.store_id
        AND reservation.storefront_hosted_session_id=v_session.id
        AND reservation.status<>'held'
    ) OR EXISTS(
      SELECT 1
      FROM saas.checkout_inventory_reservations reservation
      JOIN saas.product_variants variant
        ON variant.store_id=reservation.store_id AND variant.id=reservation.variant_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(pg_catalog.sum(other_hold.quantity),0)::bigint quantity
        FROM saas.checkout_inventory_reservations other_hold
        WHERE other_hold.store_id=reservation.store_id
          AND other_hold.variant_id=reservation.variant_id
          AND other_hold.stock_tracked AND other_hold.status='held'
          AND other_hold.storefront_hosted_session_id IS DISTINCT FROM v_session.id
          AND (
            (other_hold.attempt_id IS NOT NULL AND EXISTS(
              SELECT 1 FROM saas.checkout_payment_attempts legacy_attempt
              WHERE legacy_attempt.store_id=other_hold.store_id
                AND legacy_attempt.id=other_hold.attempt_id
                AND legacy_attempt.status IN('reserved','provider_ready','initiation_unknown')
                AND legacy_attempt.hold_expires_at>NEW.updated_at
            )) OR (other_hold.payment_attempt_id IS NOT NULL
              AND other_hold.quick_order_link_id IS NOT NULL AND EXISTS(
                SELECT 1 FROM saas.quick_order_hosted_payment_bridges bridge
                WHERE bridge.store_id=other_hold.store_id
                  AND bridge.attempt_id=other_hold.payment_attempt_id
                  AND bridge.quick_order_link_id=other_hold.quick_order_link_id
                  AND bridge.status='active' AND bridge.hold_expires_at>NEW.updated_at
            )) OR (other_hold.storefront_hosted_session_id IS NOT NULL AND EXISTS(
              SELECT 1 FROM saas.storefront_hosted_checkout_sessions other_session
              WHERE other_session.store_id=other_hold.store_id
                AND other_session.id=other_hold.storefront_hosted_session_id
                AND other_session.payment_attempt_id=other_hold.payment_attempt_id
                AND other_session.status IN('active','provider_ready','processing')
                AND other_session.hold_expires_at>NEW.updated_at
            ))
          )
      ) live_holds ON true
      WHERE reservation.store_id=v_session.store_id
        AND reservation.storefront_hosted_session_id=v_session.id
        AND reservation.stock_tracked
        AND variant.stock_quantity-live_holds.quantity<reservation.quantity
    ) OR (v_session.cart_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM saas.storefront_carts cart
      WHERE cart.store_id=v_session.store_id AND cart.id=v_session.cart_id AND cart.status='active'
    )) OR (v_session.intent_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM saas.storefront_checkout_intents intent
      WHERE intent.store_id=v_session.store_id AND intent.id=v_session.intent_id AND intent.status='active'
    ));
  IF v_settlement_conflict THEN
    IF saas.storefront_hosted_checkout_promotion_release_v2(
      v_session.store_id,v_session.id,v_session.promotion_reservation_group_id,NEW.updated_at) IS NOT TRUE
    THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_V2_PROMOTION_RELEASE_FAILED'; END IF;
    UPDATE saas.checkout_inventory_reservations SET status='released',released_at=NEW.updated_at,
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=v_session.store_id
      AND storefront_hosted_session_id=v_session.id AND status='held';
    UPDATE saas.storefront_hosted_checkout_sessions SET
      status='stock_conflict',safe_code='captured_stock_conflict',terminal_at=NEW.updated_at,
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=v_session.store_id AND id=v_session.id;
    RETURN NEW;
  END IF;

  SELECT customer.* INTO v_customer
  FROM saas.customers customer
  WHERE customer.store_id=v_session.store_id AND customer.id=v_session.customer_id
  FOR UPDATE OF customer;
  IF NOT FOUND OR v_customer.status<>'active' OR v_customer.archived_at IS NOT NULL
    OR v_customer.email IS DISTINCT FROM v_session.delivery_snapshot->'contact'->>'email'
    OR v_customer.phone IS DISTINCT FROM v_session.delivery_snapshot->'contact'->>'phone'
    OR EXISTS(
      SELECT 1 FROM saas.customers customer
      WHERE customer.store_id=v_session.store_id AND customer.id<>v_session.customer_id
        AND (customer.email=v_session.delivery_snapshot->'contact'->>'email'
          OR customer.phone=v_session.delivery_snapshot->'contact'->>'phone')
    )
  THEN
    IF saas.storefront_hosted_checkout_promotion_release_v2(
      v_session.store_id,v_session.id,v_session.promotion_reservation_group_id,NEW.updated_at) IS NOT TRUE
    THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_V2_PROMOTION_RELEASE_FAILED'; END IF;
    UPDATE saas.checkout_inventory_reservations SET status='released',released_at=NEW.updated_at,
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=v_session.store_id
      AND storefront_hosted_session_id=v_session.id AND status='held';
    UPDATE saas.storefront_hosted_checkout_sessions SET
      status='stock_conflict',safe_code='customer_authority_conflict',terminal_at=NEW.updated_at,
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=v_session.store_id AND id=v_session.id;
    RETURN NEW;
  END IF;

  UPDATE saas.customers SET
    first_name=v_session.delivery_snapshot->'contact'->>'firstName',
    last_name=v_session.delivery_snapshot->'contact'->>'lastName',
    version=version+1,updated_at=NEW.updated_at
  WHERE store_id=v_session.store_id AND id=v_session.customer_id
  RETURNING * INTO v_customer;

  SELECT address.* INTO v_address
  FROM saas.customer_addresses address
  WHERE address.store_id=v_session.store_id AND address.customer_id=v_customer.id AND address.is_default
  FOR UPDATE OF address;
  IF FOUND THEN
    UPDATE saas.customer_addresses SET
      recipient_name=v_customer.first_name||' '||v_customer.last_name,
      line1=v_session.delivery_snapshot->'shippingAddress'->>'line1',
      line2=v_session.delivery_snapshot->'shippingAddress'->>'line2',
      city=v_session.delivery_snapshot->'shippingAddress'->>'city',
      district=v_session.delivery_snapshot->'shippingAddress'->>'district',
      postal_code=v_session.delivery_snapshot->'shippingAddress'->>'postalCode',
      country=v_session.delivery_snapshot->'shippingAddress'->>'country',
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=v_session.store_id AND id=v_address.id RETURNING * INTO v_address;
  ELSE
    INSERT INTO saas.customer_addresses(
      id,store_id,customer_id,label,recipient_name,line1,line2,city,district,
      postal_code,country,is_default,version,created_at,updated_at
    ) VALUES(
      v_session.address_id,v_session.store_id,v_customer.id,'Teslimat',
      v_customer.first_name||' '||v_customer.last_name,
      v_session.delivery_snapshot->'shippingAddress'->>'line1',
      v_session.delivery_snapshot->'shippingAddress'->>'line2',
      v_session.delivery_snapshot->'shippingAddress'->>'city',
      v_session.delivery_snapshot->'shippingAddress'->>'district',
      v_session.delivery_snapshot->'shippingAddress'->>'postalCode',
      v_session.delivery_snapshot->'shippingAddress'->>'country',true,1,NEW.updated_at,NEW.updated_at
    ) RETURNING * INTO v_address;
  END IF;

  v_order_number:='SF-'||pg_catalog.upper(pg_catalog.replace(v_session.order_id::text,'-',''));
  INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
    shipping_address,tracking,version,created_at,updated_at,customer_id
  ) VALUES(
    v_session.order_id,v_session.store_id,v_order_number,'storefront',
    v_customer.first_name||' '||v_customer.last_name,v_customer.email,v_customer.phone,
    v_session.currency,v_session.subtotal_minor,v_session.shipping_minor,
    v_session.discount_minor,v_session.total_minor,'confirmed','completed',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',v_customer.first_name||' '||v_customer.last_name,
      'line1',v_session.delivery_snapshot->'shippingAddress'->>'line1',
      'line2',v_session.delivery_snapshot->'shippingAddress'->>'line2',
      'district',v_session.delivery_snapshot->'shippingAddress'->>'district',
      'city',v_session.delivery_snapshot->'shippingAddress'->>'city',
      'postalCode',v_session.delivery_snapshot->'shippingAddress'->>'postalCode',
      'country',v_session.delivery_snapshot->'shippingAddress'->>'country'
    )),NULL,1,NEW.updated_at,NEW.updated_at,v_customer.id
  );
  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(v_session.item_snapshot) LOOP
    INSERT INTO saas.order_items(
      id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,
      unit_price_cents,quantity,discount_cents,line_total_cents,created_at
    ) VALUES(
      saas.storefront_commerce_uuid(v_session.order_id::text||':item:'||v_position::text),
      v_session.store_id,v_session.order_id,(v_line->>'productId')::uuid,
      (v_line->>'variantId')::uuid,v_position,v_line->>'title',v_line->>'variantTitle',v_line->>'sku',
      (v_line->>'unitPriceCents')::bigint,(v_line->>'quantity')::integer,
      (v_line->>'discountCents')::bigint,(v_line->>'payableCents')::bigint,NEW.updated_at
    );
    v_position:=v_position+1;
  END LOOP;

  IF v_session.promotion_reservation_group_id IS NOT NULL THEN
    v_commit_operation_id:=saas.storefront_commerce_uuid('hosted-promotion-commit-v2:'||v_session.id::text);
    v_commit_fingerprint:=saas.promotion_operation_fingerprint_v2(
      'commit',v_session.store_id,pg_catalog.jsonb_build_object(
        'reservationGroupId',v_session.promotion_reservation_group_id,'orderId',v_session.order_id));
    SELECT committed.outcome,committed.result_payload INTO v_commit_outcome,v_commit_result
    FROM saas.promotion_commit_reservation_group_v1(
      v_session.store_id,v_commit_operation_id,v_commit_fingerprint,
      v_session.promotion_reservation_group_id,v_session.order_id,NEW.updated_at) committed;
    IF v_commit_outcome NOT IN('committed','operation_replayed')
      OR pg_catalog.jsonb_typeof(v_commit_result) IS DISTINCT FROM 'object'
    THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_V2_PROMOTION_COMMIT_FAILED:%',v_commit_outcome; END IF;
  END IF;

  INSERT INTO saas.order_events(
    id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at
  ) VALUES(
    v_session.event_id,v_session.store_id,v_session.order_id,NULL,'order_created',NULL,'confirmed',
    'Storefront kart ödemesi doğrulandı.',
    pg_catalog.jsonb_build_object('paymentKind','hosted_card','providerCode',v_session.provider_code),
    NEW.updated_at
  );
  INSERT INTO saas.storefront_customer_credentials(
    id,store_id,customer_id,key_id,credential_digest,expires_at,created_at,last_seen_at
  ) VALUES(
    v_session.customer_credential_id,v_session.store_id,v_customer.id,v_session.customer_key_id,
    v_session.customer_credential_digest,v_session.customer_expires_at,NEW.updated_at,NEW.updated_at
  );
  INSERT INTO saas.storefront_order_receipts(
    id,store_id,order_id,customer_credential_id,key_id,credential_digest,expires_at,created_at
  ) VALUES(
    v_session.receipt_id,v_session.store_id,v_session.order_id,v_session.customer_credential_id,
    v_session.receipt_key_id,v_session.receipt_credential_digest,v_session.receipt_expires_at,NEW.updated_at
  );
  v_receipt:=pg_catalog.jsonb_build_object(
    'orderReference',v_order_number,'currency',v_session.currency,
    'subtotalCents',v_session.subtotal_minor,'shippingCents',v_session.shipping_minor,
    'lineDiscountCents',(v_authority->>'lineDiscountMinor')::bigint,
    'shippingDiscountCents',(v_authority->>'shippingDiscountMinor')::bigint,
    'discountCents',v_session.discount_minor,'totalCents',v_session.total_minor,
    'paymentStatus','completed','paymentMethod',pg_catalog.jsonb_build_object(
      'kind','hosted_card','id',v_session.payment_method_id,
      'label',(SELECT method.label FROM saas.payment_methods method
        WHERE method.store_id=v_session.store_id AND method.id=v_session.payment_method_id),
      'instructions','Güvenli sağlayıcı ekranında tamamlandı.','providerCode',v_session.provider_code,
      'presentation',CASE v_session.provider_code WHEN 'paytr_iframe' THEN 'iframe' ELSE 'redirect' END,
      'requiredCustomerFields',CASE v_session.provider_code WHEN 'iyzico_iframe'
        THEN pg_catalog.jsonb_build_array('identity_number') ELSE '[]'::jsonb END
    ),
    'delivery',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',v_customer.first_name||' '||v_customer.last_name,
      'addressLine1',v_session.delivery_snapshot->'shippingAddress'->>'line1',
      'addressLine2',v_session.delivery_snapshot->'shippingAddress'->>'line2',
      'city',v_session.delivery_snapshot->'shippingAddress'->>'city',
      'district',v_session.delivery_snapshot->'shippingAddress'->>'district',
      'postalCode',v_session.delivery_snapshot->'shippingAddress'->>'postalCode','country','TR'
    )),
    'items',v_session.item_snapshot,'promotionStatus',v_authority->'promotionStatus',
    'appliedPromotions',v_authority->'appliedPromotions','gifts',v_authority->'gifts',
    'createdAt',saas.storefront_commerce_timestamp(NEW.updated_at)
  );
  v_operation_result:=pg_catalog.jsonb_build_object(
    'receipt',v_receipt,'credentialPersistence',pg_catalog.jsonb_build_object(
      'receipt',true,'customer',true,'receiptKeyId',v_session.receipt_key_id,
      'customerKeyId',v_session.customer_key_id
    )
  );
  IF pg_catalog.pg_column_size(v_operation_result)>262144
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_V2_RECEIPT_TOO_LARGE'; END IF;
  INSERT INTO saas.storefront_checkout_operations(
    operation_id,store_id,cart_id,intent_id,order_id,payload_fingerprint,result_payload,committed_at
  ) VALUES(
    v_session.payment_attempt_id,v_session.store_id,v_session.cart_id,v_session.intent_id,
    v_session.order_id,v_session.commerce_authority_digest,v_operation_result,NEW.updated_at
  );

  UPDATE saas.checkout_inventory_reservations SET status='consumed',consumed_at=NEW.updated_at,
    version=version+1,updated_at=NEW.updated_at
  WHERE store_id=v_session.store_id AND storefront_hosted_session_id=v_session.id AND status='held';
  SELECT pg_catalog.count(*) INTO v_tracked_count
  FROM saas.checkout_inventory_reservations reservation
  WHERE reservation.store_id=v_session.store_id
    AND reservation.storefront_hosted_session_id=v_session.id AND reservation.stock_tracked;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','checkout_sale',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id',v_session.order_id::text,true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time',NEW.updated_at::text,true);
  UPDATE saas.product_variants variant SET
    stock_quantity=variant.stock_quantity-reservation.quantity,
    version=variant.version+1,updated_at=NEW.updated_at
  FROM saas.checkout_inventory_reservations reservation
  WHERE reservation.store_id=v_session.store_id
    AND reservation.storefront_hosted_session_id=v_session.id
    AND reservation.stock_tracked AND variant.store_id=reservation.store_id
    AND variant.id=reservation.variant_id
    AND variant.stock_quantity>=reservation.quantity;
  GET DIAGNOSTICS v_updated_count=ROW_COUNT;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  IF v_updated_count<>v_tracked_count
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_V2_STOCK_WRITE_CONFLICT'; END IF;
  IF v_session.cart_id IS NOT NULL THEN
    UPDATE saas.storefront_carts SET status='converted',version=version+1,updated_at=NEW.updated_at
    WHERE store_id=v_session.store_id AND id=v_session.cart_id
      AND status='active' AND version=v_session.source_version;
  ELSE
    UPDATE saas.storefront_checkout_intents SET status='converted'
    WHERE store_id=v_session.store_id AND id=v_session.intent_id AND status='active';
  END IF;
  UPDATE saas.storefront_hosted_checkout_sessions SET
    status='captured',safe_code=NEW.safe_code,terminal_at=NEW.updated_at,
    version=version+1,updated_at=NEW.updated_at
  WHERE store_id=v_session.store_id AND id=v_session.id;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS aa_storefront_hosted_checkout_promotion_terminal_v2 ON saas.payment_attempts;
DROP TRIGGER IF EXISTS zz_storefront_hosted_checkout_promotion_terminal_v2 ON saas.payment_attempts;
CREATE TRIGGER aa_storefront_hosted_checkout_promotion_terminal_v2
AFTER UPDATE OF status ON saas.payment_attempts
FOR EACH ROW EXECUTE FUNCTION saas.storefront_hosted_checkout_promotion_terminal_v2();

ALTER FUNCTION saas.storefront_hosted_checkout_promotion_codes_valid_v2(jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.storefront_hosted_checkout_customer_prepare_v2(uuid,timestamptz,jsonb,jsonb,uuid,boolean) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.storefront_hosted_checkout_authority_v2_projection(text,timestamptz,text,jsonb,bigint,jsonb,uuid,uuid,jsonb,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.public_storefront_hosted_checkout_authority_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.public_storefront_hosted_checkout_begin_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.storefront_hosted_checkout_promotion_release_v2(uuid,uuid,uuid,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.storefront_hosted_checkout_promotion_terminal_v2() OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.storefront_hosted_checkout_promotion_codes_valid_v2(jsonb),saas.storefront_hosted_checkout_customer_prepare_v2(uuid,timestamptz,jsonb,jsonb,uuid,boolean),saas.storefront_hosted_checkout_authority_v2_projection(text,timestamptz,text,jsonb,bigint,jsonb,uuid,uuid,jsonb,uuid),saas.storefront_hosted_checkout_promotion_release_v2(uuid,uuid,uuid,timestamptz),saas.storefront_hosted_checkout_promotion_terminal_v2()
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.public_storefront_hosted_checkout_authority_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid),saas.public_storefront_hosted_checkout_begin_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_storefront_hosted_checkout_authority_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid),saas.public_storefront_hosted_checkout_begin_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text)
TO celebix_saas_host_resolver;

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
ALTER FUNCTION saas.public_checkout_quote_v2(text,timestamptz,text,jsonb,jsonb,text[],jsonb) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.public_checkout_quote_v2(text,timestamptz,text,jsonb,jsonb,text[],jsonb)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_checkout_quote_v2(text,timestamptz,text,jsonb,jsonb,text[],jsonb)
TO celebix_saas_host_resolver;
ALTER FUNCTION saas.public_promotion_compiled_read_v1(text,timestamptz,text,text) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.public_promotion_compiled_read_v1(text,timestamptz,text,text)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_promotion_compiled_read_v1(text,timestamptz,text,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.promotion_storefront_origin_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.promotion_store_timezone_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,jsonb),saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb),saas.promotion_lifecycle_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),saas.promotion_duplicate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text[]),saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],integer),saas.promotion_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text[],text[],text[],text[],timestamptz,timestamptz,integer,timestamptz,timestamptz,uuid),saas.promotion_picker_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,integer,text,uuid),saas.promotion_picker_resolve_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[]),saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_simulate_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb,jsonb),saas.promotion_detail_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_conflicts_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb),saas.promotion_margin_check_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,jsonb),saas.promotion_margin_check_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb),saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,integer,text),saas.promotion_create_code_batch_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,integer,text,integer,integer,timestamptz),saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.promotion_code_batch_status_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),saas.promotion_code_batch_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,integer,timestamptz,timestamptz,uuid),saas.promotion_codes_csv_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_analytics_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.promotion_analytics_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,integer),saas.promotion_overview_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer),saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.promotion_legacy_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer,timestamptz,timestamptz,uuid),saas.promotion_legacy_resolve_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.promotion_recover_operation_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.promotion_expire_due_reservations_v1(timestamptz,integer) TO celebix_saas_workflow;
COMMIT;
