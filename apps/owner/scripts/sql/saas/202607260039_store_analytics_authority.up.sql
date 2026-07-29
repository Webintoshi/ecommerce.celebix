-- Phase 3H tenant-scoped managed Umami connection and delivery-outbox authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.store_analytics_connections (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  provider text NOT NULL CONSTRAINT store_analytics_connections_provider_check CHECK (provider='umami'),
  website_id uuid NOT NULL,
  hostname text NOT NULL,
  status text NOT NULL CONSTRAINT store_analytics_connections_status_check CHECK (status IN ('pending','active','disabled','failed')),
  version bigint NOT NULL CONSTRAINT store_analytics_connections_version_check CHECK (version>=1),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT store_analytics_connections_store_key UNIQUE (store_id),
  CONSTRAINT store_analytics_connections_website_key UNIQUE (website_id),
  CONSTRAINT store_analytics_connections_hostname_check CHECK (
    hostname=pg_catalog.lower(hostname)
    AND pg_catalog.char_length(hostname) BETWEEN 3 AND 253
    AND hostname!~'[*:/?#@[:space:][:cntrl:]]'
    AND hostname~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  CONSTRAINT store_analytics_connections_timestamp_check CHECK (
    updated_at>=created_at AND (last_verified_at IS NULL OR (last_verified_at>=created_at AND updated_at>=last_verified_at))
  ),
  CONSTRAINT store_analytics_connections_active_verified_check CHECK (status<>'active' OR last_verified_at IS NOT NULL)
);

CREATE TABLE saas.analytics_connection_operations (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  kind text NOT NULL CONSTRAINT analytics_connection_operations_kind_check CHECK (kind IN ('begin','activate','disable')),
  fingerprint text NOT NULL CONSTRAINT analytics_connection_operations_fingerprint_check CHECK (fingerprint~'^[0-9a-f]{64}$'),
  status text NOT NULL CONSTRAINT analytics_connection_operations_status_check CHECK (status IN ('processing','committed')),
  result_payload jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT analytics_connection_operations_payload_check CHECK (
    result_payload IS NULL OR (pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=8192)
  ),
  CONSTRAINT analytics_connection_operations_timestamp_check CHECK (updated_at>=created_at),
  CONSTRAINT analytics_connection_operations_committed_payload_check CHECK ((status='processing')=(result_payload IS NULL))
);

CREATE TABLE saas.analytics_delivery_outbox (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES saas.orders(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL REFERENCES saas.store_analytics_connections(id) ON DELETE RESTRICT,
  website_id uuid NOT NULL,
  event_kind text NOT NULL CONSTRAINT analytics_delivery_outbox_kind_check CHECK (event_kind='purchase'),
  payload jsonb NOT NULL,
  payload_digest text NOT NULL CONSTRAINT analytics_delivery_outbox_digest_check CHECK (payload_digest~'^[0-9a-f]{64}$'),
  status text NOT NULL CONSTRAINT analytics_delivery_outbox_status_check CHECK (status IN ('pending','processing','delivered','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CONSTRAINT analytics_delivery_outbox_attempt_check CHECK (attempt_count BETWEEN 0 AND 10),
  lease_token text,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz NOT NULL,
  last_error_code text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  delivered_at timestamptz,
  CONSTRAINT analytics_delivery_outbox_store_order_kind_key UNIQUE (store_id,order_id,event_kind),
  CONSTRAINT analytics_delivery_outbox_payload_check CHECK (
    pg_catalog.jsonb_typeof(payload)='object'
    AND pg_catalog.pg_column_size(payload)<=1024
    AND payload ?& ARRAY['valueCents','currency','source']
    AND NOT payload ?| ARRAY['orderId','orderNumber','storeId','customer','email','address','websiteId','provider']
  ),
  CONSTRAINT analytics_delivery_outbox_lease_check CHECK (
    (status='processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status<>'processing' AND lease_token IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT analytics_delivery_outbox_delivery_check CHECK ((status='delivered')=(delivered_at IS NOT NULL)),
  CONSTRAINT analytics_delivery_outbox_timestamp_check CHECK (
    updated_at>=created_at AND next_attempt_at>=created_at AND (delivered_at IS NULL OR delivered_at>=created_at)
  )
);

CREATE INDEX store_analytics_connections_host_idx ON saas.store_analytics_connections(hostname,status,store_id);
CREATE INDEX analytics_connection_operations_store_idx ON saas.analytics_connection_operations(store_id,updated_at DESC,id);
CREATE INDEX analytics_delivery_outbox_claim_idx ON saas.analytics_delivery_outbox(status,next_attempt_at,created_at,id)
  WHERE status='pending';
CREATE INDEX analytics_delivery_outbox_lease_idx ON saas.analytics_delivery_outbox(status,lease_expires_at,id)
  WHERE status='processing';

ALTER TABLE saas.store_analytics_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_analytics_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.analytics_connection_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.analytics_connection_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.analytics_delivery_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.analytics_delivery_outbox FORCE ROW LEVEL SECURITY;

CREATE FUNCTION saas.guard_analytics_connection_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.provider<>OLD.provider
    OR NEW.website_id<>OLD.website_id OR NEW.created_at<>OLD.created_at
    OR NEW.version<>OLD.version+1
  ) THEN RAISE EXCEPTION 'ANALYTICS_CONNECTION_AUTHORITY_IMMUTABLE'; END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_analytics_connection_authority() FROM PUBLIC;
CREATE TRIGGER store_analytics_connections_authority_guard
BEFORE UPDATE ON saas.store_analytics_connections FOR EACH ROW EXECUTE FUNCTION saas.guard_analytics_connection_authority();

CREATE FUNCTION saas.guard_analytics_operation_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF TG_OP='DELETE' OR OLD.status='committed' OR NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id
    OR NEW.kind<>OLD.kind OR NEW.fingerprint<>OLD.fingerprint OR NEW.created_at<>OLD.created_at
  THEN RAISE EXCEPTION 'ANALYTICS_OPERATION_IMMUTABLE'; END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_analytics_operation_authority() FROM PUBLIC;
CREATE TRIGGER analytics_connection_operations_authority_guard
BEFORE UPDATE OR DELETE ON saas.analytics_connection_operations FOR EACH ROW EXECUTE FUNCTION saas.guard_analytics_operation_authority();

CREATE FUNCTION saas.analytics_canonical_hostname(p_store_id uuid,p_now timestamptz)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT domain.hostname
  FROM saas.store_domains AS domain
  WHERE domain.store_id=p_store_id AND domain.status='active' AND domain.is_primary
    AND domain.verified_at IS NOT NULL AND domain.verified_at<=p_now
  LIMIT 1
$function$;
REVOKE ALL ON FUNCTION saas.analytics_canonical_hostname(uuid,timestamptz) FROM PUBLIC;

CREATE FUNCTION saas.analytics_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_mutation boolean
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL
    OR p_plan_code IS NULL OR p_plan_code<>pg_catalog.lower(pg_catalog.btrim(p_plan_code))
    OR p_plan_version IS NULL OR p_plan_version<1 OR p_now IS NULL OR p_mutation IS NULL
  THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores s WHERE s.id=p_store_id AND s.status='active') THEN RETURN 'store_inactive'; END IF;
  SELECT m.role INTO membership_role FROM saas.memberships m
    WHERE m.id=p_membership_id AND m.store_id=p_store_id AND m.principal_id=p_principal_id AND m.status='active';
  IF membership_role IS NULL OR (p_mutation AND membership_role NOT IN('store_owner','admin')) THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.subscriptions s JOIN saas.plans p
      ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version
    WHERE s.store_id=p_store_id AND s.plan_id=p_plan_id AND s.plan_code=p_plan_code AND s.plan_version=p_plan_version
      AND s.status='active' AND s.valid_from<=p_now AND (s.valid_until IS NULL OR s.valid_until>p_now)
      AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)
  ) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.plan_features f WHERE f.plan_id=p_plan_id AND f.feature_key='analytics' AND f.enabled)
    THEN RETURN 'feature_not_enabled'; END IF;
  IF saas.analytics_canonical_hostname(p_store_id,p_now) IS NULL THEN RETURN 'hostname_not_found'; END IF;
  RETURN NULL;
END
$function$;
REVOKE ALL ON FUNCTION saas.analytics_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,boolean) FROM PUBLIC;

