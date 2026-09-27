BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.registration_authority_scopes,saas.registration_onboarding_jobs,saas.registration_onboarding_access IN ACCESS EXCLUSIVE MODE;
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM saas.registration_authority_scopes) OR EXISTS(SELECT 1 FROM saas.registration_onboarding_jobs)
 OR EXISTS(SELECT 1 FROM saas.registration_onboarding_access) THEN RAISE EXCEPTION 'ONBOARDING_ROLLBACK_HAS_DURABLE_AUTHORITY'; END IF;
END $guard$;
DROP FUNCTION saas.backfill_registration_onboarding_jobs(text,text,text,timestamptz,integer);
DROP FUNCTION saas.read_registration_onboarding_tenant(text,text,text,text);
DROP FUNCTION saas.list_registration_onboarding_operations(text,text,text,timestamptz,integer);
DROP FUNCTION saas.retry_registration_onboarding_job(text,text,text,text,bigint,timestamptz);
DROP TRIGGER registration_identity_onboarding_job ON saas.registration_verified_identities;
DROP FUNCTION saas.enqueue_registration_onboarding_job();
DROP FUNCTION saas.bind_registration_onboarding_scope(text,text,text,text,timestamptz);
DROP FUNCTION saas.claim_registration_onboarding_jobs(text,text,text,timestamptz,integer);
DROP FUNCTION saas.finish_registration_onboarding_job(text,text,text,text,uuid,timestamptz,text,text,uuid,timestamptz,text);
DROP FUNCTION saas.read_registration_onboarding_access(text,text,text,text,timestamptz,uuid);
DROP FUNCTION saas.touch_registration_onboarding_heartbeat(text,text,text,timestamptz);
DROP FUNCTION saas.read_registration_onboarding_health(text,text,text,timestamptz);
DROP FUNCTION saas.verify_registration_onboarding_access_proof(text,text,text,text,uuid,text,text,timestamptz);
DROP TABLE saas.registration_onboarding_access,saas.registration_onboarding_jobs,saas.registration_onboarding_heartbeats,saas.registration_authority_scopes;
COMMIT;
