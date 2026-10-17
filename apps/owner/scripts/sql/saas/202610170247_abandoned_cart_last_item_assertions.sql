-- Read-only witness; business rows and lifecycle constraints are not rewritten.
BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
DO $verify$
DECLARE b record;
BEGIN
 IF (SELECT count(*) FROM saas.cart_empty_247_backup)<>1 THEN RAISE EXCEPTION 'CART247_BACKUP_COUNT';END IF;
 SELECT * INTO STRICT b FROM saas.cart_empty_247_backup WHERE signature='saas.sync_durable_abandoned_cart(uuid,uuid,timestamp with time zone)';
 IF b.original_sha256<>'8c6dc8a5206d3e1b58baac9ea99f16a3b8a115e6b459c0db345aca4a7357504b' OR b.published_sha256<>'42e013dd90e0825199dfa8481ed98a85f033d677a9f5512059722174da0ca2bc'
  OR encode(sha256(convert_to(b.definition,'UTF8')),'hex')<>b.original_sha256
  OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=b.function_oid AND p.oid=to_regprocedure(b.signature)
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=b.published_sha256
   AND p.proowner=b.function_owner AND p.proacl IS NOT DISTINCT FROM b.function_acl
   AND p.proconfig IS NOT DISTINCT FROM b.function_config AND p.prosecdef AND p.provolatile='v'
   AND NOT p.proisstrict AND p.proparallel='u')
 THEN RAISE EXCEPTION 'CART247_FUNCTION_WITNESS';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.cart_empty_247_backup'::regclass
  AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)
  OR has_table_privilege('celebix_saas_app','saas.cart_empty_247_backup','SELECT,INSERT,UPDATE,DELETE')
  OR has_function_privilege('celebix_saas_host_resolver',b.signature,'EXECUTE')
 THEN RAISE EXCEPTION 'CART247_AUTHORITY_INVALID';END IF;
END $verify$;
ROLLBACK;
