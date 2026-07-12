-- Phase 2B1 durable registration workflow and OIDC transaction authorities.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.registration_workflows (
  attempt_id text PRIMARY KEY,
  state_digest character(64) NOT NULL UNIQUE,
  payload_ciphertext bytea NOT NULL,
  payload_iv bytea NOT NULL,
  encryption_key_id text NOT NULL,
  payload_schema_version smallint NOT NULL,
  status text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  canonical_fingerprint character(64),
  requested_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  failure_code text,
  terminal_at timestamptz,
  CONSTRAINT registration_workflows_attempt_id_format CHECK (attempt_id ~ '^attempt_[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT registration_workflows_state_digest_format CHECK (state_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT registration_workflows_ciphertext_length CHECK (octet_length(payload_ciphertext) > 16),
  CONSTRAINT registration_workflows_iv_length CHECK (octet_length(payload_iv) = 12),
  CONSTRAINT registration_workflows_key_id_format CHECK (encryption_key_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  CONSTRAINT registration_workflows_schema_version CHECK (payload_schema_version >= 1),
  CONSTRAINT registration_workflows_status CHECK (status IN ('awaiting_identity', 'identity_verified', 'tenant_created', 'session_created', 'failed', 'expired', 'cancelled')),
  CONSTRAINT registration_workflows_version CHECK (version >= 1),
  CONSTRAINT registration_workflows_fingerprint CHECK (canonical_fingerprint IS NULL OR canonical_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT registration_workflows_expiry CHECK (expires_at > created_at),
  CONSTRAINT registration_workflows_timestamp_order CHECK (updated_at >= created_at AND (consumed_at IS NULL OR consumed_at >= created_at)),
  CONSTRAINT registration_workflows_consumed_state CHECK (status NOT IN ('identity_verified', 'tenant_created', 'session_created', 'expired') OR consumed_at IS NOT NULL),
  CONSTRAINT registration_workflows_tenant_fingerprint CHECK (status NOT IN ('tenant_created', 'session_created') OR canonical_fingerprint IS NOT NULL),
  CONSTRAINT registration_workflows_failure_code CHECK ((status = 'failed') = (failure_code IS NOT NULL)),
  CONSTRAINT registration_workflows_terminal_timestamp CHECK ((status IN ('session_created', 'failed', 'expired', 'cancelled')) = (terminal_at IS NOT NULL))
);

CREATE TABLE saas.oidc_transactions (
  state_digest character(64) PRIMARY KEY,
  payload_ciphertext bytea NOT NULL,
  payload_iv bytea NOT NULL,
  encryption_key_id text NOT NULL,
  payload_schema_version smallint NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  discarded_at timestamptz,
  CONSTRAINT oidc_transactions_state_digest_format CHECK (state_digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT oidc_transactions_ciphertext_length CHECK (octet_length(payload_ciphertext) > 16),
  CONSTRAINT oidc_transactions_iv_length CHECK (octet_length(payload_iv) = 12),
  CONSTRAINT oidc_transactions_key_id_format CHECK (encryption_key_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  CONSTRAINT oidc_transactions_schema_version CHECK (payload_schema_version >= 1),
  CONSTRAINT oidc_transactions_status CHECK (status IN ('active', 'consumed', 'expired', 'discarded')),
  CONSTRAINT oidc_transactions_expiry CHECK (expires_at > created_at),
  CONSTRAINT oidc_transactions_timestamp_order CHECK (updated_at >= created_at),
  CONSTRAINT oidc_transactions_consumed_timestamp CHECK ((status IN ('consumed', 'expired')) = (consumed_at IS NOT NULL)),
  CONSTRAINT oidc_transactions_discarded_timestamp CHECK ((status = 'discarded') = (discarded_at IS NOT NULL)),
  CONSTRAINT oidc_transactions_single_terminal_timestamp CHECK (consumed_at IS NULL OR discarded_at IS NULL)
);

CREATE FUNCTION saas.guard_registration_workflow_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b1_registration_guard$
BEGIN
  IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
     OR NEW.state_digest IS DISTINCT FROM OLD.state_digest
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.payload_ciphertext IS DISTINCT FROM OLD.payload_ciphertext
     OR NEW.payload_iv IS DISTINCT FROM OLD.payload_iv
     OR NEW.encryption_key_id IS DISTINCT FROM OLD.encryption_key_id
     OR NEW.payload_schema_version IS DISTINCT FROM OLD.payload_schema_version THEN
    RAISE EXCEPTION 'PHASE2B1_IMMUTABLE_REGISTRATION_AUTHORITY';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.version <> OLD.version + 1 OR NOT (
      (OLD.status = 'awaiting_identity' AND NEW.status IN ('identity_verified', 'failed', 'expired', 'cancelled')) OR
      (OLD.status = 'identity_verified' AND NEW.status IN ('tenant_created', 'failed', 'expired', 'cancelled')) OR
      (OLD.status = 'tenant_created' AND NEW.status IN ('session_created', 'failed', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'PHASE2B1_INVALID_REGISTRATION_TRANSITION';
    END IF;
  ELSIF NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION 'PHASE2B1_INVALID_REGISTRATION_VERSION';
  END IF;

  IF OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
    RAISE EXCEPTION 'PHASE2B1_IMMUTABLE_REGISTRATION_CONSUMPTION';
  END IF;
  IF NEW.canonical_fingerprint IS DISTINCT FROM OLD.canonical_fingerprint
     AND NOT (OLD.status = 'awaiting_identity' AND NEW.status = 'identity_verified') THEN
    RAISE EXCEPTION 'PHASE2B1_INVALID_REGISTRATION_FINGERPRINT';
  END IF;
  RETURN NEW;
END
$phase2b1_registration_guard$;

CREATE TRIGGER registration_workflows_guard
BEFORE UPDATE ON saas.registration_workflows
FOR EACH ROW EXECUTE FUNCTION saas.guard_registration_workflow_mutation();

CREATE FUNCTION saas.guard_oidc_transaction_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b1_oidc_guard$
BEGIN
  IF NEW.state_digest IS DISTINCT FROM OLD.state_digest
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.payload_ciphertext IS DISTINCT FROM OLD.payload_ciphertext
     OR NEW.payload_iv IS DISTINCT FROM OLD.payload_iv
     OR NEW.encryption_key_id IS DISTINCT FROM OLD.encryption_key_id
     OR NEW.payload_schema_version IS DISTINCT FROM OLD.payload_schema_version THEN
    RAISE EXCEPTION 'PHASE2B1_IMMUTABLE_OIDC_AUTHORITY';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    OLD.status = 'active' AND NEW.status IN ('consumed', 'expired', 'discarded')
  ) THEN
    RAISE EXCEPTION 'PHASE2B1_INVALID_OIDC_TRANSITION';
  END IF;
  IF OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
    RAISE EXCEPTION 'PHASE2B1_IMMUTABLE_OIDC_CONSUMPTION';
  END IF;
  IF OLD.discarded_at IS NOT NULL AND NEW.discarded_at IS DISTINCT FROM OLD.discarded_at THEN
    RAISE EXCEPTION 'PHASE2B1_IMMUTABLE_OIDC_DISCARD';
  END IF;
  RETURN NEW;
END
$phase2b1_oidc_guard$;

CREATE TRIGGER oidc_transactions_guard
BEFORE UPDATE ON saas.oidc_transactions
FOR EACH ROW EXECUTE FUNCTION saas.guard_oidc_transaction_mutation();

COMMIT;
