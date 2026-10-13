-- Additive phone authority. Historical password MFA migration228 remains immutable.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.merchant_whatsapp_original_functions(signature text PRIMARY KEY,definition text NOT NULL,bootstrap_support_select_preexisting boolean NOT NULL DEFAULT false);
ALTER TABLE saas.principals ADD COLUMN authority_kind text NOT NULL DEFAULT 'oidc' CHECK(authority_kind IN('oidc','phone'));
ALTER TABLE saas.principals ALTER COLUMN email DROP NOT NULL;
ALTER TABLE saas.principals DROP CONSTRAINT principals_email_verified_check;
ALTER TABLE saas.principals ADD CONSTRAINT principals_identity_kind_check CHECK((authority_kind='oidc' AND email IS NOT NULL AND email_verified) OR(authority_kind='phone' AND ((email IS NULL AND NOT email_verified) OR(email IS NOT NULL AND email_verified))));
ALTER TABLE saas.admin_login_assurance ADD COLUMN authentication_method text NOT NULL DEFAULT 'password_whatsapp' CHECK(authentication_method IN('password_whatsapp','whatsapp'));
CREATE TABLE saas.merchant_whatsapp_policy(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,cutover_at timestamptz,central_hostnames text[] NOT NULL DEFAULT '{}',signup_enabled boolean NOT NULL DEFAULT false);
INSERT INTO saas.merchant_whatsapp_policy DEFAULT VALUES;
CREATE TABLE saas.merchant_whatsapp_store_policy(store_id uuid PRIMARY KEY REFERENCES saas.stores(id),enabled boolean NOT NULL DEFAULT false,cutover_at timestamptz);
CREATE TABLE saas.merchant_phone_identities(id uuid PRIMARY KEY,phone_key_id text NOT NULL,phone_digest text NOT NULL CHECK(phone_digest~'^[a-f0-9]{64}$'),phone_ciphertext text NOT NULL,phone_masked text NOT NULL,principal_id uuid UNIQUE REFERENCES saas.principals(id),verified_at timestamptz,disabled_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(phone_key_id,phone_digest),CHECK((principal_id IS NULL)=(verified_at IS NULL)));
CREATE TABLE saas.merchant_phone_staff(id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),phone_id uuid REFERENCES saas.merchant_phone_identities(id),membership_id uuid UNIQUE REFERENCES saas.memberships(id),display_name text NOT NULL,role text NOT NULL CHECK(role IN('admin','editor','analyst','cashier')),enabled boolean NOT NULL DEFAULT true,version bigint NOT NULL DEFAULT 0,created_by uuid REFERENCES saas.principals(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(store_id,phone_id),CHECK(phone_id IS NOT NULL OR membership_id IS NOT NULL));
INSERT INTO saas.merchant_phone_staff(id,store_id,phone_id,membership_id,display_name,role,enabled,created_by,created_at,updated_at)
 SELECT gen_random_uuid(),m.store_id,NULL,m.id,left(coalesce(p.email,p.subject),100),m.role,m.status='active',NULL,m.created_at,m.updated_at FROM saas.memberships m JOIN saas.principals p ON p.id=m.principal_id WHERE m.support_session_id IS NULL AND m.role<>'store_owner' AND m.status IN('active','revoked');