CREATE FUNCTION saas.analytics_connection_payload(p_connection_id uuid,p_replayed boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'connectionId',c.id,'websiteId',c.website_id,'hostname',c.hostname,'status',c.status,
    'version',c.version,'lastVerifiedAt',CASE WHEN c.last_verified_at IS NULL THEN NULL ELSE pg_catalog.to_char(c.last_verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
    'updatedAt',pg_catalog.to_char(c.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'replayed',p_replayed
  ) FROM saas.store_analytics_connections c WHERE c.id=p_connection_id
$function$;
REVOKE ALL ON FUNCTION saas.analytics_connection_payload(uuid,boolean) FROM PUBLIC;

CREATE FUNCTION saas.analytics_connection_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; connection_id uuid;
BEGIN
  authority_error:=saas.analytics_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT c.id INTO connection_id FROM saas.store_analytics_connections c WHERE c.store_id=p_store_id;
  IF connection_id IS NULL THEN
    RETURN QUERY SELECT 'not_configured'::text,pg_catalog.jsonb_build_object('schemaVersion',1,'provider','umami','status','disabled','configured',false,'hostname',NULL,'version',NULL,'lastVerifiedAt',NULL);
  ELSE
    RETURN QUERY SELECT 'found'::text,saas.analytics_connection_payload(connection_id,false);
  END IF;
END
$function$;

CREATE FUNCTION saas.analytics_connection_begin(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_connection_id uuid,p_website_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; operation_row saas.analytics_connection_operations%ROWTYPE; hostname text; payload jsonb;
BEGIN
  authority_error:=saas.analytics_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_connection_id IS NULL OR p_website_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[0-9a-f]{64}$'
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.analytics.operation:'||p_operation_id::text,0));
  SELECT * INTO operation_row FROM saas.analytics_connection_operations WHERE id=p_operation_id;
  IF FOUND THEN
    IF operation_row.store_id<>p_store_id OR operation_row.kind<>'begin' OR operation_row.fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation_row.result_payload||'{"replayed":true}'::jsonb; END IF;
    RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.analytics.store:'||p_store_id::text,0));
  IF EXISTS(SELECT 1 FROM saas.store_analytics_connections c WHERE c.store_id=p_store_id) THEN RETURN QUERY SELECT 'already_configured',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.store_analytics_connections c WHERE c.website_id=p_website_id) THEN RETURN QUERY SELECT 'website_id_conflict',NULL::jsonb; RETURN; END IF;
  hostname:=saas.analytics_canonical_hostname(p_store_id,p_now);
  INSERT INTO saas.store_analytics_connections(id,store_id,provider,website_id,hostname,status,version,last_verified_at,created_at,updated_at)
    VALUES(p_connection_id,p_store_id,'umami',p_website_id,hostname,'pending',1,NULL,p_now,p_now);
  payload:=saas.analytics_connection_payload(p_connection_id,false);
  INSERT INTO saas.analytics_connection_operations(id,store_id,kind,fingerprint,status,result_payload,created_at,updated_at)
    VALUES(p_operation_id,p_store_id,'begin',p_fingerprint,'committed',payload,p_now,p_now);
  RETURN QUERY SELECT 'pending',payload;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'website_id_conflict',NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.analytics_connection_activate(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_connection_id uuid,p_website_id uuid,p_verified_hostname text
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; operation_row saas.analytics_connection_operations%ROWTYPE; connection_row saas.store_analytics_connections%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.analytics_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_connection_id IS NULL OR p_website_id IS NULL OR p_verified_hostname IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[0-9a-f]{64}$'
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.analytics.operation:'||p_operation_id::text,0));
  SELECT * INTO operation_row FROM saas.analytics_connection_operations WHERE id=p_operation_id;
  IF FOUND THEN
    IF operation_row.store_id<>p_store_id OR operation_row.kind<>'activate' OR operation_row.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation_row.result_payload||'{"replayed":true}'::jsonb; END IF; RETURN;
  END IF;
  SELECT * INTO connection_row FROM saas.store_analytics_connections WHERE store_id=p_store_id FOR UPDATE;
  IF NOT FOUND OR connection_row.id<>p_connection_id THEN RETURN QUERY SELECT 'connection_not_found',NULL::jsonb; RETURN; END IF;
  IF connection_row.website_id<>p_website_id THEN RETURN QUERY SELECT 'website_id_mismatch',NULL::jsonb; RETURN; END IF;
  IF connection_row.hostname<>p_verified_hostname OR p_verified_hostname<>saas.analytics_canonical_hostname(p_store_id,p_now) THEN RETURN QUERY SELECT 'hostname_mismatch',NULL::jsonb; RETURN; END IF;
  IF connection_row.status<>'pending' THEN RETURN QUERY SELECT 'stale_operation',NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_analytics_connections SET status='active',version=version+1,last_verified_at=p_now,updated_at=p_now WHERE id=p_connection_id;
  payload:=saas.analytics_connection_payload(p_connection_id,false);
  INSERT INTO saas.analytics_connection_operations VALUES(p_operation_id,p_store_id,'activate',p_fingerprint,'committed',payload,p_now,p_now);
  RETURN QUERY SELECT 'active',payload;
END
$function$;

CREATE FUNCTION saas.analytics_connection_disable(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_connection_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; operation_row saas.analytics_connection_operations%ROWTYPE; connection_row saas.store_analytics_connections%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.analytics_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_connection_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint!~'^[0-9a-f]{64}$'
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.analytics.operation:'||p_operation_id::text,0));
  SELECT * INTO operation_row FROM saas.analytics_connection_operations WHERE id=p_operation_id;
  IF FOUND THEN
    IF operation_row.store_id<>p_store_id OR operation_row.kind<>'disable' OR operation_row.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation_row.result_payload||'{"replayed":true}'::jsonb; END IF; RETURN;
  END IF;
  SELECT * INTO connection_row FROM saas.store_analytics_connections WHERE store_id=p_store_id FOR UPDATE;
  IF NOT FOUND OR connection_row.id<>p_connection_id THEN RETURN QUERY SELECT 'connection_not_found',NULL::jsonb; RETURN; END IF;
  IF connection_row.version<>p_expected_version OR connection_row.status='disabled' THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_analytics_connections SET status='disabled',version=version+1,updated_at=p_now WHERE id=p_connection_id;
  payload:=saas.analytics_connection_payload(p_connection_id,false);
  INSERT INTO saas.analytics_connection_operations VALUES(p_operation_id,p_store_id,'disable',p_fingerprint,'committed',payload,p_now,p_now);
  RETURN QUERY SELECT 'disabled',payload;
END
$function$;

CREATE FUNCTION saas.analytics_connection_recover_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; operation_row saas.analytics_connection_operations%ROWTYPE;
BEGIN
  authority_error:=saas.analytics_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[0-9a-f]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation_row FROM saas.analytics_connection_operations WHERE id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_committed',NULL::jsonb;
  ELSIF operation_row.store_id<>p_store_id OR operation_row.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_recovered',operation_row.result_payload||'{"replayed":true}'::jsonb; END IF;
END
$function$;

CREATE FUNCTION saas.analytics_connection_is_current(p_connection_id uuid,p_now timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT p_now IS NOT NULL AND EXISTS(
    SELECT 1 FROM saas.store_analytics_connections c
    JOIN saas.stores s ON s.id=c.store_id AND s.status='active'
    JOIN saas.store_domains d ON d.store_id=c.store_id AND d.hostname=c.hostname AND d.status='active' AND d.is_primary AND d.verified_at<=p_now
    JOIN saas.subscriptions sub ON sub.store_id=c.store_id AND sub.status='active' AND sub.valid_from<=p_now AND (sub.valid_until IS NULL OR sub.valid_until>p_now)
    JOIN saas.plans p ON p.id=sub.plan_id AND p.plan_code=sub.plan_code AND p.version=sub.plan_version AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)
    JOIN saas.plan_features f ON f.plan_id=p.id AND f.feature_key='analytics' AND f.enabled
    WHERE c.id=p_connection_id AND c.status='active'
  )
$function$;
REVOKE ALL ON FUNCTION saas.analytics_connection_is_current(uuid,timestamptz) FROM PUBLIC;

CREATE FUNCTION saas.analytics_connection_get_for_host(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE connection_row saas.store_analytics_connections%ROWTYPE;
BEGIN
  IF p_now IS NULL OR p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname) OR pg_catalog.char_length(p_hostname) NOT BETWEEN 3 AND 253
    OR p_hostname~'[*:/?#@[:space:][:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT c.* INTO connection_row FROM saas.store_analytics_connections c
    WHERE c.hostname=p_hostname AND c.status='active' AND saas.analytics_connection_is_current(c.id,p_now);
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('websiteId',connection_row.website_id,'hostname',connection_row.hostname); END IF;
END
$function$;

CREATE FUNCTION saas.analytics_outbox_claim(p_now timestamptz,p_limit integer,p_lease interval)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE claimed jsonb;
BEGIN
  IF p_now IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_lease IS NULL OR p_lease<interval '5 seconds' OR p_lease>interval '15 minutes'
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  WITH candidates AS (
    SELECT o.id FROM saas.analytics_delivery_outbox o
    WHERE (o.status='pending' AND o.next_attempt_at<=p_now) OR (o.status='processing' AND o.lease_expires_at<=p_now)
    ORDER BY o.next_attempt_at,o.created_at,o.id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), updated AS (
    UPDATE saas.analytics_delivery_outbox o SET status='processing',attempt_count=o.attempt_count+1,
      lease_token=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.gen_random_uuid()::text||':'||o.id::text||':'||p_now::text,'UTF8')),'hex'),
      lease_expires_at=p_now+p_lease,updated_at=p_now
    FROM candidates WHERE o.id=candidates.id AND o.attempt_count<10
    RETURNING o.*
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'eventId',u.id,'leaseToken',u.lease_token,'websiteId',u.website_id,'hostname',c.hostname,
    'attemptCount',u.attempt_count,'payload',pg_catalog.jsonb_build_object('name','purchase')||u.payload
  ) ORDER BY u.created_at,u.id),'[]'::jsonb) INTO claimed
  FROM updated u JOIN saas.store_analytics_connections c ON c.id=u.connection_id;
  RETURN QUERY SELECT 'claimed',claimed;
