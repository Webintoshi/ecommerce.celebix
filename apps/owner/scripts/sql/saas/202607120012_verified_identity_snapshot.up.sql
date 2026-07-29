-- Phase 2B1B1 encrypted verified-identity authority and paired workflow transition guards.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.registration_workflows
  ADD COLUMN tenant_idempotency_digest character(64) NOT NULL,
  ADD CONSTRAINT registration_workflows_tenant_idempotency_digest_format
    CHECK (tenant_idempotency_digest ~ '^[a-f0-9]{64}$');

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
  tenant_operation_id uuid,
  CONSTRAINT registration_tenant_completions_workflow_fk
    FOREIGN KEY (attempt_id) REFERENCES saas.registration_workflows(attempt_id) ON DELETE CASCADE,
  CONSTRAINT registration_tenant_completions_tenant_operation_fk
    FOREIGN KEY (tenant_operation_id) REFERENCES saas.tenant_operations(id) ON DELETE RESTRICT,
  CONSTRAINT registration_tenant_completions_tenant_operation_key
    UNIQUE (tenant_operation_id),
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
      (state = 'ready' AND started_at IS NULL AND commit_unknown_at IS NULL AND completed_at IS NULL AND tenant_operation_id IS NULL)
      OR (state = 'creating' AND started_at IS NOT NULL AND commit_unknown_at IS NULL AND completed_at IS NULL AND tenant_operation_id IS NULL)
      OR (state = 'commit_unknown' AND started_at IS NOT NULL AND commit_unknown_at IS NOT NULL AND completed_at IS NULL AND tenant_operation_id IS NULL)
      OR (state = 'completed' AND started_at IS NOT NULL AND commit_unknown_at IS NULL AND completed_at IS NOT NULL AND recovery_absent_at IS NULL AND tenant_operation_id IS NOT NULL)
  )
);

CREATE VIEW saas.registration_tenant_operation_proofs
WITH (security_barrier = true)
AS
SELECT
  operation.id AS operation_id,
  operation.payload_fingerprint,
  pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(operation.idempotency_key, 'UTF8')),
    'hex'
  ) AS tenant_idempotency_digest,
  operation.requested_at,
  operation.committed_at,
  subscription.valid_from AS subscription_valid_from,
  subscription.valid_until AS subscription_valid_until,
  plan.valid_from AS plan_valid_from,
  plan.valid_until AS plan_valid_until
FROM saas.tenant_operations AS operation
JOIN saas.stores AS store
  ON store.id = operation.result_store_id
JOIN saas.domains AS domain
  ON domain.id = operation.result_domain_id
 AND domain.store_id = store.id
JOIN saas.memberships AS membership
  ON membership.id = operation.result_membership_id
 AND membership.store_id = store.id
JOIN saas.principals AS principal
  ON principal.id = operation.result_principal_id
 AND principal.id = membership.principal_id
JOIN saas.subscriptions AS subscription
  ON subscription.id = operation.result_subscription_id
 AND subscription.store_id = store.id
JOIN saas.plans AS plan
  ON plan.id = operation.result_plan_id
 AND plan.id = subscription.plan_id
 AND plan.plan_code = subscription.plan_code
 AND plan.version = subscription.plan_version
