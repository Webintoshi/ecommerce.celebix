-- Restore exact authority and untouched migrated flags; later staff edits block rollback.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.in_store_staff_grants IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE saved record;old_default text;
BEGIN
 IF to_regclass('saas.cashier_238_function_backup') IS NULL THEN RETURN;END IF;
 IF (SELECT count(*) FROM saas.cashier_238_function_backup)<>2 THEN RAISE EXCEPTION 'CASHIER238_BACKUP_INVALID';END IF;
 FOR saved IN SELECT * FROM saas.cashier_238_function_backup ORDER BY signature LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=saved.function_oid AND proowner=saved.function_owner AND proacl IS NOT DISTINCT FROM saved.function_acl)
   OR to_regprocedure(saved.signature) IS DISTINCT FROM saved.function_oid
   OR encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex') IS DISTINCT FROM saved.published_sha256
   OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex') IS DISTINCT FROM saved.original_sha256
  THEN RAISE EXCEPTION 'CASHIER238_ROLLBACK_SOURCE_DRIFT: %',saved.signature;END IF;
 END LOOP;
 IF (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='saas.in_store_staff_grants'::regclass AND a.attname='can_collect_receivables' AND NOT a.attisdropped) IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'CASHIER238_ROLLBACK_DEFAULT_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM saas.cashier_238_grant_backup b LEFT JOIN saas.in_store_staff_grants g ON g.membership_id=b.membership_id
  WHERE to_jsonb(g) IS DISTINCT FROM b.published_row)
 THEN RAISE EXCEPTION 'CASHIER238_ROLLBACK_GRANT_CHANGED';END IF;
 FOR saved IN SELECT * FROM saas.cashier_238_function_backup ORDER BY signature LOOP EXECUTE saved.definition;END LOOP;
 UPDATE saas.in_store_staff_grants g SET can_collect_receivables=(b.original_row->>'can_collect_receivables')::boolean,
  version=(b.original_row->>'version')::bigint,updated_at=(b.original_row->>'updated_at')::timestamptz
  FROM saas.cashier_238_grant_backup b WHERE g.membership_id=b.membership_id;
 SELECT original_collection_default INTO STRICT old_default FROM saas.cashier_238_function_backup ORDER BY signature LIMIT 1;
 EXECUTE 'ALTER TABLE saas.in_store_staff_grants ALTER COLUMN can_collect_receivables SET DEFAULT '||old_default;
 DROP TABLE saas.cashier_238_grant_backup;
 DROP TABLE saas.cashier_238_function_backup;
END $rollback$;
COMMIT;
