BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.storefront_login_challenges
  ADD COLUMN ticket_key_id text,
  ADD COLUMN ticket_digest char(64),
  ADD CONSTRAINT storefront_login_challenges_ticket_pair_ck CHECK(
    (ticket_key_id IS NULL AND ticket_digest IS NULL) OR
    (ticket_key_id~'^[a-z][a-z0-9_-]{2,31}$' AND ticket_digest~'^[a-f0-9]{64}$')
  );

CREATE FUNCTION saas.public_account_auth_start_v2(
  p_hostname text,p_now timestamptz,p_challenge_id uuid,p_email_digest text,p_request_digest text,
  p_code_key_id text,p_code_digest text,p_ticket_key_id text,p_ticket_digest text,
  p_expires_at timestamptz,p_outbox_id uuid,p_recipient_ciphertext text,p_brand_snapshot jsonb,p_correlation_id text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; retry_seconds integer:=60;
BEGIN
  IF p_challenge_id IS NULL OR p_outbox_id IS NULL OR p_email_digest!~'^[a-f0-9]{64}$' OR p_request_digest!~'^[a-f0-9]{64}$'
    OR p_code_key_id!~'^[a-z][a-z0-9_-]{2,31}$' OR p_code_digest!~'^[a-f0-9]{64}$'
    OR p_ticket_key_id!~'^[a-z][a-z0-9_-]{2,31}$' OR p_ticket_digest!~'^[a-f0-9]{64}$'
    OR p_expires_at<=p_now OR p_expires_at>p_now+INTERVAL '15 minutes'
    OR pg_catalog.char_length(p_recipient_ciphertext) NOT BETWEEN 20 AND 2048 OR p_recipient_ciphertext!~'^[A-Za-z0-9_.-]+$'
    OR pg_catalog.jsonb_typeof(p_brand_snapshot)<>'object' OR pg_catalog.pg_column_size(p_brand_snapshot)>8192
    OR p_correlation_id!~'^[A-Za-z0-9_-]{8,80}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.storefront_login_challenges challenge WHERE challenge.store_id=selected_store AND challenge.email_digest=p_email_digest AND challenge.created_at>p_now-INTERVAL '15 minutes')>=5
    OR (SELECT pg_catalog.count(*) FROM saas.storefront_login_challenges challenge WHERE challenge.store_id=selected_store AND challenge.request_digest=p_request_digest AND challenge.created_at>p_now-INTERVAL '15 minutes')>=10
  THEN RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('retryAfterSeconds',300); RETURN; END IF;
  INSERT INTO saas.storefront_login_challenges(
    id,store_id,email_digest,request_digest,code_key_id,code_digest,ticket_key_id,ticket_digest,
    expires_at,created_at,last_sent_at
  ) VALUES(
    p_challenge_id,selected_store,p_email_digest,p_request_digest,p_code_key_id,p_code_digest,p_ticket_key_id,p_ticket_digest,
    p_expires_at,p_now,p_now
  );
  INSERT INTO saas.storefront_identity_email_outbox(id,store_id,challenge_id,recipient_ciphertext,brand_snapshot,next_attempt_at,created_at,updated_at)
    VALUES(p_outbox_id,selected_store,p_challenge_id,p_recipient_ciphertext,p_brand_snapshot,p_now,p_now,p_now);
  INSERT INTO saas.storefront_identity_audit(store_id,challenge_id,event_code,correlation_id,created_at)
    VALUES(selected_store,p_challenge_id,'challenge_created',p_correlation_id,p_now);
  RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('retryAfterSeconds',retry_seconds);
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('retryAfterSeconds',retry_seconds);
END $f$;

CREATE FUNCTION saas.public_account_auth_verify_v2(
  p_hostname text,p_now timestamptz,p_challenge_id uuid,p_email_digest text,p_verifier_kind text,p_verifier_digest text,p_email text,
  p_account_id uuid,p_session_id uuid,p_session_key_id text,p_session_digest text,p_csrf_digest text,
  p_device_label text,p_user_agent_digest text,p_correlation_id text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_challenge saas.storefront_login_challenges%ROWTYPE;
  selected_account saas.storefront_accounts%ROWTYPE; selected_customer saas.customers%ROWTYPE;
  selected_kind text; selected_absolute timestamptz; verifier_matches boolean:=false;
BEGIN
  IF p_challenge_id IS NULL OR p_account_id IS NULL OR p_session_id IS NULL
    OR p_email_digest!~'^[a-f0-9]{64}$' OR p_verifier_kind NOT IN('ticket','code') OR p_verifier_digest!~'^[a-f0-9]{64}$'
    OR NOT saas.storefront_identity_email_valid(p_email)
    OR p_session_key_id!~'^[a-z][a-z0-9_-]{2,31}$' OR p_session_digest!~'^[a-f0-9]{64}$' OR p_csrf_digest!~'^[a-f0-9]{64}$'
    OR p_device_label<>pg_catalog.btrim(p_device_label) OR pg_catalog.char_length(p_device_label) NOT BETWEEN 1 AND 100 OR p_device_label~'[[:cntrl:]]'
    OR p_user_agent_digest!~'^[a-f0-9]{64}$' OR p_correlation_id!~'^[A-Za-z0-9_-]{8,80}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.challenge:'||p_challenge_id::text,0));
  SELECT * INTO selected_challenge FROM saas.storefront_login_challenges
    WHERE store_id=selected_store AND id=p_challenge_id FOR UPDATE;
  IF FOUND THEN
    verifier_matches:=CASE
      WHEN p_verifier_kind='ticket' THEN selected_challenge.ticket_digest IS NOT NULL AND selected_challenge.ticket_digest=p_verifier_digest
      WHEN p_verifier_kind='code' THEN selected_challenge.code_digest=p_verifier_digest
      ELSE false
    END;
  END IF;
  IF NOT FOUND OR selected_challenge.email_digest<>p_email_digest OR NOT verifier_matches
    OR selected_challenge.consumed_at IS NOT NULL OR selected_challenge.locked_at IS NOT NULL OR selected_challenge.expires_at<=p_now
  THEN
    IF FOUND AND selected_challenge.consumed_at IS NULL AND selected_challenge.locked_at IS NULL THEN
      UPDATE saas.storefront_login_challenges SET attempt_count=attempt_count+1,
        locked_at=CASE WHEN attempt_count+1>=6 THEN p_now ELSE NULL END WHERE store_id=selected_store AND id=p_challenge_id;
      INSERT INTO saas.storefront_identity_audit(store_id,challenge_id,event_code,correlation_id,created_at)
        VALUES(selected_store,p_challenge_id,'challenge_rejected',p_correlation_id,p_now);
    END IF;
    RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.storefront_login_challenges SET consumed_at=p_now WHERE store_id=selected_store AND id=p_challenge_id;

  SELECT * INTO selected_account FROM saas.storefront_accounts account
    WHERE account.store_id=selected_store AND account.email_normalized=p_email FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO selected_customer FROM saas.customers customer WHERE customer.store_id=selected_store AND customer.email=p_email FOR UPDATE;
    INSERT INTO saas.storefront_accounts(id,store_id,customer_id,email,email_normalized,status,verified_at,last_login_at,created_at,updated_at)
      VALUES(p_account_id,selected_store,CASE WHEN FOUND THEN selected_customer.id ELSE NULL END,p_email,p_email,
        CASE WHEN FOUND THEN 'active' ELSE 'pending_profile' END,p_now,p_now,p_now,p_now)
      RETURNING * INTO selected_account;
    IF selected_customer.id IS NOT NULL AND selected_customer.status='archived' THEN
      UPDATE saas.customers SET status='active',archived_at=NULL,version=version+1,updated_at=p_now
        WHERE store_id=selected_store AND id=selected_customer.id;
    END IF;
    INSERT INTO saas.storefront_identity_audit(store_id,account_id,challenge_id,event_code,correlation_id,created_at)
      VALUES(selected_store,selected_account.id,p_challenge_id,'account_created',p_correlation_id,p_now);
  ELSE
    IF selected_account.status='suspended' THEN RETURN QUERY SELECT 'account_suspended',NULL::jsonb; RETURN; END IF;
    UPDATE saas.storefront_accounts SET last_login_at=p_now,updated_at=p_now,version=version+1
      WHERE store_id=selected_store AND id=selected_account.id RETURNING * INTO selected_account;
  END IF;

  IF selected_account.customer_id IS NOT NULL THEN
    INSERT INTO saas.storefront_account_order_links(store_id,account_id,order_id,claim_source,claimed_at)
      SELECT orders.store_id,selected_account.id,orders.id,'verified_email',p_now FROM saas.orders orders
      JOIN saas.customers customer ON customer.store_id=orders.store_id AND customer.id=orders.customer_id
      WHERE orders.store_id=selected_store AND orders.customer_id=selected_account.customer_id AND customer.email=selected_account.email_normalized
      ON CONFLICT(store_id,order_id) DO NOTHING;
  END IF;
  selected_kind:=CASE WHEN selected_account.status='active' THEN 'full' ELSE 'registration' END;
  selected_absolute:=CASE WHEN selected_kind='full' THEN p_now+INTERVAL '30 days' ELSE p_now+INTERVAL '15 minutes' END;
  INSERT INTO saas.storefront_account_sessions(
    id,store_id,account_id,session_kind,key_id,credential_digest,csrf_digest,device_label,user_agent_digest,
    created_at,last_seen_at,idle_expires_at,absolute_expires_at
  ) VALUES(
    p_session_id,selected_store,selected_account.id,selected_kind,p_session_key_id,p_session_digest,p_csrf_digest,p_device_label,p_user_agent_digest,
    p_now,p_now,CASE WHEN selected_kind='full' THEN p_now+INTERVAL '7 days' ELSE selected_absolute END,selected_absolute
  );
  INSERT INTO saas.storefront_identity_audit(store_id,account_id,challenge_id,session_id,event_code,correlation_id,created_at)
    VALUES(selected_store,selected_account.id,p_challenge_id,p_session_id,'challenge_consumed',p_correlation_id,p_now);
  INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at)
    VALUES(selected_store,selected_account.id,p_session_id,'account_login',p_correlation_id,p_now);
  IF selected_kind='full' THEN RETURN QUERY SELECT 'authenticated',pg_catalog.jsonb_build_object('profileRequired',false);
  ELSE RETURN QUERY SELECT 'profile_required',pg_catalog.jsonb_build_object('profileRequired',true); END IF;
END $f$;

REVOKE ALL ON FUNCTION
  saas.public_account_auth_start_v2(text,timestamptz,uuid,text,text,text,text,text,text,timestamptz,uuid,text,jsonb,text),
  saas.public_account_auth_verify_v2(text,timestamptz,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION saas.public_account_auth_start_v2(text,timestamptz,uuid,text,text,text,text,text,text,timestamptz,uuid,text,jsonb,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_auth_verify_v2(text,timestamptz,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text) TO celebix_saas_host_resolver;

COMMIT;
