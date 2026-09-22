DO $assertions$
DECLARE
  delete_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)'::regprocedure
  ) INTO delete_definition;

  IF EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='saas.storefront_checkout_operations'::regclass
      AND attname='order_id' AND attnum>0 AND NOT attisdropped AND attnotnull
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.storefront_checkout_operations'::regclass
      AND contype='f' AND confrelid='saas.orders'::regclass
      AND convalidated AND confdeltype='r'
  ) THEN
    RAISE EXCEPTION 'PERMANENT_ORDER_DELETE_CHECKOUT_OPERATION_FIX_SCHEMA_ASSERTION_FAILED';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.storefront_checkout_operations'::regclass
      AND tgname='storefront_checkout_operations_immutable'
      AND tgfoid='saas.guard_storefront_checkout_operation_order_detach()'::regprocedure
      AND tgenabled='O' AND NOT tgisinternal
  ) OR delete_definition !~ 'UPDATE saas.storefront_checkout_operations'
    OR delete_definition !~ 'SET order_id=NULL'
    OR delete_definition !~ 'WHERE store_id=p_store_id AND order_id=p_order_id'
  THEN
    RAISE EXCEPTION 'PERMANENT_ORDER_DELETE_CHECKOUT_OPERATION_FIX_DEFINITION_ASSERTION_FAILED';
  END IF;

  IF pg_catalog.has_table_privilege(
    'celebix_saas_app','saas.storefront_checkout_operations','SELECT,INSERT,UPDATE,DELETE'
  ) OR NOT pg_catalog.has_function_privilege(
    'celebix_saas_app',
    'saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PERMANENT_ORDER_DELETE_CHECKOUT_OPERATION_FIX_ACL_ASSERTION_FAILED';
  END IF;
END
$assertions$;
