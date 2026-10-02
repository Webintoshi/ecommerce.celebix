BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $contract$
DECLARE
  signature regprocedure:=pg_catalog.to_regprocedure(
    'saas.public_account_auth_verify_phone_v2(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,jsonb)');
  source record;
  role_name text;
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
  ) THEN RAISE EXCEPTION 'STOREFRONT_PHONE_BINDING_CONTRACT_INVALID'; END IF;
  IF NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver',signature,'EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl) acl
      WHERE procedure.oid=signature AND acl.privilege_type='EXECUTE'
        AND acl.grantee NOT IN('celebix_saas_owner'::regrole,'celebix_saas_host_resolver'::regrole))
  THEN RAISE EXCEPTION 'STOREFRONT_PHONE_BINDING_ACL_INVALID'; END IF;
  FOREACH role_name IN ARRAY ARRAY['celebix_saas_identity','celebix_saas_app','celebix_saas_workflow',
    'celebix_saas_bootstrap','celebix_saas_observability','celebix_saas_migrator'] LOOP
    IF pg_catalog.has_function_privilege(role_name,signature,'EXECUTE')
    THEN RAISE EXCEPTION 'STOREFRONT_PHONE_BINDING_ACL_INVALID'; END IF;
  END LOOP;
  FOR source IN SELECT * FROM (VALUES
    ('saas.public_account_auth_verify_phone(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text)',
      'b0a88aa6ef832bb0213bcdaf6494a2ea65106876ab358bbe1908587c99848338',
      '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'),
    ('saas.storefront_identity_session_context(text,timestamptz,jsonb,boolean)',
      '112d28a3cdb6ea51eed19b36327307383483658cbd355a144bec76229e4f5c3f',
      '{celebix_saas_owner=X/celebix_saas_owner}')
  ) AS reviewed(signature,body_hash,acl) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid=pg_catalog.to_regprocedure(source.signature)
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(procedure.oid),'UTF8')),'hex')=source.body_hash
        AND procedure.proowner='celebix_saas_owner'::regrole AND procedure.proacl::text=source.acl
        AND procedure.prosecdef AND procedure.provolatile='v'
        AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
    ) THEN RAISE EXCEPTION 'STOREFRONT_PHONE_BINDING_LEGACY_CONTRACT_CHANGED'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_class
    WHERE oid IN('saas.storefront_accounts'::regclass,'saas.storefront_account_sessions'::regclass,
      'saas.storefront_login_challenges'::regclass,'saas.customers'::regclass)
      AND (NOT relrowsecurity OR NOT relforcerowsecurity OR relowner<>'celebix_saas_owner'::regrole))
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.storefront_accounts'::regclass
      AND conname='storefront_accounts_store_phone_key' AND contype='u' AND convalidated)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.storefront_accounts'::regclass
      AND conname='storefront_accounts_identity_ck' AND convalidated)
  THEN RAISE EXCEPTION 'STOREFRONT_PHONE_BINDING_TABLE_CONTRACT_INVALID'; END IF;
END $contract$;

COMMIT;
