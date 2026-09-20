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
REVOKE ALL ON FUNCTION saas.catalog_get_product_preview(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.catalog_get_product_preview(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid);
REVOKE ALL ON FUNCTION saas.catalog_get_product_preview_v2(uuid,uuid,uuid,
  uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.catalog_get_product_preview_v2(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid);
ALTER FUNCTION saas.catalog_get_product_preview_unpriced_v1(uuid,uuid,uuid,
  uuid,text,bigint,bigint,timestamptz,uuid) RENAME TO catalog_get_product_preview;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_preview(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;
COMMIT;
