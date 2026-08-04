BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regprocedure('saas.storefront_public_store(text,timestamp with time zone)') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_credential_candidates_valid(jsonb,boolean)') IS NULL
    OR pg_catalog.to_regclass('saas.customers') IS NULL
    OR pg_catalog.to_regclass('saas.customer_addresses') IS NULL
    OR pg_catalog.to_regclass('saas.orders') IS NULL
    OR pg_catalog.to_regclass('saas.order_items') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_carts') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_accounts') IS NOT NULL
  THEN RAISE EXCEPTION 'STOREFRONT_CUSTOMER_IDENTITY_SOURCE_INVALID'; END IF;
END
$f$;

CREATE TABLE saas.storefront_accounts(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  customer_id uuid,
  email text NOT NULL CHECK(email=pg_catalog.lower(email) AND email=pg_catalog.btrim(email) AND pg_catalog.char_length(email) BETWEEN 3 AND 320 AND email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  email_normalized text NOT NULL CHECK(email_normalized=email),
  status text NOT NULL CHECK(status IN('pending_profile','active','suspended')),
  verified_at timestamptz NOT NULL,
  last_login_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  UNIQUE(store_id,id),
  UNIQUE(store_id,email_normalized),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,customer_id) REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT,
  CHECK(updated_at>=created_at AND verified_at>=created_at AND last_login_at>=verified_at),
  CHECK((status='pending_profile' AND customer_id IS NULL) OR (status IN('active','suspended') AND customer_id IS NOT NULL))
);
CREATE UNIQUE INDEX storefront_accounts_customer_idx ON saas.storefront_accounts(store_id,customer_id) WHERE customer_id IS NOT NULL;

CREATE TABLE saas.storefront_login_challenges(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  purpose text NOT NULL DEFAULT 'sign_in_or_register' CHECK(purpose='sign_in_or_register'),
  email_digest char(64) NOT NULL CHECK(email_digest~'^[a-f0-9]{64}$'),
  request_digest char(64) NOT NULL CHECK(request_digest~'^[a-f0-9]{64}$'),
  code_key_id text NOT NULL CHECK(code_key_id~'^[a-z][a-z0-9_-]{2,31}$'),
  code_digest char(64) NOT NULL CHECK(code_digest~'^[a-f0-9]{64}$'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 6),
  send_count integer NOT NULL DEFAULT 1 CHECK(send_count BETWEEN 1 AND 5),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL,
  UNIQUE(store_id,id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(expires_at>created_at AND expires_at<=created_at+INTERVAL '15 minutes'),
  CHECK(last_sent_at>=created_at AND last_sent_at<=expires_at),
  CHECK(consumed_at IS NULL OR consumed_at>=created_at),
  CHECK(locked_at IS NULL OR locked_at>=created_at)
);

CREATE TABLE saas.storefront_account_sessions(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  account_id uuid NOT NULL,
  session_kind text NOT NULL CHECK(session_kind IN('registration','full')),
  key_id text NOT NULL CHECK(key_id~'^[a-z][a-z0-9_-]{2,31}$'),
  credential_digest char(64) NOT NULL CHECK(credential_digest~'^[a-f0-9]{64}$'),
  csrf_digest char(64) NOT NULL CHECK(csrf_digest~'^[a-f0-9]{64}$'),
  device_label text NOT NULL CHECK(device_label=pg_catalog.btrim(device_label) AND pg_catalog.char_length(device_label) BETWEEN 1 AND 100 AND device_label!~'[[:cntrl:]]'),
  user_agent_digest char(64) NOT NULL CHECK(user_agent_digest~'^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text CHECK(revocation_reason IS NULL OR revocation_reason IN('logout','logout_all','rotated','merchant_suspended','device_revoked','expired')),
  UNIQUE(store_id,id),
  UNIQUE(store_id,key_id,credential_digest),
  FOREIGN KEY(store_id,account_id) REFERENCES saas.storefront_accounts(store_id,id) ON DELETE RESTRICT,
  CHECK(last_seen_at>=created_at AND idle_expires_at>created_at AND absolute_expires_at>=idle_expires_at),
  CHECK((revoked_at IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_at>=created_at AND revocation_reason IS NOT NULL)),
  CHECK((session_kind='registration' AND absolute_expires_at<=created_at+INTERVAL '15 minutes') OR (session_kind='full' AND absolute_expires_at<=created_at+INTERVAL '30 days'))
);

CREATE TABLE saas.storefront_account_order_links(
  store_id uuid NOT NULL,
  account_id uuid NOT NULL,
  order_id uuid NOT NULL,
  claim_source text NOT NULL CHECK(claim_source IN('verified_email','authenticated_checkout')),
  claimed_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,account_id,order_id),
  UNIQUE(store_id,order_id),
  FOREIGN KEY(store_id,account_id) REFERENCES saas.storefront_accounts(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.storefront_account_favorites(
  store_id uuid NOT NULL,
  account_id uuid NOT NULL,
  product_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,account_id,product_id),
  FOREIGN KEY(store_id,account_id) REFERENCES saas.storefront_accounts(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.storefront_account_cart_links(
  store_id uuid NOT NULL,
  account_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN('active','absorbed','closed')),
  linked_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,account_id,cart_id),
  FOREIGN KEY(store_id,account_id) REFERENCES saas.storefront_accounts(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,cart_id) REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT,
  CHECK(updated_at>=linked_at)
);
CREATE UNIQUE INDEX storefront_account_cart_active_idx ON saas.storefront_account_cart_links(store_id,account_id) WHERE status='active';

CREATE TABLE saas.storefront_identity_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  account_id uuid NOT NULL,
  operation_kind text NOT NULL CHECK(operation_kind IN('profile_complete','profile_update','address_save','address_delete','favorite_set','session_revoke')),
  payload_fingerprint char(64) NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=32768),
  committed_at timestamptz NOT NULL,
  UNIQUE(store_id,operation_id),
  FOREIGN KEY(store_id,account_id) REFERENCES saas.storefront_accounts(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.storefront_identity_audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL,
  account_id uuid,
  challenge_id uuid,
  session_id uuid,
  event_code text NOT NULL CHECK(event_code IN('challenge_created','challenge_rejected','challenge_consumed','account_created','account_login','profile_completed','profile_updated','address_saved','address_deleted','favorite_changed','session_revoked','sessions_revoked')),
  correlation_id text NOT NULL CHECK(correlation_id~'^[A-Za-z0-9_-]{8,80}$'),
  created_at timestamptz NOT NULL,
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,account_id) REFERENCES saas.storefront_accounts(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,challenge_id) REFERENCES saas.storefront_login_challenges(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,session_id) REFERENCES saas.storefront_account_sessions(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.storefront_identity_email_outbox(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  challenge_id uuid NOT NULL,
  recipient_ciphertext text NOT NULL CHECK(pg_catalog.char_length(recipient_ciphertext) BETWEEN 20 AND 2048 AND recipient_ciphertext~'^[A-Za-z0-9_.-]+$'),
  template_version integer NOT NULL DEFAULT 1 CHECK(template_version=1),
  brand_snapshot jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(brand_snapshot)='object' AND pg_catalog.pg_column_size(brand_snapshot)<=8192),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','sending','sent','failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 10),
  last_error_code text CHECK(last_error_code IS NULL OR last_error_code~'^[a-z0-9_]{3,64}$'),
  next_attempt_at timestamptz NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(store_id,challenge_id),
  FOREIGN KEY(store_id,challenge_id) REFERENCES saas.storefront_login_challenges(store_id,id) ON DELETE RESTRICT,
  CHECK(updated_at>=created_at AND next_attempt_at>=created_at),
  CHECK((status='sent' AND sent_at IS NOT NULL AND sent_at>=created_at) OR (status<>'sent' AND sent_at IS NULL))
);

