-- Verified phone identity is separate from mutable customer contact information.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $block$
BEGIN
  IF pg_catalog.to_regprocedure('saas.public_account_auth_start_v2(text,timestamptz,uuid,text,text,text,text,text,text,timestamptz,uuid,text,jsonb,text)') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_accounts') IS NULL
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='saas.storefront_accounts'::regclass AND attname='phone_normalized' AND NOT attisdropped)
  THEN RAISE EXCEPTION 'STOREFRONT_WHATSAPP_IDENTITY_SOURCE_INVALID'; END IF;
END $block$;

ALTER TABLE saas.storefront_accounts
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN email_normalized DROP NOT NULL,
  ADD COLUMN phone_normalized text,
  ADD COLUMN phone_verified_at timestamptz,
  ADD CONSTRAINT storefront_accounts_email_pair_ck CHECK((email IS NULL)=(email_normalized IS NULL)),
  ADD CONSTRAINT storefront_accounts_phone_pair_ck CHECK(
    (phone_normalized IS NULL AND phone_verified_at IS NULL) OR
    (phone_normalized IS NOT NULL AND phone_normalized~'^\+[1-9][0-9]{7,14}$' AND phone_verified_at IS NOT NULL AND phone_verified_at>=created_at)
  ),
  ADD CONSTRAINT storefront_accounts_identity_ck CHECK(email_normalized IS NOT NULL OR phone_verified_at IS NOT NULL),
  ADD CONSTRAINT storefront_accounts_store_phone_key UNIQUE(store_id,phone_normalized);

ALTER TABLE saas.storefront_login_challenges
  ALTER COLUMN email_digest DROP NOT NULL,
  ADD COLUMN channel text NOT NULL DEFAULT 'email',
  ADD COLUMN phone_digest char(64),
  ADD COLUMN delivery_status text NOT NULL DEFAULT 'accepted',
  ADD CONSTRAINT storefront_login_challenges_channel_ck CHECK(channel IN('email','whatsapp')),
  ADD CONSTRAINT storefront_login_challenges_delivery_ck CHECK(delivery_status IN('pending','accepted','failed')),
  ADD CONSTRAINT storefront_login_challenges_recipient_ck CHECK(
    (channel='email' AND email_digest IS NOT NULL AND phone_digest IS NULL AND delivery_status='accepted') OR
    (channel='whatsapp' AND email_digest IS NULL AND phone_digest IS NOT NULL AND phone_digest~'^[a-f0-9]{64}$' AND ticket_key_id IS NULL AND ticket_digest IS NULL)
  );
CREATE INDEX storefront_login_challenges_phone_rate_idx
  ON saas.storefront_login_challenges(store_id,phone_digest,created_at DESC,id) WHERE channel='whatsapp';

