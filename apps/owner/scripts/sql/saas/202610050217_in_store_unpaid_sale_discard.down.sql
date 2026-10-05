BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));
DO $restore$
DECLARE r record;suffix text;
BEGIN
 IF (SELECT count(*) FROM saas.in_store_discard_217_restore)<>3 THEN RAISE EXCEPTION 'DISCARD_RESTORE_INVALID';END IF;
 FOR r IN SELECT * FROM saas.in_store_discard_217_restore ORDER BY signature LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=r.function_oid AND proowner=r.owner_oid AND proacl=r.acl
   AND encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')=r.after_hash)
  THEN RAISE EXCEPTION 'DISCARD_RESTORE_SOURCE_DRIFT: %',r.signature;END IF;
  EXECUTE r.definition;
 END LOOP;
 FOREACH suffix IN ARRAY ARRAY['','_v2','_v3'] LOOP
  EXECUTE 'DROP FUNCTION saas.in_store_sales_discard'||suffix||'(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean)';
 END LOOP;
END $restore$;
DROP TABLE saas.in_store_discard_217_restore;
COMMIT;
