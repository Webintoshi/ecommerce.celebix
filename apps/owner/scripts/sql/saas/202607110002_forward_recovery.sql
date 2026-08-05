-- Phase 2A1 forward-recovery classifier. This artifact performs no repair or destructive action.
-- Checksums and the exact ACL matrix remain external responsibilities of the manifest executor and
-- 202607110005_catalog_assertions.sql; this classifier never labels a core match as fully exact.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase2a1_forward_recovery$
DECLARE
  expected_tables constant text[] := ARRAY[
    'domains', 'memberships', 'plan_features', 'plan_limits', 'plans',
    'principals', 'store_settings', 'stores', 'subscriptions', 'tenant_operations'
  ];
  expected_policies constant text[] := ARRAY[
    $policy$domains:domains_active_membership_read:r:saas.has_active_membership(store_id, ARRAY['store_owner'::text, 'admin'::text, 'editor'::text, 'analyst'::text]):<NULL>$policy$,
    $policy$domains:domains_privileged_membership_write:*:saas.has_active_membership(store_id, ARRAY['store_owner'::text, 'admin'::text]):saas.has_active_membership(store_id, ARRAY['store_owner'::text, 'admin'::text])$policy$,
    $policy$memberships:memberships_principal_discovery:r:((principal_id = (NULLIF(current_setting('app.current_principal_id'::text, true), ''::text))::uuid) AND (status = 'active'::text)):<NULL>$policy$,
    $policy$plan_features:plan_features_current_subscription_read:r:(EXISTS ( SELECT 1 FROM saas.subscriptions subscription WHERE ((subscription.plan_id = plan_features.plan_id) AND (subscription.store_id = (NULLIF(current_setting('app.current_store_id'::text, true), ''::text))::uuid) AND (subscription.status = 'active'::text) AND saas.has_active_membership(subscription.store_id, ARRAY['store_owner'::text, 'admin'::text, 'editor'::text, 'analyst'::text])))):<NULL>$policy$,
    $policy$plan_limits:plan_limits_current_subscription_read:r:(EXISTS ( SELECT 1 FROM saas.subscriptions subscription WHERE ((subscription.plan_id = plan_limits.plan_id) AND (subscription.store_id = (NULLIF(current_setting('app.current_store_id'::text, true), ''::text))::uuid) AND (subscription.status = 'active'::text) AND saas.has_active_membership(subscription.store_id, ARRAY['store_owner'::text, 'admin'::text, 'editor'::text, 'analyst'::text])))):<NULL>$policy$,
    $policy$plans:plans_current_subscription_read:r:(EXISTS ( SELECT 1 FROM saas.subscriptions subscription WHERE ((subscription.plan_id = plans.id) AND (subscription.store_id = (NULLIF(current_setting('app.current_store_id'::text, true), ''::text))::uuid) AND (subscription.status = 'active'::text) AND saas.has_active_membership(subscription.store_id, ARRAY['store_owner'::text, 'admin'::text, 'editor'::text, 'analyst'::text])))):<NULL>$policy$,
    $policy$principals:principals_own_identity:*:(id = (NULLIF(current_setting('app.current_principal_id'::text, true), ''::text))::uuid):(id = (NULLIF(current_setting('app.current_principal_id'::text, true), ''::text))::uuid)$policy$,
    $policy$store_settings:store_settings_active_membership_read:r:saas.has_active_membership(store_id, ARRAY['store_owner'::text, 'admin'::text, 'editor'::text, 'analyst'::text]):<NULL>$policy$,
    $policy$store_settings:store_settings_editor_write:*:saas.has_active_membership(store_id, ARRAY['store_owner'::text, 'admin'::text, 'editor'::text]):saas.has_active_membership(store_id, ARRAY['store_owner'::text, 'admin'::text, 'editor'::text])$policy$,
    $policy$stores:stores_active_membership_read:r:saas.has_active_membership(id, ARRAY['store_owner'::text, 'admin'::text, 'editor'::text, 'analyst'::text]):<NULL>$policy$,
    $policy$stores:stores_privileged_membership_update:w:saas.has_active_membership(id, ARRAY['store_owner'::text, 'admin'::text]):saas.has_active_membership(id, ARRAY['store_owner'::text, 'admin'::text])$policy$,
    $policy$subscriptions:subscriptions_active_membership_read:r:saas.has_active_membership(store_id, ARRAY['store_owner'::text, 'admin'::text, 'editor'::text, 'analyst'::text]):<NULL>$policy$,
    $policy$tenant_operations:tenant_operations_active_membership_read:r:saas.has_active_membership(result_store_id, ARRAY['store_owner'::text, 'admin'::text, 'editor'::text, 'analyst'::text]):<NULL>$policy$
  ];
  actual_tables text[];
  actual_policies text[];
  expected_features constant text[] := ARRAY[
    'catalog:1:true', 'orders:2:true', 'customers:3:true', 'content:4:true',
    'media:5:true', 'analytics:6:true', 'checkout:7:true', 'custom_domains:8:false',
    'staff_management:9:false', 'promotions:10:false', 'integrations:11:false',
    'accounting:12:false', 'marketplaces:13:false'
  ];
  expected_limits constant text[] := ARRAY[
    'products:1:100', 'staff:2:1', 'storageBytes:3:1000000000',
    'monthlyOrders:4:100', 'customDomains:5:0'
  ];
  actual_features text[];
  actual_limits text[];
  force_rls_count integer;
  freeze_trigger_count integer;
