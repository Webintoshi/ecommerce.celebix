-- Email-first invitations use verified common OIDC identity, never tenant provisioning.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
CREATE TABLE saas.platform_member_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES saas.stores(id),admin_host text NOT NULL,
 recipient_email text NOT NULL CHECK(recipient_email=lower(btrim(recipient_email)) AND length(recipient_email) BETWEEN 3 AND 320 AND recipient_email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 identity_issuer text NOT NULL CHECK(identity_issuer~'^https://'),target_principal_id uuid REFERENCES saas.principals(id),target_issuer text,target_subject text,
 role text NOT NULL CHECK(role IN('store_owner','admin','editor','analyst','cashier')),kind text NOT NULL CHECK(kind IN('invite','transfer')),
 previous_owner_disposition text CHECK(previous_owner_disposition IN('admin','revoked')),created_by uuid NOT NULL REFERENCES saas.platform_operators(id),
 token_hash bytea NOT NULL UNIQUE,expires_at timestamptz NOT NULL,accepted_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((target_principal_id IS NULL AND target_issuer IS NULL AND target_subject IS NULL) OR (target_principal_id IS NOT NULL AND target_issuer IS NOT NULL AND target_subject IS NOT NULL)),
 CHECK(kind<>'transfer' OR (role='store_owner' AND previous_owner_disposition IS NOT NULL))
);
CREATE TABLE saas.platform_invitation_oidc_attempts(
 id uuid PRIMARY KEY,state_hash text NOT NULL UNIQUE CHECK(state_hash~'^[a-f0-9]{64}$'),binding_hash text NOT NULL CHECK(binding_hash~'^[a-f0-9]{64}$'),
 invitation_id uuid NOT NULL REFERENCES saas.platform_member_invitations(id),encrypted_payload jsonb NOT NULL CHECK(pg_column_size(encrypted_payload)<=32768),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','claimed','completed')),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),result jsonb
);
CREATE INDEX platform_invitation_attempt_expiry ON saas.platform_invitation_oidc_attempts(invitation_id,expires_at);
DO $security$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['platform_member_invitations','platform_invitation_oidc_attempts'] LOOP
 EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_platform_operator,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap',t);
END LOOP;END $security$;
-- Preserve existing immutable identity invitations without publishing or creating tenants.
INSERT INTO saas.platform_member_invitations(id,store_id,admin_host,recipient_email,identity_issuer,target_principal_id,target_issuer,target_subject,role,kind,previous_owner_disposition,created_by,token_hash,expires_at,accepted_at,created_at)
 SELECT i.id,i.store_id,d.hostname,lower(p.email),i.target_issuer,i.target_principal_id,i.target_issuer,i.target_subject,i.role,i.kind,i.previous_owner_disposition,i.created_by,i.token_hash,i.expires_at,i.accepted_at,i.created_at
 FROM saas.platform_ownership_invitations i JOIN saas.principals p ON p.id=i.target_principal_id JOIN LATERAL(SELECT hostname FROM saas.admin_domains WHERE store_id=i.store_id AND status='active' AND verified_at IS NOT NULL ORDER BY canonical DESC,created_at LIMIT 1) d ON true;
CREATE FUNCTION saas.platform_invitation_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $f$
BEGIN
 IF TG_OP='DELETE' OR NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.admin_host<>OLD.admin_host OR NEW.recipient_email<>OLD.recipient_email OR NEW.identity_issuer<>OLD.identity_issuer OR NEW.role<>OLD.role OR NEW.kind<>OLD.kind OR NEW.previous_owner_disposition IS DISTINCT FROM OLD.previous_owner_disposition OR NEW.created_by<>OLD.created_by OR NEW.token_hash<>OLD.token_hash OR NEW.expires_at<>OLD.expires_at OR NEW.created_at<>OLD.created_at OR (OLD.target_principal_id IS NOT NULL AND (NEW.target_principal_id IS DISTINCT FROM OLD.target_principal_id OR NEW.target_issuer IS DISTINCT FROM OLD.target_issuer OR NEW.target_subject IS DISTINCT FROM OLD.target_subject)) OR (OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at) THEN RAISE EXCEPTION 'invitation_identity_immutable';END IF;RETURN NEW;
