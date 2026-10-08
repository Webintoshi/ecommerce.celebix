-- Disposable restored cluster only; never run against a production service.
-- Every fixture and provider-operation simulation is rolled back. No Google API calls.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = pg_catalog, saas;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SELECT set_config('celebix.checkpoint_regression_database', :'isolated_database', true),
       set_config('celebix.checkpoint_regression_directory', :'isolated_data_directory', true);
DO $isolated_guard$
BEGIN
 IF current_database() <> current_setting('celebix.checkpoint_regression_database')
    OR current_setting('data_directory') <> current_setting('celebix.checkpoint_regression_directory')
    OR current_setting('data_directory') !~ '/celebix-google221-[^/]+/data$'
    OR current_setting('port') <> '31779'
    OR inet_server_addr() IS NOT NULL
    OR pg_is_in_recovery() THEN
  RAISE EXCEPTION 'GOOGLE_CHECKPOINT_REGRESSION_ISOLATED_AUTHORITY_INVALID';
 END IF;
END $isolated_guard$;

DO $checkpoint_test$
DECLARE
 principal uuid := '22100000-0000-4000-8000-000000000001';
 store_a uuid := '22100000-0000-4000-8000-000000000002';
 member_a uuid := '22100000-0000-4000-8000-000000000004';
 fixture_operation_id uuid := '22100000-0000-4000-8000-000000000011';
 domain_name text := 'google221a.example.test';
 bare_token text := 'checkpoint-regression-meta-token';
 plan record;
 r record;
 first_lease text;
 retry_lease text;
 claim_payload jsonb;
 requested_selection jsonb;
 final_selection jsonb;
 expected_progress jsonb;
 moment timestamptz := clock_timestamp();
