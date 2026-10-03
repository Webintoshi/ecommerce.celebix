-- Optional variant stock alerts: one-time consent, private outbox and automatic shared delivery.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $ready$
BEGIN
 IF to_regclass('saas.restock_alerts_207_backup') IS NOT NULL
  OR to_regprocedure('saas.public_restock_alerts_get(text,timestamptz)') IS NOT NULL
  OR to_regprocedure('saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NULL
  OR to_regprocedure('saas.merchant_admin_config_valid(text,jsonb)') IS NULL
  OR to_regprocedure('saas.store_policy_public_store(text,timestamptz)') IS NULL
  THEN RAISE EXCEPTION 'RESTOCK_ALERTS_207_PREDECESSOR_INVALID'; END IF;
END $ready$;

CREATE TABLE saas.restock_alerts_207_backup(identity text PRIMARY KEY,definition text NOT NULL,migrated_definition text,function_owner oid,function_acl text);
ALTER TABLE saas.restock_alerts_207_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.restock_alerts_207_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE saas.restock_alerts_207_backup FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

-- Keep the original function OIDs, owners and ACLs; private predecessor copies
-- retain all current content-authoring, SKU, delivery and campaign behavior.
DO $backup$
DECLARE row record; original text; cloned text; clone_name text;
BEGIN
 FOR row IN SELECT p.oid,p.proname,p.proargtypes,p.proowner,p.proacl FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace
  AND p.proname IN('merchant_admin_required_action','merchant_admin_config_valid','merchant_admin_list','merchant_admin_list_events','merchant_admin_get_record','merchant_admin_save') LOOP
  original:=pg_get_functiondef(row.oid);clone_name:=row.proname||'_before_restock_alerts_207';
  IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname=clone_name) THEN RAISE EXCEPTION 'RESTOCK_ALERTS_207_PRIVATE_PREDECESSOR_EXISTS'; END IF;
  cloned:=replace(original,'CREATE OR REPLACE FUNCTION saas.'||row.proname||'(','CREATE FUNCTION saas.'||clone_name||'(');
  IF cloned=original THEN RAISE EXCEPTION 'RESTOCK_ALERTS_207_DEFINITION_ANCHOR_INVALID'; END IF;
  -- A combined release may inherit saas in search_path; keep identities portable
  -- so a later assertions or rollback connection resolves the same functions.
  INSERT INTO saas.restock_alerts_207_backup VALUES(format('saas.%I(%s)',row.proname,oidvectortypes(row.proargtypes)),original,NULL,row.proowner,row.proacl::text);
  EXECUTE cloned;
  EXECUTE format('ALTER FUNCTION saas.%I(%s) OWNER TO %I',clone_name,pg_get_function_identity_arguments(row.oid),pg_get_userbyid(row.proowner));
  EXECUTE format('REVOKE ALL ON FUNCTION saas.%I(%s) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',clone_name,pg_get_function_identity_arguments(row.oid));
 END LOOP;
 IF (SELECT count(*) FROM saas.restock_alerts_207_backup)<>6 THEN RAISE EXCEPTION 'RESTOCK_ALERTS_207_PREDECESSOR_COUNT_INVALID'; END IF;
 SELECT pg_get_constraintdef(oid) INTO original FROM pg_constraint WHERE conrelid='saas.merchant_admin_records'::regclass AND conname='merchant_admin_records_record_kind_check';
 IF original IS NULL OR original NOT LIKE '%starter_theme_composition%' OR original LIKE '%restock_alerts%' THEN RAISE EXCEPTION 'RESTOCK_ALERTS_207_KIND_CONSTRAINT_INVALID'; END IF;
 INSERT INTO saas.restock_alerts_207_backup VALUES('constraint:merchant_admin_records_record_kind_check',original,NULL,NULL,NULL);
 EXECUTE 'ALTER TABLE saas.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check';
 EXECUTE 'ALTER TABLE saas.merchant_admin_records ADD CONSTRAINT merchant_admin_records_record_kind_check CHECK(record_kind=''restock_alerts'' OR ('||substring(original FROM 8 FOR char_length(original)-8)||'))';
END $backup$;
CREATE UNIQUE INDEX merchant_admin_restock_alerts_singleton_207 ON saas.merchant_admin_records(store_id) WHERE record_kind='restock_alerts' AND status<>'archived';