CREATE FUNCTION saas.public_account_auth_start_phone(
  p_hostname text,p_now timestamptz,p_challenge_id uuid,p_phone_digest text,p_request_digest text,
  p_code_key_id text,p_code_digest text,p_expires_at timestamptz,p_correlation_id text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; last_send timestamptz; retry_seconds integer;
BEGIN
  IF (p_now IS NOT NULL AND p_challenge_id IS NOT NULL AND p_phone_digest~'^[a-f0-9]{64}$'
    AND p_request_digest~'^[a-f0-9]{64}$' AND p_code_key_id~'^[a-z][a-z0-9_-]{2,31}$'
    AND p_code_digest~'^[a-f0-9]{64}$' AND p_expires_at>p_now AND p_expires_at<=p_now+INTERVAL '15 minutes'
    AND p_correlation_id~'^[A-Za-z0-9_-]{8,80}$') IS NOT TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  -- A fixed lock order serializes both request and recipient budgets across aliases.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.request:'||selected_store::text||':'||p_request_digest,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.phone:'||selected_store::text||':'||p_phone_digest,0));
  SELECT pg_catalog.max(created_at) INTO last_send FROM saas.storefront_login_challenges
    WHERE store_id=selected_store AND channel='whatsapp' AND phone_digest=p_phone_digest;
  IF last_send>p_now-INTERVAL '60 seconds' THEN
    retry_seconds:=GREATEST(1,pg_catalog.ceil(EXTRACT(epoch FROM last_send+INTERVAL '60 seconds'-p_now))::integer);
    RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('retryAfterSeconds',retry_seconds,'deliveryRequired',false); RETURN;
  END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.storefront_login_challenges WHERE store_id=selected_store AND channel='whatsapp' AND phone_digest=p_phone_digest AND created_at>p_now-INTERVAL '15 minutes')>=5
    OR (SELECT pg_catalog.count(*) FROM saas.storefront_login_challenges WHERE store_id=selected_store AND request_digest=p_request_digest AND created_at>p_now-INTERVAL '15 minutes')>=10
  THEN RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('retryAfterSeconds',300,'deliveryRequired',false); RETURN; END IF;
  INSERT INTO saas.storefront_login_challenges(id,store_id,channel,phone_digest,request_digest,code_key_id,code_digest,delivery_status,expires_at,created_at,last_sent_at)
    VALUES(p_challenge_id,selected_store,'whatsapp',p_phone_digest,p_request_digest,p_code_key_id,p_code_digest,'pending',p_expires_at,p_now,p_now);
  INSERT INTO saas.storefront_identity_audit(store_id,challenge_id,event_code,correlation_id,created_at)
    VALUES(selected_store,p_challenge_id,'challenge_created',p_correlation_id,p_now);
  RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('retryAfterSeconds',60,'deliveryRequired',true);
EXCEPTION WHEN unique_violation THEN
  RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('retryAfterSeconds',60,'deliveryRequired',false);
END $f$;

