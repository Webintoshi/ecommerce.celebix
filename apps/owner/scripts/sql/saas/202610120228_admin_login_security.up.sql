-- Native228. Merchant MFA only: existing platform operator/support TOTP is excluded.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
CREATE TABLE saas.admin_login_policy(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,cutover_at timestamptz);
INSERT INTO saas.admin_login_policy DEFAULT VALUES;
CREATE TABLE saas.admin_login_store_policy(store_id uuid PRIMARY KEY REFERENCES saas.stores(id),enabled boolean NOT NULL DEFAULT false,cutover_at timestamptz);
CREATE TABLE saas.admin_login_factors(principal_id uuid PRIMARY KEY REFERENCES saas.principals(id),security_version bigint NOT NULL DEFAULT 1 CHECK(security_version>0),phone_ciphertext text,phone_cipher_version bigint,phone_masked text,recipient_digest text,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK((phone_ciphertext IS NULL)=(recipient_digest IS NULL)),CHECK(recipient_digest IS NULL OR recipient_digest~'^[a-f0-9]{64}$'));
CREATE TABLE saas.admin_login_pending(pending_id uuid PRIMARY KEY,principal_id uuid NOT NULL REFERENCES saas.principals(id),store_id uuid NOT NULL REFERENCES saas.stores(id),destination_hostname text NOT NULL,environment text NOT NULL,pending_digest text NOT NULL CHECK(pending_digest~'^[a-f0-9]{64}$'),browser_digest text NOT NULL CHECK(browser_digest~'^[a-f0-9]{64}$'),password_proof_digest text NOT NULL UNIQUE CHECK(password_proof_digest~'^[a-f0-9]{64}$'),password_verified_at timestamptz NOT NULL,security_version bigint NOT NULL,operation_id uuid NOT NULL UNIQUE,purpose text NOT NULL CHECK(purpose IN('login','change_phone','manage')),created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,old_factor_verified_at timestamptz,consumed_operation_id uuid,consumed_input jsonb,consumed_authority jsonb, CHECK(expires_at=created_at+interval '10 minutes'));
CREATE TABLE saas.admin_login_otp(challenge_id uuid PRIMARY KEY,pending_id uuid NOT NULL REFERENCES saas.admin_login_pending(pending_id),principal_id uuid NOT NULL REFERENCES saas.principals(id),otp_digest text NOT NULL CHECK(otp_digest~'^[a-f0-9]{64}$'),recipient_digest text NOT NULL CHECK(recipient_digest~'^[a-f0-9]{64}$'),ip_digest text CHECK(ip_digest~'^[a-f0-9]{64}$'),phone_ciphertext text NOT NULL,phone_masked text NOT NULL,purpose text NOT NULL CHECK(purpose IN('login','enroll','old_factor','new_phone')),status text NOT NULL CHECK(status IN('pending','accepted','failed','ambiguous','consumed','superseded')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 6),created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,accepted_at timestamptz);
CREATE INDEX admin_login_otp_principal ON saas.admin_login_otp(principal_id,created_at);
CREATE INDEX admin_login_otp_recipient ON saas.admin_login_otp(recipient_digest,created_at);
CREATE INDEX admin_login_otp_ip ON saas.admin_login_otp(ip_digest,created_at);
CREATE TABLE saas.admin_login_trust(device_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,trust_digest text PRIMARY KEY CHECK(trust_digest~'^[a-f0-9]{64}$'),principal_id uuid NOT NULL REFERENCES saas.principals(id),environment text NOT NULL,security_version bigint NOT NULL,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,revoked_at timestamptz,CHECK(expires_at=created_at+interval '30 days'));
CREATE TABLE saas.admin_login_backups(principal_id uuid NOT NULL REFERENCES saas.principals(id),security_version bigint NOT NULL,backup_digest text NOT NULL CHECK(backup_digest~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL,consumed_at timestamptz,PRIMARY KEY(principal_id,backup_digest));
CREATE TABLE saas.admin_login_assurance(family_id uuid PRIMARY KEY,principal_id uuid NOT NULL REFERENCES saas.principals(id),security_version bigint NOT NULL,expires_at timestamptz NOT NULL,legacy boolean NOT NULL DEFAULT false,session_id uuid NOT NULL,operation_id uuid NOT NULL,token_key_id text NOT NULL,token_digest text NOT NULL,created_at timestamptz NOT NULL);
CREATE TABLE saas.admin_login_events(event_id text PRIMARY KEY,principal_id uuid NOT NULL REFERENCES saas.principals(id),reason text NOT NULL,operator_id text,support_reason text,created_at timestamptz NOT NULL);
-- Operation tombstones bind retries to the original authenticated actor and request.
CREATE TABLE saas.admin_login_management_operations(operation_id uuid PRIMARY KEY,principal_id uuid NOT NULL REFERENCES saas.principals(id),source_session_id uuid NOT NULL,action text NOT NULL CHECK(action IN('forget_devices','prepare_management')),input_binding jsonb NOT NULL,security_version bigint NOT NULL,status text NOT NULL CHECK(status IN('prepared','completed')),authority jsonb NOT NULL,completion_ciphertext text,created_at timestamptz NOT NULL,expires_at timestamptz);
CREATE INDEX admin_login_management_completion_expiry ON saas.admin_login_management_operations(expires_at,operation_id) WHERE completion_ciphertext IS NOT NULL;
-- Original definitions are retained only for a disabled-policy rollback, owned and private.
CREATE TABLE saas.admin_login_original_functions(signature text PRIMARY KEY,definition text NOT NULL);
DO $f$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['admin_login_policy','admin_login_store_policy','admin_login_factors','admin_login_pending','admin_login_otp','admin_login_trust','admin_login_backups','admin_login_assurance','admin_login_events','admin_login_management_operations','admin_login_original_functions'] LOOP EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON TABLE saas.%I FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver',t);END LOOP;END $f$;

CREATE FUNCTION saas.admin_login_policy_enabled(p_store uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT (SELECT enabled FROM saas.admin_login_policy WHERE singleton) OR coalesce((SELECT enabled FROM saas.admin_login_store_policy WHERE store_id=p_store),false) $f$;

CREATE FUNCTION saas.admin_login_principal_enforced(p_principal uuid,p_store uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT saas.admin_login_policy_enabled(p_store) OR (p_store IS NULL AND EXISTS(SELECT 1 FROM saas.memberships m WHERE m.principal_id=p_principal AND m.status='active' AND saas.admin_login_policy_enabled(m.store_id))) $f$;

CREATE FUNCTION saas.admin_login_capture_cutover() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF TG_OP='UPDATE' AND OLD.cutover_at IS NOT NULL AND NEW.cutover_at IS DISTINCT FROM OLD.cutover_at THEN RAISE EXCEPTION 'ADMIN_MFA_CUTOVER_IMMUTABLE';END IF;
 IF NEW.enabled AND (TG_OP='INSERT' OR OLD.cutover_at IS NULL) THEN
  NEW.cutover_at:=clock_timestamp();
  INSERT INTO saas.admin_login_factors(principal_id) SELECT DISTINCT principal_id FROM saas.panel_sessions ON CONFLICT DO NOTHING;
  INSERT INTO saas.admin_login_assurance(family_id,principal_id,security_version,expires_at,legacy,session_id,operation_id,token_key_id,token_digest,created_at)
  SELECT s.family_id,s.principal_id,f.security_version,least(s.expires_at,s.issued_at+interval '8 hours'),true,s.session_id,s.operation_id,s.token_key_id,s.token_digest,s.issued_at
  FROM saas.panel_sessions s JOIN saas.admin_login_factors f ON f.principal_id=s.principal_id
  WHERE s.operation_kind='issue' AND s.issued_at<NEW.cutover_at AND s.expires_at>NEW.cutover_at AND (TG_TABLE_NAME='admin_login_policy' OR (s.active_store_id IS NULL AND EXISTS(SELECT 1 FROM saas.memberships m WHERE m.principal_id=s.principal_id AND m.store_id=(to_jsonb(NEW)->>'store_id')::uuid)) OR s.active_store_id=(to_jsonb(NEW)->>'store_id')::uuid OR EXISTS(SELECT 1 FROM saas.panel_sessions child WHERE child.family_id=s.family_id AND child.active_store_id=(to_jsonb(NEW)->>'store_id')::uuid)) ON CONFLICT DO NOTHING;
 END IF;RETURN NEW;
END $f$;
CREATE TRIGGER admin_login_policy_cutover BEFORE UPDATE ON saas.admin_login_policy FOR EACH ROW EXECUTE FUNCTION saas.admin_login_capture_cutover();
CREATE TRIGGER admin_login_store_policy_cutover BEFORE INSERT OR UPDATE ON saas.admin_login_store_policy FOR EACH ROW EXECUTE FUNCTION saas.admin_login_capture_cutover();
CREATE FUNCTION saas.admin_login_session_allowed(p_key text,p_digest text,p_force boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT (NOT p_force AND NOT coalesce((SELECT saas.admin_login_principal_enforced(principal_id,active_store_id) FROM saas.panel_sessions WHERE token_key_id=p_key AND token_digest=p_digest),(SELECT enabled FROM saas.admin_login_policy)) AND NOT EXISTS(SELECT 1 FROM saas.panel_sessions s JOIN saas.admin_login_assurance a ON a.family_id=s.family_id WHERE s.token_key_id=p_key AND s.token_digest=p_digest)) OR EXISTS(
 SELECT 1 FROM saas.panel_sessions s JOIN saas.admin_login_assurance a ON a.family_id=s.family_id AND a.principal_id=s.principal_id JOIN saas.admin_login_factors f ON f.principal_id=a.principal_id AND f.security_version=a.security_version
 WHERE s.token_key_id=p_key AND s.token_digest=p_digest AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp() AND a.expires_at>statement_timestamp() AND s.expires_at<=a.expires_at)
$f$;
CREATE FUNCTION saas.admin_login_guard_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF (saas.admin_login_principal_enforced(NEW.principal_id,NEW.active_store_id) OR EXISTS(SELECT 1 FROM saas.admin_login_assurance WHERE family_id=NEW.family_id)) AND NOT EXISTS(SELECT 1 FROM saas.admin_login_assurance a JOIN saas.admin_login_factors f ON f.principal_id=a.principal_id AND f.security_version=a.security_version WHERE a.family_id=NEW.family_id AND a.principal_id=NEW.principal_id AND NEW.expires_at<=a.expires_at AND a.expires_at>clock_timestamp() AND (NEW.operation_kind='rotate' OR(a.session_id=NEW.session_id AND a.operation_id=NEW.operation_id AND a.token_key_id=NEW.token_key_id AND a.token_digest=NEW.token_digest))) THEN RAISE EXCEPTION 'ADMIN_MFA_REQUIRED';END IF;RETURN NEW;
END $f$;
CREATE TRIGGER admin_login_session_guard BEFORE INSERT ON saas.panel_sessions FOR EACH ROW EXECUTE FUNCTION saas.admin_login_guard_session();

CREATE FUNCTION saas.admin_login_projection(p_pending uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_strip_nulls(jsonb_build_object('pendingId',p.pending_id,'displayName',(SELECT name FROM saas.stores WHERE id=p.store_id),'backupCodesRemaining',(SELECT count(*) FROM saas.admin_login_backups b WHERE b.principal_id=p.principal_id AND b.security_version=f.security_version AND b.consumed_at IS NULL),'principalId',p.principal_id,'securityVersion',f.security_version,'factorVersion',f.security_version,'activeStoreId',p.store_id,'destinationOrigin','https://'||p.destination_hostname,'environment',p.environment,'purpose',p.purpose,'enrolled',f.phone_ciphertext IS NOT NULL,'phoneCiphertext',f.phone_ciphertext,'phoneCipherVersion',f.phone_cipher_version,'phoneMasked',coalesce(c.phone_masked,f.phone_masked),'challengePhoneCiphertext',c.phone_ciphertext,'challengeRecipientDigest',c.recipient_digest,'challengePhoneCipherVersion',CASE WHEN c.purpose IN('enroll','new_phone') THEN p.security_version ELSE f.phone_cipher_version END,'recipientDigest',f.recipient_digest,'expiresAt',p.expires_at,'oldFactorVerified',p.old_factor_verified_at IS NOT NULL,'challengeId',c.challenge_id,'resendAt',(SELECT max(created_at)+interval '60 seconds' FROM saas.admin_login_otp WHERE principal_id=p.principal_id))) FROM saas.admin_login_pending p JOIN saas.admin_login_factors f ON f.principal_id=p.principal_id LEFT JOIN LATERAL(SELECT * FROM saas.admin_login_otp WHERE pending_id=p.pending_id AND status='accepted' ORDER BY created_at DESC LIMIT 1) c ON true WHERE p.pending_id=p_pending
$f$;

-- Retain audit/session bindings while removing short-lived encrypted recovery material.
CREATE INDEX admin_login_pending_completion_expiry ON saas.admin_login_pending(expires_at,pending_id)
 WHERE consumed_input?'completionCiphertext' OR consumed_authority?'completionCiphertext';
CREATE FUNCTION saas.admin_login_cleanup_expired_completions() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 WITH expired AS (
  SELECT pending_id FROM saas.admin_login_pending
  WHERE expires_at<=statement_timestamp() AND (consumed_input?'completionCiphertext' OR consumed_authority?'completionCiphertext')
  ORDER BY expires_at,pending_id LIMIT 100 FOR UPDATE SKIP LOCKED
 ), cleaned AS (
  UPDATE saas.admin_login_pending p SET consumed_input=p.consumed_input-'completionCiphertext',consumed_authority=p.consumed_authority-'completionCiphertext'
  FROM expired e WHERE p.pending_id=e.pending_id RETURNING p.pending_id
 ), expired_management AS (
  SELECT operation_id FROM saas.admin_login_management_operations WHERE expires_at<=statement_timestamp() AND completion_ciphertext IS NOT NULL
  ORDER BY expires_at,operation_id LIMIT (100-(SELECT count(*) FROM cleaned)) FOR UPDATE SKIP LOCKED
 ), cleaned_management AS (
  UPDATE saas.admin_login_management_operations m SET completion_ciphertext=NULL FROM expired_management e WHERE m.operation_id=e.operation_id RETURNING m.operation_id
 ) SELECT ((SELECT count(*) FROM cleaned)+(SELECT count(*) FROM cleaned_management))::integer
$f$;

CREATE FUNCTION saas.admin_login_security_command(p_action text,p_input jsonb) RETURNS TABLE(outcome text,authority jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE n timestamptz:=clock_timestamp();pid uuid;sid uuid;source_session saas.panel_sessions%ROWTYPE;management saas.admin_login_management_operations%ROWTYPE;operation_binding jsonb;created integer;changed integer;f saas.admin_login_factors%ROWTYPE;p saas.admin_login_pending%ROWTYPE;c saas.admin_login_otp%ROWTYPE;receipt text;masked text;cipher text;purpose text;out_result text;result jsonb;keys text[];required text[];k text;v jsonb;bind text[]:=ARRAY['pendingId','pendingDigest','browserDigest','environment'];sess text[]:=ARRAY['operationId','sessionId','familyId','tokenKeyId','tokenDigest'];identity_keys text[]:=ARRAY['issuer','subject','destinationHostname','environment'];
BEGIN
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 CASE p_action
 WHEN 'inspect_identity' THEN required:=identity_keys;keys:=required;
 WHEN 'begin' THEN required:=bind||identity_keys||ARRAY['operationId','passwordProofDigest','passwordVerifiedAt'];keys:=required||ARRAY['purpose'];
 WHEN 'read' THEN required:=bind;keys:=required;
 WHEN 'prepare_otp' THEN required:=bind||ARRAY['challengeId','otpDigest','recipientDigest'];keys:=required||ARRAY['phoneCiphertext','phoneMasked','ipDigest'];
 WHEN 'finish_delivery' THEN required:=bind||ARRAY['challengeId','status'];keys:=required;
 WHEN 'verify_otp' THEN required:=bind||sess||ARRAY['challengeId','otpDigest'];keys:=required||ARRAY['backupDigests','rememberTrustDigest','completionCiphertext'];
 WHEN 'verify_backup' THEN required:=bind||sess||ARRAY['backupDigest'];keys:=required||ARRAY['completionCiphertext'];
 WHEN 'verify_trust' THEN required:=bind||sess||ARRAY['trustDigest'];keys:=required||ARRAY['completionCiphertext'];
 WHEN 'security_state' THEN required:=ARRAY['tokenKeyId','tokenDigest'];keys:=required||ARRAY['destinationHostname'];
 WHEN 'forget_devices' THEN required:=ARRAY['operationId','tokenKeyId','tokenDigest'];keys:=required||ARRAY['trustDigest','deviceId'];
 WHEN 'prepare_management','read_management','finish_management' THEN required:=ARRAY['operationId','tokenKeyId','tokenDigest','purpose','destinationHostname','environment','browserDigest'];IF p_action='finish_management' THEN required:=required||ARRAY['completionCiphertext'];END IF;keys:=required;
 WHEN 'regenerate_backups' THEN required:=bind||ARRAY['operationId','backupDigests'];keys:=required||ARRAY['completionCiphertext'];
 ELSE RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END CASE;
 IF NOT(p_input ?& required) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) x WHERE NOT(x=ANY(keys||ARRAY['now']))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_input) LOOP
 IF k='backupDigests' THEN
  IF jsonb_typeof(v)<>'array' OR jsonb_array_length(v)<>10 OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(v) x WHERE x~'^[a-f0-9]{64}$')<>10 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 ELSE
  IF jsonb_typeof(v)<>'string' OR length(p_input->>k)=0 OR (p_input->>k)<>btrim(p_input->>k) OR (p_input->>k)~'[[:cntrl:]]' OR length(p_input->>k)>(CASE WHEN k='completionCiphertext' THEN 32768 WHEN k='phoneCiphertext' THEN 4096 ELSE 2048 END) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF k LIKE '%Digest' AND (p_input->>k)!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF k=ANY(ARRAY['pendingId','operationId','sessionId','familyId','challengeId','deviceId']) AND (p_input->>k)!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 END IF;END LOOP;
 IF p_action IN('prepare_management','read_management','finish_management') AND p_input->>'purpose' NOT IN('manage','change_phone') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_input?'now' AND abs(extract(epoch FROM n-(p_input->>'now')::timestamptz))>30 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM saas.admin_login_cleanup_expired_completions();
 IF p_action IN('inspect_identity','begin') THEN
  SELECT pr.id,d.store_id INTO pid,sid FROM saas.principals pr JOIN saas.memberships m ON m.principal_id=pr.id AND m.status='active' AND m.role IN('store_owner','admin','editor','analyst','cashier') JOIN saas.stores s ON s.id=m.store_id AND s.status='active' JOIN saas.admin_domains d ON d.store_id=s.id AND d.hostname=p_input->>'destinationHostname' AND d.status='active' AND d.verified_at<=n
  WHERE pr.issuer=p_input->>'issuer' AND pr.subject=p_input->>'subject' AND pr.email_verified LIMIT 1;
  IF pid IS NULL THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.admin_login_factors(principal_id) VALUES(pid) ON CONFLICT DO NOTHING;
  SELECT * INTO f FROM saas.admin_login_factors WHERE principal_id=pid FOR UPDATE;
  IF p_action='inspect_identity' THEN RETURN QUERY SELECT CASE WHEN saas.admin_login_policy_enabled(sid) THEN 'required' ELSE 'disabled' END,jsonb_build_object('principalId',pid,'securityVersion',f.security_version,'activeStoreId',sid,'destinationOrigin','https://'||(p_input->>'destinationHostname'),'displayName',(SELECT name FROM saas.stores WHERE id=sid),'phoneCiphertext',f.phone_ciphertext,'phoneCipherVersion',f.phone_cipher_version,'phoneMasked',f.phone_masked,'recipientDigest',f.recipient_digest,'policyCutoverAt',coalesce((SELECT cutover_at FROM saas.admin_login_store_policy WHERE store_id=sid),cutover_at)) FROM saas.admin_login_policy;RETURN;END IF;
  IF NOT saas.admin_login_policy_enabled(sid) THEN RETURN QUERY SELECT 'disabled',NULL::jsonb;RETURN;END IF;
  IF (p_input->>'passwordVerifiedAt')::timestamptz<n-interval '5 minutes' OR (p_input->>'passwordVerifiedAt')::timestamptz>n+interval '30 seconds' OR coalesce(p_input->>'purpose','login') NOT IN('login','change_phone','manage') THEN RETURN QUERY SELECT 'first_factor_required',NULL::jsonb;RETURN;END IF;
  IF coalesce(p_input->>'purpose','login')<>'login' AND f.phone_ciphertext IS NULL THEN RETURN QUERY SELECT 'fresh_factor_required',NULL::jsonb;RETURN;END IF;
  SELECT * INTO p FROM saas.admin_login_pending WHERE operation_id=(p_input->>'operationId')::uuid OR pending_id=(p_input->>'pendingId')::uuid OR password_proof_digest=p_input->>'passwordProofDigest';
  IF FOUND THEN IF p.pending_id<>(p_input->>'pendingId')::uuid OR p.operation_id<>(p_input->>'operationId')::uuid OR p.principal_id<>pid OR p.store_id<>sid OR p.destination_hostname<>p_input->>'destinationHostname' OR p.environment<>p_input->>'environment' OR p.pending_digest<>p_input->>'pendingDigest' OR p.browser_digest<>p_input->>'browserDigest' OR p.password_proof_digest<>p_input->>'passwordProofDigest' OR p.password_verified_at<>(p_input->>'passwordVerifiedAt')::timestamptz OR p.purpose<>coalesce(p_input->>'purpose','login') THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'pending',saas.admin_login_projection(p.pending_id);END IF;RETURN;END IF;
  INSERT INTO saas.admin_login_pending VALUES((p_input->>'pendingId')::uuid,pid,sid,p_input->>'destinationHostname',p_input->>'environment',p_input->>'pendingDigest',p_input->>'browserDigest',p_input->>'passwordProofDigest',(p_input->>'passwordVerifiedAt')::timestamptz,f.security_version,(p_input->>'operationId')::uuid,coalesce(p_input->>'purpose','login'),n,n+interval '10 minutes',NULL,NULL,NULL,NULL);
  RETURN QUERY SELECT 'pending',saas.admin_login_projection((p_input->>'pendingId')::uuid);RETURN;
 END IF;
 IF p_action IN('security_state','forget_devices','prepare_management','read_management','finish_management') THEN
  IF NOT saas.admin_login_session_allowed(p_input->>'tokenKeyId',p_input->>'tokenDigest') THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
  SELECT * INTO source_session FROM saas.panel_sessions WHERE token_key_id=p_input->>'tokenKeyId' AND token_digest=p_input->>'tokenDigest' AND revoked_at IS NULL AND expires_at>n;
  pid:=source_session.principal_id;sid:=source_session.active_store_id;
  IF pid IS NULL THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.admin_login_factors(principal_id) VALUES(pid) ON CONFLICT DO NOTHING;
  SELECT * INTO f FROM saas.admin_login_factors WHERE principal_id=pid FOR UPDATE;
  -- Invalidation takes the same principal lock. Recheck after waiting for it.
  IF NOT saas.admin_login_session_allowed(p_input->>'tokenKeyId',p_input->>'tokenDigest') OR NOT EXISTS(SELECT 1 FROM saas.panel_sessions WHERE session_id=source_session.session_id AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
  IF p_input?'destinationHostname' AND NOT EXISTS(SELECT 1 FROM saas.admin_domains WHERE store_id=sid AND hostname=p_input->>'destinationHostname' AND status='active' AND verified_at<=n) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF p_action<>'security_state' THEN
   operation_binding:=p_input-ARRAY['now','completionCiphertext'];created:=0;
   IF p_action IN('forget_devices','prepare_management') AND NOT EXISTS(SELECT 1 FROM saas.admin_login_management_operations WHERE operation_id=(p_input->>'operationId')::uuid) THEN
    INSERT INTO saas.admin_login_management_operations VALUES((p_input->>'operationId')::uuid,pid,source_session.session_id,p_action,operation_binding,f.security_version,'prepared',jsonb_build_object('principalId',pid,'securityVersion',f.security_version,'activeStoreId',sid,'destinationOrigin','https://'||(p_input->>'destinationHostname'),'operationId',p_input->>'operationId','expiresAt',least(source_session.expires_at,n+interval '10 minutes')),NULL,n,CASE WHEN p_action='prepare_management' THEN least(source_session.expires_at,n+interval '10 minutes') END) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS created=ROW_COUNT;
   END IF;
   SELECT * INTO management FROM saas.admin_login_management_operations WHERE operation_id=(p_input->>'operationId')::uuid AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR UPDATE;
   IF NOT FOUND THEN RETURN QUERY SELECT CASE WHEN EXISTS(SELECT 1 FROM saas.admin_login_management_operations WHERE operation_id=(p_input->>'operationId')::uuid) THEN 'operation_expired' ELSE 'not_found' END,NULL::jsonb;RETURN;END IF;
   IF management.principal_id<>pid OR management.source_session_id<>source_session.session_id OR management.input_binding IS DISTINCT FROM operation_binding OR management.action<>(CASE WHEN p_action='forget_devices' THEN 'forget_devices' ELSE 'prepare_management' END) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
   IF management.security_version<>f.security_version OR (management.expires_at IS NOT NULL AND management.expires_at<=clock_timestamp()) THEN RETURN QUERY SELECT 'operation_expired',NULL::jsonb;RETURN;END IF;
   IF p_action='forget_devices' THEN
    IF management.status='completed' THEN RETURN QUERY SELECT 'operation_replayed',management.authority;RETURN;END IF;
    UPDATE saas.admin_login_trust SET revoked_at=n WHERE principal_id=pid AND revoked_at IS NULL AND (NOT(p_input?'trustDigest') OR trust_digest=p_input->>'trustDigest') AND (NOT(p_input?'deviceId') OR device_id=(p_input->>'deviceId')::uuid);
    GET DIAGNOSTICS changed=ROW_COUNT;result:=jsonb_build_object('revokedDevices',changed);
    UPDATE saas.admin_login_management_operations SET status='completed',authority=result WHERE operation_id=management.operation_id;
    RETURN QUERY SELECT 'forgotten',result;RETURN;
   END IF;
   IF p_action='finish_management' THEN
    IF management.status='completed' THEN
     IF management.completion_ciphertext IS DISTINCT FROM p_input->>'completionCiphertext' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',management.authority||jsonb_build_object('completionCiphertext',management.completion_ciphertext);END IF;RETURN;
    END IF;
    UPDATE saas.admin_login_management_operations SET status='completed',completion_ciphertext=p_input->>'completionCiphertext' WHERE operation_id=management.operation_id;
    RETURN QUERY SELECT 'completed',management.authority||jsonb_build_object('completionCiphertext',p_input->>'completionCiphertext');RETURN;
   END IF;
   RETURN QUERY SELECT CASE WHEN management.status='completed' THEN 'completed' WHEN created=1 THEN 'prepared' ELSE 'prepared_existing' END,management.authority||CASE WHEN management.status='completed' THEN jsonb_build_object('completionCiphertext',management.completion_ciphertext) ELSE '{}'::jsonb END;RETURN;
  END IF;
  RETURN QUERY SELECT 'resolved',jsonb_build_object('policyEnabled',saas.admin_login_policy_enabled(sid),'principalId',pid,'activeStoreId',sid,'destinationOrigin',(SELECT 'https://'||hostname FROM saas.admin_domains WHERE store_id=sid AND (NOT(p_input?'destinationHostname') OR hostname=p_input->>'destinationHostname') AND status='active' AND verified_at<=n ORDER BY canonical DESC,hostname LIMIT 1),'securityVersion',security_version,'phoneCipherVersion',phone_cipher_version,'phoneMasked',phone_masked,'backupCodesRemaining',(SELECT count(*) FROM saas.admin_login_backups WHERE principal_id=pid AND consumed_at IS NULL),'trustedDevices',(SELECT coalesce(jsonb_agg(jsonb_build_object('deviceId',device_id,'createdAt',created_at,'expiresAt',expires_at)),'[]') FROM saas.admin_login_trust WHERE principal_id=pid AND revoked_at IS NULL AND expires_at>n)) FROM saas.admin_login_factors WHERE principal_id=pid;RETURN;
 END IF;
 -- Lock principal first, then pending, consistently across all redemption and invalidation calls.
 SELECT principal_id INTO pid FROM saas.admin_login_pending WHERE pending_id=(p_input->>'pendingId')::uuid;
 SELECT * INTO f FROM saas.admin_login_factors WHERE principal_id=pid FOR UPDATE;
 SELECT * INTO p FROM saas.admin_login_pending WHERE pending_id=(p_input->>'pendingId')::uuid AND expires_at>clock_timestamp() FOR UPDATE;
 IF p.pending_id IS NULL OR p.pending_digest<>p_input->>'pendingDigest' OR p.browser_digest<>p_input->>'browserDigest' OR p.environment<>p_input->>'environment' OR p.security_version<>f.security_version OR p.expires_at<=n THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
 IF p.consumed_operation_id IS NOT NULL THEN
  IF p_action='read' THEN RETURN QUERY SELECT 'completed',p.consumed_authority||jsonb_build_object('completedOperationId',p.consumed_operation_id);RETURN;END IF;
  IF p_input?'operationId' AND p.consumed_operation_id=(p_input->>'operationId')::uuid THEN
   IF p.consumed_input IS DISTINCT FROM (p_input-'now') THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',p.consumed_authority;END IF;
  ELSE RETURN QUERY SELECT 'consumed',NULL::jsonb;END IF;RETURN;
 END IF;
 IF p_action='read' THEN RETURN QUERY SELECT 'pending',saas.admin_login_projection(p.pending_id);RETURN;END IF;
 IF p_action='prepare_otp' THEN
  purpose:=CASE WHEN p.purpose='change_phone' AND p.old_factor_verified_at IS NOT NULL THEN 'new_phone' WHEN f.phone_ciphertext IS NULL THEN 'enroll' WHEN p.purpose IN('change_phone','manage') THEN 'old_factor' ELSE 'login' END;
  IF purpose IN('enroll','new_phone') THEN cipher:=p_input->>'phoneCiphertext';masked:=p_input->>'phoneMasked';receipt:=p_input->>'recipientDigest';ELSE cipher:=f.phone_ciphertext;masked:=f.phone_masked;receipt:=f.recipient_digest;END IF;
  IF cipher IS NULL OR masked IS NULL OR receipt IS DISTINCT FROM p_input->>'recipientDigest' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  -- Shared recipient/IP locks prevent cross-principal send-budget races.
  PERFORM pg_advisory_xact_lock(hashtextextended(receipt,22801));IF p_input?'ipDigest' THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_input->>'ipDigest',22802));END IF;
  SELECT * INTO c FROM saas.admin_login_otp WHERE challenge_id=(p_input->>'challengeId')::uuid;
  IF FOUND THEN
   IF c.pending_id<>p.pending_id OR c.otp_digest<>p_input->>'otpDigest' OR c.recipient_digest<>receipt THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT c.status,saas.admin_login_projection(p.pending_id)||jsonb_build_object('challengeId',c.challenge_id,'deliveryStatus',c.status,'expiresAt',c.expires_at,'resendAt',c.created_at+interval '60 seconds');END IF;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.admin_login_otp WHERE principal_id=pid AND created_at>n-interval '60 seconds') THEN RETURN QUERY SELECT 'resend_wait',saas.admin_login_projection(p.pending_id);RETURN;END IF;
  IF (SELECT count(*) FROM saas.admin_login_otp WHERE principal_id=pid AND created_at>n-interval '15 minutes')>=5 OR (SELECT count(*) FROM saas.admin_login_otp WHERE recipient_digest=receipt AND created_at>n-interval '15 minutes')>=5 OR (p_input?'ipDigest' AND (SELECT count(*) FROM saas.admin_login_otp WHERE ip_digest=p_input->>'ipDigest' AND created_at>n-interval '15 minutes')>=30) THEN RETURN QUERY SELECT 'rate_limited',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.admin_login_otp VALUES((p_input->>'challengeId')::uuid,p.pending_id,pid,p_input->>'otpDigest',receipt,p_input->>'ipDigest',cipher,masked,purpose,'pending',0,n,n+interval '10 minutes',NULL);
  RETURN QUERY SELECT 'prepared',jsonb_build_object('challengeId',p_input->>'challengeId','phoneCiphertext',cipher,'expiresAt',n+interval '10 minutes','resendAt',n+interval '60 seconds');RETURN;
 END IF;
 IF p_action='finish_delivery' THEN
  SELECT * INTO c FROM saas.admin_login_otp WHERE challenge_id=(p_input->>'challengeId')::uuid AND pending_id=p.pending_id FOR UPDATE;
  IF NOT FOUND OR p_input->>'status' NOT IN('accepted','failed','ambiguous') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF c.status<>'pending' THEN RETURN QUERY SELECT CASE WHEN c.status=p_input->>'status' THEN c.status ELSE 'operation_mismatch' END,NULL::jsonb;RETURN;END IF;
  IF p_input->>'status'='accepted' THEN UPDATE saas.admin_login_otp SET status='superseded' WHERE pending_id=p.pending_id AND status='accepted';END IF;
  UPDATE saas.admin_login_otp SET status=p_input->>'status',accepted_at=CASE WHEN p_input->>'status'='accepted' THEN n END WHERE challenge_id=c.challenge_id;
  RETURN QUERY SELECT p_input->>'status',saas.admin_login_projection(p.pending_id);RETURN;
 END IF;
 IF p_action='regenerate_backups' THEN
  IF p.purpose<>'manage' OR p.old_factor_verified_at IS NULL THEN RETURN QUERY SELECT 'fresh_factor_required',NULL::jsonb;RETURN;END IF;
  DELETE FROM saas.admin_login_backups WHERE principal_id=pid;
  INSERT INTO saas.admin_login_backups SELECT pid,f.security_version,x,n,NULL FROM jsonb_array_elements_text(p_input->'backupDigests') x;
  result:=jsonb_build_object('completionCiphertext',p_input->>'completionCiphertext');UPDATE saas.admin_login_pending SET consumed_operation_id=(p_input->>'operationId')::uuid,consumed_input=p_input-'now',consumed_authority=result WHERE pending_id=p.pending_id;
  RETURN QUERY SELECT 'regenerated',result;RETURN;
 END IF;
 IF p_action='verify_otp' THEN
  SELECT * INTO c FROM saas.admin_login_otp WHERE challenge_id=(p_input->>'challengeId')::uuid AND pending_id=p.pending_id FOR UPDATE;
  IF NOT FOUND OR c.status<>'accepted' OR c.expires_at<=n THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb;RETURN;END IF;
  IF c.purpose='enroll' AND f.phone_ciphertext IS NOT NULL THEN RETURN QUERY SELECT 'factor_changed',NULL::jsonb;RETURN;END IF;
  IF c.attempts>=6 THEN RETURN QUERY SELECT 'locked',NULL::jsonb;RETURN;END IF;
  IF c.otp_digest<>p_input->>'otpDigest' THEN UPDATE saas.admin_login_otp SET attempts=attempts+1 WHERE challenge_id=c.challenge_id;RETURN QUERY SELECT CASE WHEN c.attempts=5 THEN 'locked' ELSE 'invalid_code' END,NULL::jsonb;RETURN;END IF;
  IF c.purpose IN('enroll','new_phone') AND NOT(p_input?'backupDigests') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 ELSIF p_action='verify_backup' THEN
  IF NOT EXISTS(SELECT 1 FROM saas.admin_login_backups WHERE principal_id=pid AND security_version=f.security_version AND backup_digest=p_input->>'backupDigest' AND consumed_at IS NULL) THEN RETURN QUERY SELECT 'invalid_code',NULL::jsonb;RETURN;END IF;
 ELSIF p_action='verify_trust' THEN
  IF p.purpose<>'login' OR NOT EXISTS(SELECT 1 FROM saas.admin_login_trust WHERE principal_id=pid AND environment=p.environment AND security_version=f.security_version AND trust_digest=p_input->>'trustDigest' AND revoked_at IS NULL AND expires_at>n) THEN RETURN QUERY SELECT 'invalid_code',NULL::jsonb;RETURN;END IF;
 ELSE RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Membership and exact destination must still be active at consumption time.
 IF NOT EXISTS(SELECT 1 FROM saas.memberships m JOIN saas.stores s ON s.id=m.store_id AND s.status='active' JOIN saas.admin_domains d ON d.store_id=s.id AND d.hostname=p.destination_hostname AND d.status='active' AND d.verified_at<=n WHERE m.principal_id=pid AND m.store_id=p.store_id AND m.status='active') THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p.purpose IN('manage','change_phone') AND p.old_factor_verified_at IS NULL THEN
  IF p_action='verify_otp' THEN UPDATE saas.admin_login_otp SET status='consumed' WHERE challenge_id=c.challenge_id;ELSE UPDATE saas.admin_login_backups SET consumed_at=n WHERE principal_id=pid AND backup_digest=p_input->>'backupDigest';END IF;
  UPDATE saas.admin_login_pending SET old_factor_verified_at=n WHERE pending_id=p.pending_id;
  RETURN QUERY SELECT 'old_factor_verified',saas.admin_login_projection(p.pending_id);RETURN;
 END IF;
 IF p.purpose='manage' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p.purpose='change_phone' AND (p_action<>'verify_otp' OR c.purpose<>'new_phone') THEN RETURN QUERY SELECT 'fresh_factor_required',NULL::jsonb;RETURN;END IF;
 IF c.purpose='new_phone' THEN
  UPDATE saas.admin_login_factors SET security_version=security_version+1 WHERE principal_id=pid RETURNING * INTO f;
  UPDATE saas.admin_login_trust SET revoked_at=n WHERE principal_id=pid AND revoked_at IS NULL;
 UPDATE saas.panel_sessions SET revoked_at=n,revocation_reason='security',version=version+1,updated_at=n WHERE principal_id=pid AND revoked_at IS NULL;
 END IF;
 IF p_action='verify_otp' AND c.purpose IN('enroll','new_phone') THEN
  UPDATE saas.admin_login_factors SET phone_ciphertext=c.phone_ciphertext,phone_cipher_version=p.security_version,phone_masked=c.phone_masked,recipient_digest=c.recipient_digest,updated_at=n WHERE principal_id=pid;
  DELETE FROM saas.admin_login_backups WHERE principal_id=pid;
  INSERT INTO saas.admin_login_backups SELECT pid,f.security_version,x,n,NULL FROM jsonb_array_elements_text(p_input->'backupDigests') x;
 END IF;
 INSERT INTO saas.admin_login_assurance VALUES((p_input->>'familyId')::uuid,pid,f.security_version,n+interval '8 hours',false,(p_input->>'sessionId')::uuid,(p_input->>'operationId')::uuid,p_input->>'tokenKeyId',p_input->>'tokenDigest',n);
 SELECT i.outcome,i.authority INTO out_result,result FROM saas.issue_panel_session((p_input->>'sessionId')::uuid,(p_input->>'familyId')::uuid,(p_input->>'operationId')::uuid,p_input->>'tokenKeyId',p_input->>'tokenDigest',pid,p.store_id,n,n+interval '8 hours') i;
 IF out_result NOT IN('issued','operation_replayed') THEN RAISE EXCEPTION 'ADMIN_MFA_SESSION_ISSUE_FAILED';END IF;
 IF p_action='verify_otp' THEN UPDATE saas.admin_login_otp SET status='consumed' WHERE challenge_id=c.challenge_id;ELSIF p_action='verify_backup' THEN UPDATE saas.admin_login_backups SET consumed_at=n WHERE principal_id=pid AND backup_digest=p_input->>'backupDigest';END IF;
 IF p_input?'rememberTrustDigest' THEN INSERT INTO saas.admin_login_trust(trust_digest,principal_id,environment,security_version,created_at,expires_at,revoked_at) VALUES(p_input->>'rememberTrustDigest',pid,p.environment,f.security_version,n,n+interval '30 days',NULL);END IF;
 result:=result||jsonb_build_object('completionCiphertext',p_input->>'completionCiphertext','destinationOrigin','https://'||p.destination_hostname,'securityVersion',f.security_version);
 UPDATE saas.admin_login_pending SET security_version=f.security_version,consumed_operation_id=(p_input->>'operationId')::uuid,consumed_input=p_input-'now',consumed_authority=result WHERE pending_id=p.pending_id;
 RETURN QUERY SELECT 'issued',result;
END $f$;

CREATE FUNCTION saas.admin_login_security_invalidate(p_input jsonb) RETURNS TABLE(outcome text,authority jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE pid uuid; n timestamptz:=clock_timestamp();e saas.admin_login_events%ROWTYPE;
BEGIN
 IF p_input IS NULL OR NOT(p_input?&ARRAY['issuer','subject','eventId','reason']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) x WHERE NOT(x=ANY(ARRAY['issuer','subject','eventId','reason','operatorId','supportReason','now']))) OR coalesce(length(p_input->>'eventId'),0) NOT BETWEEN 1 AND 512 OR (p_input->>'reason') NOT IN('password_reset','identity_reset','suspension','deletion','support_reset') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_input->>'reason'='support_reset' AND(coalesce(length(p_input->>'operatorId'),0)=0 OR coalesce(length(p_input->>'supportReason'),0)<10) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT id INTO pid FROM saas.principals WHERE issuer=p_input->>'issuer' AND subject=p_input->>'subject';IF pid IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.admin_login_factors(principal_id) VALUES(pid) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM saas.admin_login_factors WHERE principal_id=pid FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_input->>'eventId',22803));
 SELECT * INTO e FROM saas.admin_login_events WHERE event_id=p_input->>'eventId';
 IF FOUND THEN RETURN QUERY SELECT CASE WHEN e.principal_id=pid AND e.reason=p_input->>'reason' AND e.operator_id IS NOT DISTINCT FROM p_input->>'operatorId' AND e.support_reason IS NOT DISTINCT FROM p_input->>'supportReason' THEN 'operation_replayed' ELSE 'operation_mismatch' END,NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.admin_login_events VALUES(p_input->>'eventId',pid,p_input->>'reason',p_input->>'operatorId',p_input->>'supportReason',n);
 UPDATE saas.admin_login_factors SET security_version=security_version+1,phone_ciphertext=CASE WHEN p_input->>'reason'='support_reset' THEN NULL ELSE phone_ciphertext END,phone_masked=CASE WHEN p_input->>'reason'='support_reset' THEN NULL ELSE phone_masked END,recipient_digest=CASE WHEN p_input->>'reason'='support_reset' THEN NULL ELSE recipient_digest END,updated_at=n WHERE principal_id=pid;
 UPDATE saas.admin_login_trust SET revoked_at=n WHERE principal_id=pid AND revoked_at IS NULL;
 UPDATE saas.panel_sessions SET revoked_at=n,revocation_reason='security',version=version+1,updated_at=n WHERE principal_id=pid AND revoked_at IS NULL;
 UPDATE saas.admin_login_backups SET consumed_at=n WHERE principal_id=pid AND consumed_at IS NULL;
 RETURN QUERY SELECT 'invalidated',NULL::jsonb;
