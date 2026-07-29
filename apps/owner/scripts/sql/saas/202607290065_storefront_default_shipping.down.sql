-- Guarded rollback for Phase 3X canonical storefront shipping.
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
  ) IS NULL OR saas.storefront_checkout_default_shipping_preflight() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_DOWN_SOURCE_INVALID';
  END IF;

  preflight_oid:=pg_catalog.to_regprocedure('saas.storefront_checkout_preflight()');
  IF preflight_oid IS NULL OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid=preflight_oid
      AND pg_catalog.md5(procedure.prosrc)='f3ab16e1a5c72ac7a8f1b306263c0be5'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid=
      'saas.storefront_checkout_default_shipping_preflight()'::regprocedure
      AND pg_catalog.md5(procedure.prosrc)='3c1b9a21e43dc6f8274e0cc638a2a4d6'
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_DOWN_SOURCE_INVALID';
  END IF;

  LOCK TABLE saas.abandoned_carts IN ACCESS EXCLUSIVE MODE;

  IF EXISTS(
    SELECT 1 FROM saas.abandoned_carts
    WHERE shipping_method_code IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'STOREFRONT_DEFAULT_SHIPPING_DOWN_GUARD: canonical shipping state exists';
  END IF;

  preflight_definition:=pg_catalog.pg_get_functiondef(preflight_oid);
  IF (
    pg_catalog.char_length(preflight_definition)
      - pg_catalog.char_length(pg_catalog.replace(preflight_definition,new_fragment,''))
  ) / pg_catalog.char_length(new_fragment) <> 1 THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_DOWN_SOURCE_INVALID';
  END IF;

  DROP FUNCTION saas.storefront_checkout_default_shipping_preflight();

  DROP TRIGGER abandoned_carts_canonical_shipping_method
    ON saas.abandoned_carts;
  DROP FUNCTION saas.storefront_checkout_canonicalize_shipping_method();

  ALTER TABLE saas.abandoned_carts
    ALTER COLUMN shipping_method_code DROP DEFAULT;

  EXECUTE pg_catalog.replace(preflight_definition,new_fragment,old_fragment);

  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc procedure
    WHERE procedure.oid='saas.storefront_checkout_preflight()'::regprocedure
      AND pg_catalog.md5(procedure.prosrc)='f8425b71433ce371e0a3a23ae3a1dbae'
  ) OR saas.storefront_checkout_preflight() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOREFRONT_DEFAULT_SHIPPING_DOWN_POSTFLIGHT_INVALID';
  END IF;
END
$migration$;

COMMIT;
