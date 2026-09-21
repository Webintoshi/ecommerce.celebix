-- Historical checkout price bindings must remain recoverable. This rollback
-- is deliberately unavailable after even one V3 order/payment is created.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM saas.pricing_checkout_bindings) THEN
    RAISE EXCEPTION 'REFERENCE_PRICING_CHECKOUT_ROLLBACK_REQUIRES_NO_BINDINGS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM saas.pricing_variant_policy_state state
    JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
      AND policy.version=state.current_version
    WHERE policy.method<>'fixed_try'
  ) THEN
    RAISE EXCEPTION 'REFERENCE_PRICING_CHECKOUT_ROLLBACK_REQUIRES_NO_DYNAMIC_POLICIES';
  END IF;
END $guard$;

DROP FUNCTION saas.public_storefront_hosted_checkout_begin_v3(
  text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text);
DROP FUNCTION saas.public_storefront_hosted_checkout_authority_v3(
  text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid);
DROP FUNCTION saas.public_checkout_complete_v3(
  text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,
  uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text);
DROP FUNCTION saas.public_checkout_quote_v3(text,timestamptz,text,jsonb,jsonb,text[],jsonb);
DROP FUNCTION saas.pricing_checkout_quote_digest(text,jsonb);
DROP FUNCTION saas.pricing_checkout_source_context(uuid,text,jsonb,timestamptz);
DROP TABLE saas.pricing_checkout_bindings;

-- The V2 overlap guard belongs to the V3 migration. Restore the original
-- store-scoped lock when returning to the fixed-price checkout schema.
CREATE OR REPLACE FUNCTION saas.pricing_dynamic_activation_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_store_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_store_id:=OLD.store_id;
  ELSE v_store_id:=NEW.store_id; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.catalog.store:'||v_store_id::text,0));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;

GRANT EXECUTE ON FUNCTION
  saas.public_checkout_complete(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz),
  saas.public_checkout_complete_v2(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[]),
  saas.public_storefront_hosted_checkout_begin(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text),
  saas.public_storefront_hosted_checkout_begin_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text),
  saas.public_checkout_quote_v2(text,timestamptz,text,jsonb,jsonb,text[],jsonb),
  saas.public_storefront_hosted_checkout_authority_v2(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid)
TO celebix_saas_host_resolver;
COMMIT;
