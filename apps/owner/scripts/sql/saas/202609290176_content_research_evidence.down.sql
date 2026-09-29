BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
-- Keep private evidence and terminal reads, but make new fetch/dispatch unavailable.
CREATE OR REPLACE FUNCTION saas.content_research_begin(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_fingerprint text,p_target jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT 'unavailable'::text,NULL::jsonb $f$;
CREATE OR REPLACE FUNCTION saas.content_research_claim(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT 'unavailable'::text,NULL::jsonb $f$;
-- Restore the Task4 admission helper exactly: research is now disabled and historical rows remain untouched.
CREATE OR REPLACE FUNCTION saas.content_authoring_shared_admission(p_store uuid,p_actor uuid,p_now timestamptz) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE n bigint;lim integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store::text,170));
 UPDATE saas.content_resource_authoring_operations SET status=CASE WHEN dispatch_state='not_dispatched' THEN 'failed' ELSE 'unknown' END,dispatch_state=CASE WHEN dispatch_state='not_dispatched' THEN 'not_dispatched' ELSE 'unknown' END,safe_code='provider_timeout',version=version+1,updated_at=p_now,finished_at=p_now WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at<=p_now;
 IF EXISTS(SELECT 1 FROM saas.content_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at>p_now UNION ALL SELECT 1 FROM saas.content_resource_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at>p_now) THEN RETURN 'operation_busy';END IF;
 SELECT count(*) INTO n FROM (SELECT 1 FROM saas.content_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND created_at>p_now-interval '1 minute' UNION ALL SELECT 1 FROM saas.content_resource_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND created_at>p_now-interval '1 minute') q;
 IF n>=6 THEN RETURN 'rate_limited';END IF;
 SELECT coalesce((SELECT daily_limit FROM saas.content_authoring_settings WHERE store_id=p_store),100) INTO lim;
 SELECT count(*) INTO n FROM (SELECT created_at FROM saas.content_authoring_operations WHERE store_id=p_store UNION ALL SELECT created_at FROM saas.content_resource_authoring_operations WHERE store_id=p_store) q WHERE created_at>=date_trunc('day',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND created_at<(date_trunc('day',p_now AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC';
 IF n>=lim THEN RETURN 'quota_exceeded';END IF;RETURN NULL;
END $f$;

COMMIT;
