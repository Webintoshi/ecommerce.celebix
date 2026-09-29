BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Additive writer: existing operations, functions and grants remain unchanged.
CREATE FUNCTION saas.content_authoring_fail_v2(
 p_store_id uuid, p_principal_id uuid, p_membership_id uuid,
 p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamptz,
 p_id uuid, p_token uuid, p_version bigint,
 p_code text, p_dispatch_state text, p_usage jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE
 denied text;
 op saas.content_authoring_operations%ROWTYPE;
 measured jsonb:=nullif(p_usage,'null'::jsonb);
 transition_outcome text;
 transition_payload jsonb;
 changed integer;
BEGIN
 denied:=saas.merchant_action_authority_error(
  p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
  'catalog','catalog_admin.manage'
 );
 IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 IF p_id IS NULL OR p_version IS NULL OR p_version<1
  OR p_code IS NULL OR p_code NOT IN(
   'invalid_input','rate_limited','quota_exceeded','provider_timeout','provider_unavailable',
   'invalid_output','cancelled','credential_invalid','connection_revoked','model_unavailable','unavailable'
  )
  OR p_dispatch_state IS NULL OR p_dispatch_state NOT IN('not_dispatched','dispatched','unknown')
  OR saas.content_authoring_usage_valid(p_usage) IS NOT TRUE
  OR (measured IS NOT NULL AND (p_code<>'invalid_output' OR p_dispatch_state<>'dispatched' OR p_token IS NULL)) THEN
  RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store_id::text,170));
 SELECT * INTO op FROM saas.content_authoring_operations o WHERE o.id=p_id FOR UPDATE;
 IF NOT FOUND OR op.store_id<>p_store_id OR op.principal_id<>p_principal_id THEN
  RETURN QUERY SELECT 'operation_not_found'::text,NULL::jsonb;RETURN;
 END IF;
 IF op.status<>'pending' THEN
  -- Only the identical failure transition may replay. Never backfill or erase usage.
  IF op.version::numeric<>p_version::numeric+1 OR op.claim_token IS DISTINCT FROM p_token
   OR op.dispatch_state<>p_dispatch_state OR op.safe_code IS DISTINCT FROM p_code
   OR op.status<>(CASE WHEN p_dispatch_state='unknown' THEN 'unknown' ELSE 'failed' END) THEN
   RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb;RETURN;
  END IF;
  IF op.usage IS DISTINCT FROM measured THEN
   RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;RETURN;
  END IF;
  RETURN QUERY SELECT 'failed'::text,saas.content_authoring_payload(p_id);RETURN;
 END IF;
 -- Retain original current-authority, expiry, token and version behavior. Its store
 -- and row locks remain held through the usage update in this same transaction.
 SELECT f.outcome,f.result_payload INTO transition_outcome,transition_payload
 FROM saas.content_authoring_fail(
  p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
  p_id,p_token,p_version,p_code,p_dispatch_state
 ) f;
 IF transition_outcome IS DISTINCT FROM 'failed' THEN
  RETURN QUERY SELECT transition_outcome,transition_payload;RETURN;
 END IF;
 IF measured IS NOT NULL THEN
  UPDATE saas.content_authoring_operations o SET usage=measured
  WHERE o.id=p_id AND o.store_id=p_store_id AND o.principal_id=p_principal_id
   AND o.version::numeric=p_version::numeric+1 AND o.claim_token=p_token
   AND o.status='failed' AND o.safe_code='invalid_output' AND o.dispatch_state='dispatched'
   AND o.usage IS NULL;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>1 THEN RAISE EXCEPTION 'content_authoring_failure_usage_fence';END IF;
 END IF;
 RETURN QUERY SELECT 'failed'::text,saas.content_authoring_payload(p_id);
END $f$;
REVOKE ALL ON FUNCTION saas.content_authoring_fail_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,text,text,jsonb)
 FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.content_authoring_fail_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,bigint,text,text,jsonb)
 TO celebix_saas_app;
COMMIT;