END
$function$;

CREATE FUNCTION saas.analytics_outbox_mark_delivered(p_event_id uuid,p_lease_token text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF p_event_id IS NULL OR p_lease_token IS NULL OR p_lease_token!~'^[0-9a-f]{64}$' OR p_now IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  UPDATE saas.analytics_delivery_outbox SET status='delivered',lease_token=NULL,lease_expires_at=NULL,updated_at=p_now,delivered_at=p_now,last_error_code=NULL
    WHERE id=p_event_id AND status='processing' AND lease_token=p_lease_token AND lease_expires_at>p_now;
  IF FOUND THEN RETURN QUERY SELECT 'delivered','{}'::jsonb; ELSE RETURN QUERY SELECT 'lease_lost',NULL::jsonb; END IF;
END
$function$;

CREATE FUNCTION saas.analytics_outbox_mark_failed(p_event_id uuid,p_lease_token text,p_now timestamptz,p_error_code text,p_retry_at timestamptz,p_terminal boolean)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF p_event_id IS NULL OR p_lease_token IS NULL OR p_lease_token!~'^[0-9a-f]{64}$' OR p_now IS NULL OR p_terminal IS NULL
    OR p_error_code NOT IN('collector_unavailable','collector_rejected','collector_response_invalid')
    OR (NOT p_terminal AND (p_retry_at IS NULL OR p_retry_at<=p_now))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  UPDATE saas.analytics_delivery_outbox SET status=CASE WHEN p_terminal OR attempt_count>=10 THEN 'failed' ELSE 'pending' END,
    lease_token=NULL,lease_expires_at=NULL,next_attempt_at=CASE WHEN p_terminal OR attempt_count>=10 THEN next_attempt_at ELSE p_retry_at END,
    last_error_code=p_error_code,updated_at=p_now
    WHERE id=p_event_id AND status='processing' AND lease_token=p_lease_token AND lease_expires_at>p_now;
  IF FOUND THEN RETURN QUERY SELECT CASE WHEN p_terminal THEN 'failed' ELSE 'retry_scheduled' END,'{}'::jsonb;
  ELSE RETURN QUERY SELECT 'lease_lost',NULL::jsonb; END IF;
END
$function$;

CREATE FUNCTION saas.enqueue_analytics_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE safe_payload jsonb;
BEGIN
  IF NEW.payment_status='completed' AND (TG_OP='INSERT' OR OLD.payment_status IS DISTINCT FROM 'completed') THEN
    safe_payload:=pg_catalog.jsonb_build_object('valueCents',NEW.total_cents,'currency',NEW.currency,'source',NEW.source);
    INSERT INTO saas.analytics_delivery_outbox(
      id,store_id,order_id,connection_id,website_id,event_kind,payload,payload_digest,status,attempt_count,next_attempt_at,created_at,updated_at
    )
    SELECT pg_catalog.gen_random_uuid(),NEW.store_id,NEW.id,c.id,c.website_id,'purchase',safe_payload,
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(safe_payload::text,'UTF8')),'hex'),'pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at
    FROM saas.store_analytics_connections c
    WHERE c.store_id=NEW.store_id AND c.status='active' AND saas.analytics_connection_is_current(c.id,NEW.updated_at)
    ON CONFLICT (store_id,order_id,event_kind) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.enqueue_analytics_purchase() FROM PUBLIC;
CREATE TRIGGER orders_enqueue_analytics_purchase
AFTER INSERT OR UPDATE OF payment_status ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.enqueue_analytics_purchase();

REVOKE ALL ON saas.store_analytics_connections,saas.analytics_connection_operations,saas.analytics_delivery_outbox
  FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_observability,celebix_saas_bootstrap,celebix_saas_migrator;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA saas FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.analytics_connection_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.analytics_connection_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid),
  saas.analytics_connection_activate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text),
  saas.analytics_connection_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.analytics_connection_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.analytics_connection_get_for_host(text,timestamptz) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.analytics_outbox_claim(timestamptz,integer,interval),
  saas.analytics_outbox_mark_delivered(uuid,text,timestamptz),
  saas.analytics_outbox_mark_failed(uuid,text,timestamptz,text,timestamptz,boolean)
TO celebix_saas_workflow;

COMMIT;
