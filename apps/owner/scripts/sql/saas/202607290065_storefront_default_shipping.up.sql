-- Phase 3X: make the sole storefront shipping option canonical for checkout carts.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $migration$
DECLARE
  preflight_oid oid;
  preflight_definition text;
  old_fragment constant text :=
    $old$('saas.abandoned_carts','shipping_method_code','text',false,NULL),$old$;
  new_fragment constant text :=
    $new$('saas.abandoned_carts','shipping_method_code','text',false,'''standard''::text'),$new$;
BEGIN
  IF pg_catalog.to_regprocedure(
    'saas.storefront_checkout_default_shipping_preflight()'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_SOURCE_ALREADY_APPLIED';
  END IF;

  preflight_oid:=pg_catalog.to_regprocedure('saas.storefront_checkout_preflight()');
  IF preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid=preflight_oid
      AND procedure.proowner='celebix_saas_owner'::regrole
      AND procedure.prokind='f' AND procedure.prosecdef
      AND NOT procedure.proleakproof AND NOT procedure.proisstrict
      AND procedure.proparallel='u' AND procedure.provolatile='s'
      AND procedure.prolang=(
        SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql'
      )
      AND procedure.proconfig IS NOT DISTINCT FROM
        ARRAY['search_path=pg_catalog, saas']::text[]
      AND pg_catalog.md5(procedure.prosrc)='f8425b71433ce371e0a3a23ae3a1dbae'
  ) OR saas.storefront_checkout_preflight() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_PRIOR_AUTHORITY_INVALID';
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM pg_catalog.pg_attribute attribute
    LEFT JOIN pg_catalog.pg_attrdef default_info
      ON default_info.adrelid=attribute.attrelid
      AND default_info.adnum=attribute.attnum
    WHERE attribute.attrelid='saas.abandoned_carts'::regclass
      AND attribute.attname='shipping_method_code'
      AND attribute.attnum>0 AND NOT attribute.attisdropped
      AND pg_catalog.format_type(attribute.atttypid,attribute.atttypmod)='text'
      AND NOT attribute.attnotnull
      AND default_info.oid IS NULL
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_PRIOR_COLUMN_INVALID';
  END IF;

  preflight_definition:=pg_catalog.pg_get_functiondef(preflight_oid);
  IF (
    pg_catalog.char_length(preflight_definition)
      - pg_catalog.char_length(pg_catalog.replace(preflight_definition,old_fragment,''))
  ) / pg_catalog.char_length(old_fragment) <> 1 THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_PRIOR_SOURCE_INVALID';
  END IF;

  ALTER TABLE saas.abandoned_carts
    ALTER COLUMN shipping_method_code SET DEFAULT 'standard';

  UPDATE saas.abandoned_carts
  SET shipping_method_code='standard'
  WHERE status IN('active','recovered')
    AND shipping_method_code IS NULL;

  EXECUTE pg_catalog.replace(preflight_definition,old_fragment,new_fragment);
END
$migration$;

CREATE FUNCTION saas.storefront_checkout_canonicalize_shipping_method()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path=pg_catalog,saas
AS $canonicalizer$
BEGIN
  IF NEW.status IN('active','recovered')
    AND NEW.shipping_method_code IS NULL
  THEN
    NEW.shipping_method_code:='standard';
  END IF;
  RETURN NEW;
END
$canonicalizer$;

REVOKE ALL ON FUNCTION saas.storefront_checkout_canonicalize_shipping_method()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE TRIGGER abandoned_carts_canonical_shipping_method
BEFORE INSERT OR UPDATE ON saas.abandoned_carts
FOR EACH ROW EXECUTE FUNCTION saas.storefront_checkout_canonicalize_shipping_method();

CREATE FUNCTION saas.storefront_checkout_default_shipping_preflight()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  owner_oid constant oid:='celebix_saas_owner'::regrole;
  canonicalizer_oid oid:=pg_catalog.to_regprocedure(
    'saas.storefront_checkout_canonicalize_shipping_method()'
  );
BEGIN
  IF saas.storefront_checkout_preflight() IS DISTINCT FROM true THEN
    RETURN false;
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
    RETURN false;
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
    RETURN false;
  END IF;

  RETURN true;
END
$function$;

REVOKE ALL ON FUNCTION saas.storefront_checkout_default_shipping_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION saas.storefront_checkout_default_shipping_preflight()
TO celebix_saas_workflow;

DO $migration$
BEGIN
  IF saas.storefront_checkout_default_shipping_preflight() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_POSTFLIGHT_INVALID';
  END IF;
END
$migration$;

COMMIT;
