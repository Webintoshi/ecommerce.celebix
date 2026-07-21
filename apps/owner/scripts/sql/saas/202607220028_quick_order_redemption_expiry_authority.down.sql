-- Disposable rollback to the exact migration-027 claim body. Durable rows are retained.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.quick_links_claim_redemption(
  p_hostname text,p_token_digest text,p_redemption_id uuid,p_redemption_digest text,
  p_now timestamptz,p_expires_at timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE current_link saas.quick_order_links%ROWTYPE; canonical_hostname text; resolved_store_id uuid; projection jsonb;
BEGIN
  IF saas.quick_checkout_hostname_is_valid(p_hostname) IS DISTINCT FROM TRUE
     OR p_token_digest IS NULL OR p_token_digest!~'^[a-f0-9]{64}$'
     OR p_redemption_digest IS NULL OR p_redemption_digest!~'^[a-f0-9]{64}$'
     OR saas.quick_checkout_uuid_is_valid(p_redemption_id) IS DISTINCT FROM TRUE
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE
     OR saas.quick_links_authority_time_is_valid(p_expires_at) IS DISTINCT FROM TRUE
     OR p_expires_at<=p_now OR p_expires_at>p_now+interval '15 minutes' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT requested_domain.store_id,primary_domain.hostname INTO resolved_store_id,canonical_hostname
  FROM saas.store_domains AS requested_domain
  JOIN saas.store_domains AS primary_domain ON primary_domain.store_id=requested_domain.store_id
    AND primary_domain.status='active' AND primary_domain.is_primary AND primary_domain.verified_at<=p_now
  JOIN saas.stores AS store ON store.id=requested_domain.store_id AND store.status='active'
  WHERE requested_domain.hostname=p_hostname AND requested_domain.status='active'
    AND requested_domain.verified_at<=p_now;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_hostname<>canonical_hostname THEN
    RETURN QUERY SELECT 'canonicalize'::text,pg_catalog.jsonb_build_object('canonicalHostname',canonical_hostname);
    RETURN;
  END IF;
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link
  WHERE link.store_id=resolved_store_id AND link.token_digest=p_token_digest FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores AS store
  JOIN saas.store_domains AS requested_domain ON requested_domain.store_id=store.id
  JOIN saas.store_domains AS primary_domain ON primary_domain.store_id=store.id
  WHERE store.id=resolved_store_id AND store.status='active'
    AND requested_domain.hostname=p_hostname AND requested_domain.status='active'
    AND requested_domain.verified_at<=p_now
    AND primary_domain.hostname=canonical_hostname AND primary_domain.status='active'
    AND primary_domain.is_primary AND primary_domain.verified_at<=p_now
  FOR SHARE OF store,requested_domain,primary_domain;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  IF p_now<current_link.updated_at THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF current_link.version=9007199254740991 THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF current_link.currency<>'TRY' OR current_link.status NOT IN ('active','opened')
     OR current_link.expires_at<=p_now OR p_expires_at>current_link.expires_at THEN
    RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN;
  END IF;
  BEGIN
    INSERT INTO saas.quick_order_redemption_sessions(
      id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at
    ) VALUES(p_redemption_id,current_link.store_id,current_link.id,p_redemption_digest,p_expires_at,1,p_now,p_now);
    IF current_link.status='active' THEN
      UPDATE saas.quick_order_links SET status='opened',opened_at=p_now,version=version+1,updated_at=p_now
      WHERE store_id=current_link.store_id AND id=current_link.id;
    END IF;
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END;
  projection:=pg_catalog.jsonb_build_object(
    'canonicalHostname',canonical_hostname,'redemptionExpiresAt',saas.quick_links_json_timestamp(p_expires_at),
    'quote',saas.quick_checkout_public_quote(current_link.store_id,current_link.id)
  );
  RETURN QUERY SELECT 'claimed'::text,projection;
END
$function$;

ALTER FUNCTION saas.quick_links_claim_redemption(text,text,uuid,text,timestamptz,timestamptz) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.quick_links_claim_redemption(text,text,uuid,text,timestamptz,timestamptz) FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.quick_links_claim_redemption(text,text,uuid,text,timestamptz,timestamptz) TO celebix_saas_workflow;
COMMIT;
