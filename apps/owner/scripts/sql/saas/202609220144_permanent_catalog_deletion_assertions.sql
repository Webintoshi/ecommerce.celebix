DO $block$
DECLARE signature text;
BEGIN
  IF pg_catalog.to_regclass('saas.product_deletion_preparations') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid='saas.product_deletion_preparations'::regclass AND relrowsecurity AND relforcerowsecurity)
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.product_deletion_preparations','SELECT')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.product_deletion_preparations'::regclass AND tgname='product_deletion_preparations_immutable' AND tgenabled='O')
  THEN RAISE EXCEPTION 'PERMANENT_PRODUCT_DELETION_PREPARATION_GUARD_INVALID'; END IF;
  IF pg_catalog.to_regprocedure('saas.catalog_detach_category_reference(jsonb,text)') IS NULL
  THEN RAISE EXCEPTION 'PERMANENT_CATEGORY_DETACH_HELPER_MISSING'; END IF;
  FOREACH signature IN ARRAY ARRAY[
    'saas.catalog_product_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)',
    'saas.delete_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',
    'saas.delete_product_recover(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)',
    'saas.catalog_category_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)',
    'saas.delete_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',
    'saas.delete_category_recover(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)'
  ] LOOP
    IF pg_catalog.to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'PERMANENT_CATALOG_DELETION_FUNCTION_MISSING:%',signature; END IF;
    IF NOT pg_catalog.has_function_privilege('celebix_saas_app',signature,'EXECUTE') THEN RAISE EXCEPTION 'PERMANENT_CATALOG_DELETION_EXECUTE_MISSING:%',signature; END IF;
    IF EXISTS(
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        CASE
          WHEN procedure.proacl IS NULL THEN pg_catalog.acldefault('f',procedure.proowner)
          ELSE procedure.proacl
        END
      ) AS privilege
      WHERE procedure.oid=pg_catalog.to_regprocedure(signature)
        AND privilege.grantee=0
        AND privilege.privilege_type='EXECUTE'
    ) THEN RAISE EXCEPTION 'PERMANENT_CATALOG_DELETION_PUBLIC_EXECUTE:%',signature; END IF;
  END LOOP;
END
$block$;
