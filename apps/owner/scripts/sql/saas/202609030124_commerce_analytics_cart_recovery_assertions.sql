DO $assertions$
BEGIN
  IF pg_catalog.to_regclass('saas.store_analytics_hostnames') IS NULL
    OR pg_catalog.to_regclass('saas.store_commerce_analytics_settings') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_cart_attribution') IS NULL
    OR pg_catalog.to_regclass('saas.order_commerce_attribution') IS NULL
    OR pg_catalog.to_regclass('saas.abandoned_cart_episodes') IS NULL
    OR pg_catalog.to_regclass('saas.abandoned_cart_recovery_tokens') IS NULL
    OR pg_catalog.to_regclass('saas.abandoned_cart_recovery_attempts') IS NULL
    OR pg_catalog.to_regprocedure('saas.analytics_outbox_claim_v2(timestamptz,integer,interval)') IS NULL
    OR pg_catalog.to_regprocedure('saas.analytics_outbox_requeue_dead_letter(uuid,timestamptz)') IS NULL
    OR pg_catalog.to_regprocedure('saas.commerce_analytics_evaluate_carts(timestamptz,integer)') IS NULL
    OR pg_catalog.to_regprocedure('saas.commerce_analytics_snapshot(uuid,uuid,uuid,uuid,text,bigint,timestamptz,timestamptz,timestamptz)') IS NULL
    OR pg_catalog.to_regprocedure('saas.commerce_cart_recovery_link_issue(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,integer)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_cart_recovery_restore(text,timestamptz,text,uuid,text,text,timestamptz)') IS NULL
    OR pg_catalog.to_regprocedure('saas.commerce_cart_recovery_attempt_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.commerce_analytics_reconcile_hostnames(uuid,timestamptz,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.commerce_analytics_reconcile_all_hostnames(timestamptz,text,integer)') IS NULL
    OR pg_catalog.to_regprocedure('saas.commerce_analytics_enqueue_order_event()') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_cart_attribution_record(text,timestamptz,jsonb,jsonb)') IS NULL
  THEN RAISE EXCEPTION 'ANALYTICS_COMMERCE_MIGRATION_ASSERTION_FAILED'; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_class class JOIN pg_catalog.pg_namespace namespace ON namespace.oid=class.relnamespace
    WHERE namespace.nspname='saas' AND class.relname IN ('store_analytics_hostnames','store_commerce_analytics_settings','storefront_cart_attribution','order_commerce_attribution','abandoned_cart_episodes','abandoned_cart_recovery_tokens','abandoned_cart_recovery_attempts')
      AND (NOT class.relrowsecurity OR NOT class.relforcerowsecurity)
  ) THEN RAISE EXCEPTION 'ANALYTICS_COMMERCE_MIGRATION_ASSERTION_FAILED'; END IF;
  IF EXISTS(
      SELECT 1 FROM pg_catalog.pg_class class,
        LATERAL pg_catalog.aclexplode(COALESCE(class.relacl,pg_catalog.acldefault('r',class.relowner))) acl
      WHERE class.oid='saas.abandoned_cart_recovery_tokens'::regclass AND acl.grantee=0 AND acl.privilege_type='SELECT'
    ) OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure,
        LATERAL pg_catalog.aclexplode(COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) acl
      WHERE procedure.oid='saas.commerce_analytics_evaluate_carts(timestamptz,integer)'::regprocedure
        AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
    )
    OR pg_catalog.has_function_privilege('celebix_saas_app','saas.analytics_outbox_requeue_dead_letter(uuid,timestamptz)','EXECUTE')
  THEN RAISE EXCEPTION 'ANALYTICS_COMMERCE_MIGRATION_ASSERTION_FAILED'; END IF;
END
$assertions$;
