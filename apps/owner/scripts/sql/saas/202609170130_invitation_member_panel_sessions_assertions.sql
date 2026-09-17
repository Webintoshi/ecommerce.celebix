DO $invitation_member_sessions$
DECLARE f regprocedure; name text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'saas.issue_returning_panel_session_for_admin_host(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz)',
    'saas.recover_returning_panel_session_for_admin_host(text,text,text,uuid,text,text)'
  ] LOOP
    f := pg_catalog.to_regprocedure(name);
    IF f IS NULL THEN RAISE EXCEPTION 'INVITATION_MEMBER_SESSION_FUNCTION_MISSING'; END IF;
    IF NOT pg_catalog.has_function_privilege('celebix_saas_identity',f,'EXECUTE')
      OR pg_catalog.has_function_privilege('public',f,'EXECUTE')
      OR pg_catalog.has_function_privilege('celebix_saas_app',f,'EXECUTE')
      OR pg_catalog.has_function_privilege('celebix_saas_workflow',f,'EXECUTE')
      OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=f AND r.rolname='celebix_saas_owner' AND p.prosecdef AND p.proconfig @> ARRAY['search_path=pg_catalog, saas'])
    THEN RAISE EXCEPTION 'INVITATION_MEMBER_SESSION_AUTHORITY_INVALID'; END IF;
  END LOOP;
END
$invitation_member_sessions$;
