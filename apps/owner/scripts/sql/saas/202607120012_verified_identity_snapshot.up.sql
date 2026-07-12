-- Phase 2B1B1 encrypted verified-identity authority and paired workflow transition guards.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.registration_verified_identities (
  attempt_id text PRIMARY KEY,
  canonical_fingerprint character(64) NOT NULL,
  payload_ciphertext bytea NOT NULL,
  payload_iv bytea NOT NULL,
  encryption_key_id text NOT NULL,
  payload_schema_version smallint NOT NULL,
  recorded_at timestamptz NOT NULL,
  CONSTRAINT registration_verified_identities_workflow_fk
    FOREIGN KEY (attempt_id) REFERENCES saas.registration_workflows(attempt_id) ON DELETE CASCADE,
  CONSTRAINT registration_verified_identities_attempt_id_format
    CHECK (attempt_id ~ '^attempt_[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT registration_verified_identities_fingerprint_format
    CHECK (canonical_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT registration_verified_identities_ciphertext_length
    CHECK (octet_length(payload_ciphertext) > 16),
  CONSTRAINT registration_verified_identities_iv_length
    CHECK (octet_length(payload_iv) = 12),
  CONSTRAINT registration_verified_identities_key_id_format
    CHECK (encryption_key_id ~ '^[A-Za-z0-9._-]{1,128}$'),
  CONSTRAINT registration_verified_identities_schema_version
    CHECK (payload_schema_version = 1)
);

CREATE FUNCTION saas.guard_registration_verified_identity_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b1b1_verified_identity_insert_guard$
DECLARE
  workflow_status text;
  workflow_consumed_at timestamptz;
  workflow_fingerprint character(64);
  workflow_created_at timestamptz;
BEGIN
  SELECT status, consumed_at, canonical_fingerprint, created_at
    INTO workflow_status, workflow_consumed_at, workflow_fingerprint, workflow_created_at
  FROM saas.registration_workflows
  WHERE attempt_id = NEW.attempt_id
  FOR KEY SHARE;

  IF NOT FOUND
     OR workflow_status <> 'awaiting_identity'
     OR workflow_consumed_at IS NULL
     OR workflow_fingerprint IS NOT NULL
     OR NEW.recorded_at < workflow_created_at THEN
    RAISE EXCEPTION 'PHASE2B1B1_INVALID_VERIFIED_IDENTITY_INSERT';
  END IF;
  RETURN NEW;
END
$phase2b1b1_verified_identity_insert_guard$;

CREATE FUNCTION saas.guard_registration_verified_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b1b1_verified_identity_mutation_guard$
BEGIN
  RAISE EXCEPTION 'PHASE2B1B1_IMMUTABLE_VERIFIED_IDENTITY';
END
$phase2b1b1_verified_identity_mutation_guard$;

CREATE FUNCTION saas.guard_registration_verified_identity_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b1b1_verified_identity_transition_guard$
DECLARE
  snapshot_fingerprint character(64);
BEGIN
  IF OLD.status = 'awaiting_identity' AND NEW.status = 'identity_verified' THEN
    SELECT canonical_fingerprint INTO snapshot_fingerprint
    FROM saas.registration_verified_identities
    WHERE attempt_id = OLD.attempt_id;

    IF NOT FOUND OR snapshot_fingerprint IS DISTINCT FROM NEW.canonical_fingerprint THEN
      RAISE EXCEPTION 'PHASE2B1B1_VERIFIED_IDENTITY_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END
$phase2b1b1_verified_identity_transition_guard$;

CREATE FUNCTION saas.assert_registration_verified_identity_pair()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b1b1_verified_identity_pair_assertion$
DECLARE
  workflow_status text;
  workflow_fingerprint character(64);
BEGIN
  SELECT status, canonical_fingerprint INTO workflow_status, workflow_fingerprint
  FROM saas.registration_workflows
  WHERE attempt_id = NEW.attempt_id;

  IF NOT FOUND
     OR workflow_status <> 'identity_verified'
     OR workflow_fingerprint IS DISTINCT FROM NEW.canonical_fingerprint THEN
    RAISE EXCEPTION 'PHASE2B1B1_UNPAIRED_VERIFIED_IDENTITY';
  END IF;
  RETURN NULL;
END
$phase2b1b1_verified_identity_pair_assertion$;

CREATE TRIGGER registration_verified_identities_insert_guard
BEFORE INSERT ON saas.registration_verified_identities
FOR EACH ROW EXECUTE FUNCTION saas.guard_registration_verified_identity_insert();

CREATE TRIGGER registration_verified_identities_immutable_guard
BEFORE UPDATE ON saas.registration_verified_identities
FOR EACH ROW EXECUTE FUNCTION saas.guard_registration_verified_identity_mutation();

CREATE CONSTRAINT TRIGGER registration_verified_identities_pair_guard
AFTER INSERT ON saas.registration_verified_identities
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION saas.assert_registration_verified_identity_pair();

CREATE TRIGGER registration_verified_identity_transition_guard
BEFORE UPDATE OF status, canonical_fingerprint ON saas.registration_workflows
FOR EACH ROW EXECUTE FUNCTION saas.guard_registration_verified_identity_transition();

COMMIT;