BEGIN
 SELECT p.id, p.plan_code, p.version INTO plan
 FROM saas.plans p JOIN saas.plan_features f ON f.plan_id = p.id
 WHERE f.feature_key = 'integrations' AND f.enabled AND p.status = 'active'
   AND p.valid_from <= moment AND (p.valid_until IS NULL OR p.valid_until > moment)
 ORDER BY p.version DESC LIMIT 1;
 IF plan.id IS NULL THEN RAISE EXCEPTION 'GOOGLE_CHECKPOINT_FIXTURE_PLAN_MISSING'; END IF;

 INSERT INTO saas.principals VALUES
  (principal, 'https://google-checkpoint-fixture.invalid', 'google221', 'google221@example.test', true, moment, moment);
 INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
  (store_a, 'Google checkpoint fixture', 'google-fixture-221-a', 'active', 'tr', 'TRY', 'base', moment, moment);
 INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
  (member_a, principal, store_a, 'store_owner', 'active', moment, moment);
 INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
  ('22100000-0000-4000-8000-000000000006', store_a, plan.id, plan.plan_code, plan.version, 'active', moment - interval '1 day', moment, moment);
 INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at) VALUES
  ('22100000-0000-4000-8000-000000000008', store_a, domain_name, 'custom_domain', 'active', true, moment, moment, moment);

 requested_selection := jsonb_build_object('accountId','site','resourceId','https://' || domain_name || '/', 'resourceName',domain_name,'create',true);
 final_selection := requested_selection - 'create';
 claim_payload := jsonb_build_object('service','search_console','operationId',fixture_operation_id,'fingerprint',repeat('f',64),'expectedVersion',0,'selection',requested_selection,'kind','apply');

 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',claim_payload);
 IF r.outcome IS DISTINCT FROM 'claimed' OR r.result_payload->'progress' IS DISTINCT FROM '{}'::jsonb THEN
  RAISE EXCEPTION 'GOOGLE_CHECKPOINT_CLAIM_FAILED:%',r.outcome;
 END IF;
 first_lease := r.result_payload->>'leaseToken';
 IF first_lease IS NULL THEN RAISE EXCEPTION 'GOOGLE_CHECKPOINT_LEASE_MISSING'; END IF;
 expected_progress := jsonb_build_object('verificationToken',bare_token);

 -- This exact native path fails invalid_input before the precedence correction.
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'checkpoint',
  jsonb_build_object('service','search_console','operationId',fixture_operation_id,'leaseToken',first_lease,'progress',expected_progress));
 IF r.outcome IS DISTINCT FROM 'saved' THEN RAISE EXCEPTION 'GOOGLE_CHECKPOINT_FAILED:%',r.outcome; END IF;
 IF (SELECT progress FROM saas.google_marketing_operations WHERE google_marketing_operations.operation_id = fixture_operation_id) IS DISTINCT FROM expected_progress
    OR (SELECT verification_token FROM saas.google_marketing_connections WHERE store_id = store_a AND service = 'search_console') IS DISTINCT FROM bare_token
    OR saas.public_google_marketing_projection(store_a)->>'verificationToken' IS DISTINCT FROM bare_token
    OR (SELECT version FROM saas.google_marketing_connections WHERE store_id = store_a AND service = 'search_console') IS DISTINCT FROM 0::bigint
    OR (SELECT status FROM saas.google_marketing_connections WHERE store_id = store_a AND service = 'search_console') = 'connected' THEN
  RAISE EXCEPTION 'GOOGLE_CHECKPOINT_PENDING_META_NOT_PERSISTED';
 END IF;

 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'fail',
  jsonb_build_object('service','search_console','operationId',fixture_operation_id,'leaseToken',first_lease,'code','verification_pending'));
 IF r.outcome IS DISTINCT FROM 'saved'
    OR (SELECT status FROM saas.google_marketing_operations WHERE google_marketing_operations.operation_id = fixture_operation_id) IS DISTINCT FROM 'retryable'
    OR (SELECT progress FROM saas.google_marketing_operations WHERE google_marketing_operations.operation_id = fixture_operation_id) IS DISTINCT FROM expected_progress THEN
  RAISE EXCEPTION 'GOOGLE_CHECKPOINT_RETRYABLE_PROGRESS_LOST';
 END IF;

 -- Reclaim the same operation; the persisted token must survive with a new lease.
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',claim_payload);
 IF r.outcome IS DISTINCT FROM 'claimed' OR r.result_payload->'progress' IS DISTINCT FROM expected_progress THEN
  RAISE EXCEPTION 'GOOGLE_CHECKPOINT_SAME_OPERATION_RECOVERY_FAILED:%',r.outcome;
 END IF;
 retry_lease := r.result_payload->>'leaseToken';
 IF retry_lease IS NULL OR retry_lease = first_lease THEN RAISE EXCEPTION 'GOOGLE_CHECKPOINT_RETRY_LEASE_NOT_RENEWED'; END IF;
 expected_progress := expected_progress || jsonb_build_object('verified',true);
 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'checkpoint',
  jsonb_build_object('service','search_console','operationId',fixture_operation_id,'leaseToken',retry_lease,'progress',expected_progress));
 IF r.outcome IS DISTINCT FROM 'saved'
    OR (SELECT progress FROM saas.google_marketing_operations WHERE google_marketing_operations.operation_id = fixture_operation_id) IS DISTINCT FROM expected_progress THEN
  RAISE EXCEPTION 'GOOGLE_CHECKPOINT_VERIFIED_STATE_FAILED:%',r.outcome;
 END IF;

 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'finalize',
  jsonb_build_object('service','search_console','operationId',fixture_operation_id,'leaseToken',retry_lease,'selection',final_selection,'verificationToken',bare_token));
 IF r.outcome IS DISTINCT FROM 'saved' OR r.result_payload->>'version' IS DISTINCT FROM '1'
    OR r.result_payload->>'status' IS DISTINCT FROM 'connected'
    OR saas.public_google_marketing_projection(store_a)->>'verificationToken' IS DISTINCT FROM bare_token THEN
  RAISE EXCEPTION 'GOOGLE_CHECKPOINT_FINALIZE_FAILED:%',r.outcome;
 END IF;

 SELECT * INTO r FROM saas.google_marketing_command(store_a,principal,member_a,plan.id,plan.plan_code,plan.version,moment,'claim',claim_payload);
 IF r.outcome IS DISTINCT FROM 'operation_replayed' OR r.result_payload->>'version' IS DISTINCT FROM '1'
    OR (SELECT count(*) FROM saas.google_marketing_operations WHERE google_marketing_operations.operation_id = fixture_operation_id) <> 1
    OR (SELECT count(*) FROM saas.google_marketing_events WHERE google_marketing_events.operation_id = fixture_operation_id AND action = 'apply') <> 1 THEN
  RAISE EXCEPTION 'GOOGLE_CHECKPOINT_FINAL_REPLAY_DUPLICATED';
 END IF;
 RAISE NOTICE 'Google checkpoint claim, META projection, retry recovery, verified checkpoint, finalize and replay passed';
END $checkpoint_test$;
SELECT json_build_object('verified',true,'isolatedOnly',true,'checkpointAndRetryVerified',true,'providerInvoked',false,'committed',false);
ROLLBACK;
