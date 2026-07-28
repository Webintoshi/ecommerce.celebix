-- Fail closed on migration-056 ownership, RLS, ACL, trigger, and constraint drift.
DO $assertions$
DECLARE
  relation_name text;
  relation_oid oid;
  function_signature text;
  checked_function regprocedure;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'catalog_product_profiles',
    'catalog_categories',
    'catalog_product_categories',
    'catalog_variant_commerce_profiles',
    'catalog_product_channels',
    'catalog_onboarding_operations'
  ] LOOP
    SELECT class.oid INTO relation_oid
    FROM pg_catalog.pg_class AS class
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=class.relnamespace
    WHERE namespace.nspname='saas' AND class.relname=relation_name AND class.relkind='r';
    IF relation_oid IS NULL THEN RAISE EXCEPTION 'CATALOG_ONBOARDING_RELATION_MISSING:%',relation_name; END IF;
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_class AS class
      JOIN pg_catalog.pg_roles AS owner ON owner.oid=class.relowner
      WHERE class.oid=relation_oid AND owner.rolname='celebix_saas_owner' AND class.relrowsecurity AND class.relforcerowsecurity
    ) THEN RAISE EXCEPTION 'CATALOG_ONBOARDING_RELATION_SECURITY_DRIFT:%',relation_name; END IF;
    IF EXISTS(
      SELECT 1 FROM pg_catalog.aclexplode(COALESCE((SELECT relacl FROM pg_catalog.pg_class WHERE oid=relation_oid),pg_catalog.acldefault('r',(SELECT relowner FROM pg_catalog.pg_class WHERE oid=relation_oid)))) AS acl
      JOIN pg_catalog.pg_roles AS grantee ON grantee.oid=acl.grantee
      WHERE grantee.rolname IN('celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver')
        AND acl.privilege_type IN('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
    ) THEN RAISE EXCEPTION 'CATALOG_ONBOARDING_RELATION_ACL_DRIFT:%',relation_name; END IF;
  END LOOP;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.catalog_onboarding_operations'::pg_catalog.regclass
      AND tgname='catalog_onboarding_operations_immutable' AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'CATALOG_ONBOARDING_OPERATION_TRIGGER_MISSING'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.catalog_categories'::pg_catalog.regclass
      AND tgname='catalog_categories_tree_guard' AND NOT tgisinternal
  ) THEN RAISE EXCEPTION 'CATALOG_ONBOARDING_CATEGORY_TRIGGER_MISSING'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.product_variants'::pg_catalog.regclass
      AND conname='product_variants_store_product_id_key' AND contype='u'
  ) THEN RAISE EXCEPTION 'CATALOG_ONBOARDING_VARIANT_PRODUCT_KEY_MISSING'; END IF;

  FOREACH function_signature IN ARRAY ARRAY[
    'saas.catalog_get_onboarding_options(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone)',
    'saas.catalog_onboard_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)',
    'saas.catalog_get_product_editor(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)',
    'saas.catalog_update_merchandising(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)',
    'saas.catalog_publish_after_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,integer)',
    'saas.catalog_recover_onboarding_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)'
  ] LOOP
    checked_function:=pg_catalog.to_regprocedure(function_signature);
    IF checked_function IS NULL
       OR pg_catalog.has_function_privilege('public',checked_function,'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('celebix_saas_app',checked_function,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_workflow',checked_function,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',checked_function,'EXECUTE')
       OR NOT EXISTS(
         SELECT 1
         FROM pg_catalog.pg_proc AS procedure
         JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
         WHERE procedure.oid=checked_function
           AND owner.rolname='celebix_saas_owner'
           AND procedure.prosecdef
           AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
       ) THEN
      RAISE EXCEPTION 'CATALOG_ONBOARDING_FUNCTION_SECURITY_DRIFT:%',function_signature;
    END IF;
  END LOOP;
END
$assertions$;
