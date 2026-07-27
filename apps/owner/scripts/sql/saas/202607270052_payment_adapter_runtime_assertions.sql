DO $f$
DECLARE
  signature text;
  source_definition text;
  workflow_functions text[]:=ARRAY[
    'saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)',
    'saas.payment_attempt_mark_initialized(uuid,uuid,text,bigint,bigint,text,text,text,timestamp with time zone)',
    'saas.payment_attempt_mark_unknown(uuid,uuid,text,bigint,bigint,text,text,timestamp with time zone)',
    'saas.payment_callback_authority(text,text,timestamp with time zone)',
    'saas.payment_attempt_settle_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamp with time zone)',
    'saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamp with time zone,timestamp with time zone)',
    'saas.payment_attempt_finalize_reconciliation(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamp with time zone)'
  ];
BEGIN
  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid=relation.relnamespace
      JOIN pg_catalog.pg_roles AS owner_role
        ON owner_role.oid=relation.relowner
      WHERE namespace.nspname='saas'
        AND relation.relname IN(
          'payment_attempts','payment_attempt_events',
          'payment_callback_bindings','payment_attempt_operations'
        )
        AND relation.relrowsecurity AND relation.relforcerowsecurity
        AND owner_role.rolname='celebix_saas_owner')<>4
  THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_RELATION_AUTHORITY_INVALID'; END IF;

  IF pg_catalog.has_table_privilege(
      'celebix_saas_workflow','saas.payment_attempts','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege(
      'celebix_saas_workflow','saas.payment_attempt_events','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege(
      'celebix_saas_workflow','saas.payment_callback_bindings','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege(
      'celebix_saas_workflow','saas.payment_attempt_operations','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege(
      'celebix_saas_app','saas.payment_attempts','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege(
      'celebix_saas_app','saas.payment_attempt_events','SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_DIRECT_DML_INVALID'; END IF;

  FOREACH signature IN ARRAY workflow_functions LOOP
    IF pg_catalog.to_regprocedure(signature) IS NULL
      OR NOT pg_catalog.has_function_privilege(
        'celebix_saas_workflow',signature,'EXECUTE')
      OR pg_catalog.has_function_privilege(
        'celebix_saas_app',signature,'EXECUTE')
      OR NOT (SELECT procedure.prosecdef
              FROM pg_catalog.pg_proc AS procedure
              WHERE procedure.oid=pg_catalog.to_regprocedure(signature))
      OR (SELECT owner_role.rolname
          FROM pg_catalog.pg_proc AS procedure
          JOIN pg_catalog.pg_roles AS owner_role
            ON owner_role.oid=procedure.proowner
          WHERE procedure.oid=pg_catalog.to_regprocedure(signature))
        <>'celebix_saas_owner'
    THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_FUNCTION_AUTHORITY_INVALID: %',
      signature;
    END IF;
    SELECT pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(signature))
      INTO source_definition;
    IF source_definition~*'current_setting[[:space:]]*\('
      OR source_definition~*'set_config[[:space:]]*\('
      OR source_definition~*'EXECUTE[[:space:]]'
    THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_AMBIENT_AUTHORITY_INVALID: %',
      signature;
    END IF;
  END LOOP;

  IF pg_catalog.to_regclass('saas.checkout_payment_attempts') IS NULL
    OR pg_catalog.to_regclass('saas.payment_attempt_events_callback_key_idx') IS NULL
    OR pg_catalog.to_regclass('saas.payment_attempts_reconciliation_idx') IS NULL
  THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_COMPATIBILITY_OR_INDEX_INVALID'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.payment_attempts'::regclass
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%provider_outcome_unknown%'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%reconciliation_required%'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%partially_refunded%'
  ) THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_STATUS_CONSTRAINT_INVALID'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.payment_callback_bindings'::regclass
      AND contype='f'
      AND pg_catalog.pg_get_constraintdef(oid)=
        'FOREIGN KEY (store_id, attempt_id, payment_method_id, profile_id, provider_code, environment, credential_version) REFERENCES saas.payment_attempts(store_id, id, payment_method_id, profile_id, provider_code, environment, credential_version) ON DELETE RESTRICT'
  ) THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_CALLBACK_AUTHORITY_INVALID'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='saas.payment_callback_bindings'::regclass
      AND attname='callback_binding_digest' AND atttypid='character'::regtype
      AND atttypmod=68 AND NOT attisdropped
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid IN(
      'saas.payment_attempts'::regclass,
      'saas.payment_attempt_events'::regclass,
      'saas.payment_callback_bindings'::regclass,
      'saas.payment_attempt_operations'::regclass
    )
      AND NOT attisdropped
      AND attname~*'(card|pan|cvv|cvc|raw|plaintext|password)'
  ) THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_COLUMN_SAFETY_INVALID'; END IF;

  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_trigger
      WHERE tgrelid IN(
        'saas.payment_attempts'::regclass,
        'saas.payment_attempt_events'::regclass,
        'saas.payment_callback_bindings'::regclass,
        'saas.payment_attempt_operations'::regclass
      )
        AND tgname IN(
          'payment_attempts_transition','payment_attempt_events_immutable',
          'payment_callback_bindings_immutable',
          'payment_attempt_operations_immutable'
        )
        AND NOT tgisinternal)<>4
  THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_TRIGGER_INVALID'; END IF;
END
$f$;
