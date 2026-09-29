BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$ BEGIN
 IF (to_regclass('saas.content_research_operations') IS NULL) <> (to_regclass('saas.content_research_sources') IS NULL) THEN RAISE EXCEPTION 'content_research_partial_schema'; END IF;
END $f$;

CREATE TABLE IF NOT EXISTS saas.content_research_operations (
 id uuid PRIMARY KEY, store_id uuid NOT NULL REFERENCES saas.stores(id), principal_id uuid NOT NULL REFERENCES saas.principals(id),
 target jsonb NOT NULL, request_fingerprint text NOT NULL CHECK(request_fingerprint~'^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','completed','failed','unknown')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0), dispatch_state text NOT NULL DEFAULT 'not_dispatched' CHECK(dispatch_state IN('not_dispatched','dispatched','unknown')),
 claim_token uuid, lease_expires_at timestamptz, usage jsonb DEFAULT '{"sourcesAttempted":0,"fetchedBytes":0,"extractedBytes":0,"elapsedMs":0}'::jsonb,
 safe_code text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, finished_at timestamptz,
 CHECK((status='pending')=(lease_expires_at IS NOT NULL)), CHECK((status IN('pending','completed'))=(safe_code IS NULL)), CHECK(status='unknown' OR usage IS NOT NULL),
 CHECK(dispatch_state<>'not_dispatched' OR claim_token IS NULL), CHECK(dispatch_state<>'dispatched' OR claim_token IS NOT NULL),
 UNIQUE(id,store_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS content_research_one_active ON saas.content_research_operations(store_id,principal_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS content_research_daily ON saas.content_research_operations(store_id,created_at);
CREATE INDEX IF NOT EXISTS content_research_actor_rate ON saas.content_research_operations(store_id,principal_id,created_at);
CREATE TABLE IF NOT EXISTS saas.content_research_sources (
 store_id uuid NOT NULL, operation_id uuid NOT NULL, ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 3), id uuid NOT NULL,
 original_url text NOT NULL, final_url text NOT NULL, title text NOT NULL, fetched_at timestamptz NOT NULL,
 content_sha256 text NOT NULL CHECK(content_sha256~'^[a-f0-9]{64}$'), extracted_text text NOT NULL, byte_count integer NOT NULL CHECK(byte_count BETWEEN 1 AND 524288),
 PRIMARY KEY(operation_id,ordinal), UNIQUE(operation_id,id), FOREIGN KEY(operation_id,store_id) REFERENCES saas.content_research_operations(id,store_id)
);
ALTER TABLE saas.content_research_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.content_research_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.content_research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.content_research_sources FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.content_research_operations,saas.content_research_sources FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE OR REPLACE FUNCTION saas.content_research_url_valid(v text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE authority text;
BEGIN
 IF v IS NULL OR octet_length(v) NOT BETWEEN 1 AND 2048 OR v!~'^https://' OR v~'[[:space:]#@\\]' OR v~U&'[\0001-\001F\007F-\009F]' THEN RETURN false;END IF;
 authority:=split_part(split_part(substring(v FROM 9),'/',1),'?',1);
 IF authority!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$' OR octet_length(authority)>253 OR authority~'\.(local|localhost|internal|lan|home)$' THEN RETURN false;END IF;
 RETURN true;
END $f$;
CREATE OR REPLACE FUNCTION saas.content_research_usage_valid(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE k text;limit_value bigint;
BEGIN
 IF saas.content_authoring_object_valid(v,ARRAY['sourcesAttempted','fetchedBytes','extractedBytes','elapsedMs'],ARRAY[]::text[]) IS NOT TRUE THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['sourcesAttempted','fetchedBytes','extractedBytes','elapsedMs'] LOOP
  IF jsonb_typeof(v->k) IS DISTINCT FROM 'number' OR v->>k!~'^(0|[1-9][0-9]{0,8})$' THEN RETURN false;END IF;
  limit_value:=CASE k WHEN 'sourcesAttempted' THEN 3 WHEN 'fetchedBytes' THEN 1572864 WHEN 'extractedBytes' THEN 32000 ELSE 60000 END;
  IF (v->>k)::bigint>limit_value THEN RETURN false;END IF;
 END LOOP;
 IF ((v->>'sourcesAttempted')::integer=0 AND ((v->>'fetchedBytes')::integer<>0 OR (v->>'extractedBytes')::integer<>0)) OR (v->>'extractedBytes')::integer>(v->>'fetchedBytes')::integer THEN RETURN false;END IF;
 RETURN true;
END $f$;
CREATE OR REPLACE FUNCTION saas.content_research_source_valid(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE content text;
BEGIN
 IF saas.content_authoring_object_valid(v,ARRAY['id','originalUrl','finalUrl','title','fetchedAt','contentSha256','extractedText','byteCount'],ARRAY[]::text[]) IS NOT TRUE OR v->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR saas.content_research_url_valid(v->>'originalUrl') IS NOT TRUE OR saas.content_research_url_valid(v->>'finalUrl') IS NOT TRUE OR v->>'contentSha256'!~'^[a-f0-9]{64}$' OR v->>'byteCount'!~'^[1-9][0-9]{0,5}$' OR (v->>'byteCount')::integer>524288 OR v->>'fetchedAt'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN RETURN false;END IF;
 content:=v->>'extractedText';
 IF content IS NULL OR octet_length(content) NOT BETWEEN 1 AND 12000 OR octet_length(coalesce(v->>'title',''))>500 OR (v->>'title')~U&'[\0001-\001F\007F-\009F]' OR encode(sha256(convert_to(content,'UTF8')),'hex')<>v->>'contentSha256' THEN RETURN false;END IF;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $f$;
CREATE OR REPLACE FUNCTION saas.content_research_payload(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('operationId',o.id,'status',o.status,'sources',CASE WHEN o.status='completed' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'originalUrl',s.original_url,'finalUrl',s.final_url,'title',s.title,'fetchedAt',saas.merchant_admin_timestamp(s.fetched_at),'contentSha256',s.content_sha256,'extractedText',s.extracted_text,'byteCount',s.byte_count) ORDER BY s.ordinal) FROM saas.content_research_sources s WHERE s.operation_id=o.id),'[]'::jsonb) ELSE '[]'::jsonb END,'usage',o.usage,'safeCode',o.safe_code,'target',o.target,'requestFingerprint',o.request_fingerprint,'version',o.version,'dispatchState',o.dispatch_state,'claimToken',o.claim_token,'leaseExpiresAt',saas.merchant_admin_timestamp(o.lease_expires_at)) FROM saas.content_research_operations o WHERE o.id=p_id
$f$;

-- Preserve the Phase2 model quota calculations; add research only to the shared active lease.
CREATE OR REPLACE FUNCTION saas.content_authoring_shared_admission(p_store uuid,p_actor uuid,p_now timestamptz) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE n bigint;lim integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store::text,170));
 UPDATE saas.content_resource_authoring_operations SET status=CASE WHEN dispatch_state='not_dispatched' THEN 'failed' ELSE 'unknown' END,dispatch_state=CASE WHEN dispatch_state='not_dispatched' THEN 'not_dispatched' ELSE 'unknown' END,safe_code='provider_timeout',version=version+1,updated_at=p_now,finished_at=p_now WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at<=p_now;
 UPDATE saas.content_research_operations SET status=CASE WHEN dispatch_state='not_dispatched' THEN 'failed' ELSE 'unknown' END,usage=CASE WHEN dispatch_state='not_dispatched' THEN usage ELSE NULL END,dispatch_state=CASE WHEN dispatch_state='not_dispatched' THEN 'not_dispatched' ELSE 'unknown' END,safe_code='content_research_timeout',lease_expires_at=NULL,version=version+1,updated_at=p_now,finished_at=p_now WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at<=p_now;
 IF EXISTS(SELECT 1 FROM saas.content_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at>p_now UNION ALL SELECT 1 FROM saas.content_resource_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at>p_now UNION ALL SELECT 1 FROM saas.content_research_operations WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at>p_now) THEN RETURN 'operation_busy';END IF;
 SELECT count(*) INTO n FROM (SELECT 1 FROM saas.content_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND created_at>p_now-interval '1 minute' UNION ALL SELECT 1 FROM saas.content_resource_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND created_at>p_now-interval '1 minute') q;
 IF n>=6 THEN RETURN 'rate_limited';END IF;
 SELECT coalesce((SELECT daily_limit FROM saas.content_authoring_settings WHERE store_id=p_store),100) INTO lim;
 SELECT count(*) INTO n FROM (SELECT created_at FROM saas.content_authoring_operations WHERE store_id=p_store UNION ALL SELECT created_at FROM saas.content_resource_authoring_operations WHERE store_id=p_store) q WHERE created_at>=date_trunc('day',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND created_at<(date_trunc('day',p_now AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC';
 IF n>=lim THEN RETURN 'quota_exceeded';END IF;RETURN NULL;
END $f$;
CREATE OR REPLACE FUNCTION saas.content_research_admission(p_store uuid,p_actor uuid,p_now timestamptz) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE n bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store::text,170));
 UPDATE saas.content_resource_authoring_operations SET status=CASE WHEN dispatch_state='not_dispatched' THEN 'failed' ELSE 'unknown' END,dispatch_state=CASE WHEN dispatch_state='not_dispatched' THEN 'not_dispatched' ELSE 'unknown' END,safe_code='provider_timeout',version=version+1,updated_at=p_now,finished_at=p_now WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at<=p_now;
 UPDATE saas.content_research_operations SET status=CASE WHEN dispatch_state='not_dispatched' THEN 'failed' ELSE 'unknown' END,usage=CASE WHEN dispatch_state='not_dispatched' THEN usage ELSE NULL END,dispatch_state=CASE WHEN dispatch_state='not_dispatched' THEN 'not_dispatched' ELSE 'unknown' END,safe_code='content_research_timeout',lease_expires_at=NULL,version=version+1,updated_at=p_now,finished_at=p_now WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at<=p_now;
 IF EXISTS(SELECT 1 FROM saas.content_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at>p_now UNION ALL SELECT 1 FROM saas.content_resource_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at>p_now UNION ALL SELECT 1 FROM saas.content_research_operations WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at>p_now) THEN RETURN 'operation_busy';END IF;
 SELECT count(*) INTO n FROM saas.content_research_operations WHERE store_id=p_store AND principal_id=p_actor AND created_at>p_now-interval '1 minute';IF n>=6 THEN RETURN 'rate_limited';END IF;
 SELECT count(*) INTO n FROM saas.content_research_operations WHERE store_id=p_store AND created_at>=date_trunc('day',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND created_at<(date_trunc('day',p_now AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC';IF n>=10 THEN RETURN 'quota_exceeded';END IF;
 RETURN NULL;
END $f$;

CREATE OR REPLACE FUNCTION saas.content_research_transition(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text,p_id uuid,p_expected_version bigint,p_token uuid,p_data jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;op saas.content_research_operations%ROWTYPE;rec saas.merchant_admin_records%ROWTYPE;item jsonb;ord integer;raw_sum integer;extracted_sum integer;counted integer;u jsonb;
BEGIN
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'page',true);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 IF p_action IS NULL OR p_action NOT IN('begin','claim','get','complete','fail') OR p_id IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store_id::text,170));
 SELECT * INTO op FROM saas.content_research_operations WHERE id=p_id FOR UPDATE;
 IF FOUND AND (op.store_id<>p_store_id OR op.principal_id<>p_principal_id) THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;RETURN;END IF;
 IF p_action='begin' THEN
  IF saas.content_authoring_object_valid(p_data,ARRAY['requestFingerprint','target'],ARRAY[]::text[]) IS NOT TRUE OR p_data->>'requestFingerprint'!~'^[a-f0-9]{64}$' OR saas.content_resource_target_valid(p_data->'target') IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF op.id IS NOT NULL THEN
   IF op.target IS DISTINCT FROM p_data->'target' OR op.request_fingerprint IS DISTINCT FROM p_data->>'requestFingerprint' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
   IF op.status='pending' AND op.lease_expires_at<=p_now THEN UPDATE saas.content_research_operations SET status=CASE WHEN dispatch_state='not_dispatched' THEN 'failed' ELSE 'unknown' END,usage=CASE WHEN dispatch_state='not_dispatched' THEN usage ELSE NULL END,dispatch_state=CASE WHEN dispatch_state='not_dispatched' THEN 'not_dispatched' ELSE 'unknown' END,safe_code='content_research_timeout',lease_expires_at=NULL,version=version+1,updated_at=p_now,finished_at=p_now WHERE id=p_id;END IF;
   RETURN QUERY SELECT CASE WHEN op.status='completed' THEN 'replayed-result' ELSE 'existing-status' END,saas.content_research_payload(p_id);RETURN;
  END IF;
  IF p_data->'target'->>'recordId' IS NOT NULL THEN
   SELECT * INTO rec FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=(p_data->'target'->>'recordId')::uuid AND record_kind=p_data->'target'->>'kind' FOR SHARE;
   IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
   IF rec.status='archived' OR rec.version<>(p_data->'target'->>'recordVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  END IF;
  denied:=saas.content_research_admission(p_store_id,p_principal_id,p_now);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.content_research_operations(id,store_id,principal_id,target,request_fingerprint,lease_expires_at,created_at,updated_at) VALUES(p_id,p_store_id,p_principal_id,p_data->'target',p_data->>'requestFingerprint',p_now+interval '60 seconds',p_now,p_now);
  RETURN QUERY SELECT 'pending',saas.content_research_payload(p_id);RETURN;
 END IF;
 IF op.id IS NULL THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;RETURN;END IF;
 IF op.status='pending' AND op.lease_expires_at<=p_now THEN UPDATE saas.content_research_operations SET status=CASE WHEN dispatch_state='not_dispatched' THEN 'failed' ELSE 'unknown' END,usage=CASE WHEN dispatch_state='not_dispatched' THEN usage ELSE NULL END,dispatch_state=CASE WHEN dispatch_state='not_dispatched' THEN 'not_dispatched' ELSE 'unknown' END,safe_code='content_research_timeout',lease_expires_at=NULL,version=version+1,updated_at=p_now,finished_at=p_now WHERE id=p_id;IF p_action<>'get' THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;END IF;
 IF p_action='get' THEN RETURN QUERY SELECT 'found',saas.content_research_payload(p_id);RETURN;END IF;
 IF p_action='claim' THEN
  IF op.status<>'pending' OR op.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF op.dispatch_state<>'not_dispatched' THEN RETURN QUERY SELECT 'dispatch_already_claimed',NULL::jsonb;RETURN;END IF;
  IF op.target->>'recordId' IS NOT NULL THEN
   SELECT * INTO rec FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=(op.target->>'recordId')::uuid AND record_kind=op.target->>'kind' FOR SHARE;
   IF NOT FOUND OR rec.status='archived' OR rec.version<>(op.target->>'recordVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  END IF;
  UPDATE saas.content_research_operations SET dispatch_state='dispatched',claim_token=gen_random_uuid(),lease_expires_at=p_now+interval '25 seconds',version=version+1,updated_at=p_now WHERE id=p_id;
  RETURN QUERY SELECT 'claimed',saas.content_research_payload(p_id);RETURN;
 END IF;
 IF p_action='complete' THEN
  IF op.status='completed' AND op.version=p_expected_version+1 AND op.claim_token=p_token AND op.usage IS NOT DISTINCT FROM p_data->'usage' AND (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'originalUrl',original_url,'finalUrl',final_url,'title',title,'fetchedAt',saas.merchant_admin_timestamp(fetched_at),'contentSha256',content_sha256,'extractedText',extracted_text,'byteCount',byte_count) ORDER BY ordinal),'[]'::jsonb) FROM saas.content_research_sources WHERE operation_id=p_id) IS NOT DISTINCT FROM p_data->'sources' THEN RETURN QUERY SELECT 'completed',saas.content_research_payload(p_id);RETURN;END IF;
  IF op.status<>'pending' OR op.version IS DISTINCT FROM p_expected_version OR op.dispatch_state<>'dispatched' OR op.claim_token IS DISTINCT FROM p_token OR p_token IS NULL THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF saas.content_authoring_object_valid(p_data,ARRAY['sources','usage'],ARRAY[]::text[]) IS NOT TRUE OR jsonb_typeof(p_data->'sources') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'sources') NOT BETWEEN 1 AND 3 OR saas.content_research_usage_valid(p_data->'usage') IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  raw_sum:=0;extracted_sum:=0;ord:=0;
  FOR item IN SELECT value FROM jsonb_array_elements(p_data->'sources') LOOP
   IF saas.content_research_source_valid(item) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   ord:=ord+1;raw_sum:=raw_sum+(item->>'byteCount')::integer;extracted_sum:=extracted_sum+octet_length(item->>'extractedText');
  END LOOP;
  IF extracted_sum>32000 OR (p_data->'usage'->>'sourcesAttempted')::integer<>ord OR (p_data->'usage'->>'fetchedBytes')::integer<>raw_sum OR (p_data->'usage'->>'extractedBytes')::integer<>extracted_sum OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_data->'sources'))<>ord THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  ord:=0;FOR item IN SELECT value FROM jsonb_array_elements(p_data->'sources') LOOP ord:=ord+1;INSERT INTO saas.content_research_sources(store_id,operation_id,ordinal,id,original_url,final_url,title,fetched_at,content_sha256,extracted_text,byte_count) VALUES(p_store_id,p_id,ord,(item->>'id')::uuid,item->>'originalUrl',item->>'finalUrl',item->>'title',(item->>'fetchedAt')::timestamptz,item->>'contentSha256',item->>'extractedText',(item->>'byteCount')::integer);END LOOP;
  UPDATE saas.content_research_operations SET status='completed',lease_expires_at=NULL,usage=p_data->'usage',version=version+1,updated_at=p_now,finished_at=p_now WHERE id=p_id;
  RETURN QUERY SELECT 'completed',saas.content_research_payload(p_id);RETURN;
 END IF;
 IF p_action='fail' THEN
  IF saas.content_authoring_object_valid(p_data,ARRAY['safeCode','dispatchState','usage'],ARRAY[]::text[]) IS NOT TRUE OR jsonb_typeof(p_data->'safeCode') IS DISTINCT FROM 'string' OR p_data->>'safeCode' NOT IN('content_research_url_invalid','content_research_address_denied','content_research_redirect_invalid','content_research_response_invalid','content_research_response_too_large','content_research_extraction_invalid','content_research_extraction_too_large','content_research_timeout','content_research_unavailable','cancelled','unavailable') OR jsonb_typeof(p_data->'dispatchState') IS DISTINCT FROM 'string' OR p_data->>'dispatchState' NOT IN('not_dispatched','dispatched','unknown') OR saas.content_research_usage_valid(p_data->'usage') IS NOT TRUE OR (p_data->>'dispatchState'='not_dispatched' AND p_token IS NOT NULL) OR (p_data->>'dispatchState'='dispatched' AND p_token IS NULL) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF op.status IN('failed','unknown') AND op.version=p_expected_version+1 AND op.claim_token IS NOT DISTINCT FROM p_token AND op.safe_code=p_data->>'safeCode' AND op.dispatch_state=p_data->>'dispatchState' AND op.usage=p_data->'usage' THEN RETURN QUERY SELECT 'failed',saas.content_research_payload(p_id);RETURN;END IF;
  IF op.status<>'pending' OR op.version IS DISTINCT FROM p_expected_version OR op.claim_token IS DISTINCT FROM p_token THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  UPDATE saas.content_research_operations SET status=CASE WHEN p_data->>'dispatchState'='unknown' THEN 'unknown' ELSE 'failed' END,dispatch_state=p_data->>'dispatchState',lease_expires_at=NULL,usage=p_data->'usage',safe_code=p_data->>'safeCode',version=version+1,updated_at=p_now,finished_at=p_now WHERE id=p_id;
  RETURN QUERY SELECT 'failed',saas.content_research_payload(p_id);RETURN;
 END IF;
 RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_busy',NULL::jsonb;