CREATE FUNCTION saas.restock_alerts_config_valid(p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT saas.catalog_onboarding_json_exact(p_config,ARRAY['schemaVersion','enabled','title','buttonLabel'],ARRAY[]::text[])
 AND p_config->'schemaVersion'='1'::jsonb AND jsonb_typeof(p_config->'enabled')='boolean'
 AND saas.contact_widget_text_valid(p_config->'title',1,80) AND saas.contact_widget_text_valid(p_config->'buttonLabel',1,32)
$f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_required_action(p_kind text,p_mutation boolean)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_kind='restock_alerts' THEN CASE WHEN p_mutation THEN 'configuration.manage' ELSE 'configuration.read' END ELSE saas.merchant_admin_required_action_before_restock_alerts_207(p_kind,p_mutation) END
$f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE STRICT SET search_path=pg_catalog,saas AS $f$
BEGIN
 RETURN CASE WHEN p_kind='restock_alerts' THEN saas.restock_alerts_config_valid(p_config) ELSE saas.merchant_admin_config_valid_before_restock_alerts_207(p_kind,p_config) END;
END $f$;

CREATE TABLE saas.restock_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),store_id uuid NOT NULL,product_id uuid NOT NULL,variant_id uuid NOT NULL,
 email text,email_hash text NOT NULL,confirm_token text UNIQUE,cancel_token text NOT NULL UNIQUE,
 generation integer NOT NULL DEFAULT 1,state text NOT NULL CHECK(state IN('awaiting_confirmation','confirmed','notified','cancelled','expired')),
 consent_version text NOT NULL DEFAULT 'stock-alert-v1',created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,confirmed_at timestamptz,
 UNIQUE(store_id,variant_id,email_hash),FOREIGN KEY(store_id,product_id,variant_id) REFERENCES saas.product_variants(store_id,product_id,id) ON DELETE RESTRICT,
 CHECK(email_hash~'^[a-f0-9]{64}$'),CHECK(cancel_token~'^[A-Za-z0-9_-]{43}$'),CHECK(confirm_token IS NULL OR confirm_token~'^[A-Za-z0-9_-]{43}$')
);
CREATE INDEX restock_waiting_variant_207 ON saas.restock_subscriptions(store_id,variant_id,updated_at) WHERE state='confirmed';
CREATE TABLE saas.restock_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid NOT NULL REFERENCES saas.restock_subscriptions(id),generation integer NOT NULL,
 kind text NOT NULL CHECK(kind IN('confirmation','stock')),state text NOT NULL CHECK(state IN('queued','leased','accepted','failed','cancelled')),
 payload jsonb,created_at timestamptz NOT NULL,next_attempt_at timestamptz NOT NULL,first_attempt_at timestamptz,attempts integer NOT NULL DEFAULT 0,
 lease_id uuid,worker_id text,lease_expires_at timestamptz,error_code text,UNIQUE(subscription_id,generation,kind)
);
CREATE INDEX restock_queue_207 ON saas.restock_deliveries(next_attempt_at,created_at) WHERE state IN('queued','leased');
CREATE TABLE saas.restock_request_limits(store_id uuid NOT NULL,client_hash text NOT NULL,bucket timestamptz NOT NULL,requests integer NOT NULL,PRIMARY KEY(store_id,client_hash,bucket));
ALTER TABLE saas.restock_subscriptions ENABLE ROW LEVEL SECURITY;ALTER TABLE saas.restock_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.restock_deliveries ENABLE ROW LEVEL SECURITY;ALTER TABLE saas.restock_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.restock_request_limits ENABLE ROW LEVEL SECURITY;ALTER TABLE saas.restock_request_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.restock_subscriptions,saas.restock_deliveries,saas.restock_request_limits FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

