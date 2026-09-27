BEGIN;
SET LOCAL ROLE celebix_saas_owner;
CREATE TABLE saas.registration_status_bindings (
 status_digest text PRIMARY KEY CHECK(status_digest ~ '^[a-f0-9]{64}$'),
 attempt_id text NOT NULL UNIQUE REFERENCES saas.registration_workflows(attempt_id) ON DELETE RESTRICT,
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at = issued_at + interval '24 hours'),
 revoked_at timestamptz CHECK(revoked_at IS NULL OR revoked_at >= issued_at)
);
ALTER TABLE saas.registration_status_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.registration_status_bindings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.registration_status_bindings FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow;
CREATE INDEX registration_status_bindings_cleanup_idx ON saas.registration_status_bindings(expires_at);

CREATE FUNCTION saas.issue_panel_bootstrap_with_registration_status(
 p_state text,p_oidc text,p_bootstrap_key text,p_bootstrap_digest text,p_url text,p_binding uuid,p_issued timestamptz,p_bootstrap_expiry timestamptz,
 p_status text,p_owner text,p_panel text,p_suffix text,p_status_expiry timestamptz
) RETURNS TABLE(outcome text,authority jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE v_attempt text; v_existing saas.registration_status_bindings; v_outcome text; v_authority jsonb;
BEGIN
 IF p_status IS NULL OR p_status !~ '^[a-f0-9]{64}$' OR p_issued IS NULL OR p_status_expiry IS DISTINCT FROM p_issued + interval '24 hours' THEN
  RETURN QUERY SELECT 'durable_authority_invalid'::text,NULL::jsonb;RETURN;
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_state,2607140017));
 SELECT workflow.attempt_id INTO v_attempt FROM saas.registration_workflows workflow
 JOIN saas.registration_authority_scopes scope USING(attempt_id)
 WHERE workflow.state_digest=p_state AND scope.owner_origin=p_owner AND scope.panel_origin=p_panel AND scope.platform_domain_suffix=p_suffix
 FOR SHARE OF workflow,scope;
 IF v_attempt IS NULL THEN RETURN QUERY SELECT 'durable_authority_invalid'::text,NULL::jsonb;RETURN;END IF;
 SELECT binding.* INTO v_existing FROM saas.registration_status_bindings binding WHERE binding.attempt_id=v_attempt;
 IF FOUND AND (v_existing.status_digest<>p_status OR v_existing.issued_at<>p_issued OR v_existing.expires_at<>p_status_expiry OR v_existing.revoked_at IS NOT NULL) THEN
  RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;RETURN;
 END IF;
 SELECT result.outcome,result.authority INTO v_outcome,v_authority
 FROM saas.create_panel_browser_bootstrap(p_state,p_oidc,p_bootstrap_key,p_bootstrap_digest,p_url,p_binding,p_issued,p_bootstrap_expiry) result;
 IF v_outcome IN ('browser_bootstrap_created','browser_bootstrap_replayed') THEN
  INSERT INTO saas.registration_status_bindings(status_digest,attempt_id,issued_at,expires_at)
  VALUES(p_status,v_attempt,p_issued,p_status_expiry) ON CONFLICT(attempt_id) DO NOTHING;
 END IF;
 RETURN QUERY SELECT v_outcome,v_authority;
END $f$;

