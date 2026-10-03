BEGIN;
SET LOCAL ROLE celebix_saas_owner;
CREATE FUNCTION saas.platform_operations_read(p_operator uuid,p_query jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE jobs jsonb; heartbeats jsonb; domains jsonb;
BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_query IS NULL OR jsonb_typeof(p_query)<>'object' OR p_query-ARRAY['storeId','q','status','limit','after','from','to']<>'{}' THEN RAISE EXCEPTION 'invalid_input'; END IF;
 SELECT coalesce(jsonb_agg(row ORDER BY row->>'createdAt'),'[]') INTO jobs FROM (
 SELECT jsonb_build_object('id',j.attempt_id,'jobId',j.attempt_id,'source','onboarding','state',j.state,'safeCode',j.safe_code,'retryCount',j.failure_count,'nextDueAt',j.due_at,'createdAt',j.created_at,'updatedAt',j.updated_at,'version',j.version,'storeId',a.store_id,
 'canRetry',coalesce(i.attempt_id IS NOT NULL AND w.status IN('identity_verified','tenant_created','session_created') AND (j.state IN('pending','attention_required') OR (j.state='leased' AND j.lease_expires_at<=now())),false),
 'retryable',coalesce(i.attempt_id IS NOT NULL AND w.status IN('identity_verified','tenant_created','session_created') AND (j.state IN('pending','attention_required') OR (j.state='leased' AND j.lease_expires_at<=now())),false),'ownerOrigin',s.owner_origin,
 'ageSeconds',greatest(0,extract(epoch FROM now()-j.created_at)::bigint)) AS row
 FROM saas.registration_onboarding_jobs j JOIN saas.registration_authority_scopes s USING(attempt_id)
 LEFT JOIN saas.registration_verified_identities i USING(attempt_id)
 LEFT JOIN saas.registration_workflows w USING(attempt_id)
 LEFT JOIN saas.registration_onboarding_access a USING(attempt_id)
 WHERE (NOT p_query?'storeId' OR a.store_id=(p_query->>'storeId')::uuid)
 ORDER BY j.state='ready',j.created_at LIMIT 50) r;
 SELECT coalesce(jsonb_agg(jsonb_build_object('ownerOrigin',owner_origin,'panelOrigin',panel_origin,'lastCheckedAt',checked_at,'state',CASE WHEN checked_at<now()-interval '90 seconds' THEN 'stale' ELSE 'healthy' END)),'[]') INTO heartbeats FROM saas.registration_onboarding_heartbeats;
 SELECT coalesce(jsonb_agg(jsonb_build_object('storeId',store_id,'hostname',hostname,'status',status,'source',source)),'[]') INTO domains FROM (
  SELECT store_id,hostname,status,'storefront'::text AS source FROM saas.store_domains WHERE status NOT IN('active','disabled')
  UNION ALL SELECT store_id,hostname,status,'admin' FROM saas.admin_domains WHERE status NOT IN('active','disabled')
  UNION ALL SELECT d.store_id,d.normalized_hostname,d.status,'registration' FROM saas.domains d WHERE d.status NOT IN('active','disabled') AND NOT EXISTS(SELECT 1 FROM saas.store_domains s WHERE s.hostname=d.normalized_hostname)
 ) pending WHERE NOT p_query?'storeId' OR store_id=(p_query->>'storeId')::uuid;
 RETURN jsonb_build_object('available',true,'observedAt',now(),'items',jobs,'workers',heartbeats,'domainIssues',domains);
END $f$;
CREATE FUNCTION saas.platform_operations_retry(p_operator uuid,p_payload jsonb,p_version bigint,p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE prior saas.platform_command_results; scope saas.registration_authority_scopes; request jsonb; outcome text; result jsonb; store uuid;
BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR p_payload-ARRAY['jobId']<>'{}' OR NOT p_payload?'jobId' OR length(p_payload->>'jobId') NOT BETWEEN 1 AND 160 OR p_version IS NULL OR p_version<1 OR p_key IS NULL OR p_key !~ '^[A-Za-z0-9._:-]{8,128}$' THEN RAISE EXCEPTION 'invalid_input'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-replay:'||p_operator::text||':'||p_key,0));
 request:=jsonb_build_object('action','operations.retry','payload',p_payload,'expectedVersion',p_version);
 SELECT * INTO prior FROM saas.platform_command_results WHERE operator_id=p_operator AND idempotency_key=p_key;
 IF FOUND THEN IF prior.request<>request THEN RAISE EXCEPTION 'operation_mismatch'; END IF; RETURN jsonb_set(prior.result,'{outcome}','"replayed"'); END IF;
 SELECT * INTO scope FROM saas.registration_authority_scopes WHERE attempt_id=p_payload->>'jobId'; IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found'; END IF;
 outcome:=saas.retry_registration_onboarding_job(scope.attempt_id,scope.owner_origin,scope.panel_origin,scope.platform_domain_suffix,p_version,clock_timestamp());
 IF outcome='conflict' THEN RAISE EXCEPTION 'version_conflict'; END IF;
 IF outcome='busy' THEN RAISE EXCEPTION 'operation_busy'; END IF;
 IF outcome<>'queued' THEN RAISE EXCEPTION 'invalid_input'; END IF;
 SELECT store_id INTO store FROM saas.registration_onboarding_access WHERE attempt_id=scope.attempt_id;
 INSERT INTO saas.platform_audit(operator_id,store_id,action,payload) VALUES(p_operator,store,'operations.retry',p_payload);
 result:=jsonb_build_object('outcome','committed','version',p_version+1,'result',jsonb_build_object('jobId',scope.attempt_id,'state','queued'));
 INSERT INTO saas.platform_command_results(operator_id,idempotency_key,request,result) VALUES(p_operator,p_key,request,result);
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION saas.platform_operations_read(uuid,jsonb),saas.platform_operations_retry(uuid,jsonb,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.platform_operations_read(uuid,jsonb),saas.platform_operations_retry(uuid,jsonb,bigint,text) TO celebix_saas_platform_operator;
COMMIT;
