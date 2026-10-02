-- Bind an existing customer's phone only after proving both account and OTP ownership.
-- The original verifier remains unchanged for ordinary sign-in and registration.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE source record;
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_accounts') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_account_sessions') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_login_challenges') IS NULL
    OR pg_catalog.to_regclass('saas.customers') IS NULL
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace='saas'::regnamespace
      AND proname='public_account_auth_verify_phone_v2')
  THEN RAISE EXCEPTION 'STOREFRONT_PHONE_BINDING_SOURCE_INVALID'; END IF;
  FOR source IN SELECT * FROM (VALUES
    ('saas.public_account_auth_verify_phone(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text)',
      'b0a88aa6ef832bb0213bcdaf6494a2ea65106876ab358bbe1908587c99848338',
      '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}'),
    ('saas.storefront_identity_session_context(text,timestamptz,jsonb,boolean)',
      '112d28a3cdb6ea51eed19b36327307383483658cbd355a144bec76229e4f5c3f',
      '{celebix_saas_owner=X/celebix_saas_owner}')
  ) AS reviewed(signature,body_hash,acl) LOOP
    IF pg_catalog.to_regprocedure(source.signature) IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid=pg_catalog.to_regprocedure(source.signature)
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          pg_catalog.pg_get_functiondef(procedure.oid),'UTF8')),'hex')=source.body_hash
        AND procedure.proowner='celebix_saas_owner'::regrole
        AND procedure.proacl::text=source.acl AND procedure.prosecdef
        AND procedure.provolatile='v'
        AND procedure.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
    ) THEN RAISE EXCEPTION 'STOREFRONT_PHONE_BINDING_PREDECESSOR_INVALID'; END IF;
  END LOOP;
END $preflight$;

