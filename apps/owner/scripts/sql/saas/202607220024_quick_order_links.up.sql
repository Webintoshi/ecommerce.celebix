-- Phase 3B2 additive store-scoped quick-order link schema.
-- This migration is authorized only for isolated disposable PostgreSQL 16 rehearsal.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.quick_link_address_is_valid(candidate jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  address_key text;
  address_value jsonb;
  text_value text;
BEGIN
  IF pg_catalog.jsonb_typeof(candidate) <> 'object'
     OR pg_catalog.pg_column_size(candidate) > 4096
     OR NOT candidate ?& ARRAY['recipientName','phone','line1','city','country']
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.jsonb_object_keys(candidate) AS supplied_key(value)
       WHERE supplied_key.value <> ALL (ARRAY[
         'recipientName','phone','line1','line2','district','city','postalCode','country'
       ])
     ) THEN
    RETURN false;
  END IF;

  FOR address_key, address_value IN
    SELECT entry.key, entry.value
    FROM pg_catalog.jsonb_each(candidate) AS entry(key, value)
  LOOP
    IF pg_catalog.jsonb_typeof(address_value) <> 'string' THEN
      RETURN false;
    END IF;
    text_value := address_value #>> '{}';
    IF text_value <> pg_catalog.btrim(text_value) OR text_value ~ '[[:cntrl:]]' THEN
      RETURN false;
    END IF;
    IF (address_key = 'recipientName' AND pg_catalog.char_length(text_value) NOT BETWEEN 1 AND 200)
       OR (address_key = 'phone' AND pg_catalog.char_length(text_value) NOT BETWEEN 3 AND 32)
       OR (address_key IN ('line1','line2') AND pg_catalog.char_length(text_value) NOT BETWEEN 1 AND 300)
       OR (address_key IN ('district','city') AND pg_catalog.char_length(text_value) NOT BETWEEN 1 AND 200)
       OR (address_key = 'postalCode' AND pg_catalog.char_length(text_value) NOT BETWEEN 1 AND 32)
       OR (address_key = 'country' AND text_value !~ '^[A-Z]{2}$') THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END
$function$;

