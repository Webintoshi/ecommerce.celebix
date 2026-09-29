BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$ DECLARE retained boolean:=to_regclass('saas.content_resource_authoring_operations') IS NOT NULL; BEGIN
 IF retained IS DISTINCT FROM (to_regclass('saas.content_resource_origin_history') IS NOT NULL) THEN RAISE EXCEPTION 'content_resource_partial_existing_schema';END IF;
 IF NOT retained AND EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='saas'::regnamespace AND (proname LIKE 'content_resource_%' OR proname IN('content_authoring_shared_admission','content_authoring_begin_shared'))) THEN RAISE EXCEPTION 'content_resource_unexpected_existing_function';END IF;
END $f$;

CREATE TABLE IF NOT EXISTS saas.content_resource_authoring_operations (
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),principal_id uuid NOT NULL REFERENCES saas.principals(id),
 target jsonb NOT NULL,stage text NOT NULL CHECK(stage IN('outline','draft')),bound_record_id uuid,
 request_fingerprint text NOT NULL CHECK(request_fingerprint~'^[a-f0-9]{64}$'),source_fingerprint text NOT NULL CHECK(source_fingerprint~'^[a-f0-9]{64}$'),
 config_id uuid NOT NULL REFERENCES saas.toshi_provider_configs(id),provider text NOT NULL,model text NOT NULL,credential_version bigint NOT NULL CHECK(credential_version>0),prompt_version text NOT NULL,
 status text NOT NULL CHECK(status IN('pending','completed','failed','unknown')),version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 dispatch_state text NOT NULL DEFAULT 'not_dispatched' CHECK(dispatch_state IN('not_dispatched','dispatched','unknown')),claim_token uuid,lease_expires_at timestamptz,
 usage jsonb,outline jsonb,draft jsonb,safe_code text,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,finished_at timestamptz,
 CHECK((status='pending')=(finished_at IS NULL)),CHECK((status='completed')=((outline IS NOT NULL)<>(draft IS NOT NULL))),
 CHECK((dispatch_state='not_dispatched')=(claim_token IS NULL)),CHECK(outline IS NULL OR stage='outline'),CHECK(draft IS NULL OR stage='draft'),UNIQUE(id,store_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS content_resource_one_active ON saas.content_resource_authoring_operations(store_id,principal_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS content_resource_daily ON saas.content_resource_authoring_operations(store_id,created_at);
CREATE INDEX IF NOT EXISTS content_resource_actor_rate ON saas.content_resource_authoring_operations(store_id,principal_id,created_at);
ALTER TABLE saas.content_resource_authoring_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.content_resource_authoring_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.content_resource_authoring_operations FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE OR REPLACE FUNCTION saas.content_resource_target_valid(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF saas.content_authoring_object_valid(v,ARRAY['kind','draftId','recordId','recordVersion'],ARRAY[]::text[]) IS NOT TRUE OR jsonb_typeof(v->'kind') IS DISTINCT FROM 'string' OR v->>'kind' NOT IN('page','blog_post') OR jsonb_typeof(v->'draftId') IS DISTINCT FROM 'string' OR v->>'draftId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN false;END IF;
 IF v->'recordId'='null'::jsonb THEN RETURN v->'recordVersion'='null'::jsonb;END IF;
 IF jsonb_typeof(v->'recordId') IS DISTINCT FROM 'string' OR v->>'recordId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(v->'recordVersion') IS DISTINCT FROM 'number' OR v->>'recordVersion'!~'^[1-9][0-9]{0,15}$' THEN RETURN false;END IF;
 RETURN (v->>'recordVersion')::numeric<=9007199254740991;
END $f$;
-- JSONB adds formatting spaces; the public outline bound counts compact JSON bytes.
CREATE OR REPLACE FUNCTION saas.content_resource_compact_json_bytes(v jsonb,p_depth integer DEFAULT 0) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE n integer:=2;x record;c jsonb;counted integer:=0;
BEGIN
 IF p_depth>32 THEN RETURN 2147483647;END IF;
 IF jsonb_typeof(v)='object' THEN
  FOR x IN SELECT * FROM jsonb_each(v) LOOP n:=n+octet_length(to_jsonb(x.key)::text)+1+saas.content_resource_compact_json_bytes(x.value,p_depth+1);counted:=counted+1;END LOOP;
 ELSIF jsonb_typeof(v)='array' THEN
  FOR c IN SELECT value FROM jsonb_array_elements(v) LOOP n:=n+saas.content_resource_compact_json_bytes(c,p_depth+1);counted:=counted+1;END LOOP;
 ELSE RETURN octet_length(v::text);END IF;
 RETURN n+greatest(counted-1,0);
END $f$;
CREATE OR REPLACE FUNCTION saas.content_resource_outline_valid(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE s jsonb;p jsonb;
BEGIN
 IF saas.content_authoring_object_valid(v,ARRAY['title','sections'],ARRAY[]::text[]) IS NOT TRUE OR octet_length(v::text)>16384 OR jsonb_typeof(v->'title') IS DISTINCT FROM 'string' OR saas.merchant_content_text_valid(v->>'title',160) IS NOT TRUE OR octet_length(v->>'title')<1 OR jsonb_typeof(v->'sections') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 IF jsonb_array_length(v->'sections') NOT BETWEEN 1 AND 12 THEN RETURN false;END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(v->'sections') LOOP
  IF saas.content_authoring_object_valid(s,ARRAY['heading','points'],ARRAY[]::text[]) IS NOT TRUE OR jsonb_typeof(s->'heading') IS DISTINCT FROM 'string' OR saas.merchant_content_text_valid(s->>'heading',200) IS NOT TRUE OR octet_length(s->>'heading')<1 OR jsonb_typeof(s->'points') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
  IF jsonb_array_length(s->'points')>6 THEN RETURN false;END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(s->'points') LOOP IF jsonb_typeof(p) IS DISTINCT FROM 'string' OR saas.merchant_content_text_valid(p#>>'{}',500) IS NOT TRUE OR octet_length(p#>>'{}')<1 THEN RETURN false;END IF;END LOOP;
 END LOOP;RETURN saas.content_resource_compact_json_bytes(v)<=8192;
END $f$;
CREATE OR REPLACE FUNCTION saas.content_resource_draft_valid(v jsonb,source text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE x record;c jsonb;s jsonb;
BEGIN
 IF saas.content_authoring_object_valid(v,ARRAY['sourceFingerprint','values','citations','suggestions'],ARRAY[]::text[]) IS NOT TRUE OR jsonb_typeof(v->'sourceFingerprint') IS DISTINCT FROM 'string' OR v->>'sourceFingerprint' IS DISTINCT FROM source OR source!~'^[a-f0-9]{64}$' OR jsonb_typeof(v->'values') IS DISTINCT FROM 'object' OR v->'values'='{}'::jsonb OR jsonb_typeof(v->'citations') IS DISTINCT FROM 'array' OR jsonb_typeof(v->'suggestions') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 FOR x IN SELECT * FROM jsonb_each(v->'values') LOOP
  IF x.key NOT IN('name','body','excerpt','seoTitle','seoDescription') THEN RETURN false;END IF;
  IF x.value='null'::jsonb AND x.key IN('excerpt','seoTitle','seoDescription') THEN CONTINUE;END IF;
  IF jsonb_typeof(x.value) IS DISTINCT FROM 'string' THEN RETURN false;END IF;
  IF x.key='body' THEN IF saas.merchant_content_html_valid(x.value#>>'{}') IS NOT TRUE THEN RETURN false;END IF;
  ELSIF saas.merchant_content_text_valid(x.value#>>'{}',CASE WHEN x.key IN('name','seoTitle') THEN 160 ELSE 4000 END) IS NOT TRUE OR (x.key='name' AND octet_length(x.value#>>'{}')=0) OR (x.value#>>'{}')~U&'[\0001-\001F\007F-\009F]' OR left(x.value#>>'{}',1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' OR right(x.value#>>'{}',1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' OR (x.value#>>'{}')~*'</?[a-z!].*>' THEN RETURN false;END IF;
 END LOOP;
 IF jsonb_array_length(v->'citations')>100 OR jsonb_array_length(v->'suggestions')>12 THEN RETURN false;END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(v->'citations') LOOP
  IF saas.content_authoring_object_valid(c,ARRAY['field','sourceId','quote'],ARRAY[]::text[]) IS NOT TRUE OR jsonb_typeof(c->'field') IS DISTINCT FROM 'string' OR NOT(v->'values' ? (c->>'field')) OR jsonb_typeof(c->'sourceId') IS DISTINCT FROM 'string' OR c->>'sourceId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(c->'quote') IS DISTINCT FROM 'string' OR saas.merchant_content_text_valid(c->>'quote',512) IS NOT TRUE OR octet_length(c->>'quote')<1 THEN RETURN false;END IF;
 END LOOP;
 FOR s IN SELECT value FROM jsonb_array_elements(v->'suggestions') LOOP IF jsonb_typeof(s) IS DISTINCT FROM 'string' OR saas.merchant_content_text_valid(s#>>'{}',500) IS NOT TRUE OR octet_length(s#>>'{}')<1 THEN RETURN false;END IF;END LOOP;
 RETURN true;
END $f$;
CREATE OR REPLACE FUNCTION saas.content_resource_authoring_payload(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',id,'target',target,'stage',stage,'status',status,'requestFingerprint',request_fingerprint,'sourceFingerprint',source_fingerprint,'configId',config_id,'provider',provider,'model',model,'credentialVersion',credential_version,'promptVersion',prompt_version,'version',version,'dispatchState',dispatch_state,'claimToken',claim_token,'leaseExpiresAt',saas.merchant_admin_timestamp(lease_expires_at),'usage',usage,'outline',outline,'draft',draft,'safeCode',safe_code,'createdAt',saas.merchant_admin_timestamp(created_at),'updatedAt',saas.merchant_admin_timestamp(updated_at),'finishedAt',saas.merchant_admin_timestamp(finished_at)) FROM saas.content_resource_authoring_operations WHERE id=p_id
$f$;
-- Owner-only helper: both public callers establish current domain authority first.
CREATE OR REPLACE FUNCTION saas.content_authoring_shared_admission(p_store uuid,p_actor uuid,p_now timestamptz) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE n bigint;lim integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store::text,170));
 UPDATE saas.content_resource_authoring_operations SET status=CASE WHEN dispatch_state='not_dispatched' THEN 'failed' ELSE 'unknown' END,dispatch_state=CASE WHEN dispatch_state='not_dispatched' THEN 'not_dispatched' ELSE 'unknown' END,safe_code='provider_timeout',version=version+1,updated_at=p_now,finished_at=p_now WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at<=p_now;
 IF EXISTS(SELECT 1 FROM saas.content_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at>p_now UNION ALL SELECT 1 FROM saas.content_resource_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND status='pending' AND lease_expires_at>p_now) THEN RETURN 'operation_busy';END IF;
 SELECT count(*) INTO n FROM (SELECT 1 FROM saas.content_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND created_at>p_now-interval '1 minute' UNION ALL SELECT 1 FROM saas.content_resource_authoring_operations WHERE store_id=p_store AND principal_id=p_actor AND created_at>p_now-interval '1 minute') q;
 IF n>=6 THEN RETURN 'rate_limited';END IF;
 SELECT coalesce((SELECT daily_limit FROM saas.content_authoring_settings WHERE store_id=p_store),100) INTO lim;
 SELECT count(*) INTO n FROM (SELECT created_at FROM saas.content_authoring_operations WHERE store_id=p_store UNION ALL SELECT created_at FROM saas.content_resource_authoring_operations WHERE store_id=p_store) q WHERE created_at>=date_trunc('day',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND created_at<(date_trunc('day',p_now AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC';
 IF n>=lim THEN RETURN 'quota_exceeded';END IF;RETURN NULL;
END $f$;
CREATE OR REPLACE FUNCTION saas.content_authoring_begin_shared(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_fingerprint text,p_draft_id uuid,p_product_id uuid,p_source_fingerprint text,p_config_id uuid,p_provider text,p_model text,p_credential_version bigint,p_prompt_version text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 denied:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store_id::text,170));
 IF NOT EXISTS(SELECT 1 FROM saas.content_authoring_operations WHERE id=p_id) THEN denied:=saas.content_authoring_shared_admission(p_store_id,p_principal_id,p_now);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;END IF;
 RETURN QUERY SELECT * FROM saas.content_authoring_begin(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_id,p_fingerprint,p_draft_id,p_product_id,p_source_fingerprint,p_config_id,p_provider,p_model,p_credential_version,p_prompt_version);
END $f$;
CREATE OR REPLACE FUNCTION saas.content_resource_authoring_transition(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text,p_id uuid,p_expected_version bigint,p_token uuid,p_data jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;op saas.content_resource_authoring_operations%ROWTYPE;cfg saas.toshi_provider_configs%ROWTYPE;rec saas.merchant_admin_records%ROWTYPE;measured jsonb;out_outline jsonb;out_draft jsonb;
BEGIN
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'page',true);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 IF p_action IS NULL OR p_action NOT IN('begin','claim','get','complete','fail') OR p_id IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store_id::text,170));
 SELECT * INTO op FROM saas.content_resource_authoring_operations WHERE id=p_id FOR UPDATE;
 IF FOUND AND (op.store_id<>p_store_id OR op.principal_id<>p_principal_id) THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;RETURN;END IF;
 IF p_action='begin' THEN
  IF saas.content_authoring_object_valid(p_data,ARRAY['requestFingerprint','sourceFingerprint','target','stage','configId','provider','model','credentialVersion','promptVersion'],ARRAY[]::text[]) IS NOT TRUE OR saas.content_resource_target_valid(p_data->'target') IS NOT TRUE OR jsonb_typeof(p_data->'requestFingerprint') IS DISTINCT FROM 'string' OR p_data->>'requestFingerprint'!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_data->'sourceFingerprint') IS DISTINCT FROM 'string' OR p_data->>'sourceFingerprint'!~'^[a-f0-9]{64}$' OR p_data->>'stage' IS NULL OR p_data->>'stage' NOT IN('outline','draft') OR p_data->>'configId' IS NULL OR p_data->>'provider' IS NULL OR p_data->>'model' IS NULL OR p_data->>'credentialVersion' IS NULL OR p_data->>'promptVersion' IS NULL OR p_data->>'model'!~'^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$' OR p_data->>'promptVersion'!~'^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF op.id IS NOT NULL THEN
   IF op.target IS DISTINCT FROM p_data->'target' OR op.stage IS DISTINCT FROM p_data->>'stage' OR op.request_fingerprint IS DISTINCT FROM p_data->>'requestFingerprint' OR op.source_fingerprint IS DISTINCT FROM p_data->>'sourceFingerprint' OR op.config_id IS DISTINCT FROM (p_data->>'configId')::uuid OR op.provider IS DISTINCT FROM p_data->>'provider' OR op.model IS DISTINCT FROM p_data->>'model' OR op.credential_version IS DISTINCT FROM (p_data->>'credentialVersion')::bigint OR op.prompt_version IS DISTINCT FROM p_data->>'promptVersion' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
   IF op.status='pending' AND op.lease_expires_at<=p_now THEN UPDATE saas.content_resource_authoring_operations SET status=CASE WHEN dispatch_state='not_dispatched' THEN 'failed' ELSE 'unknown' END,dispatch_state=CASE WHEN dispatch_state='not_dispatched' THEN 'not_dispatched' ELSE 'unknown' END,safe_code='provider_timeout',version=version+1,updated_at=p_now,finished_at=p_now WHERE id=p_id;END IF;
   RETURN QUERY SELECT CASE WHEN op.status='completed' THEN 'replayed-result' ELSE 'existing-status' END,saas.content_resource_authoring_payload(p_id);RETURN;
  END IF;
  IF p_data->'target'->>'recordId' IS NOT NULL THEN
   SELECT * INTO rec FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=(p_data->'target'->>'recordId')::uuid AND record_kind=p_data->'target'->>'kind' FOR SHARE;
   IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
   IF rec.status='archived' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
   IF rec.version<>(p_data->'target'->>'recordVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  END IF;
  SELECT * INTO cfg FROM saas.toshi_provider_configs WHERE store_id=p_store_id AND id=(p_data->>'configId')::uuid FOR SHARE;
  IF NOT FOUND OR cfg.status<>'active' THEN RETURN QUERY SELECT 'connection_revoked',NULL::jsonb;RETURN;END IF;
  IF cfg.provider<>p_data->>'provider' OR cfg.credential_version IS DISTINCT FROM (p_data->>'credentialVersion')::bigint THEN RETURN QUERY SELECT 'credential_invalid',NULL::jsonb;RETURN;END IF;
  IF NOT saas.toshi_provider_model_available(cfg.available_models,p_data->>'model') THEN RETURN QUERY SELECT 'model_unavailable',NULL::jsonb;RETURN;END IF;
  denied:=saas.content_authoring_shared_admission(p_store_id,p_principal_id,p_now);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.content_resource_authoring_operations(id,store_id,principal_id,target,stage,bound_record_id,request_fingerprint,source_fingerprint,config_id,provider,model,credential_version,prompt_version,status,lease_expires_at,created_at,updated_at) VALUES(p_id,p_store_id,p_principal_id,p_data->'target',p_data->>'stage',(p_data->'target'->>'recordId')::uuid,p_data->>'requestFingerprint',p_data->>'sourceFingerprint',cfg.id,cfg.provider,p_data->>'model',cfg.credential_version,p_data->>'promptVersion','pending',p_now+interval '60 seconds',p_now,p_now);
  RETURN QUERY SELECT 'pending',saas.content_resource_authoring_payload(p_id);RETURN;
 END IF;
 IF op.id IS NULL THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;RETURN;END IF;
 IF p_action='fail' THEN
  measured:=nullif(p_data->'usage','null'::jsonb);
  IF saas.content_authoring_object_valid(p_data,ARRAY['safeCode','dispatchState','usage'],ARRAY[]::text[]) IS NOT TRUE OR p_data->>'safeCode' IS NULL OR p_data->>'safeCode' NOT IN('invalid_input','rate_limited','quota_exceeded','provider_timeout','provider_unavailable','invalid_output','cancelled','credential_invalid','connection_revoked','model_unavailable','unavailable') OR p_data->>'dispatchState' IS NULL OR p_data->>'dispatchState' NOT IN('not_dispatched','dispatched','unknown') OR saas.content_authoring_usage_valid(p_data->'usage') IS NOT TRUE OR (measured IS NOT NULL AND (p_data->>'safeCode'<>'invalid_output' OR p_data->>'dispatchState'<>'dispatched' OR p_token IS NULL)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF op.status<>'pending' THEN
   IF p_expected_version IS NULL OR op.version::numeric<>p_expected_version::numeric+1 OR op.claim_token IS DISTINCT FROM p_token OR op.dispatch_state IS DISTINCT FROM p_data->>'dispatchState' OR op.safe_code IS DISTINCT FROM p_data->>'safeCode' OR op.status<>(CASE WHEN p_data->>'dispatchState'='unknown' THEN 'unknown' ELSE 'failed' END) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
   IF op.usage IS DISTINCT FROM measured THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
   RETURN QUERY SELECT 'failed',saas.content_resource_authoring_payload(p_id);RETURN;
  END IF;
 END IF;
 IF op.status='pending' AND op.lease_expires_at<=p_now THEN
  UPDATE saas.content_resource_authoring_operations SET status=CASE WHEN dispatch_state='not_dispatched' THEN 'failed' ELSE 'unknown' END,dispatch_state=CASE WHEN dispatch_state='not_dispatched' THEN 'not_dispatched' ELSE 'unknown' END,safe_code='provider_timeout',version=version+1,updated_at=p_now,finished_at=p_now WHERE id=p_id;
  IF p_action<>'get' THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_action='get' THEN RETURN QUERY SELECT 'found',saas.content_resource_authoring_payload(p_id);RETURN;END IF;
 IF op.status<>'pending' OR p_expected_version IS NULL OR op.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF p_action IN('claim','complete') AND op.target->>'recordId' IS NOT NULL THEN
  SELECT * INTO rec FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=(op.target->>'recordId')::uuid AND record_kind=op.target->>'kind' FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
  IF rec.status='archived' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF rec.version<>(op.target->>'recordVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_action='claim' THEN
  IF op.dispatch_state<>'not_dispatched' OR op.claim_token IS NOT NULL THEN RETURN QUERY SELECT 'dispatch_already_claimed',NULL::jsonb;RETURN;END IF;
  SELECT * INTO cfg FROM saas.toshi_provider_configs WHERE store_id=p_store_id AND id=op.config_id FOR SHARE;
  IF NOT FOUND OR cfg.status<>'active' THEN RETURN QUERY SELECT 'connection_revoked',NULL::jsonb;RETURN;END IF;
  IF cfg.credential_version<>op.credential_version THEN RETURN QUERY SELECT 'credential_invalid',NULL::jsonb;RETURN;END IF;
  IF NOT saas.toshi_provider_model_available(cfg.available_models,op.model) THEN RETURN QUERY SELECT 'model_unavailable',NULL::jsonb;RETURN;END IF;
  UPDATE saas.content_resource_authoring_operations SET dispatch_state='dispatched',claim_token=gen_random_uuid(),version=version+1,lease_expires_at=p_now+interval '60 seconds',updated_at=p_now WHERE id=p_id;
  RETURN QUERY SELECT 'claimed',saas.content_resource_authoring_payload(p_id);RETURN;
 END IF;
 IF op.claim_token IS DISTINCT FROM p_token THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF p_action='complete' THEN
  out_outline:=nullif(p_data->'outline','null'::jsonb);out_draft:=nullif(p_data->'draft','null'::jsonb);measured:=nullif(p_data->'usage','null'::jsonb);
  IF p_token IS NULL OR op.dispatch_state<>'dispatched' OR saas.content_authoring_object_valid(p_data,ARRAY['outline','draft','usage'],ARRAY[]::text[]) IS NOT TRUE OR saas.content_authoring_usage_valid(p_data->'usage') IS NOT TRUE OR (op.stage='outline' AND (out_draft IS NOT NULL OR saas.content_resource_outline_valid(out_outline) IS NOT TRUE)) OR (op.stage='draft' AND (out_outline IS NOT NULL OR saas.content_resource_draft_valid(out_draft,op.source_fingerprint) IS NOT TRUE)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  UPDATE saas.content_resource_authoring_operations SET status='completed',outline=out_outline,draft=out_draft,usage=measured,version=version+1,finished_at=p_now,updated_at=p_now WHERE id=p_id;
  RETURN QUERY SELECT 'completed',saas.content_resource_authoring_payload(p_id);RETURN;
 END IF;
 IF (op.dispatch_state='not_dispatched')<>(p_data->>'dispatchState'='not_dispatched') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 UPDATE saas.content_resource_authoring_operations SET status=CASE WHEN p_data->>'dispatchState'='unknown' THEN 'unknown' ELSE 'failed' END,dispatch_state=p_data->>'dispatchState',safe_code=p_data->>'safeCode',usage=measured,version=version+1,finished_at=p_now,updated_at=p_now WHERE id=p_id;
 RETURN QUERY SELECT 'failed',saas.content_resource_authoring_payload(p_id);
END $f$;
CREATE OR REPLACE FUNCTION saas.content_resource_authoring_begin(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_fingerprint text,p_source text,p_target jsonb,p_stage text,p_config_id uuid,p_provider text,p_model text,p_credential_version bigint,p_prompt_version text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_resource_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'begin',p_id,NULL,NULL,jsonb_build_object('requestFingerprint',p_fingerprint,'sourceFingerprint',p_source,'target',p_target,'stage',p_stage,'configId',p_config_id,'provider',p_provider,'model',p_model,'credentialVersion',p_credential_version,'promptVersion',p_prompt_version)) $f$;
CREATE OR REPLACE FUNCTION saas.content_resource_authoring_get(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_resource_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'get',p_id,NULL,NULL,'{}'::jsonb) $f$;
CREATE OR REPLACE FUNCTION saas.content_resource_authoring_claim(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_resource_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'claim',p_id,p_version,NULL,'{}'::jsonb) $f$;
CREATE OR REPLACE FUNCTION saas.content_resource_authoring_complete(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_token uuid,p_version bigint,p_outline jsonb,p_draft jsonb,p_usage jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_resource_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'complete',p_id,p_version,p_token,jsonb_build_object('outline',p_outline,'draft',p_draft,'usage',p_usage)) $f$;
CREATE OR REPLACE FUNCTION saas.content_resource_authoring_fail(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_id uuid,p_token uuid,p_version bigint,p_code text,p_dispatch_state text,p_usage jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT * FROM saas.content_resource_authoring_transition(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'fail',p_id,p_version,p_token,jsonb_build_object('safeCode',p_code,'dispatchState',p_dispatch_state,'usage',p_usage)) $f$;
CREATE TABLE IF NOT EXISTS saas.content_resource_origin_history (
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),record_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('page','blog_post')),draft_id uuid NOT NULL,
 field text NOT NULL CHECK(field IN('name','body','excerpt','seoTitle','seoDescription')),origin text NOT NULL CHECK(origin IN('manual','ai','edited_ai')),generation_id uuid REFERENCES saas.content_resource_authoring_operations(id),
 content_digest text NOT NULL,generated_content_digest text,record_version bigint NOT NULL CHECK(record_version>0),principal_id uuid NOT NULL REFERENCES saas.principals(id),created_at timestamptz NOT NULL,
 CHECK((origin='manual')=(generation_id IS NULL)),UNIQUE(store_id,record_id,record_version,field)
);
ALTER TABLE saas.content_resource_origin_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.content_resource_origin_history FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.content_resource_origin_history FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
CREATE OR REPLACE FUNCTION saas.content_resource_origin_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$ BEGIN RAISE EXCEPTION 'content_resource_history_immutable';END $f$;
DROP TRIGGER IF EXISTS content_resource_origin_immutable ON saas.content_resource_origin_history;
CREATE TRIGGER content_resource_origin_immutable BEFORE UPDATE OR DELETE ON saas.content_resource_origin_history FOR EACH ROW EXECUTE FUNCTION saas.content_resource_origin_immutable();
CREATE OR REPLACE FUNCTION saas.content_resource_binding_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.principal_id<>OLD.principal_id OR NEW.target IS DISTINCT FROM OLD.target OR NEW.stage<>OLD.stage OR NEW.request_fingerprint<>OLD.request_fingerprint OR NEW.source_fingerprint<>OLD.source_fingerprint OR NEW.config_id<>OLD.config_id OR NEW.provider<>OLD.provider OR NEW.model<>OLD.model OR NEW.credential_version<>OLD.credential_version OR NEW.prompt_version<>OLD.prompt_version OR NEW.created_at<>OLD.created_at OR (OLD.bound_record_id IS NOT NULL AND NEW.bound_record_id IS DISTINCT FROM OLD.bound_record_id)) THEN RAISE EXCEPTION 'content_resource_binding_immutable';END IF;
 IF NEW.bound_record_id IS NOT NULL AND (TG_OP='INSERT' OR OLD.bound_record_id IS DISTINCT FROM NEW.bound_record_id) AND NOT EXISTS(SELECT 1 FROM saas.merchant_admin_records WHERE id=NEW.bound_record_id AND store_id=NEW.store_id AND record_kind=NEW.target->>'kind' AND status<>'archived') THEN RAISE EXCEPTION 'content_resource_binding_invalid';END IF;
 RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS content_resource_binding ON saas.content_resource_authoring_operations;
CREATE TRIGGER content_resource_binding BEFORE INSERT OR UPDATE ON saas.content_resource_authoring_operations FOR EACH ROW EXECUTE FUNCTION saas.content_resource_binding_guard();
CREATE OR REPLACE FUNCTION saas.content_resource_resolve_origins(p_store uuid,p_actor uuid,p_record uuid,p_draft uuid,p_kind text,p_old_version bigint,p_values jsonb,p_requested jsonb,p_current jsonb,p_creating boolean) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE f text;ref jsonb;g saas.content_resource_authoring_operations%ROWTYPE;result jsonb:='{}';persisted boolean;generated jsonb;
BEGIN
 FOR f IN SELECT k FROM unnest(ARRAY['name','body','excerpt','seoTitle','seoDescription']) k ORDER BY k COLLATE "C" LOOP
  ref:=CASE WHEN p_requested?f THEN p_requested->f ELSE p_current->f END;
  IF ref IS NULL THEN CONTINUE;END IF;
  IF ref->>'state'='manual' THEN result:=result||jsonb_build_object(f,jsonb_build_object('state','manual'));CONTINUE;END IF;
  SELECT * INTO g FROM saas.content_resource_authoring_operations WHERE id=(ref->>'generationId')::uuid FOR UPDATE;
  persisted:=p_current->f->>'generationId'=g.id::text;
  IF g.id IS NULL OR g.store_id<>p_store OR g.stage<>'draft' OR g.status<>'completed' OR g.target->>'kind'<>p_kind OR NOT(g.draft->'values'?f) OR (g.bound_record_id IS NOT NULL AND g.bound_record_id<>p_record) OR (g.principal_id<>p_actor AND coalesce(persisted,false)=false) OR (coalesce(persisted,false)=false AND ((g.target->>'draftId')::uuid IS DISTINCT FROM p_draft OR (g.target->>'recordId' IS NULL AND NOT p_creating AND g.bound_record_id IS NULL) OR (g.target->>'recordId' IS NOT NULL AND ((g.target->>'recordId')::uuid<>p_record OR (g.target->>'recordVersion')::bigint IS DISTINCT FROM p_old_version)))) THEN RETURN jsonb_build_object('outcome','invalid_input');END IF;
  generated:=g.draft->'values'->f;
  result:=result||jsonb_build_object(f,jsonb_build_object('state',CASE WHEN p_values->f IS NOT DISTINCT FROM generated THEN 'ai' ELSE 'edited_ai' END,'generationId',g.id));
 END LOOP;
 RETURN jsonb_build_object('outcome','valid','origins',result);
END $f$;
CREATE OR REPLACE FUNCTION saas.content_resource_append_history(p_store uuid,p_actor uuid,p_record uuid,p_draft uuid,p_now timestamptz) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE doc jsonb;f text;ref jsonb;g saas.content_resource_authoring_operations%ROWTYPE;gen_digest text;did uuid;
BEGIN
 doc:=saas.merchant_content_document(p_store,p_record);
 FOR f,ref IN SELECT key,value FROM jsonb_each(doc->'origins') LOOP
  g:=NULL;gen_digest:=NULL;did:=coalesce(p_draft,p_record);
  IF ref->>'generationId' IS NOT NULL THEN
   SELECT * INTO g FROM saas.content_resource_authoring_operations WHERE id=(ref->>'generationId')::uuid FOR UPDATE;
   IF g.store_id IS DISTINCT FROM p_store OR g.status IS DISTINCT FROM 'completed' OR (g.bound_record_id IS NOT NULL AND g.bound_record_id<>p_record) THEN RAISE EXCEPTION 'content_resource_history_binding_invalid';END IF;
   UPDATE saas.content_resource_authoring_operations SET bound_record_id=p_record WHERE id=g.id AND bound_record_id IS NULL;
   did:=(g.target->>'draftId')::uuid;gen_digest:='sha256:'||encode(sha256(convert_to((g.draft->'values'->f)::text,'UTF8')),'hex');
  ELSIF NOT EXISTS(SELECT 1 FROM saas.content_resource_origin_history WHERE store_id=p_store AND record_id=p_record AND field=f) THEN CONTINUE;END IF;
  INSERT INTO saas.content_resource_origin_history VALUES(gen_random_uuid(),p_store,p_record,doc->>'kind',did,f,ref->>'state',g.id,'sha256:'||encode(sha256(convert_to((doc->f)::text,'UTF8')),'hex'),gen_digest,(doc->>'version')::bigint,p_actor,p_now);
 END LOOP;
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_content_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_request jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; r saas.merchant_admin_records%ROWTYPE; b saas.merchant_content_bodies%ROWTYPE; old_doc jsonb; v jsonb; origins jsonb; cfg jsonb; result jsonb; rid uuid; kind text; expected bigint; action text; body_format text; exists_record boolean;resolved jsonb; BEGIN
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'page',true);IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>262144 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store_id::text,170));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations WHERE operation_id=p_operation_id) THEN RETURN QUERY SELECT * FROM saas.merchant_content_recover_operation(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint);RETURN;END IF;
 IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_request) k)<>ARRAY['bodyAction','draftId','expectedBodyDigest','expectedVersion','kind','origins','recordId','values'] THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 kind:=p_request->>'kind';action:=p_request->>'bodyAction';v:=p_request->'values';origins:=p_request->'origins';
 IF kind IS NULL OR kind NOT IN('page','blog_post') OR action IS NULL OR action NOT IN('replace','preserve') OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(origins) IS DISTINCT FROM 'object' OR jsonb_typeof(p_request->'draftId') IS DISTINCT FROM 'string' OR p_request->>'draftId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v) k)<>ARRAY['body','excerpt','locale','name','published','seoDescription','seoTitle','slug','status'] OR EXISTS(SELECT 1 FROM jsonb_each(origins) o WHERE o.key NOT IN('name','body','excerpt','seoTitle','seoDescription') OR (o.value='{"state":"manual"}'::jsonb OR (jsonb_typeof(o.value)='object' AND o.value-ARRAY['generationId','state']='{}'::jsonb AND o.value->>'state' IN('ai','edited_ai') AND jsonb_typeof(o.value->'generationId')='string' AND o.value->>'generationId'~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')) IS DISTINCT FROM true) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(v) x WHERE (x.key IN('body','locale','name','slug','status') AND jsonb_typeof(x.value)<>'string') OR (x.key IN('excerpt','seoTitle','seoDescription') AND jsonb_typeof(x.value) NOT IN('string','null'))) OR jsonb_typeof(v->'published')<>'boolean' OR v->>'status' NOT IN('draft','active') OR (v->>'published'='true' AND v->>'status'<>'active') OR v->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR octet_length(v->>'slug')>100 OR v->>'locale'!~'^[a-z]{2,3}(-[A-Z]{2})?$' OR v->>'name'<>btrim(v->>'name') OR octet_length(v->>'name') NOT BETWEEN 1 AND 160 OR v->>'name'~'[[:cntrl:]]' OR saas.merchant_content_text_valid(v->>'body',80000) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(v) x WHERE x.key IN('name','excerpt','seoTitle','seoDescription') AND x.value IS NOT NULL AND (saas.merchant_content_text_valid(x.value,CASE WHEN x.key IN('name','seoTitle') THEN 160 ELSE 4000 END) IS DISTINCT FROM true OR x.value~U&'[\0001-\001F\007F-\009F]' OR left(x.value,1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' OR right(x.value,1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' OR x.value~*'</?[a-z!].*>')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF action='replace' AND saas.merchant_content_html_valid(v->>'body') IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_request->'recordId'='null'::jsonb THEN
  IF p_request->'expectedVersion'<>'null'::jsonb OR p_request->'expectedBodyDigest'<>'null'::jsonb OR action<>'replace' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;rid:=gen_random_uuid();
 ELSE
  IF jsonb_typeof(p_request->'recordId')<>'string' OR p_request->>'recordId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(p_request->'expectedVersion')<>'number' OR p_request->>'expectedVersion'!~'^[1-9][0-9]{0,15}$' OR (p_request->>'expectedVersion')::numeric>9007199254740991 OR jsonb_typeof(p_request->'expectedBodyDigest') IS DISTINCT FROM 'string' OR p_request->>'expectedBodyDigest'!~'^sha256:[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  rid:=(p_request->>'recordId')::uuid;expected:=(p_request->>'expectedVersion')::bigint;
 END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=rid FOR UPDATE;exists_record:=FOUND;
 IF exists_record THEN
  IF r.record_kind<>kind THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
  IF r.status='archived' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  old_doc:=saas.merchant_content_document(p_store_id,rid);
  IF r.version IS DISTINCT FROM expected OR old_doc->>'bodyDigest' IS DISTINCT FROM p_request->>'expectedBodyDigest' THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF action='preserve' AND (v->>'body' IS DISTINCT FROM old_doc->>'body' OR (origins?'body' AND origins->'body' IS DISTINCT FROM old_doc->'origins'->'body')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 ELSIF expected IS NOT NULL THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 resolved:=saas.content_resource_resolve_origins(p_store_id,p_principal_id,rid,(p_request->>'draftId')::uuid,kind,expected,v,origins,coalesce(old_doc->'origins','{}'),NOT exists_record);IF resolved->>'outcome'<>'valid' THEN RETURN QUERY SELECT resolved->>'outcome',NULL::jsonb;RETURN;END IF;origins:=resolved->'origins';
 cfg:=jsonb_build_object('slug',v->'slug','locale',v->'locale','published',v->'published');IF kind='blog_post' AND v->'excerpt'<>'null'::jsonb THEN cfg:=cfg||jsonb_build_object('excerpt',v->'excerpt');END IF;
 IF exists_record AND r.config?'body' THEN cfg:=cfg||jsonb_build_object('body',r.config->'body');END IF;
 IF NOT saas.merchant_content_route_available(p_store_id,rid,kind,cfg,v->>'status',r.config,r.status) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF exists_record THEN UPDATE saas.merchant_admin_records SET name=v->>'name',config=cfg,status=v->>'status',version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=rid;
 ELSE INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES(rid,p_store_id,kind,v->>'name',cfg,v->>'status',p_now,p_now);END IF;
 body_format:=CASE WHEN action='preserve' THEN old_doc->>'bodyFormat' ELSE 'normalized_html' END;
 INSERT INTO saas.merchant_content_bodies(store_id,record_id,version,body,body_format,origins,excerpt,seo_title,seo_description)
 SELECT p_store_id,rid,version,v->>'body',body_format,origins,v->>'excerpt',v->>'seoTitle',v->>'seoDescription' FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=rid
 ON CONFLICT(store_id,record_id) DO UPDATE SET version=excluded.version,body=excluded.body,body_format=excluded.body_format,origins=excluded.origins,excerpt=excluded.excerpt,seo_title=excluded.seo_title,seo_description=excluded.seo_description;
 PERFORM saas.content_resource_append_history(p_store_id,p_principal_id,rid,(p_request->>'draftId')::uuid,p_now);
 result:=saas.merchant_content_document(p_store_id,rid);
 PERFORM saas.merchant_content_snapshot(p_store_id,rid,p_operation_id,p_principal_id,'typed');
 cfg:=jsonb_build_object('id',rid,'kind',kind,'status',result->'status','version',result->'version','updatedAt',result->'updatedAt','bodyDigest',result->'bodyDigest','contentDomain','merchant_content');
 INSERT INTO saas.merchant_admin_events(id,store_id,record_id,record_kind,event_kind,summary,occurred_at) VALUES(p_operation_id,p_store_id,rid,kind,'saved',cfg,p_now);
 INSERT INTO saas.merchant_admin_operations VALUES(p_operation_id,p_store_id,'save',p_fingerprint,cfg,p_now);
 RETURN QUERY SELECT 'saved',result;
END
$f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint,p_kind text,p_name text,p_config jsonb,p_status text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; r saas.merchant_admin_records%ROWTYPE; b saas.merchant_content_bodies%ROWTYPE; cfg jsonb:=p_config; delegated record; resolved jsonb; BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('page','blog_post') THEN RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_content_bodies(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);RETURN;END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true);IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store_id::text,170));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN
  IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations WHERE store_id=p_store_id AND operation_id=p_operation_id AND merchant_admin_operations.result_payload->>'contentDomain'='merchant_content') THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_content_bodies(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);RETURN;
 END IF;
 IF saas.merchant_admin_config_valid(p_kind,p_config) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE;
 SELECT * INTO b FROM saas.merchant_content_bodies WHERE store_id=p_store_id AND record_id=p_record_id FOR UPDATE;
 IF FOUND THEN
  IF r.record_kind<>p_kind THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
  IF r.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  -- Preserve legacy literal metadata while requiring sidecar-backed route
  -- fields to remain readable. Refuse before the delegated generic mutation.
  IF (p_config?'slug' AND (jsonb_typeof(p_config->'slug')<>'string' OR p_config->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR octet_length(p_config->>'slug')>100))
    OR (p_config?'locale' AND (jsonb_typeof(p_config->'locale')<>'string' OR p_config->>'locale'!~'^[a-z]{2,3}(-[A-Z]{2})?$' OR octet_length(p_config->>'locale')>35))
    OR (p_config?'published' AND jsonb_typeof(p_config->'published')<>'boolean')
    OR (p_config->>'published'='true' AND (p_status IS DISTINCT FROM 'active' OR NOT (p_config?'slug'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF p_kind='blog_post' AND p_config?'excerpt' THEN
   IF jsonb_typeof(p_config->'excerpt') NOT IN('string','null') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   IF jsonb_typeof(p_config->'excerpt')='string' AND (saas.merchant_content_text_valid(p_config->>'excerpt',4000) IS DISTINCT FROM true OR p_config->>'excerpt'~U&'[\0001-\001F\007F-\009F]' OR left(p_config->>'excerpt',1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' OR right(p_config->>'excerpt',1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  END IF;
  IF p_config?'body' AND (jsonb_typeof(p_config->'body')<>'string' OR (r.config?'body' AND p_config->'body' IS DISTINCT FROM r.config->'body') OR (NOT r.config?'body' AND p_config->>'body'<>'')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  cfg:=p_config-'body';IF r.config?'body' THEN cfg:=cfg||jsonb_build_object('body',r.config->'body');END IF;
 END IF;
 IF NOT saas.merchant_content_route_available(p_store_id,p_record_id,p_kind,cfg,p_status,r.config,r.status) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF b.record_id IS NOT NULL THEN resolved:=saas.content_resource_resolve_origins(p_store_id,p_principal_id,p_record_id,NULL,p_kind,r.version,saas.merchant_content_document(p_store_id,p_record_id)||jsonb_build_object('name',p_name,'excerpt',CASE WHEN cfg?'excerpt' THEN cfg->'excerpt' ELSE to_jsonb(b.excerpt) END),'{}'::jsonb,b.origins,false);IF resolved->>'outcome'<>'valid' THEN RETURN QUERY SELECT resolved->>'outcome',NULL::jsonb;RETURN;END IF;END IF;
 SELECT * INTO delegated FROM saas.merchant_admin_save_before_content_bodies(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,cfg,p_status);
 IF delegated.outcome='saved' AND b.record_id IS NOT NULL THEN
  UPDATE saas.merchant_content_bodies SET origins=resolved->'origins',version=(delegated.result_payload->>'version')::bigint,excerpt=CASE WHEN cfg?'excerpt' THEN cfg->>'excerpt' ELSE excerpt END WHERE store_id=p_store_id AND record_id=p_record_id;
  PERFORM saas.content_resource_append_history(p_store_id,p_principal_id,p_record_id,NULL,p_now);
  PERFORM saas.merchant_content_snapshot(p_store_id,p_record_id,p_operation_id,p_principal_id,'generic');
 END IF;
 RETURN QUERY SELECT delegated.outcome,delegated.result_payload;
END
$f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_archive(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.merchant_admin_records%ROWTYPE; b saas.merchant_content_bodies%ROWTYPE; e text; delegated record; BEGIN
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id;
 IF r.record_kind IS NULL OR r.record_kind NOT IN('page','blog_post') THEN RETURN QUERY SELECT * FROM saas.merchant_admin_archive_before_content_bodies(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version);RETURN;END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,r.record_kind,true);IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store_id::text,170));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations WHERE store_id=p_store_id AND operation_id=p_operation_id AND merchant_admin_operations.result_payload->>'contentDomain'='merchant_content') THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE;
 PERFORM saas.merchant_content_route_available(p_store_id,p_record_id,r.record_kind,r.config,'archived',r.config,r.status);
 SELECT * INTO delegated FROM saas.merchant_admin_archive_before_content_bodies(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version);
 IF delegated.outcome='archived' AND EXISTS(SELECT 1 FROM saas.merchant_content_bodies WHERE store_id=p_store_id AND record_id=p_record_id) THEN
  UPDATE saas.merchant_content_bodies SET version=(delegated.result_payload->>'version')::bigint WHERE store_id=p_store_id AND record_id=p_record_id;
  PERFORM saas.content_resource_append_history(p_store_id,p_principal_id,p_record_id,NULL,p_now);
  PERFORM saas.merchant_content_snapshot(p_store_id,p_record_id,p_operation_id,p_principal_id,'archive');
 END IF;
 RETURN QUERY SELECT delegated.outcome,delegated.result_payload;
END
$f$;
DO $f$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('content_resource_compact_json_bytes','content_resource_origin_immutable','content_resource_binding_guard','content_resource_resolve_origins','content_resource_append_history','content_resource_target_valid','content_resource_outline_valid','content_resource_draft_valid','content_resource_authoring_payload','content_resource_authoring_transition','content_resource_authoring_begin','content_resource_authoring_get','content_resource_authoring_claim','content_resource_authoring_complete','content_resource_authoring_fail','content_authoring_shared_admission','content_authoring_begin_shared') LOOP
  EXECUTE 'REVOKE ALL ON FUNCTION '||f.signature||' FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator';
 END LOOP;
 FOR f IN SELECT oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('content_resource_authoring_begin','content_resource_authoring_get','content_resource_authoring_claim','content_resource_authoring_complete','content_resource_authoring_fail','content_authoring_begin_shared') LOOP EXECUTE 'GRANT EXECUTE ON FUNCTION '||f.signature||' TO celebix_saas_app';END LOOP;
END $f$;
COMMIT;
