BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM saas.pricing_variant_policy_state state
    JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
        AND policy.version=state.current_version
    WHERE policy.method<>'fixed_try')
    OR EXISTS (SELECT 1 FROM saas.barcode_print_job_items item
      WHERE item.snapshot ? 'priceContext') THEN
    RAISE EXCEPTION 'REFERENCE_PRINT_GUARD_ROLLBACK_UNSAFE';
  END IF;
END $guard$;
REVOKE ALL ON FUNCTION saas.barcode_print_job_create(uuid,uuid,uuid,uuid,text,
  bigint,timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,integer,jsonb)
  FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.barcode_print_job_create(uuid,uuid,uuid,uuid,text,bigint,
  timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,integer,jsonb);
ALTER FUNCTION saas.barcode_print_job_create_without_price_guard(uuid,uuid,uuid,
  uuid,text,bigint,timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,
  integer,jsonb) RENAME TO barcode_print_job_create;
GRANT EXECUTE ON FUNCTION saas.barcode_print_job_create(uuid,uuid,uuid,uuid,text,
  bigint,timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,integer,jsonb)
  TO celebix_saas_app;
COMMIT;
