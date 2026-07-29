-- Read-only compatibility proof for the immutable 001-025 base before 026-029.
BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;

DO $preflight$
DECLARE
  missing text;
  forbidden text;
  base_relation text;
  role_record record;
BEGIN
  FOREACH missing IN ARRAY ARRAY[
    'saas.stores','saas.store_domains','saas.memberships','saas.plans','saas.subscriptions','saas.plan_features',
    'saas.products','saas.product_variants','saas.orders','saas.order_items',
    'saas.quick_order_links','saas.quick_order_link_items','saas.checkout_provider_configs','saas.quick_order_link_operations'
  ] LOOP
    IF to_regclass(missing) IS NULL THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: missing current base relation'; END IF;
  END LOOP;
  FOREACH missing IN ARRAY ARRAY[
    'saas.quick_links_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,bigint,timestamptz,uuid)',
    'saas.quick_links_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)',
    'saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)',
    'saas.quick_links_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,uuid,text)',
    'saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text)',
    'saas.quick_links_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text)'
  ] LOOP
    IF to_regprocedure(missing) IS NULL THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: exact current base function signature absent'; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_owner')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_app')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_workflow')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='celebix_saas_host_resolver')
  THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: required base role absent'; END IF;
  FOR role_record IN
    SELECT * FROM (VALUES
      ('celebix_saas_owner', false, false, true),
      ('celebix_saas_app', false, false, false),
      ('celebix_saas_workflow', false, false, false),
      ('celebix_saas_host_resolver', false, false, false)
    ) AS expected(role_name, can_login, inherits_roles, bypasses_rls)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS actual
      WHERE actual.rolname=role_record.role_name
        AND actual.rolcanlogin=role_record.can_login
        AND actual.rolinherit=role_record.inherits_roles
        AND actual.rolbypassrls=role_record.bypasses_rls
        AND NOT actual.rolsuper AND NOT actual.rolcreatedb AND NOT actual.rolcreaterole
        AND NOT actual.rolreplication
    ) THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: exact base role attributes drift'; END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid=membership.roleid
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=membership.member
    WHERE granted_role.rolname IN ('celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver')
       OR member_role.rolname IN ('celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver')
  ) THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: application role membership drift'; END IF;
  FOREACH base_relation IN ARRAY ARRAY['checkout_provider_configs','quick_order_links','quick_order_link_items','quick_order_link_operations'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_roles r ON r.oid=c.relowner
      WHERE n.nspname='saas' AND c.relname=base_relation AND c.relrowsecurity AND c.relforcerowsecurity AND r.rolname='celebix_saas_owner')
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_policy p WHERE p.polrelid=('saas.'||base_relation)::regclass)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname IN ('celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver')
          AND pg_catalog.has_table_privilege(r.rolname,('saas.'||base_relation)::regclass,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: base ownership/RLS/policy/ACL drift'; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='saas' AND table_name='quick_order_links' AND column_name IN ('token_digest','sealed_token','provider_config_id','currency','expires_at') GROUP BY table_name HAVING count(*)=5)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.quick_order_links'::regclass AND conname='quick_order_links_store_id_key')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid='saas.quick_order_links_token_digest_idx'::regclass)
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.quick_order_links'::regclass AND tgname='quick_order_links_terminal_lifecycle' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: exact quick-link catalog contract drift'; END IF;
  IF NOT pg_catalog.has_schema_privilege('celebix_saas_app','saas','USAGE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.quick_links_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,bigint,timestamptz,uuid)'::regprocedure,'EXECUTE')
     OR pg_catalog.has_schema_privilege('celebix_saas_workflow','saas','USAGE')
     OR NOT pg_catalog.has_schema_privilege('celebix_saas_host_resolver','saas','USAGE')
  THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: exact base role grant drift'; END IF;
  FOREACH forbidden IN ARRAY ARRAY[
    'quick_order_redemption_sessions','checkout_payment_attempts','checkout_inventory_reservations',
    'checkout_callback_receipts','checkout_reconciliation_jobs','checkout_reconciliation_run',
    'checkout_reconciliation_receipts','checkout_operations'
  ] LOOP
    IF to_regclass('saas.' || forbidden) IS NOT NULL THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: post-base object present'; END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='saas' AND (
      (table_name='checkout_provider_configs' AND column_name='configuration_digest')
      OR (table_name='orders' AND column_name IN ('quick_order_link_id','billing_address'))
    )
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname IN (
      'checkout_provider_configs_configuration_digest_check',
      'quick_order_links_store_id_currency_runtime_key',
      'quick_order_links_store_id_provider_currency_runtime_key',
      'orders_quick_link_source_check','orders_quick_link_store_fk','orders_quick_link_currency_store_fk',
      'orders_store_id_quick_link_id_runtime_key'
    )
  ) OR to_regclass('saas.checkout_provider_configs_store_provider_active_key') IS NOT NULL
     OR to_regclass('saas.orders_store_quick_order_link_key') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE NOT tgisinternal AND tgname IN (
         'checkout_provider_configs_terminal','quick_order_links_live_attempt','quick_order_links_live_attempt_commit',
         'quick_order_links_paid_immutable','product_variants_checkout_hold'
       )
     )
  THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: partial 026 existing-table artifact present'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND (p.proname LIKE 'checkout_%' OR p.proname LIKE 'quick_checkout_%' OR p.proname LIKE 'guard_checkout_%' OR p.proname IN (
    'quick_links_claim_redemption','quick_links_configure_provider','quick_links_get_provider_readiness','quick_links_recover_provider_operation',
    'quick_links_recover_redemption_revoke','quick_links_resolve_redemption','quick_links_reveal_credential',
    'quick_links_reveal_provider_configuration','quick_links_revoke_provider','quick_links_revoke_redemption',
    'quick_links_create_025','quick_links_duplicate_025'
  ))) THEN RAISE EXCEPTION 'ISOLATED_STAGING_PREFLIGHT_FAILED: 026-029 function surface present'; END IF;
END
$preflight$;

ROLLBACK;
