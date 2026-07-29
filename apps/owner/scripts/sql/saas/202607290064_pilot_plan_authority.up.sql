-- Deterministic pilot v1 plan authority and bootstrap-only store assignment.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('phase3:pilot:v1', 0)
);

DO $pilot_plan_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.plans') IS NULL
    OR pg_catalog.to_regclass('saas.plan_features') IS NULL
    OR pg_catalog.to_regclass('saas.plan_limits') IS NULL
    OR pg_catalog.to_regclass('saas.subscriptions') IS NULL
    OR pg_catalog.to_regclass('saas.stores') IS NULL THEN
    RAISE EXCEPTION 'PILOT_PLAN_PRECONDITION_FAILED: Phase 2A1 plan authority is missing';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger
    WHERE tgrelid IN (
      'saas.plans'::pg_catalog.regclass,
      'saas.plan_features'::pg_catalog.regclass,
      'saas.plan_limits'::pg_catalog.regclass
    )
      AND tgname IN (
        'plan_versions_immutable',
        'plan_features_immutable',
        'plan_limits_immutable'
      )
      AND tgenabled = 'O'
  ) <> 3 THEN
    RAISE EXCEPTION 'PILOT_PLAN_PRECONDITION_FAILED: immutable plan triggers are not enabled';
  END IF;
END
$pilot_plan_precondition$;

DO $pilot_plan_seed$
DECLARE
  pilot_plan_id constant uuid := '00000000-0000-4000-8000-000000000002';
  pilot_time constant timestamptz := '2026-07-29T00:00:00.000Z';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM saas.plans
    WHERE id = pilot_plan_id OR (plan_code = 'pilot' AND version = 1)
  ) AND NOT EXISTS (
    SELECT 1
    FROM saas.plans
    WHERE id = pilot_plan_id
      AND plan_code = 'pilot'
      AND version = 1
      AND status = 'active'
      AND valid_from = pilot_time
      AND valid_until IS NULL
      AND created_at = pilot_time
      AND updated_at = pilot_time
  ) THEN
    RAISE EXCEPTION 'PILOT_PLAN_SEED_DRIFT: plan identity or immutable fields differ';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM saas.plans
    WHERE id = pilot_plan_id AND plan_code = 'pilot' AND version = 1
  ) THEN
    INSERT INTO saas.plans (
      id, plan_code, version, status, valid_from, valid_until, created_at, updated_at
    ) VALUES (
      pilot_plan_id, 'pilot', 1, 'active', pilot_time, NULL, pilot_time, pilot_time
    );

    ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
    ALTER TABLE saas.plan_limits DISABLE TRIGGER plan_limits_immutable;

    INSERT INTO saas.plan_features (plan_id, feature_key, feature_ordinal, enabled)
    VALUES
      (pilot_plan_id, 'catalog', 1, true),
      (pilot_plan_id, 'orders', 2, true),
      (pilot_plan_id, 'customers', 3, true),
      (pilot_plan_id, 'content', 4, true),
      (pilot_plan_id, 'media', 5, true),
      (pilot_plan_id, 'analytics', 6, true),
      (pilot_plan_id, 'checkout', 7, true),
      (pilot_plan_id, 'custom_domains', 8, true),
      (pilot_plan_id, 'staff_management', 9, true),
      (pilot_plan_id, 'promotions', 10, true),
      (pilot_plan_id, 'integrations', 11, true),
      (pilot_plan_id, 'accounting', 12, true),
      (pilot_plan_id, 'marketplaces', 13, true);

    INSERT INTO saas.plan_limits (plan_id, limit_key, limit_value, limit_ordinal)
    VALUES
      (pilot_plan_id, 'products', 2000, 1),
      (pilot_plan_id, 'staff', 5, 2),
      (pilot_plan_id, 'storageBytes', 10000000000, 3),
      (pilot_plan_id, 'monthlyOrders', 10000, 4),
      (pilot_plan_id, 'customDomains', 1, 5);

    ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;
    ALTER TABLE saas.plan_limits ENABLE TRIGGER plan_limits_immutable;
  END IF;

  IF EXISTS (
    WITH expected(feature_key, feature_ordinal, enabled) AS (
      VALUES
        ('catalog', 1::smallint, true),
        ('orders', 2::smallint, true),
        ('customers', 3::smallint, true),
        ('content', 4::smallint, true),
        ('media', 5::smallint, true),
        ('analytics', 6::smallint, true),
        ('checkout', 7::smallint, true),
        ('custom_domains', 8::smallint, true),
        ('staff_management', 9::smallint, true),
        ('promotions', 10::smallint, true),
        ('integrations', 11::smallint, true),
        ('accounting', 12::smallint, true),
        ('marketplaces', 13::smallint, true)
    )
    SELECT 1
    FROM expected
    FULL JOIN (
      SELECT feature_key, feature_ordinal, enabled
      FROM saas.plan_features
      WHERE plan_id = pilot_plan_id
    ) actual USING (feature_key)
    WHERE expected.feature_key IS NULL
      OR actual.feature_key IS NULL
      OR actual.feature_ordinal IS DISTINCT FROM expected.feature_ordinal
      OR actual.enabled IS DISTINCT FROM expected.enabled
  ) THEN
    RAISE EXCEPTION 'PILOT_PLAN_SEED_DRIFT: feature registry differs';
  END IF;

  IF EXISTS (
    WITH expected(limit_key, limit_value, limit_ordinal) AS (
      VALUES
        ('products', 2000::numeric, 1::smallint),
        ('staff', 5::numeric, 2::smallint),
        ('storageBytes', 10000000000::numeric, 3::smallint),
        ('monthlyOrders', 10000::numeric, 4::smallint),
        ('customDomains', 1::numeric, 5::smallint)
    )
    SELECT 1
    FROM expected
    FULL JOIN (
      SELECT limit_key, limit_value, limit_ordinal, effective_limit
      FROM saas.plan_limits
      WHERE plan_id = pilot_plan_id
    ) actual USING (limit_key)
    WHERE expected.limit_key IS NULL
      OR actual.limit_key IS NULL
      OR actual.limit_value IS DISTINCT FROM expected.limit_value
      OR actual.limit_ordinal IS DISTINCT FROM expected.limit_ordinal
      OR actual.effective_limit IS DISTINCT FROM pg_catalog.floor(expected.limit_value)::bigint
  ) THEN
    RAISE EXCEPTION 'PILOT_PLAN_SEED_DRIFT: limit registry differs';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_trigger
    WHERE tgrelid IN (
      'saas.plans'::pg_catalog.regclass,
      'saas.plan_features'::pg_catalog.regclass,
      'saas.plan_limits'::pg_catalog.regclass
    )
      AND tgname IN (
        'plan_versions_immutable',
        'plan_features_immutable',
        'plan_limits_immutable'
      )
      AND tgenabled = 'O'
  ) <> 3 THEN
    RAISE EXCEPTION 'PILOT_PLAN_SEED_DRIFT: immutable triggers were not restored';
  END IF;
