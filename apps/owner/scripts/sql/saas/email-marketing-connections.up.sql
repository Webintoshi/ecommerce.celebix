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
ALTER TABLE saas.email_marketing_contacts ADD COLUMN IF NOT EXISTS membership_epoch bigint NOT NULL DEFAULT 0;
ALTER TABLE saas.email_marketing_contacts ADD COLUMN IF NOT EXISTS list_denial_at timestamptz;
ALTER TABLE saas.email_marketing_inbound_events ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'account';
ALTER TABLE saas.email_marketing_inbound_events ADD COLUMN IF NOT EXISTS list_id text;
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
  -- Expired discovery is never usable for a new intent. Only the original leased
  -- apply may read the retained key to reconcile its already-dispatched list.
  IF NOT FOUND OR candidate.consumed_at IS NOT NULL OR candidate.credential IS NULL OR candidate.account_id IS NULL OR
    (candidate.expires_at<=moment AND NOT (p_action='candidate' AND EXISTS(
      SELECT 1 FROM saas.email_marketing_operations recovery WHERE recovery.id=(p_input->>'operationId')::uuid
      AND recovery.candidate_id=candidate.id AND recovery.store_id=p_store AND recovery.principal_id=p_principal AND recovery.membership_id=p_membership
      AND recovery.kind='apply' AND recovery.phase<>'complete' AND recovery.created_at<candidate.expires_at
      AND recovery.progress->>'listCreateDispatched'='true' AND recovery.progress->'selection'->>'kind'='create'
      AND recovery.lease_token::text=p_input->>'leaseToken' AND recovery.lease_until>moment
    ))) THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;
  IF p_action='candidate' THEN RETURN QUERY SELECT 'found',jsonb_build_object('candidate',saas.email_marketing_candidate_projection(p_store,candidate.id),'credential',candidate.credential,'credentialVersion',candidate.credential_version,'lists',candidate.lists);RETURN;END IF;
  IF p_action='preview' THEN RETURN QUERY SELECT 'found',saas.email_marketing_preview(p_store,candidate.provider,moment);RETURN;END IF;
  -- Only validated server results are persisted by the lists checkpoint command.
  RETURN QUERY SELECT 'found',candidate.lists;RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('email.marketing:'||p_store::text,0));
 IF p_action='claim' THEN
  oid:=(p_input->>'operationId')::uuid;kind:=p_input->>'kind';
  IF kind NOT IN('validate','apply','rotate','recheck','disconnect') OR p_input->>'fingerprint'!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF p_input?'fingerprints' AND(jsonb_typeof(p_input->'fingerprints') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'fingerprints') NOT BETWEEN 1 AND 16 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'fingerprints') f WHERE jsonb_typeof(f) IS DISTINCT FROM 'string' OR (f#>>'{}')!~'^[a-f0-9]{64}$') OR NOT (p_input->'fingerprints'?(p_input->>'fingerprint'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT * INTO op FROM saas.email_marketing_operations WHERE id=oid FOR UPDATE;
  IF FOUND THEN
   IF op.store_id<>p_store OR op.principal_id<>p_principal OR op.membership_id<>p_membership OR op.kind<>kind OR op.fingerprint IS DISTINCT FROM p_input->>'fingerprint' AND NOT coalesce(p_input->'fingerprints'?op.fingerprint,false) THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb;RETURN;END IF;
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
 IF op.lease_until IS NULL OR op.lease_until<=moment THEN RETURN QUERY SELECT 'cleanup_pending',NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store,p_principal,p_membership,'email_marketing_command.'||p_action);
 IF p_action='fail' THEN
  UPDATE saas.email_marketing_operations SET phase=CASE WHEN phase='dispatched' THEN 'unknown' ELSE 'retryable' END,error_code=p_input->>'errorCode',lease_until=NULL WHERE id=oid;RETURN QUERY SELECT 'saved',NULL::jsonb;RETURN;
 END IF;
 IF p_action='checkpoint' THEN
  IF jsonb_typeof(p_input->'progress') IS DISTINCT FROM 'object' OR length((p_input->'progress')::text)>8192 OR (p_input->'progress')-ARRAY['listId','listName','priorListIds','listCreateDispatched','selection','account','lists','cursor','createUnknown']<>'{}' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF op.progress->>'listCreateDispatched'='true' AND p_input->'progress'->>'listCreateDispatched' IS DISTINCT FROM 'true' THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb;RETURN;END IF;
  IF p_input->>'dispatched'='true' AND op.kind='apply' AND op.progress->>'listCreateDispatched' IS DISTINCT FROM 'true' THEN
    SELECT * INTO candidate FROM saas.email_marketing_candidates WHERE id=op.candidate_id AND store_id=p_store FOR UPDATE;
    IF NOT FOUND OR candidate.expires_at<=moment OR candidate.credential IS NULL OR candidate.consumed_at IS NOT NULL THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;
  END IF;
  UPDATE saas.email_marketing_operations SET progress=p_input->'progress',phase=CASE WHEN p_input->>'dispatched'='true' THEN 'dispatched' ELSE phase END,lease_until=moment+interval '2 minutes',updated_at=moment WHERE id=oid;RETURN QUERY SELECT 'saved',NULL::jsonb;RETURN;
 END IF;
 SELECT * INTO c FROM saas.email_marketing_connections WHERE store_id=p_store AND id=op.connection_id FOR UPDATE;
 IF op.kind='validate' THEN
  UPDATE saas.email_marketing_candidates SET account_id=p_input->'account'->>'id',account_name=p_input->'account'->>'name',sender_status=p_input->'account'->>'senderStatus',lists=coalesce(p_input->'lists','[]') WHERE id=op.candidate_id AND store_id=p_store AND expires_at>moment;
  IF NOT FOUND THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;projection:=saas.email_marketing_candidate_projection(p_store,op.candidate_id);
 ELSIF op.kind IN('apply','rotate') THEN
  SELECT * INTO candidate FROM saas.email_marketing_candidates WHERE id=op.candidate_id AND store_id=p_store AND principal_id=p_principal AND membership_id=p_membership FOR UPDATE;
  IF NOT FOUND OR candidate.consumed_at IS NOT NULL OR candidate.credential IS NULL OR
    (candidate.expires_at<=moment AND NOT (op.kind='apply' AND op.created_at<candidate.expires_at AND op.progress->>'listCreateDispatched'='true' AND op.progress->'selection'->>'kind'='create'))
    THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;
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
-- Append proof and the outbound intent in one transaction with the source.
CREATE OR REPLACE FUNCTION saas.email_marketing_append_event(p_store uuid,p_email text,p_kind text,p_source text,p_source_id text,p_source_version text,p_recorded timestamptz,p_consented timestamptz,p_evidence text,p_first text DEFAULT NULL,p_last text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE seq bigint;old_event saas.email_marketing_consent_events;effective timestamptz;previous_time timestamptz;
BEGIN
 IF p_email IS NULL OR length(p_email)>254 THEN RETURN NULL;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('email.marketing:'||p_store::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('email.consent:'||p_store::text||':'||p_email,0));
 INSERT INTO saas.email_marketing_consent_events(store_id,email,kind,source,source_id,source_version,recorded_at,consented_at,evidence_version)
 VALUES(p_store,p_email,p_kind,p_source,p_source_id,p_source_version,p_recorded,p_consented,p_evidence)
 ON CONFLICT(store_id,source,source_id,source_version,email,kind) DO NOTHING RETURNING id INTO seq;
 IF seq IS NULL THEN RETURN NULL;END IF;
 SELECT e.* INTO old_event FROM saas.email_marketing_audience a JOIN saas.email_marketing_consent_events e ON e.id=a.sequence WHERE a.store_id=p_store AND a.email=p_email FOR UPDATE OF a;
 effective:=CASE WHEN p_kind='grant' THEN p_consented ELSE p_recorded END;
 previous_time:=CASE WHEN old_event.kind='grant' THEN old_event.consented_at ELSE old_event.recorded_at END;
 IF old_event.id IS NOT NULL AND (effective<previous_time OR effective=previous_time AND ((p_kind='grant' AND old_event.kind<>'grant') OR (old_event.kind='deny' AND p_kind<>'deny'))) THEN RETURN seq;END IF;
 INSERT INTO saas.email_marketing_audience(store_id,email,sequence,kind,source,source_id,consented_at,evidence_version,first_name,last_name)
 VALUES(p_store,p_email,seq,p_kind,p_source,p_source_id,p_consented,p_evidence,p_first,p_last)
 ON CONFLICT(store_id,email) DO UPDATE SET sequence=EXCLUDED.sequence,kind=EXCLUDED.kind,source=EXCLUDED.source,source_id=EXCLUDED.source_id,consented_at=EXCLUDED.consented_at,evidence_version=EXCLUDED.evidence_version,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name;
 INSERT INTO saas.email_marketing_sync_jobs(store_id,connection_id,generation,credential_version,email,consent_version,kind)
 SELECT p_store,c.id,c.generation,c.credential_version,p_email,seq,CASE WHEN p_kind='grant' THEN 'profile' WHEN p_kind='deny' THEN 'unsubscribe' ELSE 'remove_membership' END
 FROM saas.email_marketing_connections c WHERE c.store_id=p_store AND c.status<>'disconnected' AND(p_kind<>'grant' OR c.status='connected') ON CONFLICT DO NOTHING;
 RETURN seq;
END $f$;

CREATE OR REPLACE FUNCTION saas.email_marketing_customer_after(p_store uuid,p_customer uuid,p_old_email text,p_old_status text,p_old_recorded timestamptz,p_attested text,p_moment timestamptz)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE c saas.customers;consent saas.customer_consents;
BEGIN
 SELECT * INTO c FROM saas.customers WHERE store_id=p_store AND id=p_customer;
 SELECT * INTO consent FROM saas.customer_consents WHERE store_id=p_store AND customer_id=p_customer AND channel='email';
 IF p_old_email IS NOT DISTINCT FROM c.email AND p_old_status IS NOT DISTINCT FROM consent.status AND p_old_recorded IS NOT NULL THEN
  UPDATE saas.customer_consents SET recorded_at=p_old_recorded WHERE store_id=p_store AND customer_id=p_customer AND channel='email';
 END IF;
 IF p_old_email IS NOT NULL AND p_old_email IS DISTINCT FROM c.email THEN
  PERFORM saas.email_marketing_append_event(p_store,p_old_email,'address_changed','customer',p_customer::text,c.version::text,p_moment,NULL,NULL);
 END IF;
 IF consent.status='denied' AND (p_old_status IS DISTINCT FROM 'denied' OR p_old_email IS DISTINCT FROM c.email) THEN
  PERFORM saas.email_marketing_append_event(p_store,c.email,'deny','customer',p_customer::text,c.version::text,p_moment,NULL,NULL);
 ELSIF consent.status='granted' AND p_attested=c.email AND (p_old_status IS DISTINCT FROM 'granted' OR p_old_email IS DISTINCT FROM c.email) THEN
  PERFORM saas.email_marketing_append_event(p_store,c.email,'grant','customer',p_customer::text,c.version::text,p_moment,p_moment,'customer-email-v1',c.first_name,c.last_name);
 END IF;
END $f$;

CREATE OR REPLACE FUNCTION saas.email_marketing_customers_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_customer_id uuid,p_expected_version bigint,p_first_name text,p_last_name text,p_email text,p_phone text,p_addresses jsonb,p_consents jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE old_email text;old_status text;old_recorded timestamptz;attested text;r record;
BEGIN
 IF jsonb_typeof(p_consents) IS DISTINCT FROM 'array' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_consents) x WHERE x?'targetEmail' AND(x->>'channel'<>'email' OR x->>'status'<>'granted' OR x->>'targetEmail' IS DISTINCT FROM p_email)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT x->>'targetEmail' INTO attested FROM jsonb_array_elements(p_consents) x WHERE x->>'channel'='email';
 SELECT email INTO old_email FROM saas.customers WHERE store_id=p_store_id AND id=p_customer_id FOR UPDATE;
 SELECT status,recorded_at INTO old_status,old_recorded FROM saas.customer_consents WHERE store_id=p_store_id AND customer_id=p_customer_id AND channel='email';
 SELECT * INTO r FROM saas.customers_save(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_customer_id,p_expected_version,p_first_name,p_last_name,p_email,p_phone,p_addresses,p_consents);
 IF r.outcome='committed' THEN PERFORM saas.email_marketing_customer_after(p_store_id,p_customer_id,old_email,old_status,old_recorded,attested,p_now);END IF;
 RETURN QUERY SELECT r.outcome,r.result_payload;
