BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.trendyol.release269',0));
DO $safe$DECLARE r saas.trendyol269_backup;BEGIN
 -- Removing the tax checks after a connection has been used is a forward fix.
 IF EXISTS(SELECT 1 FROM saas.trendyol_connections)OR EXISTS(SELECT 1 FROM saas.trendyol_jobs)OR EXISTS(SELECT 1 FROM saas.trendyol_operations)OR EXISTS(SELECT 1 FROM saas.trendyol_orders)THEN RAISE EXCEPTION 'TRENDYOL269_COMMITTED_DATA';END IF;
 FOR r IN SELECT * FROM saas.trendyol269_backup LOOP
  IF encode(sha256(convert_to(pg_get_functiondef(r.signature::regprocedure),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=r.signature::regprocedure AND proowner=r.owner_id AND proacl IS NOT DISTINCT FROM r.acl AND proconfig IS NOT DISTINCT FROM r.config)THEN RAISE EXCEPTION 'TRENDYOL269_DOWN_SOURCE_DRIFT';END IF;
  EXECUTE r.definition;
 END LOOP;
END $safe$;
DROP TRIGGER trendyol_variant_tax_changed ON saas.product_variants;
DROP TRIGGER trendyol_product_tax_changed ON saas.products;
DROP FUNCTION saas.trendyol_product_tax(uuid,uuid,timestamptz),saas.trendyol_canonical_tax_issue(uuid,uuid),saas.trendyol_canonical_vat_rate(uuid,uuid);
DROP TABLE saas.trendyol269_backup;
COMMIT;
