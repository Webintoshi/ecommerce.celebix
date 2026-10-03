-- Execute ONLY in isolated full production-schema clone. All fixture changes roll back.
BEGIN;
DO $test$
DECLARE actor uuid:='21100000-0000-4000-8000-000000000001';op uuid:='21100000-0000-4000-8000-000000000002';job saas.registration_onboarding_jobs; r jsonb;r2 jsonb;n bigint;ineligible text:='attempt_test211_ineligible0001';
BEGIN
 IF has_function_privilege('public','saas.platform_operations_read(uuid,jsonb)','EXECUTE') OR has_function_privilege('celebix_saas_app','saas.platform_operations_retry(uuid,jsonb,bigint,text)','EXECUTE') THEN RAISE EXCEPTION 'OPERATIONS_AUTHORITY_TOO_WIDE'; END IF;
 INSERT INTO saas.principals VALUES(actor,'https://fixture211.invalid','operator211','sdkahmetcelebi@icloud.com',true,now(),now());
 INSERT INTO saas.platform_operators(id,issuer,subject,principal_id,email,active) VALUES(op,'https://fixture211.invalid','operator211',actor,'sdkahmetcelebi@icloud.com',true);
 SELECT count(*) INTO n FROM saas.platform_audit;
 r:=saas.platform_operations_read(op,'{}');
 IF r->>'available'<>'true' OR jsonb_typeof(r->'items')<>'array' OR (SELECT count(*) FROM saas.platform_audit)<>n THEN RAISE EXCEPTION 'OPERATIONS_READ_MUTATED_DATA'; END IF;
 SELECT j.* INTO job FROM saas.registration_onboarding_jobs j JOIN saas.registration_verified_identities i USING(attempt_id) JOIN saas.registration_workflows w USING(attempt_id) WHERE w.status IN('identity_verified','tenant_created','session_created') LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'ISOLATED_REGISTRATION_FIXTURE_REQUIRED'; END IF;
 UPDATE saas.registration_onboarding_jobs SET state='attention_required',lease_token=NULL,lease_expires_at=NULL WHERE attempt_id=job.attempt_id;
 r:=saas.platform_operations_read(op,'{}');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'items') row WHERE row->>'jobId'=job.attempt_id AND row->>'canRetry'='true' AND row->>'retryable'='true') THEN RAISE EXCEPTION 'ELIGIBLE_RETRY_NOT_EXPOSED'; END IF;
 UPDATE saas.registration_onboarding_jobs SET state='leased',lease_token='21100000-0000-4000-8000-000000000003',lease_expires_at=now()+interval '1 minute' WHERE attempt_id=job.attempt_id;
 r:=saas.platform_operations_read(op,'{}');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'items') row WHERE row->>'jobId'=job.attempt_id AND (row->>'canRetry'='true' OR row->>'retryable'='true')) THEN RAISE EXCEPTION 'ACTIVE_LEASE_RETRY_EXPOSED'; END IF;
 BEGIN PERFORM saas.platform_operations_retry(op,jsonb_build_object('jobId',job.attempt_id),job.version,'retry-211-leased');RAISE EXCEPTION 'ACTIVE_LEASE_RETRY_ACCEPTED';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'operation_busy' THEN RAISE;END IF;END;
 UPDATE saas.registration_onboarding_jobs SET lease_expires_at=now()-interval '1 minute' WHERE attempt_id=job.attempt_id;
 r:=saas.platform_operations_read(op,'{}');
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'items') row WHERE row->>'jobId'=job.attempt_id AND row->>'canRetry'='true') THEN RAISE EXCEPTION 'EXPIRED_LEASE_RETRY_NOT_EXPOSED'; END IF;
 INSERT INTO saas.registration_workflows(attempt_id,state_digest,payload_ciphertext,payload_iv,encryption_key_id,payload_schema_version,status,requested_at,created_at,updated_at,expires_at,tenant_idempotency_digest)
 VALUES(ineligible,repeat('1',64),decode(repeat('01',32),'hex'),decode(repeat('02',12),'hex'),'fixture211',1,'awaiting_identity',now(),now(),now(),now()+interval '1 hour',repeat('2',64));
 PERFORM saas.bind_registration_onboarding_scope(ineligible,'https://owner.fixture211.invalid','https://panel.fixture211.invalid','fixture211.invalid',now());
 INSERT INTO saas.registration_onboarding_jobs(attempt_id,due_at,created_at,updated_at) VALUES(ineligible,now(),now(),now());
 r:=saas.platform_operations_read(op,'{}');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'items') row WHERE row->>'jobId'=ineligible AND (row->>'canRetry'='true' OR row->>'retryable'='true')) THEN RAISE EXCEPTION 'INELIGIBLE_WORKFLOW_RETRY_EXPOSED'; END IF;
 BEGIN PERFORM saas.platform_operations_retry(op,jsonb_build_object('jobId',ineligible),1,'retry-211-ineligible');RAISE EXCEPTION 'INELIGIBLE_WORKFLOW_RETRY_ACCEPTED';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'version_conflict' THEN RAISE;END IF;END;
 r:=saas.platform_operations_retry(op,jsonb_build_object('jobId',job.attempt_id),job.version,'retry-211-native');
 r2:=saas.platform_operations_retry(op,jsonb_build_object('jobId',job.attempt_id),job.version,'retry-211-native');
 IF r->>'outcome'<>'committed' OR r2->>'outcome'<>'replayed' OR (SELECT count(*) FROM saas.platform_audit)<>n+1 OR (SELECT version FROM saas.registration_onboarding_jobs WHERE attempt_id=job.attempt_id)<>job.version+1 THEN RAISE EXCEPTION 'RETRY_NOT_ATOMIC_IDEMPOTENT'; END IF;
 BEGIN PERFORM saas.platform_operations_retry(op,jsonb_build_object('jobId',job.attempt_id),job.version,'retry-211-stale');RAISE EXCEPTION 'STALE_RETRY_ACCEPTED';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'version_conflict' THEN RAISE;END IF;END;
 UPDATE saas.platform_operators SET active=false WHERE id=op;
 BEGIN PERFORM saas.platform_operations_read(op,'{}');RAISE EXCEPTION 'INACTIVE_OPERATOR_ACCEPTED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $test$;
ROLLBACK;
