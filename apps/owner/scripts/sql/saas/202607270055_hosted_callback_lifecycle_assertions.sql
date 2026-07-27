DO $f$
DECLARE
  signature text:=
    'saas.payment_attempt_apply_hosted_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamp with time zone)';
  legacy_signature text:=
    'saas.payment_attempt_settle_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamp with time zone)';
  owner_oid oid:='celebix_saas_owner'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  expected_hash text:='c9c716df2964d4aa02265eb836fe0665';
  role_name text;
BEGIN
  IF pg_catalog.to_regprocedure(signature) IS NULL
    OR NOT EXISTS(
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_language AS language ON language.oid=procedure.prolang
      WHERE procedure.oid=pg_catalog.to_regprocedure(signature)
        AND procedure.proowner=owner_oid
        AND procedure.prokind='f'
        AND procedure.prosecdef
        AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict
        AND procedure.proparallel='u'
        AND procedure.provolatile='v'
        AND procedure.proconfig IS NOT DISTINCT FROM
          ARRAY['search_path=pg_catalog, saas']::text[]
        AND language.lanname='plpgsql'
        AND pg_catalog.pg_get_function_result(procedure.oid)=
          'TABLE(outcome text, result_payload jsonb)'
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
    )
  THEN RAISE EXCEPTION 'PAYMENT_HOSTED_CALLBACK_LIFECYCLE_FUNCTION_INVALID'; END IF;

  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid=pg_catalog.to_regprocedure(signature)
        AND privilege.privilege_type='EXECUTE'
        AND privilege.grantor=owner_oid
        AND privilege.grantee IN(owner_oid,workflow_oid)
        AND NOT privilege.is_grantable)<>2
    OR EXISTS(
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid=pg_catalog.to_regprocedure(signature)
        AND privilege.privilege_type='EXECUTE'
        AND privilege.grantee NOT IN(owner_oid,workflow_oid)
    )
  THEN RAISE EXCEPTION 'PAYMENT_HOSTED_CALLBACK_LIFECYCLE_ACL_INVALID'; END IF;

  IF pg_catalog.to_regprocedure(legacy_signature) IS NULL
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',legacy_signature,'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'celebix_saas_app',legacy_signature,'EXECUTE'
    )
  THEN RAISE EXCEPTION 'PAYMENT_HOSTED_CALLBACK_LIFECYCLE_LEGACY_RPC_INVALID'; END IF;

  IF NOT EXISTS(
      SELECT 1
      FROM pg_catalog.pg_trigger AS trigger
      JOIN pg_catalog.pg_proc AS procedure ON procedure.oid=trigger.tgfoid
      WHERE trigger.tgrelid='saas.payment_attempts'::regclass
        AND trigger.tgname='payment_attempts_transition'
        AND trigger.tgenabled='O'
        AND trigger.tgtype=27
        AND procedure.oid='saas.guard_payment_attempt_transition()'::regprocedure
        AND pg_catalog.md5(procedure.prosrc)='6d4169f345e986651d0a30552ba449fd'
    )
  THEN RAISE EXCEPTION 'PAYMENT_HOSTED_CALLBACK_LIFECYCLE_TRANSITION_GUARD_INVALID'; END IF;

  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid=relation.relnamespace
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=relation.relowner
      WHERE namespace.nspname='saas'
        AND relation.relname IN(
          'payment_attempts','payment_attempt_events',
          'payment_callback_bindings','payment_attempt_operations'
        )
        AND relation.relkind='r'
        AND relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND owner_role.rolname='celebix_saas_owner')<>4
  THEN RAISE EXCEPTION 'PAYMENT_HOSTED_CALLBACK_LIFECYCLE_RLS_INVALID'; END IF;

  FOREACH role_name IN ARRAY ARRAY[
    'celebix_saas_identity','celebix_saas_app','celebix_saas_workflow',
    'celebix_saas_host_resolver','celebix_saas_bootstrap',
    'celebix_saas_observability','celebix_saas_migrator'
  ] LOOP
    IF pg_catalog.has_table_privilege(
      role_name,'saas.payment_attempts',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) OR pg_catalog.has_table_privilege(
      role_name,'saas.payment_attempt_events',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) OR pg_catalog.has_table_privilege(
      role_name,'saas.payment_callback_bindings',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) OR pg_catalog.has_table_privilege(
      role_name,'saas.payment_attempt_operations',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) THEN
      RAISE EXCEPTION 'PAYMENT_HOSTED_CALLBACK_LIFECYCLE_DIRECT_DML_INVALID: %',
        role_name;
    END IF;
  END LOOP;
END
$f$;
