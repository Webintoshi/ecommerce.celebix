BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $panel_session_storefront_assertions$
DECLARE
  function_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('saas.resolve_panel_session(text,text,timestamptz)'::regprocedure)
    INTO function_definition;
  IF function_definition IS NULL
     OR pg_catalog.strpos(function_definition, 'store_domains') = 0
     OR pg_catalog.strpos(function_definition, 'resolvedHost') = 0
     OR pg_catalog.strpos(function_definition, 'verified_at <= p_now') = 0 THEN
    RAISE EXCEPTION 'panel_session_storefront_authority_missing';
  END IF;
END
$panel_session_storefront_assertions$;

COMMIT;
