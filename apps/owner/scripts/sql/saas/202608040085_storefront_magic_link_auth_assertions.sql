BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $block$
DECLARE start_definition text; verify_definition text;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='saas.storefront_login_challenges'::pg_catalog.regclass AND attname='ticket_key_id' AND NOT attisdropped
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='saas.storefront_login_challenges'::pg_catalog.regclass AND attname='ticket_digest' AND NOT attisdropped
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid='saas.storefront_login_challenges'::pg_catalog.regclass AND relrowsecurity AND relforcerowsecurity
  ) OR to_regprocedure('saas.public_account_auth_start_v2(text,timestamp with time zone,uuid,text,text,text,text,text,text,timestamp with time zone,uuid,text,jsonb,text)') IS NULL
    OR to_regprocedure('saas.public_account_auth_verify_v2(text,timestamp with time zone,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text)') IS NULL
  THEN RAISE EXCEPTION 'storefront_magic_link_auth_contract_invalid'; END IF;

  SELECT pg_catalog.pg_get_functiondef('saas.public_account_auth_start_v2(text,timestamp with time zone,uuid,text,text,text,text,text,text,timestamp with time zone,uuid,text,jsonb,text)'::pg_catalog.regprocedure)
    INTO start_definition;
  SELECT pg_catalog.pg_get_functiondef('saas.public_account_auth_verify_v2(text,timestamp with time zone,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text)'::pg_catalog.regprocedure)
    INTO verify_definition;
  IF start_definition NOT LIKE '%SECURITY DEFINER%' OR verify_definition NOT LIKE '%SECURITY DEFINER%'
    OR verify_definition NOT LIKE '%FOR UPDATE%' OR verify_definition NOT LIKE '%consumed_at=p_now%'
  THEN RAISE EXCEPTION 'storefront_magic_link_auth_contract_invalid'; END IF;

  IF has_table_privilege('celebix_saas_host_resolver','saas.storefront_login_challenges','SELECT')
    OR has_table_privilege('celebix_saas_host_resolver','saas.storefront_login_challenges','INSERT')
    OR has_table_privilege('celebix_saas_host_resolver','saas.storefront_login_challenges','UPDATE')
    OR has_table_privilege('celebix_saas_host_resolver','saas.storefront_login_challenges','DELETE')
    OR NOT has_function_privilege('celebix_saas_host_resolver','saas.public_account_auth_start_v2(text,timestamp with time zone,uuid,text,text,text,text,text,text,timestamp with time zone,uuid,text,jsonb,text)','EXECUTE')
    OR NOT has_function_privilege('celebix_saas_host_resolver','saas.public_account_auth_verify_v2(text,timestamp with time zone,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'storefront_magic_link_auth_contract_invalid'; END IF;
END $block$;

COMMIT;
