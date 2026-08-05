-- Deterministic frozen free_starter v1 seed and drift verifier.
-- Reapplication is read/verify-only after the exact seed exists.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('phase2a1:free_starter:v1', 0)
);

DO $phase2a1_free_starter_seed$
DECLARE
  frozen_plan_id constant uuid := '00000000-0000-4000-8000-000000000001';
  frozen_time constant timestamptz := '2026-01-01T00:00:00.000Z';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM saas.plans
    WHERE id = frozen_plan_id OR (plan_code = 'free_starter' AND version = 1)
  ) AND NOT EXISTS (
    SELECT 1
    FROM saas.plans
    WHERE id = frozen_plan_id
      AND plan_code = 'free_starter'
      AND version = 1
      AND status = 'active'
      AND valid_from = frozen_time
      AND valid_until IS NULL
      AND created_at = frozen_time
      AND updated_at = frozen_time
  ) THEN
    RAISE EXCEPTION 'FREE_STARTER_SEED_DRIFT: plan identity or immutable fields differ';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM saas.plans
    WHERE id = frozen_plan_id AND plan_code = 'free_starter' AND version = 1
  ) THEN
    INSERT INTO saas.plans (
      id, plan_code, version, status, valid_from, valid_until, created_at, updated_at
    ) VALUES (
      frozen_plan_id, 'free_starter', 1, 'active', frozen_time, NULL, frozen_time, frozen_time
    );

    INSERT INTO saas.plan_features (plan_id, feature_key, feature_ordinal, enabled)
    VALUES
      (frozen_plan_id, 'catalog', 1, true),
      (frozen_plan_id, 'orders', 2, true),
      (frozen_plan_id, 'customers', 3, true),
      (frozen_plan_id, 'content', 4, true),
      (frozen_plan_id, 'media', 5, true),
      (frozen_plan_id, 'analytics', 6, true),
      (frozen_plan_id, 'checkout', 7, true),
      (frozen_plan_id, 'custom_domains', 8, false),
      (frozen_plan_id, 'staff_management', 9, false),
      (frozen_plan_id, 'promotions', 10, false),
      (frozen_plan_id, 'integrations', 11, false),
      (frozen_plan_id, 'accounting', 12, false),
      (frozen_plan_id, 'marketplaces', 13, false);

    WITH frozen_limits(limit_key, limit_value, limit_ordinal) AS (
      VALUES
        ('products', 100::numeric, 1::smallint),
        ('staff', 1::numeric, 2::smallint),
        ('storageBytes', 1000000000::numeric, 3::smallint),
        ('monthlyOrders', 100::numeric, 4::smallint),
        ('customDomains', 0::numeric, 5::smallint)
    )
    INSERT INTO saas.plan_limits (plan_id, limit_key, limit_value, limit_ordinal)
    SELECT frozen_plan_id, limit_key, limit_value, limit_ordinal
    FROM frozen_limits
    ORDER BY limit_ordinal;
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
        ('custom_domains', 8::smallint, false),
        ('staff_management', 9::smallint, false),
        ('promotions', 10::smallint, false),
        ('integrations', 11::smallint, false),
        ('accounting', 12::smallint, false),
        ('marketplaces', 13::smallint, false)
    )
    SELECT 1
    FROM expected
    FULL JOIN (
      SELECT feature_key, feature_ordinal, enabled
      FROM saas.plan_features
      WHERE plan_id = frozen_plan_id
    ) actual
      ON actual.feature_key = expected.feature_key
    WHERE expected.feature_key IS NULL
       OR actual.feature_key IS NULL
       OR actual.feature_ordinal IS DISTINCT FROM expected.feature_ordinal
       OR actual.enabled IS DISTINCT FROM expected.enabled
  ) THEN
    RAISE EXCEPTION 'FREE_STARTER_SEED_DRIFT: feature registry differs';
  END IF;

  IF EXISTS (
    WITH expected(limit_key, limit_value, limit_ordinal) AS (
      VALUES
        ('products', 100::numeric, 1::smallint),
        ('staff', 1::numeric, 2::smallint),
        ('storageBytes', 1000000000::numeric, 3::smallint),
        ('monthlyOrders', 100::numeric, 4::smallint),
        ('customDomains', 0::numeric, 5::smallint)
    )
    SELECT 1
    FROM expected
    FULL JOIN (
      SELECT limit_key, limit_ordinal, limit_value, effective_limit
      FROM saas.plan_limits
      WHERE plan_id = frozen_plan_id
    ) actual
      ON actual.limit_key = expected.limit_key
    WHERE expected.limit_key IS NULL
       OR actual.limit_key IS NULL
       OR actual.limit_ordinal IS DISTINCT FROM expected.limit_ordinal
       OR actual.limit_value IS DISTINCT FROM expected.limit_value
       OR actual.effective_limit IS DISTINCT FROM pg_catalog.floor(expected.limit_value)::bigint
  ) THEN
    RAISE EXCEPTION 'FREE_STARTER_SEED_DRIFT: limit registry differs';
  END IF;
END
$phase2a1_free_starter_seed$;

COMMIT;
