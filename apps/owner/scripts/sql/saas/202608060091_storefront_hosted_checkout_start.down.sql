BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

LOCK TABLE saas.storefront_hosted_checkout_sessions,saas.storefront_hosted_checkout_operations
  IN ACCESS EXCLUSIVE MODE;
DO $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions)
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_START_DOWN_BLOCKED'; END IF;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.public_storefront_hosted_checkout_authority(text,timestamptz,text,jsonb,bigint,jsonb,uuid),
  saas.public_storefront_hosted_checkout_begin(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text),
  saas.public_storefront_hosted_checkout_presentation_save(text,timestamptz,jsonb,uuid,text,bigint,text,text,jsonb,timestamptz),
  saas.public_storefront_hosted_checkout_presentation(text,timestamptz,jsonb),
  saas.public_storefront_hosted_checkout_status(text,timestamptz,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

DROP FUNCTION saas.public_storefront_hosted_checkout_status(text,timestamptz,jsonb);
DROP FUNCTION saas.public_storefront_hosted_checkout_presentation(text,timestamptz,jsonb);
DROP FUNCTION saas.public_storefront_hosted_checkout_presentation_save(text,timestamptz,jsonb,uuid,text,bigint,text,text,jsonb,timestamptz);
DROP FUNCTION saas.public_storefront_hosted_checkout_begin(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text);
DROP FUNCTION saas.public_storefront_hosted_checkout_authority(text,timestamptz,text,jsonb,bigint,jsonb,uuid);
DROP FUNCTION saas.storefront_hosted_checkout_authority_projection(text,timestamptz,text,jsonb,bigint,jsonb,uuid);

COMMIT;
