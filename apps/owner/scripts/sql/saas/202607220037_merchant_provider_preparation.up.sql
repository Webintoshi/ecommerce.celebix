-- Phase 3G provider preparation authority. No external execution is activated here.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.merchant_admin_records
  ADD CONSTRAINT merchant_admin_records_store_id_kind_key UNIQUE(store_id,id,record_kind);

CREATE TABLE saas.merchant_provider_jobs(
  id uuid NOT NULL,
  store_id uuid NOT NULL,
  record_id uuid NOT NULL,
  record_kind text NOT NULL,
  action_kind text NOT NULL,
  status text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  requested_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  cancelled_at timestamptz,
  PRIMARY KEY(id),
  UNIQUE(store_id,id),
  FOREIGN KEY(store_id,record_id,record_kind)
    REFERENCES saas.merchant_admin_records(store_id,id,record_kind) ON DELETE RESTRICT,
  CHECK(record_kind IN('email_campaign','phone_campaign','whatsapp_campaign','marketplace_connection','invoice_integration','indexing_request')),
  CHECK(action_kind IN('delivery','synchronization','reconciliation','indexing')),
  CONSTRAINT merchant_provider_jobs_kind_action_check CHECK((record_kind IN('email_campaign','phone_campaign','whatsapp_campaign') AND action_kind='delivery') OR
        (record_kind='marketplace_connection' AND action_kind='synchronization') OR
        (record_kind='invoice_integration' AND action_kind='reconciliation') OR
        (record_kind='indexing_request' AND action_kind='indexing')),
  CHECK(status IN('awaiting_provider_activation','cancelled')),
  CHECK(version>0),
  CHECK(updated_at>=requested_at),
  CHECK((status='cancelled')=(cancelled_at IS NOT NULL))
);

CREATE TABLE saas.merchant_provider_operations(
  operation_id uuid NOT NULL,
  store_id uuid NOT NULL,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY(operation_id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(operation_kind IN('prepare','cancel')),
  CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=32768)
);

CREATE INDEX merchant_provider_jobs_list_idx
  ON saas.merchant_provider_jobs(store_id,record_kind,requested_at DESC,id DESC);
CREATE UNIQUE INDEX merchant_provider_jobs_one_waiting_idx
  ON saas.merchant_provider_jobs(store_id,record_id,action_kind)
  WHERE status='awaiting_provider_activation';

ALTER TABLE saas.merchant_provider_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.merchant_provider_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.merchant_provider_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.merchant_provider_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.merchant_provider_jobs,saas.merchant_provider_operations
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
CREATE TRIGGER merchant_provider_operations_immutable
  BEFORE UPDATE OR DELETE ON saas.merchant_provider_operations
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();

