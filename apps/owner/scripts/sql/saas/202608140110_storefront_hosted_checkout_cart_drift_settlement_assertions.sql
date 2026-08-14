BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE
  routine_oid oid:=pg_catalog.to_regprocedure('saas.storefront_hosted_checkout_terminal_transition()');
  owner_oid oid:='celebix_saas_owner'::regrole;
  definition text;
BEGIN
  IF routine_oid IS NULL THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_CART_DRIFT_SETTLEMENT_FUNCTION_MISSING';
  END IF;
  SELECT pg_catalog.pg_get_functiondef(routine_oid) INTO definition;
  IF pg_catalog.strpos(
      definition,
      'cart.status=''active'' AND cart.version=selected_session.source_version'
    )>0
    OR pg_catalog.strpos(
      definition,
      'AND status=''active'' AND version=selected_session.source_version'
    )=0
    OR pg_catalog.strpos(
      definition,
      '''recipientName'',selected_customer.first_name||'' ''||selected_customer.last_name'
    )=0
  THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_CART_DRIFT_SETTLEMENT_DEFINITION_INVALID';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=routine_oid
      AND procedure.proowner=owner_oid
      AND procedure.prosecdef
      AND procedure.provolatile='v'
      AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='88a531ed39e0308de1b66ae9f520ddbf'
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_CART_DRIFT_SETTLEMENT_SECURITY_INVALID';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
    ) AS privilege
    WHERE procedure.oid=routine_oid
      AND (
        privilege.grantee<>owner_oid
        OR privilege.privilege_type<>'EXECUTE'
        OR privilege.is_grantable
      )
  ) OR NOT pg_catalog.has_function_privilege(owner_oid,routine_oid,'EXECUTE')
  THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_CART_DRIFT_SETTLEMENT_ACL_INVALID';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger trigger_info
    WHERE trigger_info.tgrelid='saas.payment_attempts'::pg_catalog.regclass
      AND trigger_info.tgname='payment_attempt_standard_checkout_terminal'
      AND trigger_info.tgfoid=routine_oid
      AND trigger_info.tgenabled='O'
      AND NOT trigger_info.tgisinternal
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_CART_DRIFT_SETTLEMENT_TRIGGER_INVALID';
  END IF;
END
$f$;

COMMIT;
