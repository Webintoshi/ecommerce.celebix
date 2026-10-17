-- Preserve abandonment chronology when a returning visitor empties a durable cart.
-- Only one existing function changes; cart APIs, constraints and access rights stay intact.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.cart.release247',0));
CREATE TABLE saas.cart_empty_247_backup (
 signature text PRIMARY KEY, definition text NOT NULL, original_sha256 text NOT NULL,
 published_sha256 text NOT NULL, function_oid oid NOT NULL, function_owner oid NOT NULL,
 function_acl aclitem[], function_config text[]
);
ALTER TABLE saas.cart_empty_247_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.cart_empty_247_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.cart_empty_247_backup FROM PUBLIC;
DO $private$DECLARE r record;BEGIN
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP
  EXECUTE format('REVOKE ALL ON saas.cart_empty_247_backup FROM %I',r.rolname);
 END LOOP;
END $private$;
DO $patch$
DECLARE f record; revised text; old_fragment text:=$old$    SET status='archived',archived_at=effective_activity_at,
        last_activity_at=effective_activity_at,version=version+1,updated_at=effective_activity_at$old$;
 new_fragment text:=$new$    SET status='archived',archived_at=effective_activity_at,
        -- Retain the activity that preceded abandonment when an old cart is emptied.
        last_activity_at=CASE WHEN abandoned_at IS NULL THEN effective_activity_at ELSE last_activity_at END,
        version=version+1,updated_at=effective_activity_at$new$;
BEGIN
 SELECT p.*,pg_get_functiondef(p.oid) definition INTO STRICT f FROM pg_proc p
 WHERE p.oid='saas.sync_durable_abandoned_cart(uuid,uuid,timestamp with time zone)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'8c6dc8a5206d3e1b58baac9ea99f16a3b8a115e6b459c0db345aca4a7357504b'
  OR f.proowner<>'celebix_saas_owner'::regrole
  OR f.proacl::text IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'
  OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  OR NOT f.prosecdef OR f.provolatile<>'v' OR f.proisstrict OR f.proparallel<>'u'
 THEN RAISE EXCEPTION 'CART247_PREDECESSOR_OR_AUTHORITY_DRIFT';END IF;
 IF (length(f.definition)-length(replace(f.definition,old_fragment,'')))/length(old_fragment)<>1
 THEN RAISE EXCEPTION 'CART247_PATCH_AMBIGUOUS';END IF;
 revised:=replace(f.definition,old_fragment,new_fragment);
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'42e013dd90e0825199dfa8481ed98a85f033d677a9f5512059722174da0ca2bc'
 THEN RAISE EXCEPTION 'CART247_PATCH_DIGEST_INVALID';END IF;
 INSERT INTO saas.cart_empty_247_backup VALUES('saas.sync_durable_abandoned_cart(uuid,uuid,timestamp with time zone)',f.definition,
  '8c6dc8a5206d3e1b58baac9ea99f16a3b8a115e6b459c0db345aca4a7357504b','42e013dd90e0825199dfa8481ed98a85f033d677a9f5512059722174da0ca2bc',f.oid,f.proowner,f.proacl,f.proconfig);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid
  AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='42e013dd90e0825199dfa8481ed98a85f033d677a9f5512059722174da0ca2bc'
  AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl
  AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef
  AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel)
 THEN RAISE EXCEPTION 'CART247_POSTCONDITION_INVALID';END IF;
END $patch$;
COMMIT;
