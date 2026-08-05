BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER FUNCTION saas.merchant_admin_config_valid(text,jsonb)
  RENAME TO merchant_admin_config_valid_without_order_email;
REVOKE ALL ON FUNCTION saas.merchant_admin_config_valid_without_order_email(text,jsonb)
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
       celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas
AS $function$
  SELECT CASE WHEN p_kind='notification_setting' THEN
    pg_catalog.jsonb_typeof(p_config)='object'
    AND pg_catalog.pg_column_size(p_config)<=16384
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) field(key)
      WHERE field.key NOT IN(
        'emailEnabled','smsEnabled','pushEnabled','senderLabel','replyToEmail',
        'orderNotificationsEnabled','notificationEmail'
      )
    )
    AND (NOT p_config?'emailEnabled' OR pg_catalog.jsonb_typeof(p_config->'emailEnabled')='boolean')
    AND (NOT p_config?'smsEnabled' OR pg_catalog.jsonb_typeof(p_config->'smsEnabled')='boolean')
    AND (NOT p_config?'pushEnabled' OR pg_catalog.jsonb_typeof(p_config->'pushEnabled')='boolean')
    AND (NOT p_config?'orderNotificationsEnabled' OR pg_catalog.jsonb_typeof(p_config->'orderNotificationsEnabled')='boolean')
    AND (NOT p_config?'senderLabel' OR saas.merchant_admin_setting_text(p_config->'senderLabel',1,160))
    AND (NOT p_config?'replyToEmail' OR saas.merchant_admin_setting_email(p_config->'replyToEmail'))
    AND (NOT p_config?'notificationEmail' OR saas.merchant_admin_setting_email(p_config->'notificationEmail'))
  ELSE saas.merchant_admin_config_valid_without_order_email(p_kind,p_config) END
$function$;

UPDATE saas.merchant_admin_records record
SET config=record.config||CASE
      WHEN COALESCE((record.config->>'emailEnabled')::boolean,false)
           AND record.config?'replyToEmail'
           AND saas.merchant_admin_setting_email(record.config->'replyToEmail')
      THEN pg_catalog.jsonb_build_object(
        'orderNotificationsEnabled',true,
        'notificationEmail',record.config->'replyToEmail'
      )
      ELSE pg_catalog.jsonb_build_object('orderNotificationsEnabled',false)
    END,
    version=record.version+1,
    updated_at=GREATEST(record.updated_at,CURRENT_TIMESTAMP)
WHERE record.record_kind='notification_setting'
  AND record.status IN('draft','active')
  AND NOT record.config?'orderNotificationsEnabled'
  AND NOT record.config?'notificationEmail';

CREATE FUNCTION saas.order_email_seed_notification_setting()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE principal saas.principals%ROWTYPE; store saas.stores%ROWTYPE;
BEGIN
  IF NEW.role<>'store_owner' OR NEW.status<>'active' THEN RETURN NEW; END IF;
  SELECT * INTO principal FROM saas.principals row WHERE row.id=NEW.principal_id;
  SELECT * INTO store FROM saas.stores row WHERE row.id=NEW.store_id;
  IF NOT FOUND OR NOT principal.email_verified THEN RETURN NEW; END IF;
  IF EXISTS(
    SELECT 1 FROM saas.merchant_admin_records record
    WHERE record.store_id=NEW.store_id
      AND record.record_kind='notification_setting'
      AND record.status IN('draft','active')
  ) THEN RETURN NEW; END IF;
  INSERT INTO saas.merchant_admin_records(
    id,store_id,record_kind,name,config,status,version,created_at,updated_at
  ) VALUES(
    saas.inventory_deterministic_uuid('order-email-notification-setting',NEW.store_id::text),
    NEW.store_id,'notification_setting','Sipariş bildirimleri',
    pg_catalog.jsonb_build_object(
      'emailEnabled',true,
      'orderNotificationsEnabled',true,
      'notificationEmail',principal.email,
      'senderLabel',store.name,
      'replyToEmail',principal.email
    ),
    'active',1,NEW.updated_at,NEW.updated_at
  ) ON CONFLICT(id) DO NOTHING;
  RETURN NEW;
END
$function$;

CREATE TRIGGER order_email_seed_notification_setting
  AFTER INSERT OR UPDATE ON saas.memberships
  FOR EACH ROW EXECUTE FUNCTION saas.order_email_seed_notification_setting();

