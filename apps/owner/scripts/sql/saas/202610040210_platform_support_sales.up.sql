-- Restricted support authority and NEW-sale admission policy. No production seed.
BEGIN;
DO $role$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='celebix_saas_support_runtime') THEN CREATE ROLE celebix_saas_support_runtime NOLOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION; ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='celebix_saas_support_runtime' AND (rolcanlogin OR rolinherit OR rolbypassrls OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication)) THEN RAISE EXCEPTION 'UNSAFE_SUPPORT_ROLE'; END IF; END $role$;
SET LOCAL ROLE celebix_saas_owner;
CREATE TABLE saas.platform_support_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operator_id uuid NOT NULL REFERENCES saas.platform_operators(id),
 principal_id uuid NOT NULL REFERENCES saas.principals(id), store_id uuid NOT NULL REFERENCES saas.stores(id),
 admin_host text NOT NULL, reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 3 AND 1000),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, redeemed_at timestamptz, handoff_hash text NOT NULL UNIQUE,
 credential_hash text UNIQUE, version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 idempotency_key text NOT NULL, UNIQUE(operator_id,idempotency_key),
 CHECK(expires_at=issued_at+interval '30 minutes')
);
ALTER TABLE saas.memberships ADD COLUMN support_session_id uuid UNIQUE REFERENCES saas.platform_support_sessions(id);
ALTER TABLE saas.memberships DROP CONSTRAINT memberships_principal_store_key;
CREATE UNIQUE INDEX memberships_normal_principal_store ON saas.memberships(principal_id,store_id) WHERE support_session_id IS NULL;
CREATE TABLE saas.store_sales_policy (
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id), paused boolean NOT NULL DEFAULT false,
 reason text, version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by uuid REFERENCES saas.platform_operators(id)
);
CREATE TABLE saas.platform_support_write_journal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES saas.platform_support_sessions(id),
 operator_id uuid NOT NULL REFERENCES saas.platform_operators(id), store_id uuid NOT NULL REFERENCES saas.stores(id),
 function_name text, table_name text, operation text NOT NULL, record_key jsonb,
 transaction_id bigint NOT NULL DEFAULT txid_current(), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER platform_support_journal_append_only BEFORE UPDATE OR DELETE ON saas.platform_support_write_journal FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
CREATE INDEX platform_support_journal_origin ON saas.platform_support_write_journal(table_name,(record_key->>'id')) WHERE operation='INSERT';
CREATE TABLE saas.platform_support_function_backup(signature text PRIMARY KEY,definition text NOT NULL);
CREATE FUNCTION saas.platform_membership_is_authorized(p_membership uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.memberships m LEFT JOIN saas.platform_support_sessions s ON s.id=m.support_session_id
 LEFT JOIN saas.platform_operators o ON o.id=s.operator_id
 WHERE m.id=p_membership AND m.status='active' AND (m.support_session_id IS NULL OR
 (s.revoked_at IS NULL AND s.redeemed_at IS NOT NULL AND s.expires_at>clock_timestamp() AND o.active
 AND s.principal_id=m.principal_id AND s.store_id=m.store_id AND o.principal_id=s.principal_id
 AND EXISTS(SELECT 1 FROM saas.principals p WHERE p.id=s.principal_id AND p.issuer=o.issuer AND p.subject=o.subject AND p.email_verified AND lower(p.email)=o.email)
 AND EXISTS(SELECT 1 FROM saas.admin_domains d WHERE d.store_id=s.store_id AND d.hostname=s.admin_host AND d.status='active' AND d.verified_at<=clock_timestamp()))));
