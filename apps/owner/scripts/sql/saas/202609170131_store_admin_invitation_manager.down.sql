BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.store_admin_invitation_manager(text,text,text,timestamptz);
DROP FUNCTION saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text);
CREATE OR REPLACE FUNCTION saas.merchant_admin_archive(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; op saas.merchant_admin_operations%ROWTYPE; r saas.merchant_admin_records%ROWTYPE; result jsonb; BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 SELECT * INTO op FROM saas.merchant_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF FOUND THEN
  SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=(op.result_payload->>'id')::uuid;
  IF NOT FOUND OR r.record_kind<>(op.result_payload->>'kind') THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,r.record_kind,true); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
  IF r.id<>p_record_id OR op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,r.record_kind,true); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 IF r.status='archived' OR r.version<>p_expected_version THEN RETURN QUERY SELECT CASE WHEN r.status='archived' THEN 'invalid_transition' ELSE 'version_conflict' END,NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_admin_records SET status='archived',archived_at=p_now,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND id=p_record_id RETURNING saas.merchant_admin_mutation_projection(id,record_kind,status,version,updated_at) INTO result;
 INSERT INTO saas.merchant_admin_events(id,store_id,record_id,record_kind,event_kind,summary,occurred_at) VALUES(p_operation_id,p_store_id,p_record_id,r.record_kind,'archived',result,p_now);
 INSERT INTO saas.merchant_admin_operations VALUES(p_operation_id,p_store_id,'archive',p_fingerprint,result,p_now); RETURN QUERY SELECT 'archived',result;
END $f$;
COMMIT;