BEGIN
  IF pg_catalog.to_regnamespace('saas') IS NULL THEN
    RAISE NOTICE 'PHASE2A1_FORWARD_RECOVERY: CLEAN_REAPPLY';
    RETURN;
  END IF;

  SELECT pg_catalog.array_agg(class.relname ORDER BY class.relname),
         count(*) FILTER (WHERE class.relrowsecurity AND class.relforcerowsecurity)
  INTO actual_tables, force_rls_count
  FROM pg_catalog.pg_class AS class
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'saas' AND class.relkind = 'r';

  SELECT pg_catalog.array_agg(
    class.relname || ':' || policy.polname || ':' || policy.polcmd::text || ':' ||
    coalesce(pg_catalog.regexp_replace(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '[[:space:]]+', ' ', 'g'), '<NULL>') || ':' ||
    coalesce(pg_catalog.regexp_replace(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '[[:space:]]+', ' ', 'g'), '<NULL>')
    ORDER BY class.relname, policy.polname
  )
  INTO actual_policies
  FROM pg_catalog.pg_policy AS policy
  JOIN pg_catalog.pg_class AS class ON class.oid = policy.polrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'saas';

  SELECT count(*)
  INTO freeze_trigger_count
  FROM pg_catalog.pg_trigger AS trigger
  JOIN pg_catalog.pg_class AS class ON class.oid = trigger.tgrelid
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'saas'
    AND NOT trigger.tgisinternal
    AND trigger.tgname IN ('plan_versions_immutable', 'plan_features_immutable', 'plan_limits_immutable');

  SELECT pg_catalog.array_agg(
    feature_key || ':' || feature_ordinal::text || ':' || enabled::text ORDER BY feature_ordinal
  )
  INTO actual_features
  FROM saas.plan_features;

  SELECT pg_catalog.array_agg(
    limit_key || ':' || limit_ordinal::text || ':' || pg_catalog.trim_scale(limit_value)::text ORDER BY limit_ordinal
  )
  INTO actual_limits
  FROM saas.plan_limits;

  IF actual_tables = expected_tables
     AND force_rls_count = pg_catalog.cardinality(expected_tables)
     AND actual_policies = expected_policies
     AND NOT EXISTS (
       SELECT 1
       FROM pg_catalog.pg_policy AS policy
       JOIN pg_catalog.pg_class AS class ON class.oid = policy.polrelid
       JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
       WHERE namespace.nspname = 'saas'
         AND (NOT policy.polpermissive OR policy.polroles IS DISTINCT FROM ARRAY[0::oid])
     )
     AND actual_features = expected_features
     AND actual_limits = expected_limits
     AND freeze_trigger_count = 3
     AND pg_catalog.to_regprocedure('saas.resolve_store_host(text)') IS NOT NULL
     AND pg_catalog.to_regprocedure('saas.has_active_membership(uuid,text[])') IS NOT NULL
     AND (SELECT count(*) FROM saas.plans) = 1
     AND EXISTS (
       SELECT 1 FROM saas.plans
       WHERE id = '00000000-0000-4000-8000-000000000001'
         AND plan_code = 'free_starter' AND version = 1 AND status = 'active'
         AND valid_from = '2026-01-01T00:00:00.000Z'::timestamptz
         AND valid_until IS NULL
         AND created_at = '2026-01-01T00:00:00.000Z'::timestamptz
         AND updated_at = '2026-01-01T00:00:00.000Z'::timestamptz
     )
     AND pg_catalog.has_function_privilege('celebix_saas_host_resolver', 'saas.resolve_store_host(text)', 'EXECUTE')
     AND NOT pg_catalog.has_table_privilege('celebix_saas_host_resolver', 'saas.domains', 'SELECT')
     AND pg_catalog.has_column_privilege('celebix_saas_bootstrap', 'saas.tenant_operations', 'status', 'UPDATE')
     AND NOT pg_catalog.has_column_privilege('celebix_saas_bootstrap', 'saas.tenant_operations', 'idempotency_key', 'UPDATE') THEN
    RAISE NOTICE 'PHASE2A1_FORWARD_RECOVERY: APPLIED_CORE_MATCH_CATALOG_ACL_AND_CHECKSUM_REQUIRED';
    RETURN;
  END IF;

  RAISE EXCEPTION 'PHASE2A1_FORWARD_RECOVERY_BLOCKED: partial or drifted schema; destroy disposable target and reapply cleanly';
END
$phase2a1_forward_recovery$;

COMMIT;
