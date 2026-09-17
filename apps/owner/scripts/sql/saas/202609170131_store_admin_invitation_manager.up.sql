BEGIN;
SET LOCAL ROLE celebix_saas_owner;
CREATE FUNCTION saas.store_admin_invitation_manager(p_token_key_id text,p_token_digest text,p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE resolved record; a jsonb; sid uuid;
BEGIN
 IF p_hostname IS NULL OR length(p_hostname)>253 OR p_hostname<>lower(btrim(p_hostname)) OR p_hostname!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb; RETURN; END IF;
 SELECT * INTO resolved FROM saas.resolve_panel_session(p_token_key_id,p_token_digest,p_now);
 a:=resolved.authority;
 IF resolved.outcome IS DISTINCT FROM 'resolved' OR a#>>'{tenant,membership,role}' IS DISTINCT FROM 'store_owner' OR a#>>'{tenant,membership,status}' IS DISTINCT FROM 'active' OR a#>>'{session,activeStoreId}' IS DISTINCT FROM a#>>'{tenant,store,id}' OR a#>>'{session,activeStoreId}' IS NULL THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb; RETURN; END IF;
 sid:=(a#>>'{session,activeStoreId}')::uuid;
 IF NOT EXISTS(SELECT 1 FROM saas.admin_domains d WHERE d.store_id=sid AND d.hostname=p_hostname AND d.status='active' AND d.verified_at IS NOT NULL AND d.verified_at<=p_now) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'manager',jsonb_build_object('storeId',sid,'principalId',a#>>'{session,principalId}','membershipId',a#>>'{tenant,membership,id}','planId',a#>>'{tenant,entitlements,planId}','planCode',a#>>'{tenant,entitlements,planCode}','planVersion',(a#>>'{tenant,entitlements,version}')::bigint);
END $f$;
REVOKE ALL ON FUNCTION saas.store_admin_invitation_manager(text,text,text,timestamptz) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.store_admin_invitation_manager(text,text,text,timestamptz) TO celebix_saas_identity;
CREATE OR REPLACE FUNCTION saas.merchant_admin_archive(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; op saas.merchant_admin_operations%ROWTYPE; r saas.merchant_admin_records%ROWTYPE; result jsonb; BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 SELECT * INTO op FROM saas.merchant_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF FOUND THEN
  SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=(op.result_payload->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR r.record_kind<>(op.result_payload->>'kind') THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  e:=CASE WHEN r.record_kind='administrator_invite' THEN saas.store_admin_invitation_authority(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now) ELSE saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,r.record_kind,true) END; IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
  IF r.id<>p_record_id OR op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 e:=CASE WHEN r.record_kind='administrator_invite' THEN saas.store_admin_invitation_authority(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now) ELSE saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,r.record_kind,true) END; IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 IF r.status='archived' OR r.version<>p_expected_version THEN RETURN QUERY SELECT CASE WHEN r.status='archived' THEN 'invalid_transition' ELSE 'version_conflict' END,NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_admin_records SET status='archived',archived_at=p_now,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND id=p_record_id RETURNING saas.merchant_admin_mutation_projection(id,record_kind,status,version,updated_at) INTO result;
 INSERT INTO saas.merchant_admin_events(id,store_id,record_id,record_kind,event_kind,summary,occurred_at) VALUES(p_operation_id,p_store_id,p_record_id,r.record_kind,'archived',result,p_now);
 INSERT INTO saas.merchant_admin_operations VALUES(p_operation_id,p_store_id,'archive',p_fingerprint,result,p_now); RETURN QUERY SELECT 'archived',result;
END $f$;

-- Bind the caller's path kind under the same lock as authorization and mutation.
CREATE FUNCTION saas.merchant_admin_archive(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.merchant_admin_records%ROWTYPE;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE;
 IF NOT FOUND OR p_kind IS DISTINCT FROM r.record_kind THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT * FROM saas.merchant_admin_archive(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version);
END $f$;
REVOKE ALL ON FUNCTION saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text) TO celebix_saas_app;
COMMIT;