CREATE TABLE saas.order_email_deliveries(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_event_id uuid NOT NULL,
  event_type text NOT NULL CHECK(event_type IN(
    'order_received','payment_completed','order_shipped','order_delivered',
    'order_cancelled','refund_completed','merchant_new_order'
  )),
  recipient_kind text NOT NULL CHECK(recipient_kind IN('customer','merchant')),
  template_version integer NOT NULL DEFAULT 1 CHECK(template_version=1),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN(
    'pending','leased','accepted','delivered','delayed','failed','bounced','complained','suppressed'
  )),
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 8),
  next_attempt_at timestamptz NOT NULL,
  lease_id uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  idempotency_key text NOT NULL CHECK(
    idempotency_key='order-email/v1/'||id::text AND char_length(idempotency_key)<=256
  ),
  first_attempt_at timestamptz,
  idempotency_expires_at timestamptz,
  seal_key_id text,
  sealed_request bytea,
  request_digest char(64),
  recipient_digest char(64),
  recipient_mask text,
  provider_message_id text,
  last_error_code text,
  last_error_retryable boolean NOT NULL DEFAULT false,
  accepted_at timestamptz,
  delivered_at timestamptz,
  provider_event_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(store_id,id),
  UNIQUE(store_id,order_id,event_type,recipient_kind),
  FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,order_event_id) REFERENCES saas.order_events(store_id,id) ON DELETE RESTRICT,
  CHECK((lease_id IS NULL)=(lease_owner IS NULL) AND (lease_id IS NULL)=(lease_expires_at IS NULL)),
  CHECK(lease_owner IS NULL OR (lease_owner=pg_catalog.btrim(lease_owner) AND lease_owner~'^[A-Za-z0-9._-]{1,128}$')),
  CHECK((sealed_request IS NULL)=(seal_key_id IS NULL) AND (sealed_request IS NULL)=(request_digest IS NULL)),
  CHECK(seal_key_id IS NULL OR seal_key_id~'^[a-z][a-z0-9_-]{2,31}$'),
  CHECK(request_digest IS NULL OR request_digest~'^[a-f0-9]{64}$'),
  CHECK(recipient_digest IS NULL OR recipient_digest~'^[a-f0-9]{64}$'),
  CHECK(recipient_mask IS NULL OR (recipient_mask=pg_catalog.btrim(recipient_mask) AND char_length(recipient_mask) BETWEEN 3 AND 320 AND recipient_mask!~'[[:cntrl:]]')),
  CHECK(provider_message_id IS NULL OR (provider_message_id=pg_catalog.btrim(provider_message_id) AND char_length(provider_message_id) BETWEEN 1 AND 256 AND provider_message_id!~'[[:cntrl:]]')),
  CHECK(last_error_code IS NULL OR last_error_code~'^[a-z][a-z0-9_]{0,63}$'),
  CHECK((first_attempt_at IS NULL)=(idempotency_expires_at IS NULL)),
  CHECK(first_attempt_at IS NULL OR idempotency_expires_at=first_attempt_at+interval '24 hours'),
  CHECK(updated_at>=created_at)
);

