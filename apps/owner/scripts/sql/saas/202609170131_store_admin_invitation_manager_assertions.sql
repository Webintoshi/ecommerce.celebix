DO $assert$
DECLARE f oid:=to_regprocedure('saas.store_admin_invitation_manager(text,text,text,timestamp with time zone)');
BEGIN
 IF f IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef AND proowner='celebix_saas_owner'::regrole AND proconfig @> ARRAY['search_path=pg_catalog, saas']) OR NOT has_function_privilege('celebix_saas_identity',f,'EXECUTE') OR has_function_privilege('celebix_saas_app',f,'EXECUTE') OR has_function_privilege('celebix_saas_workflow',f,'EXECUTE') OR EXISTS(SELECT 1 FROM pg_proc p,LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=f AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'INVITATION_MANAGER_ASSERTION_FAILED'; END IF;
END $assert$;
