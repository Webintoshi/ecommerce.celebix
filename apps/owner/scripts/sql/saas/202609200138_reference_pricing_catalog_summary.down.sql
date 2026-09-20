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
REVOKE ALL ON FUNCTION saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,text,
  bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,
  timestamptz,text,uuid) FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,text,bigint,
  bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,
  text,uuid);
REVOKE ALL ON FUNCTION saas.catalog_list_products_v4(uuid,uuid,uuid,uuid,text,bigint,
  bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,
  uuid) FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.catalog_list_products_v4(uuid,uuid,uuid,uuid,text,bigint,
  bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,timestamptz,text,
  uuid);
ALTER FUNCTION saas.catalog_list_products_unpriced_v3(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,
  timestamptz,text,uuid) RENAME TO catalog_list_products_v3;
GRANT EXECUTE ON FUNCTION saas.catalog_list_products_v3(uuid,uuid,uuid,uuid,
  text,bigint,bigint,timestamptz,text,text,text,uuid,uuid,uuid,text,integer,
  timestamptz,text,uuid) TO celebix_saas_app;
COMMIT;
