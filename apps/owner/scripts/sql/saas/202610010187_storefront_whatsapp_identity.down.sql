BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $block$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_storefront_whatsapp_identity_down',true) IS DISTINCT FROM 'on'
    OR EXISTS(SELECT 1 FROM saas.storefront_accounts WHERE phone_normalized IS NOT NULL OR email IS NULL OR email_normalized IS NULL)
    OR EXISTS(SELECT 1 FROM saas.storefront_login_challenges WHERE channel='whatsapp')
  THEN RAISE EXCEPTION 'STOREFRONT_WHATSAPP_IDENTITY_DOWN_BLOCKED'; END IF;
END $block$;

DROP FUNCTION saas.public_account_auth_start_phone(text,timestamptz,uuid,text,text,text,text,timestamptz,text);
DROP FUNCTION saas.public_account_auth_phone_delivery(text,timestamptz,uuid,text,boolean);
DROP FUNCTION saas.public_account_auth_verify_phone(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text);
DROP FUNCTION saas.public_account_auth_start_v3(text,timestamptz,uuid,text,text,text,text,text,text,timestamptz,uuid,text,jsonb,text);

DROP FUNCTION saas.storefront_identity_snapshot(uuid,uuid,uuid);
ALTER FUNCTION saas.storefront_identity_snapshot_pre_whatsapp(uuid,uuid,uuid) RENAME TO storefront_identity_snapshot;
DROP FUNCTION saas.public_account_profile_update(text,timestamptz,jsonb,uuid,text,text,text,text,bigint,text);
ALTER FUNCTION saas.public_account_profile_update_pre_whatsapp(text,timestamptz,jsonb,uuid,text,text,text,text,bigint,text) RENAME TO public_account_profile_update;
DROP FUNCTION saas.public_account_profile_complete(text,timestamptz,jsonb,uuid,text,uuid,text,text,text,uuid,text,text,text,text,text,text);
ALTER FUNCTION saas.public_account_profile_complete_pre_whatsapp(text,timestamptz,jsonb,uuid,text,uuid,text,text,text,uuid,text,text,text,text,text,text) RENAME TO public_account_profile_complete;
DROP FUNCTION saas.public_account_auth_verify_v2(text,timestamptz,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text);
ALTER FUNCTION saas.public_account_auth_verify_v2_pre_whatsapp(text,timestamptz,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text) RENAME TO public_account_auth_verify_v2;
DROP FUNCTION saas.public_account_auth_verify(text,timestamptz,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text);
ALTER FUNCTION saas.public_account_auth_verify_pre_whatsapp(text,timestamptz,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text) RENAME TO public_account_auth_verify;

GRANT EXECUTE ON FUNCTION
  saas.public_account_profile_update(text,timestamptz,jsonb,uuid,text,text,text,text,bigint,text),
  saas.public_account_profile_complete(text,timestamptz,jsonb,uuid,text,uuid,text,text,text,uuid,text,text,text,text,text,text),
  saas.public_account_auth_verify_v2(text,timestamptz,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text),
  saas.public_account_auth_verify(text,timestamptz,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text)
TO celebix_saas_host_resolver;

DROP INDEX saas.storefront_login_challenges_phone_rate_idx;
ALTER TABLE saas.storefront_login_challenges
  DROP CONSTRAINT storefront_login_challenges_recipient_ck,
  DROP CONSTRAINT storefront_login_challenges_channel_ck,
  DROP CONSTRAINT storefront_login_challenges_delivery_ck,
  DROP COLUMN delivery_status,
  DROP COLUMN phone_digest,
  DROP COLUMN channel,
  ALTER COLUMN email_digest SET NOT NULL;
ALTER TABLE saas.storefront_accounts
  DROP CONSTRAINT storefront_accounts_store_phone_key,
  DROP CONSTRAINT storefront_accounts_identity_ck,
  DROP CONSTRAINT storefront_accounts_phone_pair_ck,
  DROP CONSTRAINT storefront_accounts_email_pair_ck,
  DROP COLUMN phone_verified_at,
  DROP COLUMN phone_normalized,
  ALTER COLUMN email SET NOT NULL,
  ALTER COLUMN email_normalized SET NOT NULL;

COMMIT;
