-- Customer phone-only authority. Merchant proofs and memberships are never read or issued.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
CREATE TABLE saas.customer_phone_original_functions(signature text PRIMARY KEY,definition text NOT NULL,owner_name text NOT NULL,acl jsonb NOT NULL);
CREATE TABLE saas.customer_phone_installed_functions(signature text PRIMARY KEY,definition text NOT NULL);
CREATE TABLE saas.customer_phone_login_operations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),hostname text NOT NULL,
 input_binding jsonb NOT NULL,challenge_cookie text NOT NULL,bind_account_id uuid,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','failed','ambiguous')),
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 completion_operation_id uuid UNIQUE,completion_input jsonb,completion_result jsonb,
 CHECK(expires_at=created_at+interval '10 minutes'),CHECK((completion_operation_id IS NULL)=(completion_result IS NULL))
);
DO $capture$ DECLARE r record;definition text;anchor text;replacement text;
BEGIN
 IF to_regprocedure('saas.whatsapp_otp_reserve_send(uuid,text,text,text)') IS NULL THEN RAISE EXCEPTION 'CUSTOMER_PHONE_SHARED_BUDGET_REQUIRED';END IF;
 FOR r IN SELECT p.oid,p.oid::regprocedure::text signature,p.proowner,p.proacl FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND (p.proname IN('public_account_profile_complete','public_account_profile_update') OR p.proname LIKE 'public_account_auth_%') LOOP
  INSERT INTO saas.customer_phone_original_functions SELECT r.signature,pg_get_functiondef(r.oid),pg_get_userbyid(r.proowner),coalesce((SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable)) FROM aclexplode(coalesce(r.proacl,acldefault('f',r.proowner))) a),'[]');
 END LOOP;
 SELECT pg_get_functiondef('saas.public_account_auth_verify_phone(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text)'::regprocedure) INTO definition;
 anchor:=$anchor$    IF EXISTS(SELECT 1 FROM saas.customers WHERE store_id=selected_store AND phone=p_phone)
    THEN RETURN QUERY SELECT 'identity_conflict',NULL::jsonb; RETURN; END IF;$anchor$;
 IF length(definition)-length(replace(definition,anchor,''))<>length(anchor) THEN RAISE EXCEPTION 'CUSTOMER_PHONE_VERIFY_PREDECESSOR_CHANGED';END IF;
 definition:=replace(definition,anchor,'    -- A verified phone creates a separate account; mutable contact matches convey no history.');
 anchor:='VALUES(p_customer_id,selected_store,''active'',p_first_name,p_last_name,NULL,p_phone,p_now,p_now)';
 IF length(definition)-length(replace(definition,anchor,''))<>length(anchor) THEN RAISE EXCEPTION 'CUSTOMER_PHONE_CONTACT_PREDECESSOR_CHANGED';END IF;
 definition:=replace(definition,anchor,'VALUES(p_customer_id,selected_store,''active'',p_first_name,p_last_name,NULL,CASE WHEN EXISTS(SELECT 1 FROM saas.customers WHERE store_id=selected_store AND phone=p_phone) THEN NULL ELSE p_phone END,p_now,p_now)');
 definition:=replace(definition,'FUNCTION saas.public_account_auth_verify_phone(','FUNCTION saas.customer_phone_verify_isolated(');EXECUTE definition;
 -- Existing authenticated email accounts may still bind their own phone. The
 -- new login path does not require an email session or match historic contacts.
 FOREACH replacement IN ARRAY ARRAY['public_account_profile_complete','public_account_profile_update'] LOOP
  SELECT f.definition INTO definition FROM saas.customer_phone_original_functions f WHERE f.signature LIKE 'saas.'||replacement||'(%';
  anchor:='    p_phone:=account.phone_normalized;';
  IF length(definition)-length(replace(definition,anchor,''))<>length(anchor) THEN RAISE EXCEPTION 'CUSTOMER_PHONE_PROFILE_PREDECESSOR_CHANGED';END IF;
  definition:=replace(definition,anchor,anchor||E'\n    IF EXISTS(SELECT 1 FROM saas.customers WHERE store_id=context.store_id AND phone=p_phone AND id IS DISTINCT FROM account.customer_id) THEN p_phone:=NULL;END IF;');
  IF replacement='public_account_profile_complete' THEN
   anchor:=E'BEGIN\n  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,true);';
   IF length(definition)-length(replace(definition,anchor,''))<>length(anchor) THEN RAISE EXCEPTION 'CUSTOMER_PHONE_PROFILE_REPLAY_PREDECESSOR_CHANGED';END IF;
   definition:=replace(definition,anchor,$recovery$BEGIN
  -- Exact replay can use the original rotated registration proof only while
  -- that proof and its issued full session remain valid. It creates no data.
  IF p_operation_id IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('saas.storefront.identity.operation:'||p_operation_id::text,0));
   SELECT * INTO existing FROM saas.storefront_identity_operations WHERE operation_id=p_operation_id;
   IF FOUND THEN
    IF existing.operation_kind='profile_complete' AND existing.payload_fingerprint=p_fingerprint AND existing.store_id=saas.storefront_public_store(p_hostname,clock_timestamp())
     AND saas.storefront_credential_candidates_valid(p_credentials,false)
     AND EXISTS(SELECT 1 FROM saas.storefront_account_sessions source JOIN saas.storefront_accounts current_account ON current_account.store_id=source.store_id AND current_account.id=source.account_id
      JOIN saas.storefront_account_sessions issued ON issued.store_id=source.store_id AND issued.account_id=source.account_id
      WHERE source.store_id=existing.store_id AND source.account_id=existing.account_id AND source.session_kind='registration' AND source.revoked_at IS NOT NULL AND source.revocation_reason='rotated'
       AND source.created_at<=clock_timestamp() AND source.idle_expires_at>clock_timestamp() AND source.absolute_expires_at>clock_timestamp()
       AND current_account.status='active' AND current_account.phone_verified_at IS NOT NULL AND current_account.customer_id=p_customer_id
       AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_credentials) candidate WHERE candidate->>'keyId'=source.key_id AND candidate->>'digest'=source.credential_digest)
       AND issued.id=p_full_session_id AND issued.session_kind='full' AND issued.key_id=p_key_id AND issued.credential_digest=p_digest AND issued.csrf_digest=p_csrf_digest
       AND issued.device_label=p_device_label AND issued.user_agent_digest=p_user_agent_digest AND issued.created_at=existing.committed_at
       AND issued.revoked_at IS NULL AND issued.idle_expires_at>clock_timestamp() AND issued.absolute_expires_at>clock_timestamp())
    THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload;ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
   END IF;
  END IF;
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,true);$recovery$);
   anchor:='  IF account.phone_verified_at IS NOT NULL THEN';
   IF length(definition)-length(replace(definition,anchor,''))<>length(anchor) THEN RAISE EXCEPTION 'CUSTOMER_PHONE_PROFILE_AUTHORITY_PREDECESSOR_CHANGED';END IF;
   definition:=replace(definition,anchor,E'  IF account.phone_verified_at IS NULL THEN RETURN QUERY SELECT \'challenge_invalid\',NULL::jsonb;RETURN;END IF;\n'||anchor);
  END IF;
  EXECUTE definition;
 END LOOP;