END
$pilot_plan_seed$;

CREATE OR REPLACE FUNCTION saas.assign_store_plan(
  p_store_id uuid,
  p_expected_subscription_id uuid,
  p_expected_plan_code text,
  p_expected_plan_version bigint,
  p_target_subscription_id uuid,
  p_target_plan_code text,
  p_target_plan_version bigint,
  p_now timestamptz
)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, saas
AS $assign_store_plan$
DECLARE
  locked_store saas.stores%ROWTYPE;
  current_subscription saas.subscriptions%ROWTYPE;
  existing_target saas.subscriptions%ROWTYPE;
  target_plan saas.plans%ROWTYPE;
  replay_previous saas.subscriptions%ROWTYPE;
BEGIN
  IF p_store_id IS NULL
    OR p_expected_subscription_id IS NULL
    OR p_target_subscription_id IS NULL
    OR p_expected_subscription_id = p_target_subscription_id
    OR p_expected_plan_code IS NULL
    OR p_expected_plan_code <> pg_catalog.lower(pg_catalog.btrim(p_expected_plan_code))
    OR pg_catalog.char_length(p_expected_plan_code) NOT BETWEEN 1 AND 80
    OR p_expected_plan_code !~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    OR p_target_plan_code IS NULL
    OR p_target_plan_code <> pg_catalog.lower(pg_catalog.btrim(p_target_plan_code))
    OR pg_catalog.char_length(p_target_plan_code) NOT BETWEEN 1 AND 80
    OR p_target_plan_code !~ '^[a-z0-9]+(_[a-z0-9]+)*$'
    OR p_expected_plan_version IS NULL
    OR p_expected_plan_version <= 0
    OR p_expected_plan_version > 2147483647
    OR p_target_plan_version IS NULL
    OR p_target_plan_version <= 0
    OR p_target_plan_version > 2147483647
    OR p_now IS NULL THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT subscription.*
  INTO existing_target
  FROM saas.subscriptions AS subscription
  WHERE subscription.id = p_target_subscription_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing_target.store_id <> p_store_id
      OR existing_target.plan_code <> p_target_plan_code
      OR existing_target.plan_version <> p_target_plan_version
      OR existing_target.status <> 'active'
      OR existing_target.valid_from <> p_now
      OR existing_target.valid_until IS NOT NULL THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;

    SELECT subscription.*
    INTO replay_previous
    FROM saas.subscriptions AS subscription
    WHERE subscription.id = p_expected_subscription_id
    FOR UPDATE;

    IF NOT FOUND
      OR replay_previous.store_id <> p_store_id
      OR replay_previous.plan_code <> p_expected_plan_code
      OR replay_previous.plan_version <> p_expected_plan_version
      OR replay_previous.status <> 'inactive'
      OR replay_previous.valid_until <> p_now THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
      RETURN;
    END IF;

    RETURN QUERY SELECT 'operation_replayed'::text, pg_catalog.jsonb_build_object(
      'storeId', existing_target.store_id,
      'previousSubscriptionId', replay_previous.id,
      'subscriptionId', existing_target.id,
      'planId', existing_target.plan_id,
      'planCode', existing_target.plan_code,
      'planVersion', existing_target.plan_version
    );
    RETURN;
  END IF;

  SELECT store.*
  INTO locked_store
  FROM saas.stores AS store
  WHERE store.id = p_store_id
    AND store.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'store_not_found'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT subscription.*
  INTO current_subscription
  FROM saas.subscriptions AS subscription
  WHERE subscription.store_id = p_store_id
    AND subscription.status = 'active'
  FOR UPDATE;

  IF NOT FOUND
    OR current_subscription.id <> p_expected_subscription_id
    OR current_subscription.plan_code <> p_expected_plan_code
    OR current_subscription.plan_version <> p_expected_plan_version THEN
    RETURN QUERY SELECT 'subscription_not_found'::text, NULL::jsonb;
    RETURN;
  END IF;

  SELECT plan.*
  INTO target_plan
  FROM saas.plans AS plan
  WHERE plan.plan_code = p_target_plan_code
    AND plan.version = p_target_plan_version
    AND plan.status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'plan_not_found'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF target_plan.valid_from > p_now
    OR (target_plan.valid_until IS NOT NULL AND target_plan.valid_until <= p_now) THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF current_subscription.plan_id = target_plan.id
    AND current_subscription.plan_code = target_plan.plan_code
    AND current_subscription.plan_version = target_plan.version THEN
    RETURN QUERY SELECT 'plan_unchanged'::text, NULL::jsonb;
    RETURN;
  END IF;

  IF p_now <= current_subscription.valid_from THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb;
    RETURN;
  END IF;

  UPDATE saas.subscriptions
  SET status = 'inactive',
      valid_until = p_now,
      updated_at = p_now
  WHERE id = current_subscription.id;

  INSERT INTO saas.subscriptions (
    id, store_id, plan_id, plan_code, plan_version, status,
    valid_from, valid_until, created_at, updated_at
  ) VALUES (
    p_target_subscription_id,
    p_store_id,
    target_plan.id,
    target_plan.plan_code,
    target_plan.version,
    'active',
    p_now,
    NULL,
    p_now,
    p_now
  );

  RETURN QUERY SELECT 'assigned'::text, pg_catalog.jsonb_build_object(
    'storeId', p_store_id,
    'previousSubscriptionId', current_subscription.id,
    'subscriptionId', p_target_subscription_id,
    'planId', target_plan.id,
    'planCode', target_plan.plan_code,
    'planVersion', target_plan.version
  );
END
$assign_store_plan$;

ALTER FUNCTION saas.assign_store_plan(uuid, uuid, text, bigint, uuid, text, bigint, timestamptz)
  OWNER TO celebix_saas_owner;

REVOKE ALL ON FUNCTION saas.assign_store_plan(uuid, uuid, text, bigint, uuid, text, bigint, timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.assign_store_plan(uuid, uuid, text, bigint, uuid, text, bigint, timestamptz)
  FROM celebix_saas_migrator, celebix_saas_app, celebix_saas_workflow,
       celebix_saas_host_resolver, celebix_saas_observability;
DO $pilot_plan_identity_revoke$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'celebix_saas_identity') THEN
    REVOKE ALL ON FUNCTION saas.assign_store_plan(
      uuid, uuid, text, bigint, uuid, text, bigint, timestamptz
    ) FROM celebix_saas_identity;
  END IF;
END
$pilot_plan_identity_revoke$;
GRANT EXECUTE ON FUNCTION saas.assign_store_plan(uuid, uuid, text, bigint, uuid, text, bigint, timestamptz)
  TO celebix_saas_bootstrap;

COMMIT;
