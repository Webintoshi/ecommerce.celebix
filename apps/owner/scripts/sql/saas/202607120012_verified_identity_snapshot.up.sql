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

CREATE TABLE saas.registration_tenant_completions (
  attempt_id text PRIMARY KEY,
  canonical_fingerprint character(64) NOT NULL,
  state text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  started_at timestamptz,
  updated_at timestamptz NOT NULL,
  commit_unknown_at timestamptz,
  completed_at timestamptz,
  recovery_absent_at timestamptz,
  CONSTRAINT registration_tenant_completions_workflow_fk
    FOREIGN KEY (attempt_id) REFERENCES saas.registration_workflows(attempt_id) ON DELETE CASCADE,
  CONSTRAINT registration_tenant_completions_attempt_id_format
    CHECK (attempt_id ~ '^attempt_[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT registration_tenant_completions_fingerprint_format
    CHECK (canonical_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT registration_tenant_completions_state
    CHECK (state IN ('ready', 'creating', 'commit_unknown', 'completed')),
  CONSTRAINT registration_tenant_completions_version
    CHECK (version >= 1),
  CONSTRAINT registration_tenant_completions_timestamp_order
    CHECK (
      (started_at IS NULL OR started_at <= updated_at)
      AND (commit_unknown_at IS NULL OR (started_at IS NOT NULL AND commit_unknown_at >= started_at))
      AND (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at))
      AND (recovery_absent_at IS NULL OR recovery_absent_at <= updated_at)
    ),
  CONSTRAINT registration_tenant_completions_state_shape
    CHECK (
      (state = 'ready' AND started_at IS NULL AND commit_unknown_at IS NULL AND completed_at IS NULL)
      OR (state = 'creating' AND started_at IS NOT NULL AND commit_unknown_at IS NULL AND completed_at IS NULL)
      OR (state = 'commit_unknown' AND started_at IS NOT NULL AND commit_unknown_at IS NOT NULL AND completed_at IS NULL)
      OR (state = 'completed' AND started_at IS NOT NULL AND commit_unknown_at IS NULL AND completed_at IS NOT NULL AND recovery_absent_at IS NULL)
    )
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
  completion_fingerprint character(64);
  completion_state text;
  completion_recovery_absent_at timestamptz;
BEGIN
  IF OLD.status = 'awaiting_identity' AND NEW.status = 'identity_verified' THEN
    SELECT canonical_fingerprint INTO snapshot_fingerprint
    FROM saas.registration_verified_identities
    WHERE attempt_id = OLD.attempt_id;

    SELECT canonical_fingerprint, state INTO completion_fingerprint, completion_state
    FROM saas.registration_tenant_completions
    WHERE attempt_id = OLD.attempt_id;

    IF NOT FOUND
       OR snapshot_fingerprint IS DISTINCT FROM NEW.canonical_fingerprint
       OR completion_fingerprint IS DISTINCT FROM NEW.canonical_fingerprint
       OR completion_state <> 'ready' THEN
      RAISE EXCEPTION 'PHASE2B1B1_VERIFIED_IDENTITY_REQUIRED';
    END IF;
  ELSIF OLD.status = 'identity_verified' AND NEW.status = 'tenant_created' THEN
    SELECT canonical_fingerprint, state INTO completion_fingerprint, completion_state
    FROM saas.registration_tenant_completions
    WHERE attempt_id = OLD.attempt_id;
    IF NOT FOUND
       OR completion_fingerprint IS DISTINCT FROM OLD.canonical_fingerprint
       OR completion_state <> 'completed' THEN
      RAISE EXCEPTION 'PHASE2B1B1_COMPLETED_TENANT_AUTHORITY_REQUIRED';
    END IF;
  ELSIF OLD.status = 'identity_verified' AND NEW.status IN ('failed', 'expired', 'cancelled') THEN
    SELECT state, recovery_absent_at INTO completion_state, completion_recovery_absent_at
    FROM saas.registration_tenant_completions
    WHERE attempt_id = OLD.attempt_id;
    IF NOT FOUND OR completion_state <> 'ready' OR completion_recovery_absent_at IS NOT NULL THEN
      RAISE EXCEPTION 'PHASE2B1B1_ACTIVE_TENANT_COMPLETION_FENCED';
    END IF;
  ELSIF OLD.status IN ('tenant_created', 'session_created')
        AND NEW.status NOT IN ('tenant_created', 'session_created') THEN
    RAISE EXCEPTION 'PHASE2B1B1_COMPLETED_TENANT_AUTHORITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END
$phase2b1b1_verified_identity_transition_guard$;

CREATE FUNCTION saas.guard_registration_tenant_completion_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b1b1_tenant_completion_insert_guard$
DECLARE
  workflow_status text;
  workflow_consumed_at timestamptz;
  workflow_fingerprint character(64);
  snapshot_fingerprint character(64);
  snapshot_recorded_at timestamptz;
BEGIN
  SELECT workflow.status, workflow.consumed_at, workflow.canonical_fingerprint,
         snapshot.canonical_fingerprint, snapshot.recorded_at
    INTO workflow_status, workflow_consumed_at, workflow_fingerprint,
         snapshot_fingerprint, snapshot_recorded_at
  FROM saas.registration_workflows AS workflow
  JOIN saas.registration_verified_identities AS snapshot ON snapshot.attempt_id = workflow.attempt_id
  WHERE workflow.attempt_id = NEW.attempt_id
  FOR KEY SHARE OF workflow;

  IF NOT FOUND
     OR workflow_status <> 'awaiting_identity'
     OR workflow_consumed_at IS NULL
     OR workflow_fingerprint IS NOT NULL
     OR snapshot_fingerprint IS DISTINCT FROM NEW.canonical_fingerprint
     OR NEW.state <> 'ready'
     OR NEW.version <> 1
     OR NEW.recovery_absent_at IS NOT NULL
     OR NEW.updated_at < snapshot_recorded_at THEN
    RAISE EXCEPTION 'PHASE2B1B1_INVALID_TENANT_COMPLETION_INSERT';
  END IF;
  RETURN NEW;
END
$phase2b1b1_tenant_completion_insert_guard$;

CREATE FUNCTION saas.guard_registration_tenant_completion_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b1b1_tenant_completion_mutation_guard$
BEGIN
  IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
     OR NEW.canonical_fingerprint IS DISTINCT FROM OLD.canonical_fingerprint
     OR NEW.version <> OLD.version + 1
     OR NEW.updated_at < OLD.updated_at
     OR NOT (
       NEW.recovery_absent_at IS NOT DISTINCT FROM OLD.recovery_absent_at
       OR (NEW.state = 'ready' AND OLD.state IN ('creating', 'commit_unknown')
           AND OLD.recovery_absent_at IS NULL AND NEW.recovery_absent_at = NEW.updated_at)
       OR (NEW.state = 'completed' AND NEW.recovery_absent_at IS NULL)
     )
     OR NOT (
       (OLD.state = 'ready' AND NEW.state = 'creating')
       OR (OLD.state = 'creating' AND NEW.state IN ('ready', 'commit_unknown', 'completed'))
       OR (OLD.state = 'commit_unknown' AND NEW.state IN ('ready', 'completed'))
     ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_INVALID_TENANT_COMPLETION_TRANSITION';
  END IF;
  RETURN NEW;
END
$phase2b1b1_tenant_completion_mutation_guard$;

CREATE FUNCTION saas.assert_registration_tenant_completion_pair()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, saas
AS $phase2b1b1_tenant_completion_pair_assertion$
DECLARE
  workflow_status text;
  workflow_fingerprint character(64);
  snapshot_fingerprint character(64);
BEGIN
  SELECT workflow.status, workflow.canonical_fingerprint, snapshot.canonical_fingerprint
    INTO workflow_status, workflow_fingerprint, snapshot_fingerprint
  FROM saas.registration_workflows AS workflow
  JOIN saas.registration_verified_identities AS snapshot ON snapshot.attempt_id = workflow.attempt_id
  WHERE workflow.attempt_id = NEW.attempt_id;

  IF NOT FOUND
     OR snapshot_fingerprint IS DISTINCT FROM NEW.canonical_fingerprint
     OR workflow_fingerprint IS DISTINCT FROM NEW.canonical_fingerprint
     OR (NEW.state = 'completed' AND workflow_status NOT IN ('tenant_created', 'session_created'))
     OR (NEW.state IN ('creating', 'commit_unknown') AND workflow_status <> 'identity_verified')
     OR (NEW.state = 'ready' AND workflow_status NOT IN ('identity_verified', 'failed', 'expired', 'cancelled')) THEN
    RAISE EXCEPTION 'PHASE2B1B1_UNPAIRED_TENANT_COMPLETION';
  END IF;
  RETURN NULL;
END
$phase2b1b1_tenant_completion_pair_assertion$;

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

CREATE TRIGGER registration_tenant_completions_insert_guard
BEFORE INSERT ON saas.registration_tenant_completions
FOR EACH ROW EXECUTE FUNCTION saas.guard_registration_tenant_completion_insert();

CREATE TRIGGER registration_tenant_completions_transition_guard
BEFORE UPDATE ON saas.registration_tenant_completions
FOR EACH ROW EXECUTE FUNCTION saas.guard_registration_tenant_completion_mutation();

CREATE CONSTRAINT TRIGGER registration_verified_identities_pair_guard
AFTER INSERT ON saas.registration_verified_identities
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION saas.assert_registration_verified_identity_pair();

CREATE CONSTRAINT TRIGGER registration_tenant_completions_pair_guard
AFTER INSERT OR UPDATE ON saas.registration_tenant_completions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION saas.assert_registration_tenant_completion_pair();

CREATE TRIGGER registration_verified_identity_transition_guard
BEFORE UPDATE OF status, canonical_fingerprint ON saas.registration_workflows
FOR EACH ROW EXECUTE FUNCTION saas.guard_registration_verified_identity_transition();

COMMIT;
