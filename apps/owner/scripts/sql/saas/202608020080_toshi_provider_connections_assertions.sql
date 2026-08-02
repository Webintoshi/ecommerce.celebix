BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $toshi_provider_connections_assertions$
DECLARE invalid boolean := false;
BEGIN
  invalid := invalid
    OR pg_catalog.to_regclass('saas.toshi_provider_configs') IS NULL
    OR pg_catalog.to_regclass('saas.toshi_provider_operations') IS NULL
    OR pg_catalog.to_regclass('saas.toshi_provider_events') IS NULL
    OR pg_catalog.to_regprocedure('saas.toshi_provider_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL
    OR pg_catalog.to_regprocedure('saas.toshi_provider_connection_identity(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.toshi_provider_connect(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb,text,bigint,text,text,jsonb,bigint)') IS NULL
    OR pg_catalog.to_regprocedure('saas.toshi_provider_select_model(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,text,bigint)') IS NULL
    OR pg_catalog.to_regprocedure('saas.toshi_provider_set_default(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,bigint)') IS NULL
    OR pg_catalog.to_regprocedure('saas.toshi_provider_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,bigint)') IS NULL
    OR pg_catalog.to_regprocedure('saas.toshi_provider_get_authority(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.toshi_provider_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)') IS NULL;

  invalid := invalid OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='saas' AND c.relname IN('toshi_provider_configs','toshi_provider_operations','toshi_provider_events')
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR pg_catalog.pg_get_userbyid(c.relowner)<>'celebix_saas_owner')
  );
  invalid := invalid OR EXISTS(
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='saas' AND table_name IN('toshi_provider_configs','toshi_provider_operations','toshi_provider_events')
      AND grantee IN('PUBLIC','celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver')
  );
  invalid := invalid OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname='saas' AND indexname='toshi_provider_one_live_provider'
      AND indexdef LIKE '%WHERE (status = ''active''::text)%'
  );
  invalid := invalid OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname='saas' AND indexname='toshi_provider_one_default'
      AND indexdef LIKE '%is_default%'
  );
  invalid := invalid OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='saas' AND p.proname LIKE 'toshi_provider_%'
      AND pg_catalog.pg_get_userbyid(p.proowner)<>'celebix_saas_owner'
  );
  IF invalid THEN RAISE EXCEPTION 'toshi_provider_connections_contract_invalid'; END IF;
END
$toshi_provider_connections_assertions$;

COMMIT;
