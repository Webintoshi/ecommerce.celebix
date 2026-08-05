BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $order_transactional_email_assertions$
DECLARE
  missing_functions integer;
  table_grants integer;
  trigger_definition text;
  delivery_rls record;
  provider_rls record;
BEGIN
  IF pg_catalog.to_regclass('saas.order_email_deliveries') IS NULL
     OR pg_catalog.to_regclass('saas.order_email_provider_events') IS NULL THEN
    RAISE EXCEPTION 'ORDER_TRANSACTIONAL_EMAIL_CONTRACT_INVALID: tables';
  END IF;

  SELECT class.relrowsecurity,class.relforcerowsecurity INTO delivery_rls
  FROM pg_catalog.pg_class class WHERE class.oid='saas.order_email_deliveries'::regclass;
  SELECT class.relrowsecurity,class.relforcerowsecurity INTO provider_rls
  FROM pg_catalog.pg_class class WHERE class.oid='saas.order_email_provider_events'::regclass;
  IF NOT delivery_rls.relrowsecurity OR NOT delivery_rls.relforcerowsecurity
     OR NOT provider_rls.relrowsecurity OR NOT provider_rls.relforcerowsecurity THEN
    RAISE EXCEPTION 'ORDER_TRANSACTIONAL_EMAIL_CONTRACT_INVALID: rls';
  END IF;

  SELECT count(*) INTO missing_functions FROM (VALUES
    ('saas.order_email_work_claim(text,timestamp with time zone,timestamp with time zone,integer,uuid)'::regprocedure),
    ('saas.order_email_work_seal(uuid,uuid,text,timestamp with time zone,text,bytea,text,text,text,timestamp with time zone,timestamp with time zone)'::regprocedure),
    ('saas.order_email_work_accept(uuid,uuid,text,timestamp with time zone,text)'::regprocedure),
    ('saas.order_email_work_fail(uuid,uuid,text,timestamp with time zone,text,boolean,timestamp with time zone)'::regprocedure),
    ('saas.order_email_provider_event_record(text,text,text,timestamp with time zone,timestamp with time zone,text)'::regprocedure),
    ('saas.order_email_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'::regprocedure),
    ('saas.order_email_admin_retry(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid)'::regprocedure)
  ) AS expected(proc) WHERE expected.proc IS NULL;
  IF missing_functions<>0 THEN
    RAISE EXCEPTION 'ORDER_TRANSACTIONAL_EMAIL_CONTRACT_INVALID: functions';
  END IF;

  SELECT pg_catalog.pg_get_triggerdef(trigger_row.oid) INTO trigger_definition
  FROM pg_catalog.pg_trigger trigger_row
  WHERE trigger_row.tgrelid='saas.order_events'::regclass
    AND trigger_row.tgname='order_events_enqueue_email'
    AND NOT trigger_row.tgisinternal;
  IF trigger_definition IS NULL
     OR trigger_definition!~'AFTER INSERT ON saas[.]order_events'
     OR trigger_definition!~'EXECUTE FUNCTION saas[.]order_events_enqueue_email[(][)]' THEN
    RAISE EXCEPTION 'ORDER_TRANSACTIONAL_EMAIL_CONTRACT_INVALID: trigger';
  END IF;

  SELECT count(*) INTO table_grants FROM information_schema.role_table_grants
  WHERE table_schema='saas'
    AND table_name IN('order_email_deliveries','order_email_provider_events')
    AND grantee IN(
      'PUBLIC','celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver',
      'celebix_saas_identity','celebix_saas_bootstrap','celebix_saas_observability','celebix_saas_migrator'
    );
  IF table_grants<>0 THEN
    RAISE EXCEPTION 'ORDER_TRANSACTIONAL_EMAIL_CONTRACT_INVALID: table grants';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'celebix_saas_workflow',
       'saas.order_email_work_claim(text,timestamp with time zone,timestamp with time zone,integer,uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'celebix_saas_app',
       'saas.order_email_work_claim(text,timestamp with time zone,timestamp with time zone,integer,uuid)',
       'EXECUTE'
     )
     OR NOT pg_catalog.has_function_privilege(
       'celebix_saas_app',
       'saas.order_email_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
       'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'celebix_saas_workflow',
       'saas.order_email_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'ORDER_TRANSACTIONAL_EMAIL_CONTRACT_INVALID: function grants';
  END IF;

  IF NOT saas.merchant_admin_config_valid(
       'notification_setting',
       '{"emailEnabled":true,"orderNotificationsEnabled":true,"notificationEmail":"siparis@example.com"}'::jsonb
     )
     OR saas.merchant_admin_config_valid(
       'notification_setting',
       '{"orderNotificationsEnabled":true,"notificationEmail":"not-an-email"}'::jsonb
     ) THEN
    RAISE EXCEPTION 'ORDER_TRANSACTIONAL_EMAIL_CONTRACT_INVALID: settings';
  END IF;
END
$order_transactional_email_assertions$;

COMMIT;
