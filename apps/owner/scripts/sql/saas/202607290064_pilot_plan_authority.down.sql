-- Roll back unreferenced pilot v1 authority without changing free_starter v1.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('phase3:pilot:v1', 0)
);

DO $pilot_plan_rollback_precondition$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM saas.subscriptions
    WHERE plan_id = '00000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'PILOT_PLAN_ROLLBACK_BLOCKED: subscriptions still reference pilot v1';
  END IF;
END
$pilot_plan_rollback_precondition$;

DROP FUNCTION IF EXISTS saas.assign_store_plan(
  uuid, uuid, text, bigint, uuid, text, bigint, timestamptz
);

ALTER TABLE saas.plan_features DISABLE TRIGGER plan_features_immutable;
ALTER TABLE saas.plan_limits DISABLE TRIGGER plan_limits_immutable;
ALTER TABLE saas.plans DISABLE TRIGGER plan_versions_immutable;

DELETE FROM saas.plan_features
WHERE plan_id = '00000000-0000-4000-8000-000000000002';

DELETE FROM saas.plan_limits
WHERE plan_id = '00000000-0000-4000-8000-000000000002';

DELETE FROM saas.plans
WHERE id = '00000000-0000-4000-8000-000000000002'
  AND plan_code = 'pilot'
  AND version = 1;

ALTER TABLE saas.plans ENABLE TRIGGER plan_versions_immutable;
ALTER TABLE saas.plan_features ENABLE TRIGGER plan_features_immutable;
ALTER TABLE saas.plan_limits ENABLE TRIGGER plan_limits_immutable;

COMMIT;