CREATE FUNCTION saas.public_account_auth_phone_delivery(
  p_hostname text,p_now timestamptz,p_challenge_id uuid,p_phone_digest text,p_accepted boolean
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_challenge saas.storefront_login_challenges%ROWTYPE;
BEGIN
  IF (p_now IS NOT NULL AND p_challenge_id IS NOT NULL AND p_phone_digest~'^[a-f0-9]{64}$' AND p_accepted IS NOT NULL) IS NOT TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.phone:'||selected_store::text||':'||p_phone_digest,0));
  SELECT * INTO selected_challenge FROM saas.storefront_login_challenges
    WHERE store_id=selected_store AND id=p_challenge_id AND channel='whatsapp' AND phone_digest=p_phone_digest FOR UPDATE;
  IF NOT FOUND OR selected_challenge.delivery_status='failed' OR selected_challenge.expires_at<=p_now
    OR selected_challenge.created_at>p_now OR selected_challenge.consumed_at IS NOT NULL OR selected_challenge.locked_at IS NOT NULL
  THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN; END IF;
  IF selected_challenge.delivery_status='accepted' THEN
    IF p_accepted THEN RETURN QUERY SELECT 'committed','{}'::jsonb;
    ELSE RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; END IF; RETURN;
  END IF;
  IF p_accepted AND EXISTS(SELECT 1 FROM saas.storefront_login_challenges WHERE store_id=selected_store AND channel='whatsapp' AND phone_digest=p_phone_digest AND delivery_status='accepted' AND created_at>selected_challenge.created_at)
  THEN
    UPDATE saas.storefront_login_challenges SET delivery_status='failed' WHERE store_id=selected_store AND id=p_challenge_id;
    RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.storefront_login_challenges SET delivery_status=CASE WHEN p_accepted THEN 'accepted' ELSE 'failed' END
    WHERE store_id=selected_store AND id=p_challenge_id;
  IF p_accepted THEN
    -- Only an accepted resend supersedes the previous usable code.
    UPDATE saas.storefront_login_challenges SET locked_at=p_now
      WHERE store_id=selected_store AND channel='whatsapp' AND phone_digest=p_phone_digest
        AND id<>p_challenge_id AND delivery_status='accepted' AND created_at<=selected_challenge.created_at
        AND consumed_at IS NULL AND locked_at IS NULL;
  END IF;
  RETURN QUERY SELECT 'committed','{}'::jsonb;
END $f$;

CREATE FUNCTION saas.public_account_auth_verify_phone(
  p_hostname text,p_now timestamptz,p_challenge_id uuid,p_phone_digest text,p_code_digest text,p_phone text,
  p_first_name text,p_last_name text,p_customer_id uuid,p_account_id uuid,p_session_id uuid,p_session_key_id text,
  p_session_digest text,p_csrf_digest text,p_device_label text,p_user_agent_digest text,p_correlation_id text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_challenge saas.storefront_login_challenges%ROWTYPE;
  selected_account saas.storefront_accounts%ROWTYPE; selected_kind text; selected_absolute timestamptz;
BEGIN
  IF (p_now IS NOT NULL AND p_challenge_id IS NOT NULL AND p_customer_id IS NOT NULL AND p_account_id IS NOT NULL AND p_session_id IS NOT NULL
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
  SELECT * INTO selected_account FROM saas.storefront_accounts
    WHERE store_id=selected_store AND phone_normalized=p_phone AND phone_verified_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN
    -- A merchant contact record is never proof of account ownership.
    IF EXISTS(SELECT 1 FROM saas.customers WHERE store_id=selected_store AND phone=p_phone)
    THEN RETURN QUERY SELECT 'identity_conflict',NULL::jsonb; RETURN; END IF;
    IF p_first_name IS NOT NULL THEN
      INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,created_at,updated_at)
        VALUES(p_customer_id,selected_store,'active',p_first_name,p_last_name,NULL,p_phone,p_now,p_now);
    END IF;
    INSERT INTO saas.storefront_accounts(id,store_id,customer_id,email,email_normalized,phone_normalized,phone_verified_at,status,verified_at,last_login_at,created_at,updated_at)
      VALUES(p_account_id,selected_store,CASE WHEN p_first_name IS NOT NULL THEN p_customer_id ELSE NULL END,NULL,NULL,p_phone,p_now,
        CASE WHEN p_first_name IS NOT NULL THEN 'active' ELSE 'pending_profile' END,p_now,p_now,p_now,p_now)
      RETURNING * INTO selected_account;
    INSERT INTO saas.storefront_identity_audit(store_id,account_id,challenge_id,event_code,correlation_id,created_at)
      VALUES(selected_store,selected_account.id,p_challenge_id,'account_created',p_correlation_id,p_now);
  ELSE
    IF selected_account.status='suspended' THEN RETURN QUERY SELECT 'account_suspended',NULL::jsonb; RETURN; END IF;
    UPDATE saas.storefront_accounts SET last_login_at=p_now,updated_at=p_now,version=version+1
      WHERE store_id=selected_store AND id=selected_account.id RETURNING * INTO selected_account;
  END IF;
  -- Phone verification grants no historical order links.
  selected_kind:=CASE WHEN selected_account.status='active' THEN 'full' ELSE 'registration' END;
  selected_absolute:=CASE WHEN selected_kind='full' THEN p_now+INTERVAL '30 days' ELSE p_now+INTERVAL '15 minutes' END;
  INSERT INTO saas.storefront_account_sessions(id,store_id,account_id,session_kind,key_id,credential_digest,csrf_digest,device_label,user_agent_digest,created_at,last_seen_at,idle_expires_at,absolute_expires_at)
    VALUES(p_session_id,selected_store,selected_account.id,selected_kind,p_session_key_id,p_session_digest,p_csrf_digest,p_device_label,p_user_agent_digest,
      p_now,p_now,CASE WHEN selected_kind='full' THEN p_now+INTERVAL '7 days' ELSE selected_absolute END,selected_absolute);
  UPDATE saas.storefront_login_challenges SET consumed_at=p_now WHERE store_id=selected_store AND id=p_challenge_id;
  INSERT INTO saas.storefront_identity_audit(store_id,account_id,challenge_id,session_id,event_code,correlation_id,created_at)
    VALUES(selected_store,selected_account.id,p_challenge_id,p_session_id,'challenge_consumed',p_correlation_id,p_now);
  INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at)
    VALUES(selected_store,selected_account.id,p_session_id,'account_login',p_correlation_id,p_now);
  RETURN QUERY SELECT CASE WHEN selected_kind='full' THEN 'authenticated' ELSE 'profile_required' END,
    pg_catalog.jsonb_build_object('profileRequired',selected_kind<>'full');
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'identity_conflict',NULL::jsonb;
END $f$;

CREATE FUNCTION saas.public_account_auth_start_v3(
  p_hostname text,p_now timestamptz,p_challenge_id uuid,p_email_digest text,p_request_digest text,
  p_code_key_id text,p_code_digest text,p_ticket_key_id text,p_ticket_digest text,
  p_expires_at timestamptz,p_outbox_id uuid,p_recipient_ciphertext text,p_brand_snapshot jsonb,p_correlation_id text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; last_send timestamptz; legacy_result record;
BEGIN
  IF (p_now IS NOT NULL AND p_challenge_id IS NOT NULL AND p_outbox_id IS NOT NULL AND p_email_digest~'^[a-f0-9]{64}$'
    AND p_request_digest~'^[a-f0-9]{64}$' AND p_code_key_id~'^[a-z][a-z0-9_-]{2,31}$' AND p_code_digest~'^[a-f0-9]{64}$'
    AND p_ticket_key_id~'^[a-z][a-z0-9_-]{2,31}$' AND p_ticket_digest~'^[a-f0-9]{64}$'
    AND p_expires_at>p_now AND p_expires_at<=p_now+INTERVAL '15 minutes'
    AND pg_catalog.char_length(p_recipient_ciphertext) BETWEEN 20 AND 2048 AND p_recipient_ciphertext~'^[A-Za-z0-9_.-]+$'
    AND pg_catalog.jsonb_typeof(p_brand_snapshot)='object' AND pg_catalog.pg_column_size(p_brand_snapshot)<=8192
    AND p_correlation_id~'^[A-Za-z0-9_-]{8,80}$') IS NOT TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.request:'||selected_store::text||':'||p_request_digest,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.email:'||selected_store::text||':'||p_email_digest,0));
  SELECT pg_catalog.max(created_at) INTO last_send FROM saas.storefront_login_challenges WHERE store_id=selected_store AND channel='email' AND email_digest=p_email_digest;
  IF last_send>p_now-INTERVAL '60 seconds' THEN
    RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('retryAfterSeconds',GREATEST(1,pg_catalog.ceil(EXTRACT(epoch FROM last_send+INTERVAL '60 seconds'-p_now))::integer),'deliveryRequired',false); RETURN;
  END IF;
  SELECT * INTO legacy_result FROM saas.public_account_auth_start_v2(p_hostname,p_now,p_challenge_id,p_email_digest,p_request_digest,p_code_key_id,p_code_digest,p_ticket_key_id,p_ticket_digest,p_expires_at,p_outbox_id,p_recipient_ciphertext,p_brand_snapshot,p_correlation_id);
  RETURN QUERY SELECT legacy_result.outcome,CASE WHEN legacy_result.outcome='accepted' THEN legacy_result.result_payload||pg_catalog.jsonb_build_object('deliveryRequired',
    EXISTS(SELECT 1 FROM saas.storefront_login_challenges WHERE store_id=selected_store AND id=p_challenge_id AND created_at=p_now)
    AND EXISTS(SELECT 1 FROM saas.storefront_identity_email_outbox WHERE store_id=selected_store AND id=p_outbox_id AND challenge_id=p_challenge_id AND created_at=p_now)) ELSE legacy_result.result_payload END;
