-- Catalog and snapshot assertions for pilot v1 plan authority.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $pilot_plan_assertions$
DECLARE
  function_oid oid := pg_catalog.to_regprocedure(
    'saas.assign_store_plan(uuid,uuid,text,bigint,uuid,text,bigint,timestamp with time zone)'
  );
  function_source text;
  function_config text[];
  function_acl aclitem[];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM saas.plans
    WHERE id = '00000000-0000-4000-8000-000000000002'
      AND plan_code = 'pilot'
      AND version = 1
      AND status = 'active'
      AND valid_from = '2026-07-29T00:00:00.000Z'
      AND valid_until IS NULL
      AND created_at = '2026-07-29T00:00:00.000Z'
      AND updated_at = '2026-07-29T00:00:00.000Z'
  ) THEN
    RAISE EXCEPTION 'PILOT_PLAN_ASSERTION_FAILED: plan snapshot differs';
  END IF;

  IF (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'key', feature_key,
        'ordinal', feature_ordinal,
        'enabled', enabled
      ) ORDER BY feature_ordinal
    )
    FROM saas.plan_features
    WHERE plan_id = '00000000-0000-4000-8000-000000000002'
  ) IS DISTINCT FROM '[
    {"key":"catalog","ordinal":1,"enabled":true},
    {"key":"orders","ordinal":2,"enabled":true},
    {"key":"customers","ordinal":3,"enabled":true},
    {"key":"content","ordinal":4,"enabled":true},
    {"key":"media","ordinal":5,"enabled":true},
    {"key":"analytics","ordinal":6,"enabled":true},
    {"key":"checkout","ordinal":7,"enabled":true},
    {"key":"custom_domains","ordinal":8,"enabled":true},
    {"key":"staff_management","ordinal":9,"enabled":true},
    {"key":"promotions","ordinal":10,"enabled":true},
    {"key":"integrations","ordinal":11,"enabled":true},
    {"key":"accounting","ordinal":12,"enabled":true},
    {"key":"marketplaces","ordinal":13,"enabled":true}
  ]'::jsonb THEN
    RAISE EXCEPTION 'PILOT_PLAN_ASSERTION_FAILED: feature snapshot differs';
  END IF;

  IF (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'key', limit_key,
        'ordinal', limit_ordinal,
        'value', limit_value,
        'effective', effective_limit
      ) ORDER BY limit_ordinal
    )
    FROM saas.plan_limits
    WHERE plan_id = '00000000-0000-4000-8000-000000000002'
  ) IS DISTINCT FROM '[
    {"key":"products","ordinal":1,"value":2000,"effective":2000},
    {"key":"staff","ordinal":2,"value":5,"effective":5},
    {"key":"storageBytes","ordinal":3,"value":10000000000,"effective":10000000000},
    {"key":"monthlyOrders","ordinal":4,"value":10000,"effective":10000},
    {"key":"customDomains","ordinal":5,"value":1,"effective":1}
  ]'::jsonb THEN
    RAISE EXCEPTION 'PILOT_PLAN_ASSERTION_FAILED: limit snapshot differs';
  END IF;

  IF (SELECT effective_limit FROM saas.plan_limits
      WHERE plan_id = '00000000-0000-4000-8000-000000000001'
        AND limit_key = 'products') IS DISTINCT FROM 100::bigint THEN
    RAISE EXCEPTION 'PILOT_PLAN_ASSERTION_FAILED: free_starter v1 changed';
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
    RAISE EXCEPTION 'PILOT_PLAN_ASSERTION_FAILED: immutable plan triggers are not enabled';
  END IF;

  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'PILOT_PLAN_ASSERTION_FAILED: assignment function is missing';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(function_oid), proconfig, proacl
  INTO function_source, function_config, function_acl
  FROM pg_catalog.pg_proc
  WHERE oid = function_oid
    AND proowner = 'celebix_saas_owner'::pg_catalog.regrole
    AND prosecdef
    AND prokind = 'f';

  IF NOT FOUND
    OR function_config IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
    OR function_source !~* 'FOR UPDATE'
    OR function_source !~* 'UPDATE saas[.]subscriptions'
    OR function_source !~* 'INSERT INTO saas[.]subscriptions' THEN
    RAISE EXCEPTION 'PILOT_PLAN_ASSERTION_FAILED: assignment function authority differs';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
      'celebix_saas_bootstrap', function_oid, 'EXECUTE'
    )
    OR pg_catalog.has_function_privilege('celebix_saas_app', function_oid, 'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_workflow', function_oid, 'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver', function_oid, 'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_observability', function_oid, 'EXECUTE')
    OR pg_catalog.has_function_privilege('public', function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PILOT_PLAN_ASSERTION_FAILED: assignment ACL differs';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'celebix_saas_identity')
    AND pg_catalog.has_function_privilege('celebix_saas_identity', function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PILOT_PLAN_ASSERTION_FAILED: identity role has assignment authority';
  END IF;

  IF function_source ~* '(password|authorization code|cookie|token|secret|credential)' THEN
    RAISE EXCEPTION 'PILOT_PLAN_ASSERTION_FAILED: forbidden data appears in function';
  END IF;
END
$pilot_plan_assertions$;

COMMIT;