END $capture$;
CREATE FUNCTION saas.public_account_phone_command(p_action text,p_input jsonb) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE n timestamptz:=clock_timestamp();sid uuid;op uuid;challenge uuid;selected saas.customer_phone_login_operations;old saas.storefront_login_challenges;required text[];allowed text[];k text;v jsonb;binding jsonb;budget record;context record;verification record;mid uuid;active_session saas.storefront_account_sessions;
BEGIN
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR pg_column_size(p_input)>32768 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 CASE p_action
 WHEN 'start' THEN required:=ARRAY['operationId','hostname','phoneDigest','requestDigest','recipientBudgetDigest','inputFingerprint','codeKeyId','codeDigest','challengeCookie'];allowed:=required||ARRAY['ipBudgetDigest','bindingCredentials'];
 WHEN 'finish_delivery' THEN required:=ARRAY['hostname','challengeId','phoneDigest','status'];allowed:=required;
 WHEN 'verify','read_completion' THEN required:=ARRAY['hostname','challengeId','phoneDigest','operationId','codeDigest','phone','customerId','accountId','sessionId','sessionKeyId','sessionDigest','csrfDigest','deviceLabel','userAgentDigest','correlationId','completionCiphertext'];allowed:=required||ARRAY['firstName','lastName','candidates'];
 ELSE RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END CASE;
 IF NOT(p_input ?& required) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) field WHERE NOT(field=ANY(allowed))) OR ((p_input?'firstName')<>(p_input?'lastName')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_input) LOOP
  IF k IN('bindingCredentials','candidates') THEN IF saas.storefront_credential_candidates_valid(v,false) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  ELSE
   IF jsonb_typeof(v)<>'string' OR length(p_input->>k)=0 OR (p_input->>k)<>btrim(p_input->>k) OR (p_input->>k)~'[[:cntrl:]]' OR length(p_input->>k)>(CASE WHEN k='completionCiphertext' THEN 16384 WHEN k='challengeCookie' THEN 4096 ELSE 1024 END) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   IF (k LIKE '%Digest' OR k='inputFingerprint') AND (p_input->>k)!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  END IF;
 END LOOP;
 sid:=saas.storefront_public_store(p_input->>'hostname',n);IF sid IS NULL THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb;RETURN;END IF;
 IF p_action='start' THEN
  op:=(p_input->>'operationId')::uuid;binding:=p_input-ARRAY['challengeCookie'];
  PERFORM pg_advisory_xact_lock(hashtextextended('customer.phone.operation:'||op,0));
  SELECT * INTO selected FROM saas.customer_phone_login_operations WHERE operation_id=op FOR UPDATE;
  IF FOUND THEN
   IF selected.store_id<>sid OR selected.hostname<>p_input->>'hostname' OR selected.input_binding<>binding THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
   ELSIF selected.expires_at<=n THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb;
   ELSE RETURN QUERY SELECT selected.status,jsonb_build_object('challengeCookie',CASE WHEN selected.status='accepted' THEN selected.challenge_cookie ELSE NULL END,'retryAfterSeconds',60,'expiresAt',selected.expires_at);END IF;RETURN;
  END IF;
  IF p_input?'bindingCredentials' THEN
   SELECT * INTO context FROM saas.storefront_identity_session_context(p_input->>'hostname',n,p_input->'bindingCredentials',false);
   IF NOT FOUND OR context.session_kind<>'full' OR context.store_id<>sid THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb;RETURN;END IF;
   mid:=context.account_id;
  END IF;
  SELECT * INTO budget FROM saas.whatsapp_otp_reserve_send(op,'customer',p_input->>'recipientBudgetDigest',p_input->>'ipBudgetDigest');
  IF budget.outcome<>'reserved' THEN RETURN QUERY SELECT budget.outcome,jsonb_build_object('retryAfterSeconds',budget.retry_after_seconds);RETURN;END IF;
  INSERT INTO saas.storefront_login_challenges(id,store_id,channel,phone_digest,request_digest,code_key_id,code_digest,delivery_status,expires_at,created_at,last_sent_at)
   VALUES(op,sid,'whatsapp',p_input->>'phoneDigest',p_input->>'requestDigest',p_input->>'codeKeyId',p_input->>'codeDigest','pending',n+interval '10 minutes',n,n);
  INSERT INTO saas.customer_phone_login_operations(operation_id,store_id,hostname,input_binding,challenge_cookie,bind_account_id,created_at,expires_at) VALUES(op,sid,p_input->>'hostname',binding,p_input->>'challengeCookie',mid,n,n+interval '10 minutes');
  RETURN QUERY SELECT 'prepared',jsonb_build_object('retryAfterSeconds',60,'expiresAt',n+interval '10 minutes');RETURN;
 END IF;
 challenge:=(p_input->>'challengeId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('customer.phone.operation:'||challenge,0));
 SELECT * INTO selected FROM saas.customer_phone_login_operations WHERE operation_id=challenge AND store_id=sid AND hostname=p_input->>'hostname' AND input_binding->>'phoneDigest'=p_input->>'phoneDigest' AND expires_at>n FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb;RETURN;END IF;
 IF p_action='finish_delivery' THEN
  IF p_input->>'status' NOT IN('accepted','failed','ambiguous') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF selected.status<>'pending' THEN RETURN QUERY SELECT CASE WHEN selected.status=p_input->>'status' THEN selected.status ELSE 'operation_mismatch' END,NULL::jsonb;RETURN;END IF;
  SELECT * INTO verification FROM saas.public_account_auth_phone_delivery(selected.hostname,n,challenge,p_input->>'phoneDigest',p_input->>'status'='accepted');
  IF verification.outcome<>'committed' THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb;RETURN;END IF;
  UPDATE saas.customer_phone_login_operations SET status=p_input->>'status' WHERE operation_id=challenge;
  RETURN QUERY SELECT p_input->>'status',NULL::jsonb;RETURN;
 END IF;
 op:=(p_input->>'operationId')::uuid;binding:=p_input-ARRAY['completionCiphertext'];
 IF selected.completion_operation_id IS NOT NULL THEN
  IF selected.completion_operation_id<>op OR selected.completion_input<>binding THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  SELECT * INTO active_session FROM saas.storefront_account_sessions WHERE id=(binding->>'sessionId')::uuid AND store_id=sid AND revoked_at IS NULL AND idle_expires_at>n AND absolute_expires_at>n;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM saas.storefront_accounts WHERE store_id=sid AND id=active_session.account_id AND status IN('active','pending_profile')) THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT 'completed',selected.completion_result;RETURN;
 END IF;
 IF p_action='read_completion' OR selected.status<>'accepted' THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb;RETURN;END IF;
 IF selected.bind_account_id IS NOT NULL THEN
  SELECT * INTO context FROM saas.storefront_identity_session_context(selected.hostname,n,p_input->'candidates',false);
  IF NOT FOUND OR context.account_id<>selected.bind_account_id OR context.store_id<>sid OR context.session_kind<>'full' THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb;RETURN;END IF;
  SELECT * INTO verification FROM saas.public_account_auth_verify_phone_v2(selected.hostname,n,challenge,p_input->>'phoneDigest',p_input->>'codeDigest',p_input->>'phone',p_input->>'firstName',p_input->>'lastName',(p_input->>'customerId')::uuid,(p_input->>'accountId')::uuid,(p_input->>'sessionId')::uuid,p_input->>'sessionKeyId',p_input->>'sessionDigest',p_input->>'csrfDigest',p_input->>'deviceLabel',p_input->>'userAgentDigest',p_input->>'correlationId',p_input->'candidates');
 ELSE
  IF p_input?'candidates' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT * INTO verification FROM saas.customer_phone_verify_isolated(selected.hostname,n,challenge,p_input->>'phoneDigest',p_input->>'codeDigest',p_input->>'phone',p_input->>'firstName',p_input->>'lastName',(p_input->>'customerId')::uuid,(p_input->>'accountId')::uuid,(p_input->>'sessionId')::uuid,p_input->>'sessionKeyId',p_input->>'sessionDigest',p_input->>'csrfDigest',p_input->>'deviceLabel',p_input->>'userAgentDigest',p_input->>'correlationId');
 END IF;
 IF verification.outcome NOT IN('authenticated','profile_required') THEN RETURN QUERY SELECT verification.outcome,verification.result_payload;RETURN;END IF;
 UPDATE saas.customer_phone_login_operations SET completion_operation_id=op,completion_input=binding,completion_result=jsonb_build_object('profileRequired',verification.outcome='profile_required','completionCiphertext',p_input->>'completionCiphertext') WHERE operation_id=challenge;
 RETURN QUERY SELECT verification.outcome,jsonb_build_object('profileRequired',verification.outcome='profile_required','completionCiphertext',p_input->>'completionCiphertext');
EXCEPTION WHEN invalid_text_representation OR unique_violation OR check_violation OR not_null_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;
DO $security$ DECLARE t text;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['customer_phone_original_functions','customer_phone_installed_functions','customer_phone_login_operations'] LOOP EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON TABLE saas.%I FROM PUBLIC,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_platform_operator',t);END LOOP;
 FOR r IN SELECT p.oid::regprocedure::text signature FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND(p.proname LIKE 'public_account_auth_%' OR p.proname IN('public_account_phone_command','customer_phone_verify_isolated')) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_platform_operator',r.signature);END LOOP;
END $security$;
GRANT EXECUTE ON FUNCTION saas.public_account_phone_command(text,jsonb) TO celebix_saas_host_resolver;
INSERT INTO saas.customer_phone_installed_functions
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid) FROM pg_proc p
 WHERE p.pronamespace='saas'::regnamespace AND(p.oid::regprocedure::text IN(SELECT signature FROM saas.customer_phone_original_functions) OR p.proname IN('public_account_phone_command','customer_phone_verify_isolated'));
COMMIT;
