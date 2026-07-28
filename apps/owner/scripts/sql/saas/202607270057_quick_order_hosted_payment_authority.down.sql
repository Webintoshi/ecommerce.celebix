BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
LOCK TABLE saas.quick_order_links,saas.quick_order_link_items,
  saas.quick_order_link_hosted_authorities IN ACCESS EXCLUSIVE MODE;

DO $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.quick_order_link_hosted_authorities)
    OR EXISTS(SELECT 1 FROM saas.quick_order_links WHERE hosted_authority_id IS NOT NULL)
    OR EXISTS(SELECT 1 FROM saas.quick_order_link_items WHERE item_type IS NOT NULL)
  THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_AUTHORITY_ROLLBACK_REQUIRES_DRAIN'; END IF;
END
$f$;

REVOKE ALL ON FUNCTION saas.quick_order_hosted_payment_authority_preflight() FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.quick_order_hosted_payment_authority_preflight();

REVOKE ALL ON FUNCTION saas.quick_links_create_hosted(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,
  text,text[],text,jsonb,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,
  text,text,jsonb,uuid,text
) FROM PUBLIC,celebix_saas_app;
DROP FUNCTION saas.quick_links_create_hosted(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,
  text,text[],text,jsonb,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,
  text,text,jsonb,uuid,text
);

DROP FUNCTION saas.quick_links_detail_projection(uuid,uuid,timestamptz);
ALTER FUNCTION saas.quick_links_detail_projection_legacy_v025(uuid,uuid,timestamptz)
  RENAME TO quick_links_detail_projection;

DROP TRIGGER quick_order_links_provider_authority ON saas.quick_order_links;
DROP FUNCTION saas.guard_quick_link_provider_authority();
ALTER TABLE saas.quick_order_links DROP CONSTRAINT quick_order_links_hosted_authority_fk;
DROP TRIGGER quick_order_link_hosted_authorities_immutable ON saas.quick_order_link_hosted_authorities;
DROP FUNCTION saas.guard_quick_link_hosted_authority_immutable();
DROP TABLE saas.quick_order_link_hosted_authorities;

ALTER TABLE saas.quick_order_link_items
  DROP CONSTRAINT quick_order_link_items_item_type_check,
  DROP COLUMN item_type;
ALTER TABLE saas.quick_order_links
  DROP CONSTRAINT quick_order_links_one_payment_authority_check,
  DROP COLUMN hosted_authority_id,
  ALTER COLUMN provider_config_id SET NOT NULL;

CREATE FUNCTION saas.guard_quick_link_provider_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM saas.stores AS store
    JOIN saas.checkout_provider_configs AS provider
      ON provider.store_id=store.id AND provider.id=NEW.provider_config_id
    WHERE store.id=NEW.store_id AND store.status='active'
      AND provider.status='active' AND provider.provider_key='paytr'
  ) THEN RAISE EXCEPTION 'QUICK_LINK_PROVIDER_NOT_READY'; END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_quick_link_provider_authority() FROM PUBLIC;
CREATE TRIGGER quick_order_links_provider_authority
BEFORE INSERT OR UPDATE OF store_id,provider_config_id ON saas.quick_order_links
FOR EACH ROW EXECUTE FUNCTION saas.guard_quick_link_provider_authority();

COMMIT;
