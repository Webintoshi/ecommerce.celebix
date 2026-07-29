BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertion$
DECLARE
  function_oid oid:=pg_catalog.to_regprocedure(
    'saas.paytr_iframe_sandbox_evidence_history(uuid,uuid,uuid,uuid,uuid)'
  );
  owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  denied_role text;
  expected_hash constant text:='f1f60d1727f97fefd4c5195090302c5c';
BEGIN
  IF function_oid IS NULL OR (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.pronamespace='saas'::regnamespace
      AND procedure.proname='paytr_iframe_sandbox_evidence_history'
  )<>1 THEN
    RAISE EXCEPTION 'PAYTR_IFRAME_SANDBOX_EVIDENCE_HISTORY_SIGNATURE_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=function_oid
      AND procedure.proowner=owner_oid
      AND procedure.prosecdef
      AND procedure.provolatile='s'
      AND procedure.proretset
      AND procedure.pronargs=5
      AND procedure.proconfig IS NOT DISTINCT FROM
        ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.pg_get_function_result(procedure.oid)=
        'TABLE(outcome text, result_payload jsonb)'
      AND pg_catalog.md5(procedure.prosrc)=expected_hash
  ) THEN
    RAISE EXCEPTION 'PAYTR_IFRAME_SANDBOX_EVIDENCE_HISTORY_FUNCTION_INVALID';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=function_oid
      AND (
        privilege.privilege_type<>'EXECUTE'
        OR privilege.is_grantable
        OR privilege.grantor<>owner_oid
        OR privilege.grantee NOT IN(owner_oid,app_oid)
      )
  ) OR NOT pg_catalog.has_function_privilege(owner_oid,function_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(app_oid,function_oid,'EXECUTE')
  THEN
    RAISE EXCEPTION 'PAYTR_IFRAME_SANDBOX_EVIDENCE_HISTORY_ACL_INVALID';
  END IF;

  FOREACH denied_role IN ARRAY ARRAY[
    'celebix_saas_identity',
    'celebix_saas_workflow',
    'celebix_saas_host_resolver',
    'celebix_saas_bootstrap',
    'celebix_saas_observability',
    'celebix_saas_migrator'
  ] LOOP
    IF pg_catalog.has_function_privilege(
      denied_role,function_oid,'EXECUTE'
    ) THEN
      RAISE EXCEPTION
        'PAYTR_IFRAME_SANDBOX_EVIDENCE_HISTORY_ROLE_ACL_INVALID: %',
        denied_role;
    END IF;
  END LOOP;

  IF pg_catalog.has_table_privilege(
      'celebix_saas_app','saas.checkout_payment_attempts','SELECT'
    ) OR pg_catalog.has_table_privilege(
      'celebix_saas_app','saas.checkout_operations','SELECT'
    ) OR pg_catalog.has_table_privilege(
      'celebix_saas_app','saas.checkout_callback_receipts','SELECT'
    ) OR pg_catalog.has_table_privilege(
      'celebix_saas_app','saas.checkout_reconciliation_receipts','SELECT'
    ) OR pg_catalog.has_table_privilege(
      'celebix_saas_app','saas.checkout_provider_configs','SELECT'
    )
  THEN
    RAISE EXCEPTION
      'PAYTR_IFRAME_SANDBOX_EVIDENCE_HISTORY_DIRECT_TABLE_ACL_INVALID';
  END IF;
END
$assertion$;

COMMIT;
