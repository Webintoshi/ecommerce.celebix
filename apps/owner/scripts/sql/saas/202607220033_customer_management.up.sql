-- Phase 3C1 additive store-scoped customer management persistence.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.customer_text_has_control(p_value text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
  SELECT EXISTS(SELECT 1 FROM pg_catalog.regexp_split_to_table(p_value,'') ch WHERE pg_catalog.ascii(ch)<32 OR pg_catalog.ascii(ch)=127)
$f$;

CREATE TABLE saas.customers (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active','archived')),
  first_name text NOT NULL CHECK (first_name=pg_catalog.btrim(first_name) AND pg_catalog.char_length(first_name) BETWEEN 1 AND 100 AND NOT saas.customer_text_has_control(first_name)),
  last_name text NOT NULL CHECK (last_name=pg_catalog.btrim(last_name) AND pg_catalog.char_length(last_name) BETWEEN 1 AND 100 AND NOT saas.customer_text_has_control(last_name)),
  email text CHECK (email IS NULL OR (email=pg_catalog.lower(email) AND email=pg_catalog.btrim(email) AND pg_catalog.char_length(email) BETWEEN 3 AND 320 AND email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  phone text CHECK (phone IS NULL OR phone~'^\+[1-9][0-9]{7,14}$'),
  version bigint NOT NULL DEFAULT 1 CHECK (version>0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT customers_store_id_id_key UNIQUE(store_id,id),
  CONSTRAINT customers_store_email_key UNIQUE(store_id,email),
  CONSTRAINT customers_store_phone_key UNIQUE(store_id,phone),
  CONSTRAINT customers_store_fk FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT customers_lifecycle_check CHECK ((status='active' AND archived_at IS NULL) OR (status='archived' AND archived_at IS NOT NULL AND archived_at>=created_at)),
  CONSTRAINT customers_time_check CHECK (updated_at>=created_at)
);

CREATE TABLE saas.customer_addresses (
  id uuid PRIMARY KEY, store_id uuid NOT NULL, customer_id uuid NOT NULL,
  label text NOT NULL CHECK (label=pg_catalog.btrim(label) AND pg_catalog.char_length(label) BETWEEN 1 AND 50 AND NOT saas.customer_text_has_control(label)),
  recipient_name text NOT NULL CHECK (recipient_name=pg_catalog.btrim(recipient_name) AND pg_catalog.char_length(recipient_name) BETWEEN 1 AND 200 AND NOT saas.customer_text_has_control(recipient_name)),
  line1 text NOT NULL CHECK (line1=pg_catalog.btrim(line1) AND pg_catalog.char_length(line1) BETWEEN 1 AND 300 AND NOT saas.customer_text_has_control(line1)),
  line2 text CHECK (line2 IS NULL OR (line2=pg_catalog.btrim(line2) AND pg_catalog.char_length(line2) BETWEEN 1 AND 300 AND NOT saas.customer_text_has_control(line2))),
  city text NOT NULL CHECK (city=pg_catalog.btrim(city) AND pg_catalog.char_length(city) BETWEEN 1 AND 100 AND NOT saas.customer_text_has_control(city)),
  district text CHECK (district IS NULL OR (district=pg_catalog.btrim(district) AND pg_catalog.char_length(district) BETWEEN 1 AND 100 AND NOT saas.customer_text_has_control(district))),
  postal_code text CHECK (postal_code IS NULL OR (postal_code=pg_catalog.btrim(postal_code) AND pg_catalog.char_length(postal_code) BETWEEN 1 AND 20 AND NOT saas.customer_text_has_control(postal_code))),
  country char(2) NOT NULL CHECK (country~'^[A-Z]{2}$'), is_default boolean NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
  UNIQUE(store_id,id), UNIQUE(store_id,customer_id,id),
  FOREIGN KEY(store_id,customer_id) REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX customer_addresses_one_default_idx ON saas.customer_addresses(store_id,customer_id) WHERE is_default;

CREATE TABLE saas.customer_consents (
  store_id uuid NOT NULL, customer_id uuid NOT NULL, channel text NOT NULL CHECK(channel IN ('email','phone','whatsapp')),
  status text NOT NULL CHECK(status IN ('granted','denied')), recorded_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,customer_id,channel), FOREIGN KEY(store_id,customer_id) REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.customer_notes (
  id uuid PRIMARY KEY, store_id uuid NOT NULL, customer_id uuid NOT NULL, author_membership_id uuid NOT NULL,
  note_text text NOT NULL CHECK(note_text=pg_catalog.btrim(note_text) AND pg_catalog.char_length(note_text) BETWEEN 1 AND 2000 AND NOT saas.customer_text_has_control(note_text)),
  archived_at timestamptz, created_at timestamptz NOT NULL, UNIQUE(store_id,id),
  FOREIGN KEY(store_id,customer_id) REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,author_membership_id) REFERENCES saas.memberships(store_id,id) ON DELETE RESTRICT,
  CHECK(archived_at IS NULL OR archived_at>=created_at)
);

CREATE TABLE saas.customer_tags (
  id uuid PRIMARY KEY, store_id uuid NOT NULL, name text NOT NULL CHECK(name=pg_catalog.btrim(name) AND pg_catalog.char_length(name) BETWEEN 1 AND 64 AND NOT saas.customer_text_has_control(name)),
  color char(7) NOT NULL CHECK(color~'^#[0-9a-f]{6}$'), version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  archived_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
  UNIQUE(store_id,id), FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX customer_tags_store_name_idx ON saas.customer_tags(store_id,pg_catalog.lower(name)) WHERE archived_at IS NULL;

CREATE TABLE saas.customer_tag_assignments (
  store_id uuid NOT NULL, customer_id uuid NOT NULL, tag_id uuid NOT NULL, assigned_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,customer_id,tag_id), FOREIGN KEY(store_id,customer_id) REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,tag_id) REFERENCES saas.customer_tags(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.customer_segments (
  id uuid PRIMARY KEY, store_id uuid NOT NULL, name text NOT NULL CHECK(name=pg_catalog.btrim(name) AND pg_catalog.char_length(name) BETWEEN 1 AND 100 AND NOT saas.customer_text_has_control(name)),
  description text CHECK(description IS NULL OR (description=pg_catalog.btrim(description) AND pg_catalog.char_length(description) BETWEEN 1 AND 500 AND NOT saas.customer_text_has_control(description))),
  segment_kind text NOT NULL DEFAULT 'manual' CHECK(segment_kind='manual'), version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  archived_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
  UNIQUE(store_id,id), FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX customer_segments_store_name_idx ON saas.customer_segments(store_id,pg_catalog.lower(name)) WHERE archived_at IS NULL;

CREATE TABLE saas.customer_segment_memberships (
  store_id uuid NOT NULL, customer_id uuid NOT NULL, segment_id uuid NOT NULL, assigned_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,customer_id,segment_id), FOREIGN KEY(store_id,customer_id) REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,segment_id) REFERENCES saas.customer_segments(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.customer_operations (
  operation_id uuid PRIMARY KEY, store_id uuid NOT NULL, customer_id uuid NOT NULL, operation_kind text NOT NULL CHECK(operation_kind IN ('create','update','archive','add_note','set_tags','set_segments','upsert_tag','upsert_segment')),
  payload_fingerprint char(64) NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'), result_payload jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=32768),
  committed_at timestamptz NOT NULL, UNIQUE(store_id,operation_id),
  FOREIGN KEY(store_id,customer_id) REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT
);

ALTER TABLE saas.orders ADD COLUMN customer_id uuid;
ALTER TABLE saas.orders ADD CONSTRAINT orders_customer_store_fk FOREIGN KEY(store_id,customer_id) REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT;
CREATE INDEX orders_store_customer_created_idx ON saas.orders(store_id,customer_id,created_at DESC,id DESC) WHERE customer_id IS NOT NULL;

CREATE INDEX customers_store_updated_idx ON saas.customers(store_id,updated_at DESC,id DESC);
CREATE INDEX customer_notes_customer_idx ON saas.customer_notes(store_id,customer_id,created_at DESC,id DESC) WHERE archived_at IS NULL;
CREATE INDEX customer_tag_assignments_tag_idx ON saas.customer_tag_assignments(store_id,tag_id,customer_id);
CREATE INDEX customer_segment_memberships_segment_idx ON saas.customer_segment_memberships(store_id,segment_id,customer_id);

CREATE FUNCTION saas.guard_customer_operation_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$ BEGIN RAISE EXCEPTION 'CUSTOMER_OPERATION_IMMUTABLE'; END $f$;
CREATE TRIGGER customer_operations_immutable BEFORE UPDATE OR DELETE ON saas.customer_operations FOR EACH ROW EXECUTE FUNCTION saas.guard_customer_operation_mutation();

DO $f$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['customers','customer_addresses','customer_consents','customer_notes','customer_tags','customer_tag_assignments','customer_segments','customer_segment_memberships','customer_operations'] LOOP EXECUTE pg_catalog.format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',table_name); EXECUTE pg_catalog.format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',table_name); EXECUTE pg_catalog.format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver',table_name); END LOOP; END $f$;
REVOKE ALL ON FUNCTION saas.guard_customer_operation_mutation(),saas.customer_text_has_control(text) FROM PUBLIC;
COMMIT;
