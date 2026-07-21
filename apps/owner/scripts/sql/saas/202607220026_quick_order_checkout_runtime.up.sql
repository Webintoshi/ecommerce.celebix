-- Phase 3B2 additive quick-order checkout persistence and concurrency guards.
-- This migration is authorized only for isolated PostgreSQL 16 rehearsal.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
  IF EXISTS (SELECT 1 FROM saas.orders WHERE source = 'quick_link') THEN
    RAISE EXCEPTION 'QUICK_ORDER_RUNTIME_HISTORICAL_QUICK_LINK_ORDER_UNBOUND';
  END IF;
END
$precondition$;

ALTER TABLE saas.checkout_provider_configs
  ADD COLUMN configuration_digest char(64),
  ADD CONSTRAINT checkout_provider_configs_configuration_digest_check CHECK (
    configuration_digest IS NULL OR configuration_digest ~ '^[a-f0-9]{64}$'
  );

ALTER TABLE saas.checkout_provider_configs
  DROP CONSTRAINT checkout_provider_configs_store_provider_key;

CREATE UNIQUE INDEX checkout_provider_configs_store_provider_active_key
  ON saas.checkout_provider_configs (store_id, provider_key)
  WHERE status <> 'revoked';

ALTER TABLE saas.quick_order_links
  ADD CONSTRAINT quick_order_links_store_id_currency_runtime_key UNIQUE (store_id, id, currency),
  ADD CONSTRAINT quick_order_links_store_id_provider_currency_runtime_key UNIQUE (store_id, id, provider_config_id, currency);

ALTER TABLE saas.orders
  ADD COLUMN quick_order_link_id uuid,
  ADD COLUMN billing_address jsonb,
  ADD CONSTRAINT orders_quick_link_source_check CHECK (
    (source = 'quick_link') = (quick_order_link_id IS NOT NULL)
    AND (source <> 'quick_link' OR currency = 'TRY')
  ),
  ADD CONSTRAINT orders_quick_link_store_fk FOREIGN KEY (store_id, quick_order_link_id)
    REFERENCES saas.quick_order_links(store_id, id),
  ADD CONSTRAINT orders_quick_link_currency_store_fk FOREIGN KEY (store_id, quick_order_link_id, currency)
    REFERENCES saas.quick_order_links(store_id, id, currency),
  ADD CONSTRAINT orders_store_id_quick_link_id_runtime_key UNIQUE (store_id, id, quick_order_link_id);

CREATE UNIQUE INDEX orders_store_quick_order_link_key
  ON saas.orders (store_id, quick_order_link_id)
  WHERE quick_order_link_id IS NOT NULL;

