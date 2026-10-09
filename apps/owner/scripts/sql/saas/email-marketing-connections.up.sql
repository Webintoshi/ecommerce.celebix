-- Additive tenant-bound email connections. No source backfill or provider call.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE TABLE IF NOT EXISTS saas.email_marketing_connections(
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),provider text NOT NULL CHECK(provider IN('brevo','klaviyo')),
 version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991),credential_version bigint NOT NULL DEFAULT 1 CHECK(credential_version BETWEEN 1 AND 9007199254740991),
 account_id text NOT NULL CHECK(length(account_id) BETWEEN 1 AND 160),account_name text NOT NULL CHECK(length(account_name) BETWEEN 1 AND 160),list_id text NOT NULL CHECK(length(list_id) BETWEEN 1 AND 160),list_name text NOT NULL CHECK(length(list_name) BETWEEN 1 AND 160),
 status text NOT NULL CHECK(status IN('disconnected','connected','draining','needs_reconnect','error')),sender_status text NOT NULL CHECK(sender_status IN('verified','pending','unknown')),
 credential jsonb,webhook_credential jsonb,last_checked_at timestamptz,last_synced_at timestamptz,suppression_checked_at timestamptz,error_code text,
 poll_cursor text,poll_watermark timestamptz,poll_started_at timestamptz,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(store_id,id),CHECK(status<>'disconnected' OR credential IS NULL),CHECK(credential IS NULL OR jsonb_typeof(credential)='object' AND credential->>'algorithm'='A256GCM' AND credential->>'version'='1')
);
CREATE UNIQUE INDEX IF NOT EXISTS email_marketing_one_live_store ON saas.email_marketing_connections(store_id) WHERE status<>'disconnected';
CREATE UNIQUE INDEX IF NOT EXISTS email_marketing_one_live_account ON saas.email_marketing_connections(provider,account_id) WHERE status<>'disconnected';
CREATE TABLE IF NOT EXISTS saas.email_marketing_candidates(
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),principal_id uuid NOT NULL REFERENCES saas.principals(id),membership_id uuid NOT NULL,
 session_hash text NOT NULL CHECK(session_hash~'^[a-f0-9]{64}$'),provider text NOT NULL CHECK(provider IN('brevo','klaviyo')),credential jsonb,credential_version bigint NOT NULL DEFAULT 1,
 account_id text,account_name text,sender_status text CHECK(sender_status IN('verified','pending','unknown')),lists jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,consumed_at timestamptz,
 UNIQUE(store_id,id),FOREIGN KEY(store_id,membership_id) REFERENCES saas.memberships(store_id,id),CHECK(expires_at=created_at+interval '15 minutes'),CHECK(credential IS NULL OR jsonb_typeof(credential)='object' AND credential->>'algorithm'='A256GCM')
);
CREATE INDEX IF NOT EXISTS email_marketing_candidate_expiry ON saas.email_marketing_candidates(expires_at) WHERE credential IS NOT NULL;
CREATE TABLE IF NOT EXISTS saas.email_marketing_operations(
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),principal_id uuid NOT NULL REFERENCES saas.principals(id),membership_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('validate','apply','rotate','recheck','disconnect')),fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),expected_version bigint NOT NULL,
 candidate_id uuid,connection_id uuid NOT NULL,phase text NOT NULL CHECK(phase IN('claimed','dispatched','unknown','complete','retryable')),
 lease_token uuid,lease_until timestamptz,progress jsonb NOT NULL DEFAULT '{}',result_payload jsonb,error_code text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(store_id,membership_id) REFERENCES saas.memberships(store_id,id),FOREIGN KEY(store_id,candidate_id) REFERENCES saas.email_marketing_candidates(store_id,id),CHECK(length(progress::text)<=8192)
);
CREATE TABLE IF NOT EXISTS saas.email_marketing_contacts(
 store_id uuid NOT NULL,connection_id uuid NOT NULL,email text NOT NULL CHECK(email=lower(btrim(email)) AND length(email)<=254),profile_id text,consent_version bigint NOT NULL DEFAULT 0,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','verified','blocked','pending','failed','removed')),last_subscribe_at timestamptz,last_checked_at timestamptz,provider_consent_at timestamptz,
 PRIMARY KEY(connection_id,email),FOREIGN KEY(store_id,connection_id) REFERENCES saas.email_marketing_connections(store_id,id)
);
CREATE TABLE IF NOT EXISTS saas.email_marketing_consent_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),email text NOT NULL CHECK(email=lower(btrim(email)) AND length(email)<=254),
 kind text NOT NULL CHECK(kind IN('grant','deny','archive','address_changed')),source text NOT NULL CHECK(source IN('newsletter','customer','cart_capture','provider')),source_id text NOT NULL,source_version text NOT NULL,
 consented_at timestamptz,evidence_version text,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(store_id,source,source_id,source_version,email,kind),CHECK(kind<>'grant' OR consented_at IS NOT NULL AND evidence_version IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS saas.email_marketing_audience(
 store_id uuid NOT NULL REFERENCES saas.stores(id),email text NOT NULL,sequence bigint NOT NULL REFERENCES saas.email_marketing_consent_events(id),kind text NOT NULL,
 source text NOT NULL,source_id text NOT NULL,consented_at timestamptz,evidence_version text,first_name text,last_name text,
 PRIMARY KEY(store_id,email)
);
CREATE INDEX IF NOT EXISTS email_marketing_audience_cursor ON saas.email_marketing_audience(store_id,sequence,email);
CREATE TABLE IF NOT EXISTS saas.email_marketing_sync_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,connection_id uuid NOT NULL,generation bigint NOT NULL,credential_version bigint NOT NULL,email text,consent_version bigint,
 kind text NOT NULL CHECK(kind IN('bootstrap','profile','subscribe','unsubscribe','remove_membership','reconcile','cleanup')),
 phase text NOT NULL DEFAULT 'queued' CHECK(phase IN('queued','dispatched','accepted','unknown')),status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','verified','blocked','failed','attention')),
 provider_reference text,progress jsonb NOT NULL DEFAULT '{}',lease_token uuid,lease_until timestamptz,available_at timestamptz NOT NULL DEFAULT clock_timestamp(),attempts int NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),error_code text,
 FOREIGN KEY(store_id,connection_id) REFERENCES saas.email_marketing_connections(store_id,id),UNIQUE(connection_id,generation,email,consent_version,kind)
);
CREATE UNIQUE INDEX IF NOT EXISTS email_marketing_one_bootstrap ON saas.email_marketing_sync_jobs(connection_id,generation) WHERE kind='bootstrap';
CREATE INDEX IF NOT EXISTS email_marketing_job_claim ON saas.email_marketing_sync_jobs(available_at,store_id,created_at) WHERE status IN('queued','running');
CREATE TABLE IF NOT EXISTS saas.email_marketing_inbound_events(
 connection_id uuid NOT NULL,store_id uuid NOT NULL,event_id text NOT NULL,event_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT clock_timestamp(),email text,profile_id text,kind text NOT NULL CHECK(kind IN('unsubscribe','suppressed')),
 PRIMARY KEY(connection_id,event_id),FOREIGN KEY(store_id,connection_id) REFERENCES saas.email_marketing_connections(store_id,id)
);
DO $tables$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['email_marketing_connections','email_marketing_candidates','email_marketing_operations','email_marketing_contacts','email_marketing_consent_events','email_marketing_audience','email_marketing_sync_jobs','email_marketing_inbound_events'] LOOP
 EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_observability',t);
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='platform_support_atomic_journal') THEN EXECUTE format('CREATE TRIGGER platform_support_atomic_journal AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write()',t);END IF;
 END LOOP;