END $f$;
CREATE TRIGGER platform_invitation_identity_guard BEFORE UPDATE OR DELETE ON saas.platform_member_invitations FOR EACH ROW EXECUTE FUNCTION saas.platform_invitation_identity_guard();
CREATE FUNCTION saas.platform_invitation_read(p_operator uuid,p_query jsonb,p_identity_issuer text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE items jsonb;candidates jsonb;BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_identity_issuer IS NULL OR p_identity_issuer!~'^https://' OR p_query IS NULL OR jsonb_typeof(p_query)<>'object' OR p_query-ARRAY['storeId','email','q','limit','status','after','from','to']<>'{}' THEN RAISE EXCEPTION 'invalid_input';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'storeId',store_id,'recipientEmail',recipient_email,'targetPrincipalId',target_principal_id,'role',role,'kind',kind,'adminHost',admin_host,'expiresAt',expires_at,'acceptedAt',accepted_at) ORDER BY created_at DESC),'[]') INTO items FROM (
  SELECT id,store_id,recipient_email,target_principal_id,role,kind,admin_host,expires_at,accepted_at,created_at FROM saas.platform_member_invitations
  UNION ALL SELECT legacy.id,legacy.store_id,lower(principal.email),legacy.target_principal_id,legacy.role,legacy.kind,
   (SELECT hostname FROM saas.admin_domains WHERE store_id=legacy.store_id AND status='active' AND verified_at IS NOT NULL ORDER BY canonical DESC,created_at LIMIT 1),legacy.expires_at,legacy.accepted_at,legacy.created_at
   FROM saas.platform_ownership_invitations legacy JOIN saas.principals principal ON principal.id=legacy.target_principal_id
   WHERE NOT EXISTS(SELECT 1 FROM saas.platform_member_invitations current WHERE current.id=legacy.id)
 ) invitations WHERE p_query->>'storeId' IS NULL OR store_id=(p_query->>'storeId')::uuid;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'issuer',issuer,'verified',true)),'[]') INTO candidates FROM saas.principals WHERE email_verified AND issuer=p_identity_issuer AND lower(email)=lower(p_query->>'email');
 RETURN jsonb_build_object('available',true,'observedAt',statement_timestamp(),'items',items,'candidates',candidates);
