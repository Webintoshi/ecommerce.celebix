-- No tenant or credential output; the existing identity-only command contract is retained.
DO $assertions$
DECLARE saved record;current_function record;definition text;role_name text;
BEGIN
 IF (SELECT count(*) FROM saas.merchant_phone_237_backup)<>1 THEN RAISE EXCEPTION 'MERCHANT237_BACKUP_INVALID';END IF;
 SELECT * INTO STRICT saved FROM saas.merchant_phone_237_backup;
 SELECT * INTO STRICT current_function FROM pg_proc WHERE oid='saas.merchant_whatsapp_command(text,jsonb)'::regprocedure;
 definition:=pg_get_functiondef(current_function.oid);
 IF current_function.oid IS DISTINCT FROM saved.function_oid OR current_function.proowner IS DISTINCT FROM saved.function_owner
  OR current_function.proacl IS DISTINCT FROM saved.function_acl OR NOT current_function.prosecdef
  OR current_function.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  OR pg_get_function_result(current_function.oid)<>'TABLE(outcome text, authority jsonb)'
  OR encode(sha256(convert_to(definition,'UTF8')),'hex') IS DISTINCT FROM saved.published_sha256
  OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex') IS DISTINCT FROM saved.original_sha256
  OR position('staff_not_disabled' IN definition)=0 OR position('prior.authority-''deletedStaff''' IN definition)=0
  OR position('jsonb_build_object(''deletedStaff'',to_jsonb(staff))' IN definition)=0
  OR position('DELETE FROM saas.merchant_phone_staff WHERE id=staff.id;out:=''deleted'';' IN definition)=0
  OR position('saas.admin_login_session_allowed' IN definition)=0 OR position('phone.operator_enrolled_at' IN definition)=0
 THEN RAISE EXCEPTION 'MERCHANT237_FUNCTION_CONTRACT_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.merchant_phone_237_backup'::regclass AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'MERCHANT237_BACKUP_NOT_PRIVATE';END IF;
 FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_identity','celebix_saas_bootstrap','celebix_saas_observability'] LOOP
  IF has_table_privilege(role_name,'saas.merchant_phone_237_backup','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  THEN RAISE EXCEPTION 'MERCHANT237_BACKUP_EXPOSED';END IF;
 END LOOP;
END $assertions$;
