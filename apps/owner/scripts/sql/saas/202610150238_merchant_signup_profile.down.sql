-- Rollback preserves all collected personal data by refusing a destructive drop once used.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM saas.merchant_signup_profiles) THEN RAISE EXCEPTION 'MERCHANT_SIGNUP_PROFILE_ROLLBACK_REQUIRES_UNUSED_AUTHORITY';END IF;END $guard$;
DROP FUNCTION saas.merchant_whatsapp_bootstrap_profile(uuid,text,text,text,uuid,uuid,text,text);
DROP TABLE saas.merchant_signup_profiles;
COMMIT;