WHERE operation.status = 'committed'
  AND operation.result_payload IS NOT NULL
  AND operation.result_payload -> 'replayed' = 'false'::jsonb
  AND (operation.result_payload ->> 'operationId')::uuid = operation.id
  AND (operation.result_payload #>> '{store,id}')::uuid = store.id
  AND operation.result_payload #>> '{store,slug}' = store.slug
  AND operation.result_payload #>> '{store,status}' = store.status
  AND store.status = 'active'
  AND (operation.result_payload #>> '{primaryDomain,domainId}')::uuid = domain.id
  AND (operation.result_payload #>> '{primaryDomain,storeId}')::uuid = store.id
  AND operation.result_payload #>> '{primaryDomain,storeSlug}' = store.slug
  AND operation.result_payload #>> '{primaryDomain,hostname}' = domain.normalized_hostname
  AND operation.result_payload #>> '{primaryDomain,canonicalHostname}' = domain.normalized_hostname
  AND operation.result_payload #>> '{primaryDomain,domainType}' = domain.domain_type
  AND operation.result_payload #>> '{primaryDomain,status}' = domain.status
  AND (operation.result_payload #>> '{primaryDomain,cacheVersion}')::bigint = domain.cache_version
  AND domain.domain_type = 'platform_subdomain'
  AND domain.status = 'active'
  AND domain.canonical
  AND operation.result_payload ->> 'storefrontUrl' = 'https://' || domain.normalized_hostname
  AND (operation.result_payload #>> '{membership,id}')::uuid = membership.id
  AND (operation.result_payload #>> '{membership,principalId}')::uuid = principal.id
  AND (operation.result_payload #>> '{membership,storeId}')::uuid = store.id
  AND operation.result_payload #>> '{membership,role}' = membership.role
  AND operation.result_payload #>> '{membership,status}' = membership.status
  AND membership.role = 'store_owner'
  AND membership.status = 'active'
  AND membership.created_at = operation.requested_at
  AND membership.updated_at = operation.requested_at
  AND membership.created_at = (operation.result_payload #>> '{membership,createdAt}')::timestamptz
  AND membership.updated_at = (operation.result_payload #>> '{membership,updatedAt}')::timestamptz
  AND (operation.result_payload #>> '{plan,planId}')::uuid = plan.id
  AND operation.result_payload #>> '{plan,planCode}' = plan.plan_code
  AND (operation.result_payload #>> '{plan,version}')::integer = plan.version
  AND operation.result_payload #>> '{plan,status}' = subscription.status
  AND plan.plan_code = 'free_starter'
  AND plan.version = 1
  AND plan.status = 'active'
  AND subscription.status = 'active'
  AND subscription.valid_from = operation.requested_at
  AND subscription.valid_from = (operation.result_payload #>> '{plan,validFrom}')::timestamptz
  AND (
    (subscription.valid_until IS NULL AND NOT (operation.result_payload -> 'plan' ? 'validUntil'))
    OR (
      subscription.valid_until IS NOT NULL
      AND subscription.valid_until = (operation.result_payload #>> '{plan,validUntil}')::timestamptz
    )
  )
  AND operation.result_payload #> '{plan,features}' = (
    SELECT pg_catalog.jsonb_agg(feature.feature_key ORDER BY feature.feature_ordinal)
    FROM saas.plan_features AS feature
    WHERE feature.plan_id = plan.id AND feature.enabled
  )
  AND operation.result_payload #> '{plan,limits}' = (
    SELECT pg_catalog.jsonb_object_agg(
      limit_row.limit_key,
      limit_row.effective_limit
      ORDER BY limit_row.limit_ordinal
    )
    FROM saas.plan_limits AS limit_row
    WHERE limit_row.plan_id = plan.id
  );

REVOKE ALL ON saas.registration_tenant_operation_proofs FROM PUBLIC;
REVOKE ALL ON saas.registration_tenant_operation_proofs FROM celebix_saas_identity;

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
  completion_tenant_operation_id uuid;
  completion_completed_at timestamptz;
BEGIN
  IF NEW.tenant_idempotency_digest IS DISTINCT FROM OLD.tenant_idempotency_digest THEN
    RAISE EXCEPTION 'PHASE2B1B1_IMMUTABLE_TENANT_IDEMPOTENCY_AUTHORITY';
  END IF;

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
    IF current_user <> 'celebix_saas_owner' THEN
      RAISE EXCEPTION 'PHASE2B1B1_COMPLETED_TENANT_AUTHORITY_REQUIRED';
    END IF;
    SELECT canonical_fingerprint, state, tenant_operation_id, completed_at
      INTO completion_fingerprint, completion_state, completion_tenant_operation_id, completion_completed_at
    FROM saas.registration_tenant_completions
    WHERE attempt_id = OLD.attempt_id;
    IF NOT FOUND
       OR completion_fingerprint IS DISTINCT FROM OLD.canonical_fingerprint
       OR completion_state <> 'completed'
       OR completion_tenant_operation_id IS NULL THEN
      RAISE EXCEPTION 'PHASE2B1B1_COMPLETED_TENANT_AUTHORITY_REQUIRED';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM saas.registration_tenant_operation_proofs AS proof
      WHERE proof.operation_id = completion_tenant_operation_id
        AND proof.payload_fingerprint = OLD.canonical_fingerprint
        AND proof.tenant_idempotency_digest = OLD.tenant_idempotency_digest
        AND proof.requested_at = OLD.requested_at
        AND proof.committed_at <= completion_completed_at
        AND proof.subscription_valid_from <= completion_completed_at
        AND (proof.subscription_valid_until IS NULL OR completion_completed_at < proof.subscription_valid_until)
        AND proof.plan_valid_from <= completion_completed_at
        AND (proof.plan_valid_until IS NULL OR completion_completed_at < proof.plan_valid_until)
    ) THEN
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
     OR NEW.tenant_operation_id IS NOT NULL
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
     OR NOT (
       NEW.tenant_operation_id IS NOT DISTINCT FROM OLD.tenant_operation_id
       OR (
         OLD.tenant_operation_id IS NULL
         AND NEW.state = 'completed'
         AND NEW.tenant_operation_id IS NOT NULL
       )
     )
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
       OR (OLD.state = 'ready' AND OLD.recovery_absent_at IS NOT NULL AND NEW.state = 'commit_unknown')
       OR (OLD.state = 'creating' AND NEW.state IN ('ready', 'commit_unknown', 'completed'))
       OR (OLD.state = 'commit_unknown' AND NEW.state IN ('ready', 'completed'))
     ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_INVALID_TENANT_COMPLETION_TRANSITION';
  END IF;

  IF NEW.state = 'completed' THEN
    IF current_user <> 'celebix_saas_owner' THEN
      RAISE EXCEPTION 'PHASE2B1B1_COMMITTED_OPERATION_PROOF_REQUIRED';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM saas.registration_tenant_operation_proofs AS proof
      JOIN saas.registration_workflows AS workflow
        ON workflow.attempt_id = NEW.attempt_id
      JOIN saas.registration_verified_identities AS snapshot
        ON snapshot.attempt_id = workflow.attempt_id
      WHERE proof.operation_id = NEW.tenant_operation_id
        AND proof.payload_fingerprint = NEW.canonical_fingerprint
        AND proof.payload_fingerprint = workflow.canonical_fingerprint
        AND proof.payload_fingerprint = snapshot.canonical_fingerprint
        AND proof.tenant_idempotency_digest = workflow.tenant_idempotency_digest
        AND proof.requested_at = workflow.requested_at
        AND proof.committed_at <= NEW.completed_at
        AND proof.subscription_valid_from <= NEW.completed_at
        AND (proof.subscription_valid_until IS NULL OR NEW.completed_at < proof.subscription_valid_until)
        AND proof.plan_valid_from <= NEW.completed_at
        AND (proof.plan_valid_until IS NULL OR NEW.completed_at < proof.plan_valid_until)
        AND workflow.status = 'identity_verified'
    ) THEN
      RAISE EXCEPTION 'PHASE2B1B1_COMMITTED_OPERATION_PROOF_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END
$phase2b1b1_tenant_completion_mutation_guard$;

CREATE FUNCTION saas.assert_registration_tenant_completion_pair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b1b1_tenant_completion_pair_assertion$
DECLARE
  workflow_status text;
  workflow_fingerprint character(64);
  workflow_requested_at timestamptz;
  workflow_tenant_idempotency_digest character(64);
  snapshot_fingerprint character(64);
BEGIN
  SELECT workflow.status, workflow.canonical_fingerprint, workflow.requested_at,
         workflow.tenant_idempotency_digest, snapshot.canonical_fingerprint
    INTO workflow_status, workflow_fingerprint, workflow_requested_at,
         workflow_tenant_idempotency_digest, snapshot_fingerprint
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
  IF NEW.state = 'completed' AND NOT EXISTS (
    SELECT 1
    FROM saas.registration_tenant_operation_proofs AS proof
    WHERE proof.operation_id = NEW.tenant_operation_id
      AND proof.payload_fingerprint = NEW.canonical_fingerprint
      AND proof.tenant_idempotency_digest = workflow_tenant_idempotency_digest
      AND proof.requested_at = workflow_requested_at
      AND proof.committed_at <= NEW.completed_at
      AND proof.subscription_valid_from <= NEW.completed_at
      AND (proof.subscription_valid_until IS NULL OR NEW.completed_at < proof.subscription_valid_until)
      AND proof.plan_valid_from <= NEW.completed_at
      AND (proof.plan_valid_until IS NULL OR NEW.completed_at < proof.plan_valid_until)
  ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_UNPAIRED_COMMITTED_OPERATION_PROOF';
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

CREATE FUNCTION saas.finalize_registration_tenant_completion(
  p_attempt_id text,
  p_expected_workflow_version bigint,
  p_expected_completion_version bigint,
  p_expected_completion_state text,
  p_tenant_operation_id uuid,
  p_server_timestamp timestamptz
)
RETURNS TABLE (workflow_version bigint, completion_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $phase2b1b1_finalize_tenant_completion$
DECLARE
  current_workflow_status text;
  current_workflow_version bigint;
  current_workflow_fingerprint character(64);
  current_workflow_requested_at timestamptz;
  current_workflow_tenant_idempotency_digest character(64);
  current_workflow_updated_at timestamptz;
  current_completion_state text;
  current_completion_version bigint;
  current_completion_fingerprint character(64);
  current_completion_updated_at timestamptz;
  current_completion_started_at timestamptz;
  current_completion_operation_id uuid;
  snapshot_fingerprint character(64);
  final_workflow_version bigint;
  final_completion_version bigint;
BEGIN
  IF p_expected_completion_state NOT IN ('creating', 'commit_unknown')
     OR p_expected_workflow_version < 1
     OR p_expected_completion_version < 1
     OR p_tenant_operation_id IS NULL
     OR p_server_timestamp IS NULL THEN
    RAISE EXCEPTION 'PHASE2B1B1_TENANT_COMPLETION_CONFLICT';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_attempt_id, 2607120012)
  );

  SELECT status, version, canonical_fingerprint, requested_at, tenant_idempotency_digest, updated_at
    INTO current_workflow_status, current_workflow_version, current_workflow_fingerprint,
         current_workflow_requested_at, current_workflow_tenant_idempotency_digest,
         current_workflow_updated_at
  FROM saas.registration_workflows
  WHERE attempt_id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PHASE2B1B1_TENANT_COMPLETION_ATTEMPT_MISSING';
  END IF;

  SELECT completion.state, completion.version, completion.canonical_fingerprint,
         completion.updated_at, completion.started_at, completion.tenant_operation_id,
         snapshot.canonical_fingerprint
    INTO current_completion_state, current_completion_version, current_completion_fingerprint,
         current_completion_updated_at, current_completion_started_at, current_completion_operation_id,
         snapshot_fingerprint
  FROM saas.registration_tenant_completions AS completion
  JOIN saas.registration_verified_identities AS snapshot
    ON snapshot.attempt_id = completion.attempt_id
  WHERE completion.attempt_id = p_attempt_id
  FOR UPDATE OF completion;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PHASE2B1B1_TENANT_COMPLETION_PROOF_INVALID';
  END IF;

  IF current_workflow_status <> 'identity_verified'
     OR current_workflow_version <> p_expected_workflow_version
     OR current_completion_state <> p_expected_completion_state
     OR current_completion_version <> p_expected_completion_version
     OR current_completion_state NOT IN ('creating', 'commit_unknown')
     OR current_completion_operation_id IS NOT NULL
     OR current_completion_started_at IS NULL
     OR p_server_timestamp < current_workflow_updated_at
     OR p_server_timestamp < current_completion_updated_at THEN
    RAISE EXCEPTION 'PHASE2B1B1_TENANT_COMPLETION_CONFLICT';
  END IF;

  IF current_workflow_fingerprint IS NULL
     OR current_completion_fingerprint IS DISTINCT FROM current_workflow_fingerprint
     OR snapshot_fingerprint IS DISTINCT FROM current_workflow_fingerprint
     OR EXISTS (
       SELECT 1
       FROM saas.registration_tenant_completions AS reused
       WHERE reused.tenant_operation_id = p_tenant_operation_id
         AND reused.attempt_id <> p_attempt_id
     )
     OR NOT EXISTS (
       SELECT 1
       FROM saas.registration_tenant_operation_proofs AS proof
       WHERE proof.operation_id = p_tenant_operation_id
         AND proof.payload_fingerprint = current_workflow_fingerprint
         AND proof.tenant_idempotency_digest = current_workflow_tenant_idempotency_digest
         AND proof.requested_at = current_workflow_requested_at
         AND proof.committed_at <= p_server_timestamp
         AND proof.subscription_valid_from <= p_server_timestamp
         AND (proof.subscription_valid_until IS NULL OR p_server_timestamp < proof.subscription_valid_until)
         AND proof.plan_valid_from <= p_server_timestamp
         AND (proof.plan_valid_until IS NULL OR p_server_timestamp < proof.plan_valid_until)
     ) THEN
    RAISE EXCEPTION 'PHASE2B1B1_TENANT_COMPLETION_PROOF_INVALID';
  END IF;

  UPDATE saas.registration_tenant_completions
  SET state = 'completed',
      version = version + 1,
      updated_at = p_server_timestamp,
      completed_at = p_server_timestamp,
      commit_unknown_at = NULL,
      recovery_absent_at = NULL,
      tenant_operation_id = p_tenant_operation_id
  WHERE attempt_id = p_attempt_id
    AND state = p_expected_completion_state
    AND version = p_expected_completion_version
    AND tenant_operation_id IS NULL
  RETURNING version INTO final_completion_version;

  IF final_completion_version IS NULL THEN
    RAISE EXCEPTION 'PHASE2B1B1_TENANT_COMPLETION_CONFLICT';
  END IF;

  UPDATE saas.registration_workflows
  SET status = 'tenant_created',
      version = version + 1,
      updated_at = p_server_timestamp
  WHERE attempt_id = p_attempt_id
    AND status = 'identity_verified'
    AND version = p_expected_workflow_version
    AND canonical_fingerprint = current_workflow_fingerprint
  RETURNING version INTO final_workflow_version;

  IF final_workflow_version IS NULL THEN
    RAISE EXCEPTION 'PHASE2B1B1_TENANT_COMPLETION_CONFLICT';
  END IF;

  RETURN QUERY SELECT final_workflow_version, final_completion_version;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'PHASE2B1B1_TENANT_COMPLETION_PROOF_INVALID';
END
$phase2b1b1_finalize_tenant_completion$;

ALTER FUNCTION saas.finalize_registration_tenant_completion(text, bigint, bigint, text, uuid, timestamptz)
  OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.finalize_registration_tenant_completion(text, bigint, bigint, text, uuid, timestamptz)
  FROM PUBLIC;

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
BEFORE UPDATE OF status, canonical_fingerprint, tenant_idempotency_digest ON saas.registration_workflows
FOR EACH ROW EXECUTE FUNCTION saas.guard_registration_verified_identity_transition();

COMMIT;
