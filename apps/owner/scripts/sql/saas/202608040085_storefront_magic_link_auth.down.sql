BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $block$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_storefront_magic_link_auth_down',true) IS DISTINCT FROM 'on'
    OR EXISTS(
      SELECT 1 FROM saas.storefront_login_challenges
      WHERE ticket_digest IS NOT NULL AND consumed_at IS NULL AND expires_at>pg_catalog.clock_timestamp()
    )
  THEN RAISE EXCEPTION 'STOREFRONT_MAGIC_LINK_AUTH_DOWN_BLOCKED'; END IF;
END $block$;

REVOKE ALL ON FUNCTION
  saas.public_account_auth_start_v2(text,timestamptz,uuid,text,text,text,text,text,text,timestamptz,uuid,text,jsonb,text),
  saas.public_account_auth_verify_v2(text,timestamptz,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

DROP FUNCTION saas.public_account_auth_verify_v2(text,timestamptz,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text);
DROP FUNCTION saas.public_account_auth_start_v2(text,timestamptz,uuid,text,text,text,text,text,text,timestamptz,uuid,text,jsonb,text);

ALTER TABLE saas.storefront_login_challenges
  DROP CONSTRAINT storefront_login_challenges_ticket_pair_ck,
  DROP COLUMN ticket_digest,
  DROP COLUMN ticket_key_id;

COMMIT;
