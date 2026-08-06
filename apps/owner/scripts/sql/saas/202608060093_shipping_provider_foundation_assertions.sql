BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $function$
BEGIN
  IF saas.shipping_provider_preflight() IS DISTINCT FROM true
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas' AND relation.relname='shipping_provider_profiles'
        AND relation.relrowsecurity AND relation.relforcerowsecurity
    )
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.shipping_provider_profiles','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_workflow','saas.shipping_provider_profiles','SELECT,INSERT,UPDATE,DELETE')
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.shipping_connection_current(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.shipping_validation_claim(text,timestamp with time zone,integer,uuid)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.shipping_validation_open_credential(uuid,text,uuid,bigint,timestamp with time zone)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'SHIPPING_PROVIDER_FOUNDATION_CONTRACT_INVALID'; END IF;
END
$function$;

COMMIT;