CREATE FUNCTION saas.public_account_auth_verify_phone_v2(
  p_hostname text,p_now timestamptz,p_challenge_id uuid,p_phone_digest text,p_code_digest text,p_phone text,
  p_first_name text,p_last_name text,p_customer_id uuid,p_account_id uuid,p_session_id uuid,p_session_key_id text,
  p_session_digest text,p_csrf_digest text,p_device_label text,p_user_agent_digest text,p_correlation_id text,
  p_credentials jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE
  selected_store uuid;
  context record;
  selected_challenge saas.storefront_login_challenges%ROWTYPE;
  selected_account saas.storefront_accounts%ROWTYPE;
  selected_customer saas.customers%ROWTYPE;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR saas.storefront_credential_candidates_valid(p_credentials,true) IS DISTINCT FROM TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF pg_catalog.jsonb_array_length(p_credentials)=0 THEN
    RETURN QUERY SELECT * FROM saas.public_account_auth_verify_phone(
      p_hostname,p_now,p_challenge_id,p_phone_digest,p_code_digest,p_phone,p_first_name,p_last_name,
      p_customer_id,p_account_id,p_session_id,p_session_key_id,p_session_digest,p_csrf_digest,
      p_device_label,p_user_agent_digest,p_correlation_id);
    RETURN;
  END IF;
  IF (p_challenge_id IS NOT NULL AND p_customer_id IS NOT NULL AND p_account_id IS NOT NULL AND p_session_id IS NOT NULL
    AND p_phone_digest~'^[a-f0-9]{64}$' AND p_code_digest~'^[a-f0-9]{64}$' AND p_phone~'^\+[1-9][0-9]{7,14}$'
    AND ((p_first_name IS NULL AND p_last_name IS NULL) OR (p_first_name IS NOT NULL AND p_last_name IS NOT NULL
      AND p_first_name=pg_catalog.btrim(p_first_name) AND pg_catalog.char_length(p_first_name) BETWEEN 1 AND 100 AND p_first_name!~'[[:cntrl:]]'
      AND p_last_name=pg_catalog.btrim(p_last_name) AND pg_catalog.char_length(p_last_name) BETWEEN 1 AND 100 AND p_last_name!~'[[:cntrl:]]'))
    AND p_session_key_id~'^[a-z][a-z0-9_-]{2,31}$' AND p_session_digest~'^[a-f0-9]{64}$' AND p_csrf_digest~'^[a-f0-9]{64}$'
    AND p_device_label=pg_catalog.btrim(p_device_label) AND pg_catalog.char_length(p_device_label) BETWEEN 1 AND 100 AND p_device_label!~'[[:cntrl:]]'
    AND p_user_agent_digest~'^[a-f0-9]{64}$' AND p_correlation_id~'^[A-Za-z0-9_-]{8,80}$') IS NOT TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN; END IF;
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false);
  IF NOT FOUND OR context.store_id<>selected_store OR context.session_kind<>'full'
    OR context.customer_id IS NULL
  THEN RETURN QUERY SELECT 'identity_conflict',NULL::jsonb; RETURN; END IF;

  -- Keep the verifier's lock order, code counter and single-use challenge rules.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.phone:'||selected_store::text||':'||p_phone_digest,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.phone-account:'||selected_store::text||':'||p_phone,0));
  SELECT * INTO selected_challenge FROM saas.storefront_login_challenges
    WHERE store_id=selected_store AND id=p_challenge_id AND channel='whatsapp' AND phone_digest=p_phone_digest FOR UPDATE;
  IF NOT FOUND OR selected_challenge.delivery_status<>'accepted' OR selected_challenge.consumed_at IS NOT NULL
    OR selected_challenge.locked_at IS NOT NULL OR selected_challenge.expires_at<=p_now OR selected_challenge.created_at>p_now
  THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN; END IF;
  IF selected_challenge.code_digest<>p_code_digest THEN
    UPDATE saas.storefront_login_challenges SET attempt_count=attempt_count+1,
      locked_at=CASE WHEN attempt_count+1>=6 THEN p_now ELSE NULL END WHERE store_id=selected_store AND id=p_challenge_id;
    INSERT INTO saas.storefront_identity_audit(store_id,challenge_id,event_code,correlation_id,created_at)
      VALUES(selected_store,p_challenge_id,'challenge_rejected',p_correlation_id,p_now);
    RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN;
  END IF;

  -- A current full email account session and its existing customer link prove
  -- account ownership. A matching merchant phone alone grants no such access.
  SELECT * INTO selected_account FROM saas.storefront_accounts
    WHERE store_id=selected_store AND id=context.account_id FOR UPDATE;
  IF NOT FOUND OR selected_account.status<>'active' OR selected_account.email_normalized IS NULL
    OR selected_account.customer_id IS DISTINCT FROM context.customer_id
    OR (selected_account.phone_verified_at IS NOT NULL AND selected_account.phone_normalized IS DISTINCT FROM p_phone)
  THEN RETURN QUERY SELECT 'identity_conflict',NULL::jsonb; RETURN; END IF;
  PERFORM session.id FROM saas.storefront_account_sessions session
    WHERE session.store_id=selected_store AND session.id=context.session_id
      AND session.account_id=selected_account.id AND session.session_kind='full'
      AND session.revoked_at IS NULL AND session.created_at<=p_now
      AND session.idle_expires_at>p_now AND session.absolute_expires_at>p_now
      AND EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_credentials) candidate
        WHERE candidate->>'keyId'=session.key_id AND candidate->>'digest'=session.credential_digest)
    FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'identity_conflict',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_customer FROM saas.customers
    WHERE store_id=selected_store AND id=selected_account.customer_id FOR UPDATE;
  IF NOT FOUND OR selected_customer.status<>'active' OR selected_customer.archived_at IS NOT NULL
    OR selected_customer.email IS DISTINCT FROM selected_account.email_normalized
    OR selected_customer.phone IS DISTINCT FROM p_phone
    OR EXISTS(SELECT 1 FROM saas.storefront_accounts account
      WHERE account.store_id=selected_store AND account.id<>selected_account.id
        AND account.phone_normalized=p_phone AND account.phone_verified_at IS NOT NULL)
  THEN RETURN QUERY SELECT 'identity_conflict',NULL::jsonb; RETURN; END IF;

  UPDATE saas.storefront_accounts SET phone_normalized=p_phone,
    phone_verified_at=COALESCE(phone_verified_at,p_now),
    last_login_at=p_now,updated_at=p_now,version=version+1
    WHERE store_id=selected_store AND id=selected_account.id;
  -- Bind to the existing account; never copy or claim historical order links.
  INSERT INTO saas.storefront_account_sessions(id,store_id,account_id,session_kind,key_id,credential_digest,csrf_digest,device_label,user_agent_digest,created_at,last_seen_at,idle_expires_at,absolute_expires_at)
    VALUES(p_session_id,selected_store,selected_account.id,'full',p_session_key_id,p_session_digest,p_csrf_digest,p_device_label,p_user_agent_digest,
      p_now,p_now,p_now+INTERVAL '7 days',p_now+INTERVAL '30 days');
  UPDATE saas.storefront_login_challenges SET consumed_at=p_now WHERE store_id=selected_store AND id=p_challenge_id;
  INSERT INTO saas.storefront_identity_audit(store_id,account_id,challenge_id,session_id,event_code,correlation_id,created_at)
    VALUES(selected_store,selected_account.id,p_challenge_id,p_session_id,'challenge_consumed',p_correlation_id,p_now);
  INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at)
    VALUES(selected_store,selected_account.id,p_session_id,'account_login',p_correlation_id,p_now);
  RETURN QUERY SELECT 'authenticated',pg_catalog.jsonb_build_object('profileRequired',false);
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'identity_conflict',NULL::jsonb;
END $fn$;

REVOKE ALL ON FUNCTION saas.public_account_auth_verify_phone_v2(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,jsonb)
  FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
    celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_account_auth_verify_phone_v2(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text,jsonb)
  TO celebix_saas_host_resolver;

COMMIT;
