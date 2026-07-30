DO $panel_store_options_assertions$
BEGIN
  IF pg_catalog.to_regprocedure('saas.list_panel_session_store_options(text,text,timestamp with time zone)') IS NULL THEN
    RAISE EXCEPTION 'panel_store_options_function_missing';
  END IF;
  IF NOT pg_catalog.has_function_privilege(
    'celebix_saas_identity',
    'saas.list_panel_session_store_options(text,text,timestamp with time zone)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'panel_store_options_grant_missing';
  END IF;
END
$panel_store_options_assertions$;
