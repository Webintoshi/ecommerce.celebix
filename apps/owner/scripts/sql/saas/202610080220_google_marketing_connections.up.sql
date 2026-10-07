-- Additive Google Marketing credentials, bound OAuth states and recoverable provider operations.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE saas.google_marketing_connections(
 store_id uuid NOT NULL REFERENCES saas.stores(id),service text NOT NULL CHECK(service IN('gtm','ads','search_console')),
 version bigint NOT NULL DEFAULT 0 CHECK(version BETWEEN 0 AND 9007199254740991),status text NOT NULL DEFAULT 'disconnected' CHECK(status IN('disconnected','connected','needs_reconnect','error')),
 google_email text,google_subject text,credential jsonb,selection jsonb,verification_token text CHECK(verification_token IS NULL OR verification_token~'^[A-Za-z0-9_-]+$' AND length(verification_token)<=128),
 required_scopes jsonb NOT NULL DEFAULT '[]',last_checked_at timestamptz,error_code text,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(store_id,service),
 CHECK(credential IS NULL OR jsonb_typeof(credential)='object' AND credential->>'algorithm'='A256GCM' AND credential->>'version'='1' AND length(credential->>'ciphertext') BETWEEN 1 AND 32768 AND credential->>'ciphertext'~'^[A-Za-z0-9_-]+$'),
 CHECK(selection IS NULL OR jsonb_typeof(selection)='object'),CHECK(jsonb_typeof(required_scopes)='array')
);
CREATE TABLE saas.google_marketing_oauth_states(
 state_hash text PRIMARY KEY CHECK(state_hash~'^[a-f0-9]{64}$'),operation_id uuid NOT NULL UNIQUE,store_id uuid NOT NULL REFERENCES saas.stores(id),
 principal_id uuid NOT NULL REFERENCES saas.principals(id),actor_membership_id uuid NOT NULL,service text NOT NULL CHECK(service IN('gtm','ads','search_console')),
 session_hash text NOT NULL CHECK(session_hash~'^[a-f0-9]{64}$'),return_origin text NOT NULL,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,completed_at timestamptz,
 FOREIGN KEY(store_id,actor_membership_id) REFERENCES saas.memberships(store_id,id),CHECK(expires_at=created_at+interval '10 minutes')
);
CREATE TABLE saas.google_marketing_operations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),actor_membership_id uuid NOT NULL,service text NOT NULL CHECK(service IN('gtm','ads','search_console')),
 kind text NOT NULL CHECK(kind IN('apply','disconnect')),fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),expected_version bigint NOT NULL,
 requested_selection jsonb,status text NOT NULL CHECK(status IN('running','retryable','complete')),lease_token uuid,lease_until timestamptz,
 progress jsonb NOT NULL DEFAULT '{}',result_payload jsonb,error_code text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(store_id,actor_membership_id) REFERENCES saas.memberships(store_id,id),CHECK(jsonb_typeof(progress)='object')
);
CREATE TABLE saas.google_marketing_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL REFERENCES saas.stores(id),actor_membership_id uuid NOT NULL,service text NOT NULL,
 action text NOT NULL,operation_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(store_id,actor_membership_id) REFERENCES saas.memberships(store_id,id)
);
CREATE INDEX google_marketing_state_expiry ON saas.google_marketing_oauth_states(expires_at);
CREATE INDEX google_marketing_operation_lease ON saas.google_marketing_operations(store_id,lease_until) WHERE status='running';
CREATE TRIGGER google_marketing_events_append_only BEFORE UPDATE OR DELETE ON saas.google_marketing_events FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
DO $tables$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['google_marketing_connections','google_marketing_oauth_states','google_marketing_operations','google_marketing_events'] LOOP
 EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_observability',t);
 EXECUTE format('CREATE TRIGGER platform_support_atomic_journal AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write()',t);
 END LOOP;
