-- Read-only proof that isolated staging is exactly on the approved 049-050 base.
BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;

DO $preflight$
DECLARE
  required_relation text;
  required_function text;
  provider_capability_constraint text;
BEGIN
  FOREACH required_relation IN ARRAY ARRAY[
    'saas.merchant_provider_definitions',
    'saas.merchant_provider_profiles',
    'saas.merchant_provider_profile_operations',
    'saas.merchant_provider_jobs',
    'saas.merchant_provider_operations',
    'saas.merchant_provider_workflow_operations'
  ] LOOP
    IF to_regclass(required_relation) IS NULL THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_ADMIN_PREFLIGHT_FAILED: missing 049-050 relation';
    END IF;
  END LOOP;

  FOREACH required_function IN ARRAY ARRAY[
    'saas.merchant_provider_profile_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text)',
    'saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint)',
    'saas.merchant_provider_profile_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)',
    'saas.merchant_provider_queue(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,bigint)',
    'saas.merchant_provider_claim(text,timestamptz,timestamptz,uuid)',
    'saas.merchant_provider_finalize(uuid,text,uuid,timestamptz,bigint,text,text,text,text)',
    'saas.merchant_provider_reconcile(uuid,text,uuid,timestamptz,bigint,text,text,text,text)'
  ] LOOP
    IF to_regprocedure(required_function) IS NULL THEN
      RAISE EXCEPTION 'PAYMENT_METHOD_ADMIN_PREFLIGHT_FAILED: missing 049-050 function';
    END IF;
  END LOOP;

  SELECT pg_catalog.pg_get_constraintdef(constraint_record.oid)
  INTO provider_capability_constraint
  FROM pg_catalog.pg_constraint AS constraint_record
  WHERE constraint_record.conrelid='saas.merchant_provider_definitions'::regclass
    AND constraint_record.contype='c'
    AND pg_catalog.pg_get_constraintdef(constraint_record.oid) LIKE '%capability%'
  ORDER BY constraint_record.oid
  LIMIT 1;

  IF provider_capability_constraint IS NULL
    OR provider_capability_constraint NOT LIKE '%marketplace_sync%'
    OR provider_capability_constraint NOT LIKE '%invoice_reconciliation%'
    OR provider_capability_constraint NOT LIKE '%email_delivery%'
    OR provider_capability_constraint NOT LIKE '%phone_delivery%'
    OR provider_capability_constraint NOT LIKE '%whatsapp_delivery%'
    OR provider_capability_constraint NOT LIKE '%indexing%'
    OR provider_capability_constraint LIKE '%payment_processing%'
  THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_ADMIN_PREFLIGHT_FAILED: provider capability constraint drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=relation.relowner
    WHERE namespace.nspname='saas'
      AND relation.relname IN (
        'merchant_provider_definitions','merchant_provider_profiles','merchant_provider_profile_operations',
        'merchant_provider_jobs','merchant_provider_operations','merchant_provider_workflow_operations'
      )
      AND (
        owner_role.rolname<>'celebix_saas_owner'
        OR NOT relation.relrowsecurity
        OR NOT relation.relforcerowsecurity
      )
  ) THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_ADMIN_PREFLIGHT_FAILED: 049-050 ownership or RLS drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS role_record
    CROSS JOIN (VALUES
      ('merchant_provider_definitions'),('merchant_provider_profiles'),('merchant_provider_profile_operations'),
      ('merchant_provider_jobs'),('merchant_provider_operations'),('merchant_provider_workflow_operations')
    ) AS expected(relation_name)
    WHERE role_record.rolname IN ('celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver')
      AND pg_catalog.has_table_privilege(
        role_record.rolname,
        ('saas.' || expected.relation_name)::regclass,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
  ) THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_ADMIN_PREFLIGHT_FAILED: direct 049-050 table privilege drift';
  END IF;

  IF to_regclass('saas.payment_methods') IS NOT NULL
    OR to_regclass('saas.payment_method_operations') IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure_record
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure_record.pronamespace
      WHERE namespace.nspname='saas' AND procedure_record.proname LIKE 'payment_method_%'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_record
      WHERE constraint_record.conrelid='saas.merchant_provider_definitions'::regclass
        AND constraint_record.contype='c'
        AND pg_catalog.pg_get_constraintdef(constraint_record.oid) LIKE '%payment_processing%'
    )
  THEN
    RAISE EXCEPTION 'PAYMENT_METHOD_ADMIN_PREFLIGHT_FAILED: partial 051 artifact present';
  END IF;
END
$preflight$;

ROLLBACK;
