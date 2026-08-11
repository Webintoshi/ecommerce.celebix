-- Catalog assertions for Phase 4T durable abandoned-cart integration.

DO $assertions$
DECLARE
  runtime_role text;
  protected_table text;
  privilege_name text;
  protected_function regprocedure;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='saas.abandoned_carts'::pg_catalog.regclass
      AND attname='source_cart_id' AND NOT attisdropped
  ) THEN RAISE EXCEPTION 'DURABLE_ABANDONED_CART_INTEGRATION_SOURCE_COLUMN_MISSING'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint constraint_info
    WHERE constraint_info.conrelid='saas.abandoned_carts'::pg_catalog.regclass
      AND constraint_info.conname='abandoned_carts_source_cart_store_key'
      AND constraint_info.contype='u' AND constraint_info.convalidated
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint constraint_info
    WHERE constraint_info.conrelid='saas.abandoned_carts'::pg_catalog.regclass
      AND constraint_info.conname='abandoned_carts_source_cart_store_fk'
      AND constraint_info.contype='f' AND constraint_info.convalidated
      AND constraint_info.confrelid='saas.storefront_carts'::pg_catalog.regclass
  ) THEN RAISE EXCEPTION 'DURABLE_ABANDONED_CART_INTEGRATION_SOURCE_BINDING_INVALID'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.storefront_carts'::pg_catalog.regclass
      AND tgname='durable_abandoned_cart_sync' AND tgdeferrable AND tginitdeferred
      AND tgenabled='O' AND NOT tgisinternal
      AND tgfoid='saas.durable_abandoned_cart_sync_trigger()'::pg_catalog.regprocedure
  ) THEN RAISE EXCEPTION 'DURABLE_ABANDONED_CART_INTEGRATION_TRIGGER_MISSING'; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.storefront_cart_items'::pg_catalog.regclass
      AND tgname='durable_abandoned_cart_item_sync' AND tgdeferrable AND tginitdeferred
      AND tgenabled='O' AND NOT tgisinternal
      AND tgfoid='saas.durable_abandoned_cart_item_sync_trigger()'::pg_catalog.regprocedure
  ) THEN RAISE EXCEPTION 'DURABLE_ABANDONED_CART_INTEGRATION_ITEM_TRIGGER_MISSING'; END IF;

  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid=ANY(ARRAY[
      'saas.sync_durable_abandoned_cart(uuid,uuid,timestamptz)'::pg_catalog.regprocedure,
      'saas.durable_abandoned_cart_sync_trigger()'::pg_catalog.regprocedure,
      'saas.durable_abandoned_cart_item_sync_trigger()'::pg_catalog.regprocedure,
      'saas.reconcile_durable_abandoned_carts(uuid,timestamptz)'::pg_catalog.regprocedure,
      'saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz)'::pg_catalog.regprocedure,
      'saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid)'::pg_catalog.regprocedure,
      'saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)'::pg_catalog.regprocedure
    ])
      AND (
        procedure.proowner<>'celebix_saas_owner'::pg_catalog.regrole
        OR NOT procedure.prosecdef
        OR procedure.provolatile<>'v'
        OR NOT COALESCE(procedure.proconfig @> ARRAY['search_path=pg_catalog, saas']::text[],false)
      )
  ) THEN RAISE EXCEPTION 'DURABLE_ABANDONED_CART_INTEGRATION_FUNCTION_AUTHORITY_INVALID'; END IF;

  FOREACH runtime_role IN ARRAY ARRAY['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver']
  LOOP
    FOREACH protected_table IN ARRAY ARRAY[
      'saas.storefront_carts','saas.storefront_cart_credentials','saas.storefront_cart_items',
      'saas.storefront_cart_operations','saas.storefront_checkout_intents',
      'saas.storefront_customer_credentials','saas.storefront_order_receipts',
      'saas.storefront_checkout_operations','saas.abandoned_carts','saas.abandoned_cart_items'
    ]
    LOOP
      FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
      LOOP
        IF pg_catalog.has_table_privilege(runtime_role,protected_table,privilege_name) THEN
          RAISE EXCEPTION 'DURABLE_ABANDONED_CART_INTEGRATION_TABLE_AUTHORITY_INVALID';
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  FOREACH protected_function IN ARRAY ARRAY[
    'saas.sync_durable_abandoned_cart(uuid,uuid,timestamptz)'::pg_catalog.regprocedure,
    'saas.durable_abandoned_cart_sync_trigger()'::pg_catalog.regprocedure,
    'saas.durable_abandoned_cart_item_sync_trigger()'::pg_catalog.regprocedure,
    'saas.reconcile_durable_abandoned_carts(uuid,timestamptz)'::pg_catalog.regprocedure
  ]
  LOOP
    FOREACH runtime_role IN ARRAY ARRAY['public','celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver']
    LOOP
      IF pg_catalog.has_function_privilege(runtime_role,protected_function,'EXECUTE') THEN
        RAISE EXCEPTION 'DURABLE_ABANDONED_CART_INTEGRATION_HELPER_EXECUTE_INVALID';
      END IF;
    END LOOP;
  END LOOP;

  IF NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'DURABLE_ABANDONED_CART_INTEGRATION_PRIVILEGE_INVALID'; END IF;
END
$assertions$;