CREATE FUNCTION saas.merchant_provider_action_for_kind(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE
  WHEN p_kind IN('email_campaign','phone_campaign','whatsapp_campaign') THEN 'delivery'
  WHEN p_kind='marketplace_connection' THEN 'synchronization'
  WHEN p_kind='invoice_integration' THEN 'reconciliation'
  WHEN p_kind='indexing_request' THEN 'indexing'
  ELSE NULL END
$f$;

CREATE FUNCTION saas.merchant_provider_required_text(p_config jsonb,p_key text)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT COALESCE(pg_catalog.jsonb_typeof(p_config->p_key)='string'
   AND pg_catalog.char_length(p_config->>p_key) BETWEEN 1 AND 4000
   AND p_config->>p_key=pg_catalog.btrim(p_config->>p_key)
   AND (p_config->>p_key)!~'[[:cntrl:]]',false)
$f$;

CREATE FUNCTION saas.merchant_provider_config_ready(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT COALESCE(CASE p_kind
  WHEN 'email_campaign' THEN
    saas.merchant_provider_required_text(p_config,'subject') AND
    saas.merchant_provider_required_text(p_config,'audience') AND
    saas.merchant_provider_required_text(p_config,'content')
  WHEN 'phone_campaign' THEN
    saas.merchant_provider_required_text(p_config,'audience') AND
    saas.merchant_provider_required_text(p_config,'script')
  WHEN 'whatsapp_campaign' THEN
    saas.merchant_provider_required_text(p_config,'audience') AND
    saas.merchant_provider_required_text(p_config,'message')
  WHEN 'marketplace_connection' THEN
    saas.merchant_provider_required_text(p_config,'provider') AND
    saas.merchant_provider_required_text(p_config,'merchantReference') AND
    p_config->'syncEnabled'='true'::jsonb
  WHEN 'invoice_integration' THEN
    saas.merchant_provider_required_text(p_config,'provider') AND
    saas.merchant_provider_required_text(p_config,'accountReference') AND
    p_config->'enabled'='true'::jsonb
  WHEN 'indexing_request' THEN
    saas.merchant_provider_required_text(p_config,'reason') AND
    pg_catalog.jsonb_typeof(p_config->'urls')='array' AND
    pg_catalog.jsonb_array_length(p_config->'urls') BETWEEN 1 AND 100 AND
    NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'urls') AS url(value)
      WHERE pg_catalog.jsonb_typeof(url.value)<>'string'
         OR (url.value#>>'{}') !~ '^https://[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?:/[A-Za-z0-9._~!$&''()*+,;=:@%/-]*)?$'
         OR pg_catalog.char_length(url.value#>>'{}')>2048
    )
  ELSE false END,false)
$f$;

CREATE FUNCTION saas.merchant_provider_job_projection(p_store_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object(
   'id',j.id,'recordId',j.record_id,'recordKind',j.record_kind,
   'action',j.action_kind,'status',j.status,'version',j.version,
   'requestedAt',saas.merchant_admin_timestamp(j.requested_at),
   'updatedAt',saas.merchant_admin_timestamp(j.updated_at)
 ) FROM saas.merchant_provider_jobs j WHERE j.store_id=p_store_id AND j.id=p_id
$f$;

CREATE FUNCTION saas.merchant_provider_job_mutation_projection(p_store_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object(
   'id',j.id,'recordId',j.record_id,'recordKind',j.record_kind,
   'action',j.action_kind,'status',j.status,'version',j.version,
   'updatedAt',saas.merchant_admin_timestamp(j.updated_at)
 ) FROM saas.merchant_provider_jobs j WHERE j.store_id=p_store_id AND j.id=p_id
$f$;

CREATE FUNCTION saas.merchant_provider_list(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
 IF saas.merchant_provider_action_for_kind(p_kind) IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((
   SELECT pg_catalog.jsonb_agg(saas.merchant_provider_job_projection(p_store_id,j.id) ORDER BY j.requested_at DESC,j.id DESC)
   FROM (SELECT id,requested_at FROM saas.merchant_provider_jobs WHERE store_id=p_store_id AND record_kind=p_kind ORDER BY requested_at DESC,id DESC LIMIT 100) j
 ),'[]'::jsonb));
END $f$;

CREATE FUNCTION saas.merchant_provider_prepare(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
 p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_record_id uuid,p_expected_record_version bigint,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing_operation saas.merchant_provider_operations%ROWTYPE; source_record saas.merchant_admin_records%ROWTYPE; result jsonb; action text;
BEGIN
 action:=saas.merchant_provider_action_for_kind(p_kind);
 IF action IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_record_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.operation:'||p_operation_id::text,0));
 SELECT * INTO existing_operation FROM saas.merchant_provider_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF existing_operation.store_id<>p_store_id OR existing_operation.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',existing_operation.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO source_record FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id AND record_kind=p_kind FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 IF source_record.version<>p_expected_record_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 IF source_record.status<>'active' OR NOT saas.merchant_provider_config_ready(p_kind,source_record.config) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
 BEGIN
  INSERT INTO saas.merchant_provider_jobs(id,store_id,record_id,record_kind,action_kind,status,requested_at,updated_at)
  VALUES(p_job_id,p_store_id,p_record_id,p_kind,action,'awaiting_provider_activation',p_now,p_now);
 EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
 END;
 result:=saas.merchant_provider_job_mutation_projection(p_store_id,p_job_id);
 INSERT INTO saas.merchant_provider_operations VALUES(p_operation_id,p_store_id,'prepare',p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'prepared',result;
END $f$;

CREATE FUNCTION saas.merchant_provider_cancel(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
 p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_expected_version bigint,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing_operation saas.merchant_provider_operations%ROWTYPE; job saas.merchant_provider_jobs%ROWTYPE; result jsonb;
BEGIN
 IF saas.merchant_provider_action_for_kind(p_kind) IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.operation:'||p_operation_id::text,0));
 SELECT * INTO existing_operation FROM saas.merchant_provider_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF existing_operation.store_id<>p_store_id OR existing_operation.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',existing_operation.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO job FROM saas.merchant_provider_jobs WHERE store_id=p_store_id AND id=p_job_id AND record_kind=p_kind FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 IF job.status<>'awaiting_provider_activation' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
 IF job.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_provider_jobs SET status='cancelled',version=version+1,cancelled_at=p_now,updated_at=p_now WHERE store_id=p_store_id AND id=p_job_id;
 result:=saas.merchant_provider_job_mutation_projection(p_store_id,p_job_id);
 INSERT INTO saas.merchant_provider_operations VALUES(p_operation_id,p_store_id,'cancel',p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'cancelled',result;
END $f$;

CREATE FUNCTION saas.merchant_provider_recover_operation(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing_operation saas.merchant_provider_operations%ROWTYPE; job saas.merchant_provider_jobs%ROWTYPE;
BEGIN
 SELECT * INTO existing_operation FROM saas.merchant_provider_operations WHERE operation_id=p_operation_id AND store_id=p_store_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb; RETURN; END IF;
 SELECT * INTO job FROM saas.merchant_provider_jobs WHERE store_id=p_store_id AND id=(existing_operation.result_payload->>'id')::uuid;
 IF NOT FOUND THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,job.record_kind,false);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF existing_operation.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'operation_replayed',existing_operation.result_payload;
END $f$;

REVOKE ALL ON FUNCTION
 saas.merchant_provider_action_for_kind(text),
 saas.merchant_provider_required_text(jsonb,text),
 saas.merchant_provider_config_ready(text,jsonb),
 saas.merchant_provider_job_projection(uuid,uuid),
 saas.merchant_provider_job_mutation_projection(uuid,uuid),
 saas.merchant_provider_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
 saas.merchant_provider_prepare(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text),
 saas.merchant_provider_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),
 saas.merchant_provider_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
 FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION
 saas.merchant_provider_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
 saas.merchant_provider_prepare(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text),
 saas.merchant_provider_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text),
 saas.merchant_provider_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
 TO celebix_saas_app;
COMMIT;
