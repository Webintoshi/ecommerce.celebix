-- Phase 3B2 quick-order checkout schema, authority, concurrency and least-privilege assertions.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  checked_table text;
  role_name text;
  cancel_definition text := pg_catalog.pg_get_functiondef(
    'saas.quick_links_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,uuid,text)'::regprocedure
  );
  archive_definition text := pg_catalog.pg_get_functiondef(
    'saas.catalog_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint)'::regprocedure
  );
  variant_guard_definition text := pg_catalog.pg_get_functiondef('saas.guard_checkout_variant_held_reservation()'::regprocedure);
  attempt_guard_definition text := pg_catalog.pg_get_functiondef('saas.guard_checkout_attempt_transition()'::regprocedure);
  reservation_guard_definition text := pg_catalog.pg_get_functiondef('saas.guard_checkout_reservation_transition()'::regprocedure);
  redemption_guard_definition text := pg_catalog.pg_get_functiondef('saas.guard_checkout_redemption_transition()'::regprocedure);
BEGIN
  FOREACH checked_table IN ARRAY ARRAY[
    'quick_order_redemption_sessions','checkout_payment_attempts','checkout_inventory_reservations',
    'checkout_callback_receipts','checkout_reconciliation_jobs','checkout_reconciliation_run',
    'checkout_reconciliation_receipts','checkout_operations'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=relation.relnamespace
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=relation.relowner
      WHERE namespace.nspname='saas' AND relation.relname=checked_table AND relation.relkind='r'
        AND relation.relrowsecurity AND relation.relforcerowsecurity AND owner_role.rolname='celebix_saas_owner'
    ) THEN RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: ownership/RLS %',checked_table; END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_class AS relation,
        LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl,pg_catalog.acldefault('r',relation.relowner))) AS privilege
      WHERE relation.oid=('saas.'||checked_table)::regclass AND privilege.grantee=0
    ) THEN RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: PUBLIC ACL %',checked_table; END IF;
    FOREACH role_name IN ARRAY ARRAY['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver'] LOOP
      IF pg_catalog.has_table_privilege(role_name,'saas.'||checked_table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: table DML %.%',role_name,checked_table;
      END IF;
    END LOOP;
  END LOOP;

  IF (SELECT count(*) FROM pg_catalog.pg_policy WHERE polrelid=ANY(ARRAY[
    'saas.quick_order_redemption_sessions'::regclass,'saas.checkout_payment_attempts'::regclass,
    'saas.checkout_inventory_reservations'::regclass,'saas.checkout_callback_receipts'::regclass,
    'saas.checkout_reconciliation_jobs'::regclass,'saas.checkout_reconciliation_run'::regclass,
    'saas.checkout_reconciliation_receipts'::regclass,'saas.checkout_operations'::regclass
  ])) <> 0 THEN RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: deny-by-default policy drift'; END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='saas' AND table_name='checkout_provider_configs'
      AND column_name='configuration_digest' AND data_type='character' AND is_nullable='YES')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_provider_configs'::regclass
      AND conname='checkout_provider_configs_configuration_digest_check'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%^[a-f0-9]{64}$%') THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: provider digest drift';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_provider_configs'::regclass
      AND conname='checkout_provider_configs_store_provider_key')
     OR pg_catalog.pg_get_indexdef('saas.checkout_provider_configs_store_provider_active_key'::regclass)
        NOT LIKE '%UNIQUE INDEX%WHERE (status <> ''revoked''::text)%' THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: provider partial uniqueness drift';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='saas' AND table_name='orders' AND column_name='quick_order_link_id' AND is_nullable='YES')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='saas' AND table_name='orders' AND column_name='billing_address' AND is_nullable='YES')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.orders'::regclass AND conname='orders_quick_link_source_check')
     OR pg_catalog.pg_get_indexdef('saas.orders_store_quick_order_link_key'::regclass) NOT LIKE '%WHERE (quick_order_link_id IS NOT NULL)%' THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: order binding drift';
  END IF;
  IF pg_catalog.strpos(pg_catalog.pg_get_constraintdef((SELECT oid FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.orders'::regclass AND conname='orders_quick_link_source_check')),
      'currency = ''TRY''::text')=0
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.orders'::regclass
      AND conname='orders_store_id_quick_link_id_runtime_key' AND contype='u')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.quick_order_links'::regclass
      AND conname='quick_order_links_store_id_provider_currency_runtime_key' AND contype='u') THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: TRY/order composite authority drift';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_payment_attempts'::regclass
      AND conname='checkout_payment_attempts_merchant_oid_key' AND contype='u')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_payment_attempts'::regclass
      AND conname='checkout_payment_attempts_merchant_oid_check' AND pg_catalog.pg_get_constraintdef(oid) LIKE '%^[a-f0-9]{32}$%') THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: merchant_oid authority drift';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_payment_attempts'::regclass
      AND conname='checkout_payment_attempts_status_check'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%reserved%provider_ready%initiation_unknown%succeeded%failed%expired%')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_inventory_reservations'::regclass
      AND conname='checkout_inventory_reservations_status_check'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%held%consumed%released%expired%') THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: lifecycle vocabulary drift';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_payment_attempts'::regclass
      AND conname='checkout_payment_attempts_redemption_link_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (store_id, redemption_session_id, quick_order_link_id)%')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_inventory_reservations'::regclass
      AND conname='checkout_inventory_reservations_attempt_link_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (store_id, attempt_id, quick_order_link_id)%')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_payment_attempts'::regclass
      AND conname='checkout_payment_attempts_order_link_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (store_id, settled_order_id, quick_order_link_id)%')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_payment_attempts'::regclass
      AND conname='checkout_payment_attempts_link_provider_currency_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%FOREIGN KEY (store_id, quick_order_link_id, provider_config_id, currency)%') THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: composite checkout authority drift';
  END IF;

  IF pg_catalog.strpos(pg_catalog.pg_get_constraintdef((SELECT oid FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.checkout_payment_attempts'::regclass AND conname='checkout_payment_attempts_provider_token_check')),
      'provider_ready_at IS NOT NULL')=0
     OR pg_catalog.strpos(pg_catalog.pg_get_constraintdef((SELECT oid FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.checkout_payment_attempts'::regclass AND conname='checkout_payment_attempts_lifecycle_check')),
      '00:05:00')=0 THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: provider readiness/hold drift';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.checkout_payment_attempts'::regclass
        AND conname='checkout_payment_attempts_amount_check'
        AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(oid),'expected_payment_amount')>0
        AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(oid),'expected_subtotal_cents')>0
        AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(oid),'expected_shipping_cents')>0
        AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(oid),'expected_discount_cents')>0
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%8500000000000000%'
    )
     OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.checkout_reconciliation_jobs'::regclass
        AND conname='checkout_reconciliation_jobs_lease_check'
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%lease_token_digest%lease_expires_at%updated_at%'
    )
     OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.checkout_callback_receipts'::regclass
        AND conname='checkout_callback_receipts_received_at_check'
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%isfinite%received_at%'
    ) THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: critical amount/lease/receipt-time contract drift';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='saas' AND table_name='checkout_callback_receipts'
        AND column_name='currency' AND data_type='text' AND is_nullable='NO'
    )
     OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.checkout_callback_receipts'::regclass
        AND conname='checkout_callback_receipts_currency_check'
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%currency = ''TRY''::text%'
    )
     OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='saas' AND table_name='checkout_reconciliation_receipts'
        AND column_name='currency' AND data_type='text' AND is_nullable='NO'
    )
     OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.checkout_reconciliation_receipts'::regclass
        AND conname='checkout_reconciliation_receipts_currency_check'
        AND pg_catalog.pg_get_constraintdef(oid) LIKE '%currency = ''TRY''::text%'
    ) THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: persisted receipt TRY authority drift';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_inventory_reservations'::regclass
      AND conname='checkout_inventory_reservations_attempt_variant_key' AND contype='u')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_callback_receipts'::regclass
      AND conname='checkout_callback_receipts_attempt_digest_key' AND contype='u')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_reconciliation_jobs'::regclass
      AND conname='checkout_reconciliation_jobs_pkey' AND contype='p') THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: bounded identity drift';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid=ANY(ARRAY[
      'saas.checkout_provider_configs'::regclass,'saas.checkout_payment_attempts'::regclass,
      'saas.checkout_inventory_reservations'::regclass,'saas.checkout_callback_receipts'::regclass,
      'saas.quick_order_redemption_sessions'::regclass,'saas.checkout_reconciliation_jobs'::regclass,
      'saas.checkout_reconciliation_receipts'::regclass,'saas.checkout_operations'::regclass,
      'saas.quick_order_links'::regclass,'saas.product_variants'::regclass
    ]) AND NOT tgisinternal AND tgname IN (
      'checkout_provider_configs_terminal','checkout_payment_attempts_transition','checkout_inventory_reservations_transition',
      'checkout_callback_receipts_immutable','checkout_reconciliation_receipts_immutable','checkout_operations_immutable',
      'quick_order_redemption_sessions_transition','checkout_reconciliation_jobs_transition',
      'quick_order_links_live_attempt','quick_order_links_live_attempt_commit',
      'quick_order_links_paid_immutable','product_variants_checkout_hold'
    )) <> 12 THEN RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: trigger drift'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.quick_order_links'::regclass
      AND tgname='quick_order_links_live_attempt_commit'
      AND NOT tgisinternal AND tgconstraint<>0 AND tgdeferrable AND tginitdeferred
  ) THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: deferred commit-time link guard drift';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS routine
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=routine.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=routine.proowner
    WHERE namespace.nspname='saas' AND routine.proname='guard_checkout_quick_link_live_attempt'
      AND routine.prosecdef AND owner_role.rolname='celebix_saas_owner'
      AND NOT pg_catalog.has_function_privilege('celebix_saas_app',routine.oid,'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: deferred guard execution authority drift';
  END IF;

  IF pg_catalog.strpos(cancel_definition,'ORDER BY attempt.id')=0
     OR pg_catalog.strpos(cancel_definition,'FOR UPDATE')=0
     OR pg_catalog.strpos(cancel_definition,'QUICK_LINK_HAS_LIVE_PAYMENT_ATTEMPT')>0
     OR pg_catalog.strpos(archive_definition,'ORDER BY variant.id')=0
     OR pg_catalog.strpos(archive_definition,'FOR UPDATE')=0
     OR pg_catalog.strpos(variant_guard_definition,'stock_tracking')=0
     OR pg_catalog.strpos(variant_guard_definition,'held_quantity')=0 THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: deterministic lock/guard drift';
  END IF;

  IF pg_catalog.strpos(attempt_guard_definition,'OLD.redemption_session_id IS DISTINCT FROM NEW.redemption_session_id')=0
     OR pg_catalog.strpos(attempt_guard_definition,'OLD.expected_subtotal_cents IS DISTINCT FROM NEW.expected_subtotal_cents')=0
     OR pg_catalog.strpos(attempt_guard_definition,'OLD.hold_expires_at IS DISTINCT FROM NEW.hold_expires_at')=0
     OR pg_catalog.strpos(attempt_guard_definition,'CHECKOUT_PROVIDER_TOKEN_TRANSITION_DENIED')=0
     OR pg_catalog.strpos(reservation_guard_definition,'OLD.quick_order_link_id IS DISTINCT FROM NEW.quick_order_link_id')=0
     OR pg_catalog.strpos(reservation_guard_definition,'OLD.product_id IS DISTINCT FROM NEW.product_id')=0
     OR pg_catalog.strpos(redemption_guard_definition,'OLD.cookie_digest IS DISTINCT FROM NEW.cookie_digest')=0
     OR pg_catalog.strpos(redemption_guard_definition,'OLD.created_at IS DISTINCT FROM NEW.created_at')=0 THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: immutable authority snapshot drift';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.checkout_reconciliation_run'::regclass
      AND conname='checkout_reconciliation_run_singleton_check')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.checkout_operations'::regclass
      AND tgname='checkout_operations_immutable' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'PHASE3B2_RUNTIME_ASSERTION_FAILED: singleton/operation immutability drift';
  END IF;
END
$assertions$;

COMMIT;
