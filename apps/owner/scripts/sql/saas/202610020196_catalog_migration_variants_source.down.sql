BEGIN;
SET LOCAL ROLE celebix_saas_owner;
-- Preserve imported source records: code rollback can retain this additive schema.
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.catalog_product_import_sources) THEN
  RAISE EXCEPTION 'MIGRATION196_ROLLBACK_SOURCE_DATA_PRESENT: retain schema and roll forward';
 END IF;
END $guard$;
DO $restore$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('saas.catalog_migration_record_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,text,text,uuid,text)'::regprocedure);
 IF strpos(definition,'-- migration196-order-start')=0 OR strpos(definition,'-- migration196-order-end')=0 THEN
  RAISE EXCEPTION 'MIGRATION196_MEDIA_ROLLBACK_DRIFT';
 END IF;
 definition:=regexp_replace(definition,E'\n  -- migration196-order-start[\\s\\S]*?  -- migration196-order-end\n','');
 definition:=replace(definition,E'  p_now:=greatest(p_now,job.updated_at);\n','');
 definition:=replace(definition,E'job.status=''processing'' THEN',E'job.status=''processing'' OR p_now<job.updated_at THEN');
 EXECUTE definition;
END $restore$;
DROP FUNCTION saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,jsonb);
DROP FUNCTION saas.catalog_migration_extended_variant_valid(jsonb);
DROP TABLE saas.catalog_product_import_sources;
COMMIT;
