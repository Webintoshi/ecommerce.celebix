-- Read-only catalog assertions for Phase 3Y admin-managed starter-theme authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL statement_timeout='30s';

DO $f$
DECLARE helper_oid oid; gated_helper_oid oid; effective_oid oid; resolver_oid oid; create_oid oid; list_oid oid; archive_oid oid; recover_oid oid;
BEGIN
  helper_oid:=pg_catalog.to_regprocedure('saas.public_starter_presentation(uuid,timestamp with time zone)');
  gated_helper_oid:=pg_catalog.to_regprocedure('saas.public_starter_presentation(uuid,timestamp with time zone,boolean)');
  effective_oid:=pg_catalog.to_regprocedure('saas.merchant_admin_effective_starter_presentation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)');
  resolver_oid:=pg_catalog.to_regprocedure('saas.resolve_public_storefront(text,timestamp with time zone)');
  create_oid:=pg_catalog.to_regprocedure('saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint)');
  list_oid:=pg_catalog.to_regprocedure('saas.storefront_asset_list(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,text,boolean)');
  archive_oid:=pg_catalog.to_regprocedure('saas.storefront_asset_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)');
  recover_oid:=pg_catalog.to_regprocedure('saas.storefront_asset_recover(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,text)');
  IF helper_oid IS NULL OR gated_helper_oid IS NULL OR effective_oid IS NULL OR resolver_oid IS NULL OR create_oid IS NULL OR list_oid IS NULL OR archive_oid IS NULL OR recover_oid IS NULL THEN RAISE EXCEPTION 'STARTER_THEME_FUNCTION_MISSING'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid IN(helper_oid,gated_helper_oid) AND p.proowner='celebix_saas_owner'::regrole
      AND p.prosecdef AND p.provolatile='s'
      AND p.proconfig @> ARRAY['search_path=pg_catalog, saas']::text[]
    GROUP BY p.proowner,p.prosecdef,p.provolatile,p.proconfig
    HAVING pg_catalog.count(*)=2
  ) THEN RAISE EXCEPTION 'STARTER_THEME_HELPER_AUTHORITY_INVALID'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid=resolver_oid AND p.proowner='celebix_saas_owner'::regrole
      AND p.prosecdef AND p.provolatile='s'
      AND p.proconfig @> ARRAY['search_path=pg_catalog, saas']::text[]
      AND p.prosrc LIKE '%''schemaVersion'',2%'
      AND p.prosrc LIKE '%domain.hostname_type=''custom_domain'' AND domain.is_primary%'
  ) THEN RAISE EXCEPTION 'STARTER_THEME_RESOLVER_INVALID'; END IF;

  IF NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',resolver_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',helper_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',gated_helper_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app',helper_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app',gated_helper_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',effective_oid,'EXECUTE')
    OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc p,
        LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
      WHERE p.oid IN(helper_oid,gated_helper_oid) AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
    )
  THEN RAISE EXCEPTION 'STARTER_THEME_FUNCTION_ACL_INVALID'; END IF;
  IF pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.merchant_admin_records','SELECT')
    OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.storefront_assets','SELECT')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.storefront_assets','SELECT,INSERT,UPDATE,DELETE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',create_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',list_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',archive_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',recover_oid,'EXECUTE')
  THEN RAISE EXCEPTION 'STARTER_THEME_TABLE_ACL_INVALID'; END IF;

  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid='saas.storefront_assets'::regclass AND c.relrowsecurity AND c.relforcerowsecurity)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid='saas.storefront_asset_operations'::regclass AND c.relrowsecurity AND c.relforcerowsecurity)
  THEN RAISE EXCEPTION 'STOREFRONT_ASSET_RLS_INVALID'; END IF;

  IF saas.merchant_admin_required_action('theme_setting',false)<>'configuration.read'
    OR saas.merchant_admin_required_action('theme_setting',true)<>'configuration.manage'
    OR NOT saas.merchant_admin_config_valid(
      'theme_setting',
      '{"colorScheme":"warm","headingStyle":"sans","productCardStyle":"compact","productImageRatio":"square","homeProductLimit":12,"showBrandStory":false}'::jsonb
    )
    OR saas.merchant_admin_config_valid('theme_setting','{"colorScheme":"custom"}'::jsonb)
    OR saas.merchant_admin_config_valid('theme_setting','{"homeProductLimit":6}'::jsonb)
    OR saas.merchant_admin_config_valid('theme_setting','{"customCss":"body{}"}'::jsonb)
    OR NOT saas.merchant_admin_config_valid('hero_banner','{"headline":"Hero","assetId":"10000000-0000-4000-8000-000000000001","enabled":true}'::jsonb)
    OR NOT saas.merchant_admin_config_valid('social_preview','{"title":"Paylaşım","assetId":"10000000-0000-4000-8000-000000000001"}'::jsonb)
    OR saas.merchant_admin_config_valid('hero_banner','{"imageUrl":"https://cdn.example.test/hero.webp"}'::jsonb)
    OR saas.merchant_admin_config_valid('social_preview','{"imageUrl":"https://cdn.example.test/social.webp"}'::jsonb)
    OR saas.merchant_admin_config_valid('social_preview','{"assetId":"wrong"}'::jsonb)
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
