-- Restore the exact previous reader. No order or financial history is removed.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.order-edit-address.release276',0));
DO $down$ DECLARE saved record;BEGIN
 IF current_setting('celebix.allow_native276_down',true)IS DISTINCT FROM 'on'THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_DOWN_OPT_IN_REQUIRED';END IF;
 IF(SELECT count(*)FROM saas.order_edit_address276_function_backup)<>1 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_BACKUP_INVALID';END IF;
 SELECT *INTO STRICT saved FROM saas.order_edit_address276_function_backup;
 IF saved.signature<>'saas.orders_edit_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'
  OR saved.before_definition_sha<>'4c455d3dfa206da0b3ddbb6abb799a21436595eeacc797c58fcc7f457d8248dd'
  OR saved.after_definition_sha<>'101a8c2436b00783f4b308db6300fd293569c758bc6874164922063092739d6e'
  OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex')IS DISTINCT FROM saved.before_definition_sha
  OR saved.owner_oid IS DISTINCT FROM 'celebix_saas_owner'::regrole
  OR saved.acl::text IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'
  OR saved.config IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR NOT saved.security_definer OR saved.volatility<>'s'
 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_BACKUP_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.oid=to_regprocedure(saved.signature)
  AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=saved.after_definition_sha
  AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl
  AND p.proconfig IS NOT DISTINCT FROM saved.config AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility)
 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_DOWN_DRIFT';END IF;
 EXECUTE saved.definition;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid
  AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=saved.before_definition_sha
  AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl
  AND p.proconfig IS NOT DISTINCT FROM saved.config AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility)
 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_RESTORE_INVALID';END IF;
END $down$;
DROP TABLE saas.order_edit_address276_function_backup;
COMMIT;