CREATE UNIQUE INDEX order_email_deliveries_provider_message_key
  ON saas.order_email_deliveries(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX order_email_deliveries_claim_idx
  ON saas.order_email_deliveries(next_attempt_at,created_at,id)
  WHERE status IN('pending','failed','leased') AND attempt_count<8;
CREATE INDEX order_email_deliveries_order_idx
  ON saas.order_email_deliveries(store_id,order_id,created_at,id);

CREATE TABLE saas.order_email_provider_events(
  provider_event_id text PRIMARY KEY CHECK(
    provider_event_id=pg_catalog.btrim(provider_event_id)
    AND char_length(provider_event_id) BETWEEN 1 AND 256
    AND provider_event_id!~'[[:cntrl:]]'
  ),
  provider_message_id text NOT NULL CHECK(
    provider_message_id=pg_catalog.btrim(provider_message_id)
    AND char_length(provider_message_id) BETWEEN 1 AND 256
    AND provider_message_id!~'[[:cntrl:]]'
  ),
  delivery_id uuid,
  event_type text NOT NULL CHECK(event_type IN(
    'sent','delivered','delayed','failed','bounced','complained','suppressed'
  )),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  safe_reason_code text CHECK(safe_reason_code IS NULL OR safe_reason_code~'^[a-z][a-z0-9_]{0,63}$'),
  FOREIGN KEY(delivery_id) REFERENCES saas.order_email_deliveries(id) ON DELETE RESTRICT,
  CHECK(received_at>=occurred_at-interval '7 days')
);
CREATE INDEX order_email_provider_events_message_idx
  ON saas.order_email_provider_events(provider_message_id,occurred_at,provider_event_id);

ALTER TABLE saas.order_email_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_email_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.order_email_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_email_provider_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.order_email_deliveries,saas.order_email_provider_events
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
       celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.guard_order_email_provider_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$ BEGIN RAISE EXCEPTION 'ORDER_EMAIL_PROVIDER_EVENT_IMMUTABLE'; END $function$;
CREATE TRIGGER order_email_provider_events_immutable
  BEFORE UPDATE OR DELETE ON saas.order_email_provider_events
  FOR EACH ROW EXECUTE FUNCTION saas.guard_order_email_provider_event_mutation();

CREATE FUNCTION saas.order_email_enqueue(
  p_store_id uuid,p_order_id uuid,p_order_event_id uuid,p_event_type text,
  p_recipient_kind text,p_created_at timestamptz
) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$
DECLARE delivery_id uuid;
BEGIN
  delivery_id:=pg_catalog.md5(
    'saas.order-email:'||p_store_id::text||':'||p_order_id::text||':'||p_event_type||':'||p_recipient_kind
  )::uuid;
  INSERT INTO saas.order_email_deliveries(
    id,store_id,order_id,order_event_id,event_type,recipient_kind,status,attempt_count,
    next_attempt_at,idempotency_key,created_at,updated_at
  ) VALUES(
    delivery_id,p_store_id,p_order_id,p_order_event_id,p_event_type,p_recipient_kind,
    'pending',0,p_created_at,'order-email/v1/'||delivery_id::text,p_created_at,p_created_at
  ) ON CONFLICT DO NOTHING;
END
$function$;

CREATE FUNCTION saas.order_events_enqueue_email()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$
DECLARE order_row saas.orders%ROWTYPE; notification_config jsonb;
BEGIN
  SELECT * INTO order_row FROM saas.orders
    WHERE store_id=NEW.store_id AND id=NEW.order_id;
  IF NOT FOUND OR order_row.source='manual_import' THEN RETURN NEW; END IF;

  IF NEW.event_type='order_created' THEN
    PERFORM saas.order_email_enqueue(NEW.store_id,NEW.order_id,NEW.id,'order_received','customer',NEW.created_at);
    IF order_row.payment_status='completed' THEN
      PERFORM saas.order_email_enqueue(NEW.store_id,NEW.order_id,NEW.id,'payment_completed','customer',NEW.created_at);
    END IF;
    IF order_row.source IN('storefront','quick_link','marketplace') THEN
      SELECT record.config INTO notification_config
      FROM saas.merchant_admin_records record
      WHERE record.store_id=NEW.store_id AND record.record_kind='notification_setting'
        AND record.status='active'
      ORDER BY record.updated_at DESC,record.id DESC LIMIT 1;
      IF COALESCE((notification_config->>'orderNotificationsEnabled')::boolean,false)
         AND notification_config?'notificationEmail' THEN
        PERFORM saas.order_email_enqueue(NEW.store_id,NEW.order_id,NEW.id,'merchant_new_order','merchant',NEW.created_at);
      END IF;
    END IF;
  ELSIF NEW.event_type='status_transition' AND NEW.to_value='shipped' THEN
    PERFORM saas.order_email_enqueue(NEW.store_id,NEW.order_id,NEW.id,'order_shipped','customer',NEW.created_at);
  ELSIF NEW.event_type='status_transition' AND NEW.to_value='delivered' THEN
    PERFORM saas.order_email_enqueue(NEW.store_id,NEW.order_id,NEW.id,'order_delivered','customer',NEW.created_at);
  ELSIF NEW.event_type='status_transition' AND NEW.to_value='cancelled' THEN
    PERFORM saas.order_email_enqueue(NEW.store_id,NEW.order_id,NEW.id,'order_cancelled','customer',NEW.created_at);
  ELSIF NEW.event_type='payment_transition' AND NEW.to_value='completed' THEN
    PERFORM saas.order_email_enqueue(NEW.store_id,NEW.order_id,NEW.id,'payment_completed','customer',NEW.created_at);
  ELSIF NEW.event_type='payment_transition' AND NEW.to_value='refunded' THEN
    PERFORM saas.order_email_enqueue(NEW.store_id,NEW.order_id,NEW.id,'refund_completed','customer',NEW.created_at);
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER order_events_enqueue_email
  AFTER INSERT ON saas.order_events
  FOR EACH ROW EXECUTE FUNCTION saas.order_events_enqueue_email();

CREATE FUNCTION saas.order_email_timestamp(p_value timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas
AS $function$ SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $function$;

CREATE FUNCTION saas.order_email_work_claim(
  p_worker text,p_now timestamptz,p_lease_expires_at timestamptz,p_limit integer,p_lease_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE claimed jsonb;
BEGIN
  IF p_worker IS NULL OR p_worker!~'^[A-Za-z0-9._-]{1,128}$' OR p_now IS NULL
     OR p_lease_expires_at<=p_now OR p_lease_expires_at>p_now+interval '15 minutes'
     OR p_limit NOT BETWEEN 1 AND 25 OR p_lease_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  WITH selected AS(
    SELECT delivery.id FROM saas.order_email_deliveries delivery
    WHERE delivery.status IN('pending','failed','leased')
      AND (
        delivery.status='pending'
        OR (delivery.status='failed' AND delivery.last_error_retryable)
        OR (delivery.status='leased' AND delivery.lease_expires_at<=p_now)
      )
      AND delivery.attempt_count<8
      AND delivery.next_attempt_at<=p_now
      AND (delivery.idempotency_expires_at IS NULL OR delivery.idempotency_expires_at>p_now)
      AND (delivery.lease_expires_at IS NULL OR delivery.lease_expires_at<=p_now)
    ORDER BY delivery.next_attempt_at,delivery.created_at,delivery.id
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), updated AS(
    UPDATE saas.order_email_deliveries delivery
    SET status='leased',attempt_count=delivery.attempt_count+1,
        lease_id=p_lease_id,lease_owner=p_worker,lease_expires_at=p_lease_expires_at,
        last_error_retryable=false,updated_at=p_now
    FROM selected WHERE delivery.id=selected.id
    RETURNING delivery.*
  )
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'deliveryId',delivery.id,'storeId',delivery.store_id,'orderId',delivery.order_id,
    'eventType',delivery.event_type,'recipientKind',delivery.recipient_kind,
    'attemptCount',delivery.attempt_count,'idempotencyKey',delivery.idempotency_key,
    'firstAttemptAt',CASE WHEN delivery.first_attempt_at IS NULL THEN NULL ELSE saas.order_email_timestamp(delivery.first_attempt_at) END,
    'idempotencyExpiresAt',CASE WHEN delivery.idempotency_expires_at IS NULL THEN NULL ELSE saas.order_email_timestamp(delivery.idempotency_expires_at) END,
    'sealKeyId',delivery.seal_key_id,
    'sealedRequest',CASE WHEN delivery.sealed_request IS NULL THEN NULL ELSE pg_catalog.encode(delivery.sealed_request,'base64') END,
    'requestDigest',delivery.request_digest,
    'projection',CASE WHEN delivery.sealed_request IS NOT NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
      'recipient',CASE WHEN delivery.recipient_kind='customer' THEN order_row.customer_email ELSE notification.config->>'notificationEmail' END,
      'senderLabel',COALESCE(notification.config->>'senderLabel',store.name),
      'replyTo',COALESCE(notification.config->>'replyToEmail',general.config->>'supportEmail'),
      'storeName',store.name,'primaryColor',COALESCE(design.published_config->'brand'->>'primaryColor','#171717'),
      'logoUrl',media.public_url,'storefrontOrigin','https://'||store_domain.hostname,
      'adminOrigin','https://'||admin_domain.hostname,
      'orderNumber',order_row.order_number,'customerName',order_row.customer_name,
      'currency',order_row.currency,'subtotalCents',order_row.subtotal_cents,
      'shippingCents',order_row.shipping_cents,'discountCents',order_row.discount_cents,
      'totalCents',order_row.total_cents,'shippingAddress',order_row.shipping_address,
      'tracking',order_row.tracking,
      'items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'productName',item.product_name,'variantName',item.variant_name,'sku',item.sku,
        'unitPriceCents',item.unit_price_cents,'quantity',item.quantity,
        'discountCents',item.discount_cents,'lineTotalCents',item.line_total_cents
      ) ORDER BY item.position,item.id) FROM saas.order_items item
        WHERE item.store_id=order_row.store_id AND item.order_id=order_row.id),'[]'::jsonb)
    ) END
  ) ORDER BY delivery.next_attempt_at,delivery.created_at,delivery.id) INTO claimed
  FROM updated delivery
  JOIN saas.orders order_row ON order_row.store_id=delivery.store_id AND order_row.id=delivery.order_id
  JOIN saas.stores store ON store.id=delivery.store_id
  LEFT JOIN LATERAL(SELECT record.config FROM saas.merchant_admin_records record
    WHERE record.store_id=delivery.store_id AND record.record_kind='notification_setting' AND record.status='active'
    ORDER BY record.updated_at DESC,record.id DESC LIMIT 1) notification ON true
  LEFT JOIN LATERAL(SELECT record.config FROM saas.merchant_admin_records record
    WHERE record.store_id=delivery.store_id AND record.record_kind='general_setting' AND record.status='active'
    ORDER BY record.updated_at DESC,record.id DESC LIMIT 1) general ON true
  LEFT JOIN saas.storefront_designs design ON design.store_id=delivery.store_id
  LEFT JOIN saas.storefront_design_media media ON media.store_id=delivery.store_id
    AND media.id=CASE WHEN design.published_config->'brand'->'logo'->>'mediaId'~'^[0-9a-f-]{36}$'
      THEN (design.published_config->'brand'->'logo'->>'mediaId')::uuid ELSE NULL END
    AND media.status='active'
  LEFT JOIN LATERAL(SELECT domain.hostname FROM saas.store_domains domain
    WHERE domain.store_id=delivery.store_id AND domain.status='active'
    ORDER BY domain.is_primary DESC,domain.created_at,domain.id LIMIT 1) store_domain ON true
  LEFT JOIN LATERAL(SELECT domain.hostname FROM saas.admin_domains domain
    WHERE domain.store_id=delivery.store_id AND domain.status='active'
    ORDER BY domain.canonical DESC,domain.created_at,domain.id LIMIT 1) admin_domain ON true;
  RETURN QUERY SELECT CASE WHEN claimed IS NULL THEN 'empty' ELSE 'claimed' END,
    pg_catalog.jsonb_build_object('items',COALESCE(claimed,'[]'::jsonb));