CREATE INDEX storefront_login_challenges_rate_idx ON saas.storefront_login_challenges(store_id,email_digest,created_at DESC,id);
CREATE INDEX storefront_login_challenges_request_rate_idx ON saas.storefront_login_challenges(store_id,request_digest,created_at DESC,id);
CREATE INDEX storefront_account_sessions_account_idx ON saas.storefront_account_sessions(store_id,account_id,created_at DESC,id);
CREATE INDEX storefront_account_sessions_expiry_idx ON saas.storefront_account_sessions(store_id,revoked_at,idle_expires_at,absolute_expires_at,id);
CREATE INDEX storefront_account_order_links_list_idx ON saas.storefront_account_order_links(store_id,account_id,claimed_at DESC,order_id);
CREATE INDEX storefront_identity_outbox_delivery_idx ON saas.storefront_identity_email_outbox(status,next_attempt_at,id) WHERE status IN('pending','failed');

DO $f$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'storefront_accounts','storefront_login_challenges','storefront_account_sessions',
    'storefront_account_order_links','storefront_account_favorites','storefront_account_cart_links',
    'storefront_identity_operations','storefront_identity_audit','storefront_identity_email_outbox'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE pg_catalog.format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',table_name);
  END LOOP;
END $f$;

REVOKE ALL ON saas.storefront_accounts,saas.storefront_login_challenges,
  saas.storefront_account_sessions,saas.storefront_account_order_links,
  saas.storefront_account_favorites,saas.storefront_account_cart_links,
  saas.storefront_identity_operations,saas.storefront_identity_audit,
  saas.storefront_identity_email_outbox
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.guard_storefront_identity_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$ BEGIN RAISE EXCEPTION 'STOREFRONT_IDENTITY_AUDIT_IMMUTABLE'; END $f$;
CREATE FUNCTION saas.guard_storefront_identity_operation_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$ BEGIN RAISE EXCEPTION 'STOREFRONT_IDENTITY_OPERATION_IMMUTABLE'; END $f$;
CREATE FUNCTION saas.guard_storefront_identity_outbox_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF TG_OP='DELETE' OR NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.challenge_id<>OLD.challenge_id
    OR NEW.recipient_ciphertext<>OLD.recipient_ciphertext OR NEW.template_version<>OLD.template_version
    OR NEW.brand_snapshot<>OLD.brand_snapshot OR NEW.created_at<>OLD.created_at
    OR NEW.attempt_count<OLD.attempt_count OR NEW.updated_at<OLD.updated_at
    OR NOT ((OLD.status='pending' AND NEW.status IN('sending','failed')) OR (OLD.status='sending' AND NEW.status IN('sent','failed')) OR (OLD.status='failed' AND NEW.status IN('pending','sending')))
  THEN RAISE EXCEPTION 'STOREFRONT_IDENTITY_OUTBOX_MUTATION_INVALID'; END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER storefront_identity_audit_immutable BEFORE UPDATE OR DELETE ON saas.storefront_identity_audit FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_identity_audit_mutation();
CREATE TRIGGER storefront_identity_operations_immutable BEFORE UPDATE OR DELETE ON saas.storefront_identity_operations FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_identity_operation_mutation();
CREATE TRIGGER storefront_identity_outbox_guard BEFORE UPDATE OR DELETE ON saas.storefront_identity_email_outbox FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_identity_outbox_mutation();