END $f$;

-- Amend the exact deployed PL/pgSQL contracts without introducing public legacy aliases.
-- Capture the definitions once; down restores them only with policy disabled.
DO $guards$
DECLARE r record;guard text;definition text;
BEGIN
 FOR r IN SELECT p.oid,p.proname,p.prosrc,(SELECT lanname FROM pg_language WHERE oid=p.prolang) lang,p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname=ANY(ARRAY[
 'issue_panel_session','resolve_panel_session','rotate_panel_session','recover_panel_session_operation','list_panel_session_store_options','revoke_panel_session','revoke_panel_session_family','revoke_principal_panel_sessions',
 'issue_cross_host_panel_handoff','redeem_cross_host_panel_handoff','recover_cross_host_panel_handoff',
 'create_panel_session_handoff','recover_panel_session_handoff','redeem_panel_session_handoff','recover_panel_session_handoff_redemption']) LOOP
 guard:=NULL;
 CASE r.proname
 WHEN 'issue_panel_session' THEN guard:=$g$
 IF (saas.admin_login_principal_enforced(p_principal_id,p_active_store_id) OR EXISTS(SELECT 1 FROM saas.admin_login_assurance WHERE family_id=p_family_id)) AND NOT EXISTS(SELECT 1 FROM saas.admin_login_assurance a JOIN saas.admin_login_factors f ON f.principal_id=a.principal_id AND f.security_version=a.security_version WHERE a.family_id=p_family_id AND a.principal_id=p_principal_id AND a.session_id=p_session_id AND a.operation_id=p_operation_id AND a.token_key_id=p_token_key_id AND a.token_digest=p_token_digest AND p_expires_at<=a.expires_at AND a.expires_at>clock_timestamp()) THEN RETURN QUERY SELECT 'mfa_required'::text,NULL::jsonb;RETURN;END IF;
 $g$;
 WHEN 'resolve_panel_session','list_panel_session_store_options' THEN guard:=$g$
 IF NOT saas.admin_login_session_allowed(p_token_key_id,p_token_digest) THEN RETURN QUERY SELECT 'mfa_required'::text,NULL::jsonb;RETURN;END IF;
 $g$;
 WHEN 'rotate_panel_session' THEN guard:=$g$
 PERFORM 1 FROM saas.admin_login_factors f JOIN saas.panel_sessions s ON s.principal_id=f.principal_id WHERE s.token_key_id=p_current_token_key_id AND s.token_digest=p_current_token_digest FOR UPDATE OF f;
 IF NOT saas.admin_login_session_allowed(p_current_token_key_id,p_current_token_digest,saas.admin_login_policy_enabled(p_requested_store_id)) AND NOT saas.admin_login_session_allowed(p_token_key_id,p_token_digest,true) THEN RETURN QUERY SELECT 'mfa_required'::text,NULL::jsonb;RETURN;END IF;
 $g$;
 WHEN 'revoke_panel_session','revoke_panel_session_family','revoke_principal_panel_sessions' THEN guard:=$g$
 PERFORM 1 FROM saas.admin_login_factors f JOIN saas.panel_sessions s ON s.principal_id=f.principal_id WHERE s.token_key_id=p_token_key_id AND s.token_digest=p_token_digest FOR UPDATE OF f;
 $g$;
 WHEN 'recover_panel_session_operation' THEN guard:=$g$
 IF NOT saas.admin_login_session_allowed(p_token_key_id,p_token_digest) THEN RETURN QUERY SELECT 'mfa_required'::text,NULL::jsonb;RETURN;END IF;
 $g$;
 WHEN 'issue_cross_host_panel_handoff' THEN guard:=$g$
 PERFORM 1 FROM saas.admin_login_factors f JOIN saas.panel_sessions s ON s.principal_id=f.principal_id WHERE s.token_key_id=p_source_token_key_id AND s.token_digest=p_source_token_digest FOR UPDATE OF f;
 IF NOT saas.admin_login_session_allowed(p_source_token_key_id,p_source_token_digest,saas.admin_login_policy_enabled(p_destination_store_id)) THEN RETURN QUERY SELECT 'mfa_required'::text,NULL::jsonb;RETURN;END IF;
 $g$;
 WHEN 'redeem_cross_host_panel_handoff' THEN guard:=$g$
 PERFORM 1 FROM saas.admin_login_factors f JOIN saas.cross_host_panel_handoffs h ON h.principal_id=f.principal_id WHERE h.token_key_id=p_token_key_id AND h.token_digest=p_token_digest FOR UPDATE OF f;
 IF EXISTS(SELECT 1 FROM saas.cross_host_panel_handoffs h JOIN saas.panel_sessions s ON s.session_id=h.source_session_id WHERE h.token_key_id=p_token_key_id AND h.token_digest=p_token_digest AND (saas.admin_login_policy_enabled(h.destination_store_id) OR EXISTS(SELECT 1 FROM saas.admin_login_assurance WHERE family_id=s.family_id))) THEN
  PERFORM 1 FROM saas.cross_host_panel_handoffs h WHERE h.token_key_id=p_token_key_id AND h.token_digest=p_token_digest FOR UPDATE;
  IF p_session_expires_at IS NOT NULL THEN SELECT least(p_session_expires_at,a.expires_at) INTO p_session_expires_at FROM saas.cross_host_panel_handoffs h JOIN saas.panel_sessions s ON s.session_id=h.source_session_id JOIN saas.admin_login_assurance a ON a.family_id=s.family_id WHERE h.token_key_id=p_token_key_id AND h.token_digest=p_token_digest AND h.destination_hostname=p_destination_hostname;END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.cross_host_panel_handoffs h JOIN saas.panel_sessions s ON s.session_id=h.source_session_id JOIN saas.admin_login_assurance a ON a.family_id=s.family_id WHERE h.token_key_id=p_token_key_id AND h.token_digest=p_token_digest AND h.destination_hostname=p_destination_hostname AND saas.admin_login_session_allowed(s.token_key_id,s.token_digest,true)) THEN RETURN QUERY SELECT 'mfa_required'::text,NULL::jsonb;RETURN;END IF;

 END IF;
 $g$;
 WHEN 'recover_cross_host_panel_handoff' THEN guard:=$g$
 IF EXISTS(SELECT 1 FROM saas.cross_host_panel_handoffs h WHERE h.operation_id=p_operation_id AND saas.admin_login_policy_enabled(h.destination_store_id)) AND NOT EXISTS(SELECT 1 FROM saas.cross_host_panel_handoffs h JOIN saas.panel_sessions s ON s.session_id=h.source_session_id WHERE h.operation_id=p_operation_id AND saas.admin_login_session_allowed(s.token_key_id,s.token_digest)) THEN RETURN QUERY SELECT 'mfa_required'::text,NULL::jsonb;RETURN;END IF;
 $g$;
  WHEN 'create_panel_session_handoff','recover_panel_session_handoff' THEN guard:=$g$
 IF (SELECT enabled FROM saas.admin_login_policy) OR EXISTS(SELECT 1 FROM saas.registration_workflows w JOIN saas.registration_tenant_completions c ON c.attempt_id=w.attempt_id JOIN saas.tenant_operations o ON o.id=c.tenant_operation_id WHERE w.state_digest=p_state_digest AND saas.admin_login_policy_enabled(o.result_store_id)) THEN RETURN QUERY SELECT 'mfa_required'::text,NULL::jsonb;RETURN;END IF;
 $g$;
 ELSE guard:=$g$
 IF (SELECT enabled FROM saas.admin_login_policy) OR EXISTS(SELECT 1 FROM saas.panel_session_handoffs h WHERE h.token_key_id=p_handoff_token_key_id AND h.token_digest=p_handoff_token_digest AND saas.admin_login_policy_enabled(h.active_store_id)) THEN RETURN QUERY SELECT 'mfa_required'::text,NULL::jsonb;RETURN;END IF;
 $g$;
 END CASE;
 INSERT INTO saas.admin_login_original_functions VALUES(r.signature,r.definition);
 IF r.lang='sql' THEN definition:=replace(replace(r.definition,'LANGUAGE sql','LANGUAGE plpgsql'),r.prosrc,'BEGIN '||guard||' RETURN QUERY '||rtrim(r.prosrc,E' ;\n\r\t')||'; END;');ELSE definition:=regexp_replace(r.definition,E'\\mBEGIN\\M','BEGIN'||guard);END IF;
 IF r.proname='redeem_cross_host_panel_handoff' THEN
  definition:=replace(definition,'SELECT issued.outcome, issued.authority INTO issued_outcome, issued_authority',$inherit$
  INSERT INTO saas.admin_login_assurance(family_id,principal_id,security_version,expires_at,legacy,session_id,operation_id,token_key_id,token_digest,created_at)
  SELECT p_family_id,a.principal_id,a.security_version,a.expires_at,a.legacy,p_session_id,p_session_operation_id,p_session_token_key_id,p_session_token_digest,a.created_at FROM saas.cross_host_panel_handoffs h JOIN saas.panel_sessions s ON s.session_id=h.source_session_id JOIN saas.admin_login_assurance a ON a.family_id=s.family_id WHERE h.token_key_id=p_token_key_id AND h.token_digest=p_token_digest AND h.destination_hostname=p_destination_hostname AND h.expires_at>clock_timestamp() ON CONFLICT DO NOTHING;
 SELECT issued.outcome, issued.authority INTO issued_outcome, issued_authority$inherit$);
  definition:=replace(definition,'IF issued_outcome NOT IN (''issued'', ''operation_replayed'') THEN','IF issued_outcome NOT IN (''issued'', ''operation_replayed'') THEN DELETE FROM saas.admin_login_assurance a WHERE a.family_id=p_family_id AND a.session_id=p_session_id AND NOT EXISTS(SELECT 1 FROM saas.panel_sessions s WHERE s.family_id=a.family_id);');
 END IF;
 IF definition=r.definition THEN RAISE EXCEPTION 'ADMIN_MFA_GUARD_INSERT_FAILED %',r.proname;END IF;
 EXECUTE definition;
 END LOOP;
END $guards$;

DO $grants$ DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure::text sig FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname LIKE 'admin_login_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver',r.sig);END LOOP;END $grants$;
GRANT EXECUTE ON FUNCTION saas.admin_login_security_command(text,jsonb) TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.admin_login_security_invalidate(jsonb) TO celebix_saas_workflow;
COMMIT;