CREATE TABLE saas.quick_order_redemption_sessions (
  id uuid CONSTRAINT quick_order_redemption_sessions_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  quick_order_link_id uuid NOT NULL,
  cookie_digest char(64) NOT NULL CONSTRAINT quick_order_redemption_sessions_cookie_digest_key UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT quick_order_redemption_sessions_id_check CHECK (
    id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT quick_order_redemption_sessions_digest_check CHECK (cookie_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT quick_order_redemption_sessions_version_check CHECK (version BETWEEN 1 AND 9007199254740991),
  CONSTRAINT quick_order_redemption_sessions_time_check CHECK (
    pg_catalog.isfinite(expires_at) AND pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at)
    AND (consumed_at IS NULL OR pg_catalog.isfinite(consumed_at))
    AND (revoked_at IS NULL OR pg_catalog.isfinite(revoked_at))
    AND expires_at > created_at AND updated_at >= created_at
    AND (consumed_at IS NULL OR consumed_at BETWEEN created_at AND updated_at)
    AND (revoked_at IS NULL OR revoked_at BETWEEN created_at AND updated_at)
    AND NOT (consumed_at IS NOT NULL AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT quick_order_redemption_sessions_store_id_key UNIQUE (store_id, id),
  CONSTRAINT quick_order_redemption_sessions_store_id_link_key UNIQUE (store_id, id, quick_order_link_id),
  CONSTRAINT quick_order_redemption_sessions_link_store_fk FOREIGN KEY (store_id, quick_order_link_id)
    REFERENCES saas.quick_order_links(store_id, id)
);

CREATE TABLE saas.checkout_payment_attempts (
  id uuid CONSTRAINT checkout_payment_attempts_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  quick_order_link_id uuid NOT NULL,
  redemption_session_id uuid NOT NULL,
  provider_config_id uuid NOT NULL,
  provider_config_version bigint NOT NULL,
  configuration_digest char(64) NOT NULL,
  configuration_key_id text NOT NULL,
  sealed_configuration jsonb NOT NULL,
  merchant_oid char(32) NOT NULL CONSTRAINT checkout_payment_attempts_merchant_oid_key UNIQUE,
  expected_subtotal_cents bigint NOT NULL,
  expected_shipping_cents bigint NOT NULL,
  expected_discount_cents bigint NOT NULL,
  expected_payment_amount bigint NOT NULL,
  currency text NOT NULL,
  status text NOT NULL,
  provider_token_digest char(64),
  provider_token_key_id text,
  sealed_provider_token jsonb,
  hold_expires_at timestamptz NOT NULL,
  provider_ready_at timestamptz,
  initiation_unknown_at timestamptz,
  succeeded_at timestamptz,
  failed_at timestamptz,
  expired_at timestamptz,
  settled_order_id uuid,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT checkout_payment_attempts_id_check CHECK (
    id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT checkout_payment_attempts_merchant_oid_check CHECK (merchant_oid ~ '^[a-f0-9]{32}$'),
  CONSTRAINT checkout_payment_attempts_configuration_digest_check CHECK (configuration_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT checkout_payment_attempts_configuration_key_check CHECK (
    configuration_key_id = btrim(configuration_key_id)
    AND char_length(configuration_key_id) BETWEEN 1 AND 128
    AND configuration_key_id !~ '[[:cntrl:]]'
  ),
  CONSTRAINT checkout_payment_attempts_configuration_envelope_check CHECK (
    saas.quick_link_sealed_envelope_is_valid(sealed_configuration, configuration_key_id)
  ),
  CONSTRAINT checkout_payment_attempts_amount_check CHECK (
    expected_subtotal_cents BETWEEN 0 AND 7999200000000000
    AND expected_shipping_cents BETWEEN 0 AND 500000000000000
    AND expected_discount_cents BETWEEN 0 AND 500000000000000
    AND expected_payment_amount::numeric = expected_subtotal_cents::numeric + expected_shipping_cents::numeric - expected_discount_cents::numeric
    AND expected_payment_amount BETWEEN 1 AND 8500000000000000
  ),
  CONSTRAINT checkout_payment_attempts_currency_check CHECK (currency = 'TRY'),
  CONSTRAINT checkout_payment_attempts_status_check CHECK (
    status IN ('reserved','provider_ready','initiation_unknown','succeeded','failed','expired')
  ),
  CONSTRAINT checkout_payment_attempts_provider_token_check CHECK (
    (provider_token_digest IS NULL AND provider_token_key_id IS NULL AND sealed_provider_token IS NULL)
    OR (
      provider_token_digest ~ '^[a-f0-9]{64}$'
      AND provider_token_key_id = btrim(provider_token_key_id)
      AND char_length(provider_token_key_id) BETWEEN 1 AND 128
      AND provider_token_key_id !~ '[[:cntrl:]]'
      AND saas.quick_link_sealed_envelope_is_valid(sealed_provider_token, provider_token_key_id)
    )
    AND ((sealed_provider_token IS NOT NULL) = (provider_ready_at IS NOT NULL))
  ),
  CONSTRAINT checkout_payment_attempts_lifecycle_check CHECK (
    pg_catalog.isfinite(hold_expires_at) AND pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at)
    AND (provider_ready_at IS NULL OR pg_catalog.isfinite(provider_ready_at))
    AND (initiation_unknown_at IS NULL OR pg_catalog.isfinite(initiation_unknown_at))
    AND (succeeded_at IS NULL OR pg_catalog.isfinite(succeeded_at))
    AND (failed_at IS NULL OR pg_catalog.isfinite(failed_at))
    AND (expired_at IS NULL OR pg_catalog.isfinite(expired_at))
    AND hold_expires_at = created_at + interval '5 minutes' AND updated_at >= created_at
    AND (provider_ready_at IS NULL OR provider_ready_at BETWEEN created_at AND updated_at)
    AND (initiation_unknown_at IS NULL OR initiation_unknown_at BETWEEN created_at AND updated_at)
    AND (succeeded_at IS NULL OR succeeded_at BETWEEN created_at AND updated_at)
    AND (failed_at IS NULL OR failed_at BETWEEN created_at AND updated_at)
    AND (expired_at IS NULL OR expired_at BETWEEN created_at AND updated_at)
    AND NOT (provider_ready_at IS NOT NULL AND initiation_unknown_at IS NOT NULL)
    AND version BETWEEN 1 AND 9007199254740991
    AND provider_config_version BETWEEN 1 AND 9007199254740991
    AND ((status = 'reserved' AND provider_ready_at IS NULL AND initiation_unknown_at IS NULL AND succeeded_at IS NULL AND failed_at IS NULL AND expired_at IS NULL AND settled_order_id IS NULL AND provider_token_digest IS NULL AND provider_token_key_id IS NULL AND sealed_provider_token IS NULL)
      OR (status = 'provider_ready' AND provider_ready_at IS NOT NULL AND initiation_unknown_at IS NULL AND succeeded_at IS NULL AND failed_at IS NULL AND expired_at IS NULL AND settled_order_id IS NULL AND sealed_provider_token IS NOT NULL)
      OR (status = 'initiation_unknown' AND provider_ready_at IS NULL AND initiation_unknown_at IS NOT NULL AND succeeded_at IS NULL AND failed_at IS NULL AND expired_at IS NULL AND settled_order_id IS NULL AND provider_token_digest IS NULL AND provider_token_key_id IS NULL AND sealed_provider_token IS NULL)
      OR (status = 'succeeded' AND (provider_ready_at IS NOT NULL OR initiation_unknown_at IS NOT NULL) AND succeeded_at IS NOT NULL AND failed_at IS NULL AND expired_at IS NULL AND settled_order_id IS NOT NULL)
      OR (status = 'failed' AND failed_at IS NOT NULL AND succeeded_at IS NULL AND expired_at IS NULL AND settled_order_id IS NULL)
      OR (status = 'expired' AND expired_at IS NOT NULL AND provider_ready_at IS NULL AND initiation_unknown_at IS NULL AND succeeded_at IS NULL AND failed_at IS NULL AND settled_order_id IS NULL AND provider_token_digest IS NULL AND provider_token_key_id IS NULL AND sealed_provider_token IS NULL))
  ),
  CONSTRAINT checkout_payment_attempts_store_id_key UNIQUE (store_id, id),
  CONSTRAINT checkout_payment_attempts_store_id_link_key UNIQUE (store_id, id, quick_order_link_id),
  CONSTRAINT checkout_payment_attempts_link_store_fk FOREIGN KEY (store_id, quick_order_link_id)
    REFERENCES saas.quick_order_links(store_id, id),
  CONSTRAINT checkout_payment_attempts_redemption_store_fk FOREIGN KEY (store_id, redemption_session_id)
    REFERENCES saas.quick_order_redemption_sessions(store_id, id),
  CONSTRAINT checkout_payment_attempts_redemption_link_store_fk FOREIGN KEY (store_id, redemption_session_id, quick_order_link_id)
    REFERENCES saas.quick_order_redemption_sessions(store_id, id, quick_order_link_id),
  CONSTRAINT checkout_payment_attempts_provider_store_fk FOREIGN KEY (store_id, provider_config_id)
    REFERENCES saas.checkout_provider_configs(store_id, id),
  CONSTRAINT checkout_payment_attempts_link_provider_currency_store_fk FOREIGN KEY (store_id, quick_order_link_id, provider_config_id, currency)
    REFERENCES saas.quick_order_links(store_id, id, provider_config_id, currency),
  CONSTRAINT checkout_payment_attempts_order_store_fk FOREIGN KEY (store_id, settled_order_id)
    REFERENCES saas.orders(store_id, id),
  CONSTRAINT checkout_payment_attempts_order_link_store_fk FOREIGN KEY (store_id, settled_order_id, quick_order_link_id)
    REFERENCES saas.orders(store_id, id, quick_order_link_id)
);

CREATE TABLE saas.checkout_inventory_reservations (
  id uuid CONSTRAINT checkout_inventory_reservations_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  quick_order_link_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity bigint NOT NULL,
  stock_tracked boolean NOT NULL,
  status text NOT NULL,
  held_at timestamptz NOT NULL,
  consumed_at timestamptz,
  released_at timestamptz,
  expired_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL,
  CONSTRAINT checkout_inventory_reservations_id_check CHECK (
    id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT checkout_inventory_reservations_quantity_check CHECK (quantity BETWEEN 1 AND 9007199254740991),
  CONSTRAINT checkout_inventory_reservations_status_check CHECK (status IN ('held','consumed','released','expired')),
  CONSTRAINT checkout_inventory_reservations_version_check CHECK (version BETWEEN 1 AND 9007199254740991),
  CONSTRAINT checkout_inventory_reservations_lifecycle_check CHECK (
    pg_catalog.isfinite(held_at) AND pg_catalog.isfinite(updated_at)
    AND (consumed_at IS NULL OR pg_catalog.isfinite(consumed_at))
    AND (released_at IS NULL OR pg_catalog.isfinite(released_at))
    AND (expired_at IS NULL OR pg_catalog.isfinite(expired_at))
    AND updated_at >= held_at
    AND ((status = 'held' AND consumed_at IS NULL AND released_at IS NULL AND expired_at IS NULL)
      OR (status = 'consumed' AND consumed_at BETWEEN held_at AND updated_at AND released_at IS NULL AND expired_at IS NULL)
      OR (status = 'released' AND released_at BETWEEN held_at AND updated_at AND consumed_at IS NULL AND expired_at IS NULL)
      OR (status = 'expired' AND expired_at BETWEEN held_at AND updated_at AND consumed_at IS NULL AND released_at IS NULL))
  ),
  CONSTRAINT checkout_inventory_reservations_attempt_variant_key UNIQUE (attempt_id, variant_id),
  CONSTRAINT checkout_inventory_reservations_store_id_key UNIQUE (store_id, id),
  CONSTRAINT checkout_inventory_reservations_attempt_store_fk FOREIGN KEY (store_id, attempt_id)
    REFERENCES saas.checkout_payment_attempts(store_id, id),
  CONSTRAINT checkout_inventory_reservations_attempt_link_store_fk FOREIGN KEY (store_id, attempt_id, quick_order_link_id)
    REFERENCES saas.checkout_payment_attempts(store_id, id, quick_order_link_id),
  CONSTRAINT checkout_inventory_reservations_link_store_fk FOREIGN KEY (store_id, quick_order_link_id)
    REFERENCES saas.quick_order_links(store_id, id),
  CONSTRAINT checkout_inventory_reservations_variant_product_store_fk FOREIGN KEY (store_id, product_id, variant_id)
    REFERENCES saas.product_variants(store_id, product_id, id)
);

CREATE UNIQUE INDEX checkout_inventory_reservations_held_attempt_variant_key
  ON saas.checkout_inventory_reservations (attempt_id, variant_id)
  WHERE status = 'held';

CREATE TABLE saas.checkout_callback_receipts (
  id uuid CONSTRAINT checkout_callback_receipts_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  callback_digest char(64) NOT NULL,
  callback_status text NOT NULL,
  result_payload jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  CONSTRAINT checkout_callback_receipts_id_check CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT checkout_callback_receipts_digest_check CHECK (callback_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT checkout_callback_receipts_status_check CHECK (callback_status IN ('success','failed')),
  CONSTRAINT checkout_callback_receipts_payload_check CHECK (jsonb_typeof(result_payload) = 'object' AND pg_column_size(result_payload) <= 32768),
  CONSTRAINT checkout_callback_receipts_received_at_check CHECK (pg_catalog.isfinite(received_at)),
  CONSTRAINT checkout_callback_receipts_attempt_digest_key UNIQUE (attempt_id, callback_digest),
  CONSTRAINT checkout_callback_receipts_attempt_store_fk FOREIGN KEY (store_id, attempt_id)
    REFERENCES saas.checkout_payment_attempts(store_id, id)
);

CREATE TABLE saas.checkout_reconciliation_jobs (
  attempt_id uuid CONSTRAINT checkout_reconciliation_jobs_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  status text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  worker_id uuid,
  lease_token_digest char(64),
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT checkout_reconciliation_jobs_status_check CHECK (status IN ('pending','leased','completed')),
  CONSTRAINT checkout_reconciliation_jobs_attempt_number_check CHECK (attempt_number BETWEEN 0 AND 1000),
  CONSTRAINT checkout_reconciliation_jobs_worker_id_check CHECK (
    worker_id IS NULL OR worker_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT checkout_reconciliation_jobs_lease_check CHECK (
    (status = 'leased' AND worker_id IS NOT NULL AND lease_token_digest ~ '^[a-f0-9]{64}$' AND lease_expires_at > updated_at)
    OR (status <> 'leased' AND worker_id IS NULL AND lease_token_digest IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT checkout_reconciliation_jobs_time_check CHECK (
    pg_catalog.isfinite(next_attempt_at) AND pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at)
    AND (lease_expires_at IS NULL OR pg_catalog.isfinite(lease_expires_at))
    AND updated_at >= created_at
  ),
  CONSTRAINT checkout_reconciliation_jobs_store_attempt_key UNIQUE (store_id, attempt_id),
  CONSTRAINT checkout_reconciliation_jobs_attempt_store_fk FOREIGN KEY (store_id, attempt_id)
    REFERENCES saas.checkout_payment_attempts(store_id, id)
);

CREATE TABLE saas.checkout_reconciliation_run (
  singleton boolean CONSTRAINT checkout_reconciliation_run_pkey PRIMARY KEY DEFAULT TRUE,
  worker_id uuid NOT NULL,
  run_token_digest char(64) NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT checkout_reconciliation_run_singleton_check CHECK (singleton),
  CONSTRAINT checkout_reconciliation_run_worker_id_check CHECK (
    worker_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT checkout_reconciliation_run_digest_check CHECK (run_token_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT checkout_reconciliation_run_time_check CHECK (
    pg_catalog.isfinite(lease_expires_at) AND pg_catalog.isfinite(started_at) AND pg_catalog.isfinite(updated_at)
    AND lease_expires_at > started_at AND updated_at BETWEEN started_at AND lease_expires_at
  )
);

CREATE TABLE saas.checkout_reconciliation_receipts (
  id uuid CONSTRAINT checkout_reconciliation_receipts_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  outcome text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT checkout_reconciliation_receipts_id_check CHECK (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT checkout_reconciliation_receipts_operation_id_check CHECK (operation_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT checkout_reconciliation_receipts_outcome_check CHECK (outcome IN ('succeeded','unknown')),
  CONSTRAINT checkout_reconciliation_receipts_fingerprint_check CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT checkout_reconciliation_receipts_payload_check CHECK (jsonb_typeof(result_payload) = 'object' AND pg_column_size(result_payload) <= 32768),
  CONSTRAINT checkout_reconciliation_receipts_committed_at_check CHECK (pg_catalog.isfinite(committed_at)),
  CONSTRAINT checkout_reconciliation_receipts_operation_key UNIQUE (operation_id),
  CONSTRAINT checkout_reconciliation_receipts_attempt_operation_key UNIQUE (attempt_id, operation_id),
  CONSTRAINT checkout_reconciliation_receipts_attempt_store_fk FOREIGN KEY (store_id, attempt_id)
    REFERENCES saas.checkout_payment_attempts(store_id, id)
);

CREATE TABLE saas.checkout_operations (
  operation_id uuid CONSTRAINT checkout_operations_pkey PRIMARY KEY,
  store_id uuid NOT NULL,
  attempt_id uuid,
  redemption_session_id uuid,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT checkout_operations_id_check CHECK (operation_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  CONSTRAINT checkout_operations_kind_check CHECK (operation_kind IN (
    'revoke_redemption','begin_attempt','provider_ready','initiation_unknown','initiation_failed','cleanup_attempt','settle_callback','reconcile_success','reconcile_unknown'
  )),
  CONSTRAINT checkout_operations_fingerprint_check CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT checkout_operations_payload_check CHECK (jsonb_typeof(result_payload) = 'object' AND pg_column_size(result_payload) <= 32768),
  CONSTRAINT checkout_operations_scope_check CHECK (attempt_id IS NOT NULL OR redemption_session_id IS NOT NULL),
  CONSTRAINT checkout_operations_committed_at_check CHECK (pg_catalog.isfinite(committed_at)),
  CONSTRAINT checkout_operations_attempt_store_fk FOREIGN KEY (store_id, attempt_id)
    REFERENCES saas.checkout_payment_attempts(store_id, id),
  CONSTRAINT checkout_operations_redemption_store_fk FOREIGN KEY (store_id, redemption_session_id)
    REFERENCES saas.quick_order_redemption_sessions(store_id, id)
);

CREATE INDEX quick_order_redemption_sessions_link_idx ON saas.quick_order_redemption_sessions (store_id, quick_order_link_id, expires_at);
CREATE INDEX checkout_payment_attempts_link_status_idx ON saas.checkout_payment_attempts (store_id, quick_order_link_id, status, created_at, id);
CREATE INDEX checkout_inventory_reservations_variant_held_idx ON saas.checkout_inventory_reservations (store_id, variant_id, status, id);
CREATE INDEX checkout_reconciliation_jobs_due_idx ON saas.checkout_reconciliation_jobs (next_attempt_at, attempt_id) WHERE status = 'pending';
CREATE INDEX checkout_operations_attempt_idx ON saas.checkout_operations (attempt_id, committed_at, operation_id);

CREATE FUNCTION saas.guard_checkout_immutable_row()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$
BEGIN
  RAISE EXCEPTION 'CHECKOUT_RECEIPT_IMMUTABLE';
END
$function$;

CREATE FUNCTION saas.guard_checkout_provider_config_terminal()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'CHECKOUT_PROVIDER_CONFIG_DELETE_DENIED'; END IF;
  IF OLD.status = 'revoked' THEN RAISE EXCEPTION 'CHECKOUT_PROVIDER_CONFIG_REVOKED'; END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION saas.guard_checkout_redemption_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'CHECKOUT_REDEMPTION_DELETE_DENIED'; END IF;
  IF OLD.consumed_at IS NOT NULL OR OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'CHECKOUT_REDEMPTION_TERMINAL';
  END IF;
  IF OLD.store_id IS DISTINCT FROM NEW.store_id
     OR OLD.id IS DISTINCT FROM NEW.id
     OR OLD.quick_order_link_id IS DISTINCT FROM NEW.quick_order_link_id
     OR OLD.cookie_digest IS DISTINCT FROM NEW.cookie_digest
     OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR NEW.updated_at < OLD.updated_at
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'CHECKOUT_REDEMPTION_AUTHORITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION saas.guard_checkout_attempt_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'CHECKOUT_ATTEMPT_DELETE_DENIED'; END IF;
  IF OLD.status IN ('succeeded','failed','expired') THEN
    RAISE EXCEPTION 'CHECKOUT_ATTEMPT_TERMINAL';
  END IF;
  IF OLD.status = 'reserved' AND NEW.status NOT IN ('reserved','provider_ready','initiation_unknown','failed','expired') THEN
    RAISE EXCEPTION 'CHECKOUT_ATTEMPT_TRANSITION_DENIED';
  END IF;
  IF OLD.status IN ('provider_ready','initiation_unknown') AND NEW.status NOT IN (OLD.status,'succeeded','failed') THEN
    RAISE EXCEPTION 'CHECKOUT_ATTEMPT_TRANSITION_DENIED';
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.store_id IS DISTINCT FROM NEW.store_id
     OR OLD.quick_order_link_id IS DISTINCT FROM NEW.quick_order_link_id
     OR OLD.redemption_session_id IS DISTINCT FROM NEW.redemption_session_id
     OR OLD.provider_config_id IS DISTINCT FROM NEW.provider_config_id
     OR OLD.provider_config_version IS DISTINCT FROM NEW.provider_config_version
     OR OLD.configuration_digest IS DISTINCT FROM NEW.configuration_digest
     OR OLD.configuration_key_id IS DISTINCT FROM NEW.configuration_key_id
     OR OLD.sealed_configuration IS DISTINCT FROM NEW.sealed_configuration
     OR OLD.merchant_oid IS DISTINCT FROM NEW.merchant_oid
     OR OLD.expected_subtotal_cents IS DISTINCT FROM NEW.expected_subtotal_cents
     OR OLD.expected_shipping_cents IS DISTINCT FROM NEW.expected_shipping_cents
     OR OLD.expected_discount_cents IS DISTINCT FROM NEW.expected_discount_cents
     OR OLD.expected_payment_amount IS DISTINCT FROM NEW.expected_payment_amount
     OR OLD.currency IS DISTINCT FROM NEW.currency
     OR OLD.hold_expires_at IS DISTINCT FROM NEW.hold_expires_at
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR NEW.updated_at < OLD.updated_at
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'CHECKOUT_ATTEMPT_AUTHORITY_IMMUTABLE';
  END IF;
  IF OLD.provider_token_digest IS NOT NULL AND (
    OLD.provider_token_digest IS DISTINCT FROM NEW.provider_token_digest
    OR OLD.provider_token_key_id IS DISTINCT FROM NEW.provider_token_key_id
    OR OLD.sealed_provider_token IS DISTINCT FROM NEW.sealed_provider_token
  ) THEN RAISE EXCEPTION 'CHECKOUT_PROVIDER_TOKEN_IMMUTABLE'; END IF;
  IF OLD.provider_token_digest IS NULL AND NEW.provider_token_digest IS NOT NULL
     AND NOT (OLD.status='reserved' AND NEW.status='provider_ready') THEN
    RAISE EXCEPTION 'CHECKOUT_PROVIDER_TOKEN_TRANSITION_DENIED';
  END IF;
  IF OLD.provider_ready_at IS NOT NULL AND OLD.provider_ready_at IS DISTINCT FROM NEW.provider_ready_at THEN RAISE EXCEPTION 'CHECKOUT_ATTEMPT_TIMESTAMP_IMMUTABLE'; END IF;
  IF OLD.initiation_unknown_at IS NOT NULL AND OLD.initiation_unknown_at IS DISTINCT FROM NEW.initiation_unknown_at THEN RAISE EXCEPTION 'CHECKOUT_ATTEMPT_TIMESTAMP_IMMUTABLE'; END IF;
  IF OLD.succeeded_at IS NOT NULL AND OLD.succeeded_at IS DISTINCT FROM NEW.succeeded_at THEN RAISE EXCEPTION 'CHECKOUT_ATTEMPT_TIMESTAMP_IMMUTABLE'; END IF;
  IF OLD.failed_at IS NOT NULL AND OLD.failed_at IS DISTINCT FROM NEW.failed_at THEN RAISE EXCEPTION 'CHECKOUT_ATTEMPT_TIMESTAMP_IMMUTABLE'; END IF;
  IF OLD.expired_at IS NOT NULL AND OLD.expired_at IS DISTINCT FROM NEW.expired_at THEN RAISE EXCEPTION 'CHECKOUT_ATTEMPT_TIMESTAMP_IMMUTABLE'; END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION saas.guard_checkout_reservation_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_DELETE_DENIED'; END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.store_id IS DISTINCT FROM NEW.store_id
     OR OLD.stock_tracked IS DISTINCT FROM NEW.stock_tracked
     OR OLD.quantity IS DISTINCT FROM NEW.quantity
     OR OLD.quick_order_link_id IS DISTINCT FROM NEW.quick_order_link_id
     OR OLD.product_id IS DISTINCT FROM NEW.product_id
     OR OLD.variant_id IS DISTINCT FROM NEW.variant_id
     OR OLD.attempt_id IS DISTINCT FROM NEW.attempt_id
     OR OLD.held_at IS DISTINCT FROM NEW.held_at
     OR NEW.updated_at < OLD.updated_at
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'CHECKOUT_RESERVATION_AUTHORITY_IMMUTABLE';
  END IF;
  IF OLD.status IN ('consumed','released','expired') THEN
    RAISE EXCEPTION 'CHECKOUT_RESERVATION_TERMINAL';
  END IF;
  IF OLD.status = 'held' AND NEW.status NOT IN ('held','consumed','released','expired') THEN
    RAISE EXCEPTION 'CHECKOUT_RESERVATION_TRANSITION_DENIED';
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION saas.guard_checkout_reconciliation_job_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'CHECKOUT_RECONCILIATION_JOB_DELETE_DENIED'; END IF;
  IF OLD.status = 'completed' THEN RAISE EXCEPTION 'CHECKOUT_RECONCILIATION_JOB_TERMINAL'; END IF;
  IF OLD.attempt_id IS DISTINCT FROM NEW.attempt_id OR OLD.store_id IS DISTINCT FROM NEW.store_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'CHECKOUT_RECONCILIATION_JOB_AUTHORITY_IMMUTABLE';
  END IF;
  IF NEW.updated_at < OLD.updated_at THEN RAISE EXCEPTION 'CHECKOUT_RECONCILIATION_JOB_TIME_REGRESSION'; END IF;
  IF NEW.attempt_number < OLD.attempt_number THEN RAISE EXCEPTION 'CHECKOUT_RECONCILIATION_JOB_ATTEMPT_REGRESSION'; END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION saas.guard_checkout_quick_link_live_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF (NEW.status IN ('cancelled','expired') AND OLD.status IS DISTINCT FROM NEW.status)
     OR NEW.expires_at < OLD.expires_at THEN
    IF EXISTS (
      SELECT 1 FROM saas.checkout_payment_attempts AS attempt
      WHERE attempt.store_id = OLD.store_id AND attempt.quick_order_link_id = OLD.id
        AND attempt.status IN ('reserved','provider_ready','initiation_unknown')
        AND EXISTS (SELECT 1 FROM saas.checkout_inventory_reservations AS reservation
          WHERE reservation.store_id = attempt.store_id AND reservation.attempt_id = attempt.id AND reservation.status = 'held')
    ) THEN RAISE EXCEPTION 'QUICK_LINK_HAS_LIVE_PAYMENT_ATTEMPT'; END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION saas.guard_checkout_paid_link_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF OLD.status = 'paid' THEN RAISE EXCEPTION 'QUICK_LINK_PAID_IMMUTABLE'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION saas.guard_checkout_variant_held_reservation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$
DECLARE held_quantity numeric;
BEGIN
  SELECT COALESCE(sum(reservation.quantity) FILTER (WHERE reservation.stock_tracked), 0)
    INTO held_quantity
  FROM saas.checkout_inventory_reservations AS reservation
  WHERE reservation.store_id = OLD.store_id AND reservation.variant_id = OLD.id AND reservation.status = 'held';
  IF EXISTS (SELECT 1 FROM saas.checkout_inventory_reservations AS reservation
    WHERE reservation.store_id = OLD.store_id AND reservation.variant_id = OLD.id AND reservation.status = 'held') THEN
    IF NEW.status <> 'active' OR NEW.archived_at IS NOT NULL OR NEW.stock_tracking IS DISTINCT FROM OLD.stock_tracking
       OR (NEW.stock_tracking AND NEW.stock_quantity::numeric < held_quantity) THEN
      RAISE EXCEPTION 'CATALOG_VARIANT_HAS_HELD_CHECKOUT_RESERVATION';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER checkout_provider_configs_terminal BEFORE UPDATE OR DELETE ON saas.checkout_provider_configs
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_provider_config_terminal();
CREATE TRIGGER quick_order_redemption_sessions_transition BEFORE UPDATE OR DELETE ON saas.quick_order_redemption_sessions
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_redemption_transition();
CREATE TRIGGER checkout_payment_attempts_transition BEFORE UPDATE OR DELETE ON saas.checkout_payment_attempts
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_attempt_transition();
CREATE TRIGGER checkout_inventory_reservations_transition BEFORE UPDATE OR DELETE ON saas.checkout_inventory_reservations
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_reservation_transition();
CREATE TRIGGER checkout_callback_receipts_immutable BEFORE UPDATE OR DELETE ON saas.checkout_callback_receipts
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_immutable_row();
CREATE TRIGGER checkout_reconciliation_receipts_immutable BEFORE UPDATE OR DELETE ON saas.checkout_reconciliation_receipts
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_immutable_row();
CREATE TRIGGER checkout_operations_immutable BEFORE UPDATE OR DELETE ON saas.checkout_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_immutable_row();
CREATE TRIGGER checkout_reconciliation_jobs_transition BEFORE UPDATE OR DELETE ON saas.checkout_reconciliation_jobs
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_reconciliation_job_transition();
CREATE TRIGGER quick_order_links_live_attempt BEFORE UPDATE OF status, expires_at ON saas.quick_order_links
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_quick_link_live_attempt();
CREATE TRIGGER quick_order_links_paid_immutable BEFORE UPDATE OR DELETE ON saas.quick_order_links
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_paid_link_mutation();
CREATE TRIGGER product_variants_checkout_hold BEFORE UPDATE OF status, archived_at, stock_tracking, stock_quantity ON saas.product_variants
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_variant_held_reservation();

CREATE OR REPLACE FUNCTION saas.quick_links_cancel(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_link_id uuid, p_expected_version bigint, p_operation_id uuid, p_fingerprint text
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE
  authority_error text;
  existing_operation saas.quick_order_link_operations%ROWTYPE;
  current_link saas.quick_order_links%ROWTYPE;
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  authority_error := saas.quick_link_merchant_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage');
  IF authority_error = 'membership_denied' AND EXISTS (SELECT 1 FROM saas.memberships WHERE id=p_membership_id AND store_id=p_store_id AND principal_id=p_principal_id AND status='active') THEN authority_error := 'action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_operation_id::text !~ uuid_pattern OR p_link_id IS NULL OR p_link_id::text !~ uuid_pattern
     OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  authority_error := saas.quick_links_lock_manage_authority(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
  IF authority_error = 'membership_denied' AND EXISTS (SELECT 1 FROM saas.memberships WHERE id=p_membership_id AND store_id=p_store_id AND principal_id=p_principal_id AND status='active') THEN authority_error := 'action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.quick_links.operation:'||p_store_id::text||':'||p_operation_id::text,0));
  SELECT operation.* INTO existing_operation FROM saas.quick_order_link_operations AS operation WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind='cancel' AND existing_operation.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  -- Cancellation never owns the link while waiting for an attempt.
  PERFORM 1 FROM saas.checkout_payment_attempts AS attempt
    WHERE attempt.store_id=p_store_id AND attempt.quick_order_link_id=p_link_id
      AND attempt.status IN ('reserved','provider_ready','initiation_unknown')
    ORDER BY attempt.id FOR UPDATE;
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link WHERE link.store_id=p_store_id AND link.id=p_link_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'quick_link_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM saas.checkout_payment_attempts AS attempt JOIN saas.checkout_inventory_reservations AS reservation
    ON reservation.store_id=attempt.store_id AND reservation.attempt_id=attempt.id AND reservation.status='held'
    WHERE attempt.store_id=p_store_id AND attempt.quick_order_link_id=p_link_id AND attempt.status IN ('reserved','provider_ready','initiation_unknown')) THEN
    RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_link.updated_at THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF current_link.version<>p_expected_version OR current_link.version=9007199254740991 THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF current_link.status NOT IN ('active','opened') OR current_link.expires_at<=p_now THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN; END IF;
  BEGIN
    UPDATE saas.quick_order_links SET status='cancelled',cancelled_at=p_now,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_link_id;
    result_payload := saas.quick_links_mutation_projection(p_store_id,p_link_id);
    INSERT INTO saas.quick_order_link_operations(operation_id,store_id,quick_order_link_id,operation_kind,payload_fingerprint,result_payload,committed_at)
      VALUES (p_operation_id,p_store_id,p_link_id,'cancel',p_fingerprint,result_payload,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,result_payload;
END
$function$;

CREATE OR REPLACE FUNCTION saas.catalog_archive_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing saas.catalog_operations%ROWTYPE; current_product saas.products%ROWTYPE; projection jsonb;
BEGIN
  authority_error := saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_product_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT operation.* INTO existing FROM saas.catalog_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id=p_store_id AND existing.operation_kind='archive_product' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN; END IF;
  SELECT product.* INTO current_product FROM saas.products AS product WHERE product.id=p_product_id AND product.store_id=p_store_id FOR UPDATE;
  IF NOT FOUND OR current_product.status='archived' THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_product.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.product_variants AS variant WHERE variant.store_id=p_store_id AND variant.product_id=p_product_id ORDER BY variant.id FOR UPDATE;
  UPDATE saas.product_variants SET status='archived',archived_at=p_now,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND product_id=p_product_id AND status='active';
  UPDATE saas.products SET status='archived',archived_at=p_now,version=version+1,updated_at=p_now WHERE id=p_product_id AND store_id=p_store_id;
  projection := pg_catalog.jsonb_build_object('product',saas.catalog_product_projection(p_product_id));
  INSERT INTO saas.catalog_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_product_id,result_variant_id,result_payload,committed_at)
    VALUES (p_operation_id,p_store_id,'archive_product',p_fingerprint,p_product_id,NULL,projection,p_now);
  RETURN QUERY SELECT 'archived'::text,projection;
END
$function$;

ALTER TABLE saas.quick_order_redemption_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.quick_order_redemption_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_payment_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_inventory_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_callback_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_callback_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_reconciliation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_reconciliation_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_reconciliation_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_reconciliation_run FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_reconciliation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_reconciliation_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.checkout_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON saas.quick_order_redemption_sessions,saas.checkout_payment_attempts,saas.checkout_inventory_reservations,
  saas.checkout_callback_receipts,saas.checkout_reconciliation_jobs,saas.checkout_reconciliation_run,
  saas.checkout_reconciliation_receipts,saas.checkout_operations FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION saas.guard_checkout_immutable_row(),saas.guard_checkout_provider_config_terminal(),
  saas.guard_checkout_redemption_transition(),saas.guard_checkout_attempt_transition(),saas.guard_checkout_reservation_transition(),
  saas.guard_checkout_reconciliation_job_transition(),
  saas.guard_checkout_quick_link_live_attempt(),saas.guard_checkout_paid_link_mutation(),
  saas.guard_checkout_variant_held_reservation() FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

COMMIT;
