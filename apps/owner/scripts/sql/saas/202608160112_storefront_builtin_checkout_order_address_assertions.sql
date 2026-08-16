BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $assertions$
DECLARE
  completion_oid oid:=pg_catalog.to_regprocedure(
    'saas.public_checkout_complete_without_available_stock_v090(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)'
  );
  public_completion_oid oid:=pg_catalog.to_regprocedure(
    'saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)'
  );
  detail_oid oid:=pg_catalog.to_regprocedure('saas.orders_detail_projection(uuid,uuid)');
  completion_definition text;
  public_completion_definition text;
  detail_definition text;
  owner_oid oid:='celebix_saas_owner'::pg_catalog.regrole;
BEGIN
  IF completion_oid IS NULL OR public_completion_oid IS NULL OR detail_oid IS NULL THEN
    RAISE EXCEPTION 'STOREFRONT_BUILTIN_CHECKOUT_ORDER_ADDRESS_FUNCTION_MISSING';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(completion_oid) INTO completion_definition;
  SELECT pg_catalog.pg_get_functiondef(public_completion_oid) INTO public_completion_definition;
  SELECT pg_catalog.pg_get_functiondef(detail_oid) INTO detail_definition;

  IF pg_catalog.strpos(
      completion_definition,
      '''recipientName'',selected_customer.first_name||'' ''||selected_customer.last_name'
    )=0
    OR pg_catalog.strpos(completion_definition,$$p_delivery->'shippingAddress',NULL,1,p_now,p_now,selected_customer.id$$)>0
  THEN
    RAISE EXCEPTION 'STOREFRONT_BUILTIN_CHECKOUT_ORDER_ADDRESS_COMPLETION_INVALID';
  END IF;

  IF pg_catalog.strpos(public_completion_definition,'public_checkout_complete_without_available_stock_v090')=0 THEN
    RAISE EXCEPTION 'STOREFRONT_BUILTIN_CHECKOUT_ORDER_ADDRESS_WRAPPER_INVALID';
  END IF;

  IF pg_catalog.strpos(detail_definition,$$COALESCE(NULLIF(pg_catalog.btrim(selected_order.shipping_address->>'recipientName'), ''), selected_order.customer_name)$$)=0 THEN
    RAISE EXCEPTION 'STOREFRONT_BUILTIN_CHECKOUT_ORDER_ADDRESS_DETAIL_FALLBACK_INVALID';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=detail_oid
      AND (
        privilege.grantee<>owner_oid
        OR privilege.privilege_type<>'EXECUTE'
        OR privilege.is_grantable
      )
  ) OR NOT pg_catalog.has_function_privilege(owner_oid,detail_oid,'EXECUTE')
  THEN
    RAISE EXCEPTION 'STOREFRONT_BUILTIN_CHECKOUT_ORDER_ADDRESS_DETAIL_ACL_INVALID';
  END IF;
END
$assertions$;

COMMIT;