END
$function$;

CREATE FUNCTION saas.order_email_work_seal(
  p_delivery_id uuid,p_lease_id uuid,p_worker text,p_now timestamptz,p_seal_key_id text,
  p_sealed_request bytea,p_request_digest text,p_recipient_digest text,p_recipient_mask text,
  p_first_attempt_at timestamptz,p_idempotency_expires_at timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF p_delivery_id IS NULL OR p_lease_id IS NULL OR p_worker!~'^[A-Za-z0-9._-]{1,128}$'
     OR p_now IS NULL OR p_seal_key_id!~'^[a-z][a-z0-9_-]{2,31}$'
     OR p_sealed_request IS NULL OR pg_catalog.octet_length(p_sealed_request) NOT BETWEEN 32 AND 262144
     OR p_request_digest!~'^[a-f0-9]{64}$' OR p_recipient_digest!~'^[a-f0-9]{64}$'
     OR p_recipient_mask IS NULL OR p_recipient_mask<>pg_catalog.btrim(p_recipient_mask)
     OR char_length(p_recipient_mask) NOT BETWEEN 3 AND 320 OR p_recipient_mask~'[[:cntrl:]]'
     OR p_first_attempt_at<>p_now OR p_idempotency_expires_at<>p_first_attempt_at+interval '24 hours' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.order_email_deliveries delivery SET
    seal_key_id=COALESCE(delivery.seal_key_id,p_seal_key_id),
    sealed_request=COALESCE(delivery.sealed_request,p_sealed_request),
    request_digest=COALESCE(delivery.request_digest,p_request_digest),
    recipient_digest=COALESCE(delivery.recipient_digest,p_recipient_digest),
    recipient_mask=COALESCE(delivery.recipient_mask,p_recipient_mask),
    first_attempt_at=COALESCE(delivery.first_attempt_at,p_first_attempt_at),
    idempotency_expires_at=COALESCE(delivery.idempotency_expires_at,p_idempotency_expires_at),
    updated_at=p_now
  WHERE delivery.id=p_delivery_id AND delivery.status='leased'
    AND delivery.lease_id=p_lease_id AND delivery.lease_owner=p_worker
    AND delivery.lease_expires_at>p_now
    AND (delivery.request_digest IS NULL OR delivery.request_digest=p_request_digest);
  IF NOT FOUND THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'sealed',pg_catalog.jsonb_build_object('deliveryId',p_delivery_id);
END
$function$;

CREATE FUNCTION saas.order_email_work_accept(
  p_delivery_id uuid,p_lease_id uuid,p_worker text,p_now timestamptz,p_provider_message_id text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE provider_event record;
BEGIN
  IF p_delivery_id IS NULL OR p_lease_id IS NULL OR p_worker!~'^[A-Za-z0-9._-]{1,128}$'
     OR p_provider_message_id IS NULL OR p_provider_message_id<>pg_catalog.btrim(p_provider_message_id)
     OR char_length(p_provider_message_id) NOT BETWEEN 1 AND 256 OR p_provider_message_id~'[[:cntrl:]]' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.order_email_deliveries delivery SET status='accepted',provider_message_id=p_provider_message_id,
    accepted_at=p_now,lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,last_error_code=NULL,
    last_error_retryable=false,updated_at=p_now
  WHERE delivery.id=p_delivery_id AND delivery.status='leased' AND delivery.lease_id=p_lease_id
    AND delivery.lease_owner=p_worker AND delivery.lease_expires_at>p_now
    AND delivery.sealed_request IS NOT NULL;
  IF NOT FOUND THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;
  FOR provider_event IN
    SELECT event.event_type,event.occurred_at,event.safe_reason_code
    FROM saas.order_email_provider_events event
    WHERE event.provider_message_id=p_provider_message_id
    ORDER BY event.occurred_at,event.provider_event_id
  LOOP
    PERFORM saas.order_email_apply_provider_state(
      p_delivery_id,provider_event.event_type,provider_event.occurred_at,provider_event.safe_reason_code
    );
  END LOOP;
  RETURN QUERY SELECT 'accepted',pg_catalog.jsonb_build_object('deliveryId',p_delivery_id);
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'provider_reference_conflict',NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.order_email_work_fail(
  p_delivery_id uuid,p_lease_id uuid,p_worker text,p_now timestamptz,p_error_code text,
  p_retryable boolean,p_next_attempt_at timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE may_retry boolean;
BEGIN
  IF p_delivery_id IS NULL OR p_lease_id IS NULL OR p_worker!~'^[A-Za-z0-9._-]{1,128}$'
     OR p_error_code!~'^[a-z][a-z0-9_]{0,63}$' OR p_retryable IS NULL
     OR (p_retryable AND (p_next_attempt_at IS NULL OR p_next_attempt_at<=p_now))
     OR (NOT p_retryable AND p_next_attempt_at IS NOT NULL) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT p_retryable AND delivery.attempt_count<8
    AND delivery.idempotency_expires_at IS NOT NULL
    AND p_next_attempt_at<delivery.idempotency_expires_at INTO may_retry
  FROM saas.order_email_deliveries delivery
  WHERE delivery.id=p_delivery_id AND delivery.status='leased' AND delivery.lease_id=p_lease_id
    AND delivery.lease_owner=p_worker AND delivery.lease_expires_at>p_now FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'lease_lost',NULL::jsonb; RETURN; END IF;
  UPDATE saas.order_email_deliveries SET status='failed',next_attempt_at=CASE WHEN may_retry THEN p_next_attempt_at ELSE p_now END,
    lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,last_error_code=p_error_code,
    last_error_retryable=may_retry,failed_at=p_now,updated_at=p_now WHERE id=p_delivery_id;
  RETURN QUERY SELECT CASE WHEN may_retry THEN 'retry_scheduled' ELSE 'failed' END,
    pg_catalog.jsonb_build_object('deliveryId',p_delivery_id,'retryable',may_retry);
END
$function$;

CREATE FUNCTION saas.order_email_apply_provider_state(
  p_delivery_id uuid,p_event_type text,p_occurred_at timestamptz,p_reason text
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$
BEGIN
  UPDATE saas.order_email_deliveries delivery SET
    status=CASE
      WHEN delivery.status IN('bounced','complained','suppressed') THEN delivery.status
      WHEN delivery.status='delivered' AND p_event_type NOT IN('bounced','complained','suppressed') THEN delivery.status
      WHEN p_event_type='complained' THEN 'complained'
      WHEN p_event_type='bounced' THEN 'bounced'
      WHEN p_event_type='suppressed' THEN 'suppressed'
      WHEN p_event_type='failed' THEN 'failed'
      WHEN p_event_type='delivered' THEN 'delivered'
      WHEN p_event_type='delayed' AND delivery.status<>'delivered' THEN 'delayed'
      WHEN p_event_type='sent' AND delivery.status IN('pending','leased') THEN 'accepted'
      ELSE delivery.status END,
    delivered_at=CASE WHEN p_event_type='delivered' THEN p_occurred_at ELSE delivery.delivered_at END,
    provider_event_at=GREATEST(COALESCE(delivery.provider_event_at,p_occurred_at),p_occurred_at),
    last_error_code=CASE WHEN p_event_type IN('failed','bounced','complained','suppressed')
      THEN COALESCE(p_reason,'provider_'||p_event_type) ELSE delivery.last_error_code END,
    last_error_retryable=false,updated_at=GREATEST(delivery.updated_at,p_occurred_at)
  WHERE delivery.id=p_delivery_id
    AND (
      delivery.provider_event_at IS NULL
      OR p_occurred_at>=delivery.provider_event_at
      OR p_event_type IN('bounced','complained','suppressed')
    );
END
$function$;

CREATE FUNCTION saas.order_email_provider_event_record(
  p_provider_event_id text,p_provider_message_id text,p_event_type text,
  p_occurred_at timestamptz,p_received_at timestamptz,p_safe_reason_code text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE selected_delivery uuid;
BEGIN
  IF p_provider_event_id IS NULL OR p_provider_event_id<>pg_catalog.btrim(p_provider_event_id)
     OR char_length(p_provider_event_id) NOT BETWEEN 1 AND 256 OR p_provider_event_id~'[[:cntrl:]]'
     OR p_provider_message_id IS NULL OR p_provider_message_id<>pg_catalog.btrim(p_provider_message_id)
     OR char_length(p_provider_message_id) NOT BETWEEN 1 AND 256 OR p_provider_message_id~'[[:cntrl:]]'
     OR p_event_type NOT IN('sent','delivered','delayed','failed','bounced','complained','suppressed')
     OR p_occurred_at IS NULL OR p_received_at IS NULL
     OR (p_safe_reason_code IS NOT NULL AND p_safe_reason_code!~'^[a-z][a-z0-9_]{0,63}$') THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.order_email_provider_events WHERE provider_event_id=p_provider_event_id) THEN
    RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object('providerEventId',p_provider_event_id); RETURN;
  END IF;
  SELECT id INTO selected_delivery FROM saas.order_email_deliveries
    WHERE provider_message_id=p_provider_message_id FOR UPDATE;
  INSERT INTO saas.order_email_provider_events(
    provider_event_id,provider_message_id,delivery_id,event_type,occurred_at,received_at,safe_reason_code
  ) VALUES(p_provider_event_id,p_provider_message_id,selected_delivery,p_event_type,p_occurred_at,p_received_at,p_safe_reason_code);
  IF selected_delivery IS NOT NULL THEN
    PERFORM saas.order_email_apply_provider_state(selected_delivery,p_event_type,p_occurred_at,p_safe_reason_code);
  END IF;
  RETURN QUERY SELECT 'recorded',pg_catalog.jsonb_build_object('providerEventId',p_provider_event_id,'matched',selected_delivery IS NOT NULL);
EXCEPTION WHEN unique_violation THEN
  RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object('providerEventId',p_provider_event_id);
END
$function$;

CREATE FUNCTION saas.order_email_admin_projection(p_store_id uuid,p_delivery_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id',delivery.id,'eventType',delivery.event_type,'recipientKind',delivery.recipient_kind,
    'recipientMask',COALESCE(delivery.recipient_mask,'•••'),
    'status',delivery.status,
    'occurredAt',saas.order_email_timestamp(COALESCE(delivery.provider_event_at,delivery.accepted_at,delivery.failed_at,delivery.created_at)),
    'canRetry',delivery.status='failed' AND delivery.last_error_retryable AND delivery.attempt_count<8
      AND delivery.idempotency_expires_at>p_now
  ) FROM saas.order_email_deliveries delivery
  WHERE delivery.store_id=p_store_id AND delivery.id=p_delivery_id
$function$;

CREATE FUNCTION saas.order_email_admin_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_order_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_order_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=p_order_id) THEN
    RETURN QUERY SELECT 'order_not_found',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((
    SELECT pg_catalog.jsonb_agg(saas.order_email_admin_projection(p_store_id,delivery.id,p_now)
      ORDER BY delivery.created_at,delivery.id)
    FROM saas.order_email_deliveries delivery
    WHERE delivery.store_id=p_store_id AND delivery.order_id=p_order_id
  ),'[]'::jsonb));
END
$function$;

CREATE FUNCTION saas.order_email_admin_retry(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_order_id uuid,p_delivery_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_order_id IS NULL OR p_delivery_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  UPDATE saas.order_email_deliveries delivery SET next_attempt_at=p_now,updated_at=p_now
  WHERE delivery.store_id=p_store_id AND delivery.order_id=p_order_id AND delivery.id=p_delivery_id
    AND delivery.status='failed' AND delivery.last_error_retryable AND delivery.attempt_count<8
    AND delivery.idempotency_expires_at>p_now
    AND (delivery.lease_expires_at IS NULL OR delivery.lease_expires_at<=p_now);
  IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'scheduled',saas.order_email_admin_projection(p_store_id,p_delivery_id,p_now);
END
$function$;

ALTER FUNCTION saas.merchant_admin_config_valid(text,jsonb) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_seed_notification_setting() OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_enqueue(uuid,uuid,uuid,text,text,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_events_enqueue_email() OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_timestamp(timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_work_claim(text,timestamptz,timestamptz,integer,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_work_seal(uuid,uuid,text,timestamptz,text,bytea,text,text,text,timestamptz,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_work_accept(uuid,uuid,text,timestamptz,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_work_fail(uuid,uuid,text,timestamptz,text,boolean,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_apply_provider_state(uuid,text,timestamptz,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_provider_event_record(text,text,text,timestamptz,timestamptz,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_admin_projection(uuid,uuid,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.order_email_admin_retry(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid) OWNER TO celebix_saas_owner;

REVOKE ALL ON FUNCTION saas.merchant_admin_config_valid(text,jsonb),
  saas.order_email_seed_notification_setting(),
  saas.order_email_enqueue(uuid,uuid,uuid,text,text,timestamptz),saas.order_events_enqueue_email(),
  saas.order_email_timestamp(timestamptz),
  saas.order_email_work_claim(text,timestamptz,timestamptz,integer,uuid),
  saas.order_email_work_seal(uuid,uuid,text,timestamptz,text,bytea,text,text,text,timestamptz,timestamptz),
  saas.order_email_work_accept(uuid,uuid,text,timestamptz,text),
  saas.order_email_work_fail(uuid,uuid,text,timestamptz,text,boolean,timestamptz),
  saas.order_email_apply_provider_state(uuid,text,timestamptz,text),
  saas.order_email_provider_event_record(text,text,text,timestamptz,timestamptz,text),
  saas.order_email_admin_projection(uuid,uuid,timestamptz),
  saas.order_email_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.order_email_admin_retry(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
     celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION saas.merchant_admin_config_valid(text,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.order_email_work_claim(text,timestamptz,timestamptz,integer,uuid),
  saas.order_email_work_seal(uuid,uuid,text,timestamptz,text,bytea,text,text,text,timestamptz,timestamptz),
  saas.order_email_work_accept(uuid,uuid,text,timestamptz,text),
  saas.order_email_work_fail(uuid,uuid,text,timestamptz,text,boolean,timestamptz),
  saas.order_email_provider_event_record(text,text,text,timestamptz,timestamptz,text)
TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.order_email_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.order_email_admin_retry(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid)
TO celebix_saas_app;

COMMIT;