$f$;
CREATE VIEW saas.platform_authorized_memberships AS SELECT * FROM saas.memberships WHERE support_session_id IS NULL OR saas.platform_membership_is_authorized(id);
CREATE VIEW saas.platform_normal_memberships AS SELECT * FROM saas.memberships WHERE support_session_id IS NULL;
-- Historic actor labels are provenance, never live authorization. Keeping them
-- readable lets a normal manager finish a received sale after support expires.
CREATE VIEW saas.platform_provenance_memberships AS SELECT * FROM saas.memberships;
ALTER POLICY memberships_principal_discovery ON saas.memberships USING (principal_id = nullif(current_setting('app.current_principal_id',true),'')::uuid AND status='active' AND support_session_id IS NULL);
CREATE FUNCTION saas.platform_support_begin(p_store uuid,p_principal uuid,p_membership uuid,p_function text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE s saas.platform_support_sessions;
BEGIN
 SELECT session.* INTO s FROM saas.memberships m JOIN saas.platform_support_sessions session ON session.id=m.support_session_id
 WHERE m.id=p_membership AND m.principal_id=p_principal AND m.store_id=p_store FOR SHARE OF session;
 IF NOT FOUND THEN PERFORM set_config('app.support_session_id','',true); RETURN; END IF;
 IF NOT saas.platform_membership_is_authorized(p_membership) THEN RAISE EXCEPTION 'membership_denied'; END IF;
 PERFORM set_config('app.support_session_id',s.id::text,true);
 INSERT INTO saas.platform_support_write_journal(session_id,operator_id,store_id,function_name,operation)
 VALUES(s.id,s.operator_id,s.store_id,p_function,'initiated');
 INSERT INTO saas.platform_audit(id,operator_id,store_id,action,payload,created_at)
 VALUES(gen_random_uuid(),s.operator_id,s.store_id,'support.write',jsonb_build_object('sessionId',s.id,'function',p_function),clock_timestamp());
END $f$;
CREATE FUNCTION saas.platform_support_journal_write() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE s saas.platform_support_sessions; body jsonb; origin saas.platform_support_write_journal;
BEGIN
 IF nullif(current_setting('app.support_session_id',true),'') IS NULL THEN
  -- Durable worker jobs retain their initiating operator after the interactive
  -- support session ends. The worker remains the actor and gets no support rights.
  IF current_setting('role',true)='celebix_saas_workflow' AND TG_TABLE_NAME~'(jobs|work|queue|outbox|runs)$' THEN
   body:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
   SELECT * INTO origin FROM saas.platform_support_write_journal j WHERE j.table_name=TG_TABLE_NAME AND j.operation='INSERT' AND j.record_key->>'id'=body->>'id' AND j.store_id::text=body->>'store_id' ORDER BY created_at,id LIMIT 1;
   IF FOUND THEN
    INSERT INTO saas.platform_support_write_journal(session_id,operator_id,store_id,table_name,operation,record_key)
    VALUES(origin.session_id,origin.operator_id,origin.store_id,TG_TABLE_NAME,'workflow:'||TG_OP,jsonb_build_object('id',body->'id','initiatingJournalId',origin.id,'executingRole','celebix_saas_workflow'));
    INSERT INTO saas.platform_audit(id,operator_id,store_id,action,payload,created_at)
    VALUES(gen_random_uuid(),origin.operator_id,origin.store_id,'support.workflow',jsonb_build_object('sessionId',origin.session_id,'initiatingJournalId',origin.id,'table',TG_TABLE_NAME,'id',body->'id','executingRole','celebix_saas_workflow'),clock_timestamp());
   END IF;
  END IF;
  RETURN COALESCE(NEW,OLD);
 END IF;
 SELECT * INTO s FROM saas.platform_support_sessions WHERE id=current_setting('app.support_session_id',true)::uuid;
 IF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() OR NOT EXISTS(SELECT 1 FROM saas.platform_operators WHERE id=s.operator_id AND active) THEN RAISE EXCEPTION 'membership_denied'; END IF;
 body:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF body ? 'store_id' AND (body->>'store_id')::uuid IS DISTINCT FROM s.store_id THEN RAISE EXCEPTION 'support_store_mismatch'; END IF;
 INSERT INTO saas.platform_support_write_journal(session_id,operator_id,store_id,table_name,operation,record_key)
 VALUES(s.id,s.operator_id,s.store_id,TG_TABLE_NAME,TG_OP,jsonb_strip_nulls(jsonb_build_object('id',body->'id','operationId',body->'operation_id','actorMembershipId',body->'actor_membership_id')));
 RETURN COALESCE(NEW,OLD);
END $f$;
CREATE FUNCTION saas.platform_support_projection(p_session uuid) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT jsonb_build_object('id',s.id,'sessionId',s.id,'operatorId',s.operator_id,'principalId',s.principal_id,'storeId',s.store_id,'adminHost',s.admin_host,'reason',s.reason,'issuedAt',s.issued_at,'expiresAt',s.expires_at,'revokedAt',s.revoked_at,'version',s.version,'operatorLabel',o.email)
 FROM saas.platform_support_sessions s JOIN saas.platform_operators o ON o.id=s.operator_id WHERE s.id=p_session;
$f$;
CREATE FUNCTION saas.platform_support_issue(p_operator uuid,p_store uuid,p_host text,p_reason text,p_expected_version bigint,p_key text,p_handoff text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE o saas.platform_operators; s saas.platform_support_sessions; token text; moment timestamptz:=clock_timestamp();
BEGIN
 o:=saas.platform_operator_require_active(p_operator);
 IF p_handoff IS NULL OR p_handoff!~'^[a-f0-9]{64}$' OR p_expected_version<>1 OR p_expected_version IS NULL OR p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 128 OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'invalid_input'; END IF;
 IF o.principal_id IS NULL OR NOT EXISTS(SELECT 1 FROM saas.principals WHERE id=o.principal_id AND issuer=o.issuer AND subject=o.subject AND email_verified) THEN RAISE EXCEPTION 'operator_principal_unverified'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.admin_domains d JOIN saas.stores st ON st.id=d.store_id WHERE st.id=p_store AND st.status='active' AND d.hostname=p_host AND d.status='active' AND d.verified_at<=moment) THEN RAISE EXCEPTION 'admin_host_unverified'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('support.issue:'||p_operator::text||':'||p_key,0));
 SELECT * INTO s FROM saas.platform_support_sessions WHERE operator_id=p_operator AND idempotency_key=p_key;
 IF FOUND THEN
  IF s.store_id<>p_store OR s.admin_host<>p_host OR s.reason<>btrim(p_reason) OR s.handoff_hash<>encode(sha256(convert_to(p_handoff,'UTF8')),'hex') THEN RAISE EXCEPTION 'operation_mismatch'; END IF;
  -- Caller derives this opaque token from its private HMAC key and canonical operation.
  RETURN saas.platform_support_projection(s.id)||jsonb_build_object('replayed',true,'handoff',p_handoff);
 END IF;
 token:=p_handoff;
 INSERT INTO saas.platform_support_sessions(operator_id,principal_id,store_id,admin_host,reason,issued_at,expires_at,handoff_hash,idempotency_key)
 VALUES(p_operator,o.principal_id,p_store,p_host,btrim(p_reason),moment,moment+interval '30 minutes',encode(sha256(convert_to(token,'UTF8')),'hex'),p_key) RETURNING * INTO s;
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at,support_session_id) VALUES(gen_random_uuid(),o.principal_id,p_store,'admin','active',moment,moment,s.id);
 INSERT INTO saas.platform_audit(id,operator_id,store_id,action,payload,created_at) VALUES(gen_random_uuid(),p_operator,p_store,'support.issue',jsonb_build_object('sessionId',s.id,'reason',s.reason,'adminHost',p_host),moment);
 RETURN saas.platform_support_projection(s.id)||jsonb_build_object('handoff',token,'replayed',false);
