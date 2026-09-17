-- Durable store-admin invitations. No generic record is auto-converted or deleted.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.store_admin_invitations (
 id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES saas.stores(id), source_record_id uuid NOT NULL,
 source_version bigint NOT NULL CHECK(source_version>0), email text NOT NULL, display_name text NOT NULL,
 role text NOT NULL CHECK(role IN('admin','editor','analyst')), expires_at timestamptz NOT NULL,
 inviter_principal_id uuid NOT NULL, inviter_membership_id uuid NOT NULL,
 plan_id uuid NOT NULL, plan_code text NOT NULL, plan_version bigint NOT NULL,
 token_digest text NOT NULL UNIQUE CHECK(token_digest~'^[a-f0-9]{64}$'),
 generation bigint NOT NULL CHECK(generation>0), version bigint NOT NULL CHECK(version>0),
 status text NOT NULL CHECK(status IN('pending','accepted','revoked','expired')),
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 accepted_principal_id uuid, accepted_membership_id uuid, accepted_at timestamptz, revoked_at timestamptz,
 UNIQUE(store_id,id), UNIQUE(store_id,source_record_id),
 FOREIGN KEY(store_id,source_record_id) REFERENCES saas.merchant_admin_records(store_id,id),
 FOREIGN KEY(store_id,inviter_membership_id) REFERENCES saas.memberships(store_id,id),
 FOREIGN KEY(inviter_membership_id,inviter_principal_id) REFERENCES saas.memberships(id,principal_id),
 FOREIGN KEY(store_id,accepted_membership_id) REFERENCES saas.memberships(store_id,id),
 FOREIGN KEY(accepted_membership_id,accepted_principal_id) REFERENCES saas.memberships(id,principal_id),
 CHECK(updated_at>=created_at), CHECK(expires_at>created_at),
 CHECK((status='accepted')=(accepted_at IS NOT NULL)),
 CHECK((accepted_at IS NULL AND accepted_principal_id IS NULL AND accepted_membership_id IS NULL) OR
       (accepted_at IS NOT NULL AND accepted_principal_id IS NOT NULL AND accepted_membership_id IS NOT NULL))
);
CREATE TABLE saas.store_admin_invitation_deliveries (
 id uuid PRIMARY KEY, store_id uuid NOT NULL, invitation_id uuid NOT NULL, generation bigint NOT NULL CHECK(generation>0),
 seal_version text NOT NULL CHECK(seal_version IN('ai1','ar1')), key_id text NOT NULL CHECK(key_id~'^[A-Za-z0-9_-]{1,64}$'),
 ciphertext bytea NOT NULL CHECK(octet_length(ciphertext) BETWEEN 32 AND 65536),
 ciphertext_digest text NOT NULL CHECK(ciphertext_digest~'^[a-f0-9]{64}$'), renderer_version integer NOT NULL CHECK(renderer_version=1),
 idempotency_key text NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN('queued','sending','provider_accepted','delivered','failed','outcome_unknown')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL, first_attempt_at timestamptz, replay_deadline timestamptz,
 lease_id uuid, lease_owner text, lease_expires_at timestamptz, lease_history uuid[] NOT NULL DEFAULT '{}',
 settled_lease_id uuid, settled_worker text, settled_intent jsonb, settled_result jsonb,
 provider_message_id text UNIQUE, safe_error_code text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 UNIQUE(invitation_id,generation), FOREIGN KEY(store_id,invitation_id) REFERENCES saas.store_admin_invitations(store_id,id),
 CHECK(idempotency_key='store-admin-invitation/v1/'||invitation_id::text||'/'||generation::text),
 CHECK(ciphertext_digest=encode(sha256(ciphertext),'hex')),
 CHECK((first_attempt_at IS NULL AND replay_deadline IS NULL) OR replay_deadline=first_attempt_at+interval '23 hours 55 minutes')
);
CREATE INDEX store_admin_invitation_delivery_queue ON saas.store_admin_invitation_deliveries(next_attempt_at,id) WHERE status IN('queued','sending');
CREATE TABLE saas.store_admin_invitation_operations (
 operation_id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES saas.stores(id), actor_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('issue','resend','revoke','grant','accept')),
 fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'), intent jsonb NOT NULL,
 result_payload jsonb NOT NULL, committed_at timestamptz NOT NULL,
 CHECK(pg_column_size(intent)<=4096), CHECK(pg_column_size(result_payload)<=8192)
);
CREATE TABLE saas.store_admin_invitation_acceptance_grants (
 id uuid PRIMARY KEY, invitation_id uuid NOT NULL REFERENCES saas.store_admin_invitations(id), generation bigint NOT NULL,
 token_digest text NOT NULL CHECK(token_digest~'^[a-f0-9]{64}$'),
 grant_digest text NOT NULL UNIQUE CHECK(grant_digest~'^[a-f0-9]{64}$'),
 browser_key_id text NOT NULL CHECK(browser_key_id~'^[A-Za-z0-9_-]{1,64}$'), browser_digest text NOT NULL CHECK(browser_digest~'^[a-f0-9]{64}$'),
 issuer text NOT NULL CHECK(length(issuer) BETWEEN 1 AND 2048 AND issuer=btrim(issuer)),
 subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 512 AND subject=btrim(subject)), email text NOT NULL,
 created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, invalidated_at timestamptz,
 consumed_at timestamptz, consumed_operation_id uuid REFERENCES saas.store_admin_invitation_operations(operation_id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 minutes'),
 CHECK((consumed_at IS NULL)=(consumed_operation_id IS NULL))
);
CREATE TABLE saas.store_admin_invitation_events (
 id uuid PRIMARY KEY, store_id uuid NOT NULL, invitation_id uuid NOT NULL, generation bigint NOT NULL,
 kind text NOT NULL CHECK(kind IN('issued','resent','revoked','accepted','granted')), actor_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL,
 FOREIGN KEY(store_id,invitation_id) REFERENCES saas.store_admin_invitations(store_id,id)
);
CREATE TABLE saas.store_admin_invitation_provider_events (
 event_id text PRIMARY KEY CHECK(length(event_id) BETWEEN 1 AND 200),
 provider_message_id text NOT NULL CHECK(length(provider_message_id) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK(kind IN('delivered','failed')), occurred_at timestamptz NOT NULL
);

CREATE FUNCTION saas.store_admin_invitation_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN RAISE EXCEPTION 'INVITATION_IMMUTABLE'; END $f$;
CREATE TRIGGER store_admin_invitation_events_immutable BEFORE UPDATE OR DELETE ON saas.store_admin_invitation_events FOR EACH ROW EXECUTE FUNCTION saas.store_admin_invitation_immutable();
CREATE TRIGGER store_admin_invitation_operations_immutable BEFORE UPDATE OR DELETE ON saas.store_admin_invitation_operations FOR EACH ROW EXECUTE FUNCTION saas.store_admin_invitation_immutable();
CREATE TRIGGER store_admin_invitation_provider_events_immutable BEFORE UPDATE OR DELETE ON saas.store_admin_invitation_provider_events FOR EACH ROW EXECUTE FUNCTION saas.store_admin_invitation_immutable();
CREATE FUNCTION saas.store_admin_invitation_freeze_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF (OLD.id,OLD.store_id,OLD.record_kind,OLD.name,OLD.config) IS DISTINCT FROM (NEW.id,NEW.store_id,NEW.record_kind,NEW.name,NEW.config)
 AND EXISTS(SELECT 1 FROM saas.store_admin_invitations WHERE store_id=OLD.store_id AND source_record_id=OLD.id)
 THEN RAISE EXCEPTION 'INVITATION_SOURCE_FROZEN'; END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER store_admin_invitation_source_frozen BEFORE UPDATE ON saas.merchant_admin_records FOR EACH ROW EXECUTE FUNCTION saas.store_admin_invitation_freeze_source();
CREATE FUNCTION saas.store_admin_invitation_freeze_delivery() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF (OLD.id,OLD.store_id,OLD.invitation_id,OLD.generation,OLD.seal_version,OLD.key_id,OLD.ciphertext,OLD.ciphertext_digest,OLD.renderer_version,OLD.idempotency_key,OLD.created_at)
 IS DISTINCT FROM (NEW.id,NEW.store_id,NEW.invitation_id,NEW.generation,NEW.seal_version,NEW.key_id,NEW.ciphertext,NEW.ciphertext_digest,NEW.renderer_version,NEW.idempotency_key,NEW.created_at)
 OR (OLD.first_attempt_at IS NOT NULL AND (OLD.first_attempt_at,OLD.replay_deadline) IS DISTINCT FROM (NEW.first_attempt_at,NEW.replay_deadline))
 THEN RAISE EXCEPTION 'INVITATION_PAYLOAD_FROZEN'; END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER store_admin_invitation_delivery_frozen BEFORE UPDATE ON saas.store_admin_invitation_deliveries FOR EACH ROW EXECUTE FUNCTION saas.store_admin_invitation_freeze_delivery();

CREATE FUNCTION saas.store_admin_invitation_email(p_email text) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE e text:=btrim(p_email,' '); local_part text; domain_part text; label text;
BEGIN
 IF e IS NULL OR length(e) NOT BETWEEN 3 AND 254 OR e~'[^ -~]' OR length(e)-length(replace(e,'@',''))<>1 THEN RETURN NULL; END IF;
 -- Validate original ASCII before folding; never let a locale turn Unicode into
 -- a different ASCII mailbox, or Turkish casing change an ASCII I into dotless i.
 e:=lower(e COLLATE "C");
 local_part:=split_part(e,'@',1); domain_part:=split_part(e,'@',2);
 IF length(local_part) NOT BETWEEN 1 AND 64 OR local_part !~ '^[a-z0-9!#$%&''*+/=?^_`{|}~.-]+$' OR local_part LIKE '.%' OR local_part LIKE '%.' OR position('..' IN local_part)>0 OR position('.' IN domain_part)=0 THEN RETURN NULL; END IF;
 FOREACH label IN ARRAY string_to_array(domain_part,'.') LOOP
  IF label!~'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' THEN RETURN NULL; END IF;
 END LOOP;
 RETURN e;
END $f$;

-- Match the public JavaScript parser, not PostgreSQL's ASCII-only default btrim
-- or Unicode-codepoint char_length: JS trim uses this whitespace set and JS
-- string.length counts a non-BMP codepoint as two UTF-16 units.
CREATE FUNCTION saas.store_admin_invitation_name_valid(p_name text) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT p_name=btrim(p_name,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
 AND p_name COLLATE "C" !~ '[<>[:cntrl:]]'
 AND (SELECT COALESCE(sum(CASE WHEN ascii(codepoint)>65535 THEN 2 ELSE 1 END),0)
      FROM regexp_split_to_table(p_name,'') AS characters(codepoint)) BETWEEN 1 AND 160
$f$;

-- All mutation paths acquire and recheck current authority; caller tuple comes from server session.
CREATE FUNCTION saas.store_admin_invitation_authority(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;
BEGIN
 IF p_now IS NULL THEN RETURN 'invalid_input'; END IF;
 PERFORM 1 FROM saas.principals WHERE id=p_principal_id AND email_verified FOR SHARE;
 IF NOT FOUND THEN RETURN 'membership_denied'; END IF;
 PERFORM 1 FROM saas.memberships WHERE id=p_membership_id AND principal_id=p_principal_id AND store_id=p_store_id AND status='active' AND role='store_owner' FOR SHARE;
 IF NOT FOUND THEN RETURN 'membership_denied'; END IF;
 PERFORM 1 FROM saas.stores WHERE id=p_store_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RETURN 'store_inactive'; END IF;
 PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND plan_code=p_plan_code AND plan_version=p_plan_version AND status='active' AND valid_from<=p_now AND (valid_until IS NULL OR valid_until>p_now) FOR SHARE;
 IF NOT FOUND THEN RETURN 'durable_authority_invalid'; END IF;
 PERFORM 1 FROM saas.plans WHERE id=p_plan_id AND plan_code=p_plan_code AND version=p_plan_version AND status='active' AND valid_from<=p_now AND (valid_until IS NULL OR valid_until>p_now) FOR SHARE;
 IF NOT FOUND THEN RETURN 'durable_authority_invalid'; END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'administrator_invite',true);
 RETURN e;
END $f$;
CREATE FUNCTION saas.store_admin_invitation_projection(p_id uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',i.id,'sourceRecordId',i.source_record_id,'email',i.email,'displayName',i.display_name,'role',i.role,
 'status',CASE WHEN i.status='pending' AND i.expires_at<=p_now THEN 'expired' ELSE i.status END,
 'deliveryStatus',(SELECT d.status FROM saas.store_admin_invitation_deliveries d WHERE d.invitation_id=i.id AND d.generation=i.generation),
 'expiresAt',saas.merchant_admin_timestamp(i.expires_at),'createdAt',saas.merchant_admin_timestamp(i.created_at),'updatedAt',saas.merchant_admin_timestamp(i.updated_at),'version',i.version,'generation',i.generation)
 FROM saas.store_admin_invitations i WHERE i.id=p_id
$f$;
CREATE FUNCTION saas.store_admin_invitation_candidate_valid(p jsonb,p_generation bigint,p_id uuid) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' THEN RETURN false; END IF;
 RETURN COALESCE(jsonb_typeof(p)='object' AND p-ARRAY['invitationId','deliveryId','generation','tokenDigest','sealVersion','keyId','ciphertext','ciphertextDigest','rendererVersion']='{}'::jsonb
 AND (SELECT count(*)=9 FROM jsonb_object_keys(p))
 AND NOT EXISTS(SELECT 1 FROM jsonb_each(p) field WHERE jsonb_typeof(field.value)<>CASE WHEN field.key IN('generation','rendererVersion') THEN 'number' ELSE 'string' END)
 AND p->>'invitationId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 AND p->>'deliveryId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 AND (p->>'invitationId')::uuid=p_id AND (p->>'deliveryId')::uuid IS NOT NULL
 AND (p->>'generation')::bigint=p_generation AND p->>'tokenDigest'~'^[a-f0-9]{64}$'
 AND p->>'sealVersion' IN('ai1','ar1') AND p->>'keyId'~'^[A-Za-z0-9_-]{1,64}$'
 AND length(p->>'ciphertext') BETWEEN 64 AND 131072 AND p->>'ciphertext'~'^[a-f0-9]+$'
 AND p->>'ciphertextDigest'=encode(sha256(decode(p->>'ciphertext','hex')),'hex') AND p->>'rendererVersion'='1',false);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN RETURN false;
END $f$;
CREATE FUNCTION saas.store_admin_invitation_enqueue(p_store_id uuid,p_id uuid,p_generation bigint,p_candidate jsonb,p_now timestamptz)
RETURNS void LANGUAGE sql SET search_path=pg_catalog,saas AS $f$
 INSERT INTO saas.store_admin_invitation_deliveries(id,store_id,invitation_id,generation,seal_version,key_id,ciphertext,ciphertext_digest,renderer_version,idempotency_key,status,next_attempt_at,created_at,updated_at)
 VALUES((p_candidate->>'deliveryId')::uuid,p_store_id,p_id,p_generation,p_candidate->>'sealVersion',p_candidate->>'keyId',decode(p_candidate->>'ciphertext','hex'),p_candidate->>'ciphertextDigest',1,'store-admin-invitation/v1/'||p_id::text||'/'||p_generation::text,'queued',p_now,p_now,p_now)
$f$;
CREATE FUNCTION saas.store_admin_invitation_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;
BEGIN
 e:=saas.store_admin_invitation_authority(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',COALESCE((SELECT jsonb_agg(saas.store_admin_invitation_projection(i.id,p_now) ORDER BY i.created_at DESC,i.id) FROM (SELECT id,created_at FROM saas.store_admin_invitations WHERE store_id=p_store_id ORDER BY created_at DESC,id LIMIT 200)i),'[]'::jsonb),'hasMore',EXISTS(SELECT 1 FROM saas.store_admin_invitations WHERE store_id=p_store_id OFFSET 200));
END $f$;
CREATE FUNCTION saas.store_admin_invitation_source(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_source_record_id uuid,p_expected_record_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; r saas.merchant_admin_records%ROWTYPE; expiry timestamptz; email text;
BEGIN
 e:=saas.store_admin_invitation_authority(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_source_record_id FOR UPDATE;
 IF NOT FOUND OR r.record_kind<>'administrator_invite' OR r.status<>'active' THEN RETURN QUERY SELECT 'invalid_source',NULL::jsonb; RETURN; END IF;
 IF p_expected_record_version IS DISTINCT FROM r.version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 email:=saas.store_admin_invitation_email(r.config->>'email');
 -- Relative/date-style-dependent PostgreSQL inputs must never reach rendering.
 IF r.config->>'expiresAt' IS NULL OR (r.config->>'expiresAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$' THEN RETURN QUERY SELECT 'invalid_source',NULL::jsonb; RETURN; END IF;
 BEGIN expiry:=(r.config->>'expiresAt')::timestamptz; EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN expiry:=NULL; END;
 IF expiry IS NOT NULL AND saas.merchant_admin_timestamp(expiry) IS DISTINCT FROM (CASE WHEN length(r.config->>'expiresAt')=20 THEN replace(r.config->>'expiresAt','Z','.000Z') ELSE r.config->>'expiresAt' END) THEN RETURN QUERY SELECT 'invalid_source',NULL::jsonb; RETURN; END IF;
 IF email IS NULL OR r.config->>'role' IS NULL OR r.config->>'role' NOT IN('admin','editor','analyst') OR expiry IS NULL OR NOT isfinite(expiry) OR expiry<=p_now OR NOT saas.store_admin_invitation_name_valid(r.name) THEN RETURN QUERY SELECT 'invalid_source',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'source',jsonb_build_object('sourceRecordId',r.id,'sourceRecordVersion',r.version,'storeId',p_store_id,'storeName',(SELECT name FROM saas.stores WHERE id=p_store_id),'email',email,'displayName',r.name,'role',r.config->>'role','expiresAt',saas.merchant_admin_timestamp(expiry));
END $f$;
CREATE FUNCTION saas.store_admin_invitation_resend_source(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_invitation_id uuid,p_expected_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE i saas.store_admin_invitations%ROWTYPE; e text;
BEGIN
 SELECT * INTO i FROM saas.store_admin_invitations WHERE store_id=p_store_id AND id=p_invitation_id FOR SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 e:=saas.store_admin_invitation_authority(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 IF i.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 IF i.status<>'pending' OR i.expires_at<=p_now THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'source',jsonb_build_object('invitationId',i.id,'generation',i.generation,'version',i.version,'sourceRecordId',i.source_record_id,'sourceRecordVersion',i.source_version,'storeId',i.store_id,'storeName',(SELECT name FROM saas.stores WHERE id=i.store_id),'email',i.email,'displayName',i.display_name,'role',i.role,'expiresAt',saas.merchant_admin_timestamp(i.expires_at));
END $f$;
CREATE FUNCTION saas.store_admin_invitation_recover_operation(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; op saas.store_admin_invitation_operations%ROWTYPE;
BEGIN
 e:=saas.store_admin_invitation_authority(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 SELECT * INTO op FROM saas.store_admin_invitation_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb; RETURN; END IF;
 IF op.store_id<>p_store_id OR op.actor_id<>p_principal_id OR op.fingerprint IS DISTINCT FROM p_fingerprint OR op.kind NOT IN('issue','resend','revoke') THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'operation_replayed',op.result_payload;
END $f$;
CREATE FUNCTION saas.store_admin_invitation_issue(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_source_record_id uuid,p_expected_record_version bigint,p_candidate jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; op saas.store_admin_invitation_operations%ROWTYPE; src record; intent jsonb; result jsonb; iid uuid;
BEGIN
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('invitation-operation/'||p_operation_id::text,0));
 e:=saas.store_admin_invitation_authority(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 intent:=jsonb_build_object('sourceRecordId',p_source_record_id,'expectedRecordVersion',p_expected_record_version,'membershipId',p_membership_id);
 SELECT * INTO op FROM saas.store_admin_invitation_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF op.store_id<>p_store_id OR op.actor_id<>p_principal_id OR op.kind<>'issue' OR op.fingerprint<>p_fingerprint OR op.intent<>intent THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO src FROM saas.store_admin_invitation_source(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_source_record_id,p_expected_record_version);
 IF src.outcome<>'source' THEN RETURN QUERY SELECT src.outcome,NULL::jsonb; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM saas.store_admin_invitations WHERE store_id=p_store_id AND source_record_id=p_source_record_id) THEN RETURN QUERY SELECT 'already_converted',NULL::jsonb; RETURN; END IF;
 BEGIN iid:=(p_candidate->>'invitationId')::uuid; EXCEPTION WHEN invalid_text_representation THEN iid:=NULL; END;
 IF NOT saas.store_admin_invitation_candidate_valid(p_candidate,1,iid) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 INSERT INTO saas.store_admin_invitations(id,store_id,source_record_id,source_version,email,display_name,role,expires_at,inviter_principal_id,inviter_membership_id,plan_id,plan_code,plan_version,token_digest,generation,version,status,created_at,updated_at)
 VALUES(iid,p_store_id,p_source_record_id,p_expected_record_version,src.result_payload->>'email',src.result_payload->>'displayName',src.result_payload->>'role',(src.result_payload->>'expiresAt')::timestamptz,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_candidate->>'tokenDigest',1,1,'pending',p_now,p_now);
 PERFORM saas.store_admin_invitation_enqueue(p_store_id,iid,1,p_candidate,p_now);
 result:=saas.store_admin_invitation_projection(iid,p_now);
 INSERT INTO saas.store_admin_invitation_operations VALUES(p_operation_id,p_store_id,p_principal_id,'issue',p_fingerprint,intent,result,p_now);
 INSERT INTO saas.store_admin_invitation_events VALUES(p_operation_id,p_store_id,iid,1,'issued',p_principal_id,p_now);
 RETURN QUERY SELECT 'issued',result;
END $f$;

-- Internal action helper; never granted to runtime roles.
CREATE FUNCTION saas.store_admin_invitation_action(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_invitation_id uuid,p_expected_version bigint,p_kind text,p_candidate jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; i saas.store_admin_invitations%ROWTYPE; op saas.store_admin_invitation_operations%ROWTYPE; intent jsonb; result jsonb;
BEGIN
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_kind NOT IN('resend','revoke') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('invitation-operation/'||p_operation_id::text,0));
 SELECT * INTO i FROM saas.store_admin_invitations WHERE id=p_invitation_id AND store_id=p_store_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 e:=saas.store_admin_invitation_authority(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 intent:=jsonb_build_object('invitationId',p_invitation_id,'expectedVersion',p_expected_version,'membershipId',p_membership_id);
 SELECT * INTO op FROM saas.store_admin_invitation_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF op.store_id<>p_store_id OR op.actor_id<>p_principal_id OR op.kind<>p_kind OR op.fingerprint<>p_fingerprint OR op.intent<>intent THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN;
 END IF;
 IF i.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 IF i.status<>'pending' OR i.expires_at<=p_now THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 IF p_kind='resend' THEN
  IF p_now<i.updated_at+interval '1 minute' OR (SELECT count(*) FROM saas.store_admin_invitation_events WHERE invitation_id=i.id AND kind='resent' AND occurred_at>p_now-interval '1 hour')>=5 THEN RETURN QUERY SELECT 'rate_limited',NULL::jsonb; RETURN; END IF;
  IF NOT saas.store_admin_invitation_candidate_valid(p_candidate,i.generation+1,i.id) OR p_candidate->>'tokenDigest'=i.token_digest THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 END IF;
 UPDATE saas.store_admin_invitation_acceptance_grants SET invalidated_at=p_now WHERE invitation_id=i.id AND invalidated_at IS NULL AND consumed_at IS NULL;
 UPDATE saas.store_admin_invitation_deliveries SET status=CASE WHEN status='sending' THEN 'outcome_unknown' ELSE 'failed' END,safe_error_code='invitation_unavailable',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE invitation_id=i.id AND status IN('queued','sending');
 UPDATE saas.store_admin_invitations SET generation=generation+1,version=version+1,updated_at=p_now,
 status=CASE WHEN p_kind='revoke' THEN 'revoked' ELSE 'pending' END,
 revoked_at=CASE WHEN p_kind='revoke' THEN p_now ELSE NULL END,
 token_digest=CASE WHEN p_kind='resend' THEN p_candidate->>'tokenDigest' ELSE token_digest END WHERE id=i.id;
 IF p_kind='resend' THEN PERFORM saas.store_admin_invitation_enqueue(p_store_id,i.id,i.generation+1,p_candidate,p_now); END IF;
 result:=saas.store_admin_invitation_projection(i.id,p_now);
 INSERT INTO saas.store_admin_invitation_operations VALUES(p_operation_id,p_store_id,p_principal_id,p_kind,p_fingerprint,intent,result,p_now);
 INSERT INTO saas.store_admin_invitation_events VALUES(p_operation_id,p_store_id,i.id,i.generation+1,CASE WHEN p_kind='resend' THEN 'resent' ELSE 'revoked' END,p_principal_id,p_now);
 RETURN QUERY SELECT CASE WHEN p_kind='resend' THEN 'resent' ELSE 'revoked' END,result;
END $f$;
CREATE FUNCTION saas.store_admin_invitation_resend(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_invitation_id uuid,p_expected_version bigint,p_candidate jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT * FROM saas.store_admin_invitation_action(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_invitation_id,p_expected_version,'resend',p_candidate)
$f$;
CREATE FUNCTION saas.store_admin_invitation_revoke(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_invitation_id uuid,p_expected_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT * FROM saas.store_admin_invitation_action(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_invitation_id,p_expected_version,'revoke',NULL)
$f$;

CREATE FUNCTION saas.store_admin_invitation_resolve(p_token_digest text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE i saas.store_admin_invitations%ROWTYPE;
BEGIN
 SELECT * INTO i FROM saas.store_admin_invitations WHERE token_digest=p_token_digest AND status='pending' AND expires_at>p_now FOR SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 IF saas.store_admin_invitation_authority(i.store_id,i.inviter_principal_id,i.inviter_membership_id,i.plan_id,i.plan_code,i.plan_version,p_now) IS NOT NULL THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'resolved',jsonb_build_object('invitationId',i.id,'generation',i.generation,'storeId',i.store_id,'email',i.email,'displayName',i.display_name,'role',i.role,'expiresAt',saas.merchant_admin_timestamp(i.expires_at));
END $f$;
CREATE FUNCTION saas.store_admin_invitation_grant(p_invitation_id uuid,p_generation bigint,p_token_digest text,p_browser_key_id text,p_browser_digest text,p_issuer text,p_subject text,p_email text,p_email_verified boolean,p_grant_id uuid,p_grant_digest text,p_operation_id uuid,p_fingerprint text,p_now timestamptz,p_expires_at timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE i saas.store_admin_invitations%ROWTYPE; op saas.store_admin_invitation_operations%ROWTYPE; intent jsonb; result jsonb;
BEGIN
 IF p_email_verified IS DISTINCT FROM true THEN RETURN QUERY SELECT 'unverified_identity',NULL::jsonb; RETURN; END IF;
 IF p_now IS NULL OR p_expires_at IS NULL OR p_expires_at<=p_now OR p_expires_at>p_now+interval '10 minutes' OR p_operation_id IS NULL OR p_grant_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_grant_digest IS NULL OR p_grant_digest!~'^[a-f0-9]{64}$' OR p_browser_digest IS NULL OR p_browser_digest!~'^[a-f0-9]{64}$' OR p_browser_key_id IS NULL OR p_browser_key_id!~'^[A-Za-z0-9_-]{1,64}$' OR p_issuer IS NULL OR length(p_issuer) NOT BETWEEN 1 AND 2048 OR p_issuer<>btrim(p_issuer) OR p_subject IS NULL OR length(p_subject) NOT BETWEEN 1 AND 512 OR p_subject<>btrim(p_subject) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('invitation-operation/'||p_operation_id::text,0));
 SELECT * INTO i FROM saas.store_admin_invitations WHERE id=p_invitation_id FOR UPDATE;
 IF NOT FOUND OR i.status<>'pending' OR i.generation IS DISTINCT FROM p_generation OR i.token_digest IS DISTINCT FROM p_token_digest OR i.expires_at<=p_now OR p_expires_at>i.expires_at THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 IF saas.store_admin_invitation_authority(i.store_id,i.inviter_principal_id,i.inviter_membership_id,i.plan_id,i.plan_code,i.plan_version,p_now) IS NOT NULL THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 IF saas.store_admin_invitation_email(p_email) IS DISTINCT FROM i.email THEN RETURN QUERY SELECT 'email_mismatch',NULL::jsonb; RETURN; END IF;
 -- Audit/operations store only a digest of proof-bound intent, not grant/browser credentials.
 intent:=jsonb_build_object('proof',encode(sha256(convert_to(jsonb_build_array(i.id,p_generation,p_token_digest,p_browser_key_id,p_browser_digest,p_issuer,p_subject,i.email,p_grant_id,p_grant_digest,p_expires_at)::text,'UTF8')),'hex'));
 SELECT * INTO op FROM saas.store_admin_invitation_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF op.store_id<>i.store_id OR op.kind<>'grant' OR op.fingerprint<>p_fingerprint OR op.intent<>intent THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN;
 END IF;
 INSERT INTO saas.store_admin_invitation_acceptance_grants(id,invitation_id,generation,token_digest,grant_digest,browser_key_id,browser_digest,issuer,subject,email,created_at,expires_at)
 VALUES(p_grant_id,i.id,i.generation,i.token_digest,p_grant_digest,p_browser_key_id,p_browser_digest,p_issuer,p_subject,i.email,p_now,p_expires_at);
 result:=jsonb_build_object('grantId',p_grant_id,'invitationId',i.id,'generation',i.generation,'expiresAt',saas.merchant_admin_timestamp(p_expires_at));
 INSERT INTO saas.store_admin_invitation_operations VALUES(p_operation_id,i.store_id,i.inviter_principal_id,'grant',p_fingerprint,intent,result,p_now);
 INSERT INTO saas.store_admin_invitation_events VALUES(p_operation_id,i.store_id,i.id,i.generation,'granted',i.inviter_principal_id,p_now);
 RETURN QUERY SELECT 'granted',result;
END $f$;

-- Identity-only preview/recovery for a still-live verified browser-bound grant.
-- No mutation and no panel session; HTTP callers must project away issuer/subject.
CREATE FUNCTION saas.store_admin_invitation_grant_preview(p_grant_digest text,p_browser_key_id text,p_browser_digest text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE g saas.store_admin_invitation_acceptance_grants%ROWTYPE; i saas.store_admin_invitations%ROWTYPE;
BEGIN
 SELECT * INTO g FROM saas.store_admin_invitation_acceptance_grants WHERE grant_digest=p_grant_digest;
 IF NOT FOUND OR p_now IS NULL OR g.browser_key_id IS DISTINCT FROM p_browser_key_id OR g.browser_digest IS DISTINCT FROM p_browser_digest OR g.invalidated_at IS NOT NULL OR g.expires_at<=p_now OR g.created_at>p_now THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 SELECT * INTO i FROM saas.store_admin_invitations WHERE id=g.invitation_id FOR SHARE;
 IF NOT FOUND OR i.generation<>g.generation OR i.token_digest<>g.token_digest OR i.email<>g.email OR i.expires_at<=p_now OR i.status NOT IN('pending','accepted') OR (i.status='accepted' AND g.consumed_at IS NULL) THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 IF saas.store_admin_invitation_authority(i.store_id,i.inviter_principal_id,i.inviter_membership_id,i.plan_id,i.plan_code,i.plan_version,p_now) IS NOT NULL THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'grant_available',jsonb_build_object('grantId',g.id,'invitationId',i.id,'generation',i.generation,'storeId',i.store_id,'storeName',(SELECT name FROM saas.stores WHERE id=i.store_id),'email',i.email,'displayName',i.display_name,'role',i.role,'expiresAt',saas.merchant_admin_timestamp(g.expires_at),'issuer',g.issuer,'subject',g.subject,'accepted',g.consumed_at IS NOT NULL);
END $f$;
CREATE FUNCTION saas.store_admin_invitation_accept(p_grant_digest text,p_browser_key_id text,p_browser_digest text,p_operation_id uuid,p_fingerprint text,p_principal_id uuid,p_membership_id uuid,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE i saas.store_admin_invitations%ROWTYPE; g saas.store_admin_invitation_acceptance_grants%ROWTYPE; op saas.store_admin_invitation_operations%ROWTYPE;
 principal saas.principals%ROWTYPE; membership saas.memberships%ROWTYPE; iid uuid; intent jsonb; result jsonb; admin_host text; effective_role text;
BEGIN
 IF p_operation_id IS NULL OR p_now IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('invitation-operation/'||p_operation_id::text,0));
 SELECT invitation_id INTO iid FROM saas.store_admin_invitation_acceptance_grants WHERE grant_digest=p_grant_digest;
 SELECT * INTO i FROM saas.store_admin_invitations WHERE id=iid FOR UPDATE;
 SELECT * INTO g FROM saas.store_admin_invitation_acceptance_grants WHERE grant_digest=p_grant_digest FOR UPDATE;
 IF NOT FOUND OR g.browser_key_id IS DISTINCT FROM p_browser_key_id OR g.browser_digest IS DISTINCT FROM p_browser_digest THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 intent:=jsonb_build_object('grantId',g.id);
 SELECT * INTO op FROM saas.store_admin_invitation_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF op.kind<>'accept' OR op.fingerprint<>p_fingerprint OR op.intent<>intent OR g.consumed_operation_id IS DISTINCT FROM p_operation_id THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN;
 END IF;
 IF g.consumed_at IS NOT NULL OR g.invalidated_at IS NOT NULL OR g.expires_at<=p_now OR g.created_at>p_now OR i.status<>'pending' OR i.expires_at<=p_now OR i.generation<>g.generation OR i.token_digest<>g.token_digest OR i.email<>g.email THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 -- Serialize recipient acceptance BEFORE acquiring any inviter authority locks.
 -- In particular, two self-invites must not retain owner SHARE locks while one
 -- waits for the other's identity serialization lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('invitation-identity/'||jsonb_build_array(g.issuer,g.subject)::text,0));
 IF saas.store_admin_invitation_authority(i.store_id,i.inviter_principal_id,i.inviter_membership_id,i.plan_id,i.plan_code,i.plan_version,p_now) IS NOT NULL THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 SELECT hostname INTO admin_host FROM saas.admin_domains WHERE store_id=i.store_id AND status='active' AND verified_at IS NOT NULL ORDER BY canonical DESC,created_at,id LIMIT 1 FOR SHARE;
 IF admin_host IS NULL THEN RETURN QUERY SELECT 'configuration_unavailable',NULL::jsonb; RETURN; END IF;
 IF p_principal_id IS NULL OR p_membership_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 -- Existing principals are validated, never mutated by acceptance. Shared reads
 -- also avoid cross-inviter principal lock upgrades for two existing owners.
 SELECT * INTO principal FROM saas.principals WHERE issuer=g.issuer AND subject=g.subject FOR SHARE;
 IF NOT FOUND THEN
  INSERT INTO saas.principals VALUES(p_principal_id,g.issuer,g.subject,g.email,true,p_now,p_now) RETURNING * INTO principal;
 END IF;
 IF NOT principal.email_verified OR principal.email<>g.email THEN RETURN QUERY SELECT 'email_mismatch',NULL::jsonb; RETURN; END IF;
 SELECT * INTO membership FROM saas.memberships WHERE principal_id=principal.id AND store_id=i.store_id FOR SHARE;
 IF FOUND AND membership.status<>'active' THEN RETURN QUERY SELECT 'revoked_membership',NULL::jsonb; RETURN; END IF;
 IF membership.id IS NULL THEN
  INSERT INTO saas.memberships VALUES(p_membership_id,principal.id,i.store_id,i.role,'active',p_now,p_now) RETURNING * INTO membership;
 ELSE
  effective_role:=CASE WHEN array_position(ARRAY['analyst','editor','admin','store_owner'],membership.role)>=array_position(ARRAY['analyst','editor','admin','store_owner'],i.role) THEN membership.role ELSE i.role END;
  -- Only an actual non-owner promotion requires a write. An owner can never be
  -- promoted by an invitation, so inviter-owner authority locks are not upgraded.
  IF effective_role<>membership.role THEN
   UPDATE saas.memberships SET role=effective_role,updated_at=p_now WHERE id=membership.id RETURNING * INTO membership;
  END IF;
 END IF;
 UPDATE saas.store_admin_invitations SET status='accepted',accepted_principal_id=principal.id,accepted_membership_id=membership.id,accepted_at=p_now,updated_at=p_now,version=version+1 WHERE id=i.id;
 UPDATE saas.store_admin_invitation_deliveries SET status=CASE WHEN status='sending' THEN 'outcome_unknown' ELSE 'failed' END,safe_error_code='invitation_unavailable',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE invitation_id=i.id AND status IN('queued','sending');
 result:=jsonb_build_object('invitationId',i.id,'storeId',i.store_id,'principalId',principal.id,'membershipId',membership.id,'role',membership.role,'adminHostname',admin_host);
 INSERT INTO saas.store_admin_invitation_operations VALUES(p_operation_id,i.store_id,principal.id,'accept',p_fingerprint,intent,result,p_now);
 UPDATE saas.store_admin_invitation_acceptance_grants SET consumed_at=p_now,consumed_operation_id=p_operation_id WHERE id=g.id;
 UPDATE saas.store_admin_invitation_acceptance_grants SET invalidated_at=p_now WHERE invitation_id=i.id AND id<>g.id AND consumed_at IS NULL AND invalidated_at IS NULL;
 INSERT INTO saas.store_admin_invitation_events VALUES(p_operation_id,i.store_id,i.id,i.generation,'accepted',principal.id,p_now);
 RETURN QUERY SELECT 'accepted',result;
END $f$;
CREATE FUNCTION saas.store_admin_invitation_recover_acceptance(p_grant_digest text,p_browser_key_id text,p_browser_digest text,p_operation_id uuid,p_fingerprint text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT * FROM saas.store_admin_invitation_accept(p_grant_digest,p_browser_key_id,p_browser_digest,p_operation_id,p_fingerprint,NULL,NULL,p_now)
$f$;

CREATE FUNCTION saas.store_admin_invitation_delivery_claim(p_worker_id text,p_lease_id uuid,p_now timestamptz,p_lease_expires_at timestamptz,p_limit integer,p_allowed_store_id uuid,p_allowed_recipient text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE d saas.store_admin_invitation_deliveries%ROWTYPE; i saas.store_admin_invitations%ROWTYPE; items jsonb:='[]';
BEGIN
 IF p_worker_id IS NULL OR p_worker_id!~'^[A-Za-z0-9_-]{1,80}$' OR p_lease_id IS NULL OR p_now IS NULL OR p_lease_expires_at IS NULL OR p_lease_expires_at<=p_now OR p_lease_expires_at>p_now+interval '5 minutes' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 OR p_allowed_store_id IS NULL OR p_allowed_recipient IS NULL OR saas.store_admin_invitation_email(p_allowed_recipient) IS NULL OR saas.store_admin_invitation_email(p_allowed_recipient) IS DISTINCT FROM p_allowed_recipient THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 -- A lease UUID identifies exactly one claim call, including its bounded batch.
 PERFORM pg_advisory_xact_lock(hashtextextended('invitation-lease/'||p_lease_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.store_admin_invitation_deliveries WHERE p_lease_id=ANY(lease_history)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 -- Scope BEFORE row locks and housekeeping: unrelated queues must remain untouched.
 -- Lock invitation before delivery throughout lifecycle to prevent revoke/claim deadlocks.
 FOR i IN SELECT inv.* FROM saas.store_admin_invitations inv WHERE inv.store_id=p_allowed_store_id AND inv.email=p_allowed_recipient AND EXISTS(SELECT 1 FROM saas.store_admin_invitation_deliveries job WHERE job.invitation_id=inv.id AND job.status IN('queued','sending') AND job.next_attempt_at<=p_now AND (job.lease_expires_at IS NULL OR job.lease_expires_at<=p_now)) ORDER BY inv.created_at,inv.id FOR UPDATE SKIP LOCKED LIMIT 100 LOOP
  FOR d IN SELECT * FROM saas.store_admin_invitation_deliveries WHERE invitation_id=i.id AND status IN('queued','sending') AND next_attempt_at<=p_now AND (lease_expires_at IS NULL OR lease_expires_at<=p_now) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LOOP
   IF d.generation<>i.generation OR i.status<>'pending' OR i.expires_at<=p_now OR saas.store_admin_invitation_authority(i.store_id,i.inviter_principal_id,i.inviter_membership_id,i.plan_id,i.plan_code,i.plan_version,p_now) IS NOT NULL THEN
    UPDATE saas.store_admin_invitation_deliveries SET status=CASE WHEN attempt_count>0 THEN 'outcome_unknown' ELSE 'failed' END,safe_error_code='invitation_unavailable',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE id=d.id; CONTINUE;
   END IF;
   IF d.attempt_count>=8 OR (d.replay_deadline IS NOT NULL AND p_lease_expires_at>=d.replay_deadline) THEN
    UPDATE saas.store_admin_invitation_deliveries SET status='outcome_unknown',safe_error_code='replay_horizon',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE id=d.id; CONTINUE;
   END IF;
   UPDATE saas.store_admin_invitation_deliveries SET status='sending',attempt_count=attempt_count+1,first_attempt_at=COALESCE(first_attempt_at,p_now),replay_deadline=COALESCE(replay_deadline,p_now+interval '23 hours 55 minutes'),lease_id=p_lease_id,lease_owner=p_worker_id,lease_expires_at=p_lease_expires_at,lease_history=array_append(lease_history,p_lease_id),updated_at=p_now WHERE id=d.id RETURNING * INTO d;
   items:=items||jsonb_build_array(jsonb_build_object('deliveryId',d.id,'invitationId',i.id,'storeId',i.store_id,'generation',d.generation,'sealVersion',d.seal_version,'keyId',d.key_id,'ciphertext',encode(d.ciphertext,'hex'),'ciphertextDigest',d.ciphertext_digest,'rendererVersion',d.renderer_version,'idempotencyKey',d.idempotency_key,'attemptCount',d.attempt_count,'firstAttemptAt',saas.merchant_admin_timestamp(d.first_attempt_at),'replayDeadline',saas.merchant_admin_timestamp(d.replay_deadline)));
   IF jsonb_array_length(items)>=p_limit THEN RETURN QUERY SELECT 'claimed',jsonb_build_object('items',items); RETURN; END IF;
  END LOOP;
 END LOOP;
 RETURN QUERY SELECT 'claimed',jsonb_build_object('items',items);
END $f$;
-- Mandatory fresh fence immediately before the external send. A subsequent revoke
-- cannot unsend an already in-flight request; token authority still dies immediately.
CREATE FUNCTION saas.store_admin_invitation_delivery_authorize(p_delivery_id uuid,p_lease_id uuid,p_worker_id text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE i saas.store_admin_invitations%ROWTYPE; d saas.store_admin_invitation_deliveries%ROWTYPE;
BEGIN
 SELECT inv.* INTO i FROM saas.store_admin_invitations inv JOIN saas.store_admin_invitation_deliveries job ON job.invitation_id=inv.id WHERE job.id=p_delivery_id FOR SHARE OF inv;
 SELECT * INTO d FROM saas.store_admin_invitation_deliveries WHERE id=p_delivery_id FOR SHARE;
 IF NOT FOUND OR p_now IS NULL OR d.status<>'sending' OR d.lease_id IS DISTINCT FROM p_lease_id OR d.lease_owner IS DISTINCT FROM p_worker_id OR d.lease_expires_at<=p_now OR d.updated_at>p_now OR d.replay_deadline<=p_now OR i.status<>'pending' OR i.generation<>d.generation OR i.expires_at<=p_now THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 IF saas.store_admin_invitation_authority(i.store_id,i.inviter_principal_id,i.inviter_membership_id,i.plan_id,i.plan_code,i.plan_version,p_now) IS NOT NULL THEN RETURN QUERY SELECT 'invitation_unavailable',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'authorized',jsonb_build_object('deliveryId',d.id,'invitationId',i.id,'storeId',i.store_id,'generation',i.generation,'attemptCount',d.attempt_count,'leaseExpiresAt',saas.merchant_admin_timestamp(d.lease_expires_at),'expiresAt',saas.merchant_admin_timestamp(i.expires_at));
END $f$;
CREATE FUNCTION saas.store_admin_invitation_delivery_settle(p_delivery_id uuid,p_lease_id uuid,p_worker_id text,p_now timestamptz,p_result_kind text,p_provider_message_id text,p_safe_error_code text,p_next_attempt_at timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE d saas.store_admin_invitation_deliveries%ROWTYPE; i saas.store_admin_invitations%ROWTYPE; new_status text; intent jsonb; result jsonb;
BEGIN
 IF p_result_kind IS NULL OR p_result_kind NOT IN('provider_accepted','retry','failed','outcome_unknown') OR p_now IS NULL OR (p_safe_error_code IS NOT NULL AND p_safe_error_code NOT IN('provider_rejected','provider_timeout','provider_rate_limited','provider_unavailable','configuration_unavailable','invalid_response')) OR (p_provider_message_id IS NOT NULL AND p_provider_message_id!~'^[A-Za-z0-9_-]{1,200}$') OR (p_result_kind='provider_accepted' AND p_provider_message_id IS NULL) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 -- Event ingestion takes this SAME message lock before any row locks. Holding
 -- it until commit closes the gap between reconciliation and message visibility.
 -- Never move it after invitation/delivery locks: that would invert event order.
 IF p_result_kind='provider_accepted' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('invitation-provider-message/'||p_provider_message_id,0));
 END IF;
 SELECT inv.* INTO i FROM saas.store_admin_invitations inv JOIN saas.store_admin_invitation_deliveries job ON job.invitation_id=inv.id WHERE job.id=p_delivery_id FOR UPDATE OF inv;
 SELECT * INTO d FROM saas.store_admin_invitation_deliveries WHERE id=p_delivery_id FOR UPDATE;
 intent:=jsonb_build_array(p_result_kind,p_provider_message_id,p_safe_error_code,saas.merchant_admin_timestamp(p_next_attempt_at));
 IF FOUND AND d.settled_lease_id=p_lease_id AND d.settled_worker=p_worker_id THEN
  IF d.settled_intent=intent THEN RETURN QUERY SELECT 'operation_replayed',d.settled_result;
  ELSE RETURN QUERY SELECT 'operation_conflict',NULL::jsonb; END IF; RETURN;
 END IF;
 IF NOT FOUND OR d.status<>'sending' OR d.lease_id IS DISTINCT FROM p_lease_id OR d.lease_owner IS DISTINCT FROM p_worker_id OR d.lease_expires_at<=p_now OR d.updated_at>p_now OR d.generation<>i.generation OR i.status<>'pending' OR i.expires_at<=p_now THEN RETURN QUERY SELECT 'stale_lease',NULL::jsonb; RETURN; END IF;
 IF saas.store_admin_invitation_authority(i.store_id,i.inviter_principal_id,i.inviter_membership_id,i.plan_id,i.plan_code,i.plan_version,p_now) IS NOT NULL THEN RETURN QUERY SELECT 'stale_lease',NULL::jsonb; RETURN; END IF;
 new_status:=p_result_kind;
 IF p_result_kind='retry' THEN
  IF p_next_attempt_at IS NULL OR p_next_attempt_at<p_now+interval '1 second' OR p_next_attempt_at>p_now+interval '1 hour' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  new_status:=CASE WHEN d.attempt_count>=8 OR p_next_attempt_at+interval '5 minutes'>=d.replay_deadline THEN 'outcome_unknown' ELSE 'queued' END;
 END IF;
 UPDATE saas.store_admin_invitation_deliveries SET status=new_status,provider_message_id=CASE WHEN p_result_kind='provider_accepted' THEN p_provider_message_id ELSE NULL END,safe_error_code=p_safe_error_code,next_attempt_at=CASE WHEN new_status='queued' THEN p_next_attempt_at ELSE next_attempt_at END,lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now WHERE id=d.id;
 -- A verified event may arrive before provider acceptance is committed.
 IF new_status='provider_accepted' THEN
  UPDATE saas.store_admin_invitation_deliveries SET status=ev.kind FROM (SELECT kind FROM saas.store_admin_invitation_provider_events WHERE provider_message_id=p_provider_message_id ORDER BY occurred_at DESC,event_id DESC LIMIT 1)ev WHERE id=d.id;
 END IF;
 result:=jsonb_build_object('deliveryId',d.id,'deliveryStatus',(SELECT status FROM saas.store_admin_invitation_deliveries WHERE id=d.id));
 UPDATE saas.store_admin_invitation_deliveries SET settled_lease_id=p_lease_id,settled_worker=p_worker_id,settled_intent=intent,settled_result=result WHERE id=d.id;
 RETURN QUERY SELECT 'settled',result;
END $f$;
-- Only identity executes this function after authenticating provider event signatures.
CREATE FUNCTION saas.store_admin_invitation_delivery_event(p_provider_event_id text,p_provider_message_id text,p_event_kind text,p_occurred_at timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE ev saas.store_admin_invitation_provider_events%ROWTYPE; replayed boolean:=false;
BEGIN
 IF p_provider_event_id IS NULL OR length(p_provider_event_id) NOT BETWEEN 1 AND 200 OR p_provider_message_id IS NULL OR p_provider_message_id!~'^[A-Za-z0-9_-]{1,200}$' OR p_event_kind IS NULL OR p_event_kind NOT IN('delivered','failed') OR p_occurred_at IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 -- Global order: provider message -> provider event -> delivery row. Settlement
 -- uses provider message -> invitation -> delivery; no row-held message wait.
 PERFORM pg_advisory_xact_lock(hashtextextended('invitation-provider-message/'||p_provider_message_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('invitation-provider-event/'||p_provider_event_id,0));
 SELECT * INTO ev FROM saas.store_admin_invitation_provider_events WHERE event_id=p_provider_event_id;
 IF FOUND THEN
  IF (ev.provider_message_id,ev.kind,ev.occurred_at) IS DISTINCT FROM (p_provider_message_id,p_event_kind,p_occurred_at) THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb; RETURN; END IF;
  replayed:=true;
 ELSE
  INSERT INTO saas.store_admin_invitation_provider_events VALUES(p_provider_event_id,p_provider_message_id,p_event_kind,p_occurred_at);
 END IF;
 -- Exact duplicate events still reconcile retained evidence (including rows
 -- created by an older racing integration); idempotency must not skip repair.
 UPDATE saas.store_admin_invitation_deliveries SET status=p_event_kind WHERE provider_message_id=p_provider_message_id AND status='provider_accepted';
 RETURN QUERY SELECT CASE WHEN replayed THEN 'operation_replayed' ELSE 'recorded' END,'{}'::jsonb;
END $f$;

DO $f$ DECLARE n text; fn regprocedure; BEGIN
 FOREACH n IN ARRAY ARRAY['store_admin_invitations','store_admin_invitation_deliveries','store_admin_invitation_operations','store_admin_invitation_acceptance_grants','store_admin_invitation_events','store_admin_invitation_provider_events'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON TABLE saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver',n);
 END LOOP;
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'store_admin_invitation\_%' ESCAPE '\' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver',fn);
 END LOOP;
END $f$;
GRANT EXECUTE ON FUNCTION saas.store_admin_invitation_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app,celebix_saas_identity;
GRANT EXECUTE ON FUNCTION
 saas.store_admin_invitation_source(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint),
 saas.store_admin_invitation_resend_source(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint),
 saas.store_admin_invitation_issue(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb),
 saas.store_admin_invitation_resend(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,jsonb),
 saas.store_admin_invitation_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
 saas.store_admin_invitation_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),
 saas.store_admin_invitation_resolve(text,timestamptz),
 saas.store_admin_invitation_grant(uuid,bigint,text,text,text,text,text,text,boolean,uuid,text,uuid,text,timestamptz,timestamptz),
 saas.store_admin_invitation_grant_preview(text,text,text,timestamptz),
 saas.store_admin_invitation_accept(text,text,text,uuid,text,uuid,uuid,timestamptz),
 saas.store_admin_invitation_recover_acceptance(text,text,text,uuid,text,timestamptz),
 saas.store_admin_invitation_delivery_event(text,text,text,timestamptz)
 TO celebix_saas_identity;
GRANT EXECUTE ON FUNCTION saas.store_admin_invitation_delivery_claim(text,uuid,timestamptz,timestamptz,integer,uuid,text),
 saas.store_admin_invitation_delivery_authorize(uuid,uuid,text,timestamptz),
 saas.store_admin_invitation_delivery_settle(uuid,uuid,text,timestamptz,text,text,text,timestamptz) TO celebix_saas_workflow;
COMMIT;