END $f$;

ALTER FUNCTION saas.storefront_identity_snapshot(uuid,uuid,uuid) RENAME TO storefront_identity_snapshot_pre_whatsapp;
CREATE FUNCTION saas.storefront_identity_snapshot(p_store_id uuid,p_account_id uuid,p_current_session uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT pg_catalog.jsonb_set(projection.value,'{profile}',(projection.value->'profile')||pg_catalog.jsonb_build_object('email',account.email_normalized)
    ||CASE WHEN account.phone_verified_at IS NOT NULL THEN pg_catalog.jsonb_build_object('phone',account.phone_normalized,'phoneVerified',true) ELSE '{}'::jsonb END)
  FROM saas.storefront_accounts account
  CROSS JOIN LATERAL (SELECT saas.storefront_identity_snapshot_pre_whatsapp(p_store_id,p_account_id,p_current_session) AS value) projection
  WHERE account.store_id=p_store_id AND account.id=p_account_id AND projection.value IS NOT NULL
$f$;

ALTER FUNCTION saas.public_account_profile_update(text,timestamptz,jsonb,uuid,text,text,text,text,bigint,text) RENAME TO public_account_profile_update_pre_whatsapp;
CREATE FUNCTION saas.public_account_profile_update(p_hostname text,p_now timestamptz,p_credentials jsonb,p_operation_id uuid,p_fingerprint text,p_first_name text,p_last_name text,p_phone text,p_expected_version bigint,p_correlation_id text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record; account saas.storefront_accounts%ROWTYPE; existing saas.storefront_identity_operations%ROWTYPE;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false);
  IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.operation:'||p_operation_id::text,0));
  SELECT * INTO existing FROM saas.storefront_identity_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id=context.store_id AND existing.account_id=context.account_id AND existing.operation_kind='profile_update' AND existing.payload_fingerprint=p_fingerprint
    THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN;
  END IF;
  SELECT * INTO account FROM saas.storefront_accounts WHERE store_id=context.store_id AND id=context.account_id FOR UPDATE;
  IF account.phone_verified_at IS NOT NULL THEN
    IF p_phone IS NOT NULL AND p_phone<>account.phone_normalized THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    p_phone:=account.phone_normalized;
  END IF;
  RETURN QUERY SELECT * FROM saas.public_account_profile_update_pre_whatsapp(p_hostname,p_now,p_credentials,p_operation_id,p_fingerprint,p_first_name,p_last_name,p_phone,p_expected_version,p_correlation_id);
END $f$;

ALTER FUNCTION saas.public_account_profile_complete(text,timestamptz,jsonb,uuid,text,uuid,text,text,text,uuid,text,text,text,text,text,text) RENAME TO public_account_profile_complete_pre_whatsapp;
CREATE FUNCTION saas.public_account_profile_complete(p_hostname text,p_now timestamptz,p_credentials jsonb,p_operation_id uuid,p_fingerprint text,p_customer_id uuid,p_first_name text,p_last_name text,p_phone text,p_full_session_id uuid,p_key_id text,p_digest text,p_csrf_digest text,p_device_label text,p_user_agent_digest text,p_correlation_id text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record; account saas.storefront_accounts%ROWTYPE; existing saas.storefront_identity_operations%ROWTYPE;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,true);
  IF NOT FOUND OR context.session_kind<>'registration' THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.operation:'||p_operation_id::text,0));
  SELECT * INTO existing FROM saas.storefront_identity_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id=context.store_id AND existing.account_id=context.account_id AND existing.operation_kind='profile_complete' AND existing.payload_fingerprint=p_fingerprint
    THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN;
  END IF;
  SELECT * INTO account FROM saas.storefront_accounts WHERE store_id=context.store_id AND id=context.account_id FOR UPDATE;
  IF account.phone_verified_at IS NOT NULL THEN
    IF p_phone IS NOT NULL AND p_phone<>account.phone_normalized THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    p_phone:=account.phone_normalized;
  END IF;
  RETURN QUERY SELECT * FROM saas.public_account_profile_complete_pre_whatsapp(p_hostname,p_now,p_credentials,p_operation_id,p_fingerprint,p_customer_id,p_first_name,p_last_name,p_phone,p_full_session_id,p_key_id,p_digest,p_csrf_digest,p_device_label,p_user_agent_digest,p_correlation_id);
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'identity_conflict',NULL::jsonb;
END $f$;

-- Restrict both deployed email verifiers to email challenges before delegating.
ALTER FUNCTION saas.public_account_auth_verify_v2(text,timestamptz,uuid,text,text,text,text,uuid,uuid,text,text,text,text,text,text) RENAME TO public_account_auth_verify_v2_pre_whatsapp;
CREATE FUNCTION saas.public_account_auth_verify_v2(p_hostname text,p_now timestamptz,p_challenge_id uuid,p_email_digest text,p_verifier_kind text,p_verifier_digest text,p_email text,p_account_id uuid,p_session_id uuid,p_session_key_id text,p_session_digest text,p_csrf_digest text,p_device_label text,p_user_agent_digest text,p_correlation_id text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM saas.storefront_login_challenges WHERE id=p_challenge_id AND store_id=saas.storefront_public_store(p_hostname,p_now) AND channel='email')
  THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT * FROM saas.public_account_auth_verify_v2_pre_whatsapp(p_hostname,p_now,p_challenge_id,p_email_digest,p_verifier_kind,p_verifier_digest,p_email,p_account_id,p_session_id,p_session_key_id,p_session_digest,p_csrf_digest,p_device_label,p_user_agent_digest,p_correlation_id);
END $f$;
ALTER FUNCTION saas.public_account_auth_verify(text,timestamptz,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text) RENAME TO public_account_auth_verify_pre_whatsapp;
CREATE FUNCTION saas.public_account_auth_verify(p_hostname text,p_now timestamptz,p_challenge_id uuid,p_email_digest text,p_code_digest text,p_email text,p_account_id uuid,p_session_id uuid,p_session_key_id text,p_session_digest text,p_csrf_digest text,p_device_label text,p_user_agent_digest text,p_correlation_id text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM saas.storefront_login_challenges WHERE id=p_challenge_id AND store_id=saas.storefront_public_store(p_hostname,p_now) AND channel='email')
  THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT * FROM saas.public_account_auth_verify_pre_whatsapp(p_hostname,p_now,p_challenge_id,p_email_digest,p_code_digest,p_email,p_account_id,p_session_id,p_session_key_id,p_session_digest,p_csrf_digest,p_device_label,p_user_agent_digest,p_correlation_id);
END $f$;

DO $permissions$
DECLARE function_name text; function_signature regprocedure;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'public_account_auth_start_phone','public_account_auth_phone_delivery','public_account_auth_verify_phone','public_account_auth_start_v3',
    'storefront_identity_snapshot','storefront_identity_snapshot_pre_whatsapp',
    'public_account_profile_update','public_account_profile_update_pre_whatsapp','public_account_profile_complete','public_account_profile_complete_pre_whatsapp',
    'public_account_auth_verify','public_account_auth_verify_pre_whatsapp','public_account_auth_verify_v2','public_account_auth_verify_v2_pre_whatsapp'
  ] LOOP
    SELECT procedure.oid::regprocedure INTO STRICT function_signature FROM pg_catalog.pg_proc procedure
      WHERE procedure.pronamespace='saas'::regnamespace AND procedure.proname=function_name;
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',function_signature);
    IF function_name LIKE 'public_account_%' AND function_name NOT LIKE '%_pre_whatsapp'
    THEN EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_host_resolver',function_signature); END IF;
  END LOOP;
END $permissions$;

COMMIT;