CREATE TABLE saas.merchant_phone_staff_versions(store_id uuid PRIMARY KEY REFERENCES saas.stores(id),version bigint NOT NULL DEFAULT 0);
CREATE TABLE saas.merchant_phone_operations(operation_id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES saas.principals(id),store_id uuid NOT NULL REFERENCES saas.stores(id),action text NOT NULL,input jsonb NOT NULL,outcome text NOT NULL,authority jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE saas.merchant_phone_pending(pending_id uuid PRIMARY KEY,operation_id uuid NOT NULL UNIQUE,pending_digest text NOT NULL,browser_digest text NOT NULL,environment text NOT NULL,purpose text NOT NULL CHECK(purpose IN('login','bind_phone','signup')),phone_key_id text NOT NULL,phone_digest text NOT NULL,phone_ciphertext text NOT NULL,phone_masked text NOT NULL,destination_hostname text NOT NULL,store_id uuid REFERENCES saas.stores(id),actor_id uuid REFERENCES saas.principals(id),actor_session_id uuid,principal_id uuid REFERENCES saas.principals(id),prepare_input jsonb NOT NULL,verified_at timestamptz,signup_operation_id uuid,signup_store_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,consumed_operation_id uuid,consumed_input jsonb,consumed_outcome text,consumed_authority jsonb,CHECK(expires_at=created_at+interval '10 minutes'));
CREATE TABLE saas.merchant_phone_challenges(challenge_id uuid PRIMARY KEY,operation_id uuid NOT NULL UNIQUE,pending_id uuid NOT NULL REFERENCES saas.merchant_phone_pending(pending_id),code_digest text NOT NULL,recipient_budget_digest text NOT NULL,ip_digest text,request_input jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','failed','ambiguous')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 6),superseded boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE saas.whatsapp_otp_send_reservations(operation_id uuid PRIMARY KEY,audience text NOT NULL CHECK(audience IN('merchant','customer')),recipient_budget_digest text NOT NULL CHECK(recipient_budget_digest~'^[a-f0-9]{64}$'),ip_budget_digest text CHECK(ip_budget_digest~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX whatsapp_otp_recipient_budget ON saas.whatsapp_otp_send_reservations(recipient_budget_digest,created_at);
CREATE INDEX whatsapp_otp_ip_budget ON saas.whatsapp_otp_send_reservations(ip_budget_digest,created_at);
CREATE FUNCTION saas.whatsapp_otp_reserve_send(p_operation_id uuid,p_audience text,p_recipient_digest text,p_ip_digest text) RETURNS TABLE(outcome text,retry_after_seconds integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE n timestamptz:=clock_timestamp();last_send timestamptz;r saas.whatsapp_otp_send_reservations;
BEGIN
 IF p_operation_id IS NULL OR p_audience NOT IN('merchant','customer') OR (p_recipient_digest~'^[a-f0-9]{64}$' AND (p_ip_digest IS NULL OR p_ip_digest~'^[a-f0-9]{64}$')) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',0;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('whatsapp.operation:'||p_operation_id,0));
 SELECT * INTO r FROM saas.whatsapp_otp_send_reservations WHERE operation_id=p_operation_id;
 IF FOUND THEN RETURN QUERY SELECT CASE WHEN r.audience=p_audience AND r.recipient_budget_digest=p_recipient_digest AND r.ip_budget_digest IS NOT DISTINCT FROM p_ip_digest THEN 'operation_replayed' ELSE 'operation_mismatch' END,0;RETURN;END IF;
 IF p_ip_digest IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('whatsapp.ip:'||p_ip_digest,0));END IF;PERFORM pg_advisory_xact_lock(hashtextextended('whatsapp.recipient:'||p_recipient_digest,0));
 SELECT max(created_at) INTO last_send FROM saas.whatsapp_otp_send_reservations WHERE recipient_budget_digest=p_recipient_digest;
 IF last_send>n-interval '60 seconds' THEN RETURN QUERY SELECT 'rate_limited',greatest(1,ceil(extract(epoch FROM last_send+interval '60 seconds'-n))::integer);RETURN;END IF;
 IF (SELECT count(*) FROM saas.whatsapp_otp_send_reservations WHERE recipient_budget_digest=p_recipient_digest AND created_at>n-interval '15 minutes')>=5 OR(SELECT count(*) FROM saas.whatsapp_otp_send_reservations WHERE ip_budget_digest=p_ip_digest AND created_at>n-interval '15 minutes')>=30 THEN RETURN QUERY SELECT 'rate_limited',900;RETURN;END IF;
 INSERT INTO saas.whatsapp_otp_send_reservations VALUES(p_operation_id,p_audience,p_recipient_digest,p_ip_digest,n);RETURN QUERY SELECT 'reserved',60;
END $f$;
CREATE FUNCTION saas.merchant_whatsapp_policy_enabled(p_store uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT (SELECT enabled FROM saas.merchant_whatsapp_policy) OR coalesce((SELECT enabled FROM saas.merchant_whatsapp_store_policy WHERE store_id=p_store),false) $f$;
CREATE FUNCTION saas.merchant_whatsapp_principal_enforced(p_principal uuid,p_store uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT saas.merchant_whatsapp_policy_enabled(p_store) OR(p_store IS NULL AND EXISTS(SELECT 1 FROM saas.memberships m WHERE m.principal_id=p_principal AND m.status='active' AND saas.merchant_whatsapp_policy_enabled(m.store_id))) $f$;
CREATE FUNCTION saas.merchant_phone_staff_projection(p_store uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('version',coalesce((SELECT version FROM saas.merchant_phone_staff_versions WHERE store_id=p_store),0),'staff',coalesce((SELECT jsonb_agg(jsonb_build_object('staffId',s.id,'displayName',s.display_name,'role',s.role,'enabled',s.enabled,'version',s.version,'phoneMasked',p.phone_masked,'phoneVerified',p.verified_at IS NOT NULL,'membershipId',s.membership_id,'principalId',coalesce(p.principal_id,m.principal_id)) ORDER BY s.created_at,s.id) FROM saas.merchant_phone_staff s LEFT JOIN saas.merchant_phone_identities p ON p.id=s.phone_id LEFT JOIN saas.memberships m ON m.id=s.membership_id WHERE s.store_id=p_store),'[]'))
$f$;
CREATE FUNCTION saas.merchant_phone_projection(p_pending uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_strip_nulls(jsonb_build_object('pendingId',p.pending_id,'purpose',p.purpose,'expiresAt',p.expires_at,'phoneMasked',p.phone_masked,'phoneCiphertext',p.phone_ciphertext,'phoneKeyId',p.phone_key_id,'phoneDigest',p.phone_digest,'destinationOrigin','https://'||p.destination_hostname,'principalId',p.principal_id,'challengeId',c.challenge_id,'status',c.status,'resendAt',c.created_at+interval '60 seconds')) FROM saas.merchant_phone_pending p LEFT JOIN LATERAL(SELECT * FROM saas.merchant_phone_challenges WHERE pending_id=p.pending_id ORDER BY created_at DESC,challenge_id DESC LIMIT 1)c ON true WHERE p.pending_id=p_pending
$f$;
CREATE FUNCTION saas.merchant_whatsapp_cleanup() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 WITH expired AS(SELECT pending_id FROM saas.merchant_phone_pending WHERE expires_at<=clock_timestamp() AND(consumed_input?'completionCiphertext' OR consumed_authority?'completionCiphertext') ORDER BY expires_at,pending_id LIMIT 100 FOR UPDATE SKIP LOCKED),cleaned AS(UPDATE saas.merchant_phone_pending p SET consumed_input=p.consumed_input-'completionCiphertext',consumed_authority=p.consumed_authority-'completionCiphertext' FROM expired e WHERE p.pending_id=e.pending_id RETURNING p.pending_id) SELECT count(*)::integer FROM cleaned
$f$;
CREATE FUNCTION saas.merchant_whatsapp_command(p_action text,p_input jsonb) RETURNS TABLE(outcome text,authority jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE n timestamptz:=clock_timestamp();required text[];optional text[]:='{}';k text;v jsonb;sid uuid;pid uuid;actor uuid;session_row saas.panel_sessions;phone saas.merchant_phone_identities;pending saas.merchant_phone_pending;challenge saas.merchant_phone_challenges;staff saas.merchant_phone_staff;prior saas.merchant_phone_operations;op uuid;mid uuid;ver bigint;plan uuid;budget record;result record;body jsonb;out text;is_central boolean;target uuid;destination text;
BEGIN
 required:=CASE p_action
 WHEN 'prepare' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment','operationId','purpose','phoneKeyId','phoneDigest','phoneCiphertext','phoneMasked','destinationHostname','ipDigest','recipientBudgetDigest','challengeId','codeDigest']
 WHEN 'resend' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment','operationId','challengeId','codeDigest','ipDigest','recipientBudgetDigest']
 WHEN 'read' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment']
 WHEN 'finish_delivery' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment','challengeId','status']
 WHEN 'verify' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment','challengeId','codeDigest','operationId','sessionId','familyId','tokenKeyId','tokenDigest','completionCiphertext']
 WHEN 'claim_signup' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment','operationId','storeId','sessionId','familyId','tokenKeyId','tokenDigest','completionCiphertext']
 WHEN 'self_state' THEN ARRAY['actorTokenKeyId','actorTokenDigest']
 WHEN 'staff_list' THEN ARRAY['actorTokenKeyId','actorTokenDigest']
 WHEN 'staff_create' THEN ARRAY['actorTokenKeyId','actorTokenDigest','operationId','expectedVersion','phoneKeyId','phoneDigest','phoneCiphertext','phoneMasked','displayName','role']
 WHEN 'staff_update' THEN ARRAY['actorTokenKeyId','actorTokenDigest','operationId','staffId','expectedVersion','displayName','role','enabled'] END;
 optional:=CASE p_action WHEN 'prepare' THEN ARRAY['actorTokenKeyId','actorTokenDigest'] WHEN 'read' THEN ARRAY['actorTokenKeyId','actorTokenDigest'] WHEN 'resend' THEN ARRAY['actorTokenKeyId','actorTokenDigest'] WHEN 'verify' THEN ARRAY['actorTokenKeyId','actorTokenDigest'] WHEN 'staff_create' THEN ARRAY['existingMembershipId'] ELSE '{}'::text[] END;
 IF required IS NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR NOT(p_input?&required) OR p_input-(required||optional)<>'{}' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_input) LOOP
  IF k='expectedVersion' THEN IF jsonb_typeof(v)<>'number' OR v::text!~'^[0-9]{1,16}$' OR(v::text)::numeric>9007199254740990 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  ELSIF k='ipDigest' AND v='null'::jsonb THEN NULL;
  ELSIF k='enabled' THEN IF jsonb_typeof(v)<>'boolean' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  ELSE
   IF jsonb_typeof(v)<>'string' OR length(p_input->>k)<1 OR p_input->>k<>btrim(p_input->>k) OR p_input->>k~'[[:cntrl:]]' OR length(p_input->>k)>(CASE k WHEN 'completionCiphertext' THEN 32768 WHEN 'phoneCiphertext' THEN 4096 WHEN 'displayName' THEN 100 ELSE 512 END)
    OR(k LIKE '%Digest' AND p_input->>k!~'^[a-f0-9]{64}$')
    OR(k=ANY(ARRAY['pendingId','operationId','challengeId','sessionId','familyId','staffId','storeId','existingMembershipId']) AND p_input->>k!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
    OR(k LIKE '%KeyId' AND p_input->>k!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')
    OR(k='role' AND p_input->>k NOT IN('admin','editor','analyst','cashier'))
    OR(k='purpose' AND p_input->>k NOT IN('login','bind_phone','signup'))
    OR(k='status' AND p_input->>k NOT IN('accepted','failed','ambiguous'))
    OR(k='environment' AND p_input->>k!~'^[A-Za-z0-9_-]{1,64}$')
    OR(k='destinationHostname' AND (length(p_input->>k)>253 OR p_input->>k!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'))
   THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  END IF;
 END LOOP;
 IF(p_input?'actorTokenKeyId')<>(p_input?'actorTokenDigest') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM saas.merchant_whatsapp_cleanup();
 op:=(p_input->>'operationId')::uuid;
 IF p_action='prepare' AND((p_input->>'purpose'='bind_phone') IS DISTINCT FROM(p_input?&ARRAY['actorTokenKeyId','actorTokenDigest']) OR(p_input->>'purpose'<>'bind_phone' AND(p_input?'actorTokenKeyId' OR p_input?'actorTokenDigest'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Private actor authority is always resolved from the credential, never request IDs.
 IF p_action='self_state' OR p_action LIKE 'staff_%' OR(p_action='prepare' AND p_input->>'purpose'='bind_phone') THEN
  SELECT * INTO session_row FROM saas.panel_sessions WHERE token_key_id=p_input->>'actorTokenKeyId' AND token_digest=p_input->>'actorTokenDigest' AND revoked_at IS NULL AND expires_at>n AND issued_at<=n FOR SHARE;
  IF NOT FOUND OR NOT saas.admin_login_session_allowed(session_row.token_key_id,session_row.token_digest) THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
  actor:=session_row.principal_id;sid:=session_row.active_store_id;
  IF NOT EXISTS(SELECT 1 FROM saas.memberships WHERE principal_id=actor AND store_id=sid AND status='active' AND support_session_id IS NULL AND(p_action NOT LIKE 'staff_%' OR role='store_owner')) THEN RETURN QUERY SELECT 'owner_required',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_action='self_state' THEN RETURN QUERY SELECT 'listed',jsonb_build_object('phoneMasked',(SELECT phone_masked FROM saas.merchant_phone_identities WHERE principal_id=actor AND disabled_at IS NULL),'phoneVerified',EXISTS(SELECT 1 FROM saas.merchant_phone_identities WHERE principal_id=actor AND verified_at IS NOT NULL AND disabled_at IS NULL));RETURN;END IF;
 IF p_action LIKE 'staff_%' THEN
  IF p_action='staff_list' THEN RETURN QUERY SELECT 'listed',saas.merchant_phone_staff_projection(sid);RETURN;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('merchant.operation:'||op,0));
  IF p_action='staff_create' THEN PERFORM pg_advisory_xact_lock(hashtextextended('merchant.phone:'||(p_input->>'phoneKeyId')||':'||(p_input->>'phoneDigest'),0));END IF;
  INSERT INTO saas.platform_store_versions(store_id) VALUES(sid) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM saas.platform_store_versions WHERE store_id=sid FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('merchant.staff:'||sid,0));
  PERFORM 1 FROM saas.memberships WHERE principal_id=actor AND store_id=sid AND status='active' AND role='store_owner' AND support_session_id IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'owner_required',NULL::jsonb;RETURN;END IF;
  SELECT * INTO prior FROM saas.merchant_phone_operations WHERE operation_id=op;
  IF FOUND THEN IF prior.actor_id<>actor OR prior.store_id<>sid OR prior.action<>p_action OR prior.input<>p_input THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',prior.authority;END IF;RETURN;END IF;
  SELECT s.plan_id INTO plan FROM saas.subscriptions s WHERE s.store_id=sid AND s.status='active' AND s.valid_from<=n AND(s.valid_until IS NULL OR s.valid_until>n) FOR SHARE;
  IF plan IS NULL OR NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=plan AND feature_key='staff_management' AND enabled) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.merchant_phone_staff_versions(store_id) VALUES(sid) ON CONFLICT DO NOTHING;SELECT version INTO ver FROM saas.merchant_phone_staff_versions WHERE store_id=sid FOR UPDATE;
  IF p_action='staff_create' THEN
   IF ver<>(p_input->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
   SELECT * INTO phone FROM saas.merchant_phone_identities WHERE phone_key_id=p_input->>'phoneKeyId' AND phone_digest=p_input->>'phoneDigest' FOR UPDATE;
   IF FOUND AND phone.disabled_at IS NOT NULL THEN RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;END IF;
   IF p_input?'existingMembershipId' THEN
    IF phone.principal_id IS NULL OR NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=(p_input->>'existingMembershipId')::uuid AND principal_id=phone.principal_id AND store_id=sid AND role<>'store_owner' AND support_session_id IS NULL) THEN RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;END IF;
    mid:=(p_input->>'existingMembershipId')::uuid;
   ELSIF phone.principal_id IS NOT NULL AND EXISTS(SELECT 1 FROM saas.memberships WHERE principal_id=phone.principal_id AND store_id=sid AND role='store_owner') THEN RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;END IF;
   IF phone.id IS NOT NULL AND EXISTS(SELECT 1 FROM saas.merchant_phone_staff WHERE store_id=sid AND phone_id=phone.id) THEN RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;END IF;
   IF NOT EXISTS(SELECT 1 FROM saas.plan_limits WHERE plan_id=plan AND limit_key='staff' AND effective_limit>=
    (SELECT count(*) FROM saas.memberships WHERE store_id=sid AND status='active' AND role<>'store_owner' AND support_session_id IS NULL)+
    (SELECT count(*) FROM saas.merchant_phone_staff WHERE store_id=sid AND enabled AND membership_id IS NULL)+CASE WHEN mid IS NOT NULL AND EXISTS(SELECT 1 FROM saas.memberships WHERE id=mid AND status='active') THEN 0 ELSE 1 END)
   THEN RETURN QUERY SELECT 'staff_limit_reached',NULL::jsonb;RETURN;END IF;
   IF phone.id IS NULL THEN INSERT INTO saas.merchant_phone_identities(id,phone_key_id,phone_digest,phone_ciphertext,phone_masked) VALUES(gen_random_uuid(),p_input->>'phoneKeyId',p_input->>'phoneDigest',p_input->>'phoneCiphertext',p_input->>'phoneMasked') RETURNING * INTO phone;END IF;
   IF mid IS NOT NULL AND EXISTS(SELECT 1 FROM saas.merchant_phone_staff WHERE membership_id=mid AND phone_id IS NULL) THEN
    UPDATE saas.merchant_phone_staff SET phone_id=phone.id,display_name=p_input->>'displayName',role=p_input->>'role',created_by=actor,version=version+1,updated_at=n WHERE membership_id=mid;
   ELSE INSERT INTO saas.merchant_phone_staff(id,store_id,phone_id,membership_id,display_name,role,created_by) VALUES(gen_random_uuid(),sid,phone.id,mid,p_input->>'displayName',p_input->>'role',actor);END IF;out:='created';
  ELSE
   SELECT * INTO staff FROM saas.merchant_phone_staff WHERE id=(p_input->>'staffId')::uuid AND store_id=sid FOR UPDATE;
   IF NOT FOUND OR staff.version<>(p_input->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
   IF staff.membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=staff.membership_id AND store_id=sid AND role<>'store_owner' AND support_session_id IS NULL) THEN RETURN QUERY SELECT 'owner_required',NULL::jsonb;RETURN;END IF;
   IF(p_input->>'enabled')::boolean AND NOT staff.enabled AND NOT EXISTS(SELECT 1 FROM saas.plan_limits WHERE plan_id=plan AND limit_key='staff' AND effective_limit>(SELECT count(*) FROM saas.memberships WHERE store_id=sid AND status='active' AND role<>'store_owner' AND support_session_id IS NULL)+(SELECT count(*) FROM saas.merchant_phone_staff WHERE store_id=sid AND enabled AND membership_id IS NULL)) THEN RETURN QUERY SELECT 'staff_limit_reached',NULL::jsonb;RETURN;END IF;
   UPDATE saas.merchant_phone_staff SET display_name=p_input->>'displayName',role=p_input->>'role',enabled=(p_input->>'enabled')::boolean,version=version+1,updated_at=n WHERE id=staff.id;
   IF staff.membership_id IS NOT NULL THEN UPDATE saas.memberships SET role=p_input->>'role',status=CASE WHEN(p_input->>'enabled')::boolean THEN 'active' ELSE 'revoked' END,updated_at=n WHERE id=staff.membership_id;END IF;out:='updated';
  END IF;
  UPDATE saas.platform_store_versions SET version=version+1 WHERE store_id=sid;
  UPDATE saas.merchant_phone_staff_versions SET version=version+1 WHERE store_id=sid;body:=saas.merchant_phone_staff_projection(sid);
  INSERT INTO saas.merchant_phone_operations VALUES(op,actor,sid,p_action,p_input,out,body,n);RETURN QUERY SELECT out,body;RETURN;
 END IF;
 IF p_action='prepare' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('merchant.operation:'||op,0));
  SELECT * INTO pending FROM saas.merchant_phone_pending WHERE operation_id=op OR pending_id=(p_input->>'pendingId')::uuid FOR UPDATE;
  IF FOUND THEN IF pending.expires_at<=n THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;IF pending.prepare_input<>p_input THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'pending',saas.merchant_phone_projection(pending.pending_id);END IF;RETURN;END IF;
  SELECT store_id INTO target FROM saas.admin_domains WHERE hostname=p_input->>'destinationHostname' AND status='active' AND verified_at<=n;
  SELECT(p_input->>'destinationHostname')=ANY(central_hostnames) INTO is_central FROM saas.merchant_whatsapp_policy;
  IF target IS NULL AND NOT is_central THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF p_input->>'purpose'='bind_phone' AND(sid IS NULL OR target IS DISTINCT FROM sid) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF p_input->>'purpose'='signup' AND(NOT is_central OR NOT(SELECT signup_enabled FROM saas.merchant_whatsapp_policy)) THEN RETURN QUERY SELECT 'disabled',NULL::jsonb;RETURN;END IF;
  SELECT * INTO budget FROM saas.whatsapp_otp_reserve_send(op,'merchant',p_input->>'recipientBudgetDigest',p_input->>'ipDigest');
  IF budget.outcome<>'reserved' THEN RETURN QUERY SELECT budget.outcome,jsonb_build_object('retryAfterSeconds',budget.retry_after_seconds);RETURN;END IF;
  INSERT INTO saas.merchant_phone_pending(pending_id,operation_id,pending_digest,browser_digest,environment,purpose,phone_key_id,phone_digest,phone_ciphertext,phone_masked,destination_hostname,store_id,actor_id,actor_session_id,prepare_input,created_at,expires_at)
  VALUES((p_input->>'pendingId')::uuid,op,p_input->>'pendingDigest',p_input->>'browserDigest',p_input->>'environment',p_input->>'purpose',p_input->>'phoneKeyId',p_input->>'phoneDigest',p_input->>'phoneCiphertext',p_input->>'phoneMasked',p_input->>'destinationHostname',target,actor,session_row.session_id,p_input,n,n+interval '10 minutes') RETURNING * INTO pending;
  INSERT INTO saas.merchant_phone_challenges(challenge_id,operation_id,pending_id,code_digest,recipient_budget_digest,ip_digest,request_input,created_at) VALUES((p_input->>'challengeId')::uuid,op,pending.pending_id,p_input->>'codeDigest',p_input->>'recipientBudgetDigest',p_input->>'ipDigest',p_input,n);
  RETURN QUERY SELECT 'prepared',saas.merchant_phone_projection(pending.pending_id);RETURN;
 END IF;
 SELECT * INTO pending FROM saas.merchant_phone_pending WHERE pending_id=(p_input->>'pendingId')::uuid AND pending_digest=p_input->>'pendingDigest' AND browser_digest=p_input->>'browserDigest' AND environment=p_input->>'environment' AND expires_at>n FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
 -- Bind continuations require the current browser's authenticated ordinary actor.
 -- The persisted initiating actor alone never authorizes a later browser session.
 IF p_action IN('read','resend','verify') THEN
  IF pending.purpose='bind_phone' THEN
   IF NOT(p_input?&ARRAY['actorTokenKeyId','actorTokenDigest']) THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
   SELECT * INTO session_row FROM saas.panel_sessions WHERE token_key_id=p_input->>'actorTokenKeyId' AND token_digest=p_input->>'actorTokenDigest' AND revoked_at IS NULL AND expires_at>n AND issued_at<=n FOR SHARE;
   IF NOT FOUND OR session_row.principal_id IS DISTINCT FROM pending.actor_id OR session_row.active_store_id IS DISTINCT FROM pending.store_id OR NOT saas.admin_login_session_allowed(session_row.token_key_id,session_row.token_digest) THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
   PERFORM 1 FROM saas.memberships m JOIN saas.stores s ON s.id=m.store_id WHERE m.principal_id=session_row.principal_id AND m.store_id=pending.store_id AND m.status='active' AND m.support_session_id IS NULL AND s.status='active' FOR SHARE OF m,s;
   IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
  ELSIF p_input?'actorTokenKeyId' OR p_input?'actorTokenDigest' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;
  END IF;
 END IF;
 IF pending.consumed_operation_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM saas.panel_sessions s WHERE s.session_id=(pending.consumed_input->>'sessionId')::uuid AND s.principal_id=pending.principal_id AND s.token_key_id=pending.consumed_input->>'tokenKeyId' AND s.token_digest=pending.consumed_input->>'tokenDigest' AND s.revoked_at IS NULL AND s.expires_at>n AND saas.admin_login_session_allowed(s.token_key_id,s.token_digest) AND EXISTS(SELECT 1 FROM saas.memberships m JOIN saas.stores st ON st.id=m.store_id AND st.status='active' WHERE m.principal_id=s.principal_id AND m.status='active' AND m.support_session_id IS NULL AND(s.active_store_id IS NULL OR m.store_id=s.active_store_id))) OR NOT EXISTS(SELECT 1 FROM saas.merchant_phone_identities WHERE principal_id=pending.principal_id AND phone_key_id=pending.phone_key_id AND phone_digest=pending.phone_digest AND disabled_at IS NULL AND verified_at IS NOT NULL) OR NOT(EXISTS(SELECT 1 FROM saas.admin_domains WHERE hostname=pending.destination_hostname AND store_id=pending.store_id AND status='active' AND verified_at<=n) OR EXISTS(SELECT 1 FROM saas.merchant_whatsapp_policy WHERE pending.destination_hostname=ANY(central_hostnames))) THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
  IF p_action='read' THEN RETURN QUERY SELECT 'completed',pending.consumed_authority;RETURN;END IF;
  IF pending.consumed_operation_id=op AND pending.consumed_input=p_input THEN RETURN QUERY SELECT 'operation_replayed',pending.consumed_authority;ELSE RETURN QUERY SELECT 'consumed',NULL::jsonb;END IF;RETURN;
 END IF;
 IF p_action='read' THEN RETURN QUERY SELECT CASE WHEN pending.verified_at IS NOT NULL THEN 'phone_verified' ELSE 'pending' END,saas.merchant_phone_projection(pending.pending_id);RETURN;END IF;
 IF p_action='resend' THEN
  SELECT * INTO challenge FROM saas.merchant_phone_challenges WHERE challenge_id=(p_input->>'challengeId')::uuid OR operation_id=op;
  IF FOUND THEN IF challenge.pending_id<>pending.pending_id OR challenge.request_input<>p_input THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT challenge.status,saas.merchant_phone_projection(pending.pending_id);END IF;RETURN;END IF;
  IF pending.verified_at IS NOT NULL OR p_input->>'recipientBudgetDigest'<>pending.prepare_input->>'recipientBudgetDigest' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT * INTO budget FROM saas.whatsapp_otp_reserve_send(op,'merchant',p_input->>'recipientBudgetDigest',p_input->>'ipDigest');
  IF budget.outcome<>'reserved' THEN RETURN QUERY SELECT budget.outcome,jsonb_build_object('retryAfterSeconds',budget.retry_after_seconds);RETURN;END IF;
  INSERT INTO saas.merchant_phone_challenges(challenge_id,operation_id,pending_id,code_digest,recipient_budget_digest,ip_digest,request_input,created_at) VALUES((p_input->>'challengeId')::uuid,op,pending.pending_id,p_input->>'codeDigest',p_input->>'recipientBudgetDigest',p_input->>'ipDigest',p_input,n);RETURN QUERY SELECT 'prepared',saas.merchant_phone_projection(pending.pending_id);RETURN;
 END IF;
 IF p_action IN('finish_delivery','verify') THEN
  SELECT * INTO challenge FROM saas.merchant_phone_challenges WHERE challenge_id=(p_input->>'challengeId')::uuid AND pending_id=pending.pending_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
  IF p_action='finish_delivery' THEN
   IF challenge.status<>'pending' THEN IF challenge.status<>p_input->>'status' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT challenge.status,saas.merchant_phone_projection(pending.pending_id);END IF;RETURN;END IF;
   IF p_input->>'status'='accepted' AND EXISTS(SELECT 1 FROM saas.merchant_phone_challenges WHERE pending_id=pending.pending_id AND status='accepted' AND created_at>challenge.created_at) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
   UPDATE saas.merchant_phone_challenges SET status=p_input->>'status' WHERE challenge_id=challenge.challenge_id;
   IF p_input->>'status'='accepted' THEN UPDATE saas.merchant_phone_challenges SET superseded=true WHERE pending_id=pending.pending_id AND challenge_id<>challenge.challenge_id AND created_at<=challenge.created_at;END IF;
   RETURN QUERY SELECT p_input->>'status',saas.merchant_phone_projection(pending.pending_id);RETURN;
  END IF;
  IF challenge.status<>'accepted' OR challenge.superseded OR pending.verified_at IS NOT NULL THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb;RETURN;END IF;
  IF challenge.attempts>=6 THEN RETURN QUERY SELECT 'locked',NULL::jsonb;RETURN;END IF;
  IF challenge.code_digest<>p_input->>'codeDigest' THEN UPDATE saas.merchant_phone_challenges SET attempts=attempts+1 WHERE challenge_id=challenge.challenge_id;RETURN QUERY SELECT CASE WHEN challenge.attempts=5 THEN 'locked' ELSE 'invalid_code' END,NULL::jsonb;RETURN;END IF;
  -- Factor precedes phone-row lock, matching webhook/support invalidation order.
  pid:=coalesce(pending.actor_id,(SELECT principal_id FROM saas.merchant_phone_identities WHERE phone_key_id=pending.phone_key_id AND phone_digest=pending.phone_digest));
  IF pid IS NOT NULL THEN INSERT INTO saas.admin_login_factors(principal_id) VALUES(pid) ON CONFLICT DO NOTHING;PERFORM 1 FROM saas.admin_login_factors WHERE principal_id=pid FOR UPDATE;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('merchant.phone:'||pending.phone_key_id||':'||pending.phone_digest,0));
  SELECT * INTO phone FROM saas.merchant_phone_identities WHERE phone_key_id=pending.phone_key_id AND phone_digest=pending.phone_digest FOR UPDATE;
  IF phone.disabled_at IS NOT NULL THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF pending.purpose='bind_phone' THEN
   IF NOT EXISTS(SELECT 1 FROM saas.panel_sessions s JOIN saas.memberships m ON m.principal_id=s.principal_id AND m.store_id=pending.store_id AND m.status='active' AND m.support_session_id IS NULL WHERE s.session_id=pending.actor_session_id AND s.principal_id=pending.actor_id AND s.revoked_at IS NULL AND s.expires_at>n AND saas.admin_login_session_allowed(s.token_key_id,s.token_digest)) THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
   IF(phone.principal_id IS NOT NULL AND phone.principal_id<>pending.actor_id) OR EXISTS(SELECT 1 FROM saas.merchant_phone_identities WHERE principal_id=pending.actor_id AND id IS DISTINCT FROM phone.id) THEN RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;END IF;pid:=pending.actor_id;
  ELSE
   pid:=phone.principal_id;
   IF pending.purpose='login' AND NOT EXISTS(SELECT 1 FROM saas.memberships m JOIN saas.stores s ON s.id=m.store_id AND s.status='active' WHERE m.principal_id=pid AND m.status='active' AND m.support_session_id IS NULL AND(pending.store_id IS NULL OR m.store_id=pending.store_id)) AND NOT EXISTS(SELECT 1 FROM saas.merchant_phone_staff WHERE phone_id=phone.id AND enabled AND(pending.store_id IS NULL OR store_id=pending.store_id)) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
   IF pid IS NULL THEN pid:=gen_random_uuid();INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at,authority_kind) VALUES(pid,'urn:celebix:merchant-phone',pid::text,NULL,false,n,n,'phone');END IF;
  END IF;
  IF phone.id IS NULL THEN INSERT INTO saas.merchant_phone_identities(id,phone_key_id,phone_digest,phone_ciphertext,phone_masked,principal_id,verified_at) VALUES(gen_random_uuid(),pending.phone_key_id,pending.phone_digest,pending.phone_ciphertext,pending.phone_masked,pid,n) RETURNING * INTO phone;
  ELSE UPDATE saas.merchant_phone_identities SET principal_id=pid,verified_at=coalesce(verified_at,n) WHERE id=phone.id;END IF;
  UPDATE saas.merchant_phone_staff SET phone_id=phone.id,version=version+1,updated_at=n WHERE phone_id IS NULL AND membership_id IN(SELECT id FROM saas.memberships WHERE principal_id=pid AND support_session_id IS NULL);
  sid:=pending.store_id;
  IF pending.purpose='login' THEN
   -- Activate only grants made by a still-active ordinary store owner.
   FOR staff IN SELECT * FROM saas.merchant_phone_staff WHERE phone_id=phone.id AND enabled AND(sid IS NULL OR store_id=sid) ORDER BY store_id LOOP
    INSERT INTO saas.platform_store_versions(store_id) VALUES(staff.store_id) ON CONFLICT DO NOTHING;
    PERFORM 1 FROM saas.platform_store_versions WHERE store_id=staff.store_id FOR UPDATE;
    PERFORM pg_advisory_xact_lock(hashtextextended('merchant.staff:'||staff.store_id,0));
    SELECT * INTO staff FROM saas.merchant_phone_staff WHERE id=staff.id FOR UPDATE;
    IF NOT staff.enabled OR NOT EXISTS(SELECT 1 FROM saas.memberships WHERE store_id=staff.store_id AND principal_id=staff.created_by AND role='store_owner' AND status='active' AND support_session_id IS NULL) THEN CONTINUE;END IF;
    IF staff.membership_id IS NULL THEN
     IF EXISTS(SELECT 1 FROM saas.memberships WHERE principal_id=pid AND store_id=staff.store_id AND role='store_owner') THEN CONTINUE;END IF;
     SELECT s.plan_id INTO plan FROM saas.subscriptions s WHERE s.store_id=staff.store_id AND s.status='active' AND s.valid_from<=n AND(s.valid_until IS NULL OR s.valid_until>n) FOR SHARE;
     IF NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=plan AND feature_key='staff_management' AND enabled) OR NOT EXISTS(SELECT 1 FROM saas.plan_limits WHERE plan_id=plan AND limit_key='staff' AND effective_limit>=(SELECT count(*) FROM saas.memberships WHERE store_id=staff.store_id AND status='active' AND role<>'store_owner' AND support_session_id IS NULL)+(SELECT count(*) FROM saas.merchant_phone_staff WHERE store_id=staff.store_id AND enabled AND membership_id IS NULL)) THEN RETURN QUERY SELECT 'staff_limit_reached',NULL::jsonb;RETURN;END IF;
     INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES(gen_random_uuid(),pid,staff.store_id,staff.role,'active',n,n) ON CONFLICT(principal_id,store_id) WHERE support_session_id IS NULL DO UPDATE SET role=excluded.role,status='active',updated_at=n RETURNING id INTO mid;
     UPDATE saas.platform_store_versions SET version=version+1 WHERE store_id=staff.store_id;
     UPDATE saas.merchant_phone_staff SET membership_id=mid,version=version+1,updated_at=n WHERE id=staff.id;
    END IF;
   END LOOP;
  END IF;
  UPDATE saas.merchant_phone_pending SET principal_id=pid,verified_at=n WHERE pending_id=pending.pending_id;
  IF pending.purpose='signup' THEN RETURN QUERY SELECT 'phone_verified',saas.merchant_phone_projection(pending.pending_id);RETURN;END IF;
 ELSE
  IF pending.purpose<>'signup' OR pending.verified_at IS NULL OR pending.principal_id IS NULL THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb;RETURN;END IF;
  pid:=pending.principal_id;sid:=(p_input->>'storeId')::uuid;
  IF pending.signup_store_id IS DISTINCT FROM sid OR pending.signup_operation_id IS NULL THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.memberships WHERE principal_id=pid AND store_id=sid AND role='store_owner' AND status='active' AND support_session_id IS NULL) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.memberships m JOIN saas.stores s ON s.id=m.store_id AND s.status='active' WHERE m.principal_id=pid AND m.status='active' AND m.support_session_id IS NULL AND(sid IS NULL OR m.store_id=sid)) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.admin_login_factors(principal_id) VALUES(pid) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM saas.admin_login_factors WHERE principal_id=pid FOR UPDATE;
 INSERT INTO saas.admin_login_assurance(family_id,principal_id,security_version,expires_at,legacy,session_id,operation_id,token_key_id,token_digest,created_at,authentication_method)
 SELECT(p_input->>'familyId')::uuid,pid,f.security_version,n+interval '8 hours',false,(p_input->>'sessionId')::uuid,op,p_input->>'tokenKeyId',p_input->>'tokenDigest',n,'whatsapp' FROM saas.admin_login_factors f WHERE f.principal_id=pid;
 SELECT * INTO result FROM saas.issue_panel_session((p_input->>'sessionId')::uuid,(p_input->>'familyId')::uuid,op,p_input->>'tokenKeyId',p_input->>'tokenDigest',pid,sid,n,n+interval '8 hours');
 IF result.outcome NOT IN('issued','operation_replayed') THEN RAISE EXCEPTION 'MERCHANT_PHONE_SESSION_INVARIANT';END IF;
 destination:='https://'||pending.destination_hostname;
 IF pending.purpose='signup' THEN SELECT 'https://'||hostname INTO destination FROM saas.admin_domains WHERE store_id=sid AND status='active' AND verified_at<=n ORDER BY canonical DESC,created_at,hostname LIMIT 1;IF destination IS NULL THEN RAISE EXCEPTION 'MERCHANT_SIGNUP_DOMAIN_REQUIRED';END IF;END IF;
 body:=result.authority||jsonb_build_object('pendingId',pending.pending_id,'principalId',pid,'completedOperationId',op,'completionCiphertext',p_input->>'completionCiphertext','destinationOrigin',destination,'expiresAt',pending.expires_at);
 out:=CASE WHEN pending.purpose='bind_phone' THEN 'phone_bound' ELSE 'issued' END;
 UPDATE saas.merchant_phone_pending SET consumed_operation_id=op,consumed_input=p_input,consumed_outcome=out,consumed_authority=body WHERE pending_id=pending.pending_id;
 RETURN QUERY SELECT out,body;
END $f$;
CREATE FUNCTION saas.merchant_whatsapp_bootstrap_principal(p_pending uuid,p_digest text,p_browser text,p_environment text,p_operation uuid,p_store uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE pending saas.merchant_phone_pending;principal saas.principals;
BEGIN
 IF p_operation IS NULL OR p_store IS NULL THEN RAISE EXCEPTION 'MERCHANT_SIGNUP_PROOF_REQUIRED';END IF;
 SELECT * INTO pending FROM saas.merchant_phone_pending WHERE pending_id=p_pending AND pending_digest=p_digest AND browser_digest=p_browser AND environment=p_environment AND purpose='signup' AND expires_at>clock_timestamp() AND verified_at IS NOT NULL AND principal_id IS NOT NULL AND consumed_operation_id IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT(SELECT signup_enabled FROM saas.merchant_whatsapp_policy) THEN RAISE EXCEPTION 'MERCHANT_SIGNUP_PROOF_REQUIRED';END IF;
 IF pending.signup_operation_id IS NOT NULL AND(pending.signup_operation_id<>p_operation OR pending.signup_store_id<>p_store) THEN RAISE EXCEPTION 'MERCHANT_SIGNUP_ALREADY_BOUND';END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.merchant_phone_identities WHERE principal_id=pending.principal_id AND phone_key_id=pending.phone_key_id AND phone_digest=pending.phone_digest AND disabled_at IS NULL AND verified_at IS NOT NULL) THEN RAISE EXCEPTION 'MERCHANT_SIGNUP_PROOF_REQUIRED';END IF;
 SELECT * INTO principal FROM saas.principals WHERE id=pending.principal_id FOR SHARE;
 UPDATE saas.merchant_phone_pending SET signup_operation_id=p_operation,signup_store_id=p_store WHERE pending_id=p_pending;
 RETURN jsonb_build_object('id',principal.id,'issuer',principal.issuer,'subject',principal.subject,'authority_kind',principal.authority_kind,'email',principal.email,'email_verified',principal.email_verified,'created_at',to_char(principal.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'updated_at',to_char(principal.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $f$;
CREATE FUNCTION saas.merchant_phone_security_reset(p_operator uuid,p_principal uuid,p_operation uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE principal saas.principals;r record;
BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_operation IS NULL OR p_principal IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 1000 OR p_reason<>btrim(p_reason) THEN RAISE EXCEPTION 'invalid_input';END IF;
 SELECT * INTO principal FROM saas.principals WHERE id=p_principal;
 IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;
 SELECT * INTO r FROM saas.admin_login_security_invalidate(jsonb_build_object('issuer',principal.issuer,'subject',principal.subject,'eventId','merchant-support:'||p_operation,'reason','support_reset','operatorId',p_operator,'supportReason',p_reason));
 RETURN jsonb_build_object('outcome',r.outcome);
END $f$;
CREATE FUNCTION saas.merchant_whatsapp_capture_cutover() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF TG_OP='UPDATE' AND OLD.cutover_at IS NOT NULL AND NEW.cutover_at IS DISTINCT FROM OLD.cutover_at THEN RAISE EXCEPTION 'PHONE_CUTOVER_IMMUTABLE';END IF;
 IF NEW.enabled AND(TG_OP='INSERT' OR OLD.cutover_at IS NULL) THEN
  NEW.cutover_at:=clock_timestamp();
  INSERT INTO saas.admin_login_factors(principal_id) SELECT DISTINCT principal_id FROM saas.panel_sessions ON CONFLICT DO NOTHING;
  INSERT INTO saas.admin_login_assurance(family_id,principal_id,security_version,expires_at,legacy,session_id,operation_id,token_key_id,token_digest,created_at)
  SELECT s.family_id,s.principal_id,f.security_version,least(s.expires_at,s.issued_at+interval '8 hours'),true,s.session_id,s.operation_id,s.token_key_id,s.token_digest,s.issued_at FROM saas.panel_sessions s JOIN saas.admin_login_factors f ON f.principal_id=s.principal_id WHERE s.operation_kind='issue' AND s.issued_at<NEW.cutover_at AND s.expires_at>NEW.cutover_at AND(TG_TABLE_NAME='merchant_whatsapp_policy' OR s.active_store_id=(to_jsonb(NEW)->>'store_id')::uuid OR EXISTS(SELECT 1 FROM saas.memberships m WHERE m.principal_id=s.principal_id AND m.store_id=(to_jsonb(NEW)->>'store_id')::uuid))
  ON CONFLICT(family_id) DO UPDATE SET legacy=true,expires_at=least(saas.admin_login_assurance.expires_at,excluded.expires_at);
 END IF;RETURN NEW;
END $f$;
CREATE TRIGGER merchant_whatsapp_policy_cutover BEFORE UPDATE ON saas.merchant_whatsapp_policy FOR EACH ROW EXECUTE FUNCTION saas.merchant_whatsapp_capture_cutover();
CREATE TRIGGER merchant_whatsapp_store_policy_cutover BEFORE INSERT OR UPDATE ON saas.merchant_whatsapp_store_policy FOR EACH ROW EXECUTE FUNCTION saas.merchant_whatsapp_capture_cutover();
-- Preserve exact predecessors for a disabled-policy/data-empty rollback; never expose aliases.
DO $patch$
DECLARE r record;d text;old text;guard text;
BEGIN
 FOR r IN SELECT p.oid,p.proname,p.prosrc,p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname=ANY(ARRAY['admin_login_policy_enabled','admin_login_session_allowed','admin_login_guard_session','admin_login_security_command','admin_login_security_invalidate','issue_panel_session','resolve_panel_session','rotate_panel_session','redeem_cross_host_panel_handoff','platform_invitation_create','platform_invitation_start','platform_invitation_claim','platform_invitation_complete','platform_ownership_accept','platform_command','guard_tenant_operation_mutation','platform_store_usage','merchant_admin_authority_error']) LOOP
  INSERT INTO saas.merchant_whatsapp_original_functions VALUES(r.signature,r.definition);d:=r.definition;
  CASE r.proname
  WHEN 'admin_login_policy_enabled' THEN d:=replace(d,r.prosrc,' SELECT saas.merchant_whatsapp_policy_enabled(p_store) OR (SELECT enabled FROM saas.admin_login_policy WHERE singleton) OR coalesce((SELECT enabled FROM saas.admin_login_store_policy WHERE store_id=p_store),false) ');
  WHEN 'admin_login_session_allowed' THEN d:=replace(d,r.prosrc,' SELECT ('||r.prosrc||') AND (NOT EXISTS(SELECT 1 FROM saas.panel_sessions s WHERE s.token_key_id=p_key AND s.token_digest=p_digest AND saas.merchant_whatsapp_principal_enforced(s.principal_id,s.active_store_id)) OR EXISTS(SELECT 1 FROM saas.panel_sessions s JOIN saas.admin_login_assurance a ON a.family_id=s.family_id WHERE s.token_key_id=p_key AND s.token_digest=p_digest AND(a.legacy OR a.authentication_method=''whatsapp''))) ');
  WHEN 'admin_login_guard_session' THEN d:=regexp_replace(d,E'\\mBEGIN\\M',$guard$BEGIN
   IF (saas.merchant_whatsapp_principal_enforced(NEW.principal_id,NEW.active_store_id) OR EXISTS(SELECT 1 FROM saas.principals WHERE id=NEW.principal_id AND authority_kind='phone')) AND NOT EXISTS(SELECT 1 FROM saas.admin_login_assurance a WHERE a.family_id=NEW.family_id AND(a.legacy OR a.authentication_method='whatsapp')) THEN RAISE EXCEPTION 'MERCHANT_PHONE_REQUIRED';END IF;
  $guard$);
  WHEN 'issue_panel_session' THEN
   IF position('principal.email_verified' in d)=0 THEN RAISE EXCEPTION 'PHONE_PRINCIPAL_ISSUER_ANCHOR';END IF;
   d:=replace(d,'principal.email_verified','(principal.email_verified OR(principal.authority_kind=''phone'' AND EXISTS(SELECT 1 FROM saas.merchant_phone_identities p WHERE p.principal_id=principal.id AND p.verified_at IS NOT NULL AND p.disabled_at IS NULL)))');
   d:=regexp_replace(d,E'\\mBEGIN\\M',$guard$BEGIN
    IF (saas.merchant_whatsapp_principal_enforced(p_principal_id,p_active_store_id) OR EXISTS(SELECT 1 FROM saas.principals WHERE id=p_principal_id AND authority_kind='phone')) AND NOT EXISTS(SELECT 1 FROM saas.admin_login_assurance a WHERE a.family_id=p_family_id AND a.principal_id=p_principal_id AND(a.legacy OR a.authentication_method='whatsapp')) THEN RETURN QUERY SELECT 'mfa_required'::text,NULL::jsonb;RETURN;END IF;
   $guard$);
  WHEN 'resolve_panel_session','rotate_panel_session' THEN
   d:=replace(d,'principal.email_verified','(principal.email_verified OR(principal.authority_kind=''phone'' AND EXISTS(SELECT 1 FROM saas.merchant_phone_identities p WHERE p.principal_id=principal.id AND p.verified_at IS NOT NULL AND p.disabled_at IS NULL)))');
  WHEN 'redeem_cross_host_panel_handoff' THEN
   old:='INSERT INTO saas.admin_login_assurance(family_id,principal_id,security_version,expires_at,legacy,session_id,operation_id,token_key_id,token_digest,created_at)';
   IF position(old in d)=0 THEN RAISE EXCEPTION 'PHONE_HANDOFF_ASSURANCE_ANCHOR';END IF;
   d:=replace(d,old,replace(old,'created_at)','created_at,authentication_method)'));
   d:=replace(d,'p_session_token_digest,a.created_at FROM','p_session_token_digest,a.created_at,a.authentication_method FROM');
  WHEN 'admin_login_security_command' THEN d:=regexp_replace(d,E'\\mBEGIN\\M',$guard$BEGIN
   IF p_action IN('inspect_identity','begin','prepare_otp','verify_otp','verify_trust','verify_backup','prepare_management','finish_management','regenerate_backups') AND EXISTS(SELECT 1 FROM saas.principals pr WHERE ((pr.issuer=p_input->>'issuer' AND pr.subject=p_input->>'subject') OR pr.id=(SELECT principal_id FROM saas.admin_login_pending WHERE pending_id=(p_input->>'pendingId')::uuid)) AND saas.merchant_whatsapp_principal_enforced(pr.id,(SELECT store_id FROM saas.admin_domains WHERE hostname=p_input->>'destinationHostname' AND status='active' LIMIT 1))) THEN RETURN QUERY SELECT 'fresh_factor_required',NULL::jsonb;RETURN;END IF;
  $guard$);
  WHEN 'admin_login_security_invalidate' THEN
   d:=replace(d,' UPDATE saas.admin_login_factors SET security_version=security_version+1,', $guard$
   IF p_input->>'reason' IN('identity_reset','support_reset','suspension','deletion') THEN UPDATE saas.merchant_phone_identities SET disabled_at=n WHERE principal_id=pid AND disabled_at IS NULL;END IF;
   UPDATE saas.admin_login_factors SET security_version=security_version+1,$guard$);
  WHEN 'merchant_admin_authority_error' THEN
   d:=replace(d,r.prosrc,'SELECT CASE WHEN p_kind=''administrator_invite'' AND p_mutation THEN ''permission_denied''::text ELSE ('||r.prosrc||') END');
  WHEN 'platform_store_usage' THEN
   d:=replace(d,r.prosrc,'SELECT jsonb_set(value,''{staff}'',to_jsonb((value->>''staff'')::bigint+(SELECT count(*) FROM saas.merchant_phone_staff WHERE store_id=p_store AND enabled AND membership_id IS NULL))) FROM ('||r.prosrc||') old(value)');
  WHEN 'guard_tenant_operation_mutation' THEN
   d:=replace(d,'saas.platform_authorized_memberships AS membership','saas.memberships AS membership');
   d:=replace(d,'membership.id = NEW.result_membership_id','membership.id = NEW.result_membership_id AND membership.support_session_id IS NULL');
  WHEN 'platform_command' THEN d:=regexp_replace(d,E'\\mBEGIN\\M',$guard$BEGIN
   IF p_action='ownership.invite' THEN RAISE EXCEPTION 'merchant_invitations_retired';END IF;
   IF p_action='membership.update' AND saas.merchant_whatsapp_policy_enabled((p_payload->>'storeId')::uuid) THEN RAISE EXCEPTION 'merchant_owner_required';END IF;
  $guard$);
  ELSE
   -- Central TOTP stays intact; only membership-granting invitation authority retires.
   guard:='RAISE EXCEPTION ''merchant_invitations_retired'';';
   d:=regexp_replace(d,E'\\mBEGIN\\M','BEGIN '||guard);
  END CASE;
  IF d=r.definition THEN RAISE EXCEPTION 'PHONE_GUARD_NO_CHANGE %',r.proname;END IF;EXECUTE d;
 END LOOP;
END $patch$;
UPDATE saas.merchant_whatsapp_original_functions SET bootstrap_support_select_preexisting=has_column_privilege('celebix_saas_bootstrap','saas.memberships','support_session_id','SELECT');
GRANT SELECT(support_session_id) ON saas.memberships TO celebix_saas_bootstrap;
DO $security$ DECLARE t text;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['merchant_whatsapp_original_functions','merchant_whatsapp_policy','merchant_whatsapp_store_policy','merchant_phone_identities','merchant_phone_staff','merchant_phone_staff_versions','merchant_phone_operations','merchant_phone_pending','merchant_phone_challenges','whatsapp_otp_send_reservations'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_platform_operator',t);
 END LOOP;
 FOR r IN SELECT p.oid::regprocedure::text sig FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND(p.proname LIKE 'merchant_whatsapp_%' OR p.proname LIKE 'merchant_phone_%' OR p.proname='whatsapp_otp_reserve_send') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_platform_operator',r.sig);END LOOP;
END $security$;
GRANT EXECUTE ON FUNCTION saas.merchant_phone_security_reset(uuid,uuid,uuid,text) TO celebix_saas_platform_operator;
GRANT EXECUTE ON FUNCTION saas.merchant_whatsapp_bootstrap_principal(uuid,text,text,text,uuid,uuid) TO celebix_saas_bootstrap;
GRANT EXECUTE ON FUNCTION saas.merchant_whatsapp_command(text,jsonb) TO celebix_saas_identity;
COMMIT;