END $f$;
CREATE OR REPLACE FUNCTION saas.email_marketing_customer_archived(p_store uuid,p_customer uuid,p_at timestamptz) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE c saas.customers;BEGIN SELECT * INTO c FROM saas.customers WHERE store_id=p_store AND id=p_customer;PERFORM saas.email_marketing_append_event(p_store,c.email,'archive','customer',c.id::text,c.version::text,p_at,NULL,NULL);END $f$;
CREATE OR REPLACE FUNCTION saas.email_marketing_customers_archive(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_customer_id uuid,p_expected_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;BEGIN
 SELECT * INTO r FROM saas.customers_archive(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_customer_id,p_expected_version);
 IF r.outcome='committed' THEN PERFORM saas.email_marketing_customer_archived(p_store_id,p_customer_id,p_now);END IF;RETURN QUERY SELECT r.outcome,r.result_payload;
END $f$;
CREATE OR REPLACE FUNCTION saas.email_marketing_newsletter_subscribe(p_hostname text,p_now timestamptz,p_email text,p_consent_version text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;st uuid;n saas.storefront_newsletter_subscribers;BEGIN
 SELECT * INTO r FROM saas.public_newsletter_subscribe(p_hostname,p_now,p_email,p_consent_version);
 IF r.outcome='subscribed' THEN
  st:=saas.store_policy_public_store(p_hostname,p_now);
  SELECT * INTO n FROM saas.storefront_newsletter_subscribers WHERE store_id=st AND normalized_email=lower(p_email);
  IF FOUND THEN PERFORM saas.email_marketing_append_event(st,n.normalized_email,CASE WHEN n.status='subscribed' THEN 'grant' ELSE 'deny' END,'newsletter',n.email_digest,n.version::text,CASE WHEN n.status='subscribed' THEN n.consented_at ELSE n.updated_at END,CASE WHEN n.status='subscribed' THEN n.consented_at END,n.consent_version);END IF;
 END IF;RETURN QUERY SELECT r.outcome,r.result_payload;
END $f$;
CREATE OR REPLACE FUNCTION saas.email_marketing_contact_capture(p_hostname text,p_cart_digest text,p_now timestamptz,p_operation uuid,p_campaign uuid,p_email text,p_phone text,p_marketing_consent boolean,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;st uuid;c saas.store_engagement_cart_contacts;BEGIN
 SELECT * INTO r FROM saas.store_engagement_contact_capture(p_hostname,p_cart_digest,p_now,p_operation,p_campaign,p_email,p_phone,p_marketing_consent,p_fingerprint);
 IF r.outcome='captured' THEN
  st:=saas.store_policy_public_store(p_hostname,p_now);
  SELECT contact.* INTO c FROM saas.store_engagement_capture_operations op JOIN saas.store_engagement_cart_contacts contact ON contact.store_id=op.store_id AND contact.source_cart_id=op.source_cart_id WHERE op.store_id=st AND op.operation_id=p_operation;
  IF c.marketing_consent AND c.email IS NOT NULL AND c.marketing_label IS NOT NULL THEN PERFORM saas.email_marketing_append_event(st,c.email,'grant','cart_capture',c.source_cart_id::text,c.config_version::text,c.captured_at,c.captured_at,'cart-capture-'||c.config_version::text);END IF;
 END IF;RETURN QUERY SELECT r.outcome,r.result_payload;
END $f$;
CREATE OR REPLACE FUNCTION saas.email_marketing_provider_denial(p_connection uuid,p_event_id text,p_email text,p_profile_id text,p_kind text,p_at timestamptz,p_scope text,p_list_id text) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE c saas.email_marketing_connections;inserted text;seq bigint;BEGIN
 IF p_scope IS NULL OR p_scope NOT IN('account','list') OR p_kind IS NULL OR p_kind NOT IN('unsubscribe','suppressed') OR p_at IS NOT NULL AND(NOT isfinite(p_at) OR p_at>clock_timestamp()+interval '5 minutes') OR p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 1 AND 1024 THEN RAISE EXCEPTION 'invalid_input';END IF;
 SELECT * INTO c FROM saas.email_marketing_connections WHERE id=p_connection AND status<>'disconnected';
 IF c.id IS NULL OR p_scope='list' AND p_list_id IS DISTINCT FROM c.list_id THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('email.marketing:'||c.store_id::text,0));
 IF NOT EXISTS(SELECT 1 FROM saas.email_marketing_contacts WHERE connection_id=p_connection AND email=p_email AND (profile_id=p_profile_id OR profile_id IS NULL)) THEN RETURN false;END IF;
 INSERT INTO saas.email_marketing_inbound_events(connection_id,store_id,event_id,event_at,email,profile_id,kind,scope,list_id) VALUES(c.id,c.store_id,p_event_id,p_at,p_email,p_profile_id,p_kind,p_scope,p_list_id) ON CONFLICT DO NOTHING RETURNING event_id INTO inserted;
 IF inserted IS NULL THEN RETURN false;END IF;
 IF p_scope='account' THEN
  PERFORM saas.email_marketing_append_event(c.store_id,p_email,'deny','provider',c.id::text,p_event_id,coalesce(p_at,clock_timestamp()),NULL,NULL);
 ELSE
  -- A provider list denial is connection-scoped evidence, never account consent.
  UPDATE saas.email_marketing_contacts SET state='blocked',list_denial_at=greatest(list_denial_at,coalesce(p_at,clock_timestamp())),membership_epoch=membership_epoch+1 WHERE connection_id=c.id AND email=p_email;
  UPDATE saas.email_marketing_sync_jobs SET status='blocked',error_code='provider_list_denial' WHERE connection_id=c.id AND email=p_email AND kind IN('profile','subscribe') AND phase='queued' AND status<>'verified';
  SELECT sequence INTO seq FROM saas.email_marketing_audience WHERE store_id=c.store_id AND email=p_email;
  INSERT INTO saas.email_marketing_sync_jobs(store_id,connection_id,generation,credential_version,email,consent_version,kind,progress) VALUES(c.store_id,c.id,c.generation,c.credential_version,p_email,coalesce(seq,0),'remove_membership','{"providerListDenial":true}') ON CONFLICT(connection_id,generation,email,consent_version,kind) DO UPDATE SET status='queued',phase='queued',progress=saas.email_marketing_sync_jobs.progress||'{"providerListDenial":true}',available_at=clock_timestamp() WHERE saas.email_marketing_sync_jobs.status IN('verified','blocked','failed');
 END IF;
 RETURN true;
END $f$;
CREATE OR REPLACE FUNCTION saas.email_marketing_provider_denial(p_connection uuid,p_event_id text,p_email text,p_profile_id text,p_kind text,p_at timestamptz) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT saas.email_marketing_provider_denial(p_connection,p_event_id,p_email,p_profile_id,p_kind,p_at,'account',NULL)
$f$;
CREATE INDEX IF NOT EXISTS email_marketing_newsletter_cursor ON saas.storefront_newsletter_subscribers(store_id,normalized_email);
CREATE INDEX IF NOT EXISTS email_marketing_capture_cursor ON saas.store_engagement_cart_contacts(store_id,email) WHERE marketing_consent;
CREATE OR REPLACE VIEW saas.email_marketing_proven_audience AS
 SELECT a.store_id,a.email,a.sequence,a.kind,a.source,a.source_id,e.source_version,e.recorded_at,
 CASE WHEN a.kind='grant' THEN a.consented_at ELSE e.recorded_at END effective_at,a.consented_at,a.evidence_version,a.first_name,a.last_name
 FROM saas.email_marketing_audience a JOIN saas.email_marketing_consent_events e ON e.id=a.sequence
 UNION ALL
 SELECT n.store_id,n.normalized_email,NULL::bigint,CASE WHEN n.status='subscribed' THEN 'grant' ELSE 'deny' END,'newsletter',n.email_digest,n.version::text,n.updated_at,
 CASE WHEN n.status='subscribed' THEN n.consented_at ELSE n.updated_at END,n.consented_at,n.consent_version,NULL::text,NULL::text FROM saas.storefront_newsletter_subscribers n
 UNION ALL
 SELECT c.store_id,c.email,NULL::bigint,'grant','cart_capture',c.source_cart_id::text,c.config_version::text,c.captured_at,c.captured_at,c.captured_at,'cart-capture-'||c.config_version::text,NULL::text,NULL::text
 FROM saas.store_engagement_cart_contacts c WHERE c.marketing_consent AND c.email IS NOT NULL AND c.marketing_label IS NOT NULL;
REVOKE ALL ON saas.email_marketing_proven_audience FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_observability;
CREATE OR REPLACE FUNCTION saas.email_marketing_audience_page(p_store uuid,p_connection uuid,p_cursor text,p_limit integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_limit NOT BETWEEN 1 AND 100 OR NOT EXISTS(SELECT 1 FROM saas.email_marketing_connections WHERE store_id=p_store AND id=p_connection AND status<>'disconnected') THEN RAISE EXCEPTION 'invalid_input';END IF;
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY email) FROM (SELECT DISTINCT ON(email) * FROM saas.email_marketing_proven_audience WHERE store_id=p_store AND(p_cursor IS NULL OR email>p_cursor) ORDER BY email,effective_at DESC,(kind='deny') DESC,(kind<>'grant') DESC,sequence DESC NULLS LAST LIMIT p_limit) a),'[]'::jsonb));
END $f$;
CREATE OR REPLACE FUNCTION saas.email_marketing_preview(p_store uuid,p_provider text,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 WITH audience AS (SELECT DISTINCT ON(email) * FROM saas.email_marketing_proven_audience WHERE store_id=p_store ORDER BY email,effective_at DESC,(kind='deny') DESC,(kind<>'grant') DESC,sequence DESC NULLS LAST)
 SELECT jsonb_build_object('eligible',(SELECT count(*) FROM audience WHERE kind='grant' AND(p_provider<>'brevo' OR consented_at>=p_now-interval '2 years')),'denied',(SELECT count(*) FROM audience WHERE kind='deny'),'missingEvidence',(SELECT count(*) FROM saas.customers c JOIN saas.customer_consents x ON x.store_id=c.store_id AND x.customer_id=c.id AND x.channel='email' AND x.status='granted' WHERE c.store_id=p_store AND c.status='active' AND c.email IS NOT NULL AND NOT EXISTS(SELECT 1 FROM audience a WHERE a.email=c.email)), 'needsRenewal',(SELECT count(*) FROM audience WHERE kind='grant' AND p_provider='brevo' AND consented_at<p_now-interval '2 years'),'providerBlocked',NULL,'unchecked',(SELECT count(*) FROM audience WHERE kind='grant'),'overLimit',NULL,'providerCheckedAt',NULL)
$f$;
ALTER TABLE saas.email_marketing_sync_jobs ADD COLUMN IF NOT EXISTS worker_id text;
ALTER TABLE saas.email_marketing_inbound_events ALTER COLUMN event_at DROP NOT NULL;
ALTER TABLE saas.email_marketing_sync_jobs ADD COLUMN IF NOT EXISTS credential_snapshot jsonb;
ALTER TABLE saas.email_marketing_sync_jobs ADD COLUMN IF NOT EXISTS audience_snapshot jsonb;
ALTER TABLE saas.email_marketing_sync_jobs ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;
ALTER TABLE saas.email_marketing_connections ADD COLUMN IF NOT EXISTS full_sweep_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS email_marketing_one_poll ON saas.email_marketing_sync_jobs(connection_id) WHERE kind='reconcile' AND status IN('queued','running','attention');
CREATE UNIQUE INDEX IF NOT EXISTS email_marketing_one_cleanup ON saas.email_marketing_sync_jobs(connection_id,generation) WHERE kind='cleanup';
CREATE INDEX IF NOT EXISTS email_marketing_pending_effect ON saas.email_marketing_sync_jobs(connection_id,email) WHERE phase<>'queued' AND status<>'verified';
CREATE TABLE IF NOT EXISTS saas.email_marketing_rate_windows(provider text NOT NULL,account_id text NOT NULL,bucket text NOT NULL,period_ms integer NOT NULL,window_start timestamptz NOT NULL,calls integer NOT NULL,PRIMARY KEY(provider,account_id,bucket,period_ms));
ALTER TABLE saas.email_marketing_rate_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.email_marketing_rate_windows FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.email_marketing_rate_windows FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability;
DO $rate_journal$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.email_marketing_rate_windows'::regclass AND tgname='platform_support_atomic_journal') THEN CREATE TRIGGER platform_support_atomic_journal AFTER INSERT OR UPDATE OR DELETE ON saas.email_marketing_rate_windows FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write();END IF;END $rate_journal$;
ALTER TABLE saas.email_marketing_connections ADD COLUMN IF NOT EXISTS webhook_id text;
ALTER TABLE saas.email_marketing_connections ADD COLUMN IF NOT EXISTS webhook_hash text;
ALTER TABLE saas.email_marketing_connections ADD COLUMN IF NOT EXISTS webhook_version bigint NOT NULL DEFAULT 1;
ALTER TABLE saas.email_marketing_connections ADD COLUMN IF NOT EXISTS webhook_state text;
ALTER TABLE saas.email_marketing_connections ADD COLUMN IF NOT EXISTS webhook_checked_at timestamptz;
CREATE OR REPLACE FUNCTION saas.email_marketing_brevo_hook(p_hostname text,p_connection uuid,p_token_digest text,p_events jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE c saas.email_marketing_connections;e jsonb;profile text;n integer:=0;BEGIN
 IF p_hostname IS DISTINCT FROM 'panel.saas-staging.celebix.net' OR p_token_digest !~ '^[a-f0-9]{64}$' OR p_token_digest IS NULL OR jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_array_length(p_events)>100 OR length(p_events::text)>65536 THEN RETURN '{"authenticated":false}'::jsonb;END IF;
 SELECT * INTO c FROM saas.email_marketing_connections WHERE id=p_connection AND provider='brevo' AND status<>'disconnected' AND webhook_state IN('dispatched','unknown','verified','removing');
 IF c.id IS NULL OR c.webhook_hash IS NULL OR c.webhook_hash IS DISTINCT FROM p_token_digest THEN RETURN '{"authenticated":false}'::jsonb;END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  IF e->>'scope' IS NULL OR e->>'scope' NOT IN('account','list') OR e->>'scope'='list' AND e->>'listId' IS DISTINCT FROM c.list_id THEN CONTINUE;END IF;
  SELECT profile_id INTO profile FROM saas.email_marketing_contacts WHERE connection_id=c.id AND email=e->>'email';IF NOT FOUND THEN CONTINUE;END IF;
  IF saas.email_marketing_provider_denial(c.id,e->>'eventId',e->>'email',profile,e->>'kind',(e->>'eventTime')::timestamptz,e->>'scope',e->>'listId') THEN n:=n+1;END IF;
 END LOOP;RETURN jsonb_build_object('authenticated',true,'recorded',n);
END $f$;

CREATE OR REPLACE FUNCTION saas.email_marketing_export_allowed(p_store uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.stores st JOIN saas.subscriptions s ON s.store_id=st.id JOIN saas.plans p ON p.id=s.plan_id JOIN saas.plan_features f ON f.plan_id=p.id AND f.feature_key='integrations' AND f.enabled
 WHERE st.id=p_store AND st.status='active' AND s.status='active' AND s.valid_from<=clock_timestamp() AND(s.valid_until IS NULL OR s.valid_until>clock_timestamp()) AND p.status='active' AND p.valid_from<=clock_timestamp() AND(p.valid_until IS NULL OR p.valid_until>clock_timestamp()))
$f$;
CREATE OR REPLACE FUNCTION saas.email_marketing_job_projection(p_job uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',j.id,'storeId',j.store_id,'connectionId',j.connection_id,'generation',j.generation,'credentialVersion',CASE WHEN j.phase='queued' THEN c.credential_version ELSE j.credential_version END,'email',j.email,'consentVersion',j.consent_version,'kind',j.kind,'leaseToken',j.lease_token,'leaseUntil',saas.orders_json_timestamp(j.lease_until),'phase',j.phase,'providerReference',j.provider_reference,'provider',c.provider,'listId',c.list_id,'credential',CASE WHEN j.phase='queued' THEN c.credential ELSE j.credential_snapshot END,'reconciliationCredential',CASE WHEN j.phase<>'queued' AND c.credential_version<>j.credential_version THEN c.credential ELSE NULL END,'reconciliationCredentialVersion',c.credential_version,'webhook',jsonb_build_object('id',c.webhook_id,'credential',c.webhook_credential,'version',c.webhook_version,'state',c.webhook_state,'checkedAt',saas.orders_json_timestamp(c.webhook_checked_at)),'profileId',x.profile_id,'progress',j.progress,'audience',CASE WHEN j.phase='queued' THEN CASE WHEN a.sequence IS NULL THEN NULL ELSE jsonb_build_object('kind',a.kind,'sequence',a.sequence,'consentedAt',saas.orders_json_timestamp(a.consented_at),'source',a.source,'evidenceVersion',a.evidence_version,'firstName',a.first_name,'lastName',a.last_name) END ELSE j.audience_snapshot END)
 FROM saas.email_marketing_sync_jobs j JOIN saas.email_marketing_connections c ON c.id=j.connection_id LEFT JOIN saas.email_marketing_audience a ON a.store_id=j.store_id AND a.email=j.email LEFT JOIN saas.email_marketing_contacts x ON x.connection_id=j.connection_id AND x.email=j.email WHERE j.id=p_job
$f$;
CREATE OR REPLACE FUNCTION saas.email_marketing_work(p_action text,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
#variable_conflict use_column
DECLARE moment timestamptz:=clock_timestamp();j saas.email_marketing_sync_jobs;c saas.email_marketing_connections;a saas.email_marketing_audience;claim record;row_data jsonb;result jsonb:='[]';remaining integer;selected_mode text;desired_status text;action text;provider_state jsonb;seq bigint;event_data jsonb;rows jsonb;next_cursor text;count_rows integer;rate record;period integer;maximum integer;rate_limits jsonb;current_rate saas.email_marketing_rate_windows;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR length(p_input::text)>65536 OR p_action NOT IN('claim','checkpoint','finish','bootstrap','cleanup','poll','schedule','event','rate','hook_checkpoint') THEN RAISE EXCEPTION 'invalid_input';END IF;
 IF p_action IN('claim','schedule') THEN
  selected_mode:=p_input->>'mode';IF selected_mode NOT IN('off','revoke_only','full') OR (p_input->>'limit')::integer NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'invalid_input';END IF;
  UPDATE saas.email_marketing_candidates candidate SET credential=NULL WHERE credential IS NOT NULL AND expires_at<=moment
    AND NOT EXISTS(SELECT 1 FROM saas.email_marketing_operations recovery WHERE recovery.candidate_id=candidate.id AND recovery.store_id=candidate.store_id
      AND recovery.kind='apply' AND recovery.phase<>'complete' AND recovery.created_at<candidate.expires_at
      AND (recovery.progress->>'listCreateDispatched'='true' OR recovery.lease_until>moment));
  IF selected_mode='off' THEN RETURN CASE WHEN p_action='claim' THEN '[]'::jsonb ELSE '0'::jsonb END;END IF;
 END IF;
 IF p_action='schedule' THEN
  -- Keep polling/revocation operational during rollback. No grant is scheduled here.
  INSERT INTO saas.email_marketing_sync_jobs(store_id,connection_id,generation,credential_version,kind,progress)
  SELECT c.store_id,c.id,c.generation,c.credential_version,'reconcile',jsonb_build_object('pollStartedAt',saas.orders_json_timestamp(moment),'pollWatermark',CASE WHEN c.provider='brevo' OR c.full_sweep_at IS NULL OR c.full_sweep_at<moment-interval '24 hours' THEN NULL ELSE saas.orders_json_timestamp(c.poll_watermark-interval '10 minutes') END,'fullSweep',c.provider='brevo' OR c.full_sweep_at IS NULL OR c.full_sweep_at<moment-interval '24 hours')
  FROM saas.email_marketing_connections c WHERE c.status<>'disconnected' AND c.credential IS NOT NULL AND(c.suppression_checked_at IS NULL OR c.suppression_checked_at<moment-interval '5 minutes') AND NOT EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs j WHERE j.connection_id=c.id AND j.kind='reconcile' AND j.status IN('queued','running','attention')) ORDER BY c.suppression_checked_at NULLS FIRST LIMIT (p_input->>'limit')::int ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS count_rows=ROW_COUNT;RETURN to_jsonb(count_rows);
 END IF;
 IF p_action='claim' THEN
  IF p_input->>'workerId' IS NULL OR p_input->>'workerId' !~ '^[A-Za-z0-9._-]{1,128}$' OR (p_input->>'token')::uuid IS NULL THEN RAISE EXCEPTION 'invalid_input';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email.worker.capacity',0));
  SELECT greatest(0,2-count(*))::integer INTO remaining FROM saas.email_marketing_sync_jobs WHERE status='running' AND lease_until>moment;
  remaining:=least(remaining,(p_input->>'limit')::integer);IF remaining=0 THEN RETURN '[]'::jsonb;END IF;
  UPDATE saas.email_marketing_sync_jobs j SET status='blocked',error_code='grant_closed',updated_at=moment WHERE j.phase='queued' AND j.status IN('queued','running') AND j.kind IN('bootstrap','profile','subscribe') AND EXISTS(SELECT 1 FROM saas.email_marketing_connections c WHERE c.id=j.connection_id AND(c.status<>'connected' OR c.generation<>j.generation OR NOT saas.email_marketing_export_allowed(c.store_id)));
  FOR claim IN SELECT j.id FROM saas.email_marketing_sync_jobs j JOIN saas.email_marketing_connections c ON c.id=j.connection_id
   WHERE c.credential IS NOT NULL AND c.status<>'disconnected' AND j.available_at<=moment AND(j.status='queued' OR j.status='running' AND j.lease_until<=moment OR j.status='attention' AND j.phase<>'queued') AND(selected_mode='full' OR j.phase<>'queued' OR j.kind IN('unsubscribe','remove_membership','reconcile','cleanup'))
   ORDER BY CASE WHEN j.kind IN('unsubscribe','remove_membership') THEN 0 WHEN j.phase<>'queued' THEN 1 ELSE 2 END,(SELECT max(x.updated_at) FROM saas.email_marketing_sync_jobs x WHERE x.store_id=j.store_id AND x.attempts>0) NULLS FIRST,j.created_at,j.id LIMIT remaining FOR UPDATE OF j SKIP LOCKED LOOP
   UPDATE saas.email_marketing_sync_jobs SET worker_id=p_input->>'workerId',status='running',lease_token=(p_input->>'token')::uuid,lease_until=moment+interval '90 seconds',progress=CASE WHEN kind='remove_membership' AND phase='queued' THEN progress||jsonb_build_object('membershipEpoch',coalesce((SELECT membership_epoch FROM saas.email_marketing_contacts x WHERE x.connection_id=saas.email_marketing_sync_jobs.connection_id AND x.email=saas.email_marketing_sync_jobs.email),0)) ELSE progress END,attempts=attempts+1,updated_at=moment WHERE id=claim.id;
   result:=result||jsonb_build_array(saas.email_marketing_job_projection(claim.id));
  END LOOP;RETURN result;
 END IF;
 IF p_action='rate' THEN
  SELECT * INTO c FROM saas.email_marketing_connections WHERE id=(p_input->>'connectionId')::uuid AND provider=p_input->>'provider' AND status<>'disconnected';IF c.id IS NULL THEN RAISE EXCEPTION 'not_configured';END IF;
  rate_limits:=CASE p_input->>'bucket' WHEN 'brevo_contacts' THEN '[[1000,10],[3600000,36000]]'::jsonb WHEN 'brevo_other' THEN '[[3600000,100]]'::jsonb WHEN 'klaviyo_accounts' THEN '[[1000,1],[60000,15]]'::jsonb WHEN 'klaviyo_lists' THEN '[[1000,10],[60000,150]]'::jsonb WHEN 'klaviyo_list_create' THEN '[[1000,10],[60000,150],[86400000,150]]'::jsonb WHEN 'klaviyo_profiles' THEN '[[1000,75],[60000,750]]'::jsonb WHEN 'klaviyo_membership_read' THEN '[[1000,3],[60000,60]]'::jsonb WHEN 'klaviyo_membership_write' THEN '[[1000,10],[60000,150]]'::jsonb WHEN 'klaviyo_subscription' THEN '[[1000,75],[60000,750]]'::jsonb ELSE NULL END;
  IF rate_limits IS NULL OR split_part(p_input->>'bucket','_',1)<>c.provider THEN RAISE EXCEPTION 'invalid_input';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email.rate:'||c.provider||':'||c.account_id||':'||(p_input->>'bucket'),0));
  FOR rate IN SELECT value FROM jsonb_array_elements(rate_limits) LOOP
   period:=(rate.value->>0)::int;maximum:=(rate.value->>1)::int;
   SELECT * INTO current_rate FROM saas.email_marketing_rate_windows WHERE provider=c.provider AND account_id=c.account_id AND bucket=p_input->>'bucket' AND period_ms=period;
   IF current_rate.window_start+period*interval '1 millisecond'>moment AND current_rate.calls>=maximum THEN RETURN jsonb_build_object('allowed',false,'retryAfterSeconds',greatest(1,ceil(extract(epoch FROM(current_rate.window_start+period*interval '1 millisecond'-moment)))));END IF;
  END LOOP;
  FOR rate IN SELECT value FROM jsonb_array_elements(rate_limits) LOOP
   period:=(rate.value->>0)::int;
   INSERT INTO saas.email_marketing_rate_windows VALUES(c.provider,c.account_id,p_input->>'bucket',period,moment,1) ON CONFLICT(provider,account_id,bucket,period_ms) DO UPDATE SET calls=CASE WHEN saas.email_marketing_rate_windows.window_start+period*interval '1 millisecond'<=moment THEN 1 ELSE saas.email_marketing_rate_windows.calls+1 END,window_start=CASE WHEN saas.email_marketing_rate_windows.window_start+period*interval '1 millisecond'<=moment THEN moment ELSE saas.email_marketing_rate_windows.window_start END;
  END LOOP;RETURN '{"allowed":true}'::jsonb;
 END IF;
 IF p_action='event' THEN
  event_data:=p_input->'event';SELECT * INTO c FROM saas.email_marketing_connections WHERE id=(p_input->>'connectionId')::uuid AND status<>'disconnected';
  IF c.id IS NULL OR event_data->>'scope' IS NULL OR event_data->>'scope' NOT IN('account','list') OR event_data->>'scope'='list' AND event_data->>'listId'<>c.list_id THEN RETURN '"rejected"'::jsonb;END IF;
  IF EXISTS(SELECT 1 FROM saas.email_marketing_inbound_events WHERE connection_id=c.id AND event_id=p_input->>'eventId') THEN RETURN '"replayed"'::jsonb;END IF;
  IF saas.email_marketing_provider_denial(c.id,p_input->>'eventId',event_data->>'email',event_data->>'profileId',event_data->>'kind',(p_input->>'eventTime')::timestamptz,event_data->>'scope',event_data->>'listId') THEN RETURN '"recorded"'::jsonb;END IF;RETURN '"rejected"'::jsonb;
 END IF;
 SELECT store_id INTO claim FROM saas.email_marketing_sync_jobs WHERE id=(p_input->>'jobId')::uuid;
 IF claim.store_id IS NULL THEN RETURN 'false'::jsonb;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('email.marketing:'||claim.store_id::text,0));
 SELECT * INTO j FROM saas.email_marketing_sync_jobs WHERE id=(p_input->>'jobId')::uuid FOR UPDATE;
 IF j.id IS NULL OR j.status<>'running' OR j.lease_token IS DISTINCT FROM (p_input->>'leaseToken')::uuid OR j.lease_until IS NULL OR j.lease_until<=moment THEN RETURN 'false'::jsonb;END IF;
 SELECT * INTO c FROM saas.email_marketing_connections WHERE id=j.connection_id FOR UPDATE;
 SELECT * INTO a FROM saas.email_marketing_audience WHERE store_id=j.store_id AND email=j.email FOR UPDATE;
 IF p_action='hook_checkpoint' THEN
  IF c.provider<>'brevo' THEN RETURN 'false'::jsonb;END IF;
  desired_status:=p_input->>'state';
  IF desired_status='dispatched' THEN
   IF c.status<>'connected' OR c.webhook_credential IS NOT NULL OR jsonb_typeof(p_input->'credential') IS DISTINCT FROM 'object' OR p_input->>'tokenDigest' IS NULL OR p_input->>'tokenDigest' !~ '^[a-f0-9]{64}$' THEN RETURN 'false'::jsonb;END IF;
   UPDATE saas.email_marketing_connections SET webhook_credential=p_input->'credential',webhook_hash=p_input->>'tokenDigest',webhook_state='dispatched',webhook_checked_at=moment WHERE id=c.id;
  ELSIF desired_status IN('verified','unknown','removing','removed') AND c.webhook_credential IS NOT NULL THEN
   IF desired_status='verified' AND p_input->>'id' IS NULL THEN RETURN 'false'::jsonb;END IF;
   UPDATE saas.email_marketing_connections SET webhook_state=desired_status,webhook_id=coalesce(p_input->>'id',webhook_id),webhook_checked_at=moment,error_code=CASE WHEN desired_status='unknown' THEN 'webhook_outcome_unknown' ELSE error_code END WHERE id=c.id;
  ELSE RETURN 'false'::jsonb;END IF;RETURN 'true'::jsonb;
 END IF;
 IF p_action='checkpoint' THEN
  desired_status:=p_input->'result'->>'phase';IF desired_status IS NULL OR desired_status NOT IN('dispatched','accepted','unknown') THEN RAISE EXCEPTION 'invalid_input';END IF;
  IF desired_status='dispatched' THEN
   IF j.phase<>'queued' OR (p_input->'result'->>'credentialVersion')::bigint IS DISTINCT FROM c.credential_version THEN RETURN 'false'::jsonb;END IF;action:=p_input->'result'->>'action';
   IF action IS NULL OR action NOT IN('subscribe','update_profile','add_membership','unsubscribe','remove_membership') THEN RAISE EXCEPTION 'invalid_input';END IF;
   IF action IN('subscribe','update_profile','add_membership') AND(c.status<>'connected' OR c.generation<>j.generation OR a.kind IS DISTINCT FROM 'grant' OR a.sequence IS DISTINCT FROM j.consent_version OR NOT saas.email_marketing_export_allowed(c.store_id)) THEN RETURN 'false'::jsonb;END IF;
   IF action IN('subscribe','update_profile','add_membership') AND EXISTS(SELECT 1 FROM saas.email_marketing_contacts x WHERE x.connection_id=c.id AND x.email=j.email AND x.list_denial_at IS NOT NULL) THEN
    provider_state:=p_input->'result'->'state';
    -- Only a newer verified provider-native reconsent may clear scoped evidence.
    IF provider_state->>'kind'='known' AND provider_state->>'marketingStatus'='subscribed' AND jsonb_typeof(provider_state->'unsubscribedListIds')='array' AND NOT (provider_state->'unsubscribedListIds'?c.list_id) AND (provider_state->>'consentUpdatedAt')::timestamptz>(SELECT list_denial_at FROM saas.email_marketing_contacts WHERE connection_id=c.id AND email=j.email) THEN
     UPDATE saas.email_marketing_contacts SET list_denial_at=NULL WHERE connection_id=c.id AND email=j.email;
    ELSE RETURN 'false'::jsonb;END IF;
   END IF;
   IF action='unsubscribe' AND(a.kind IS DISTINCT FROM 'deny' OR a.sequence IS DISTINCT FROM j.consent_version) OR action='remove_membership' AND c.status='connected' AND coalesce((j.progress->>'providerListDenial')::boolean,false)=false AND a.kind='grant' AND a.sequence<>j.consent_version THEN
    UPDATE saas.email_marketing_sync_jobs SET status='verified',lease_token=NULL,lease_until=NULL,error_code='superseded_revoke' WHERE id=j.id;RETURN 'false'::jsonb;
   END IF;
   IF action='subscribe' AND(EXISTS(SELECT 1 FROM saas.email_marketing_contacts WHERE connection_id=c.id AND email=j.email AND last_subscribe_at>moment-interval '30 minutes') OR EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs x WHERE x.connection_id=c.id AND x.email=j.email AND x.id<>j.id AND x.progress->>'action'='subscribe' AND x.phase<>'queued' AND x.status<>'verified')) THEN RETURN 'false'::jsonb;END IF;
   provider_state:=p_input->'result'->'state';
   INSERT INTO saas.email_marketing_contacts(store_id,connection_id,email,profile_id,consent_version,state,last_subscribe_at) VALUES(c.store_id,c.id,j.email,provider_state->>'profileId',coalesce(j.consent_version,0),'pending',CASE WHEN action='subscribe' THEN moment ELSE NULL END)
   ON CONFLICT(connection_id,email) DO UPDATE SET profile_id=coalesce(EXCLUDED.profile_id,saas.email_marketing_contacts.profile_id),consent_version=greatest(EXCLUDED.consent_version,saas.email_marketing_contacts.consent_version),state='pending',last_subscribe_at=coalesce(EXCLUDED.last_subscribe_at,saas.email_marketing_contacts.last_subscribe_at);
   UPDATE saas.email_marketing_sync_jobs SET phase='dispatched',credential_version=c.credential_version,credential_snapshot=c.credential,audience_snapshot=saas.email_marketing_job_projection(j.id)->'audience',dispatched_at=moment,progress=progress||jsonb_build_object('action',action,'dispatchedAt',saas.orders_json_timestamp(moment)) WHERE id=j.id;
  ELSE
   IF j.phase='queued' THEN RETURN 'false'::jsonb;END IF;
   UPDATE saas.email_marketing_sync_jobs SET phase=desired_status,provider_reference=coalesce(p_input->'result'->>'providerReference',provider_reference),updated_at=moment WHERE id=j.id;
   IF p_input->'result'->>'providerReference' IS NOT NULL THEN UPDATE saas.email_marketing_contacts SET profile_id=coalesce(profile_id,p_input->'result'->>'providerReference') WHERE connection_id=c.id AND email=j.email;END IF;
  END IF;RETURN 'true'::jsonb;
 END IF;
 IF p_action='finish' THEN
  desired_status:=p_input->'outcome'->>'status';provider_state:=p_input->'outcome'->'state';IF desired_status IS NULL OR desired_status NOT IN('verified','blocked','pending','attention','failed','retry') THEN RAISE EXCEPTION 'invalid_input';END IF;
  IF provider_state->>'profileId' IS NOT NULL THEN
   INSERT INTO saas.email_marketing_contacts(store_id,connection_id,email,profile_id,consent_version,state,last_checked_at,provider_consent_at) VALUES(c.store_id,c.id,j.email,provider_state->>'profileId',coalesce(j.consent_version,0),'pending',moment,(provider_state->>'consentUpdatedAt')::timestamptz) ON CONFLICT(connection_id,email) DO UPDATE SET profile_id=EXCLUDED.profile_id,last_checked_at=moment,provider_consent_at=EXCLUDED.provider_consent_at;
  END IF;
  IF desired_status='verified' AND j.kind='remove_membership' AND coalesce((j.progress->>'membershipEpoch')::bigint,0) IS DISTINCT FROM coalesce((SELECT membership_epoch FROM saas.email_marketing_contacts WHERE connection_id=c.id AND email=j.email),0) THEN
   UPDATE saas.email_marketing_sync_jobs SET status='queued',phase='queued',credential_snapshot=NULL,lease_token=NULL,lease_until=NULL,available_at=moment,progress=progress-'action'-'dispatchedAt' WHERE id=j.id;RETURN 'true'::jsonb;
  END IF;
  IF desired_status='verified' AND j.progress->>'action'='subscribe' AND c.status='connected' AND a.kind='grant' AND a.sequence=j.consent_version AND(a.first_name IS NOT NULL OR a.last_name IS NOT NULL) THEN
   UPDATE saas.email_marketing_sync_jobs SET status='queued',phase='queued',credential_snapshot=NULL,audience_snapshot=NULL,progress=jsonb_build_object('subscribeCompleted',true),lease_token=NULL,lease_until=NULL,available_at=moment,updated_at=moment WHERE id=j.id;RETURN 'true'::jsonb;
  END IF;
  IF desired_status='verified' AND (p_input->'outcome'->>'profileUpdated')::boolean IS TRUE THEN
   UPDATE saas.email_marketing_sync_jobs SET status='queued',phase='queued',credential_snapshot=NULL,audience_snapshot=NULL,progress=jsonb_build_object('profileUpdated',true,'subscribeCompleted',coalesce((j.progress->>'subscribeCompleted')::boolean,false)),lease_token=NULL,lease_until=NULL,available_at=moment,updated_at=moment WHERE id=j.id;RETURN 'true'::jsonb;
  END IF;
  IF desired_status='verified' THEN
   UPDATE saas.email_marketing_sync_jobs SET status='verified',lease_token=NULL,lease_until=NULL,credential_snapshot=NULL,updated_at=moment,error_code=NULL WHERE id=j.id;
   UPDATE saas.email_marketing_contacts SET state=CASE WHEN j.kind='remove_membership' THEN 'removed' WHEN j.kind='unsubscribe' THEN 'blocked' WHEN c.status='connected' AND a.kind='grant' AND a.sequence=j.consent_version THEN 'verified' ELSE 'pending' END,last_checked_at=moment WHERE connection_id=c.id AND email=j.email;
   IF j.progress->>'action' IN('subscribe','add_membership','update_profile') AND(c.status<>'connected' OR a.kind IS DISTINCT FROM 'grant' OR a.sequence IS DISTINCT FROM j.consent_version OR EXISTS(SELECT 1 FROM saas.email_marketing_contacts x WHERE x.connection_id=c.id AND x.email=j.email AND x.list_denial_at IS NOT NULL)) THEN
    UPDATE saas.email_marketing_contacts SET membership_epoch=membership_epoch+1 WHERE connection_id=c.id AND email=j.email;
    INSERT INTO saas.email_marketing_sync_jobs(store_id,connection_id,generation,credential_version,email,consent_version,kind,progress) VALUES(c.store_id,c.id,c.generation,c.credential_version,j.email,coalesce(a.sequence,0),CASE WHEN a.kind='deny' THEN 'unsubscribe' ELSE 'remove_membership' END,jsonb_build_object('providerListDenial',EXISTS(SELECT 1 FROM saas.email_marketing_contacts x WHERE x.connection_id=c.id AND x.email=j.email AND x.list_denial_at IS NOT NULL))) ON CONFLICT(connection_id,generation,email,consent_version,kind) DO UPDATE SET status='queued',phase='queued',progress=EXCLUDED.progress,available_at=moment,updated_at=moment WHERE saas.email_marketing_sync_jobs.status IN('verified','blocked','failed');END IF;
   UPDATE saas.email_marketing_connections SET last_synced_at=moment WHERE id=c.id;RETURN 'true'::jsonb;
  END IF;
  UPDATE saas.email_marketing_sync_jobs SET status=CASE WHEN j.phase<>'queued' THEN CASE WHEN desired_status='pending' THEN 'queued' ELSE 'attention' END WHEN desired_status IN('pending','retry') THEN 'queued' ELSE desired_status END,available_at=moment+greatest(30,least(86400,coalesce((p_input->'outcome'->>'retryAfterSeconds')::int,60)))*interval '1 second',lease_token=NULL,lease_until=NULL,error_code=left(p_input->'outcome'->>'errorCode',80),updated_at=moment WHERE id=j.id;
  IF j.phase='queued' AND desired_status='blocked' THEN UPDATE saas.email_marketing_contacts SET state='blocked' WHERE connection_id=c.id AND email=j.email;END IF;
  RETURN 'true'::jsonb;
 END IF;
 IF p_action='bootstrap' THEN
  IF c.status<>'connected' OR j.generation<>c.generation OR NOT saas.email_marketing_export_allowed(c.store_id) THEN UPDATE saas.email_marketing_sync_jobs SET status='blocked',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN 'false'::jsonb;END IF;
  rows:=saas.email_marketing_audience_page(c.store_id,c.id,j.progress->>'bootstrapCursor',100)->'items';
  FOR row_data IN SELECT value FROM jsonb_array_elements(rows) LOOP
   IF row_data->>'sequence' IS NULL THEN PERFORM saas.email_marketing_append_event(c.store_id,row_data->>'email',row_data->>'kind',row_data->>'source',row_data->>'source_id',row_data->>'source_version',(row_data->>'recorded_at')::timestamptz,(row_data->>'consented_at')::timestamptz,row_data->>'evidence_version',row_data->>'first_name',row_data->>'last_name');END IF;
   SELECT * INTO a FROM saas.email_marketing_audience WHERE store_id=c.store_id AND email=row_data->>'email';
   IF a.kind='grant' AND(c.provider<>'brevo' OR a.consented_at>=moment-interval '2 years') THEN INSERT INTO saas.email_marketing_sync_jobs(store_id,connection_id,generation,credential_version,email,consent_version,kind) VALUES(c.store_id,c.id,c.generation,c.credential_version,a.email,a.sequence,'profile') ON CONFLICT DO NOTHING;END IF;
  END LOOP;
  next_cursor:=rows->(jsonb_array_length(rows)-1)->>'email';
  UPDATE saas.email_marketing_sync_jobs SET status=CASE WHEN jsonb_array_length(rows)=100 THEN 'queued' ELSE 'verified' END,progress=jsonb_build_object('bootstrapCursor',next_cursor),lease_token=NULL,lease_until=NULL,updated_at=moment,available_at=moment WHERE id=j.id;RETURN 'true'::jsonb;
 END IF;
 IF p_action='poll' THEN
  IF jsonb_array_length(p_input->'page'->'events')>100 OR length(p_input->'page'->>'nextCursor')>2048 THEN RAISE EXCEPTION 'invalid_input';END IF;
  FOR event_data IN SELECT value FROM jsonb_array_elements(p_input->'page'->'events') LOOP
   IF event_data->>'scope'='account' OR event_data->>'scope'='list' AND event_data->>'listId'=c.list_id THEN PERFORM saas.email_marketing_provider_denial(c.id,event_data->>'eventId',event_data->>'email',event_data->>'profileId',event_data->>'kind',(event_data->>'eventTime')::timestamptz,event_data->>'scope',event_data->>'listId');END IF;
  END LOOP;
  next_cursor:=p_input->'page'->>'nextCursor';
  IF next_cursor IS NOT NULL THEN UPDATE saas.email_marketing_sync_jobs SET status='queued',progress=progress||jsonb_build_object('pollCursor',next_cursor),lease_token=NULL,lease_until=NULL,available_at=moment,updated_at=moment WHERE id=j.id;
  ELSIF p_input->'page'->>'completedThrough' IS NOT NULL THEN
   UPDATE saas.email_marketing_connections SET poll_watermark=least((j.progress->>'pollStartedAt')::timestamptz,(p_input->'page'->>'completedThrough')::timestamptz,moment),suppression_checked_at=moment,full_sweep_at=CASE WHEN (j.progress->>'fullSweep')::boolean THEN moment ELSE full_sweep_at END WHERE id=c.id;
   UPDATE saas.email_marketing_sync_jobs SET status='verified',lease_token=NULL,lease_until=NULL,updated_at=moment WHERE id=j.id;
  ELSE UPDATE saas.email_marketing_sync_jobs SET status='attention',error_code='poll_incomplete',lease_token=NULL,lease_until=NULL,updated_at=moment WHERE id=j.id;
  END IF;RETURN 'true'::jsonb;
 END IF;
 IF p_action='cleanup' THEN
  IF c.status<>'draining' THEN RETURN 'false'::jsonb;END IF;
  INSERT INTO saas.email_marketing_sync_jobs(store_id,connection_id,generation,credential_version,email,consent_version,kind)
  SELECT c.store_id,c.id,c.generation,c.credential_version,x.email,coalesce(a.sequence,0),'remove_membership' FROM saas.email_marketing_contacts x LEFT JOIN saas.email_marketing_audience a ON a.store_id=c.store_id AND a.email=x.email WHERE x.connection_id=c.id AND x.state<>'removed' ON CONFLICT DO NOTHING;
  IF (c.webhook_credential IS NULL OR c.webhook_state='removed') AND NOT EXISTS(SELECT 1 FROM saas.email_marketing_contacts WHERE connection_id=c.id AND state<>'removed') AND NOT EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs WHERE connection_id=c.id AND id<>j.id AND(phase<>'queued' AND status<>'verified' OR kind IN('unsubscribe','remove_membership') AND status<>'verified')) THEN
   UPDATE saas.email_marketing_connections SET status='disconnected',credential=NULL,webhook_credential=NULL,version=version+1,updated_at=moment WHERE id=c.id;
   UPDATE saas.email_marketing_sync_jobs SET status='verified',lease_token=NULL,lease_until=NULL WHERE id=j.id;
  ELSE UPDATE saas.email_marketing_sync_jobs SET status='queued',available_at=moment+interval '1 minute',lease_token=NULL,lease_until=NULL WHERE id=j.id;END IF;
  RETURN 'true'::jsonb;
 END IF;
 RAISE EXCEPTION 'invalid_input';
END $f$;

DO $acl$ DECLARE f regprocedure;BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'email_marketing_%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_observability',f);
 END LOOP;
 GRANT EXECUTE ON FUNCTION saas.email_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb) TO celebix_saas_app;
 GRANT EXECUTE ON FUNCTION saas.email_marketing_customers_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,jsonb,jsonb),saas.email_marketing_customers_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
 GRANT EXECUTE ON FUNCTION saas.email_marketing_newsletter_subscribe(text,timestamptz,text,text),saas.email_marketing_contact_capture(text,text,timestamptz,uuid,uuid,text,text,boolean,text) TO celebix_saas_host_resolver;
 GRANT EXECUTE ON FUNCTION saas.email_marketing_brevo_hook(text,uuid,text,jsonb) TO celebix_saas_host_resolver;
 GRANT EXECUTE ON FUNCTION saas.email_marketing_work(text,jsonb) TO celebix_saas_workflow;
 GRANT EXECUTE ON FUNCTION saas.email_marketing_audience_page(uuid,uuid,text,integer) TO celebix_saas_workflow;
 GRANT EXECUTE ON FUNCTION saas.email_marketing_provider_denial(uuid,text,text,text,text,timestamptz) TO celebix_saas_workflow;
END $acl$;
COMMIT;