END $f$;
CREATE OR REPLACE FUNCTION saas.content_research_begin(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_fingerprint text,p_target jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_research_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'begin',p_id,NULL,NULL,jsonb_build_object('requestFingerprint',p_fingerprint,'target',p_target)) $f$;
CREATE OR REPLACE FUNCTION saas.content_research_get(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_research_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'get',p_id,NULL,NULL,'{}'::jsonb) $f$;
CREATE OR REPLACE FUNCTION saas.content_research_claim(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_research_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'claim',p_id,p_version,NULL,'{}'::jsonb) $f$;
CREATE OR REPLACE FUNCTION saas.content_research_complete(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_version bigint,p_token uuid,p_sources jsonb,p_usage jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_research_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'complete',p_id,p_version,p_token,jsonb_build_object('sources',p_sources,'usage',p_usage)) $f$;
CREATE OR REPLACE FUNCTION saas.content_research_fail(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_version bigint,p_token uuid,p_code text,p_dispatch_state text,p_usage jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_research_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'fail',p_id,p_version,p_token,jsonb_build_object('safeCode',p_code,'dispatchState',p_dispatch_state,'usage',p_usage)) $f$;
DO $f$ DECLARE fn record; BEGIN
 FOR fn IN SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('content_research_url_valid','content_research_usage_valid','content_research_source_valid','content_research_payload','content_research_admission','content_research_transition','content_research_begin','content_research_get','content_research_claim','content_research_complete','content_research_fail') LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||fn.signature||' FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator';END LOOP;
 FOR fn IN SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('content_research_begin','content_research_get','content_research_claim','content_research_complete','content_research_fail') LOOP EXECUTE 'GRANT EXECUTE ON FUNCTION '||fn.signature||' TO celebix_saas_app';END LOOP;
END $f$;
COMMIT;
