DO $f$
DECLARE bad boolean;
BEGIN
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid='saas.payment_attempts'::pg_catalog.regclass
        AND attribute.attname IN('execution_adapter_version','execution_evidence_digest')
        AND NOT attribute.attisdropped AND NOT attribute.attnotnull)<>2
    OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_constraint AS constraint_info
      WHERE constraint_info.conrelid='saas.payment_attempts'::pg_catalog.regclass
        AND constraint_info.conname='payment_attempts_execution_authority_check'
        AND constraint_info.contype='c' AND constraint_info.convalidated
    )
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger_info
      WHERE trigger_info.tgrelid='saas.payment_attempts'::pg_catalog.regclass
        AND trigger_info.tgname IN(
          'payment_attempt_bind_execution_authority',
          'payment_attempt_execution_authority_immutable'
        )
        AND NOT trigger_info.tgisinternal AND trigger_info.tgenabled='O')<>2
  THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_EXECUTION_AUTHORITY_ASSERTION_FAILED'; END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS schema_info ON schema_info.oid=procedure.pronamespace
      WHERE schema_info.nspname='saas'
        AND procedure.proname IN(
          'payment_reconciliation_authority','payment_attempt_claim_reconciliation'
        )
        AND procedure.pronargs IN(2,11)
        AND procedure.prosecdef
        AND procedure.proowner='celebix_saas_owner'::pg_catalog.regrole)<>2
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.payment_reconciliation_authority(uuid,timestamp with time zone)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamp with time zone,timestamp with time zone,text,integer,text)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'public',
      'saas.payment_reconciliation_authority(uuid,timestamp with time zone)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'public',
      'saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamp with time zone,timestamp with time zone,text,integer,text)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_EXECUTION_AUTHORITY_ACL_ASSERTION_FAILED'; END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS schema_info ON schema_info.oid=procedure.pronamespace
      WHERE schema_info.nspname='saas'
        AND procedure.proname IN(
          'payment_attempt_begin_projection','payment_attempt_authority_projection'
        )
        AND procedure.pronargs=1
        AND procedure.prosrc~'''executionAdapterVersion'',attempt.execution_adapter_version'
        AND procedure.prosrc~'''executionEvidenceDigest'',attempt.execution_evidence_digest')<>2
  THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_EXECUTION_PROJECTION_ASSERTION_FAILED'; END IF;
  SELECT NOT(
    table_info.relrowsecurity AND table_info.relforcerowsecurity
  ) INTO bad
  FROM pg_catalog.pg_class AS table_info
  JOIN pg_catalog.pg_namespace AS schema_info ON schema_info.oid=table_info.relnamespace
  WHERE schema_info.nspname='saas' AND table_info.relname='quick_order_link_hosted_authorities';
  IF bad IS DISTINCT FROM false THEN RAISE EXCEPTION 'HOSTED_AUTHORITY_RLS_ASSERTION_FAILED'; END IF;
  IF pg_catalog.has_table_privilege('celebix_saas_app','saas.quick_order_link_hosted_authorities','SELECT')
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.quick_links_create_hosted(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text[],text,jsonb,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'HOSTED_AUTHORITY_ACL_ASSERTION_FAILED'; END IF;
  SELECT pg_catalog.pg_get_userbyid(procedure.proowner)<>'celebix_saas_owner'
      OR procedure.proacl IS DISTINCT FROM
        ARRAY['celebix_saas_owner=X/celebix_saas_owner']::pg_catalog.aclitem[]
      OR pg_catalog.has_function_privilege('public',procedure.oid,'EXECUTE')
    INTO bad
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS schema_info ON schema_info.oid=procedure.pronamespace
  WHERE schema_info.nspname='saas' AND procedure.proname='guard_quick_link_provider_authority'
    AND procedure.pronargs=0;
  IF bad IS DISTINCT FROM false
  THEN RAISE EXCEPTION 'HOSTED_AUTHORITY_PROVIDER_GUARD_ACL_ASSERTION_FAILED'; END IF;
  IF saas.quick_order_hosted_payment_authority_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'HOSTED_AUTHORITY_PREFLIGHT_ASSERTION_FAILED'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.quick_order_links'::pg_catalog.regclass
      AND conname='quick_order_links_one_payment_authority_check'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.quick_order_link_items'::pg_catalog.regclass
      AND conname='quick_order_link_items_item_type_check'
  ) THEN RAISE EXCEPTION 'HOSTED_AUTHORITY_CONSTRAINT_ASSERTION_FAILED'; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS schema_info ON schema_info.oid=procedure.pronamespace
    WHERE schema_info.nspname='saas'
      AND procedure.proname IN('quick_links_list','quick_links_get','quick_links_mutation_projection')
      AND (procedure.prosrc~*'sealed_identity|identity_authority|identity_key_id|payment_method_id')
  ) THEN RAISE EXCEPTION 'HOSTED_AUTHORITY_PUBLIC_PROJECTION_ASSERTION_FAILED'; END IF;
END
$f$;