END $f$;
CREATE FUNCTION saas.platform_invitation_create(p_operator uuid,p_payload jsonb,p_expected_version bigint,p_key text,p_identity_issuer text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE sid uuid;ver bigint;target saas.principals;v_email text;host text;token text;entity uuid;request jsonb;prior saas.platform_command_results;result jsonb;BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_identity_issuer IS NULL OR p_identity_issuer!~'^https://' OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR pg_column_size(p_payload)>16384 OR p_payload-ARRAY['storeId','targetEmail','targetPrincipalId','role','kind','previousOwnerDisposition']<>'{}' OR NOT(p_payload?&ARRAY['storeId','targetEmail','role','kind']) OR p_expected_version IS NULL OR p_expected_version<0 OR p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 128 OR p_key<>btrim(p_key) OR p_key~'[[:cntrl:]]' OR p_payload->>'role' NOT IN('store_owner','admin','editor','analyst','cashier') OR p_payload->>'kind' NOT IN('invite','transfer') THEN RAISE EXCEPTION 'invalid_input';END IF;
 v_email:=lower(btrim(p_payload->>'targetEmail'));IF jsonb_typeof(p_payload->'targetEmail')<>'string' OR v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(v_email)>320 THEN RAISE EXCEPTION 'invalid_input';END IF;
 IF p_payload->>'kind'='transfer' AND (p_payload->>'role'<>'store_owner' OR coalesce(p_payload->>'previousOwnerDisposition','') NOT IN('admin','revoked')) THEN RAISE EXCEPTION 'invalid_input';END IF;
 request:=jsonb_build_object('action','ownership.invite','payload',p_payload,'expectedVersion',p_expected_version,'identityIssuer',p_identity_issuer);PERFORM pg_advisory_xact_lock(hashtextextended('platform-replay:'||p_operator::text||':'||p_key,0));SELECT * INTO prior FROM saas.platform_command_results WHERE operator_id=p_operator AND idempotency_key=p_key;
 IF FOUND THEN IF prior.request<>request THEN RAISE EXCEPTION 'operation_mismatch';END IF;RETURN jsonb_set(prior.result,'{outcome}','"replayed"');END IF;
 sid:=(p_payload->>'storeId')::uuid;SELECT d.hostname INTO host FROM saas.admin_domains d JOIN saas.stores s ON s.id=d.store_id WHERE d.store_id=sid AND s.status='active' AND d.status='active' AND d.verified_at<=clock_timestamp() ORDER BY d.canonical DESC,d.created_at LIMIT 1;IF NOT FOUND THEN RAISE EXCEPTION 'admin_host_unverified';END IF;
 IF p_payload->>'targetPrincipalId' IS NOT NULL THEN SELECT * INTO target FROM saas.principals WHERE id=(p_payload->>'targetPrincipalId')::uuid AND email_verified AND issuer=p_identity_issuer AND lower(saas.principals.email)=v_email;IF NOT FOUND THEN RAISE EXCEPTION 'verified_identity_required';END IF;
 ELSE IF (SELECT count(*) FROM saas.principals WHERE email_verified AND issuer=p_identity_issuer AND lower(saas.principals.email)=v_email)=1 THEN SELECT * INTO target FROM saas.principals WHERE email_verified AND issuer=p_identity_issuer AND lower(saas.principals.email)=v_email;ELSIF (SELECT count(*) FROM saas.principals WHERE email_verified AND issuer=p_identity_issuer AND lower(saas.principals.email)=v_email)>1 THEN RAISE EXCEPTION 'verified_identity_ambiguous';END IF;END IF;
 INSERT INTO saas.platform_store_versions(store_id) VALUES(sid) ON CONFLICT DO NOTHING;SELECT version INTO ver FROM saas.platform_store_versions WHERE store_id=sid FOR UPDATE;IF ver<>p_expected_version THEN RAISE EXCEPTION 'version_conflict';END IF;
 token:=gen_random_uuid()::text||gen_random_uuid()::text;
 INSERT INTO saas.platform_member_invitations(store_id,admin_host,recipient_email,identity_issuer,target_principal_id,target_issuer,target_subject,role,kind,previous_owner_disposition,created_by,token_hash,expires_at) VALUES(sid,host,v_email,p_identity_issuer,target.id,target.issuer,target.subject,p_payload->>'role',p_payload->>'kind',p_payload->>'previousOwnerDisposition',p_operator,sha256(convert_to(token,'UTF8')),clock_timestamp()+interval '7 days') RETURNING id INTO entity;
 UPDATE saas.platform_store_versions SET version=ver+1 WHERE store_id=sid;INSERT INTO saas.platform_audit(operator_id,store_id,action,payload) VALUES(p_operator,sid,'ownership.invite',p_payload);
 result:=jsonb_build_object('outcome','committed','version',ver+1,'result',jsonb_build_object('invitationId',entity,'acceptanceToken',token,'adminHost',host,'recipientEmail',v_email,'expiresAt',clock_timestamp()+interval '7 days'));
 INSERT INTO saas.platform_command_results(operator_id,idempotency_key,request,result) VALUES(p_operator,p_key,request,result);RETURN result;
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation THEN RAISE EXCEPTION 'invalid_input';END $f$;
CREATE FUNCTION saas.platform_invitation_start(p_id uuid,p_token text,p_host text,p_state_hash text,p_binding_hash text,p_payload jsonb,p_expires timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE i saas.platform_member_invitations;BEGIN
 IF p_id IS NULL OR p_host IS NULL OR p_state_hash IS NULL OR p_binding_hash IS NULL OR p_expires IS NULL OR p_token IS NULL OR p_token!~'^[a-f0-9-]{72}$' OR p_state_hash!~'^[a-f0-9]{64}$' OR p_binding_hash!~'^[a-f0-9]{64}$' OR p_payload IS NULL OR p_expires<=clock_timestamp() OR p_expires>clock_timestamp()+interval '10 minutes' THEN RAISE EXCEPTION 'invalid_input';END IF;
 SELECT * INTO i FROM saas.platform_member_invitations WHERE token_hash=sha256(convert_to(p_token,'UTF8')) AND admin_host=p_host FOR UPDATE;IF NOT FOUND OR i.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'invitation_denied';END IF;PERFORM saas.platform_operator_require_active(i.created_by);
 IF NOT EXISTS(SELECT 1 FROM saas.admin_domains WHERE store_id=i.store_id AND hostname=p_host AND status='active' AND verified_at<=clock_timestamp()) THEN RAISE EXCEPTION 'admin_host_unverified';END IF;
 IF (SELECT count(*) FROM saas.platform_invitation_oidc_attempts WHERE invitation_id=i.id AND expires_at>clock_timestamp() AND status<>'completed')>=5 THEN RAISE EXCEPTION 'invitation_rate_limited';END IF;
 INSERT INTO saas.platform_invitation_oidc_attempts(id,state_hash,binding_hash,invitation_id,encrypted_payload,expires_at) VALUES(p_id,p_state_hash,p_binding_hash,i.id,p_payload,p_expires);
 RETURN jsonb_build_object('id',p_id,'invitationId',i.id,'storeId',i.store_id);
END $f$;
CREATE FUNCTION saas.platform_invitation_claim(p_state_hash text,p_binding_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE a saas.platform_invitation_oidc_attempts;BEGIN
 SELECT * INTO a FROM saas.platform_invitation_oidc_attempts WHERE state_hash=p_state_hash AND binding_hash=p_binding_hash FOR UPDATE;IF NOT FOUND OR a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'invitation_denied';END IF;
 PERFORM saas.platform_operator_require_active((SELECT created_by FROM saas.platform_member_invitations WHERE id=a.invitation_id));
 IF a.status='completed' THEN RETURN jsonb_build_object('outcome','replayed','result',a.result);END IF;
 IF a.status<>'active' THEN RAISE EXCEPTION 'invitation_callback_consumed';END IF;
 UPDATE saas.platform_invitation_oidc_attempts SET status='claimed' WHERE id=a.id;RETURN jsonb_build_object('outcome','claimed','id',a.id,'encryptedPayload',a.encrypted_payload);
END $f$;
CREATE FUNCTION saas.platform_invitation_complete(p_attempt uuid,p_issuer text,p_subject text,p_email text,p_verified boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE a saas.platform_invitation_oidc_attempts;i saas.platform_member_invitations;principal saas.principals;mid uuid;current_plan uuid;desired_staff bigint;ver bigint;v_result jsonb;BEGIN
 IF p_verified IS DISTINCT FROM true OR p_issuer IS NULL OR p_subject IS NULL OR length(p_subject) NOT BETWEEN 1 AND 512 OR p_subject<>btrim(p_subject) OR p_issuer!~'^https://' THEN RAISE EXCEPTION 'verified_identity_required';END IF;
 SELECT * INTO a FROM saas.platform_invitation_oidc_attempts WHERE id=p_attempt FOR UPDATE;IF NOT FOUND OR a.expires_at<=clock_timestamp() OR a.status NOT IN('claimed','completed') THEN RAISE EXCEPTION 'invitation_denied';END IF;
 SELECT * INTO i FROM saas.platform_member_invitations WHERE id=a.invitation_id FOR UPDATE;PERFORM saas.platform_operator_require_active(i.created_by);
 IF i.expires_at<=clock_timestamp() OR i.identity_issuer<>p_issuer OR i.recipient_email<>lower(btrim(p_email)) OR p_email IS NULL OR (i.target_principal_id IS NOT NULL AND (i.target_issuer<>p_issuer OR i.target_subject<>p_subject)) OR NOT EXISTS(SELECT 1 FROM saas.stores s JOIN saas.admin_domains d ON d.store_id=s.id WHERE s.id=i.store_id AND s.status='active' AND d.hostname=i.admin_host AND d.status='active' AND d.verified_at<=clock_timestamp()) THEN RAISE EXCEPTION 'invitation_denied';END IF;
 IF a.status='completed' THEN RETURN jsonb_build_object('outcome','replayed','result',a.result);END IF;
 SELECT * INTO principal FROM saas.principals WHERE issuer=p_issuer AND subject=p_subject FOR UPDATE;
 IF FOUND THEN IF NOT principal.email_verified OR lower(principal.email)<>i.recipient_email THEN RAISE EXCEPTION 'verified_identity_required';END IF;
 ELSE INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES(gen_random_uuid(),p_issuer,p_subject,i.recipient_email,true,clock_timestamp(),clock_timestamp()) RETURNING * INTO principal;END IF;
 INSERT INTO saas.platform_store_versions(store_id) VALUES(i.store_id) ON CONFLICT DO NOTHING;SELECT version INTO ver FROM saas.platform_store_versions WHERE store_id=i.store_id FOR UPDATE;PERFORM pg_advisory_xact_lock(hashtextextended('platform-owner:'||i.store_id::text,0));
 SELECT plan_id INTO current_plan FROM saas.subscriptions WHERE store_id=i.store_id AND status='active' AND valid_from<=clock_timestamp() AND (valid_until IS NULL OR valid_until>clock_timestamp());IF NOT FOUND THEN RAISE EXCEPTION 'membership_denied';END IF;
 IF i.accepted_at IS NULL THEN
  desired_staff:=(saas.platform_store_usage(i.store_id)->>'staff')::bigint-(SELECT count(*) FROM saas.memberships WHERE store_id=i.store_id AND principal_id=principal.id AND status='active' AND role<>'store_owner' AND support_session_id IS NULL)+CASE WHEN i.role='store_owner' THEN 0 ELSE 1 END;
  IF i.kind='transfer' AND i.previous_owner_disposition='admin' THEN desired_staff:=desired_staff+(SELECT count(*) FROM saas.memberships WHERE store_id=i.store_id AND principal_id<>principal.id AND role='store_owner' AND status='active' AND support_session_id IS NULL);END IF;
  IF desired_staff>0 AND NOT EXISTS(SELECT 1 FROM saas.plan_limits WHERE plan_id=current_plan AND limit_key='staff' AND effective_limit>=desired_staff) THEN RAISE EXCEPTION 'staff_limit_reached';END IF;
  INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES(gen_random_uuid(),principal.id,i.store_id,i.role,'active',clock_timestamp(),clock_timestamp()) ON CONFLICT(principal_id,store_id) WHERE support_session_id IS NULL DO UPDATE SET role=excluded.role,status='active',updated_at=greatest(clock_timestamp(),saas.memberships.updated_at) RETURNING id INTO mid;
  IF i.kind='transfer' THEN UPDATE saas.memberships SET role=CASE WHEN i.previous_owner_disposition='admin' THEN 'admin' ELSE role END,status=CASE WHEN i.previous_owner_disposition='revoked' THEN 'revoked' ELSE 'active' END,updated_at=greatest(clock_timestamp(),updated_at) WHERE store_id=i.store_id AND principal_id<>principal.id AND role='store_owner' AND status='active' AND support_session_id IS NULL;END IF;
  UPDATE saas.platform_member_invitations SET target_principal_id=principal.id,target_issuer=p_issuer,target_subject=p_subject,accepted_at=clock_timestamp() WHERE id=i.id;
  UPDATE saas.platform_store_versions SET version=ver+1 WHERE store_id=i.store_id;
  INSERT INTO saas.platform_audit(operator_id,store_id,action,payload) VALUES(i.created_by,i.store_id,'ownership.accept',jsonb_build_object('invitationId',i.id,'principalId',principal.id,'membershipId',mid,'previousOwnerDisposition',i.previous_owner_disposition));
 ELSE SELECT id INTO mid FROM saas.memberships WHERE principal_id=principal.id AND store_id=i.store_id AND support_session_id IS NULL;END IF;
 v_result:=jsonb_build_object('storeId',i.store_id,'membershipId',mid,'redirectUrl','https://'||i.admin_host||'/invitations/accepted');
 UPDATE saas.platform_invitation_oidc_attempts SET status='completed',result=v_result WHERE id=a.id;
 RETURN jsonb_build_object('outcome',CASE WHEN i.accepted_at IS NULL THEN 'committed' ELSE 'replayed' END,'result',v_result);
END $f$;
DO $acl$ DECLARE f regprocedure;BEGIN FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'platform_invitation_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_platform_operator',f);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION saas.platform_invitation_read(uuid,jsonb,text),saas.platform_invitation_create(uuid,jsonb,bigint,text,text) TO celebix_saas_platform_operator;
GRANT EXECUTE ON FUNCTION saas.platform_invitation_start(uuid,text,text,text,text,jsonb,timestamptz),saas.platform_invitation_claim(text,text),saas.platform_invitation_complete(uuid,text,text,text,boolean) TO celebix_saas_identity;
COMMIT;
