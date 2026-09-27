BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
DO $assertions$
DECLARE selected_role text;
BEGIN
 IF pg_catalog.to_regprocedure('saas.provision_platform_starter_storefront(uuid)') IS NULL
  OR pg_catalog.to_regclass('saas.platform_starter_storefront_backup') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.domains'::regclass
   AND tgname='celebix_net_starter_storefront_created' AND NOT tgisinternal AND tgenabled='O'
   AND tgfoid='saas.provision_celebix_net_starter_storefront_trigger()'::regprocedure)
  OR (SELECT pg_catalog.count(*) FROM saas.platform_starter_storefront_backup)<>3 THEN
  RAISE EXCEPTION 'PLATFORM_STARTER_ARTIFACT_MISSING';
 END IF;
 IF EXISTS(SELECT 1 FROM saas.platform_starter_storefront_backup backup
  JOIN pg_catalog.pg_proc procedure ON procedure.oid=CASE WHEN backup.identity NOT LIKE 'trigger:%'
   THEN pg_catalog.to_regprocedure(backup.identity) END
  WHERE backup.identity NOT LIKE 'trigger:%' AND (procedure.proacl::text IS DISTINCT FROM backup.acl
   OR procedure.proowner IS DISTINCT FROM backup.owner_id
   OR pg_catalog.pg_get_functiondef(procedure.oid) IS DISTINCT FROM backup.migrated_definition)) THEN
  RAISE EXCEPTION 'PLATFORM_STARTER_COMPATIBILITY_CHANGED';
 END IF;
 FOREACH selected_role IN ARRAY ARRAY['celebix_saas_identity','celebix_saas_app','celebix_saas_workflow',
  'celebix_saas_host_resolver','celebix_saas_bootstrap','celebix_saas_observability','celebix_saas_migrator'] LOOP
  IF pg_catalog.has_function_privilege(selected_role,'saas.provision_platform_starter_storefront(uuid)','EXECUTE')
   OR pg_catalog.has_table_privilege(selected_role,'saas.platform_starter_storefront_backup','SELECT') THEN
   RAISE EXCEPTION 'PLATFORM_STARTER_AUTHORITY_INVALID';
  END IF;
 END LOOP;
END $assertions$;
COMMIT;
