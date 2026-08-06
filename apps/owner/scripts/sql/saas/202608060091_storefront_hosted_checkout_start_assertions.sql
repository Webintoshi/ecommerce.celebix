BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE signature text; resolver oid; owner_oid oid;
BEGIN
  resolver:='celebix_saas_host_resolver'::pg_catalog.regrole;
  owner_oid:='celebix_saas_owner'::pg_catalog.regrole;
  FOREACH signature IN ARRAY ARRAY[
    'saas.public_storefront_hosted_checkout_authority(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid)',
    'saas.public_storefront_hosted_checkout_begin(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text)',
    'saas.public_storefront_hosted_checkout_presentation_save(text,timestamp with time zone,jsonb,uuid,text,bigint,text,text,jsonb,timestamp with time zone)',
    'saas.public_storefront_hosted_checkout_presentation(text,timestamp with time zone,jsonb)',
    'saas.public_storefront_hosted_checkout_status(text,timestamp with time zone,jsonb)'
  ] LOOP
    IF pg_catalog.to_regprocedure(signature) IS NULL
      OR (SELECT proowner<>owner_oid OR prosecdef IS DISTINCT FROM true
          FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(signature))
      OR NOT pg_catalog.has_function_privilege(resolver,signature,'EXECUTE')
      OR pg_catalog.has_function_privilege('public',signature,'EXECUTE')
      OR pg_catalog.has_function_privilege('celebix_saas_app',signature,'EXECUTE')
      OR pg_catalog.has_function_privilege('celebix_saas_workflow',signature,'EXECUTE')
    THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_START_CONTRACT_INVALID: %',signature; END IF;
  END LOOP;
  IF pg_catalog.to_regprocedure('saas.storefront_hosted_checkout_authority_projection(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid)') IS NULL
    OR pg_catalog.has_function_privilege(resolver,
      'saas.storefront_hosted_checkout_authority_projection(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_START_PRIVATE_AUTHORITY_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid IN(
      pg_catalog.to_regprocedure('saas.public_storefront_hosted_checkout_status(text,timestamp with time zone,jsonb)'),
      pg_catalog.to_regprocedure('saas.public_storefront_hosted_checkout_presentation(text,timestamp with time zone,jsonb)')
    ) AND procedure.prosrc~*'(sealed_credentials|delivery_snapshot|item_snapshot|profile_id)')
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_START_PUBLIC_SURFACE_INVALID'; END IF;
END
$f$;

COMMIT;