CREATE FUNCTION saas.storefront_identity_email_valid(p_email text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
  SELECT p_email IS NOT NULL AND p_email=pg_catalog.lower(p_email) AND p_email=pg_catalog.btrim(p_email)
    AND pg_catalog.char_length(p_email) BETWEEN 3 AND 320
    AND p_email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
$f$;

CREATE FUNCTION saas.storefront_identity_session_context(p_hostname text,p_now timestamptz,p_credentials jsonb,p_allow_registration boolean DEFAULT false)
RETURNS TABLE(store_id uuid,account_id uuid,customer_id uuid,session_id uuid,session_kind text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_credentials,false) THEN RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT session.store_id,session.account_id,account.customer_id,session.id,session.session_kind
  FROM saas.storefront_account_sessions session
  JOIN saas.storefront_accounts account ON account.store_id=session.store_id AND account.id=session.account_id
  JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
    ON candidate->>'keyId'=session.key_id AND candidate->>'digest'=session.credential_digest
  WHERE session.store_id=selected_store AND session.revoked_at IS NULL
    AND session.idle_expires_at>p_now AND session.absolute_expires_at>p_now
    AND account.status<>'suspended' AND (p_allow_registration OR session.session_kind='full')
  ORDER BY session.created_at DESC,session.id LIMIT 1;
END $f$;

CREATE FUNCTION saas.storefront_identity_snapshot(p_store_id uuid,p_account_id uuid,p_current_session uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'status',account.status,'version',account.version,
    'profile',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('email',account.email_normalized,'firstName',customer.first_name,'lastName',customer.last_name,'phone',customer.phone)),
    'addresses',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',address.id,'label',address.label,'recipientName',address.recipient_name,'line1',address.line1,'line2',address.line2,'city',address.city,'district',address.district,'postalCode',address.postal_code,'country',address.country,'isDefault',address.is_default,'version',address.version)) ORDER BY address.is_default DESC,address.updated_at DESC,address.id) FROM saas.customer_addresses address WHERE address.store_id=account.store_id AND address.customer_id=account.customer_id),'[]'::jsonb),
    'favorites',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('productId',favorite.product_id,'createdAt',saas.storefront_commerce_timestamp(favorite.created_at)) ORDER BY favorite.created_at DESC,favorite.product_id) FROM saas.storefront_account_favorites favorite WHERE favorite.store_id=account.store_id AND favorite.account_id=account.id),'[]'::jsonb),
    'devices',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id','device_'||pg_catalog.replace(session.id::text,'-',''),'label',session.device_label,'current',session.id=p_current_session,'lastSeenAt',saas.storefront_commerce_timestamp(session.last_seen_at),'createdAt',saas.storefront_commerce_timestamp(session.created_at)) ORDER BY session.last_seen_at DESC,session.id) FROM saas.storefront_account_sessions session WHERE session.store_id=account.store_id AND session.account_id=account.id AND session.session_kind='full' AND session.revoked_at IS NULL),'[]'::jsonb)
  )
  FROM saas.storefront_accounts account JOIN saas.customers customer ON customer.store_id=account.store_id AND customer.id=account.customer_id
  WHERE account.store_id=p_store_id AND account.id=p_account_id AND account.status='active'
$f$;

CREATE FUNCTION saas.storefront_identity_order_projection(p_store_id uuid,p_account_id uuid,p_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'orderReference',orders.order_number,'status',orders.status,'paymentStatus',orders.payment_status,'currency',orders.currency,
    'subtotalCents',orders.subtotal_cents,'shippingCents',orders.shipping_cents,'totalCents',orders.total_cents,'createdAt',saas.storefront_commerce_timestamp(orders.created_at),
    'items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',item.product_name,'quantity',item.quantity,'unitPriceCents',item.unit_price_cents,'lineTotalCents',item.line_total_cents) ORDER BY item.position,item.id) FROM saas.order_items item WHERE item.store_id=orders.store_id AND item.order_id=orders.id),'[]'::jsonb)
  )
  FROM saas.storefront_account_order_links link JOIN saas.orders orders ON orders.store_id=link.store_id AND orders.id=link.order_id
  WHERE link.store_id=p_store_id AND link.account_id=p_account_id AND link.order_id=p_order_id
$f$;

