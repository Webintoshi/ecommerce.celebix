-- Rollback only empty installation; proof and unfinished revocations must survive.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM saas.email_marketing_connections) OR EXISTS(SELECT 1 FROM saas.email_marketing_consent_events) OR EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs) OR EXISTS(SELECT 1 FROM saas.email_marketing_inbound_events) OR EXISTS(SELECT 1 FROM saas.email_marketing_operations) THEN RAISE EXCEPTION 'EMAIL_MARKETING_ROLLBACK_RETAINED_EVIDENCE';END IF;
END $guard$;
DROP FUNCTION saas.email_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb);
DROP FUNCTION saas.email_marketing_projection(uuid,uuid);
DROP FUNCTION saas.email_marketing_candidate_projection(uuid,uuid);
DROP TABLE saas.email_marketing_operations,saas.email_marketing_candidates,saas.email_marketing_contacts,saas.email_marketing_sync_jobs,saas.email_marketing_inbound_events,saas.email_marketing_audience,saas.email_marketing_consent_events,saas.email_marketing_connections;
COMMIT;
