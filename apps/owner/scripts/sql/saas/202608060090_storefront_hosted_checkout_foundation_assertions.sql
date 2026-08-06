BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE definition text; relation_name text;
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_hosted_checkout_sessions') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_hosted_checkout_operations') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_available_stock(uuid,uuid,timestamp with time zone,uuid)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_buy_now_create(text,timestamp with time zone,uuid,text,text,timestamp with time zone,uuid,uuid,integer)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)') IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_FOUNDATION_CONTRACT_INVALID'; END IF;

  FOREACH relation_name IN ARRAY ARRAY['storefront_hosted_checkout_sessions','storefront_hosted_checkout_operations'] LOOP
    IF NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_class relation
      WHERE relation.oid=pg_catalog.to_regclass('saas.'||relation_name)
        AND relation.relowner='celebix_saas_owner'::pg_catalog.regrole
        AND relation.relrowsecurity AND relation.relforcerowsecurity
    ) THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_FOUNDATION_CONTRACT_INVALID: %',relation_name; END IF;
  END LOOP;

  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.checkout_inventory_reservations'::pg_catalog.regclass
        AND conname='checkout_inventory_reservations_commerce_owner_check')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid='saas.checkout_inventory_reservations'::pg_catalog.regclass
        AND conname='checkout_inventory_reservations_standard_session_store_fk')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_indexes
      WHERE schemaname='saas' AND indexname='checkout_inventory_reservations_standard_session_variant_key')
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_FOUNDATION_CONTRACT_INVALID: reservation_owner'; END IF;

  definition:=pg_catalog.pg_get_functiondef('saas.storefront_available_stock(uuid,uuid,timestamp with time zone,uuid)'::pg_catalog.regprocedure);
  IF pg_catalog.strpos(definition,'checkout_payment_attempts')=0
    OR pg_catalog.strpos(definition,'quick_order_hosted_payment_bridges')=0
    OR pg_catalog.strpos(definition,'storefront_hosted_checkout_sessions')=0
    OR pg_catalog.strpos(definition,'storefront_hosted_session_id IS DISTINCT FROM p_excluded_session_id')=0
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_FOUNDATION_CONTRACT_INVALID: available_stock'; END IF;

  FOREACH definition IN ARRAY ARRAY[
    pg_catalog.pg_get_functiondef('saas.public_cart_mutate(text,timestamp with time zone,jsonb,uuid,text,text,timestamp with time zone,uuid,text,text,bigint,uuid,uuid,integer)'::pg_catalog.regprocedure),
    pg_catalog.pg_get_functiondef('saas.public_buy_now_create(text,timestamp with time zone,uuid,text,text,timestamp with time zone,uuid,uuid,integer)'::pg_catalog.regprocedure),
    pg_catalog.pg_get_functiondef('saas.storefront_cart_projection(uuid,uuid,timestamp with time zone)'::pg_catalog.regprocedure),
    pg_catalog.pg_get_functiondef('saas.storefront_intent_projection(uuid,uuid,timestamp with time zone)'::pg_catalog.regprocedure),
    pg_catalog.pg_get_functiondef('saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)'::pg_catalog.regprocedure)
  ] LOOP
    IF pg_catalog.strpos(definition,'storefront_available_stock')=0
    THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_FOUNDATION_CONTRACT_INVALID: stock_call_graph'; END IF;
  END LOOP;

  definition:=pg_catalog.pg_get_functiondef('saas.storefront_payment_methods_projection(uuid)'::pg_catalog.regprocedure);
  IF pg_catalog.strpos(definition,'''hosted_card''')=0
    OR pg_catalog.strpos(definition,'merchant_provider_execution_authority_matches')=0
    OR pg_catalog.strpos(definition,'sealed_credentials')>0
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_FOUNDATION_CONTRACT_INVALID: public_payment_projection'; END IF;

  IF pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.storefront_hosted_checkout_sessions','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.storefront_hosted_checkout_sessions','SELECT,INSERT,UPDATE,DELETE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.public_checkout_quote(text,timestamp with time zone,text,jsonb)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app','saas.public_checkout_quote(text,timestamp with time zone,text,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_FOUNDATION_CONTRACT_INVALID: acl'; END IF;
END
$f$;

COMMIT;