CREATE FUNCTION saas.public_account_auth_start(
  p_hostname text,p_now timestamptz,p_challenge_id uuid,p_email_digest text,p_request_digest text,
  p_code_key_id text,p_code_digest text,p_expires_at timestamptz,p_outbox_id uuid,
  p_recipient_ciphertext text,p_brand_snapshot jsonb,p_correlation_id text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; retry_seconds integer:=60;
BEGIN
  IF p_challenge_id IS NULL OR p_outbox_id IS NULL OR p_email_digest!~'^[a-f0-9]{64}$' OR p_request_digest!~'^[a-f0-9]{64}$'
    OR p_code_key_id!~'^[a-z][a-z0-9_-]{2,31}$' OR p_code_digest!~'^[a-f0-9]{64}$'
    OR p_expires_at<=p_now OR p_expires_at>p_now+INTERVAL '15 minutes'
    OR pg_catalog.char_length(p_recipient_ciphertext) NOT BETWEEN 20 AND 2048 OR p_recipient_ciphertext!~'^[A-Za-z0-9_.-]+$'
    OR pg_catalog.jsonb_typeof(p_brand_snapshot)<>'object' OR pg_catalog.pg_column_size(p_brand_snapshot)>8192
    OR p_correlation_id!~'^[A-Za-z0-9_-]{8,80}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.storefront_login_challenges challenge WHERE challenge.store_id=selected_store AND challenge.email_digest=p_email_digest AND challenge.created_at>p_now-INTERVAL '15 minutes')>=5
    OR (SELECT pg_catalog.count(*) FROM saas.storefront_login_challenges challenge WHERE challenge.store_id=selected_store AND challenge.request_digest=p_request_digest AND challenge.created_at>p_now-INTERVAL '15 minutes')>=10
  THEN RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('retryAfterSeconds',300); RETURN; END IF;
  INSERT INTO saas.storefront_login_challenges(id,store_id,email_digest,request_digest,code_key_id,code_digest,expires_at,created_at,last_sent_at)
    VALUES(p_challenge_id,selected_store,p_email_digest,p_request_digest,p_code_key_id,p_code_digest,p_expires_at,p_now,p_now);
  INSERT INTO saas.storefront_identity_email_outbox(id,store_id,challenge_id,recipient_ciphertext,brand_snapshot,next_attempt_at,created_at,updated_at)
    VALUES(p_outbox_id,selected_store,p_challenge_id,p_recipient_ciphertext,p_brand_snapshot,p_now,p_now,p_now);
  INSERT INTO saas.storefront_identity_audit(store_id,challenge_id,event_code,correlation_id,created_at)
    VALUES(selected_store,p_challenge_id,'challenge_created',p_correlation_id,p_now);
  RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('retryAfterSeconds',retry_seconds);
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('retryAfterSeconds',retry_seconds);
END $f$;

CREATE FUNCTION saas.public_account_auth_verify(
  p_hostname text,p_now timestamptz,p_challenge_id uuid,p_email_digest text,p_code_digest text,p_email text,
  p_account_id uuid,p_session_id uuid,p_session_key_id text,p_session_digest text,p_csrf_digest text,
  p_device_label text,p_user_agent_digest text,p_correlation_id text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_challenge saas.storefront_login_challenges%ROWTYPE;
  selected_account saas.storefront_accounts%ROWTYPE; selected_customer saas.customers%ROWTYPE;
  selected_kind text; selected_absolute timestamptz;
BEGIN
  IF p_challenge_id IS NULL OR p_account_id IS NULL OR p_session_id IS NULL
    OR p_email_digest!~'^[a-f0-9]{64}$' OR p_code_digest!~'^[a-f0-9]{64}$' OR NOT saas.storefront_identity_email_valid(p_email)
    OR p_session_key_id!~'^[a-z][a-z0-9_-]{2,31}$' OR p_session_digest!~'^[a-f0-9]{64}$' OR p_csrf_digest!~'^[a-f0-9]{64}$'
    OR p_device_label<>pg_catalog.btrim(p_device_label) OR pg_catalog.char_length(p_device_label) NOT BETWEEN 1 AND 100 OR p_device_label~'[[:cntrl:]]'
    OR p_user_agent_digest!~'^[a-f0-9]{64}$' OR p_correlation_id!~'^[A-Za-z0-9_-]{8,80}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.challenge:'||p_challenge_id::text,0));
  SELECT * INTO selected_challenge FROM saas.storefront_login_challenges
    WHERE store_id=selected_store AND id=p_challenge_id FOR UPDATE;
  IF NOT FOUND OR selected_challenge.email_digest<>p_email_digest OR selected_challenge.code_digest<>p_code_digest
    OR selected_challenge.consumed_at IS NOT NULL OR selected_challenge.locked_at IS NOT NULL OR selected_challenge.expires_at<=p_now
  THEN
    IF FOUND AND selected_challenge.consumed_at IS NULL AND selected_challenge.locked_at IS NULL THEN
      UPDATE saas.storefront_login_challenges SET attempt_count=attempt_count+1,
        locked_at=CASE WHEN attempt_count+1>=6 THEN p_now ELSE NULL END WHERE store_id=selected_store AND id=p_challenge_id;
      INSERT INTO saas.storefront_identity_audit(store_id,challenge_id,event_code,correlation_id,created_at) VALUES(selected_store,p_challenge_id,'challenge_rejected',p_correlation_id,p_now);
    END IF;
    RETURN QUERY SELECT 'challenge_invalid',NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.storefront_login_challenges SET consumed_at=p_now WHERE store_id=selected_store AND id=p_challenge_id;

  SELECT * INTO selected_account FROM saas.storefront_accounts account
    WHERE account.store_id=selected_store AND account.email_normalized=p_email FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO selected_customer FROM saas.customers customer WHERE customer.store_id=selected_store AND customer.email=p_email FOR UPDATE;
    INSERT INTO saas.storefront_accounts(id,store_id,customer_id,email,email_normalized,status,verified_at,last_login_at,created_at,updated_at)
      VALUES(p_account_id,selected_store,CASE WHEN FOUND THEN selected_customer.id ELSE NULL END,p_email,p_email,
        CASE WHEN FOUND THEN 'active' ELSE 'pending_profile' END,p_now,p_now,p_now,p_now)
      RETURNING * INTO selected_account;
    IF selected_customer.id IS NOT NULL AND selected_customer.status='archived' THEN
      UPDATE saas.customers SET status='active',archived_at=NULL,version=version+1,updated_at=p_now WHERE store_id=selected_store AND id=selected_customer.id;
    END IF;
    INSERT INTO saas.storefront_identity_audit(store_id,account_id,challenge_id,event_code,correlation_id,created_at) VALUES(selected_store,selected_account.id,p_challenge_id,'account_created',p_correlation_id,p_now);
  ELSE
    IF selected_account.status='suspended' THEN RETURN QUERY SELECT 'account_suspended',NULL::jsonb; RETURN; END IF;
    UPDATE saas.storefront_accounts SET last_login_at=p_now,updated_at=p_now,version=version+1 WHERE store_id=selected_store AND id=selected_account.id RETURNING * INTO selected_account;
  END IF;

  IF selected_account.customer_id IS NOT NULL THEN
    INSERT INTO saas.storefront_account_order_links(store_id,account_id,order_id,claim_source,claimed_at)
      SELECT orders.store_id,selected_account.id,orders.id,'verified_email',p_now FROM saas.orders orders
      JOIN saas.customers customer ON customer.store_id=orders.store_id AND customer.id=orders.customer_id
      WHERE orders.store_id=selected_store AND orders.customer_id=selected_account.customer_id AND customer.email=selected_account.email_normalized
      ON CONFLICT(store_id,order_id) DO NOTHING;
  END IF;
  selected_kind:=CASE WHEN selected_account.status='active' THEN 'full' ELSE 'registration' END;
  selected_absolute:=CASE WHEN selected_kind='full' THEN p_now+INTERVAL '30 days' ELSE p_now+INTERVAL '15 minutes' END;
  INSERT INTO saas.storefront_account_sessions(id,store_id,account_id,session_kind,key_id,credential_digest,csrf_digest,device_label,user_agent_digest,created_at,last_seen_at,idle_expires_at,absolute_expires_at)
    VALUES(p_session_id,selected_store,selected_account.id,selected_kind,p_session_key_id,p_session_digest,p_csrf_digest,p_device_label,p_user_agent_digest,p_now,p_now,
      CASE WHEN selected_kind='full' THEN p_now+INTERVAL '7 days' ELSE selected_absolute END,selected_absolute);
  INSERT INTO saas.storefront_identity_audit(store_id,account_id,challenge_id,session_id,event_code,correlation_id,created_at) VALUES(selected_store,selected_account.id,p_challenge_id,p_session_id,'challenge_consumed',p_correlation_id,p_now);
  INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at) VALUES(selected_store,selected_account.id,p_session_id,'account_login',p_correlation_id,p_now);
  IF selected_kind='full' THEN RETURN QUERY SELECT 'authenticated',pg_catalog.jsonb_build_object('profileRequired',false);
  ELSE RETURN QUERY SELECT 'profile_required',pg_catalog.jsonb_build_object('profileRequired',true); END IF;
