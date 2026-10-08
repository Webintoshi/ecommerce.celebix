-- Add popup-only deletion. Existing campaign readers, coupons, media and contact history remain unchanged.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $ready$ BEGIN
 IF to_regprocedure('saas.store_engagement_popup_delete(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)') IS NOT NULL
 OR to_regprocedure('saas.store_engagement_campaign_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,boolean,jsonb)') IS NULL
 OR to_regprocedure('saas.store_engagement_admin_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)') IS NULL
 OR to_regclass('saas.store_engagement_cart_contacts') IS NULL
 THEN RAISE EXCEPTION 'STORE_POPUP_DELETE_222_PREDECESSOR_INVALID';END IF;
END $ready$;

CREATE FUNCTION saas.store_engagement_popup_delete(
 p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
 p_operation uuid,p_fingerprint text,p_campaign uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;op saas.store_engagement_admin_operations;c saas.store_engagement_campaigns;request jsonb;result jsonb;
BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.manage');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_campaign IS NULL
 OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_now IS NULL OR NOT isfinite(p_now)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 request:=jsonb_build_object('action','delete_popup','campaignId',p_campaign,'expectedVersion',p_expected_version);
 -- Sharing the save lock prevents a competing save/delete from bypassing version or capacity checks.
 PERFORM pg_advisory_xact_lock(hashtextextended('store-engagement-save:'||p_store::text,215));
 SELECT * INTO op FROM saas.store_engagement_admin_operations WHERE store_id=p_store AND operation_id=p_operation;
 IF FOUND THEN
  IF op.principal_id<>p_principal OR op.fingerprint<>p_fingerprint OR op.request_payload<>request
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;
  RETURN;
 END IF;
 SELECT * INTO c FROM saas.store_engagement_campaigns WHERE store_id=p_store AND id=p_campaign FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF c.kind<>'popup' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF c.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF p_now<c.updated_at THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Contact-bearing campaigns are retained even if an unexpected historical record references a popup.
 IF EXISTS(SELECT 1 FROM saas.store_engagement_cart_contacts WHERE store_id=p_store AND campaign_id=c.id)
 THEN RETURN QUERY SELECT 'campaign_unavailable',NULL::jsonb;RETURN;END IF;
 DELETE FROM saas.store_engagement_campaigns WHERE store_id=p_store AND id=c.id AND kind='popup' AND version=p_expected_version;
 result:=jsonb_build_object('campaignId',c.id,'deleted',true);
 INSERT INTO saas.store_engagement_admin_operations(store_id,operation_id,principal_id,fingerprint,request_payload,result_payload,created_at)
 VALUES(p_store,p_operation,p_principal,p_fingerprint,request,result,date_trunc('milliseconds',p_now));
 RETURN QUERY SELECT 'saved',result;
END $f$;
REVOKE ALL ON FUNCTION saas.store_engagement_popup_delete(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)
 FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.store_engagement_popup_delete(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
COMMIT;
