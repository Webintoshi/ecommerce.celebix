DO $assertions$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid='saas.guard_product_media_authority()'::regprocedure
      AND pg_catalog.md5(procedure.prosrc)='ce8e5e6417db75453e0436eb372f3755'
      AND pg_catalog.pg_get_userbyid(procedure.proowner)='celebix_saas_owner'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  ) THEN RAISE EXCEPTION 'media lifecycle guard definition drift';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) AS privilege
    WHERE procedure.oid='saas.guard_product_media_authority()'::regprocedure
      AND privilege.grantee<>procedure.proowner
      AND privilege.privilege_type='EXECUTE'
  ) THEN RAISE EXCEPTION 'media lifecycle guard execute ACL drift'; END IF;
  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger
    WHERE tgrelid='saas.product_media'::regclass
      AND tgname='product_media_authority_guard'
      AND tgfoid='saas.guard_product_media_authority()'::regprocedure
      AND tgenabled='O' AND NOT tgisinternal AND tgtype=23
  ) THEN RAISE EXCEPTION 'media lifecycle trigger missing'; END IF;
END
$assertions$;