END $tables$;
DO $immutable$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['email_marketing_consent_events','email_marketing_inbound_events'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='email_marketing_append_only') THEN EXECUTE format('CREATE TRIGGER email_marketing_append_only BEFORE UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only()',t);END IF;
END LOOP;END $immutable$;
CREATE OR REPLACE FUNCTION saas.email_marketing_projection(p_store uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',id,'provider',provider,'version',version,'generation',generation,'credentialVersion',credential_version,'accountId',account_id,'accountName',account_name,'listId',list_id,'listName',list_name,'status',status,'senderStatus',sender_status,'lastCheckedAt',CASE WHEN last_checked_at IS NULL THEN NULL ELSE saas.orders_json_timestamp(last_checked_at) END,'lastSyncedAt',CASE WHEN last_synced_at IS NULL THEN NULL ELSE saas.orders_json_timestamp(last_synced_at) END,'errorCode',error_code)
 FROM saas.email_marketing_connections WHERE store_id=p_store AND id=p_id
$f$;
CREATE OR REPLACE FUNCTION saas.email_marketing_candidate_projection(p_store uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('candidateId',id,'provider',provider,'accountId',account_id,'accountName',account_name,'expiresAt',saas.orders_json_timestamp(expires_at)) FROM saas.email_marketing_candidates WHERE store_id=p_store AND id=p_id
$f$;
CREATE OR REPLACE FUNCTION saas.email_marketing_command(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text,p_input jsonb)
 RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE moment timestamptz:=clock_timestamp();err text;op saas.email_marketing_operations;c saas.email_marketing_connections;candidate saas.email_marketing_candidates;oid uuid;token uuid;projection jsonb;current_version bigint;kind text;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR length(p_input::text)>16384 OR p_action NOT IN('overview','candidate','lists','preview','claim','checkpoint','finalize','fail','private') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Recheck current database time at every write, including after external IO.
 err:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,moment,'integrations',CASE WHEN p_action='overview' THEN 'integrations.read' ELSE 'integrations.manage' END);
 IF err IS NOT NULL OR NOT saas.platform_membership_is_authorized(p_membership) THEN RETURN QUERY SELECT 'forbidden',NULL::jsonb;RETURN;END IF;
 IF p_action='overview' THEN
  RETURN QUERY SELECT 'found',jsonb_build_object('configured',true,'connections',coalesce((SELECT jsonb_agg(saas.email_marketing_projection(p_store,id) ORDER BY created_at DESC) FROM (SELECT id,created_at FROM saas.email_marketing_connections WHERE store_id=p_store ORDER BY created_at DESC LIMIT 20) recent),'[]'::jsonb),'sync',jsonb_build_object('queued',(SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE store_id=p_store AND status IN('queued','running') AND phase='queued'),'verified',(SELECT count(*) FROM saas.email_marketing_contacts WHERE store_id=p_store AND state='verified'),'blocked',(SELECT count(*) FROM saas.email_marketing_contacts WHERE store_id=p_store AND state='blocked'),'failed',(SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE store_id=p_store AND status IN('failed','attention')),'pendingVerification',(SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE store_id=p_store AND phase IN('accepted','unknown','dispatched') AND status NOT IN('verified','blocked')),'asOf',saas.orders_json_timestamp(moment),'suppressionCheckedAt',(SELECT saas.orders_json_timestamp(max(suppression_checked_at)) FROM saas.email_marketing_connections WHERE store_id=p_store)));
  RETURN;
 END IF;
 IF p_action='private' THEN SELECT * INTO c FROM saas.email_marketing_connections WHERE store_id=p_store AND status<>'disconnected';IF NOT FOUND THEN RETURN QUERY SELECT 'not_configured',NULL::jsonb;RETURN;END IF;RETURN QUERY SELECT 'found',jsonb_build_object('connection',saas.email_marketing_projection(p_store,c.id),'credential',c.credential);RETURN;END IF;
 IF p_action IN('candidate','lists','preview') THEN
  SELECT * INTO candidate FROM saas.email_marketing_candidates WHERE id=(p_input->>'candidateId')::uuid AND store_id=p_store AND principal_id=p_principal AND membership_id=p_membership AND session_hash=p_input->>'sessionHash';
  IF NOT FOUND OR candidate.consumed_at IS NOT NULL OR candidate.expires_at<=moment OR candidate.account_id IS NULL THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;
  IF p_action='candidate' THEN RETURN QUERY SELECT 'found',jsonb_build_object('candidate',saas.email_marketing_candidate_projection(p_store,candidate.id),'credential',candidate.credential,'credentialVersion',candidate.credential_version,'lists',candidate.lists);RETURN;END IF;
  IF p_action='preview' THEN RETURN QUERY SELECT 'found',jsonb_build_object('eligible',(SELECT count(*) FROM saas.email_marketing_audience WHERE store_id=p_store AND kind='grant' AND (candidate.provider<>'brevo' OR consented_at>=moment-interval '2 years')),'denied',(SELECT count(*) FROM saas.email_marketing_audience WHERE store_id=p_store AND kind='deny'),'missingEvidence',0,'needsRenewal',(SELECT count(*) FROM saas.email_marketing_audience WHERE store_id=p_store AND kind='grant' AND candidate.provider='brevo' AND consented_at<moment-interval '2 years'),'providerBlocked',NULL,'unchecked',(SELECT count(*) FROM saas.email_marketing_audience WHERE store_id=p_store AND kind='grant'),'overLimit',NULL,'providerCheckedAt',NULL);RETURN;END IF;
  -- Only validated server results are persisted by the lists checkpoint command.
  RETURN QUERY SELECT 'found',candidate.lists;RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('email.marketing:'||p_store::text,0));
 IF p_action='claim' THEN
  oid:=(p_input->>'operationId')::uuid;kind:=p_input->>'kind';
  IF kind NOT IN('validate','apply','rotate','recheck','disconnect') OR p_input->>'fingerprint'!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT * INTO op FROM saas.email_marketing_operations WHERE id=oid FOR UPDATE;
  IF FOUND THEN
   IF op.store_id<>p_store OR op.principal_id<>p_principal OR op.membership_id<>p_membership OR op.kind<>kind OR op.fingerprint IS DISTINCT FROM p_input->>'fingerprint' THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb;RETURN;END IF;
   IF op.phase='complete' THEN RETURN QUERY SELECT 'replayed',op.result_payload;RETURN;END IF;
   IF op.lease_until>moment THEN RETURN QUERY SELECT 'cleanup_pending',NULL::jsonb;RETURN;END IF;
   token:=gen_random_uuid();PERFORM saas.platform_support_begin(p_store,p_principal,p_membership,'email_marketing_command.claim');UPDATE saas.email_marketing_operations SET lease_token=token,lease_until=moment+interval '2 minutes' WHERE id=oid;
   RETURN QUERY SELECT 'claimed',jsonb_build_object('leaseToken',token,'phase',op.phase,'progress',op.progress,'candidateId',op.candidate_id,'connectionId',op.connection_id);RETURN;
  END IF;
  SELECT * INTO c FROM saas.email_marketing_connections WHERE store_id=p_store AND status<>'disconnected' FOR UPDATE;current_version:=coalesce(c.version,0);
  IF kind<>'validate' AND (p_input->>'expectedVersion')::bigint IS DISTINCT FROM current_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF kind='apply' AND c.id IS NOT NULL THEN RETURN QUERY SELECT 'cleanup_pending',NULL::jsonb;RETURN;END IF;
  IF kind IN('rotate','recheck','disconnect') AND c.id IS NULL THEN RETURN QUERY SELECT 'not_configured',NULL::jsonb;RETURN;END IF;
  PERFORM saas.platform_support_begin(p_store,p_principal,p_membership,'email_marketing_command.claim');
  IF kind='validate' THEN
   INSERT INTO saas.email_marketing_candidates(id,store_id,principal_id,membership_id,session_hash,provider,credential,created_at,expires_at) VALUES((p_input->>'candidateId')::uuid,p_store,p_principal,p_membership,p_input->>'sessionHash',p_input->>'provider',p_input->'credential',moment,moment+interval '15 minutes');
  ELSIF kind IN('apply','rotate') THEN
   SELECT * INTO candidate FROM saas.email_marketing_candidates WHERE id=(p_input->>'candidateId')::uuid AND store_id=p_store AND principal_id=p_principal AND membership_id=p_membership AND session_hash=p_input->>'sessionHash' FOR UPDATE;
   IF NOT FOUND OR candidate.consumed_at IS NOT NULL OR candidate.expires_at<=moment OR candidate.account_id IS NULL THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;
   IF kind='rotate' AND (candidate.account_id IS DISTINCT FROM c.account_id OR candidate.provider IS DISTINCT FROM c.provider) THEN RETURN QUERY SELECT 'account_mismatch',NULL::jsonb;RETURN;END IF;
   IF EXISTS(SELECT 1 FROM saas.email_marketing_connections WHERE provider=candidate.provider AND account_id=candidate.account_id AND status<>'disconnected' AND store_id<>p_store) THEN RETURN QUERY SELECT 'account_in_use',NULL::jsonb;RETURN;END IF;
  END IF;
  token:=gen_random_uuid();INSERT INTO saas.email_marketing_operations(id,store_id,principal_id,membership_id,kind,fingerprint,expected_version,candidate_id,connection_id,phase,lease_token,lease_until,progress) VALUES(oid,p_store,p_principal,p_membership,kind,p_input->>'fingerprint',coalesce((p_input->>'expectedVersion')::bigint,0),CASE WHEN kind IN('validate','apply','rotate') THEN (p_input->>'candidateId')::uuid ELSE NULL END,coalesce(c.id,(p_input->>'connectionId')::uuid),'claimed',token,moment+interval '2 minutes',coalesce(p_input->'progress','{}'));
  RETURN QUERY SELECT 'claimed',jsonb_build_object('leaseToken',token,'phase','claimed','progress',coalesce(p_input->'progress','{}'),'candidateId',(p_input->>'candidateId')::uuid,'connectionId',coalesce(c.id,(p_input->>'connectionId')::uuid));RETURN;
 END IF;
 oid:=(p_input->>'operationId')::uuid;SELECT * INTO op FROM saas.email_marketing_operations WHERE id=oid FOR UPDATE;
 IF NOT FOUND OR op.store_id<>p_store OR op.principal_id<>p_principal OR op.membership_id<>p_membership OR op.lease_token::text IS DISTINCT FROM p_input->>'leaseToken' THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb;RETURN;END IF;
 IF op.phase='complete' AND p_action='finalize' THEN RETURN QUERY SELECT 'replayed',op.result_payload;RETURN;END IF;
 IF op.phase='complete' THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb;RETURN;END IF;
 IF op.lease_until<=moment THEN RETURN QUERY SELECT 'cleanup_pending',NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store,p_principal,p_membership,'email_marketing_command.'||p_action);
 IF p_action='fail' THEN
  UPDATE saas.email_marketing_operations SET phase=CASE WHEN phase='dispatched' THEN 'unknown' ELSE 'retryable' END,error_code=p_input->>'errorCode',lease_until=NULL WHERE id=oid;RETURN QUERY SELECT 'saved',NULL::jsonb;RETURN;
 END IF;
 IF p_action='checkpoint' THEN
  IF jsonb_typeof(p_input->'progress') IS DISTINCT FROM 'object' OR length((p_input->'progress')::text)>8192 OR (p_input->'progress')-ARRAY['listId','listName','priorListIds','listCreateDispatched','selection','account','lists','cursor','createUnknown']<>'{}' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  UPDATE saas.email_marketing_operations SET progress=p_input->'progress',phase=CASE WHEN p_input->>'dispatched'='true' THEN 'dispatched' ELSE phase END,lease_until=moment+interval '2 minutes',updated_at=moment WHERE id=oid;RETURN QUERY SELECT 'saved',NULL::jsonb;RETURN;
 END IF;
 SELECT * INTO c FROM saas.email_marketing_connections WHERE store_id=p_store AND id=op.connection_id FOR UPDATE;
 IF op.kind='validate' THEN
  UPDATE saas.email_marketing_candidates SET account_id=p_input->'account'->>'id',account_name=p_input->'account'->>'name',sender_status=p_input->'account'->>'senderStatus',lists=coalesce(p_input->'lists','[]') WHERE id=op.candidate_id AND store_id=p_store AND expires_at>moment;
  IF NOT FOUND THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;projection:=saas.email_marketing_candidate_projection(p_store,op.candidate_id);
 ELSIF op.kind IN('apply','rotate') THEN
  SELECT * INTO candidate FROM saas.email_marketing_candidates WHERE id=op.candidate_id AND store_id=p_store AND principal_id=p_principal AND membership_id=p_membership FOR UPDATE;
  IF NOT FOUND OR candidate.consumed_at IS NOT NULL OR candidate.expires_at<=moment THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;
  IF coalesce(c.version,0)<>op.expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF op.kind='apply' THEN
   INSERT INTO saas.email_marketing_connections(id,store_id,provider,account_id,account_name,list_id,list_name,status,sender_status,credential,last_checked_at) VALUES(op.connection_id,p_store,candidate.provider,candidate.account_id,candidate.account_name,p_input->'list'->>'id',p_input->'list'->>'name','connected',candidate.sender_status,p_input->'credential',moment);
   INSERT INTO saas.email_marketing_sync_jobs(store_id,connection_id,generation,credential_version,kind) VALUES(p_store,op.connection_id,1,1,'bootstrap');
  ELSE
   IF c.account_id IS DISTINCT FROM candidate.account_id OR c.provider IS DISTINCT FROM candidate.provider THEN RETURN QUERY SELECT 'account_mismatch',NULL::jsonb;RETURN;END IF;
   UPDATE saas.email_marketing_connections SET credential=p_input->'credential',credential_version=credential_version+1,version=version+1,last_checked_at=moment,error_code=NULL WHERE id=c.id AND store_id=p_store;
  END IF;
  UPDATE saas.email_marketing_candidates SET consumed_at=moment,credential=NULL WHERE id=candidate.id;projection:=saas.email_marketing_projection(p_store,op.connection_id);
 ELSIF op.kind='disconnect' THEN
  IF c.version<>op.expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  UPDATE saas.email_marketing_connections SET status='draining',version=version+1,generation=generation+1,updated_at=moment WHERE id=c.id;
  INSERT INTO saas.email_marketing_sync_jobs(store_id,connection_id,generation,credential_version,kind) SELECT store_id,id,generation,credential_version,'cleanup' FROM saas.email_marketing_connections WHERE id=c.id;
  projection:=saas.email_marketing_projection(p_store,c.id);
 ELSIF op.kind='recheck' THEN
  IF c.version<>op.expected_version OR c.account_id IS DISTINCT FROM p_input->'account'->>'id' THEN RETURN QUERY SELECT 'account_mismatch',NULL::jsonb;RETURN;END IF;
  UPDATE saas.email_marketing_connections SET last_checked_at=moment,sender_status=p_input->'account'->>'senderStatus',version=version+1,error_code=NULL WHERE id=c.id;projection:=saas.email_marketing_projection(p_store,c.id);
 END IF;
 UPDATE saas.email_marketing_operations SET phase='complete',result_payload=projection,lease_until=NULL,updated_at=moment WHERE id=oid;RETURN QUERY SELECT 'saved',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'account_in_use',NULL::jsonb;
 WHEN invalid_text_representation OR check_violation OR not_null_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $f$;
DO $acl$ DECLARE f regprocedure;BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('email_marketing_projection','email_marketing_candidate_projection','email_marketing_command') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_observability',f);
 END LOOP;
 GRANT EXECUTE ON FUNCTION saas.email_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb) TO celebix_saas_app;
END $acl$;
COMMIT;
