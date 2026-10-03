BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $preflight$ BEGIN IF EXISTS(SELECT 1 FROM saas.platform_member_invitations) OR EXISTS(SELECT 1 FROM saas.platform_invitation_oidc_attempts) THEN RAISE EXCEPTION 'PLATFORM_INVITATION_ROLLBACK_HAS_HISTORY_FORWARD_RECOVERY_REQUIRED';END IF;END $preflight$;
DROP FUNCTION saas.platform_invitation_complete(uuid,text,text,text,boolean),saas.platform_invitation_claim(text,text),saas.platform_invitation_start(uuid,text,text,text,text,jsonb,timestamptz),saas.platform_invitation_create(uuid,jsonb,bigint,text,text),saas.platform_invitation_read(uuid,jsonb,text);
DROP TABLE saas.platform_invitation_oidc_attempts,saas.platform_member_invitations;
DROP FUNCTION saas.platform_invitation_identity_guard();
COMMIT;