CREATE FUNCTION saas.registration_onboarding_status_projection(p_attempt text,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
  'stage',CASE
   WHEN workflow.status IN ('failed','cancelled') THEN 'failed'
   WHEN workflow.status='expired' OR (workflow.status='awaiting_identity' AND workflow.expires_at<=p_now) THEN CASE WHEN workflow.consumed_at IS NULL AND NOT EXISTS(SELECT 1 FROM saas.registration_verified_identities identity WHERE identity.attempt_id=workflow.attempt_id) THEN 'expired' ELSE 'attention_required' END
   WHEN workflow.status='awaiting_identity' AND workflow.consumed_at IS NULL THEN 'awaiting_identity'
   WHEN job.state='attention_required' THEN 'attention_required'
   WHEN completion.state='completed' AND access.state='ready' AND access.checked_at<=p_now AND access.checked_at>p_now-interval '5 minutes' AND access.store_id=operation.result_store_id THEN 'ready'
   WHEN completion.state='completed' THEN 'checking_access'
   ELSE 'creating' END,
  'updatedAt',pg_catalog.to_char(GREATEST(workflow.updated_at,job.updated_at,access.checked_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'storeSlug',CASE WHEN completion.state='completed' AND access.state='ready' AND access.checked_at<=p_now AND access.checked_at>p_now-interval '5 minutes' AND access.store_id=operation.result_store_id AND job.state IS DISTINCT FROM 'attention_required' THEN store.slug ELSE NULL END
 ))
 FROM saas.registration_workflows workflow
 LEFT JOIN saas.registration_tenant_completions completion USING(attempt_id)
 LEFT JOIN saas.registration_onboarding_jobs job USING(attempt_id)
 LEFT JOIN saas.registration_onboarding_access access USING(attempt_id)
 LEFT JOIN saas.tenant_operations operation ON operation.id=completion.tenant_operation_id AND operation.status='committed'
 LEFT JOIN saas.stores store ON store.id=operation.result_store_id
 WHERE workflow.attempt_id=p_attempt
$f$;

CREATE FUNCTION saas.read_registration_status(p_digest text,p_owner text,p_panel text,p_suffix text,p_now timestamptz)
RETURNS TABLE(outcome text,authority jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE v_binding saas.registration_status_bindings;
BEGIN
 IF p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$' OR p_now IS NULL OR p_now<clock_timestamp()-interval '30 seconds' OR p_now>clock_timestamp()+interval '30 seconds' THEN
  RETURN QUERY SELECT 'unauthorized'::text,NULL::jsonb;RETURN;
 END IF;
 SELECT binding.* INTO v_binding FROM saas.registration_status_bindings binding
 JOIN saas.registration_authority_scopes scope USING(attempt_id)
 WHERE binding.status_digest=p_digest AND scope.owner_origin=p_owner AND scope.panel_origin=p_panel AND scope.platform_domain_suffix=p_suffix;
 IF NOT FOUND OR v_binding.revoked_at IS NOT NULL THEN RETURN QUERY SELECT 'unauthorized'::text,NULL::jsonb;RETURN;END IF;
 IF v_binding.expires_at<=p_now THEN RETURN QUERY SELECT 'expired'::text,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'status'::text,saas.registration_onboarding_status_projection(v_binding.attempt_id,p_now);
END $f$;

CREATE FUNCTION saas.read_registration_callback_access_ready(p_state text,p_owner text,p_panel text,p_suffix text,p_now timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT COALESCE((SELECT (saas.registration_onboarding_status_projection(workflow.attempt_id,p_now)->>'stage')='ready'
 FROM saas.registration_workflows workflow JOIN saas.registration_authority_scopes scope USING(attempt_id)
 WHERE workflow.state_digest=p_state AND scope.owner_origin=p_owner AND scope.panel_origin=p_panel AND scope.platform_domain_suffix=p_suffix
 AND p_now BETWEEN clock_timestamp()-interval '30 seconds' AND clock_timestamp()+interval '30 seconds'),false)
$f$;

CREATE FUNCTION saas.cleanup_registration_status_bindings(p_now timestamptz,p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE v_count integer;
BEGIN
 IF p_now IS NULL OR p_limit IS NULL OR p_limit<1 OR p_limit>1000 OR p_now NOT BETWEEN clock_timestamp()-interval '30 seconds' AND clock_timestamp()+interval '30 seconds' THEN RETURN 0;END IF;
 WITH candidates AS(SELECT status_digest FROM saas.registration_status_bindings WHERE expires_at<p_now-interval '1 hour' ORDER BY expires_at LIMIT p_limit FOR UPDATE SKIP LOCKED),deleted AS(
 DELETE FROM saas.registration_status_bindings binding USING candidates WHERE binding.status_digest=candidates.status_digest RETURNING 1)
 SELECT count(*)::integer INTO v_count FROM deleted;
 RETURN v_count;
END $f$;
REVOKE ALL ON FUNCTION saas.registration_onboarding_status_projection(text,timestamptz) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.issue_panel_bootstrap_with_registration_status(text,text,text,text,text,uuid,timestamptz,timestamptz,text,text,text,text,timestamptz),saas.read_registration_status(text,text,text,text,timestamptz),saas.read_registration_callback_access_ready(text,text,text,text,timestamptz),saas.cleanup_registration_status_bindings(timestamptz,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.issue_panel_bootstrap_with_registration_status(text,text,text,text,text,uuid,timestamptz,timestamptz,text,text,text,text,timestamptz),saas.read_registration_status(text,text,text,text,timestamptz),saas.read_registration_callback_access_ready(text,text,text,text,timestamptz),saas.cleanup_registration_status_bindings(timestamptz,integer) TO celebix_saas_identity;
COMMIT;