END $f$;
CREATE FUNCTION saas.platform_support_redeem(p_handoff text,p_host text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE s saas.platform_support_sessions; token text;
BEGIN
 IF p_handoff IS NULL OR p_handoff!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'support_denied'; END IF;
 SELECT * INTO s FROM saas.platform_support_sessions WHERE handoff_hash=encode(sha256(convert_to(p_handoff,'UTF8')),'hex') FOR UPDATE;
 IF s.id IS NULL OR s.admin_host IS DISTINCT FROM p_host OR s.redeemed_at IS NOT NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'support_denied'; END IF;
 PERFORM saas.platform_operator_require_active(s.operator_id);
 IF NOT EXISTS(SELECT 1 FROM saas.admin_domains WHERE hostname=p_host AND store_id=s.store_id AND status='active' AND verified_at<=clock_timestamp()) THEN RAISE EXCEPTION 'support_denied'; END IF;
 token:=encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
 UPDATE saas.platform_support_sessions SET redeemed_at=clock_timestamp(),credential_hash=encode(sha256(convert_to(token,'UTF8')),'hex') WHERE id=s.id;
 INSERT INTO saas.platform_audit(id,operator_id,store_id,action,payload,created_at) VALUES(gen_random_uuid(),s.operator_id,s.store_id,'support.redeem',jsonb_build_object('sessionId',s.id),clock_timestamp());
 RETURN saas.platform_support_projection(s.id)||jsonb_build_object('credential',token);
END $f$;
CREATE FUNCTION saas.platform_support_resolve(p_credential text,p_host text,p_request_id text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE s saas.platform_support_sessions; m saas.memberships; st saas.stores; p saas.principals; subscription saas.subscriptions; entitlement jsonb;
BEGIN
 IF p_credential IS NULL OR p_credential!~'^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 SELECT * INTO s FROM saas.platform_support_sessions WHERE credential_hash=encode(sha256(convert_to(p_credential,'UTF8')),'hex') AND admin_host=p_host;
 SELECT * INTO m FROM saas.memberships WHERE support_session_id=s.id;
 IF s.id IS NULL OR NOT saas.platform_membership_is_authorized(m.id) THEN RETURN NULL; END IF;
 SELECT * INTO st FROM saas.stores WHERE id=s.store_id AND status='active'; IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO p FROM saas.principals WHERE id=s.principal_id;
 SELECT sub.* INTO subscription FROM saas.subscriptions sub JOIN saas.plans plan ON plan.id=sub.plan_id AND plan.plan_code=sub.plan_code AND plan.version=sub.plan_version AND plan.status='active' AND plan.valid_from<=clock_timestamp() AND (plan.valid_until IS NULL OR plan.valid_until>clock_timestamp()) WHERE sub.store_id=s.store_id AND sub.status='active' AND sub.valid_from<=clock_timestamp() AND (sub.valid_until IS NULL OR sub.valid_until>clock_timestamp()); IF NOT FOUND THEN RETURN NULL; END IF;
 entitlement:=jsonb_strip_nulls(jsonb_build_object('schemaVersion',1,'planId',subscription.plan_id,'planCode',subscription.plan_code,'version',subscription.plan_version,'status',subscription.status,'validFrom',subscription.valid_from,'validUntil',subscription.valid_until,
 'features',(SELECT coalesce(jsonb_agg(feature_key ORDER BY feature_ordinal),'[]'::jsonb) FROM saas.plan_features WHERE plan_id=subscription.plan_id AND enabled),
 'limits',(SELECT jsonb_object_agg(limit_key,effective_limit) FROM saas.plan_limits WHERE plan_id=subscription.plan_id)));
 RETURN jsonb_build_object('support',saas.platform_support_projection(s.id),'tenantContext',jsonb_build_object('schemaVersion',1,'requestId',p_request_id,'principal',jsonb_build_object('id',p.id,'issuer',p.issuer,'subject',p.subject),'store',jsonb_build_object('id',st.id,'slug',st.slug,'status',st.status),'membership',jsonb_build_object('id',m.id,'role',m.role,'status',m.status),'entitlements',entitlement,'locale',st.locale));
END $f$;
CREATE FUNCTION saas.platform_support_revoke(p_operator uuid,p_session uuid,p_expected_version bigint,p_key text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE s saas.platform_support_sessions;
BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);
 SELECT * INTO s FROM saas.platform_support_sessions WHERE id=p_session FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
 IF s.revoked_at IS NOT NULL THEN RETURN saas.platform_support_projection(s.id); END IF;
 IF s.version IS DISTINCT FROM p_expected_version OR p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'version_conflict'; END IF;
 UPDATE saas.platform_support_sessions SET revoked_at=clock_timestamp(),version=version+1 WHERE id=s.id;
 UPDATE saas.memberships SET status='revoked',updated_at=clock_timestamp() WHERE support_session_id=s.id;
 INSERT INTO saas.platform_audit(id,operator_id,store_id,action,payload,created_at) VALUES(gen_random_uuid(),p_operator,s.store_id,'support.revoke',jsonb_build_object('sessionId',s.id,'idempotencyKey',p_key),clock_timestamp());
 RETURN saas.platform_support_projection(s.id);
END $f$;
CREATE FUNCTION saas.platform_support_end(p_credential text,p_host text) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE s saas.platform_support_sessions;
BEGIN
 SELECT * INTO s FROM saas.platform_support_sessions WHERE credential_hash=encode(sha256(convert_to(p_credential,'UTF8')),'hex') AND admin_host=p_host FOR UPDATE;
 IF s.id IS NULL OR s.revoked_at IS NOT NULL THEN RETURN; END IF;
 UPDATE saas.platform_support_sessions SET revoked_at=coalesce(revoked_at,clock_timestamp()),version=version+1 WHERE id=s.id;
 UPDATE saas.memberships SET status='revoked',updated_at=clock_timestamp() WHERE support_session_id=s.id;
 INSERT INTO saas.platform_audit(id,operator_id,store_id,action,payload,created_at) VALUES(gen_random_uuid(),s.operator_id,s.store_id,'support.end',jsonb_build_object('sessionId',s.id),clock_timestamp());
END $f$;
CREATE FUNCTION saas.platform_support_list(p_operator uuid,p_query jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN PERFORM saas.platform_operator_require_active(p_operator); RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(saas.platform_support_projection(id) ORDER BY issued_at DESC),'[]'::jsonb) FROM (SELECT id,issued_at FROM saas.platform_support_sessions WHERE p_query->>'storeId' IS NULL OR store_id=(p_query->>'storeId')::uuid ORDER BY issued_at DESC LIMIT 200) s)); END $f$;
CREATE FUNCTION saas.platform_sales_policy_get(p_operator uuid,p_store uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN PERFORM saas.platform_operator_require_active(p_operator); RETURN coalesce((SELECT jsonb_build_object('storeId',store_id,'paused',paused,'newSalesEnabled',NOT paused,'reason',reason,'version',version,'updatedAt',updated_at,'changedAt',updated_at,'changedBy',updated_by) FROM saas.store_sales_policy WHERE store_id=p_store),jsonb_build_object('storeId',p_store,'paused',false,'newSalesEnabled',true,'reason',NULL,'version',1,'changedAt',(SELECT created_at FROM saas.stores WHERE id=p_store),'changedBy',NULL)); END $f$;
CREATE FUNCTION saas.platform_sales_policy_set(p_operator uuid,p_store uuid,p_paused boolean,p_reason text,p_expected_version bigint,p_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE current_version bigint; prior jsonb;
BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_paused IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 OR p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'invalid_input'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform.support.command:'||p_operator::text||':'||p_key,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('sales.policy:'||p_store::text,0));
 SELECT payload INTO prior FROM saas.platform_audit WHERE operator_id=p_operator AND action='sales.policy' AND payload->>'idempotencyKey'=p_key;
 IF FOUND THEN IF prior->>'storeId'<>p_store::text OR (prior->>'paused')::boolean<>p_paused OR prior->>'reason'<>btrim(p_reason) THEN RAISE EXCEPTION 'operation_mismatch'; END IF; RETURN prior->'result'; END IF;
 INSERT INTO saas.store_sales_policy(store_id) VALUES(p_store) ON CONFLICT DO NOTHING;
 SELECT version INTO current_version FROM saas.store_sales_policy WHERE store_id=p_store FOR UPDATE;
 IF current_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;
 UPDATE saas.store_sales_policy SET paused=p_paused,reason=btrim(p_reason),version=version+1,updated_at=clock_timestamp(),updated_by=p_operator WHERE store_id=p_store;
 prior:=saas.platform_sales_policy_get(p_operator,p_store);
 INSERT INTO saas.platform_audit(id,operator_id,store_id,action,payload,created_at) VALUES(gen_random_uuid(),p_operator,p_store,'sales.policy',jsonb_build_object('storeId',p_store,'paused',p_paused,'reason',btrim(p_reason),'idempotencyKey',p_key,'result',prior),clock_timestamp()); RETURN prior;
END $f$;
CREATE FUNCTION saas.platform_new_sales_allowed(p_store uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('sales.policy:'||p_store::text,0)); RETURN NOT coalesce((SELECT paused FROM saas.store_sales_policy WHERE store_id=p_store),false); END $f$;
-- Preserve exact predecessor definitions for reversible compatibility patches.
DO $patch$
DECLARE f record; definition text; revised text; membership_view text; member_argument text; store_argument text; principal_argument text;
BEGIN
 FOR f IN SELECT p.oid,p.proname,p.provolatile,p.prosrc,p.proargnames FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.prokind='f' AND p.proname NOT LIKE 'platform_%' LOOP
  definition:=pg_get_functiondef(f.oid); revised:=definition;
  membership_view:=CASE WHEN f.proname='in_store_sales_projection' THEN 'saas.platform_provenance_memberships' WHEN f.proname~'(panel_session|panel_store|panel_handoff|staff|identity_snapshot|verified_identity|registration|ownership)' THEN 'saas.platform_normal_memberships' ELSE 'saas.platform_authorized_memberships' END;
  revised:=regexp_replace(revised,'(FROM|JOIN)([[:space:]]+)saas.memberships([[:space:]]|$)','\1\2'||membership_view||'\3','gi');
  member_argument:=CASE WHEN 'p_membership_id'=ANY(f.proargnames) THEN 'p_membership_id' WHEN 'p_membership'=ANY(f.proargnames) THEN 'p_membership' WHEN 'p_member'=ANY(f.proargnames) THEN 'p_member' END;
  store_argument:=CASE WHEN 'p_store_id'=ANY(f.proargnames) THEN 'p_store_id' WHEN 'p_store'=ANY(f.proargnames) THEN 'p_store' END;
  principal_argument:=CASE WHEN 'p_principal_id'=ANY(f.proargnames) THEN 'p_principal_id' WHEN 'p_principal'=ANY(f.proargnames) THEN 'p_principal' END;
  IF f.provolatile='v' AND member_argument IS NOT NULL AND store_argument IS NOT NULL AND principal_argument IS NOT NULL AND f.prosrc~*'(INSERT INTO|UPDATE saas.|DELETE FROM)' THEN
   revised:=regexp_replace(revised,'\mBEGIN\M','BEGIN PERFORM saas.platform_support_begin('||store_argument||','||principal_argument||','||member_argument||','||quote_literal(f.proname)||');','i');
  END IF;
  IF f.proname IN ('in_store_sales_mutate','in_store_sales_mutate_v2','in_store_sales_mutate_v3') THEN
   revised:=replace(revised,$literal$IF p_kind='create' THEN$literal$, $literal$IF p_kind='create' THEN IF NOT saas.platform_new_sales_allowed(p_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF;$literal$);
  ELSIF f.proname LIKE 'public_checkout_complete%' AND f.prosrc LIKE '%INSERT INTO saas.orders%' THEN
   revised:=replace(revised,'SELECT credential.* INTO selected_customer_credential',$literal$IF NOT saas.platform_new_sales_allowed(selected_store) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF; SELECT credential.* INTO selected_customer_credential$literal$);
   revised:=replace(revised,'SELECT store.currency INTO v_currency',$literal$IF NOT saas.platform_new_sales_allowed(v_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF; SELECT store.currency INTO v_currency$literal$);
   IF revised NOT LIKE '%platform_new_sales_allowed%' THEN RAISE EXCEPTION 'OFFLINE_ADMISSION_ANCHOR_MISSING %',f.proname; END IF;
  ELSIF f.proname LIKE 'public_storefront_hosted_checkout_begin%' AND f.prosrc LIKE '%INSERT INTO saas.storefront_hosted_checkout_sessions%' THEN
   revised:=replace(revised,'authority:=saas.storefront_hosted_checkout_authority_projection(',$literal$IF NOT saas.platform_new_sales_allowed(selected_store) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF; authority:=saas.storefront_hosted_checkout_authority_projection($literal$);
   revised:=replace(revised,'SELECT prepared.outcome,prepared.customer_id INTO v_customer_outcome,v_resolved_customer_id',$literal$IF NOT saas.platform_new_sales_allowed(v_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF; SELECT prepared.outcome,prepared.customer_id INTO v_customer_outcome,v_resolved_customer_id$literal$);
   IF revised NOT LIKE '%platform_new_sales_allowed%' THEN RAISE EXCEPTION 'HOSTED_ADMISSION_ANCHOR_MISSING %',f.proname; END IF;
  ELSIF f.proname='storefront_checkout_submit_builtin' THEN
   revised:=replace(revised,'SELECT method.* INTO selected_method FROM saas.payment_methods method',$literal$IF NOT saas.platform_new_sales_allowed(selected_cart.store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF; SELECT method.* INTO selected_method FROM saas.payment_methods method$literal$);
   IF revised NOT LIKE '%platform_new_sales_allowed%' THEN RAISE EXCEPTION 'BUILTIN_ADMISSION_ANCHOR_MISSING'; END IF;
  ELSIF f.proname='checkout_begin_attempt' THEN
   revised:=replace(revised,'SELECT provider.* INTO current_provider',$literal$IF NOT saas.platform_new_sales_allowed(resolved_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF; SELECT provider.* INTO current_provider$literal$);
  ELSIF f.proname='payment_attempt_begin_without_execution_authority' THEN
   revised:=replace(revised,'SELECT * INTO method FROM saas.payment_methods',$literal$IF NOT saas.platform_new_sales_allowed(p_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF; SELECT * INTO method FROM saas.payment_methods$literal$);
  END IF;
  IF revised<>definition THEN INSERT INTO saas.platform_support_function_backup VALUES(f.oid::regprocedure::text,definition); EXECUTE revised; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM saas.platform_support_function_backup WHERE signature LIKE 'saas.in_store_sales_mutate_v2(%') OR NOT EXISTS(SELECT 1 FROM saas.platform_support_function_backup WHERE signature LIKE 'saas.public_checkout_complete%') OR NOT EXISTS(SELECT 1 FROM saas.platform_support_function_backup WHERE signature LIKE 'saas.public_storefront_hosted_checkout_begin%') THEN RAISE EXCEPTION 'SALES_ADMISSION_PREDECESSOR_MISSING'; END IF;
 FOR f IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relkind='r' AND c.relname NOT LIKE 'platform_%' AND c.relname<>'store_sales_policy' AND c.relowner='celebix_saas_owner'::regrole LOOP
  EXECUTE format('CREATE TRIGGER platform_support_atomic_journal AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write()',f.relname);
 END LOOP;
END $patch$;
DO $privileges$
DECLARE f record;
BEGIN

 FOR f IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relkind='r' AND (c.relname LIKE 'platform_support_%' OR c.relname='store_sales_policy') LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',f.relname); EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',f.relname); EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_support_runtime',f.relname);
 END LOOP;
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND (p.proname LIKE 'platform_support_%' OR p.proname LIKE 'platform_sales_%' OR p.proname IN ('platform_membership_is_authorized','platform_new_sales_allowed')) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.oid::regprocedure); END LOOP;
END $privileges$;
GRANT USAGE ON SCHEMA saas TO celebix_saas_support_runtime;
GRANT EXECUTE ON FUNCTION saas.platform_support_redeem(text,text),saas.platform_support_resolve(text,text,text),saas.platform_support_end(text,text) TO celebix_saas_support_runtime;
GRANT EXECUTE ON FUNCTION saas.platform_support_issue(uuid,uuid,text,text,bigint,text,text),saas.platform_support_revoke(uuid,uuid,bigint,text),saas.platform_support_list(uuid,jsonb),saas.platform_sales_policy_get(uuid,uuid),saas.platform_sales_policy_set(uuid,uuid,boolean,text,bigint,text) TO celebix_saas_platform_operator;
REVOKE ALL ON saas.platform_authorized_memberships,saas.platform_normal_memberships,saas.platform_provenance_memberships FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_platform_operator,celebix_saas_support_runtime;
COMMIT;
