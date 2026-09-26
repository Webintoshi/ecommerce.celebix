BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $in_store_cashier_catalog_assertions$
DECLARE signature text; selected_function pg_catalog.pg_proc%ROWTYPE;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.memberships'::regclass AND conname='memberships_role_check'
      AND contype='c' AND convalidated
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(oid),'cashier')>0)
  THEN RAISE EXCEPTION 'in_store_cashier_role_constraint_invalid'; END IF;

  FOREACH signature IN ARRAY ARRAY[
    'saas.issue_returning_panel_session(text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz)',
    'saas.recover_returning_panel_session(text,text,uuid,text,text)',
    'saas.issue_returning_panel_session_for_admin_host(text,text,text,uuid,uuid,uuid,text,text,timestamptz,timestamptz)',
    'saas.recover_returning_panel_session_for_admin_host(text,text,text,uuid,text,text)',
    'saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text)'
  ] LOOP
    SELECT * INTO selected_function FROM pg_catalog.pg_proc
      WHERE oid=pg_catalog.to_regprocedure(signature);
    IF NOT FOUND OR NOT selected_function.prosecdef
      OR selected_function.proowner<>('celebix_saas_owner'::regrole)::oid
      OR NOT ('search_path=pg_catalog, saas'=ANY(selected_function.proconfig)
        OR 'search_path=pg_catalog,saas'=ANY(selected_function.proconfig))
      OR EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(selected_function.proacl,
        pg_catalog.acldefault('f',selected_function.proowner)))
        WHERE grantee=0 AND privilege_type='EXECUTE')
    THEN RAISE EXCEPTION 'in_store_cashier_function_authority_invalid: %',signature; END IF;
    IF signature LIKE 'saas.%returning_panel_session%'
      AND NOT pg_catalog.has_function_privilege('celebix_saas_identity',selected_function.oid,'EXECUTE')
    THEN RAISE EXCEPTION 'in_store_cashier_identity_execute_missing: %',signature; END IF;
  END LOOP;

  -- Register access never introduces general membership table writes.
  IF pg_catalog.has_table_privilege('celebix_saas_app','saas.memberships','INSERT')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.memberships','UPDATE')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.memberships','DELETE')
  THEN RAISE EXCEPTION 'in_store_cashier_membership_write_leaked'; END IF;
END
$in_store_cashier_catalog_assertions$;
COMMIT;
