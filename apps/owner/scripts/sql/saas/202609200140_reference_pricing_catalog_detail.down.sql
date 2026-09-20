BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM saas.pricing_variant_policy_state state
    JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
        AND policy.version=state.current_version
    WHERE policy.method<>'fixed_try') THEN
    RAISE EXCEPTION 'REFERENCE_CATALOG_ROLLBACK_UNSAFE';
  END IF;
END $guard$;
REVOKE ALL ON FUNCTION saas.catalog_get_product_details(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid,boolean) FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.catalog_get_product_details(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid,boolean);
REVOKE ALL ON FUNCTION saas.catalog_get_product_details_v2(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid,boolean) FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.catalog_get_product_details_v2(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid,boolean);
ALTER FUNCTION saas.catalog_get_product_details_unpriced_v1(uuid,uuid,uuid,
  uuid,text,bigint,bigint,timestamptz,uuid,boolean) RENAME TO catalog_get_product_details;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_details(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid,boolean) TO celebix_saas_app;
COMMIT;
