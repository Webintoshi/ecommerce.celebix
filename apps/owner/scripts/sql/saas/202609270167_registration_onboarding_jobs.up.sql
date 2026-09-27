BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE TABLE saas.registration_authority_scopes (
 attempt_id text PRIMARY KEY REFERENCES saas.registration_workflows(attempt_id) ON DELETE RESTRICT,
 owner_origin text NOT NULL CHECK(owner_origin ~ '^https://[a-z0-9.-]+$'),
 panel_origin text NOT NULL CHECK(panel_origin ~ '^https://[a-z0-9.-]+$'),
 platform_domain_suffix text NOT NULL CHECK(platform_domain_suffix ~ '^([a-z0-9-]+\.)+[a-z]{2,}$'),
 created_at timestamptz NOT NULL
);
CREATE TABLE saas.registration_onboarding_jobs (
 attempt_id text PRIMARY KEY REFERENCES saas.registration_authority_scopes(attempt_id) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','leased','ready','attention_required')),
 due_at timestamptz NOT NULL,
 failure_count integer NOT NULL DEFAULT 0 CHECK(failure_count BETWEEN 0 AND 10),
 version bigint NOT NULL DEFAULT 1 CHECK(version>=1),
 lease_token uuid,
 lease_expires_at timestamptz,
 safe_code text NOT NULL DEFAULT 'completion_pending' CHECK(safe_code IN('access_ready','access_pending','access_unavailable','authority_invalid','completion_pending','completion_unavailable','completion_failed')),
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 CHECK((state='leased')=(lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE INDEX registration_onboarding_jobs_due ON saas.registration_onboarding_jobs(due_at) WHERE state<>'attention_required';
CREATE TABLE saas.registration_onboarding_access (
 attempt_id text PRIMARY KEY REFERENCES saas.registration_authority_scopes(attempt_id) ON DELETE RESTRICT,
 store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
 checked_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN('ready','pending','unavailable')),
 safe_code text NOT NULL CHECK(safe_code IN('access_ready','access_pending','access_unavailable','authority_invalid'))
);
CREATE TABLE saas.registration_onboarding_heartbeats (
 owner_origin text NOT NULL, panel_origin text NOT NULL, platform_domain_suffix text NOT NULL,
 checked_at timestamptz NOT NULL,
 PRIMARY KEY(owner_origin,panel_origin,platform_domain_suffix)
);
DO $tables$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['registration_authority_scopes','registration_onboarding_jobs','registration_onboarding_access','registration_onboarding_heartbeats'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',t);
 END LOOP;
END $tables$;

-- Only the transaction that inserted the original workflow can establish its authority.
-- No scanning worker, timestamp-based recovery, or ambient environment can bind a legacy row.
CREATE FUNCTION saas.bind_registration_onboarding_scope(p_attempt text,p_owner text,p_panel text,p_suffix text,p_now timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_now IS NULL OR NOT EXISTS(SELECT 1 FROM saas.registration_workflows w
  WHERE w.attempt_id=p_attempt AND w.status='awaiting_identity'
   AND w.xmin::text::bigint=pg_catalog.txid_current()%4294967296
   AND w.created_at=p_now)
 THEN RAISE EXCEPTION 'ONBOARDING_ORIGINAL_SCOPE_REQUIRED'; END IF;
 INSERT INTO saas.registration_authority_scopes VALUES(p_attempt,p_owner,p_panel,p_suffix,p_now);
END $f$;
CREATE FUNCTION saas.enqueue_registration_onboarding_job()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 INSERT INTO saas.registration_onboarding_jobs(attempt_id,due_at,created_at,updated_at)
 SELECT NEW.attempt_id,NEW.recorded_at,NEW.recorded_at,NEW.recorded_at
 FROM saas.registration_authority_scopes WHERE attempt_id=NEW.attempt_id
 ON CONFLICT(attempt_id) DO NOTHING;
 RETURN NEW;
END $f$;
CREATE TRIGGER registration_identity_onboarding_job AFTER INSERT ON saas.registration_verified_identities
 FOR EACH ROW EXECUTE FUNCTION saas.enqueue_registration_onboarding_job();

CREATE FUNCTION saas.claim_registration_onboarding_jobs(p_owner text,p_panel text,p_suffix text,p_now timestamptz,p_limit integer)
RETURNS TABLE(attempt_id text,lease_token uuid,failure_count integer,created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>25 OR p_now IS NULL THEN RAISE EXCEPTION 'ONBOARDING_INVALID_INPUT'; END IF;
 RETURN QUERY WITH due AS (
 SELECT job.attempt_id FROM saas.registration_onboarding_jobs job
 JOIN saas.registration_authority_scopes scope USING(attempt_id)
 JOIN saas.registration_verified_identities identity USING(attempt_id)
 JOIN saas.registration_workflows workflow USING(attempt_id)
 WHERE scope.owner_origin=p_owner AND scope.panel_origin=p_panel AND scope.platform_domain_suffix=p_suffix
 AND workflow.status IN('identity_verified','tenant_created','session_created')
 AND job.state<>'attention_required' AND job.due_at<=p_now
 AND (job.lease_expires_at IS NULL OR job.lease_expires_at<=p_now)
 ORDER BY job.due_at,job.attempt_id FOR UPDATE OF job SKIP LOCKED LIMIT p_limit
 ) UPDATE saas.registration_onboarding_jobs job
 SET state='leased',lease_token=pg_catalog.gen_random_uuid(),lease_expires_at=p_now+interval '60 seconds',updated_at=p_now,version=job.version+1
 FROM due WHERE job.attempt_id=due.attempt_id
 RETURNING job.attempt_id,job.lease_token,job.failure_count,job.created_at;
END $f$;

CREATE FUNCTION saas.finish_registration_onboarding_job(p_attempt text,p_owner text,p_panel text,p_suffix text,p_token uuid,p_now timestamptz,p_state text,p_code text,p_store uuid,p_checked timestamptz,p_access text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE job saas.registration_onboarding_jobs%ROWTYPE; failures integer; delay_seconds integer;
BEGIN
 IF p_now IS NULL OR p_state IS NULL OR p_state NOT IN('ready','pending','retry','attention_required')
 OR p_code IS NULL OR p_code NOT IN('access_ready','access_pending','access_unavailable','authority_invalid','completion_pending','completion_unavailable','completion_failed') THEN RAISE EXCEPTION 'ONBOARDING_INVALID_INPUT'; END IF;
 SELECT j.* INTO job FROM saas.registration_onboarding_jobs j
 JOIN saas.registration_authority_scopes scope USING(attempt_id)
 WHERE j.attempt_id=p_attempt AND scope.owner_origin=p_owner AND scope.panel_origin=p_panel AND scope.platform_domain_suffix=p_suffix
 AND j.state='leased' AND j.lease_token=p_token AND j.lease_expires_at>p_now FOR UPDATE OF j;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_store IS NOT NULL THEN
  IF p_checked IS NULL OR p_checked>p_now OR p_checked<p_now-interval '5 minutes'
   OR p_access IS NULL OR p_access NOT IN('ready','pending','unavailable')
   OR p_code NOT IN('access_ready','access_pending','access_unavailable','authority_invalid')
   OR (p_access='ready')<>(p_state='ready')
   OR NOT EXISTS(SELECT 1 FROM saas.registration_tenant_completions c
     JOIN saas.tenant_operations o ON o.id=c.tenant_operation_id
     JOIN saas.registration_workflows w ON w.attempt_id=c.attempt_id
     JOIN saas.registration_tenant_operation_proofs proof ON proof.operation_id=o.id
     WHERE c.attempt_id=p_attempt AND c.state='completed' AND o.result_store_id=p_store
       AND c.canonical_fingerprint=proof.payload_fingerprint
       AND w.tenant_idempotency_digest=proof.tenant_idempotency_digest)
  THEN RAISE EXCEPTION 'ONBOARDING_ACCESS_AUTHORITY_INVALID'; END IF;
  INSERT INTO saas.registration_onboarding_access VALUES(p_attempt,p_store,p_checked,p_access,p_code)
  ON CONFLICT(attempt_id) DO UPDATE SET store_id=excluded.store_id,checked_at=excluded.checked_at,state=excluded.state,safe_code=excluded.safe_code;
 ELSIF p_state='ready' OR p_checked IS NOT NULL OR p_access IS NOT NULL THEN RAISE EXCEPTION 'ONBOARDING_ACCESS_REQUIRED';
 END IF;
 failures:=CASE WHEN p_state='retry' THEN least(10,job.failure_count+1) WHEN p_state='ready' THEN 0 ELSE job.failure_count END;
 delay_seconds:=CASE WHEN p_state='ready' THEN 300 WHEN p_state='retry' THEN (ARRAY[15,30,60,120,300])[least(failures,5)] ELSE 15 END;
 UPDATE saas.registration_onboarding_jobs SET
 state=CASE WHEN p_state='attention_required' OR failures>=10 THEN 'attention_required' WHEN p_state='ready' THEN 'ready' ELSE 'pending' END,
 failure_count=failures,due_at=p_now+pg_catalog.make_interval(secs=>delay_seconds),lease_token=NULL,lease_expires_at=NULL,safe_code=p_code,updated_at=p_now,version=version+1
 WHERE attempt_id=p_attempt AND lease_token=p_token;
 RETURN FOUND;
END $f$;
CREATE FUNCTION saas.read_registration_onboarding_access(p_attempt text,p_owner text,p_panel text,p_suffix text,p_now timestamptz,p_store uuid DEFAULT NULL)
RETURNS SETOF saas.registration_onboarding_access LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT access.* FROM saas.registration_onboarding_access access JOIN saas.registration_authority_scopes scope USING(attempt_id)
 WHERE scope.attempt_id=p_attempt AND scope.owner_origin=p_owner AND scope.panel_origin=p_panel AND scope.platform_domain_suffix=p_suffix
 AND access.checked_at<=p_now AND access.checked_at>p_now-interval '5 minutes' AND (p_store IS NULL OR access.store_id=p_store)
$f$;
CREATE FUNCTION saas.touch_registration_onboarding_heartbeat(p_owner text,p_panel text,p_suffix text,p_now timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 INSERT INTO saas.registration_onboarding_heartbeats VALUES(p_owner,p_panel,p_suffix,p_now)
 ON CONFLICT(owner_origin,panel_origin,platform_domain_suffix) DO UPDATE SET checked_at=greatest(registration_onboarding_heartbeats.checked_at,excluded.checked_at)
$f$;
CREATE FUNCTION saas.read_registration_onboarding_health(p_owner text,p_panel text,p_suffix text,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object('workerState',CASE WHEN EXISTS(SELECT 1 FROM saas.registration_onboarding_heartbeats h
 WHERE h.owner_origin=p_owner AND h.panel_origin=p_panel AND h.platform_domain_suffix=p_suffix
 AND h.checked_at<=p_now AND h.checked_at>p_now-interval '45 seconds') THEN 'healthy' ELSE 'degraded' END,
 'pending',count(*) FILTER(WHERE j.state IN('pending','leased')),'ready',count(*) FILTER(WHERE j.state='ready'),
 'attentionRequired',count(*) FILTER(WHERE j.state='attention_required'))
 FROM saas.registration_onboarding_jobs j JOIN saas.registration_authority_scopes s USING(attempt_id)
 WHERE s.owner_origin=p_owner AND s.panel_origin=p_panel AND s.platform_domain_suffix=p_suffix
$f$;
CREATE FUNCTION saas.verify_registration_onboarding_access_proof(p_attempt text,p_owner text,p_panel text,p_suffix text,p_store uuid,p_admin text,p_storefront text,p_now timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.registration_authority_scopes scope
 JOIN saas.registration_workflows w USING(attempt_id)
 JOIN saas.registration_verified_identities identity USING(attempt_id)
 JOIN saas.registration_tenant_completions completion USING(attempt_id)
 JOIN saas.tenant_operations operation ON operation.id=completion.tenant_operation_id
 JOIN saas.registration_tenant_operation_proofs proof ON proof.operation_id=operation.id
 JOIN saas.stores store ON store.id=operation.result_store_id
 JOIN saas.store_media_namespaces media ON media.store_id=store.id
 JOIN saas.storefront_designs design ON design.store_id=store.id
 JOIN saas.store_domains storefront ON storefront.store_id=store.id AND storefront.hostname=p_storefront
 JOIN saas.admin_domains admin ON admin.store_id=store.id AND admin.hostname=p_admin
 WHERE scope.attempt_id=p_attempt AND scope.owner_origin=p_owner AND scope.panel_origin=p_panel AND scope.platform_domain_suffix=p_suffix
 AND completion.state='completed' AND completion.canonical_fingerprint=proof.payload_fingerprint
 AND identity.canonical_fingerprint=proof.payload_fingerprint AND w.tenant_idempotency_digest=proof.tenant_idempotency_digest
 AND store.id=p_store AND store.status='active'
 AND p_storefront=store.slug||'.'||p_suffix AND operation.result_payload->>'storefrontUrl'='https://'||p_storefront
 AND operation.result_payload->>'panelUrl'='https://'||p_admin
 AND media.status='active' AND media.namespace_prefix='stores/'||store.id::text||'/'
 AND design.published_version>0 AND saas.storefront_design_publishable(store.id,design.published_config)
 AND storefront.status='active' AND storefront.is_primary AND storefront.verified_at IS NOT NULL
 AND admin.status='active' AND admin.canonical AND admin.verified_at IS NOT NULL
 AND proof.subscription_valid_from<=p_now AND (proof.subscription_valid_until IS NULL OR proof.subscription_valid_until>p_now)
 AND proof.plan_valid_from<=p_now AND (proof.plan_valid_until IS NULL OR proof.plan_valid_until>p_now))
$f$;
-- Reviewed deployment authority map. These literals identify the original platform from
-- immutable committed canonical domains; they are not supplied by a scanning worker.
CREATE FUNCTION saas.backfill_registration_onboarding_jobs(p_owner text,p_panel text,p_suffix text,p_now timestamptz,p_limit integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE inserted integer;
BEGIN
 IF p_now IS NULL OR p_limit IS NULL OR p_limit<1 OR p_limit>25 THEN RAISE EXCEPTION 'ONBOARDING_INVALID_INPUT'; END IF;
 WITH reviewed(owner_origin,panel_origin,suffix) AS (VALUES
  ('https://owner.saas-staging.celebix.net','https://panel.saas-staging.celebix.net','saas-staging.celebix.net'),
  ('https://owner.saas-staging.celebix.site','https://panel.saas-staging.celebix.site','saas-staging.celebix.site')
 ), proven AS (
 SELECT w.attempt_id,map.owner_origin,map.panel_origin,map.suffix
 FROM saas.registration_workflows w JOIN saas.registration_verified_identities identity USING(attempt_id)
 JOIN saas.tenant_operations operation ON operation.payload_fingerprint=identity.canonical_fingerprint
 JOIN saas.registration_tenant_operation_proofs proof ON proof.operation_id=operation.id AND proof.tenant_idempotency_digest=w.tenant_idempotency_digest
 JOIN saas.stores store ON store.id=operation.result_store_id
 JOIN reviewed map ON operation.result_payload->>'storefrontUrl'='https://'||store.slug||'.'||map.suffix
  AND operation.result_payload->>'panelUrl'='https://'||store.slug||'.admin.'||map.suffix
 JOIN saas.admin_domains admin ON admin.store_id=store.id AND admin.hostname=store.slug||'.admin.'||map.suffix
  AND admin.canonical AND admin.status='active' AND admin.verified_at IS NOT NULL
 JOIN saas.store_domains domain ON domain.store_id=store.id AND domain.hostname=store.slug||'.'||map.suffix
  AND domain.is_primary AND domain.status='active' AND domain.verified_at IS NOT NULL
 WHERE map.owner_origin=p_owner AND map.panel_origin=p_panel AND map.suffix=p_suffix
 AND w.status IN('identity_verified','tenant_created','session_created')
 AND NOT EXISTS(SELECT 1 FROM saas.registration_authority_scopes existing WHERE existing.attempt_id=w.attempt_id)
 ORDER BY w.created_at,w.attempt_id LIMIT p_limit
 ), bound AS (
 INSERT INTO saas.registration_authority_scopes(attempt_id,owner_origin,panel_origin,platform_domain_suffix,created_at)
 SELECT attempt_id,owner_origin,panel_origin,suffix,p_now FROM proven ON CONFLICT(attempt_id) DO NOTHING RETURNING attempt_id
 ) INSERT INTO saas.registration_onboarding_jobs(attempt_id,due_at,created_at,updated_at)
 SELECT attempt_id,p_now,p_now,p_now FROM bound ON CONFLICT(attempt_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 RETURN inserted;
END $f$;
CREATE FUNCTION saas.read_registration_onboarding_tenant(p_attempt text,p_owner text,p_panel text,p_suffix text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT operation.result_payload FROM saas.registration_authority_scopes scope
 JOIN saas.registration_workflows w USING(attempt_id)
 JOIN saas.registration_verified_identities identity USING(attempt_id)
 JOIN saas.registration_tenant_completions completion USING(attempt_id)
 JOIN saas.tenant_operations operation ON operation.id=completion.tenant_operation_id
 JOIN saas.registration_tenant_operation_proofs proof ON proof.operation_id=operation.id
 WHERE scope.attempt_id=p_attempt AND scope.owner_origin=p_owner AND scope.panel_origin=p_panel AND scope.platform_domain_suffix=p_suffix
 AND w.status IN('tenant_created','session_created') AND completion.state='completed'
 AND completion.canonical_fingerprint=proof.payload_fingerprint AND identity.canonical_fingerprint=proof.payload_fingerprint
 AND w.tenant_idempotency_digest=proof.tenant_idempotency_digest
$f$;
CREATE FUNCTION saas.list_registration_onboarding_operations(p_owner text,p_panel text,p_suffix text,p_now timestamptz,p_limit integer)
RETURNS TABLE(attempt_id text,state text,safe_code text,failure_count integer,due_at timestamptz,created_at timestamptz,updated_at timestamptz,version bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_now IS NULL OR p_limit IS NULL OR p_limit<1 OR p_limit>50 THEN RAISE EXCEPTION 'ONBOARDING_INVALID_INPUT'; END IF;
 RETURN QUERY SELECT j.attempt_id,j.state,j.safe_code,j.failure_count,j.due_at,j.created_at,j.updated_at,j.version
 FROM saas.registration_onboarding_jobs j JOIN saas.registration_authority_scopes s USING(attempt_id)
 WHERE s.owner_origin=p_owner AND s.panel_origin=p_panel AND s.platform_domain_suffix=p_suffix
 ORDER BY (j.state='ready'),j.created_at,j.attempt_id LIMIT p_limit;
END $f$;
CREATE FUNCTION saas.retry_registration_onboarding_job(p_attempt text,p_owner text,p_panel text,p_suffix text,p_version bigint,p_now timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE job saas.registration_onboarding_jobs%ROWTYPE;
BEGIN
 IF p_now IS NULL OR p_version IS NULL OR p_version<1 THEN RAISE EXCEPTION 'ONBOARDING_INVALID_INPUT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.registration_authority_scopes s WHERE s.attempt_id=p_attempt
 AND s.owner_origin=p_owner AND s.panel_origin=p_panel AND s.platform_domain_suffix=p_suffix) THEN RETURN 'conflict'; END IF;
 -- Same immutable completion lease as Tenant Core. A nonblocking transaction lock
 -- also closes the race after the service's read; it never steals a session lock.
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_attempt,2607120012)) THEN RETURN 'busy'; END IF;
 SELECT j.* INTO job FROM saas.registration_onboarding_jobs j
 JOIN saas.registration_authority_scopes s USING(attempt_id)
 JOIN saas.registration_verified_identities identity USING(attempt_id)
 JOIN saas.registration_workflows w USING(attempt_id)
 WHERE j.attempt_id=p_attempt AND s.owner_origin=p_owner AND s.panel_origin=p_panel AND s.platform_domain_suffix=p_suffix
 AND w.status IN('identity_verified','tenant_created','session_created') FOR UPDATE OF j;
 IF NOT FOUND OR job.version<>p_version THEN RETURN 'conflict'; END IF;
 IF job.state='leased' AND job.lease_expires_at>p_now THEN RETURN 'busy'; END IF;
 IF job.state='ready' THEN RETURN 'conflict'; END IF;
 UPDATE saas.registration_onboarding_jobs SET state='pending',failure_count=0,due_at=p_now,
 lease_token=NULL,lease_expires_at=NULL,safe_code='completion_pending',updated_at=p_now,version=version+1
 WHERE attempt_id=p_attempt AND version=p_version;
 RETURN CASE WHEN FOUND THEN 'queued' ELSE 'conflict' END;
END $f$;
DO $grants$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='saas' AND p.proname IN('bind_registration_onboarding_scope','enqueue_registration_onboarding_job','claim_registration_onboarding_jobs','finish_registration_onboarding_job','read_registration_onboarding_access','touch_registration_onboarding_heartbeat','read_registration_onboarding_health','verify_registration_onboarding_access_proof','backfill_registration_onboarding_jobs','read_registration_onboarding_tenant','list_registration_onboarding_operations','retry_registration_onboarding_job') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',f);
  IF f::text NOT LIKE '%enqueue_registration_onboarding_job%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_identity',f); END IF;
 END LOOP;
END $grants$;
COMMIT;
