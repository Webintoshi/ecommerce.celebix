-- Fail closed: restoring historical issuance is forbidden after phone authority is used.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $f$ DECLARE r record;BEGIN
 IF EXISTS(SELECT 1 FROM saas.merchant_whatsapp_policy WHERE enabled OR cutover_at IS NOT NULL) OR EXISTS(SELECT 1 FROM saas.merchant_whatsapp_store_policy WHERE enabled OR cutover_at IS NOT NULL) OR EXISTS(SELECT 1 FROM saas.merchant_phone_identities) OR EXISTS(SELECT 1 FROM saas.merchant_phone_operations) OR EXISTS(SELECT 1 FROM saas.merchant_phone_pending) OR EXISTS(SELECT 1 FROM saas.whatsapp_otp_send_reservations) OR EXISTS(SELECT 1 FROM saas.principals WHERE authority_kind='phone') THEN RAISE EXCEPTION 'MERCHANT_PHONE_ROLLBACK_REQUIRES_UNUSED_AUTHORITY';END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.merchant_whatsapp_original_functions WHERE bootstrap_support_select_preexisting) THEN REVOKE SELECT(support_session_id) ON saas.memberships FROM celebix_saas_bootstrap;END IF;
 FOR r IN SELECT definition FROM saas.merchant_whatsapp_original_functions ORDER BY signature LOOP EXECUTE r.definition;END LOOP;
END $f$;
DROP TRIGGER merchant_whatsapp_policy_cutover ON saas.merchant_whatsapp_policy;
DROP TRIGGER merchant_whatsapp_store_policy_cutover ON saas.merchant_whatsapp_store_policy;
DROP FUNCTION saas.merchant_phone_security_reset(uuid,uuid,uuid,text),saas.merchant_whatsapp_cleanup(),saas.merchant_whatsapp_bootstrap_principal(uuid,text,text,text,uuid,uuid),saas.merchant_whatsapp_command(text,jsonb),saas.merchant_whatsapp_capture_cutover(),saas.merchant_phone_projection(uuid),saas.merchant_phone_staff_projection(uuid),saas.merchant_whatsapp_principal_enforced(uuid,uuid),saas.merchant_whatsapp_policy_enabled(uuid),saas.whatsapp_otp_reserve_send(uuid,text,text,text);
DROP TABLE saas.merchant_phone_challenges,saas.merchant_phone_pending,saas.merchant_phone_operations,saas.merchant_phone_staff,saas.merchant_phone_staff_versions,saas.merchant_phone_identities,saas.whatsapp_otp_send_reservations,saas.merchant_whatsapp_store_policy,saas.merchant_whatsapp_policy,saas.merchant_whatsapp_original_functions;
ALTER TABLE saas.admin_login_assurance DROP COLUMN authentication_method;
ALTER TABLE saas.principals DROP CONSTRAINT principals_identity_kind_check;
ALTER TABLE saas.principals DROP COLUMN authority_kind;
ALTER TABLE saas.principals ALTER COLUMN email SET NOT NULL;
ALTER TABLE saas.principals ADD CONSTRAINT principals_email_verified_check CHECK(email_verified);
COMMIT;
