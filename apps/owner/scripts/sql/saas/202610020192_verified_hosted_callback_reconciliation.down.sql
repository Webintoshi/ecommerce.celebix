-- Remove only the four migration192 RPCs. Existing payment data and APIs stay intact.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $assertions$
DECLARE source record;
BEGIN
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_class relation
      WHERE relation.oid IN('saas.payment_attempts'::regclass,'saas.payment_callback_bindings'::regclass,
        'saas.payment_attempt_events'::regclass,'saas.payment_attempt_operations'::regclass)
        AND relation.relowner='celebix_saas_owner'::regrole AND relation.relrowsecurity AND relation.relforcerowsecurity)<>4
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger trigger
      WHERE (trigger.tgrelid,trigger.tgname) IN(
        ('saas.payment_callback_bindings'::regclass,'payment_callback_bindings_immutable'),
        ('saas.payment_attempt_events'::regclass,'payment_attempt_events_immutable'),
        ('saas.payment_attempt_operations'::regclass,'payment_attempt_operations_immutable'))
        AND trigger.tgfoid='saas.guard_merchant_admin_immutable()'::regprocedure
        AND trigger.tgenabled='O' AND trigger.tgtype=27 AND NOT trigger.tgisinternal)<>3
  THEN RAISE EXCEPTION 'VERIFIED_HOSTED_CALLBACK_IMMUTABLE_SOURCE_INVALID'; END IF;
  FOR source IN SELECT * FROM (VALUES
    ('saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz)','9f1038ca8741a52301c8fe554573b9c15f0dabca4a1b21232b8a80824c7eecac','{celebix_saas_owner=X/celebix_saas_owner}'),
    ('saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz,text,integer,text)','fbae63fb5e5f60ef409f7b5a6601b2931e358a2fea277b9de38f2f93fb9fa27c','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}'),
    ('saas.payment_attempt_finalize_reconciliation(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz)','8a83d23717a5f6ddd08efad44b1c8130a7d8e333e2da5912702566ff85b59210','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}'),
    ('saas.merchant_provider_execution_authority_matches(text,text,text,integer,text)','8c928d237e67e799742de6c6abe3e7f32d58b8e10b9fa8914eaa2a10b314bff1','{celebix_saas_owner=X/celebix_saas_owner}'),
    ('saas.payment_attempt_claim_verified_hosted_callback(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz,text,integer,text,text,text,text,text,text,text,bigint,bigint,text)','dfb5e986d1ed01c936dd6572fd43e00bf8e69735dc4c5f5c4989a991f63aa78c','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}'),
    ('saas.payment_attempt_finalize_verified_hosted_callback(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz,text,text,text,text)','3a9791fba5fdba05a7eafce3c957b9e6ec5e2db931bc36a771322e44b2f69b4f','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}'),
    ('saas.payment_attempt_verified_hosted_callback_evidence(uuid,bigint,timestamptz,text,integer,text)','e58347c0e32e7bb7cfaa62461a11c1b06447696b07d8e01b77580dda6fe20e32','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}'),
    ('saas.payment_attempt_finalize_reconciliation_guarded(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz)','6ca424050b32b448d617d2ae9be7de2b8f94afc22f43f37764a231360ebe2dc2','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}')
  ) AS reviewed(signature,body_hash,acl) LOOP
    IF pg_catalog.to_regprocedure(source.signature) IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_language language ON language.oid=procedure.prolang
      WHERE procedure.oid=pg_catalog.to_regprocedure(source.signature)
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(procedure.oid),'UTF8')),'hex')=source.body_hash
        AND procedure.proowner='celebix_saas_owner'::regrole
        AND procedure.proacl::text=source.acl AND procedure.prosecdef
        AND ((procedure.provolatile='s' AND procedure.proname='payment_attempt_verified_hosted_callback_evidence')
          OR (procedure.provolatile='v' AND procedure.proname<>'payment_attempt_verified_hosted_callback_evidence'))
        AND procedure.prokind='f'
        AND NOT procedure.proleakproof AND NOT procedure.proisstrict
        AND procedure.proparallel='u' AND language.lanname='plpgsql'
        AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
    ) THEN RAISE EXCEPTION 'VERIFIED_HOSTED_CALLBACK_REVIEWED_FUNCTION_INVALID'; END IF;
  END LOOP;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc procedure
      WHERE procedure.pronamespace='saas'::regnamespace
        AND procedure.proname IN('payment_attempt_claim_verified_hosted_callback','payment_attempt_finalize_verified_hosted_callback','payment_attempt_verified_hosted_callback_evidence','payment_attempt_finalize_reconciliation_guarded')
        AND pg_catalog.pg_get_function_result(procedure.oid)='TABLE(outcome text, result_payload jsonb)')<>4
  THEN RAISE EXCEPTION 'VERIFIED_HOSTED_CALLBACK_CONTRACT_INVALID'; END IF;
  IF pg_catalog.has_function_privilege('public',
    'saas.payment_attempt_claim_verified_hosted_callback(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz,text,integer,text,text,text,text,text,text,text,bigint,bigint,text)','EXECUTE')
    OR pg_catalog.has_function_privilege('public',
    'saas.payment_attempt_finalize_verified_hosted_callback(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz,text,text,text,text)','EXECUTE')
    OR pg_catalog.has_function_privilege('public',
    'saas.payment_attempt_verified_hosted_callback_evidence(uuid,bigint,timestamptz,text,integer,text)','EXECUTE')
    OR pg_catalog.has_function_privilege('public',
    'saas.payment_attempt_finalize_reconciliation_guarded(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz)','EXECUTE')
  THEN RAISE EXCEPTION 'VERIFIED_HOSTED_CALLBACK_PUBLIC_EXECUTE_INVALID'; END IF;
END $assertions$;

DROP FUNCTION saas.payment_attempt_claim_verified_hosted_callback(uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz,text,integer,text,text,text,text,text,text,text,bigint,bigint,text);
DROP FUNCTION saas.payment_attempt_finalize_verified_hosted_callback(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz,text,text,text,text);

DROP FUNCTION saas.payment_attempt_verified_hosted_callback_evidence(uuid,bigint,timestamptz,text,integer,text);

DROP FUNCTION saas.payment_attempt_finalize_reconciliation_guarded(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamptz);

COMMIT;