END $f$;

CREATE FUNCTION saas.public_account_profile_complete(
  p_hostname text,p_now timestamptz,p_credentials jsonb,p_operation_id uuid,p_fingerprint text,p_customer_id uuid,
  p_first_name text,p_last_name text,p_phone text,p_full_session_id uuid,p_key_id text,p_digest text,p_csrf_digest text,
  p_device_label text,p_user_agent_digest text,p_correlation_id text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record; account saas.storefront_accounts%ROWTYPE; existing saas.storefront_identity_operations%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,true);
  IF NOT FOUND OR context.session_kind<>'registration' THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_customer_id IS NULL OR p_full_session_id IS NULL
    OR p_first_name<>pg_catalog.btrim(p_first_name) OR pg_catalog.char_length(p_first_name) NOT BETWEEN 1 AND 100 OR p_first_name~'[[:cntrl:]]'
    OR p_last_name<>pg_catalog.btrim(p_last_name) OR pg_catalog.char_length(p_last_name) NOT BETWEEN 1 AND 100 OR p_last_name~'[[:cntrl:]]'
    OR p_phone IS NOT NULL AND p_phone!~'^\+[1-9][0-9]{7,14}$' OR p_key_id!~'^[a-z][a-z0-9_-]{2,31}$'
    OR p_digest!~'^[a-f0-9]{64}$' OR p_csrf_digest!~'^[a-f0-9]{64}$' OR p_user_agent_digest!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.operation:'||p_operation_id::text,0));
  SELECT * INTO existing FROM saas.storefront_identity_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id=context.store_id AND existing.account_id=context.account_id AND existing.operation_kind='profile_complete' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN;
  END IF;
  SELECT * INTO account FROM saas.storefront_accounts WHERE store_id=context.store_id AND id=context.account_id FOR UPDATE;
  IF account.status<>'pending_profile' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,created_at,updated_at)
    VALUES(p_customer_id,context.store_id,'active',p_first_name,p_last_name,account.email_normalized,p_phone,p_now,p_now)
    ON CONFLICT(store_id,email) DO UPDATE SET status='active',archived_at=NULL,first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,phone=EXCLUDED.phone,version=saas.customers.version+1,updated_at=p_now
    RETURNING id INTO p_customer_id;
  UPDATE saas.storefront_accounts SET customer_id=p_customer_id,status='active',updated_at=p_now,version=version+1 WHERE store_id=context.store_id AND id=context.account_id RETURNING * INTO account;
  UPDATE saas.storefront_account_sessions SET revoked_at=p_now,revocation_reason='rotated' WHERE store_id=context.store_id AND id=context.session_id;
  INSERT INTO saas.storefront_account_sessions(id,store_id,account_id,session_kind,key_id,credential_digest,csrf_digest,device_label,user_agent_digest,created_at,last_seen_at,idle_expires_at,absolute_expires_at)
    VALUES(p_full_session_id,context.store_id,context.account_id,'full',p_key_id,p_digest,p_csrf_digest,p_device_label,p_user_agent_digest,p_now,p_now,p_now+INTERVAL '7 days',p_now+INTERVAL '30 days');
  INSERT INTO saas.storefront_account_order_links(store_id,account_id,order_id,claim_source,claimed_at)
    SELECT orders.store_id,account.id,orders.id,'verified_email',p_now FROM saas.orders orders JOIN saas.customers customer ON customer.store_id=orders.store_id AND customer.id=orders.customer_id
    WHERE orders.store_id=context.store_id AND customer.email=account.email_normalized ON CONFLICT(store_id,order_id) DO NOTHING;
  result:=pg_catalog.jsonb_build_object('outcome','updated','version',account.version,'replayed',false);
  INSERT INTO saas.storefront_identity_operations(operation_id,store_id,account_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_operation_id,context.store_id,context.account_id,'profile_complete',p_fingerprint,result,p_now);
  INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at) VALUES(context.store_id,context.account_id,p_full_session_id,'profile_completed',p_correlation_id,p_now);
  RETURN QUERY SELECT 'committed',result;
