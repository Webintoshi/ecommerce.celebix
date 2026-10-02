-- Remove only the additive binding verifier; verified identities and history stay intact.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE
  signature regprocedure:=pg_catalog.to_regprocedure(
    'saas.public_account_auth_verify_phone_v2(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,jsonb)');
BEGIN
  IF signature IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc procedure WHERE procedure.oid=signature
      AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(procedure.prosrc,'UTF8')),'hex')
        ='ec746882a9641ef8e41b8ceaee9112c06452469c5a6885246c1353e82ae47fb6'
      AND procedure.proowner='celebix_saas_owner'::regrole AND procedure.prosecdef
      AND procedure.provolatile='v' AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
      AND procedure.proacl::text='{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'
      AND pg_catalog.pg_get_function_result(procedure.oid)='TABLE(outcome text, result_payload jsonb)'
      AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid=pg_catalog.to_regprocedure('saas.public_account_auth_verify_phone(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text)')
      AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(procedure.oid),'UTF8')),'hex')
        ='b0a88aa6ef832bb0213bcdaf6494a2ea65106876ab358bbe1908587c99848338'
      AND procedure.proowner='celebix_saas_owner'::regrole AND procedure.prosecdef
      AND procedure.provolatile='v' AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
      AND procedure.proacl::text='{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'
  ) THEN RAISE EXCEPTION 'STOREFRONT_PHONE_BINDING_DOWN_SOURCE_INVALID'; END IF;
END $preflight$;

DROP FUNCTION saas.public_account_auth_verify_phone_v2(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,jsonb);

COMMIT;