-- All inventory holds, including current online and POS reservations, are counted.
CREATE FUNCTION saas.restock_variant_available(p_store uuid,p_variant uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce((SELECT p.status='active' AND v.status='active' AND (NOT v.stock_tracking OR v.stock_quantity-saas.in_store_held_quantity(p_store,v.id,NULL,NULL)>0)
 FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id WHERE v.store_id=p_store AND v.id=p_variant),false)
$f$;
CREATE FUNCTION saas.restock_enabled(p_store uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.stores s JOIN saas.merchant_admin_records r ON r.store_id=s.id WHERE s.id=p_store AND s.status='active' AND r.record_kind='restock_alerts' AND r.status='active' AND r.config->'enabled'='true'::jsonb AND saas.restock_alerts_config_valid(r.config))
$f$;
CREATE FUNCTION saas.public_restock_alerts_get(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE st uuid;config jsonb;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 st:=saas.store_policy_public_store(p_hostname,p_now);IF st IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT r.config INTO config FROM saas.merchant_admin_records r WHERE r.store_id=st AND r.record_kind='restock_alerts' AND r.status='active' AND r.config->'enabled'='true'::jsonb AND saas.restock_alerts_config_valid(r.config);
 RETURN QUERY SELECT 'ok',jsonb_build_object('storeId',st,'config',config);
END $f$;
CREATE FUNCTION saas.restock_subscribe(p_hostname text,p_variant uuid,p_email text,p_client_hash text,p_confirm_token text,p_cancel_token text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE st uuid;variant saas.product_variants;sub saas.restock_subscriptions;email_digest text;quota integer;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_variant IS NULL OR p_client_hash IS NULL OR p_client_hash!~'^[a-f0-9]{64}$' OR p_confirm_token IS NULL OR p_confirm_token!~'^[A-Za-z0-9_-]{43}$' OR p_cancel_token IS NULL OR p_cancel_token!~'^[A-Za-z0-9_-]{43}$'
 OR p_email IS NULL OR p_email<>lower(btrim(p_email)) OR char_length(p_email)>254 OR char_length(split_part(p_email,'@',1))>64
 OR p_email!~$regex$^[A-Za-z0-9!#$%&'*+/=^_`{|}~-]+([.][A-Za-z0-9!#$%&'*+/=^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$$regex$ THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 st:=saas.store_policy_public_store(p_hostname,p_now);
 -- Identical replies for disabled tools, cross-store IDs, duplicates and rate limits.
 IF st IS NULL OR NOT saas.restock_enabled(st) THEN RETURN QUERY SELECT 'ok',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.restock_request_limits VALUES(st,p_client_hash,date_trunc('hour',p_now),1) ON CONFLICT(store_id,client_hash,bucket) DO UPDATE SET requests=saas.restock_request_limits.requests+1 RETURNING requests INTO quota;
 IF quota>10 THEN RETURN QUERY SELECT 'ok',NULL::jsonb;RETURN;END IF;
 SELECT v.* INTO variant FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id WHERE v.store_id=st AND v.id=p_variant AND v.status='active' AND v.stock_tracking AND p.status='active';
 IF NOT FOUND OR saas.restock_variant_available(st,p_variant) THEN RETURN QUERY SELECT 'ok',NULL::jsonb;RETURN;END IF;
 email_digest:=encode(sha256(convert_to(p_email,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('restock-email:'||st::text||':'||email_digest,207));
 IF EXISTS(SELECT 1 FROM saas.restock_subscriptions s WHERE s.store_id=st AND s.email_hash=email_digest AND s.updated_at>p_now-interval '1 hour' AND s.variant_id<>p_variant) THEN RETURN QUERY SELECT 'ok',NULL::jsonb;RETURN;END IF;
 SELECT * INTO sub FROM saas.restock_subscriptions s WHERE s.store_id=st AND s.variant_id=p_variant AND s.email_hash=email_digest FOR UPDATE;
 IF FOUND THEN
  IF sub.state='confirmed' OR sub.state='awaiting_confirmation' AND sub.updated_at>p_now-interval '24 hours' OR sub.updated_at>p_now-interval '1 hour' THEN RETURN QUERY SELECT 'ok',NULL::jsonb;RETURN;END IF;
  UPDATE saas.restock_deliveries SET state='cancelled',payload=NULL,lease_id=NULL,lease_expires_at=NULL WHERE subscription_id=sub.id AND state IN('queued','leased');
  UPDATE saas.restock_subscriptions SET email=p_email,confirm_token=p_confirm_token,cancel_token=p_cancel_token,generation=generation+1,state='awaiting_confirmation',updated_at=p_now,confirmed_at=NULL WHERE id=sub.id RETURNING * INTO sub;
 ELSE
  INSERT INTO saas.restock_subscriptions(store_id,product_id,variant_id,email,email_hash,confirm_token,cancel_token,state,created_at,updated_at) VALUES(st,variant.product_id,p_variant,p_email,email_digest,p_confirm_token,p_cancel_token,'awaiting_confirmation',p_now,p_now) RETURNING * INTO sub;
 END IF;
 INSERT INTO saas.restock_deliveries(subscription_id,generation,kind,state,created_at,next_attempt_at) VALUES(sub.id,sub.generation,'confirmation','queued',p_now,p_now);
 RETURN QUERY SELECT 'ok',NULL::jsonb;
END $f$;
CREATE FUNCTION saas.restock_manage(p_hostname text,p_token text,p_action text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE st uuid;sub saas.restock_subscriptions;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true OR p_action IS NULL OR p_action NOT IN('confirm','cancel') OR p_token IS NULL OR p_token!~'^[A-Za-z0-9_-]{43}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 st:=saas.store_policy_public_store(p_hostname,p_now);
 SELECT * INTO sub FROM saas.restock_subscriptions s WHERE s.store_id=st AND (p_action='confirm' AND s.confirm_token=p_token OR p_action='cancel' AND s.cancel_token=p_token) FOR UPDATE;
 IF FOUND THEN
  IF p_action='cancel' THEN UPDATE saas.restock_subscriptions SET state='cancelled',email=NULL,confirm_token=NULL,updated_at=p_now WHERE id=sub.id;
   UPDATE saas.restock_deliveries SET state='cancelled',payload=NULL,lease_id=NULL,lease_expires_at=NULL WHERE subscription_id=sub.id AND state IN('queued','leased');
  ELSIF sub.state='awaiting_confirmation' AND sub.updated_at>p_now-interval '24 hours' AND saas.restock_enabled(st) THEN UPDATE saas.restock_subscriptions SET state='confirmed',confirmed_at=p_now,confirm_token=NULL,updated_at=p_now WHERE id=sub.id;END IF;
 END IF;
 RETURN QUERY SELECT 'ok',NULL::jsonb;
END $f$;
CREATE FUNCTION saas.restock_claim(p_now timestamptz,p_worker text,p_limit integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE ids uuid[];lease uuid:=gen_random_uuid();
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_worker IS NULL OR p_worker!~'^[A-Za-z0-9._-]{1,128}$' OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 DELETE FROM saas.restock_request_limits WHERE (store_id,client_hash,bucket) IN(SELECT store_id,client_hash,bucket FROM saas.restock_request_limits WHERE bucket<p_now-interval '2 days' LIMIT 500);
 UPDATE saas.restock_subscriptions SET state='expired',email=NULL,confirm_token=NULL,updated_at=p_now WHERE id IN(SELECT id FROM saas.restock_subscriptions WHERE state='awaiting_confirmation' AND updated_at<=p_now-interval '24 hours' LIMIT 100);
 UPDATE saas.restock_subscriptions SET state='expired',email=NULL,confirm_token=NULL,updated_at=p_now WHERE id IN(SELECT id FROM saas.restock_subscriptions WHERE state='confirmed' AND confirmed_at<=p_now-interval '180 days' LIMIT 100);
 UPDATE saas.restock_deliveries SET state='cancelled',payload=NULL,lease_id=NULL,lease_expires_at=NULL WHERE id IN(SELECT d.id FROM saas.restock_deliveries d JOIN saas.restock_subscriptions s ON s.id=d.subscription_id WHERE d.state IN('queued','leased') AND s.state IN('cancelled','expired') LIMIT 100);
 UPDATE saas.restock_deliveries SET state='failed',error_code='idempotency_window_expired',payload=NULL,lease_id=NULL,lease_expires_at=NULL WHERE id IN(SELECT id FROM saas.restock_deliveries WHERE state IN('queued','leased') AND first_attempt_at IS NOT NULL AND first_attempt_at<=p_now-interval '24 hours' LIMIT 100);
 INSERT INTO saas.restock_deliveries(subscription_id,generation,kind,state,created_at,next_attempt_at)
 SELECT s.id,s.generation,'stock','queued',p_now,p_now FROM saas.restock_subscriptions s WHERE s.state='confirmed' AND s.confirmed_at>p_now-interval '180 days' AND saas.restock_enabled(s.store_id) AND saas.restock_variant_available(s.store_id,s.variant_id)
 AND NOT EXISTS(SELECT 1 FROM saas.restock_deliveries d WHERE d.subscription_id=s.id AND d.generation=s.generation AND d.kind='stock') ORDER BY s.updated_at LIMIT 100 ON CONFLICT DO NOTHING;
 SELECT array_agg(id) INTO ids FROM (SELECT d.id FROM saas.restock_deliveries d JOIN saas.restock_subscriptions s ON s.id=d.subscription_id AND s.generation=d.generation
 WHERE (d.state='queued' OR d.state='leased' AND d.lease_expires_at<=p_now) AND d.next_attempt_at<=p_now AND (d.first_attempt_at IS NULL OR d.first_attempt_at>p_now-interval '24 hours') AND saas.restock_enabled(s.store_id)
 AND (d.kind='confirmation' AND s.state='awaiting_confirmation' AND s.updated_at>p_now-interval '24 hours' OR d.kind='stock' AND s.state='confirmed' AND s.confirmed_at>p_now-interval '180 days' AND saas.restock_variant_available(s.store_id,s.variant_id))
 ORDER BY d.next_attempt_at,d.created_at,d.id LIMIT p_limit FOR UPDATE OF d SKIP LOCKED) selected;
 UPDATE saas.restock_deliveries SET state='leased',lease_id=lease,worker_id=p_worker,lease_expires_at=p_now+interval '90 seconds' WHERE id=ANY(ids);
 RETURN QUERY SELECT 'ok',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'leaseId',lease)) FROM saas.restock_deliveries d WHERE d.id=ANY(ids)),'[]'::jsonb);
END $f$;
CREATE FUNCTION saas.restock_authorize(p_id uuid,p_lease uuid,p_worker text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE d saas.restock_deliveries;s saas.restock_subscriptions;host text;store_name text;product_title text;variant_title text;slug text;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO d FROM saas.restock_deliveries WHERE id=p_id AND state='leased' AND lease_id=p_lease AND worker_id=p_worker AND lease_expires_at>p_now;
 IF NOT FOUND THEN RETURN QUERY SELECT 'ok',NULL::jsonb;RETURN;END IF;
 -- Subscription before delivery follows the same order as cancel/renew/finish.
 SELECT * INTO s FROM saas.restock_subscriptions WHERE id=d.subscription_id FOR SHARE;
 SELECT * INTO d FROM saas.restock_deliveries WHERE id=p_id AND state='leased' AND lease_id=p_lease AND worker_id=p_worker AND lease_expires_at>p_now FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'ok',NULL::jsonb;RETURN;END IF;
 IF NOT saas.restock_enabled(s.store_id) OR s.generation<>d.generation OR d.first_attempt_at<=p_now-interval '24 hours' OR d.kind='confirmation' AND (s.state<>'awaiting_confirmation' OR s.updated_at<=p_now-interval '24 hours') OR d.kind='stock' AND (s.state<>'confirmed' OR s.confirmed_at IS NULL OR s.confirmed_at<=p_now-interval '180 days' OR NOT saas.restock_variant_available(s.store_id,s.variant_id)) THEN
  UPDATE saas.restock_deliveries SET state='queued',next_attempt_at=p_now+interval '1 minute',lease_id=NULL,lease_expires_at=NULL WHERE id=d.id;RETURN QUERY SELECT 'ok',NULL::jsonb;RETURN;
 END IF;
 IF d.payload IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.store_domains domain WHERE domain.store_id=s.store_id AND domain.hostname=split_part(substring(d.payload->>'productUrl' FROM 9),'/',1) AND domain.status='active' AND domain.is_primary AND domain.verified_at<=p_now AND saas.store_policy_public_store(domain.hostname,p_now)=s.store_id) THEN UPDATE saas.restock_deliveries SET state='failed',error_code='domain_unavailable',payload=NULL,lease_id=NULL,lease_expires_at=NULL WHERE id=d.id;RETURN QUERY SELECT 'ok',NULL::jsonb;RETURN;END IF;
 IF d.payload IS NULL THEN
  SELECT domain.hostname INTO host FROM saas.store_domains domain WHERE domain.store_id=s.store_id AND domain.status='active' AND domain.is_primary AND domain.verified_at<=p_now AND saas.store_policy_public_store(domain.hostname,p_now)=s.store_id ORDER BY domain.created_at,domain.id LIMIT 1;
  SELECT name INTO store_name FROM saas.stores WHERE id=s.store_id;
  SELECT p.title,p.slug,v.title INTO product_title,slug,variant_title FROM saas.products p JOIN saas.product_variants v ON v.store_id=p.store_id AND v.product_id=p.id WHERE p.store_id=s.store_id AND v.id=s.variant_id;
  IF host IS NULL OR s.email IS NULL THEN UPDATE saas.restock_deliveries SET state='failed',error_code='recipient_unavailable',lease_id=NULL,lease_expires_at=NULL WHERE id=d.id;RETURN QUERY SELECT 'ok',NULL::jsonb;RETURN;END IF;
  d.payload:=jsonb_build_object('to',s.email,'storeName',store_name,'kind',d.kind,'productTitle',product_title,'variantTitle',variant_title,'productUrl','https://'||host||'/products/'||slug,'confirmUrl','https://'||host||'/stock-alerts#token='||coalesce(s.confirm_token,s.cancel_token)||'&action=confirm','cancelUrl','https://'||host||'/stock-alerts#token='||s.cancel_token||'&action=cancel','idempotencyKey','restock-'||d.kind||'/v1/'||d.id);
 END IF;
 UPDATE saas.restock_deliveries SET payload=d.payload,first_attempt_at=coalesce(first_attempt_at,p_now),attempts=attempts+1 WHERE id=d.id;
 RETURN QUERY SELECT 'ok',d.payload||jsonb_build_object('id',d.id,'leaseId',p_lease);
END $f$;
CREATE FUNCTION saas.restock_finish(p_id uuid,p_lease uuid,p_worker text,p_now timestamptz,p_result text,p_error text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE d saas.restock_deliveries;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_result IS NULL OR p_result NOT IN('accepted','retry','failed') OR p_error IS NOT NULL AND p_error!~'^[a-z0-9_]{1,64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO d FROM saas.restock_deliveries WHERE id=p_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb;RETURN;END IF;
 PERFORM 1 FROM saas.restock_subscriptions WHERE id=d.subscription_id FOR UPDATE;
 SELECT * INTO d FROM saas.restock_deliveries WHERE id=p_id AND state='leased' AND lease_id=p_lease AND worker_id=p_worker AND lease_expires_at>p_now FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb;RETURN;END IF;
 IF p_result='accepted' THEN
  UPDATE saas.restock_deliveries SET state='accepted',payload=NULL,error_code=NULL,lease_id=NULL,lease_expires_at=NULL WHERE id=d.id;
  IF d.kind='stock' THEN UPDATE saas.restock_subscriptions SET state='notified',email=NULL,updated_at=p_now WHERE id=d.subscription_id AND generation=d.generation;END IF;
 ELSIF p_result='retry' AND d.attempts<8 AND d.first_attempt_at>p_now-interval '24 hours' THEN UPDATE saas.restock_deliveries SET state='queued',next_attempt_at=p_now+make_interval(secs=>least(21600,60*power(2,least(d.attempts,8))::integer)),error_code=p_error,lease_id=NULL,lease_expires_at=NULL WHERE id=d.id;
 ELSE UPDATE saas.restock_deliveries SET state='failed',payload=NULL,error_code=coalesce(p_error,'provider_failed'),lease_id=NULL,lease_expires_at=NULL WHERE id=d.id;END IF;
 RETURN QUERY SELECT 'ok',NULL::jsonb;
END $f$;
CREATE FUNCTION saas.restock_alerts_stats(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'restock_alerts',false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'ok',jsonb_build_object('awaitingConfirmation',(SELECT count(*) FROM saas.restock_subscriptions WHERE store_id=p_store_id AND state='awaiting_confirmation'),'pendingConfirmed',(SELECT count(*) FROM saas.restock_subscriptions WHERE store_id=p_store_id AND state='confirmed'),'sent',(SELECT count(*) FROM saas.restock_deliveries d JOIN saas.restock_subscriptions s ON s.id=d.subscription_id WHERE s.store_id=p_store_id AND d.kind='stock' AND d.state='accepted'),'failed',(SELECT count(*) FROM saas.restock_deliveries d JOIN saas.restock_subscriptions s ON s.id=d.subscription_id WHERE s.store_id=p_store_id AND d.state='failed'),
 'recent',coalesce((SELECT jsonb_agg(x.payload) FROM (SELECT jsonb_build_object('productTitle',p.title,'variantTitle',v.title,'emailMask',coalesce(left(s.email,1),'•')||'•••@'||coalesce(split_part(s.email,'@',2),'gizli'),'status',CASE WHEN EXISTS(SELECT 1 FROM saas.restock_deliveries d WHERE d.subscription_id=s.id AND d.generation=s.generation AND d.state='failed') THEN 'failed' ELSE s.state END,'error',(SELECT error_code FROM saas.restock_deliveries d WHERE d.subscription_id=s.id AND d.generation=s.generation AND d.state='failed' ORDER BY d.created_at DESC LIMIT 1),'createdAt',to_char(s.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) payload FROM saas.restock_subscriptions s JOIN saas.products p ON p.store_id=s.store_id AND p.id=s.product_id JOIN saas.product_variants v ON v.store_id=s.store_id AND v.id=s.variant_id WHERE s.store_id=p_store_id ORDER BY s.updated_at DESC,s.id LIMIT 20) x),'[]'::jsonb));
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_admin_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 IF p_kind IS DISTINCT FROM 'restock_alerts' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_list_before_restock_alerts_207(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind); RETURN; END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',COALESCE((SELECT jsonb_agg(saas.merchant_admin_projection(p_store_id,r.id) ORDER BY r.updated_at DESC,r.id DESC) FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind=p_kind AND r.status<>'archived'),'[]'::jsonb));
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_list_events(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 IF p_kind IS DISTINCT FROM 'restock_alerts' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_list_events_before_restock_alerts_207(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind);RETURN;END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',COALESCE((SELECT jsonb_agg(saas.merchant_admin_event_projection(p_store_id,r.id) ORDER BY r.occurred_at DESC,r.id DESC) FROM (SELECT id,occurred_at FROM saas.merchant_admin_events WHERE store_id=p_store_id AND record_kind=p_kind ORDER BY occurred_at DESC,id DESC LIMIT 200) r),'[]'::jsonb));
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_get_record(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_record_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;payload jsonb;
BEGIN
 IF p_kind IS DISTINCT FROM 'restock_alerts' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_get_record_before_restock_alerts_207(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,p_record_id);RETURN;END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 SELECT saas.merchant_admin_projection(p_store_id,r.id) INTO payload FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=p_record_id AND r.record_kind=p_kind AND r.status<>'archived';
 RETURN QUERY SELECT CASE WHEN payload IS NULL THEN 'record_not_found' ELSE 'found' END,payload;
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint,p_kind text,p_name text,p_config jsonb,p_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 IF p_kind IS DISTINCT FROM 'restock_alerts' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_restock_alerts_207(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);RETURN;END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.restock_alerts.store:'||p_store_id::text,207));
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations o WHERE o.store_id=p_store_id AND o.operation_id=p_operation_id) THEN
  RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_restock_alerts_207(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);RETURN;
 END IF;
 IF p_record_id IS NULL OR p_operation_id IS NULL OR p_status IS DISTINCT FROM 'active' OR saas.restock_alerts_config_valid(p_config) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind=p_kind AND r.status<>'archived' AND r.id<>p_record_id) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_restock_alerts_207(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);
END $f$;

DO $privileges$
DECLARE row record;
BEGIN
 FOR row IN SELECT oid::regprocedure identity FROM pg_proc WHERE pronamespace='saas'::regnamespace AND (proname LIKE 'restock_%' OR proname='public_restock_alerts_get') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',row.identity);
 END LOOP;
END $privileges$;
GRANT EXECUTE ON FUNCTION saas.public_restock_alerts_get(text,timestamptz),saas.restock_subscribe(text,uuid,text,text,text,text,timestamptz),saas.restock_manage(text,text,text,timestamptz) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.restock_claim(timestamptz,text,integer),saas.restock_authorize(uuid,uuid,text,timestamptz),saas.restock_finish(uuid,uuid,text,timestamptz,text,text) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.restock_alerts_stats(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
UPDATE saas.restock_alerts_207_backup b SET migrated_definition=pg_get_functiondef(to_regprocedure(b.identity)) WHERE b.function_owner IS NOT NULL;
UPDATE saas.restock_alerts_207_backup SET migrated_definition=(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.merchant_admin_records'::regclass AND conname='merchant_admin_records_record_kind_check') WHERE identity='constraint:merchant_admin_records_record_kind_check';
COMMIT;