END $f$;

CREATE FUNCTION saas.public_account_session_get(p_hostname text,p_now timestamptz,p_credentials jsonb)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record; projection jsonb;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,true);
  IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  IF context.session_kind='registration' THEN RETURN QUERY SELECT 'profile_required',pg_catalog.jsonb_build_object('profileRequired',true); RETURN; END IF;
  UPDATE saas.storefront_account_sessions SET last_seen_at=p_now,idle_expires_at=CASE WHEN absolute_expires_at<p_now+INTERVAL '7 days' THEN absolute_expires_at ELSE p_now+INTERVAL '7 days' END WHERE store_id=context.store_id AND id=context.session_id;
  projection:=saas.storefront_identity_snapshot(context.store_id,context.account_id,context.session_id);
  RETURN QUERY SELECT 'found',projection;
END $f$;

CREATE FUNCTION saas.public_account_logout(p_hostname text,p_now timestamptz,p_credentials jsonb,p_correlation_id text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,true);
  IF FOUND THEN
    UPDATE saas.storefront_account_sessions SET revoked_at=p_now,revocation_reason='logout' WHERE store_id=context.store_id AND id=context.session_id AND revoked_at IS NULL;
    INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at) VALUES(context.store_id,context.account_id,context.session_id,'session_revoked',p_correlation_id,p_now);
  END IF;
  RETURN QUERY SELECT 'logged_out','{}'::jsonb;
END $f$;

CREATE FUNCTION saas.public_account_logout_all(p_hostname text,p_now timestamptz,p_credentials jsonb,p_correlation_id text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record; affected integer;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false);
  IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  UPDATE saas.storefront_account_sessions SET revoked_at=p_now,revocation_reason='logout_all' WHERE store_id=context.store_id AND account_id=context.account_id AND revoked_at IS NULL;
  GET DIAGNOSTICS affected=ROW_COUNT;
  INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at) VALUES(context.store_id,context.account_id,context.session_id,'sessions_revoked',p_correlation_id,p_now);
  RETURN QUERY SELECT 'logged_out',pg_catalog.jsonb_build_object('revoked',affected);
END $f$;

CREATE FUNCTION saas.public_account_profile_update(
  p_hostname text,p_now timestamptz,p_credentials jsonb,p_operation_id uuid,p_fingerprint text,p_first_name text,p_last_name text,p_phone text,p_expected_version bigint,p_correlation_id text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record; existing saas.storefront_identity_operations%ROWTYPE; account saas.storefront_accounts%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false); IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version<1 OR p_first_name<>pg_catalog.btrim(p_first_name) OR pg_catalog.char_length(p_first_name) NOT BETWEEN 1 AND 100 OR p_last_name<>pg_catalog.btrim(p_last_name) OR pg_catalog.char_length(p_last_name) NOT BETWEEN 1 AND 100 OR p_phone IS NOT NULL AND p_phone!~'^\+[1-9][0-9]{7,14}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.operation:'||p_operation_id::text,0)); SELECT * INTO existing FROM saas.storefront_identity_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id=context.store_id AND existing.account_id=context.account_id AND existing.operation_kind='profile_update' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  SELECT * INTO account FROM saas.storefront_accounts WHERE store_id=context.store_id AND id=context.account_id FOR UPDATE; IF account.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.storefront_identity_snapshot(context.store_id,context.account_id,context.session_id); RETURN; END IF;
  UPDATE saas.customers SET first_name=p_first_name,last_name=p_last_name,phone=p_phone,version=version+1,updated_at=p_now WHERE store_id=context.store_id AND id=context.customer_id;
  UPDATE saas.storefront_accounts SET version=version+1,updated_at=p_now WHERE store_id=context.store_id AND id=context.account_id RETURNING * INTO account;
  result:=pg_catalog.jsonb_build_object('outcome','updated','version',account.version,'replayed',false); INSERT INTO saas.storefront_identity_operations VALUES(p_operation_id,context.store_id,context.account_id,'profile_update',p_fingerprint,result,p_now); INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at) VALUES(context.store_id,context.account_id,context.session_id,'profile_updated',p_correlation_id,p_now); RETURN QUERY SELECT 'committed',result;
END $f$;

