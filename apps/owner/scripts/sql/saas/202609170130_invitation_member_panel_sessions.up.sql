-- Expand only exact-host session membership roles; all other120 guards remain unchanged.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.issue_returning_panel_session_for_admin_host(
  p_issuer text,p_subject text,p_destination_hostname text,p_session_id uuid,p_family_id uuid,p_operation_id uuid,p_token_key_id text,p_token_digest text,p_now timestamptz,p_expires_at timestamptz
) RETURNS TABLE(outcome text,authority jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_principal_id uuid; selected_store_id uuid;
BEGIN
  IF p_issuer IS NULL OR p_subject IS NULL OR p_destination_hostname IS NULL OR p_session_id IS NULL OR p_family_id IS NULL OR p_operation_id IS NULL OR p_token_key_id IS NULL OR p_token_digest IS NULL OR p_now IS NULL OR p_expires_at IS NULL
     OR length(p_issuer)>2048 OR length(p_subject)>512 OR length(p_destination_hostname)>253 OR p_issuer<>btrim(p_issuer) OR p_subject<>btrim(p_subject) OR p_destination_hostname<>lower(btrim(p_destination_hostname))
     OR p_destination_hostname!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' OR p_expires_at<=p_now OR p_expires_at>p_now+interval '8 hours' THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  SELECT principal.id,store.id INTO selected_principal_id,selected_store_id
  FROM saas.principals principal JOIN saas.memberships membership ON membership.principal_id=principal.id AND membership.role IN ('store_owner','admin','editor','analyst') AND membership.status='active'
  JOIN saas.stores store ON store.id=membership.store_id AND store.status='active'
  JOIN saas.admin_domains domain ON domain.store_id=store.id AND domain.hostname=p_destination_hostname AND domain.status='active' AND domain.verified_at IS NOT NULL AND domain.verified_at<=p_now
  JOIN saas.subscriptions subscription ON subscription.store_id=store.id AND subscription.status='active' AND subscription.valid_from<=p_now AND (subscription.valid_until IS NULL OR p_now<subscription.valid_until)
  JOIN saas.plans plan ON plan.id=subscription.plan_id AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version AND plan.status='active' AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR p_now<plan.valid_until)
  WHERE principal.issuer=p_issuer AND principal.subject=p_subject AND principal.email_verified FOR SHARE OF principal,membership,store,domain,subscription,plan;
  IF selected_principal_id IS NULL THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT issued.outcome,issued.authority FROM saas.issue_panel_session(p_session_id,p_family_id,p_operation_id,p_token_key_id,p_token_digest,selected_principal_id,selected_store_id,p_now,p_expires_at) issued;
END $f$;


CREATE OR REPLACE FUNCTION saas.recover_returning_panel_session_for_admin_host(
  p_issuer text,p_subject text,p_destination_hostname text,p_operation_id uuid,p_token_key_id text,p_token_digest text
) RETURNS TABLE(outcome text,authority jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE recovered_principal_id uuid; recovered_store_id uuid;
BEGIN
  SELECT session.principal_id,session.active_store_id INTO recovered_principal_id,recovered_store_id
  FROM saas.panel_sessions session JOIN saas.principals principal ON principal.id=session.principal_id AND principal.issuer=p_issuer AND principal.subject=p_subject AND principal.email_verified
  JOIN saas.memberships membership ON membership.principal_id=principal.id AND membership.store_id=session.active_store_id AND membership.role IN ('store_owner','admin','editor','analyst') AND membership.status='active'
  JOIN saas.stores store ON store.id=membership.store_id AND store.status='active'
  JOIN saas.admin_domains domain ON domain.store_id=store.id AND domain.hostname=p_destination_hostname AND domain.status='active' AND domain.verified_at IS NOT NULL
  WHERE session.operation_id=p_operation_id AND session.operation_kind='issue' AND session.token_key_id=p_token_key_id AND session.token_digest=p_token_digest;
  IF recovered_principal_id IS NULL THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT recovered.outcome,recovered.authority FROM saas.recover_panel_session_operation(p_operation_id,'issue',p_token_key_id,p_token_digest,recovered_principal_id,recovered_store_id,NULL,NULL,NULL) recovered;
END $f$;


COMMIT;

