BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL TRANSACTION READ ONLY;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $assertion$
DECLARE
  owner_oid constant oid:='celebix_saas_owner'::regrole;
  app_oid constant oid:='celebix_saas_app'::regrole;
  workflow_oid constant oid:='celebix_saas_workflow'::regrole;
  default_preflight_oid oid:=
    pg_catalog.to_regprocedure('saas.storefront_checkout_default_shipping_preflight()');
  canonicalizer_oid oid:=pg_catalog.to_regprocedure(
    'saas.storefront_checkout_canonicalize_shipping_method()'
  );
BEGIN
  IF default_preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid=default_preflight_oid
      AND procedure.proowner=owner_oid AND procedure.prokind='f'
      AND procedure.prosecdef AND NOT procedure.proleakproof
      AND NOT procedure.proisstrict AND procedure.proparallel='u'
      AND procedure.provolatile='s'
      AND procedure.prolang=(
        SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql'
      )
      AND procedure.proconfig IS NOT DISTINCT FROM
        ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='3c1b9a21e43dc6f8274e0cc638a2a4d6'
  ) OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid='saas.storefront_checkout_preflight()'::regprocedure
      AND procedure.proowner=owner_oid
      AND pg_catalog.md5(procedure.prosrc)='f3ab16e1a5c72ac7a8f1b306263c0be5'
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_ASSERT_FUNCTION_INVALID';
  END IF;

  IF saas.storefront_checkout_preflight() IS DISTINCT FROM true
    OR saas.storefront_checkout_default_shipping_preflight() IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_ASSERT_PREFLIGHT_INVALID';
  END IF;

  IF NOT pg_catalog.has_function_privilege(owner_oid,default_preflight_oid,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(workflow_oid,default_preflight_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,default_preflight_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',default_preflight_oid,'EXECUTE')
    OR EXISTS(
      SELECT 1
      FROM pg_catalog.pg_proc procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) privilege
      WHERE procedure.oid=default_preflight_oid
        AND (
          privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
          OR privilege.grantor<>owner_oid
          OR privilege.grantee NOT IN(owner_oid,workflow_oid)
        )
    )
  THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_ASSERT_ACL_INVALID';
  END IF;

  IF canonicalizer_oid IS NULL OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid=canonicalizer_oid
      AND procedure.proowner=owner_oid AND procedure.prokind='f'
      AND NOT procedure.prosecdef AND NOT procedure.proleakproof
      AND NOT procedure.proisstrict AND procedure.proparallel='u'
      AND procedure.provolatile='v'
      AND procedure.prolang=(
        SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql'
      )
      AND procedure.proconfig IS NOT DISTINCT FROM
        ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='60b58e955f118952bb4c09d62e89eeee'
  ) OR NOT pg_catalog.has_function_privilege(owner_oid,canonicalizer_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(app_oid,canonicalizer_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege(workflow_oid,canonicalizer_oid,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',canonicalizer_oid,'EXECUTE')
    OR EXISTS(
      SELECT 1
      FROM pg_catalog.pg_proc procedure
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
      ) privilege
      WHERE procedure.oid=canonicalizer_oid
        AND (
          privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
          OR privilege.grantor<>owner_oid OR privilege.grantee<>owner_oid
        )
    ) OR NOT EXISTS(
      SELECT 1
      FROM pg_catalog.pg_trigger trigger_info
      WHERE trigger_info.tgrelid='saas.abandoned_carts'::regclass
        AND trigger_info.tgname='abandoned_carts_canonical_shipping_method'
        AND trigger_info.tgenabled='O' AND NOT trigger_info.tgisinternal
        AND trigger_info.tgfoid=canonicalizer_oid
        AND trigger_info.tgtype=23 AND trigger_info.tgnargs=0
        AND trigger_info.tgqual IS NULL AND trigger_info.tgconstraint=0
        AND trigger_info.tgconstrrelid=0 AND NOT trigger_info.tgdeferrable
        AND NOT trigger_info.tginitdeferred
        AND trigger_info.tgoldtable IS NULL AND trigger_info.tgnewtable IS NULL
    )
  THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_ASSERT_TRIGGER_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_attribute attribute
    JOIN pg_catalog.pg_attrdef default_info
      ON default_info.adrelid=attribute.attrelid
      AND default_info.adnum=attribute.attnum
    WHERE attribute.attrelid='saas.abandoned_carts'::regclass
      AND attribute.attname='shipping_method_code'
      AND attribute.attnum>0 AND NOT attribute.attisdropped
      AND pg_catalog.format_type(attribute.atttypid,attribute.atttypmod)='text'
      AND NOT attribute.attnotnull
      AND pg_catalog.pg_get_expr(default_info.adbin,default_info.adrelid)=
        '''standard''::text'
  ) OR EXISTS(
    SELECT 1
    FROM saas.abandoned_carts cart
    WHERE cart.status IN('active','recovered')
      AND cart.shipping_method_code IS DISTINCT FROM 'standard'
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_ASSERT_CANONICAL_STATE_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_info
    WHERE constraint_info.conrelid='saas.abandoned_carts'::regclass
      AND constraint_info.conname='abandoned_carts_total_check'
      AND constraint_info.contype='c' AND constraint_info.convalidated
      AND pg_catalog.pg_get_constraintdef(constraint_info.oid)=
        'CHECK (((total_cents = ((subtotal_cents + shipping_cents) - discount_cents)) AND (total_cents >= 0)))'
  ) OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_info
    WHERE constraint_info.conrelid='saas.abandoned_carts'::regclass
      AND constraint_info.conname='abandoned_carts_shipping_method_code_check'
      AND constraint_info.contype='c' AND constraint_info.convalidated
      AND pg_catalog.pg_get_constraintdef(constraint_info.oid)=
        'CHECK (((shipping_method_code IS NULL) OR (shipping_method_code = ''standard''::text)))'
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_ASSERT_MONEY_OR_METHOD_CONSTRAINT_INVALID';
  END IF;
END
$assertion$;

ROLLBACK;