CREATE FUNCTION saas.public_account_address_save(
  p_hostname text,p_now timestamptz,p_credentials jsonb,p_operation_id uuid,p_fingerprint text,p_address_id uuid,p_label text,p_recipient_name text,p_line1 text,p_line2 text,p_city text,p_district text,p_postal_code text,p_country text,p_is_default boolean,p_expected_version bigint,p_correlation_id text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record; existing saas.storefront_identity_operations%ROWTYPE; current_version bigint; result jsonb;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false); IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_address_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_country<>'TR' OR p_expected_version<0 OR p_label<>pg_catalog.btrim(p_label) OR pg_catalog.char_length(p_label) NOT BETWEEN 1 AND 50 OR p_recipient_name<>pg_catalog.btrim(p_recipient_name) OR pg_catalog.char_length(p_recipient_name) NOT BETWEEN 1 AND 200 OR p_line1<>pg_catalog.btrim(p_line1) OR pg_catalog.char_length(p_line1) NOT BETWEEN 1 AND 300 OR p_city<>pg_catalog.btrim(p_city) OR pg_catalog.char_length(p_city) NOT BETWEEN 1 AND 100 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.operation:'||p_operation_id::text,0)); SELECT * INTO existing FROM saas.storefront_identity_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id=context.store_id AND existing.account_id=context.account_id AND existing.operation_kind='address_save' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  SELECT version INTO current_version FROM saas.customer_addresses WHERE store_id=context.store_id AND customer_id=context.customer_id AND id=p_address_id FOR UPDATE;
  IF FOUND AND current_version<>p_expected_version OR NOT FOUND AND p_expected_version<>0 THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF p_is_default THEN UPDATE saas.customer_addresses SET is_default=false,version=version+1,updated_at=p_now WHERE store_id=context.store_id AND customer_id=context.customer_id AND is_default AND id<>p_address_id; END IF;
  IF p_expected_version=0 THEN
    INSERT INTO saas.customer_addresses(id,store_id,customer_id,label,recipient_name,line1,line2,city,district,postal_code,country,is_default,version,created_at,updated_at)
      VALUES(p_address_id,context.store_id,context.customer_id,p_label,p_recipient_name,p_line1,p_line2,p_city,p_district,p_postal_code,p_country::char(2),p_is_default,1,p_now,p_now)
      RETURNING version INTO current_version;
  ELSE
    UPDATE saas.customer_addresses SET label=p_label,recipient_name=p_recipient_name,line1=p_line1,line2=p_line2,city=p_city,district=p_district,postal_code=p_postal_code,country=p_country::char(2),is_default=p_is_default,version=version+1,updated_at=p_now
      WHERE store_id=context.store_id AND customer_id=context.customer_id AND id=p_address_id AND version=p_expected_version
      RETURNING version INTO current_version;
    IF NOT FOUND THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  END IF;
  result:=pg_catalog.jsonb_build_object('outcome',CASE WHEN p_expected_version=0 THEN 'created' ELSE 'updated' END,'version',current_version,'replayed',false); INSERT INTO saas.storefront_identity_operations VALUES(p_operation_id,context.store_id,context.account_id,'address_save',p_fingerprint,result,p_now); INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at) VALUES(context.store_id,context.account_id,context.session_id,'address_saved',p_correlation_id,p_now); RETURN QUERY SELECT 'committed',result;
END $f$;

CREATE FUNCTION saas.public_account_address_delete(p_hostname text,p_now timestamptz,p_credentials jsonb,p_operation_id uuid,p_fingerprint text,p_address_id uuid,p_expected_version bigint,p_correlation_id text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record; existing saas.storefront_identity_operations%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false); IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.operation:'||p_operation_id::text,0)); SELECT * INTO existing FROM saas.storefront_identity_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id=context.store_id AND existing.account_id=context.account_id AND existing.operation_kind='address_delete' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  DELETE FROM saas.customer_addresses WHERE store_id=context.store_id AND customer_id=context.customer_id AND id=p_address_id AND version=p_expected_version; IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  result:=pg_catalog.jsonb_build_object('outcome','removed','version',p_expected_version,'replayed',false); INSERT INTO saas.storefront_identity_operations VALUES(p_operation_id,context.store_id,context.account_id,'address_delete',p_fingerprint,result,p_now); INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at) VALUES(context.store_id,context.account_id,context.session_id,'address_deleted',p_correlation_id,p_now); RETURN QUERY SELECT 'committed',result;
END $f$;

CREATE FUNCTION saas.public_account_favorite_set(p_hostname text,p_now timestamptz,p_credentials jsonb,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_enabled boolean,p_correlation_id text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record; existing saas.storefront_identity_operations%ROWTYPE; result jsonb; changed integer:=0;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false); IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.operation:'||p_operation_id::text,0)); SELECT * INTO existing FROM saas.storefront_identity_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id=context.store_id AND existing.account_id=context.account_id AND existing.operation_kind='favorite_set' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  IF p_enabled THEN INSERT INTO saas.storefront_account_favorites(store_id,account_id,product_id,created_at) SELECT context.store_id,context.account_id,product.id,p_now FROM saas.products product WHERE product.store_id=context.store_id AND product.id=p_product_id AND product.status='active' ON CONFLICT DO NOTHING; GET DIAGNOSTICS changed=ROW_COUNT; ELSE DELETE FROM saas.storefront_account_favorites WHERE store_id=context.store_id AND account_id=context.account_id AND product_id=p_product_id; GET DIAGNOSTICS changed=ROW_COUNT; END IF;
  result:=pg_catalog.jsonb_build_object('outcome',CASE WHEN p_enabled THEN 'created' ELSE 'removed' END,'version',1,'replayed',false); INSERT INTO saas.storefront_identity_operations VALUES(p_operation_id,context.store_id,context.account_id,'favorite_set',p_fingerprint,result,p_now); INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at) VALUES(context.store_id,context.account_id,context.session_id,'favorite_changed',p_correlation_id,p_now); RETURN QUERY SELECT 'committed',result;
END $f$;

CREATE FUNCTION saas.public_account_orders(p_hostname text,p_now timestamptz,p_credentials jsonb,p_limit integer,p_page_token text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false); IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  IF p_limit NOT BETWEEN 1 AND 50 OR p_page_token IS NOT NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(projected.value ORDER BY projected.created_at DESC,projected.order_id DESC) FROM (SELECT saas.storefront_identity_order_projection(link.store_id,link.account_id,link.order_id) value,orders.created_at,orders.id order_id FROM saas.storefront_account_order_links link JOIN saas.orders orders ON orders.store_id=link.store_id AND orders.id=link.order_id WHERE link.store_id=context.store_id AND link.account_id=context.account_id ORDER BY orders.created_at DESC,orders.id DESC LIMIT p_limit) projected),'[]'::jsonb));
END $f$;

