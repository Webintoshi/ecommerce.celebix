-- Read-only catalog assertions for Phase 3Y admin-managed starter-theme authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL statement_timeout='30s';

DO $f$
DECLARE helper_oid oid; resolver_oid oid;
BEGIN
  helper_oid:=pg_catalog.to_regprocedure('saas.public_starter_presentation(uuid,timestamp with time zone)');
  resolver_oid:=pg_catalog.to_regprocedure('saas.resolve_public_storefront(text,timestamp with time zone)');
  IF helper_oid IS NULL OR resolver_oid IS NULL THEN RAISE EXCEPTION 'STARTER_THEME_FUNCTION_MISSING'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid=helper_oid AND p.proowner='celebix_saas_owner'::regrole
      AND p.prosecdef AND p.provolatile='s'
      AND p.proconfig @> ARRAY['search_path=pg_catalog, saas']::text[]
  ) THEN RAISE EXCEPTION 'STARTER_THEME_HELPER_AUTHORITY_INVALID'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid=resolver_oid AND p.proowner='celebix_saas_owner'::regrole
      AND p.prosecdef AND p.provolatile='s'
      AND p.proconfig @> ARRAY['search_path=pg_catalog, saas']::text[]
      AND p.prosrc LIKE '%''schemaVersion'',2%'
      AND p.prosrc LIKE '%public_starter_presentation(store.id,p_now)%'
  ) THEN RAISE EXCEPTION 'STARTER_THEME_RESOLVER_INVALID'; END IF;

  IF NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',resolver_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',helper_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app',helper_oid,'EXECUTE')
    OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc p,
        LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
      WHERE p.oid=helper_oid AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
    )
  THEN RAISE EXCEPTION 'STARTER_THEME_FUNCTION_ACL_INVALID'; END IF;
  IF pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.merchant_admin_records','SELECT')
  THEN RAISE EXCEPTION 'STARTER_THEME_TABLE_ACL_INVALID'; END IF;

  IF saas.merchant_admin_required_action('theme_setting',false)<>'configuration.read'
    OR saas.merchant_admin_required_action('theme_setting',true)<>'configuration.manage'
    OR NOT saas.merchant_admin_config_valid(
      'theme_setting',
      '{"colorScheme":"warm","headingStyle":"sans","productCardStyle":"compact","productImageRatio":"square","homeProductLimit":12,"showBrandStory":false}'::jsonb
    )
    OR saas.merchant_admin_config_valid('theme_setting','{"colorScheme":"custom"}'::jsonb)
    OR saas.merchant_admin_config_valid('theme_setting','{"homeProductLimit":6}'::jsonb)
    OR saas.merchant_admin_config_valid('theme_setting','{"customCss":"body{}"}'::jsonb)
  THEN RAISE EXCEPTION 'STARTER_THEME_CONFIG_AUTHORITY_INVALID'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint c
    WHERE c.conrelid='saas.merchant_admin_records'::regclass
      AND c.conname='merchant_admin_records_record_kind_check'
      AND pg_catalog.pg_get_constraintdef(c.oid) LIKE '%theme_setting%'
  ) THEN RAISE EXCEPTION 'STARTER_THEME_KIND_CONSTRAINT_INVALID'; END IF;
END
$f$;

ROLLBACK;
