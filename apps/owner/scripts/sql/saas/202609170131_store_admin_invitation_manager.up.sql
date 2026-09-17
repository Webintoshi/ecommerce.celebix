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
COMMIT;