CREATE FUNCTION saas.public_account_order_get(p_hostname text,p_now timestamptz,p_credentials jsonb,p_order_reference text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record; selected_order uuid; projection jsonb;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false); IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  IF p_order_reference!~'^[A-Z0-9][A-Z0-9-]{0,63}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT orders.id INTO selected_order FROM saas.storefront_account_order_links link JOIN saas.orders orders ON orders.store_id=link.store_id AND orders.id=link.order_id WHERE link.store_id=context.store_id AND link.account_id=context.account_id AND orders.order_number=p_order_reference;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF; projection:=saas.storefront_identity_order_projection(context.store_id,context.account_id,selected_order); RETURN QUERY SELECT 'found',projection;
END $f$;

CREATE FUNCTION saas.public_account_sessions(p_hostname text,p_now timestamptz,p_credentials jsonb)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false); IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id','device_'||pg_catalog.replace(session.id::text,'-',''),'label',session.device_label,'current',session.id=context.session_id,'lastSeenAt',saas.storefront_commerce_timestamp(session.last_seen_at),'createdAt',saas.storefront_commerce_timestamp(session.created_at)) ORDER BY session.last_seen_at DESC,session.id) FROM saas.storefront_account_sessions session WHERE session.store_id=context.store_id AND session.account_id=context.account_id AND session.session_kind='full' AND session.revoked_at IS NULL),'[]'::jsonb));
END $f$;

CREATE FUNCTION saas.public_account_session_revoke(p_hostname text,p_now timestamptz,p_credentials jsonb,p_operation_id uuid,p_fingerprint text,p_device_id text,p_correlation_id text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE context record; selected_session uuid; existing saas.storefront_identity_operations%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_credentials,false); IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  IF p_device_id!~'^device_[a-f0-9]{32}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.identity.operation:'||p_operation_id::text,0)); SELECT * INTO existing FROM saas.storefront_identity_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id=context.store_id AND existing.account_id=context.account_id AND existing.operation_kind='session_revoke' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  SELECT session.id INTO selected_session FROM saas.storefront_account_sessions session WHERE session.store_id=context.store_id AND session.account_id=context.account_id AND pg_catalog.replace(session.id::text,'-','')=pg_catalog.substr(p_device_id,8) AND session.revoked_at IS NULL;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  UPDATE saas.storefront_account_sessions SET revoked_at=p_now,revocation_reason='device_revoked' WHERE store_id=context.store_id AND id=selected_session;
  result:=pg_catalog.jsonb_build_object('outcome','revoked','version',1,'replayed',false); INSERT INTO saas.storefront_identity_operations VALUES(p_operation_id,context.store_id,context.account_id,'session_revoke',p_fingerprint,result,p_now); INSERT INTO saas.storefront_identity_audit(store_id,account_id,session_id,event_code,correlation_id,created_at) VALUES(context.store_id,context.account_id,selected_session,'session_revoked',p_correlation_id,p_now); RETURN QUERY SELECT 'committed',result;
END $f$;

REVOKE ALL ON FUNCTION
  saas.guard_storefront_identity_audit_mutation(),saas.guard_storefront_identity_operation_mutation(),saas.guard_storefront_identity_outbox_mutation(),
  saas.storefront_identity_email_valid(text),saas.storefront_identity_session_context(text,timestamptz,jsonb,boolean),
  saas.storefront_identity_snapshot(uuid,uuid,uuid),saas.storefront_identity_order_projection(uuid,uuid,uuid),
  saas.public_account_auth_start(text,timestamptz,uuid,text,text,text,text,timestamptz,uuid,text,jsonb,text),
  saas.public_account_auth_verify(text,timestamptz,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text),
  saas.public_account_profile_complete(text,timestamptz,jsonb,uuid,text,uuid,text,text,text,uuid,text,text,text,text,text,text),
  saas.public_account_session_get(text,timestamptz,jsonb),saas.public_account_logout(text,timestamptz,jsonb,text),
  saas.public_account_logout_all(text,timestamptz,jsonb,text),saas.public_account_profile_update(text,timestamptz,jsonb,uuid,text,text,text,text,bigint,text),
  saas.public_account_address_save(text,timestamptz,jsonb,uuid,text,uuid,text,text,text,text,text,text,text,text,boolean,bigint,text),
  saas.public_account_address_delete(text,timestamptz,jsonb,uuid,text,uuid,bigint,text),
  saas.public_account_favorite_set(text,timestamptz,jsonb,uuid,text,uuid,boolean,text),
  saas.public_account_orders(text,timestamptz,jsonb,integer,text),saas.public_account_order_get(text,timestamptz,jsonb,text),
  saas.public_account_sessions(text,timestamptz,jsonb),saas.public_account_session_revoke(text,timestamptz,jsonb,uuid,text,text,text)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION saas.public_account_auth_start(text,timestamptz,uuid,text,text,text,text,timestamptz,uuid,text,jsonb,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_auth_verify(text,timestamptz,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_profile_complete(text,timestamptz,jsonb,uuid,text,uuid,text,text,text,uuid,text,text,text,text,text,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_session_get(text,timestamptz,jsonb) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_logout(text,timestamptz,jsonb,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_logout_all(text,timestamptz,jsonb,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_profile_update(text,timestamptz,jsonb,uuid,text,text,text,text,bigint,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_address_save(text,timestamptz,jsonb,uuid,text,uuid,text,text,text,text,text,text,text,text,boolean,bigint,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_address_delete(text,timestamptz,jsonb,uuid,text,uuid,bigint,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_favorite_set(text,timestamptz,jsonb,uuid,text,uuid,boolean,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_orders(text,timestamptz,jsonb,integer,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_order_get(text,timestamptz,jsonb,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_sessions(text,timestamptz,jsonb) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_account_session_revoke(text,timestamptz,jsonb,uuid,text,text,text) TO celebix_saas_host_resolver;

COMMIT;
