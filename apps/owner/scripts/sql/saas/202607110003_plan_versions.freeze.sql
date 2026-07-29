-- Seal the seeded plan-version authority after deterministic seed verification.
-- Any later plan version requires a separately reviewed migration that explicitly controls this seal.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase2a1_plan_freeze_precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM saas.plans
    WHERE id = '00000000-0000-4000-8000-000000000001'
      AND plan_code = 'free_starter'
      AND version = 1
      AND status = 'active'
  )
  OR (SELECT count(*) FROM saas.plan_features WHERE plan_id = '00000000-0000-4000-8000-000000000001') <> 13
  OR (SELECT count(*) FROM saas.plan_limits WHERE plan_id = '00000000-0000-4000-8000-000000000001') <> 5 THEN
    RAISE EXCEPTION 'PHASE2A1_PLAN_FREEZE_PRECONDITION_FAILED: frozen seed is absent or incomplete';
  END IF;
END
$phase2a1_plan_freeze_precondition$;

CREATE TRIGGER plan_versions_immutable
BEFORE UPDATE OR DELETE ON saas.plans
FOR EACH ROW EXECUTE FUNCTION saas.reject_plan_version_mutation();

CREATE TRIGGER plan_features_immutable
BEFORE INSERT OR UPDATE OR DELETE ON saas.plan_features
FOR EACH ROW EXECUTE FUNCTION saas.reject_plan_version_mutation();

CREATE TRIGGER plan_limits_immutable
BEFORE INSERT OR UPDATE OR DELETE ON saas.plan_limits
FOR EACH ROW EXECUTE FUNCTION saas.reject_plan_version_mutation();

COMMIT;
