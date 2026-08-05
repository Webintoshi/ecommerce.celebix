BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $order_transactional_email_down_guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.order_email_deliveries)
     OR EXISTS(SELECT 1 FROM saas.order_email_provider_events)
     OR EXISTS(
       SELECT 1 FROM saas.merchant_admin_records record
       WHERE record.record_kind='notification_setting'
         AND (record.config?'orderNotificationsEnabled' OR record.config?'notificationEmail')
     ) THEN
    RAISE EXCEPTION 'ORDER_TRANSACTIONAL_EMAIL_DOWN_BLOCKED';
  END IF;
END
$order_transactional_email_down_guard$;

DROP TRIGGER order_email_seed_notification_setting ON saas.memberships;
DROP FUNCTION saas.order_email_seed_notification_setting();
DROP FUNCTION saas.order_email_admin_retry(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid);
DROP FUNCTION saas.order_email_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.order_email_admin_projection(uuid,uuid,timestamptz);
DROP FUNCTION saas.order_email_provider_event_record(text,text,text,timestamptz,timestamptz,text);
DROP FUNCTION saas.order_email_apply_provider_state(uuid,text,timestamptz,text);
DROP FUNCTION saas.order_email_work_fail(uuid,uuid,text,timestamptz,text,boolean,timestamptz);
DROP FUNCTION saas.order_email_work_accept(uuid,uuid,text,timestamptz,text);
DROP FUNCTION saas.order_email_work_seal(uuid,uuid,text,timestamptz,text,bytea,text,text,text,timestamptz,timestamptz);
DROP FUNCTION saas.order_email_work_claim(text,timestamptz,timestamptz,integer,uuid);
DROP FUNCTION saas.order_email_timestamp(timestamptz);
DROP TRIGGER order_events_enqueue_email ON saas.order_events;
DROP FUNCTION saas.order_events_enqueue_email();
DROP FUNCTION saas.order_email_enqueue(uuid,uuid,uuid,text,text,timestamptz);
DROP TRIGGER order_email_provider_events_immutable ON saas.order_email_provider_events;
DROP FUNCTION saas.guard_order_email_provider_event_mutation();
DROP TABLE saas.order_email_provider_events;
DROP TABLE saas.order_email_deliveries;

DROP FUNCTION saas.merchant_admin_config_valid(text,jsonb);
ALTER FUNCTION saas.merchant_admin_config_valid_without_order_email(text,jsonb)
  RENAME TO merchant_admin_config_valid;
ALTER FUNCTION saas.merchant_admin_config_valid(text,jsonb) OWNER TO celebix_saas_owner;
REVOKE ALL ON FUNCTION saas.merchant_admin_config_valid(text,jsonb)
  FROM PUBLIC,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,
       celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_config_valid(text,jsonb) TO celebix_saas_app;

COMMIT;
