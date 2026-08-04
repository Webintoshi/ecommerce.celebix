BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
DECLARE table_name text; signature text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'storefront_accounts','storefront_login_challenges','storefront_account_sessions',
    'storefront_account_order_links','storefront_account_favorites','storefront_account_cart_links',
    'storefront_identity_operations','storefront_identity_audit','storefront_identity_email_outbox'
  ] LOOP
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_class relation
      WHERE relation.oid=pg_catalog.to_regclass('saas.'||table_name)
        AND relation.relkind='r' AND relation.relowner='celebix_saas_owner'::regrole
        AND relation.relrowsecurity AND relation.relforcerowsecurity
    ) THEN RAISE EXCEPTION 'storefront_customer_identity_contract_invalid'; END IF;
    FOREACH role_name IN ARRAY ARRAY['celebix_saas_identity','celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_bootstrap','celebix_saas_observability','celebix_saas_migrator'] LOOP
      IF pg_catalog.has_table_privilege(role_name,'saas.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
      THEN RAISE EXCEPTION 'storefront_customer_identity_contract_invalid'; END IF;
    END LOOP;
    IF EXISTS(
      SELECT 1 FROM pg_catalog.pg_class relation
      CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) privilege
      WHERE relation.oid=pg_catalog.to_regclass('saas.'||table_name)
        AND privilege.grantee=0 AND privilege.privilege_type IN('SELECT','INSERT','UPDATE','DELETE')
    ) THEN RAISE EXCEPTION 'storefront_customer_identity_contract_invalid'; END IF;
  END LOOP;

  FOREACH signature IN ARRAY ARRAY[
    'public_account_auth_start(text,timestamp with time zone,uuid,text,text,text,text,timestamp with time zone,uuid,text,jsonb,text)',
    'public_account_auth_verify(text,timestamp with time zone,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text)',
    'public_account_profile_complete(text,timestamp with time zone,jsonb,uuid,text,uuid,text,text,text,uuid,text,text,text,text,text,text)',
    'public_account_session_get(text,timestamp with time zone,jsonb)',
    'public_account_logout(text,timestamp with time zone,jsonb,text)',
    'public_account_logout_all(text,timestamp with time zone,jsonb,text)',
    'public_account_profile_update(text,timestamp with time zone,jsonb,uuid,text,text,text,text,bigint,text)',
    'public_account_address_save(text,timestamp with time zone,jsonb,uuid,text,uuid,text,text,text,text,text,text,text,text,boolean,bigint,text)',
    'public_account_address_delete(text,timestamp with time zone,jsonb,uuid,text,uuid,bigint,text)',
    'public_account_favorite_set(text,timestamp with time zone,jsonb,uuid,text,uuid,boolean,text)',
    'public_account_orders(text,timestamp with time zone,jsonb,integer,text)',
    'public_account_order_get(text,timestamp with time zone,jsonb,text)',
    'public_account_sessions(text,timestamp with time zone,jsonb)',
    'public_account_session_revoke(text,timestamp with time zone,jsonb,uuid,text,text,text)'
  ] LOOP
    IF pg_catalog.to_regprocedure('saas.'||signature) IS NULL
      OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.'||signature,'EXECUTE')
      OR pg_catalog.has_function_privilege('celebix_saas_app','saas.'||signature,'EXECUTE')
      OR EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc public_procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(public_procedure.proacl) privilege
        WHERE public_procedure.oid=pg_catalog.to_regprocedure('saas.'||signature)
          AND privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
      )
      OR NOT EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc procedure
        WHERE procedure.oid=pg_catalog.to_regprocedure('saas.'||signature)
          AND procedure.proowner='celebix_saas_owner'::regrole AND procedure.prosecdef
          AND procedure.proconfig @> ARRAY['search_path=pg_catalog, saas']::text[]
      )
    THEN RAISE EXCEPTION 'storefront_customer_identity_contract_invalid'; END IF;
  END LOOP;

  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.storefront_identity_audit'::regclass AND tgname='storefront_identity_audit_immutable' AND tgenabled='O' AND NOT tgisinternal)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.storefront_identity_operations'::regclass AND tgname='storefront_identity_operations_immutable' AND tgenabled='O' AND NOT tgisinternal)
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.storefront_identity_email_outbox'::regclass AND tgname='storefront_identity_outbox_guard' AND tgenabled='O' AND NOT tgisinternal)
    OR pg_catalog.to_regprocedure('saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)') IS NULL
  THEN RAISE EXCEPTION 'storefront_customer_identity_contract_invalid'; END IF;
END
$f$;

COMMIT;
