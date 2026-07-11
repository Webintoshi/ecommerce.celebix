-- Phase 2A1 catalog/security assertions for a disposable PostgreSQL target.
-- Any drift raises an exception and blocks evidence collection.

DO $phase2a1_catalog_assertions$
DECLARE
  tenant_table_count integer;
  force_rls_count integer;
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
  actual_policies text[];
  unexpected_owner_count integer;
  phase_role_count integer;
  role_record record;
BEGIN
  SELECT count(*)
  INTO tenant_table_count
  FROM pg_catalog.pg_class AS class
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'saas' AND class.relkind = 'r';

  IF tenant_table_count <> 10 THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: expected 10 tenant tables, found %', tenant_table_count;
  END IF;

  SELECT count(*)
  INTO force_rls_count
  FROM pg_catalog.pg_class AS class
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'saas'
    AND class.relkind = 'r'
    AND class.relrowsecurity
    AND class.relforcerowsecurity;

  IF force_rls_count <> tenant_table_count THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: ENABLE/FORCE RLS count is % of %', force_rls_count, tenant_table_count;
  END IF;

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

  IF actual_policies IS DISTINCT FROM expected_policies THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: exact RLS table, command, role, or expression drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS class ON class.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'saas'
      AND (
        NOT policy.polpermissive
        OR policy.polroles IS DISTINCT FROM ARRAY[0::oid]
        OR coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '') ~* '^\\s*true\\s*$'
        OR coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '') ~* '^\\s*true\\s*$'
      )
  ) THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: RLS role, mode, or expression drift';
  END IF;

  SELECT count(*)
  INTO unexpected_owner_count
  FROM pg_catalog.pg_class AS class
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = class.relowner
  WHERE namespace.nspname = 'saas'
    AND class.relkind IN ('r', 'i')
    AND owner_role.rolname <> 'celebix_saas_owner';

  IF unexpected_owner_count <> 0 THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: runtime or unexpected role owns schema objects';
  END IF;

  IF (
    SELECT owner_role.rolname
    FROM pg_catalog.pg_namespace AS namespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = namespace.nspowner
    WHERE namespace.nspname = 'saas'
  ) IS DISTINCT FROM 'celebix_saas_owner'
  OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure.proowner
    WHERE namespace.nspname = 'saas' AND owner_role.rolname <> 'celebix_saas_owner'
  ) THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: schema or function ownership drift';
  END IF;

  SELECT count(*)
  INTO phase_role_count
  FROM pg_catalog.pg_roles AS role
  WHERE role.rolname = ANY (ARRAY[
    'celebix_saas_owner', 'celebix_saas_migrator', 'celebix_saas_bootstrap',
    'celebix_saas_app', 'celebix_saas_workflow', 'celebix_saas_host_resolver',
    'celebix_saas_observability'
  ]);

  IF phase_role_count <> 7 THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: expected 7 authority roles, found %', phase_role_count;
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname LIKE 'celebix_saas_%') <> 7 THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: unexpected Phase 2A1 role exists';
  END IF;

  FOR role_record IN
    SELECT role.rolname, role.rolcanlogin, role.rolinherit, role.rolsuper,
           role.rolcreatedb, role.rolcreaterole, role.rolreplication, role.rolbypassrls
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = ANY (ARRAY[
      'celebix_saas_owner',
      'celebix_saas_migrator',
      'celebix_saas_bootstrap',
      'celebix_saas_app',
      'celebix_saas_workflow',
      'celebix_saas_host_resolver',
      'celebix_saas_observability'
    ])
  LOOP
    IF role_record.rolcanlogin
       OR role_record.rolinherit
       OR role_record.rolsuper
       OR role_record.rolcreatedb
       OR role_record.rolcreaterole
       OR role_record.rolreplication THEN
      RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: unsafe attributes on role %', role_record.rolname;
    END IF;

    IF role_record.rolname IN ('celebix_saas_app', 'celebix_saas_workflow', 'celebix_saas_host_resolver', 'celebix_saas_observability', 'celebix_saas_migrator')
       AND role_record.rolbypassrls THEN
      RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: runtime role % has BYPASSRLS', role_record.rolname;
    END IF;

    IF role_record.rolname IN ('celebix_saas_owner', 'celebix_saas_bootstrap')
       AND NOT role_record.rolbypassrls THEN
      RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: approved isolated role % lacks required BYPASSRLS', role_record.rolname;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace AS namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner))
    ) AS acl
    WHERE namespace.nspname = 'saas'
      AND acl.grantee = 0
      AND acl.privilege_type IN ('USAGE', 'CREATE')
  ) THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: PUBLIC has saas schema privilege';
  END IF;

  IF pg_catalog.has_schema_privilege('celebix_saas_bootstrap', 'saas', 'CREATE') THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: bootstrap can create schema objects';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(class.relacl, pg_catalog.acldefault('r', class.relowner))
    ) AS acl
    WHERE namespace.nspname = 'saas'
      AND class.relkind = 'r'
      AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: PUBLIC has tenant table privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = ANY (ARRAY[
      'celebix_saas_bootstrap', 'celebix_saas_app', 'celebix_saas_workflow',
      'celebix_saas_host_resolver', 'celebix_saas_observability'
    ])
      AND pg_catalog.has_database_privilege(role.rolname, pg_catalog.current_database(), 'CREATE')
  ) THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: runtime role can create database objects';
  END IF;

  IF EXISTS (
    WITH specifications(role_name, table_name, privilege_type, column_names) AS (
      VALUES
        ('celebix_saas_bootstrap', 'principals', 'SELECT', ARRAY['id','issuer','subject','email','email_verified','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'principals', 'INSERT', ARRAY['id','issuer','subject','email','email_verified','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'principals', 'UPDATE', ARRAY['email','email_verified','updated_at']),
        ('celebix_saas_bootstrap', 'stores', 'SELECT', ARRAY['id','name','slug','status','locale','currency','theme_key','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'stores', 'INSERT', ARRAY['id','name','slug','status','locale','currency','theme_key','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'domains', 'SELECT', ARRAY['id','store_id','normalized_hostname','domain_type','status','canonical','cache_version','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'domains', 'INSERT', ARRAY['id','store_id','normalized_hostname','domain_type','status','canonical','cache_version','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'memberships', 'SELECT', ARRAY['id','principal_id','store_id','role','status','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'memberships', 'INSERT', ARRAY['id','principal_id','store_id','role','status','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'plans', 'SELECT', ARRAY['id','plan_code','version','status','valid_from','valid_until','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'plan_features', 'SELECT', ARRAY['plan_id','feature_key','feature_ordinal','enabled']),
        ('celebix_saas_bootstrap', 'plan_limits', 'SELECT', ARRAY['plan_id','limit_key','limit_ordinal','limit_value','effective_limit']),
        ('celebix_saas_bootstrap', 'subscriptions', 'SELECT', ARRAY['id','store_id','plan_id','plan_code','plan_version','status','valid_from','valid_until','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'subscriptions', 'INSERT', ARRAY['id','store_id','plan_id','plan_code','plan_version','status','valid_from','valid_until','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'store_settings', 'SELECT', ARRAY['id','store_id','key','value','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'store_settings', 'INSERT', ARRAY['id','store_id','key','value','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'tenant_operations', 'SELECT', ARRAY['id','idempotency_key','payload_fingerprint','status','result_store_id','result_domain_id','result_membership_id','result_principal_id','result_subscription_id','result_plan_id','result_payload','requested_at','committed_at','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'tenant_operations', 'INSERT', ARRAY['id','idempotency_key','payload_fingerprint','status','requested_at','created_at','updated_at']),
        ('celebix_saas_bootstrap', 'tenant_operations', 'UPDATE', ARRAY['status','result_store_id','result_domain_id','result_membership_id','result_principal_id','result_subscription_id','result_plan_id','result_payload','committed_at','updated_at']),
        ('celebix_saas_app', 'principals', 'SELECT', ARRAY['id','issuer','subject','email','email_verified','created_at','updated_at']),
        ('celebix_saas_app', 'principals', 'UPDATE', ARRAY['email','email_verified','updated_at']),
        ('celebix_saas_app', 'stores', 'SELECT', ARRAY['id','name','slug','status','locale','currency','theme_key','created_at','updated_at']),
        ('celebix_saas_app', 'stores', 'UPDATE', ARRAY['name','locale','currency','theme_key','updated_at']),
        ('celebix_saas_app', 'domains', 'SELECT', ARRAY['id','store_id','normalized_hostname','domain_type','status','canonical','cache_version','created_at','updated_at']),
        ('celebix_saas_app', 'memberships', 'SELECT', ARRAY['id','principal_id','store_id','role','status','created_at','updated_at']),
        ('celebix_saas_app', 'plans', 'SELECT', ARRAY['id','plan_code','version','status','valid_from','valid_until','created_at','updated_at']),
        ('celebix_saas_app', 'plan_features', 'SELECT', ARRAY['plan_id','feature_key','feature_ordinal','enabled']),
        ('celebix_saas_app', 'plan_limits', 'SELECT', ARRAY['plan_id','limit_key','limit_ordinal','limit_value','effective_limit']),
        ('celebix_saas_app', 'subscriptions', 'SELECT', ARRAY['id','store_id','plan_id','plan_code','plan_version','status','valid_from','valid_until','created_at','updated_at']),
        ('celebix_saas_app', 'store_settings', 'SELECT', ARRAY['id','store_id','key','value','created_at','updated_at']),
        ('celebix_saas_app', 'store_settings', 'INSERT', ARRAY['id','store_id','key','value','created_at','updated_at']),
        ('celebix_saas_app', 'store_settings', 'UPDATE', ARRAY['value','updated_at']),
        ('celebix_saas_app', 'tenant_operations', 'SELECT', ARRAY['id','status','result_store_id','result_domain_id','result_membership_id','result_principal_id','result_plan_id','result_payload','committed_at','created_at','updated_at'])
    ),
    expected AS (
      SELECT role_name || ':' || table_name || ':' || column_name || ':' || privilege_type AS signature
      FROM specifications
      CROSS JOIN LATERAL pg_catalog.unnest(column_names) AS column_name
    ),
    actual AS (
      SELECT grantee.rolname || ':' || class.relname || ':' || attribute.attname || ':' || acl.privilege_type AS signature
      FROM pg_catalog.pg_attribute AS attribute
      JOIN pg_catalog.pg_class AS class ON class.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE namespace.nspname = 'saas'
        AND grantee.rolname = ANY (ARRAY[
          'celebix_saas_bootstrap', 'celebix_saas_app', 'celebix_saas_workflow',
          'celebix_saas_host_resolver', 'celebix_saas_observability'
        ])
    )
    (SELECT signature FROM expected EXCEPT SELECT signature FROM actual)
    UNION ALL
    (SELECT signature FROM actual EXCEPT SELECT signature FROM expected)
  ) THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: exact runtime column ACL matrix drift';
  END IF;

  IF EXISTS (
    WITH expected(signature) AS (
      VALUES ('celebix_saas_app:store_settings:DELETE')
    ),
    actual AS (
      SELECT grantee.rolname || ':' || class.relname || ':' || acl.privilege_type AS signature
      FROM pg_catalog.pg_class AS class
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(class.relacl) AS acl
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE namespace.nspname = 'saas'
        AND class.relkind = 'r'
        AND grantee.rolname = ANY (ARRAY[
          'celebix_saas_bootstrap', 'celebix_saas_app', 'celebix_saas_workflow',
          'celebix_saas_host_resolver', 'celebix_saas_observability'
        ])
    )
    (SELECT signature FROM expected EXCEPT SELECT signature FROM actual)
    UNION ALL
    (SELECT signature FROM actual EXCEPT SELECT signature FROM expected)
  ) THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: exact runtime table ACL matrix drift';
  END IF;

  IF EXISTS (
    WITH expected(signature) AS (
      VALUES
        ('celebix_saas_app:USAGE'),
        ('celebix_saas_bootstrap:USAGE'),
        ('celebix_saas_host_resolver:USAGE')
    ),
    actual AS (
      SELECT grantee.rolname || ':' || acl.privilege_type AS signature
      FROM pg_catalog.pg_namespace AS namespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl) AS acl
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE namespace.nspname = 'saas'
        AND grantee.rolname = ANY (ARRAY[
          'celebix_saas_bootstrap', 'celebix_saas_app', 'celebix_saas_workflow',
          'celebix_saas_host_resolver', 'celebix_saas_observability'
        ])
    )
    (SELECT signature FROM expected EXCEPT SELECT signature FROM actual)
    UNION ALL
    (SELECT signature FROM actual EXCEPT SELECT signature FROM expected)
  ) THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: exact runtime schema ACL matrix drift';
  END IF;

  IF EXISTS (
    WITH expected(signature) AS (
      VALUES
        ('celebix_saas_app:saas.has_active_membership(target_store_id uuid, allowed_roles text[]):EXECUTE'),
        ('celebix_saas_host_resolver:saas.resolve_store_host(requested_hostname text):EXECUTE')
    ),
    actual AS (
      SELECT grantee.rolname || ':' || namespace.nspname || '.' || procedure.proname || '(' ||
             pg_catalog.pg_get_function_identity_arguments(procedure.oid) || '):' || acl.privilege_type AS signature
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl) AS acl
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
      WHERE namespace.nspname = 'saas'
        AND grantee.rolname = ANY (ARRAY[
          'celebix_saas_bootstrap', 'celebix_saas_app', 'celebix_saas_workflow',
          'celebix_saas_host_resolver', 'celebix_saas_observability'
        ])
    )
    (SELECT signature FROM expected EXCEPT SELECT signature FROM actual)
    UNION ALL
    (SELECT signature FROM actual EXCEPT SELECT signature FROM expected)
  ) THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: exact runtime function ACL matrix drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
    ) AS acl
    WHERE namespace.nspname = 'saas'
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: PUBLIC function execution exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'saas'
      AND procedure.proname IN ('resolve_store_host', 'has_active_membership')
      AND (
        NOT procedure.prosecdef
        OR NOT (coalesce(procedure.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog'])
      )
  ) THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: SECURITY DEFINER search_path drift';
  END IF;

  IF pg_catalog.has_schema_privilege('celebix_saas_workflow', 'saas', 'USAGE')
     OR pg_catalog.has_schema_privilege('celebix_saas_observability', 'saas', 'USAGE') THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: placeholder role gained tenant schema access';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    WHERE granted_role.rolname LIKE 'celebix_saas_%' OR member_role.rolname LIKE 'celebix_saas_%'
  ) <> 1
  OR NOT pg_catalog.pg_has_role('celebix_saas_migrator', 'celebix_saas_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: role inheritance graph drift';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_trigger AS trigger
    JOIN pg_catalog.pg_class AS class ON class.oid = trigger.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'saas'
      AND NOT trigger.tgisinternal
      AND trigger.tgname IN ('plan_versions_immutable', 'plan_features_immutable', 'plan_limits_immutable')
  ) <> 3 THEN
    RAISE EXCEPTION 'PHASE2A1_CATALOG_ASSERTION_FAILED: plan immutability seal drift';
  END IF;
END
$phase2a1_catalog_assertions$;

SELECT 'PHASE2A1_CATALOG_ASSERTIONS_PASS' AS result;
