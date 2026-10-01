BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $contract$
DECLARE signature text; role_name text; private_name text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='saas.storefront_accounts'::regclass AND attname='email' AND NOT attnotnull AND NOT attisdropped)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='saas.storefront_accounts'::regclass AND attname='email_normalized' AND NOT attnotnull AND NOT attisdropped)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.storefront_accounts'::regclass AND conname='storefront_accounts_store_phone_key' AND contype='u')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.storefront_accounts'::regclass AND conname='storefront_accounts_email_pair_ck' AND convalidated)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.storefront_accounts'::regclass AND conname='storefront_accounts_phone_pair_ck' AND convalidated)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.storefront_accounts'::regclass AND conname='storefront_accounts_identity_ck' AND convalidated)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.storefront_login_challenges'::regclass AND conname='storefront_login_challenges_recipient_ck' AND convalidated)
  THEN RAISE EXCEPTION 'storefront_whatsapp_identity_contract_invalid'; END IF;
  FOREACH signature IN ARRAY ARRAY[
    'public_account_auth_start_phone(text,timestamptz,uuid,text,text,text,text,timestamptz,text)',
    'public_account_auth_phone_delivery(text,timestamptz,uuid,text,boolean)',
    'public_account_auth_verify_phone(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text)',
    'public_account_auth_start_v3(text,timestamptz,uuid,text,text,text,text,text,text,timestamptz,uuid,text,jsonb,text)',
    'public_account_profile_update(text,timestamptz,jsonb,uuid,text,text,text,text,bigint,text)',
    'public_account_profile_complete(text,timestamptz,jsonb,uuid,text,uuid,text,text,text,uuid,text,text,text,text,text,text)',
    'public_account_auth_verify_v2(text,timestamptz,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text)',
    'public_account_auth_verify(text,timestamptz,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text)'
  ] LOOP
    IF pg_catalog.to_regprocedure('saas.'||signature) IS NULL
      OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.'||signature,'EXECUTE')
      OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure('saas.'||signature) AND proowner='celebix_saas_owner'::regrole AND prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, saas']::text[])
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc procedure CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl) acl WHERE procedure.oid=pg_catalog.to_regprocedure('saas.'||signature) AND acl.grantee=0 AND acl.privilege_type='EXECUTE')
    THEN RAISE EXCEPTION 'storefront_whatsapp_identity_contract_invalid'; END IF;
    FOREACH role_name IN ARRAY ARRAY['celebix_saas_identity','celebix_saas_app','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_observability','celebix_saas_migrator'] LOOP
      IF pg_catalog.has_function_privilege(role_name,'saas.'||signature,'EXECUTE') THEN RAISE EXCEPTION 'storefront_whatsapp_identity_contract_invalid'; END IF;
    END LOOP;
  END LOOP;
  FOREACH private_name IN ARRAY ARRAY['storefront_identity_snapshot','storefront_identity_snapshot_pre_whatsapp','public_account_profile_update_pre_whatsapp','public_account_profile_complete_pre_whatsapp','public_account_auth_verify_pre_whatsapp','public_account_auth_verify_v2_pre_whatsapp'] LOOP
    IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc procedure CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl) acl
      WHERE procedure.pronamespace='saas'::regnamespace AND procedure.proname=private_name AND acl.grantee<>'celebix_saas_owner'::regrole AND acl.privilege_type='EXECUTE')
    THEN RAISE EXCEPTION 'storefront_whatsapp_identity_contract_invalid'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid IN('saas.storefront_accounts'::regclass,'saas.storefront_login_challenges'::regclass) AND (NOT relrowsecurity OR NOT relforcerowsecurity OR relowner<>'celebix_saas_owner'::regrole))
  THEN RAISE EXCEPTION 'storefront_whatsapp_identity_contract_invalid'; END IF;
END $contract$;

COMMIT;
