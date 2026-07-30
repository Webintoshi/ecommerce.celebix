DO $assertions$
BEGIN
  IF to_regprocedure('saas.issue_returning_panel_session_for_admin_host(text,text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)') IS NULL
     OR to_regprocedure('saas.recover_returning_panel_session_for_admin_host(text,text,text,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'returning_login_admin_host_functions_missing';
  END IF;
  IF NOT has_function_privilege('celebix_saas_identity', 'saas.issue_returning_panel_session_for_admin_host(text,text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)', 'EXECUTE') THEN
    RAISE EXCEPTION 'returning_login_admin_host_issue_grant_missing';
  END IF;
END
$assertions$;
