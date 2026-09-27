BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.domains IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE selected record;
BEGIN
 IF pg_catalog.to_regclass('saas.platform_starter_storefront_backup') IS NULL THEN
  RAISE EXCEPTION 'PLATFORM_STARTER_DOWN_BACKUP_MISSING';
 END IF;
 IF EXISTS(SELECT 1 FROM saas.platform_starter_storefront_backup backup
  LEFT JOIN pg_catalog.pg_proc procedure ON procedure.oid=CASE WHEN backup.identity NOT LIKE 'trigger:%'
   THEN pg_catalog.to_regprocedure(backup.identity) END
  WHERE backup.identity NOT LIKE 'trigger:%' AND (
   procedure.oid IS NULL OR pg_catalog.pg_get_functiondef(procedure.oid) IS DISTINCT FROM backup.migrated_definition
   OR procedure.proacl::text IS DISTINCT FROM backup.acl OR procedure.proowner IS DISTINCT FROM backup.owner_id))
  OR (SELECT definition FROM saas.platform_starter_storefront_backup WHERE identity='trigger:celebix_net_starter_storefront_created')
    IS DISTINCT FROM (SELECT pg_catalog.pg_get_triggerdef(oid) FROM pg_catalog.pg_trigger
     WHERE tgrelid='saas.domains'::regclass AND tgname='celebix_net_starter_storefront_created' AND NOT tgisinternal)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.domains'::regclass
    AND tgname='celebix_net_starter_storefront_created' AND NOT tgisinternal AND tgenabled='O') THEN
  RAISE EXCEPTION 'PLATFORM_STARTER_DOWN_DEFINITION_CHANGED';
 END IF;
 FOR selected IN SELECT definition FROM saas.platform_starter_storefront_backup
  WHERE identity NOT LIKE 'trigger:%' ORDER BY identity LOOP
  EXECUTE selected.definition;
 END LOOP;
 -- Functions and trigger identities retain their original ACLs. Storefront
 -- rows created since up remain intact, including any later merchant changes.
END $rollback$;
DROP FUNCTION saas.provision_platform_starter_storefront(uuid);
DROP TABLE saas.platform_starter_storefront_backup;
COMMIT;