END $tables$;
CREATE FUNCTION saas.google_marketing_connection_projection(p_store uuid,p_service text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('service',p_service,'version',coalesce(c.version,0),'status',coalesce(c.status,'disconnected'),'googleEmail',c.google_email,'selection',c.selection,'lastCheckedAt',CASE WHEN c.last_checked_at IS NULL THEN NULL ELSE saas.orders_json_timestamp(c.last_checked_at) END,'errorCode',c.error_code)
 FROM (SELECT 1) dummy LEFT JOIN saas.google_marketing_connections c ON c.store_id=p_store AND c.service=p_service
$f$;
CREATE FUNCTION saas.google_marketing_selection_valid(p_selection jsonb,p_service text,p_domain text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT coalesce(jsonb_typeof(p_selection)='object' AND p_selection-ARRAY['accountId','resourceId','resourceName','tagId','conversionLabel','create']='{}'
 AND p_selection?&ARRAY['accountId','resourceId','resourceName'] AND jsonb_typeof(p_selection->'accountId')='string' AND jsonb_typeof(p_selection->'resourceId')='string' AND jsonb_typeof(p_selection->'resourceName')='string'
 AND length(p_selection->>'accountId') BETWEEN 1 AND 160 AND length(p_selection->>'resourceId') BETWEEN 1 AND 512 AND length(p_selection->>'resourceName') BETWEEN 1 AND 160
 AND p_selection->>'resourceName'!~'[<>[:cntrl:]]' AND (NOT p_selection?'create' OR jsonb_typeof(p_selection->'create')='boolean')
 AND CASE p_service WHEN 'gtm' THEN p_selection->>'accountId'~'^[0-9]+$' AND ((p_selection->>'resourceId'~'^[0-9]+$' AND (NOT p_selection?'tagId' OR p_selection->>'tagId'~'^GTM-[A-Z0-9]+$' AND length(p_selection->>'tagId') BETWEEN 8 AND 28)) OR p_selection->>'create'='true' AND p_selection->>'resourceId'=p_domain)
 WHEN 'ads' THEN p_selection->>'accountId'~'^[0-9]+$' AND p_selection->>'resourceId'~'^[0-9]+$' AND (NOT p_selection?'tagId' OR p_selection->>'tagId'~'^AW-[0-9]+$' AND length(p_selection->>'tagId') BETWEEN 7 AND 23) AND (NOT p_selection?'conversionLabel' OR p_selection->>'conversionLabel'~'^[A-Za-z0-9_-]+$' AND length(p_selection->>'conversionLabel') BETWEEN 1 AND 128)
 WHEN 'search_console' THEN p_selection->>'accountId'='site' AND (p_selection->>'resourceId'='https://'||p_domain||'/' OR p_selection->>'resourceId'='sc-domain:'||p_domain) ELSE false END,false)
$f$;
CREATE FUNCTION saas.google_marketing_command(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text,p_input jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;svc text:=p_input->>'service';domain_name text;connection saas.google_marketing_connections;op saas.google_marketing_operations;state saas.google_marketing_oauth_states;op_id uuid;token uuid;host_name text;projection jsonb;moment timestamptz:=clock_timestamp();
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR p_action NOT IN('overview','private','start_oauth','consume_state','credential','refresh','error','scopes','claim','checkpoint','finalize','fail','disconnect') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations',CASE WHEN p_action IN('overview','private') THEN 'integrations.read' ELSE 'integrations.manage' END);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.platform_membership_is_authorized(p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 SELECT d.hostname INTO domain_name FROM saas.store_domains d WHERE d.store_id=p_store_id AND d.status='active' AND d.is_primary AND d.verified_at<=moment LIMIT 1;
 IF domain_name IS NULL THEN RETURN QUERY SELECT 'wrong_domain',NULL::jsonb;RETURN;END IF;
 IF p_action='overview' THEN RETURN QUERY SELECT 'found',jsonb_build_object('domain',domain_name,'connections',jsonb_build_array(saas.google_marketing_connection_projection(p_store_id,'gtm'),saas.google_marketing_connection_projection(p_store_id,'ads'),saas.google_marketing_connection_projection(p_store_id,'search_console')));RETURN;END IF;
 IF p_action='consume_state' THEN
  SELECT * INTO state FROM saas.google_marketing_oauth_states WHERE state_hash=p_input->>'stateHash' FOR UPDATE;
  IF NOT FOUND OR state.store_id<>p_store_id OR state.principal_id<>p_principal_id OR state.actor_membership_id<>p_membership_id OR state.session_hash IS DISTINCT FROM p_input->>'sessionHash' OR state.consumed_at IS NOT NULL OR state.expires_at<=moment THEN RETURN QUERY SELECT 'oauth_state_invalid',NULL::jsonb;RETURN;END IF;
  PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'google_marketing_command.consume_state');
  UPDATE saas.google_marketing_oauth_states SET consumed_at=moment WHERE state_hash=state.state_hash;
  RETURN QUERY SELECT 'consumed',jsonb_build_object('service',state.service,'returnOrigin',state.return_origin);RETURN;
 END IF;
 IF svc IS NULL OR svc NOT IN('gtm','ads','search_console') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_action='private' THEN SELECT * INTO connection FROM saas.google_marketing_connections WHERE store_id=p_store_id AND service=svc;RETURN QUERY SELECT 'private',jsonb_build_object('domain',domain_name,'connection',saas.google_marketing_connection_projection(p_store_id,svc),'credential',connection.credential,'requiredScopes',coalesce(connection.required_scopes,'[]'));RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'google_marketing_command.'||p_action);
 PERFORM pg_advisory_xact_lock(hashtextextended('google.marketing:'||p_store_id::text,0));
 INSERT INTO saas.google_marketing_connections(store_id,service) VALUES(p_store_id,svc) ON CONFLICT DO NOTHING;
 SELECT * INTO connection FROM saas.google_marketing_connections WHERE store_id=p_store_id AND service=svc FOR UPDATE;
 IF p_action='start_oauth' THEN
  host_name:=substring(p_input->>'returnOrigin' FROM '^https://([a-z0-9.-]+)$');
  IF host_name IS NULL OR p_input->>'stateHash'!~'^[a-f0-9]{64}$' OR p_input->>'sessionHash'!~'^[a-f0-9]{64}$' OR NOT (EXISTS(SELECT 1 FROM saas.admin_domains d WHERE d.store_id=p_store_id AND d.hostname=host_name AND d.status='active' AND d.verified_at<=moment) OR EXISTS(SELECT 1 FROM saas.stores s WHERE s.id=p_store_id AND host_name IN(s.slug||'.admin.celebix.site',s.slug||'.admin.saas-staging.celebix.site',s.slug||'.admin.saas-staging.celebix.net'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  op_id:=(p_input->>'operationId')::uuid;SELECT * INTO state FROM saas.google_marketing_oauth_states WHERE operation_id=op_id FOR UPDATE;
  IF FOUND THEN IF state.store_id<>p_store_id OR state.principal_id<>p_principal_id OR state.actor_membership_id<>p_membership_id OR state.service<>svc OR state.session_hash<>p_input->>'sessionHash' OR state.return_origin<>p_input->>'returnOrigin' OR state.consumed_at IS NOT NULL THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;DELETE FROM saas.google_marketing_oauth_states WHERE operation_id=op_id;END IF;
  INSERT INTO saas.google_marketing_oauth_states VALUES(p_input->>'stateHash',op_id,p_store_id,p_principal_id,p_membership_id,svc,p_input->>'sessionHash',p_input->>'returnOrigin',moment,moment+interval '10 minutes',NULL,NULL);
  RETURN QUERY SELECT 'started',jsonb_build_object('scopes',connection.required_scopes);RETURN;
 ELSIF p_action='credential' THEN
  SELECT * INTO state FROM saas.google_marketing_oauth_states WHERE state_hash=p_input->>'stateHash' AND store_id=p_store_id AND principal_id=p_principal_id AND actor_membership_id=p_membership_id AND service=svc FOR UPDATE;
  IF NOT FOUND OR state.consumed_at IS NULL OR state.completed_at IS NOT NULL OR state.expires_at<=moment THEN RETURN QUERY SELECT 'oauth_state_invalid',NULL::jsonb;RETURN;END IF;
  IF connection.google_subject IS NOT NULL AND connection.google_subject IS DISTINCT FROM p_input->>'subject' THEN UPDATE saas.google_marketing_connections SET selection=NULL,verification_token=NULL,status='disconnected',version=version+1 WHERE store_id=p_store_id AND service=svc;END IF;
  UPDATE saas.google_marketing_connections SET credential=p_input->'credential',google_subject=p_input->>'subject',google_email=p_input->>'email',status=CASE WHEN selection IS NULL THEN 'disconnected' ELSE 'connected' END,error_code=NULL,updated_at=moment WHERE store_id=p_store_id AND service=svc;
  UPDATE saas.google_marketing_oauth_states SET completed_at=moment WHERE state_hash=state.state_hash;
  INSERT INTO saas.google_marketing_events(store_id,actor_membership_id,service,action,operation_id) VALUES(p_store_id,p_membership_id,svc,'oauth.complete',state.operation_id);
 ELSIF p_action='refresh' THEN
  IF connection.google_subject IS DISTINCT FROM p_input->>'subject' OR connection.credential IS NULL THEN RETURN QUERY SELECT 'needs_reconnect',NULL::jsonb;RETURN;END IF;
  UPDATE saas.google_marketing_connections SET credential=p_input->'credential',updated_at=moment WHERE store_id=p_store_id AND service=svc;
 ELSIF p_action='error' THEN
  IF p_input->>'code'<>'needs_reconnect' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  UPDATE saas.google_marketing_connections SET status='needs_reconnect',error_code='needs_reconnect',updated_at=moment WHERE store_id=p_store_id AND service=svc;
 ELSIF p_action='scopes' THEN
  IF svc<>'gtm' OR p_input->'scopes' IS DISTINCT FROM '["https://www.googleapis.com/auth/tagmanager.edit.containers","https://www.googleapis.com/auth/tagmanager.edit.containerversions","https://www.googleapis.com/auth/tagmanager.publish"]'::jsonb THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  UPDATE saas.google_marketing_connections SET required_scopes=p_input->'scopes',error_code='incremental_authorization_required',updated_at=moment WHERE store_id=p_store_id AND service=svc;
 ELSIF p_action IN('claim','disconnect') THEN
  op_id:=(p_input->>'operationId')::uuid;SELECT * INTO op FROM saas.google_marketing_operations WHERE operation_id=op_id FOR UPDATE;
  IF FOUND THEN
   IF op.store_id<>p_store_id OR op.actor_membership_id<>p_membership_id OR op.service<>svc OR op.fingerprint IS DISTINCT FROM p_input->>'fingerprint' OR op.kind IS DISTINCT FROM (CASE WHEN p_action='disconnect' THEN 'disconnect' ELSE 'apply' END) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
   IF op.status='complete' THEN RETURN QUERY SELECT 'operation_replayed',op.result_payload;RETURN;END IF;
   IF op.status='running' AND op.lease_until>moment THEN RETURN QUERY SELECT 'operation_busy',NULL::jsonb;RETURN;END IF;
  END IF;
  IF connection.version IS DISTINCT FROM (p_input->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.google_marketing_operations other WHERE other.store_id=p_store_id AND other.operation_id<>op_id AND other.status='running' AND other.lease_until>moment) THEN RETURN QUERY SELECT 'operation_busy',NULL::jsonb;RETURN;END IF;
  IF p_action='claim' AND saas.google_marketing_selection_valid(p_input->'selection',svc,domain_name) IS DISTINCT FROM TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  token:=gen_random_uuid();
  INSERT INTO saas.google_marketing_operations(operation_id,store_id,actor_membership_id,service,kind,fingerprint,expected_version,requested_selection,status,lease_token,lease_until)
   VALUES(op_id,p_store_id,p_membership_id,svc,CASE WHEN p_action='disconnect' THEN 'disconnect' ELSE 'apply' END,p_input->>'fingerprint',(p_input->>'expectedVersion')::bigint,p_input->'selection','running',token,moment+interval '2 minutes') ON CONFLICT(operation_id) DO UPDATE SET status='running',lease_token=token,lease_until=moment+interval '2 minutes',updated_at=moment;
  IF p_action='claim' THEN RETURN QUERY SELECT 'claimed',jsonb_build_object('leaseToken',token,'progress',coalesce(op.progress,'{}'));RETURN;END IF;
  UPDATE saas.google_marketing_connections SET credential=NULL,google_subject=NULL,google_email=NULL,selection=NULL,verification_token=NULL,status='disconnected',version=version+1,required_scopes='[]',error_code=NULL,updated_at=moment WHERE store_id=p_store_id AND service=svc;
  UPDATE saas.google_marketing_oauth_states SET consumed_at=coalesce(consumed_at,moment),completed_at=moment WHERE store_id=p_store_id AND service=svc AND completed_at IS NULL;
  projection:=saas.google_marketing_connection_projection(p_store_id,svc);UPDATE saas.google_marketing_operations SET status='complete',result_payload=projection,lease_until=NULL,updated_at=moment WHERE operation_id=op_id;
  INSERT INTO saas.google_marketing_events(store_id,actor_membership_id,service,action,operation_id) VALUES(p_store_id,p_membership_id,svc,'disconnect',op_id);RETURN QUERY SELECT 'saved',projection;RETURN;
 ELSIF p_action IN('checkpoint','finalize','fail') THEN
  op_id:=(p_input->>'operationId')::uuid;SELECT * INTO op FROM saas.google_marketing_operations WHERE operation_id=op_id FOR UPDATE;
  IF NOT FOUND OR op.store_id<>p_store_id OR op.actor_membership_id<>p_membership_id OR op.service<>svc OR op.lease_token::text IS DISTINCT FROM p_input->>'leaseToken' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  IF op.status='complete' AND p_action='finalize' THEN RETURN QUERY SELECT 'operation_replayed',op.result_payload;RETURN;END IF;
  IF op.status<>'running' OR op.lease_until<=moment THEN RETURN QUERY SELECT 'operation_busy',NULL::jsonb;RETURN;END IF;
  IF p_action='checkpoint' THEN
   IF jsonb_typeof(p_input->'progress') IS DISTINCT FROM 'object' OR p_input->'progress'-ARRAY['containerId','baseVersionId','workspacePath','versionId','verificationToken','verified']<>'{}' OR length((p_input->'progress')::text)>2048 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   UPDATE saas.google_marketing_operations SET progress=p_input->'progress',lease_until=moment+interval '2 minutes',updated_at=moment WHERE operation_id=op_id;
   IF svc='search_console' AND p_input->'progress'?'verificationToken' THEN UPDATE saas.google_marketing_connections SET verification_token=p_input->'progress'->>'verificationToken',updated_at=moment WHERE store_id=p_store_id AND service=svc;END IF;
  ELSIF p_action='fail' THEN
   IF p_input->>'code'!~'^[a-z_]+$' OR length(p_input->>'code')>64 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   UPDATE saas.google_marketing_operations SET status='retryable',lease_until=NULL,error_code=p_input->>'code',updated_at=moment WHERE operation_id=op_id;
   UPDATE saas.google_marketing_connections SET error_code=p_input->>'code',status=CASE WHEN p_input->>'code'='needs_reconnect' THEN 'needs_reconnect' WHEN selection IS NULL THEN 'error' ELSE status END,updated_at=moment WHERE store_id=p_store_id AND service=svc;
  ELSE
   IF connection.version<>op.expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
   IF saas.google_marketing_selection_valid(p_input->'selection',svc,domain_name) IS DISTINCT FROM TRUE OR (svc='gtm' AND p_input->'selection'->>'tagId' IS NULL) OR (svc='ads' AND (p_input->'selection'->>'tagId' IS NULL OR p_input->'selection'->>'conversionLabel' IS NULL)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   UPDATE saas.google_marketing_connections SET selection=p_input->'selection',status='connected',version=version+1,last_checked_at=moment,error_code=NULL,verification_token=coalesce(p_input->>'verificationToken',verification_token),updated_at=moment WHERE store_id=p_store_id AND service=svc;
   projection:=saas.google_marketing_connection_projection(p_store_id,svc);UPDATE saas.google_marketing_operations SET status='complete',result_payload=projection,lease_until=NULL,updated_at=moment WHERE operation_id=op_id;
   INSERT INTO saas.google_marketing_events(store_id,actor_membership_id,service,action,operation_id) VALUES(p_store_id,p_membership_id,svc,'apply',op_id);RETURN QUERY SELECT 'saved',projection;RETURN;
  END IF;
 END IF;
 RETURN QUERY SELECT 'saved',NULL::jsonb;
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;
CREATE FUNCTION saas.google_marketing_oauth_return(p_state_hash text,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('returnOrigin',s.return_origin) FROM saas.google_marketing_oauth_states s WHERE s.state_hash=p_state_hash AND s.consumed_at IS NULL AND s.expires_at>greatest(p_now,clock_timestamp())
$f$;
CREATE FUNCTION saas.public_google_marketing_projection(p_store_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('gtmContainerId',(SELECT selection->>'tagId' FROM saas.google_marketing_connections WHERE store_id=p_store_id AND service='gtm' AND status='connected' AND selection->>'tagId'~'^GTM-[A-Z0-9]+$'),'ads',(SELECT jsonb_build_object('tagId',selection->>'tagId','conversionLabel',selection->>'conversionLabel') FROM saas.google_marketing_connections WHERE store_id=p_store_id AND service='ads' AND status='connected' AND selection->>'tagId'~'^AW-[0-9]+$' AND selection->>'conversionLabel'~'^[A-Za-z0-9_-]+$'),'verificationToken',(SELECT verification_token FROM saas.google_marketing_connections WHERE store_id=p_store_id AND service='search_console' AND verification_token IS NOT NULL))
 WHERE EXISTS(SELECT 1 FROM saas.stores WHERE id=p_store_id AND status='active')
$f$;
CREATE FUNCTION saas.public_google_marketing_purchase(p_hostname text,p_now timestamptz,p_credentials jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;session saas.storefront_hosted_checkout_sessions;purchase jsonb;
BEGIN
 IF p_hostname IS NULL OR p_now IS NULL OR NOT isfinite(p_now) OR saas.storefront_credential_candidates_valid(p_credentials,false) IS DISTINCT FROM TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.storefront_public_store(p_hostname,p_now);IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT s.* INTO session FROM saas.storefront_hosted_checkout_sessions s JOIN jsonb_array_elements(p_credentials) c ON c->>'keyId'=s.payment_session_key_id AND c->>'digest'=s.payment_session_credential_digest WHERE s.store_id=selected_store AND s.created_at<=p_now ORDER BY s.created_at DESC,s.id LIMIT 1;
 IF session.id IS NULL OR session.receipt_expires_at<=greatest(p_now,clock_timestamp()) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT jsonb_build_object('transactionId',o.id,'valueCents',o.total_cents,'currency',o.currency) INTO purchase FROM saas.orders o JOIN saas.payment_attempts a ON a.store_id=o.store_id AND a.id=session.payment_attempt_id
 WHERE o.store_id=selected_store AND o.id=session.order_id AND o.source='storefront' AND o.payment_status='completed' AND o.status NOT IN('cancelled','refunded') AND o.total_cents BETWEEN 1 AND 9007199254740991 AND session.status='captured' AND session.environment='live' AND a.environment='live' AND a.status='captured' AND a.amount_minor=o.total_cents AND a.currency=o.currency;
 RETURN QUERY SELECT 'found',purchase;
END $f$;
REVOKE ALL ON FUNCTION saas.google_marketing_connection_projection(uuid,text),saas.google_marketing_selection_valid(jsonb,text,text),saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb),saas.google_marketing_oauth_return(text,timestamptz),saas.public_google_marketing_projection(uuid),saas.public_google_marketing_purchase(text,timestamptz,jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb),saas.google_marketing_oauth_return(text,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.public_google_marketing_projection(uuid),saas.public_google_marketing_purchase(text,timestamptz,jsonb) TO celebix_saas_host_resolver;
COMMIT;
