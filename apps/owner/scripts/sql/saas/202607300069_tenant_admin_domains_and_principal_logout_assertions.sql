BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase3_tenant_admin_auth_assertions$
DECLARE
  function_name text;
BEGIN
  IF (SELECT owner.rolname FROM pg_catalog.pg_class AS class JOIN pg_catalog.pg_roles AS owner ON owner.oid = class.relowner WHERE class.oid = 'saas.admin_domains'::regclass) <> 'celebix_saas_owner'
     OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'saas.admin_domains'::regclass)
     OR (SELECT owner.rolname FROM pg_catalog.pg_class AS class JOIN pg_catalog.pg_roles AS owner ON owner.oid = class.relowner WHERE class.oid = 'saas.cross_host_panel_handoffs'::regclass) <> 'celebix_saas_owner'
     OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'saas.cross_host_panel_handoffs'::regclass) THEN
    RAISE EXCEPTION 'PHASE3_TENANT_ADMIN_AUTH_ASSERTION_FAILED: ownership or RLS drift';
  END IF;
  IF pg_catalog.has_table_privilege('celebix_saas_bootstrap', 'saas.admin_domains', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('celebix_saas_host_resolver', 'saas.admin_domains', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.admin_domains', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('celebix_saas_identity', 'saas.cross_host_panel_handoffs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('public', 'saas.admin_domains', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR pg_catalog.has_table_privilege('public', 'saas.cross_host_panel_handoffs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'PHASE3_TENANT_ADMIN_AUTH_ASSERTION_FAILED: direct table privilege';
  END IF;

  FOREACH function_name IN ARRAY ARRAY[
    'saas.provision_canonical_admin_domain(uuid,uuid,text,timestamp with time zone)',
    'saas.resolve_public_admin_brand(text,timestamp with time zone)',
    'saas.issue_cross_host_panel_handoff(text,text,uuid,uuid,text,text,uuid,text,timestamp with time zone,timestamp with time zone)',
    'saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)',
    'saas.recover_cross_host_panel_handoff(uuid,text,text,text,timestamp with time zone)',
    'saas.revoke_principal_panel_sessions(text,text,text,timestamp with time zone)'
  ] LOOP
    IF pg_catalog.has_function_privilege('public', function_name, 'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3_TENANT_ADMIN_AUTH_ASSERTION_FAILED: public function grant drift';
    END IF;
  END LOOP;

  IF NOT pg_catalog.has_function_privilege('celebix_saas_bootstrap', 'saas.provision_canonical_admin_domain(uuid,uuid,text,timestamp with time zone)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver', 'saas.resolve_public_admin_brand(text,timestamp with time zone)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_identity', 'saas.issue_cross_host_panel_handoff(text,text,uuid,uuid,text,text,uuid,text,timestamp with time zone,timestamp with time zone)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_identity', 'saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_identity', 'saas.recover_cross_host_panel_handoff(uuid,text,text,text,timestamp with time zone)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_identity', 'saas.revoke_principal_panel_sessions(text,text,text,timestamp with time zone)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PHASE3_TENANT_ADMIN_AUTH_ASSERTION_FAILED: required function grant drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = procedure.proowner
    WHERE namespace.nspname = 'saas'
      AND procedure.proname IN (
        'provision_canonical_admin_domain', 'resolve_public_admin_brand',
        'issue_cross_host_panel_handoff', 'redeem_cross_host_panel_handoff',
        'recover_cross_host_panel_handoff', 'revoke_principal_panel_sessions'
      )
      AND (owner.rolname <> 'celebix_saas_owner' OR NOT procedure.prosecdef
        OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[])
  ) THEN
    RAISE EXCEPTION 'PHASE3_TENANT_ADMIN_AUTH_ASSERTION_FAILED: function hardening drift';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid = 'saas.cross_host_panel_handoffs'::regclass AND NOT tgisinternal) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'saas' AND indexname = 'admin_domains_one_active_canonical_per_store_idx') THEN
    RAISE EXCEPTION 'PHASE3_TENANT_ADMIN_AUTH_ASSERTION_FAILED: trigger or index drift';
  END IF;
END
$phase3_tenant_admin_auth_assertions$;

COMMIT;
