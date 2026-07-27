DO $f$
DECLARE
  signature text;
  source_definition text;
  definition_index integer;
  definition_hash text;
  definition_result text;
  definition_language text;
  relation_name text;
  role_name text;
  owner_oid oid:='celebix_saas_owner'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  private_functions text[]:=ARRAY[
    'saas.guard_payment_attempt_transition()',
    'saas.payment_attempt_mutation_projection(uuid,boolean)',
    'saas.payment_attempt_event_projection(uuid,boolean)',
    'saas.payment_attempt_begin_projection(uuid)',
    'saas.payment_attempt_authority_projection(uuid)',
    'saas.payment_attempt_claim_projection(uuid)'
  ];
  workflow_functions text[]:=ARRAY[
    'saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)',
    'saas.payment_attempt_mark_initialized(uuid,uuid,text,bigint,bigint,text,text,text,timestamp with time zone)',
    'saas.payment_attempt_mark_unknown(uuid,uuid,text,bigint,bigint,text,text,timestamp with time zone)',
    'saas.payment_callback_authority(text,text,timestamp with time zone)',
    'saas.payment_attempt_settle_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamp with time zone)',
    'saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamp with time zone,timestamp with time zone)',
    'saas.payment_attempt_finalize_reconciliation(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamp with time zone)'
  ];
  definition_functions text[]:=ARRAY[
    'saas.guard_payment_attempt_transition()',
    'saas.payment_attempt_mutation_projection(uuid,boolean)',
    'saas.payment_attempt_event_projection(uuid,boolean)',
    'saas.payment_attempt_begin_projection(uuid)',
    'saas.payment_attempt_authority_projection(uuid)',
    'saas.payment_attempt_claim_projection(uuid)',
    'saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)',
    'saas.payment_attempt_mark_initialized(uuid,uuid,text,bigint,bigint,text,text,text,timestamp with time zone)',
    'saas.payment_attempt_mark_unknown(uuid,uuid,text,bigint,bigint,text,text,timestamp with time zone)',
    'saas.payment_callback_authority(text,text,timestamp with time zone)',
    'saas.payment_attempt_settle_callback(text,text,uuid,text,text,bigint,bigint,text,text,text,bigint,text,timestamp with time zone)',
    'saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamp with time zone,timestamp with time zone)',
    'saas.payment_attempt_finalize_reconciliation(uuid,uuid,text,bigint,text,uuid,bigint,text,text,text,bigint,text,timestamp with time zone)'
  ];
  definition_hashes text[]:=ARRAY[
    '6d4169f345e986651d0a30552ba449fd',
    '2a04d1cf3c0e542e4735bb3bf31820e6',
    '9433d74f0fbc65e4bea024509822f258',
    '349cef8303b25b8c6a156caea34e8f68',
    '86b6201d851e35a4155875aef069d7b8',
    '5eb5f23113a284966b8bed189694783b',
    'e5439203d385e21cecf9a49826229d3c',
    'c4726f6c88e7680dda79b960dd426000',
    '7c26feb671b2a2c6bad0e4cfba0d18c0',
    '9f3f5598f4729333593c86d4a5043a65',
    'e2f017f9982abf13452f70a1ffc744a6',
    '47127c9565ec4802a08340398d88c877',
    '13e1712cc142079c1efdaf830a9d786c'
  ];
  definition_results text[]:=ARRAY[
    'trigger','jsonb','jsonb','jsonb','jsonb','jsonb',
    'TABLE(outcome text, result_payload jsonb)',
    'TABLE(outcome text, result_payload jsonb)',
    'TABLE(outcome text, result_payload jsonb)',
    'TABLE(outcome text, result_payload jsonb)',
    'TABLE(outcome text, result_payload jsonb)',
    'TABLE(outcome text, result_payload jsonb)',
    'TABLE(outcome text, result_payload jsonb)'
  ];
  definition_languages text[]:=ARRAY[
    'plpgsql','sql','sql','sql','sql','sql',
    'plpgsql','plpgsql','plpgsql','plpgsql','plpgsql','plpgsql','plpgsql'
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
        AND relation.relkind='r'
        AND relation.relrowsecurity AND relation.relforcerowsecurity
        AND owner_role.rolname='celebix_saas_owner')<>4
  THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_RELATION_AUTHORITY_INVALID'; END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'payment_attempts','payment_attempt_events',
    'payment_callback_bindings','payment_attempt_operations'
  ] LOOP
    IF (SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_class AS relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            relation.relacl,pg_catalog.acldefault('r',relation.relowner)
          )
        ) AS privilege
        WHERE relation.oid=('saas.'||relation_name)::regclass
          AND privilege.grantee=relation.relowner
          AND privilege.grantor=relation.relowner
          AND NOT privilege.is_grantable
          AND privilege.privilege_type IN(
            'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
          ))<>7
      OR EXISTS(
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            relation.relacl,pg_catalog.acldefault('r',relation.relowner)
          )
        ) AS privilege
        WHERE relation.oid=('saas.'||relation_name)::regclass
          AND privilege.grantee<>relation.relowner
      )
    THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_RELATION_ACL_INVALID: %',
      relation_name;
    END IF;
    FOREACH role_name IN ARRAY ARRAY[
      'celebix_saas_identity','celebix_saas_app','celebix_saas_workflow',
      'celebix_saas_host_resolver','celebix_saas_bootstrap',
      'celebix_saas_observability','celebix_saas_migrator'
    ] LOOP
      IF pg_catalog.has_table_privilege(
        role_name,'saas.'||relation_name,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_RELATION_ACL_INVALID: % %',
        relation_name,role_name;
      END IF;
    END LOOP;
  END LOOP;

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
      OR NOT EXISTS(
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid=pg_catalog.to_regprocedure(signature)
          AND procedure.proowner=owner_oid
          AND procedure.prokind='f'
          AND procedure.prosecdef
          AND NOT procedure.proleakproof
          AND NOT procedure.proisstrict
          AND procedure.proparallel='u'
          AND procedure.proconfig IS NOT DISTINCT FROM
            ARRAY['search_path=pg_catalog, saas']::text[]
          AND procedure.provolatile=CASE
            WHEN signature='saas.payment_callback_authority(text,text,timestamp with time zone)'
            THEN 's'::"char" ELSE 'v'::"char" END
      )
      OR (SELECT pg_catalog.count(*)
          FROM pg_catalog.pg_proc AS procedure
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
          ) AS privilege
          WHERE procedure.oid=pg_catalog.to_regprocedure(signature)
            AND privilege.privilege_type='EXECUTE'
            AND privilege.grantor=owner_oid
            AND NOT privilege.is_grantable
            AND privilege.grantee IN(owner_oid,workflow_oid))<>2
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
    THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_FUNCTION_METADATA_INVALID: %',
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

  FOREACH signature IN ARRAY private_functions LOOP
    IF pg_catalog.to_regprocedure(signature) IS NULL
      OR NOT EXISTS(
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        WHERE procedure.oid=pg_catalog.to_regprocedure(signature)
          AND procedure.proowner=owner_oid
          AND procedure.prokind='f'
          AND NOT procedure.prosecdef
          AND NOT procedure.proleakproof
          AND NOT procedure.proisstrict
          AND procedure.proparallel='u'
          AND procedure.proconfig IS NOT DISTINCT FROM
            ARRAY['search_path=pg_catalog, saas']::text[]
          AND procedure.provolatile=CASE
            WHEN signature='saas.guard_payment_attempt_transition()'
            THEN 'v'::"char" ELSE 's'::"char" END
      )
      OR (SELECT pg_catalog.count(*)
          FROM pg_catalog.pg_proc AS procedure
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
          ) AS privilege
          WHERE procedure.oid=pg_catalog.to_regprocedure(signature)
            AND privilege.privilege_type='EXECUTE'
            AND privilege.grantor=owner_oid
            AND NOT privilege.is_grantable
            AND privilege.grantee=owner_oid)<>1
      OR EXISTS(
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
        ) AS privilege
        WHERE procedure.oid=pg_catalog.to_regprocedure(signature)
          AND privilege.privilege_type='EXECUTE'
          AND privilege.grantee<>owner_oid
      )
    THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_FUNCTION_METADATA_INVALID: %',
      signature;
    END IF;
  END LOOP;

  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid=procedure.pronamespace
      WHERE namespace.nspname='saas'
        AND procedure.proname IN(
          'guard_payment_attempt_transition',
          'payment_attempt_mutation_projection',
          'payment_attempt_event_projection',
          'payment_attempt_begin_projection',
          'payment_attempt_authority_projection',
          'payment_attempt_claim_projection',
          'payment_attempt_begin','payment_attempt_mark_initialized',
          'payment_attempt_mark_unknown','payment_callback_authority',
          'payment_attempt_settle_callback',
          'payment_attempt_claim_reconciliation',
          'payment_attempt_finalize_reconciliation'
        ))<>13
  THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_FUNCTION_SIGNATURE_INVALID'; END IF;

  FOR definition_index IN 1..pg_catalog.array_length(definition_functions,1) LOOP
    SELECT pg_catalog.md5(procedure.prosrc),
      pg_catalog.pg_get_function_result(procedure.oid),language.lanname
    INTO definition_hash,definition_result,definition_language
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_language AS language ON language.oid=procedure.prolang
    WHERE procedure.oid=definition_functions[definition_index]::regprocedure;
    IF definition_hash IS DISTINCT FROM definition_hashes[definition_index]
      OR definition_result IS DISTINCT FROM definition_results[definition_index]
      OR definition_language IS DISTINCT FROM definition_languages[definition_index]
    THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_FUNCTION_DEFINITION_INVALID: %',
      definition_functions[definition_index];
    END IF;
  END LOOP;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid='saas.guard_merchant_admin_immutable()'::regprocedure
      AND procedure.proowner=owner_oid
      AND procedure.prokind='f'
      AND NOT procedure.prosecdef
      AND NOT procedure.proleakproof
      AND NOT procedure.proisstrict
      AND procedure.proparallel='u'
      AND procedure.provolatile='v'
      AND procedure.proconfig IS NOT DISTINCT FROM
        ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='2713924292a3929427f25dc8cbc90a3c'
  ) OR (SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
        ) AS privilege
        WHERE procedure.oid='saas.guard_merchant_admin_immutable()'::regprocedure
          AND privilege.privilege_type='EXECUTE'
          AND privilege.grantee=owner_oid
          AND privilege.grantor=owner_oid
          AND NOT privilege.is_grantable)<>1
    OR EXISTS(
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) AS privilege
      WHERE procedure.oid='saas.guard_merchant_admin_immutable()'::regprocedure
        AND privilege.privilege_type='EXECUTE'
        AND privilege.grantee<>owner_oid
  ) THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_IMMUTABILITY_GUARD_INVALID'; END IF;

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
      FROM (VALUES
        ('saas.payment_attempts'::regclass,'payment_attempts_transition',
          'saas.guard_payment_attempt_transition()'::regprocedure),
        ('saas.payment_attempt_events'::regclass,'payment_attempt_events_immutable',
          'saas.guard_merchant_admin_immutable()'::regprocedure),
        ('saas.payment_callback_bindings'::regclass,'payment_callback_bindings_immutable',
          'saas.guard_merchant_admin_immutable()'::regprocedure),
        ('saas.payment_attempt_operations'::regclass,'payment_attempt_operations_immutable',
          'saas.guard_merchant_admin_immutable()'::regprocedure)
      ) AS expected(relation_oid,trigger_name,function_oid)
      JOIN pg_catalog.pg_trigger AS trigger
        ON trigger.tgrelid=expected.relation_oid
        AND trigger.tgname=expected.trigger_name
        AND trigger.tgfoid=expected.function_oid
        AND trigger.tgtype=27
        AND trigger.tgenabled='O'
        AND trigger.tgnargs=0
        AND trigger.tgconstraint=0
        AND NOT trigger.tgdeferrable
        AND NOT trigger.tginitdeferred
        AND NOT trigger.tgisinternal)<>4
    OR (SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_trigger AS trigger
        WHERE trigger.tgrelid IN(
          'saas.payment_attempts'::regclass,
          'saas.payment_attempt_events'::regclass,
          'saas.payment_callback_bindings'::regclass,
          'saas.payment_attempt_operations'::regclass
        ) AND NOT trigger.tgisinternal)<>4
  THEN RAISE EXCEPTION 'PAYMENT_ADAPTER_RUNTIME_TRIGGER_INVALID'; END IF;
END
$f$;