CREATE FUNCTION saas.quick_link_base64url_is_canonical(candidate text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  standard_alphabet text;
  padded text;
  decoded bytea;
  canonical text;
BEGIN
  IF candidate = ''
     OR candidate !~ '^[A-Za-z0-9_-]+$'
     OR pg_catalog.char_length(candidate) % 4 = 1 THEN
    RETURN false;
  END IF;

  standard_alphabet := pg_catalog.translate(candidate, '-_', '+/');
  padded := standard_alphabet || pg_catalog.repeat(
    '=',
    (4 - pg_catalog.char_length(standard_alphabet) % 4) % 4
  );
  decoded := pg_catalog.decode(padded, 'base64');
  canonical := pg_catalog.translate(
    pg_catalog.encode(decoded, 'base64'),
    E'+/=\n\r',
    '-_'
  );
  RETURN canonical = candidate;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END
$function$;

CREATE FUNCTION saas.quick_link_timestamp_is_canonical(candidate text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  parsed timestamptz;
  normalized text;
BEGIN
  IF candidate !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.(?:[0-9]{3}|[0-9]{6})Z$' THEN
    RETURN false;
  END IF;
  parsed := candidate::timestamptz;
  normalized := CASE pg_catalog.char_length(candidate)
    WHEN 24 THEN pg_catalog.left(candidate, 23) || '000Z'
    WHEN 27 THEN candidate
    ELSE NULL
  END;
  RETURN pg_catalog.to_char(
    parsed AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  ) = normalized;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END
$function$;

CREATE FUNCTION saas.quick_link_sealed_envelope_is_valid(candidate jsonb, expected_key_id text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_typeof(candidate) = 'object'
    AND pg_catalog.pg_column_size(candidate) <= 12288
    AND candidate ?& ARRAY['algorithm','ciphertext','iv','keyId','tag','version']
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_object_keys(candidate) AS supplied_key(value)
      WHERE supplied_key.value <> ALL (ARRAY['algorithm','ciphertext','iv','keyId','tag','version'])
    )
    AND pg_catalog.jsonb_typeof(candidate->'algorithm') = 'string'
    AND pg_catalog.jsonb_typeof(candidate->'ciphertext') = 'string'
    AND pg_catalog.jsonb_typeof(candidate->'iv') = 'string'
    AND pg_catalog.jsonb_typeof(candidate->'keyId') = 'string'
    AND pg_catalog.jsonb_typeof(candidate->'tag') = 'string'
    AND pg_catalog.jsonb_typeof(candidate->'version') = 'number'
    AND candidate->>'algorithm' = 'A256GCM'
    AND candidate->'version' = '1'::jsonb
    AND candidate->>'keyId' = expected_key_id
    AND candidate->>'keyId' = pg_catalog.btrim(candidate->>'keyId')
    AND pg_catalog.char_length(candidate->>'keyId') BETWEEN 1 AND 128
    AND candidate->>'keyId' !~ '[[:cntrl:]]'
    AND candidate->>'iv' ~ '^[A-Za-z0-9_-]{16}$'
    AND candidate->>'tag' ~ '^[A-Za-z0-9_-]{22}$'
    AND pg_catalog.char_length(candidate->>'ciphertext') BETWEEN 1 AND 8192
    AND saas.quick_link_base64url_is_canonical(candidate->>'iv')
    AND saas.quick_link_base64url_is_canonical(candidate->>'tag')
    AND saas.quick_link_base64url_is_canonical(candidate->>'ciphertext');
$function$;

REVOKE ALL ON FUNCTION saas.quick_link_address_is_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_link_base64url_is_canonical(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_link_timestamp_is_canonical(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_link_sealed_envelope_is_valid(jsonb,text) FROM PUBLIC;

CREATE FUNCTION saas.quick_link_canonical_image_url(
  p_store_id uuid,
  p_product_id uuid,
  p_variant_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
  SELECT media.public_url
  FROM saas.product_media AS media
  WHERE media.store_id = p_store_id
    AND media.product_id = p_product_id
    AND media.status = 'active'
    AND (media.variant_id = p_variant_id OR media.variant_id IS NULL)
  ORDER BY (media.variant_id = p_variant_id) DESC NULLS LAST, media.sort_order ASC, media.id ASC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION saas.quick_link_canonical_image_url(uuid,uuid,uuid) FROM PUBLIC;

CREATE FUNCTION saas.quick_link_operation_result_is_valid(candidate jsonb, expected_link_id uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_typeof(candidate) = 'object'
    AND pg_catalog.pg_column_size(candidate) <= 32768
    AND candidate ?& ARRAY['id','status','version','expiresAt','updatedAt']
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_object_keys(candidate) AS supplied_key(value)
      WHERE supplied_key.value <> ALL (ARRAY['id','status','version','expiresAt','updatedAt'])
    )
    AND pg_catalog.jsonb_typeof(candidate->'id') = 'string'
    AND candidate->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND candidate->>'id' = expected_link_id::text
    AND pg_catalog.jsonb_typeof(candidate->'status') = 'string'
    AND candidate->>'status' IN ('active','opened','paid','cancelled','expired')
    AND pg_catalog.jsonb_typeof(candidate->'version') = 'number'
    AND candidate->>'version' ~ '^[1-9][0-9]{0,18}$'
    AND (
      pg_catalog.char_length(candidate->>'version') < 19
      OR candidate->>'version' <= '9223372036854775807'
    )
    AND pg_catalog.jsonb_typeof(candidate->'expiresAt') = 'string'
    AND saas.quick_link_timestamp_is_canonical(candidate->>'expiresAt')
    AND pg_catalog.jsonb_typeof(candidate->'updatedAt') = 'string'
    AND saas.quick_link_timestamp_is_canonical(candidate->>'updatedAt');
$function$;

REVOKE ALL ON FUNCTION saas.quick_link_operation_result_is_valid(jsonb,uuid) FROM PUBLIC;

CREATE TABLE saas.checkout_provider_configs (
  id uuid CONSTRAINT checkout_provider_configs_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  provider_key text NOT NULL CONSTRAINT checkout_provider_configs_provider_key_check CHECK (
    provider_key = 'paytr'
    AND provider_key = btrim(provider_key)
    AND char_length(provider_key) BETWEEN 1 AND 32
    AND provider_key !~ '[[:cntrl:]]'
  ),
  status text NOT NULL CONSTRAINT checkout_provider_configs_status_check CHECK (
    status IN ('active','disabled','revoked')
    AND status = btrim(status)
    AND char_length(status) BETWEEN 1 AND 16
    AND status !~ '[[:cntrl:]]'
  ),
  public_origin text NOT NULL CONSTRAINT checkout_provider_configs_public_origin_check CHECK (
    public_origin = 'https://www.paytr.com'
    AND public_origin = btrim(public_origin)
    AND char_length(public_origin) BETWEEN 1 AND 2048
    AND public_origin !~ '[[:cntrl:]]'
  ),
  configuration_key_id text NOT NULL CONSTRAINT checkout_provider_configs_key_id_check CHECK (
    configuration_key_id = btrim(configuration_key_id)
    AND char_length(configuration_key_id) BETWEEN 1 AND 128
    AND configuration_key_id !~ '[[:cntrl:]]'
  ),
  sealed_configuration jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1 CONSTRAINT checkout_provider_configs_version_check CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT checkout_provider_configs_sealed_check CHECK (
    saas.quick_link_sealed_envelope_is_valid(sealed_configuration, configuration_key_id)
  ),
  CONSTRAINT checkout_provider_configs_timestamp_check CHECK (updated_at >= created_at),
  CONSTRAINT checkout_provider_configs_store_id_key UNIQUE (store_id, id),
  CONSTRAINT checkout_provider_configs_store_provider_key UNIQUE (store_id, provider_key),
  CONSTRAINT checkout_provider_configs_store_fk FOREIGN KEY (store_id)
    REFERENCES saas.stores(id)
);

ALTER TABLE saas.product_variants
  ADD CONSTRAINT product_variants_store_product_id_key UNIQUE (store_id, product_id, id);

CREATE TABLE saas.quick_order_links (
  id uuid CONSTRAINT quick_order_links_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  creating_membership_id uuid NOT NULL,
  provider_config_id uuid NOT NULL,
  status text NOT NULL CONSTRAINT quick_order_links_status_check CHECK (
    status IN ('active','opened','paid','cancelled','expired')
    AND status = btrim(status)
    AND char_length(status) BETWEEN 1 AND 16
    AND status !~ '[[:cntrl:]]'
  ),
  token_digest char(64) NOT NULL CONSTRAINT quick_order_links_token_digest_key UNIQUE
    CONSTRAINT quick_order_links_token_digest_check CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  token_key_id text NOT NULL CONSTRAINT quick_order_links_token_key_id_check CHECK (
    token_key_id = btrim(token_key_id)
    AND char_length(token_key_id) BETWEEN 1 AND 128
    AND token_key_id !~ '[[:cntrl:]]'
  ),
  sealed_token jsonb NOT NULL,
  customer_name text NOT NULL CONSTRAINT quick_order_links_customer_name_check CHECK (
    customer_name = btrim(customer_name)
    AND char_length(customer_name) BETWEEN 1 AND 200
    AND customer_name !~ '[[:cntrl:]]'
  ),
  customer_email text NOT NULL CONSTRAINT quick_order_links_customer_email_check CHECK (
    customer_email = btrim(customer_email)
    AND char_length(customer_email) BETWEEN 3 AND 320
    AND customer_email !~ '[[:cntrl:]]'
    AND customer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  customer_phone text CONSTRAINT quick_order_links_customer_phone_check CHECK (
    customer_phone IS NULL
    OR (
      customer_phone = btrim(customer_phone)
      AND char_length(customer_phone) BETWEEN 3 AND 32
      AND customer_phone !~ '[[:cntrl:]]'
    )
  ),
  shipping_address jsonb NOT NULL CONSTRAINT quick_order_links_shipping_address_check CHECK (
    saas.quick_link_address_is_valid(shipping_address)
  ),
  billing_address jsonb NOT NULL CONSTRAINT quick_order_links_billing_address_check CHECK (
    saas.quick_link_address_is_valid(billing_address)
  ),
  customer_note text CONSTRAINT quick_order_links_customer_note_check CHECK (
    customer_note IS NULL
    OR (
      customer_note = btrim(customer_note)
      AND char_length(customer_note) BETWEEN 1 AND 2000
      AND customer_note !~ '[[:cntrl:]]'
    )
  ),
  internal_label text CONSTRAINT quick_order_links_internal_label_check CHECK (
    internal_label IS NULL
    OR (
      internal_label = btrim(internal_label)
      AND char_length(internal_label) BETWEEN 1 AND 200
      AND internal_label !~ '[[:cntrl:]]'
    )
  ),
  currency text NOT NULL CONSTRAINT quick_order_links_currency_check CHECK (
    currency = btrim(currency)
    AND char_length(currency) = 3
    AND currency ~ '^[A-Z]{3}$'
    AND currency !~ '[[:cntrl:]]'
  ),
  subtotal_cents bigint NOT NULL CONSTRAINT quick_order_links_subtotal_cents_check CHECK (subtotal_cents >= 0),
  shipping_cents bigint NOT NULL CONSTRAINT quick_order_links_shipping_cents_check CHECK (shipping_cents >= 0),
  discount_cents bigint NOT NULL CONSTRAINT quick_order_links_discount_cents_check CHECK (discount_cents >= 0),
  total_cents bigint NOT NULL CONSTRAINT quick_order_links_total_cents_check CHECK (
    subtotal_cents BETWEEN 0 AND 7999200000000000
    AND shipping_cents BETWEEN 0 AND 500000000000000
    AND discount_cents BETWEEN 0 AND 500000000000000
    AND total_cents::numeric = subtotal_cents::numeric + shipping_cents::numeric - discount_cents::numeric
    AND total_cents BETWEEN 0 AND 8500000000000000
  ),
  expires_at timestamptz NOT NULL,
  opened_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  order_id uuid,
  version bigint NOT NULL DEFAULT 1 CONSTRAINT quick_order_links_version_check CHECK (version > 0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT quick_order_links_sealed_token_check CHECK (
    saas.quick_link_sealed_envelope_is_valid(sealed_token, token_key_id)
  ),
  CONSTRAINT quick_order_links_expiry_check CHECK (
    expires_at - created_at IN (
      interval '4 hours', interval '12 hours', interval '24 hours', interval '48 hours', interval '72 hours'
    )
  ),
  CONSTRAINT quick_order_links_timestamp_check CHECK (
    updated_at >= created_at
    AND updated_at >= COALESCE(opened_at, created_at)
    AND updated_at >= COALESCE(paid_at, created_at)
    AND updated_at >= COALESCE(cancelled_at, created_at)
  ),
  CONSTRAINT quick_order_links_lifecycle_check CHECK (
    (status = 'active' AND opened_at IS NULL AND paid_at IS NULL AND cancelled_at IS NULL AND order_id IS NULL)
    OR (status = 'opened' AND opened_at IS NOT NULL AND opened_at >= created_at AND paid_at IS NULL AND cancelled_at IS NULL AND order_id IS NULL)
    OR (status = 'paid' AND opened_at IS NOT NULL AND paid_at IS NOT NULL AND paid_at >= opened_at AND cancelled_at IS NULL AND order_id IS NOT NULL)
    OR (status = 'cancelled' AND paid_at IS NULL AND cancelled_at IS NOT NULL AND cancelled_at >= created_at AND order_id IS NULL)
    OR (status = 'expired' AND paid_at IS NULL AND cancelled_at IS NULL AND order_id IS NULL)
  ),
  CONSTRAINT quick_order_links_store_id_key UNIQUE (store_id, id),
  CONSTRAINT quick_order_links_store_currency_fk FOREIGN KEY (store_id, currency)
    REFERENCES saas.stores(id, currency),
  CONSTRAINT quick_order_links_creator_store_fk FOREIGN KEY (store_id, creating_membership_id)
    REFERENCES saas.memberships(store_id, id),
  CONSTRAINT quick_order_links_provider_store_fk FOREIGN KEY (store_id, provider_config_id)
    REFERENCES saas.checkout_provider_configs(store_id, id),
  CONSTRAINT quick_order_links_order_store_fk FOREIGN KEY (store_id, order_id)
    REFERENCES saas.orders(store_id, id)
);

CREATE FUNCTION saas.guard_quick_link_provider_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM saas.stores AS store
    JOIN saas.checkout_provider_configs AS provider
      ON provider.store_id = store.id
     AND provider.id = NEW.provider_config_id
    WHERE store.id = NEW.store_id
      AND store.status = 'active'
      AND provider.status = 'active'
      AND provider.provider_key = 'paytr'
  ) THEN
    RAISE EXCEPTION 'QUICK_LINK_PROVIDER_NOT_READY';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER quick_order_links_provider_authority
BEFORE INSERT OR UPDATE OF store_id, provider_config_id ON saas.quick_order_links
FOR EACH ROW EXECUTE FUNCTION saas.guard_quick_link_provider_authority();

CREATE TABLE saas.quick_order_link_items (
  id uuid CONSTRAINT quick_order_link_items_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  quick_order_link_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  position integer NOT NULL CONSTRAINT quick_order_link_items_position_check CHECK (position BETWEEN 0 AND 99),
  product_name text NOT NULL CONSTRAINT quick_order_link_items_product_name_check CHECK (
    product_name = btrim(product_name)
    AND char_length(product_name) BETWEEN 1 AND 200
    AND product_name !~ '[[:cntrl:]]'
  ),
  variant_name text CONSTRAINT quick_order_link_items_variant_name_check CHECK (
    variant_name IS NULL
    OR (
      variant_name = btrim(variant_name)
      AND char_length(variant_name) BETWEEN 1 AND 200
      AND variant_name !~ '[[:cntrl:]]'
    )
  ),
  sku text CONSTRAINT quick_order_link_items_sku_check CHECK (
    sku IS NULL
    OR (
      sku = btrim(sku)
      AND char_length(sku) BETWEEN 1 AND 128
      AND sku !~ '[[:cntrl:]]'
    )
  ),
  image_url text CONSTRAINT quick_order_link_items_image_url_check CHECK (
    image_url IS NULL
    OR (
      image_url = btrim(image_url)
      AND char_length(image_url) BETWEEN 1 AND 2048
      AND image_url ~ '^https://[^/?#[:space:][:cntrl:]]+/'
      AND image_url !~ '[#[:space:][:cntrl:]]'
    )
  ),
  unit_price_cents bigint NOT NULL CONSTRAINT quick_order_link_items_unit_price_check CHECK (
    unit_price_cents BETWEEN 0 AND 8000000000
  ),
  quantity integer NOT NULL CONSTRAINT quick_order_link_items_quantity_check CHECK (quantity BETWEEN 1 AND 9999),
  line_total_cents bigint NOT NULL CONSTRAINT quick_order_link_items_line_total_check CHECK (
    line_total_cents::numeric = unit_price_cents::numeric * quantity::numeric
    AND line_total_cents BETWEEN 0 AND 79992000000000
  ),
  created_at timestamptz NOT NULL,
  CONSTRAINT quick_order_link_items_store_id_key UNIQUE (store_id, id),
  CONSTRAINT quick_order_link_items_link_position_key UNIQUE (store_id, quick_order_link_id, position),
  CONSTRAINT quick_order_link_items_link_store_fk FOREIGN KEY (store_id, quick_order_link_id)
    REFERENCES saas.quick_order_links(store_id, id),
  CONSTRAINT quick_order_link_items_variant_product_store_fk FOREIGN KEY (store_id, product_id, variant_id)
    REFERENCES saas.product_variants(store_id, product_id, id)
);

CREATE TABLE saas.quick_order_link_operations (
  operation_id uuid CONSTRAINT quick_order_link_operations_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  quick_order_link_id uuid NOT NULL,
  operation_kind text NOT NULL CONSTRAINT quick_order_link_operations_kind_check CHECK (
    operation_kind IN ('create','cancel','duplicate')
    AND operation_kind = btrim(operation_kind)
    AND char_length(operation_kind) BETWEEN 1 AND 16
    AND operation_kind !~ '[[:cntrl:]]'
  ),
  payload_fingerprint char(64) NOT NULL CONSTRAINT quick_order_link_operations_fingerprint_check CHECK (
    payload_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  result_payload jsonb NOT NULL CONSTRAINT quick_order_link_operations_result_payload_check CHECK (
    saas.quick_link_operation_result_is_valid(result_payload, quick_order_link_id)
  ),
  committed_at timestamptz NOT NULL,
  CONSTRAINT quick_order_link_operations_store_id_key UNIQUE (store_id, operation_id),
  CONSTRAINT quick_order_link_operations_link_store_fk FOREIGN KEY (store_id, quick_order_link_id)
    REFERENCES saas.quick_order_links(store_id, id)
);

CREATE INDEX checkout_provider_configs_store_status_idx
  ON saas.checkout_provider_configs (store_id, status, provider_key, id);
CREATE INDEX quick_order_links_store_status_expiry_idx
  ON saas.quick_order_links (store_id, status, expires_at, created_at DESC, id DESC);
CREATE INDEX quick_order_links_token_digest_idx
  ON saas.quick_order_links (token_digest);
CREATE INDEX quick_order_link_items_link_position_idx
  ON saas.quick_order_link_items (store_id, quick_order_link_id, position);
CREATE INDEX quick_order_link_operations_store_committed_idx
  ON saas.quick_order_link_operations (store_id, committed_at DESC, operation_id);

CREATE FUNCTION saas.guard_quick_link_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $function$
BEGIN
  RAISE EXCEPTION 'QUICK_LINK_OPERATION_IMMUTABLE';
END
$function$;

CREATE TRIGGER quick_order_link_operations_immutable
BEFORE UPDATE OR DELETE ON saas.quick_order_link_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_quick_link_operation_mutation();

CREATE FUNCTION saas.quick_link_merchant_authority_error(
  p_store_id uuid,
  p_principal_id uuid,
  p_membership_id uuid,
  p_plan_id uuid,
  p_plan_code text,
  p_plan_version bigint,
  p_now timestamptz,
  p_required_action text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $function$
DECLARE
  mapped_action text;
  authority_error text;
BEGIN
  IF p_store_id IS NULL
     OR p_principal_id IS NULL
     OR p_membership_id IS NULL
     OR p_plan_id IS NULL
     OR p_plan_code IS NULL
     OR p_plan_version IS NULL
     OR p_now IS NULL
     OR p_required_action IS NULL
     OR p_required_action NOT IN ('quick_links.read','quick_links.manage') THEN
    RETURN 'durable_authority_invalid';
  END IF;

  mapped_action := CASE p_required_action
    WHEN 'quick_links.read' THEN 'orders.read'
    WHEN 'quick_links.manage' THEN 'orders.manage'
  END;

  authority_error := saas.merchant_action_authority_error(
    p_store_id,
    p_principal_id,
    p_membership_id,
    p_plan_id,
    p_plan_code,
    p_plan_version,
    p_now,
    'orders',
    mapped_action
  );
  IF authority_error IS NOT NULL THEN
    RETURN authority_error;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT feature.feature_key
      FROM saas.plan_features AS feature
      WHERE feature.plan_id = p_plan_id
        AND feature.enabled
      ORDER BY feature.feature_ordinal
    ) AS enabled_feature
    WHERE enabled_feature.feature_key = 'checkout'
  ) THEN
    RETURN 'feature_not_enabled';
  END IF;

  RETURN NULL;
END
$function$;

ALTER TABLE saas.checkout_provider_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_provider_configs FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.quick_order_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.quick_order_links FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.quick_order_link_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.quick_order_link_items FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.quick_order_link_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.quick_order_link_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.checkout_provider_configs FROM PUBLIC, celebix_saas_app;
REVOKE ALL ON saas.quick_order_links FROM PUBLIC, celebix_saas_app;
REVOKE ALL ON saas.quick_order_link_items FROM PUBLIC, celebix_saas_app;
REVOKE ALL ON saas.quick_order_link_operations FROM PUBLIC, celebix_saas_app;
REVOKE ALL ON FUNCTION saas.guard_quick_link_provider_authority() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_quick_link_operation_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_link_merchant_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) FROM PUBLIC;

COMMIT;
