DO $custom_admin_handoff_redemption_assertions$
DECLARE
  function_oid regprocedure := pg_catalog.to_regprocedure(
    'saas.redeem_cross_host_panel_handoff(text,text,text,uuid,uuid,uuid,text,text,timestamp with time zone,timestamp with time zone)'
  );
  definition text;
BEGIN
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'CUSTOM_ADMIN_HANDOFF_REDEMPTION_FUNCTION_MISSING';
  END IF;
  IF NOT pg_catalog.has_function_privilege('celebix_saas_identity', function_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('public', function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'CUSTOM_ADMIN_HANDOFF_REDEMPTION_GRANT_INVALID';
  END IF;
  IF (SELECT owner.rolname FROM pg_catalog.pg_proc AS proc JOIN pg_catalog.pg_roles AS owner ON owner.oid = proc.proowner WHERE proc.oid = function_oid) <> 'celebix_saas_owner' THEN
    RAISE EXCEPTION 'CUSTOM_ADMIN_HANDOFF_REDEMPTION_OWNER_INVALID';
  END IF;
  SELECT pg_catalog.pg_get_functiondef(function_oid) INTO definition;
  IF definition !~ 'domain\.hostname = handoff\.destination_hostname'
     OR definition !~ 'domain\.status = ''active'''
     OR definition ~ 'domain\.canonical' THEN
    RAISE EXCEPTION 'CUSTOM_ADMIN_HANDOFF_REDEMPTION_POLICY_INVALID';
  END IF;
END
$custom_admin_handoff_redemption_assertions$;
