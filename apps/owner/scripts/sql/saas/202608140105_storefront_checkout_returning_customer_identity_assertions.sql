BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE
  wrapper_definition text;
  helper_definition text;
BEGIN
  IF pg_catalog.to_regprocedure('saas.storefront_checkout_reconcile_customer_identity_v105(uuid,timestamp with time zone,jsonb,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_checkout_complete_without_available_stock_v090(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)') IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_RETURNING_CUSTOMER_IDENTITY_CONTRACT_INVALID: functions'; END IF;

  wrapper_definition:=pg_catalog.pg_get_functiondef('saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)'::pg_catalog.regprocedure);
  helper_definition:=pg_catalog.pg_get_functiondef('saas.storefront_checkout_reconcile_customer_identity_v105(uuid,timestamp with time zone,jsonb,jsonb)'::pg_catalog.regprocedure);

  IF pg_catalog.strpos(wrapper_definition,'storefront_checkout_reconcile_customer_identity_v105')=0
    OR pg_catalog.strpos(wrapper_definition,'public_checkout_complete_without_available_stock_v090')=0
    OR pg_catalog.strpos(wrapper_definition,'storefront_available_stock')=0
    OR pg_catalog.strpos(wrapper_definition,'pg_advisory_xact_lock')=0
    OR pg_catalog.strpos(wrapper_definition,'operation_replayed')=0
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_RETURNING_CUSTOMER_IDENTITY_CONTRACT_INVALID: wrapper'; END IF;

  IF pg_catalog.strpos(helper_definition,'email_customer.status<>''active''')=0
    OR pg_catalog.strpos(helper_definition,'phone_customer.id IS NOT NULL AND phone_customer.id<>email_customer.id')=0
    OR pg_catalog.strpos(helper_definition,'selected_customer.email<>incoming_email')=0
    OR pg_catalog.strpos(helper_definition,'last_seen_at=pg_catalog.GREATEST(last_seen_at,p_now)')=0
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_RETURNING_CUSTOMER_IDENTITY_CONTRACT_INVALID: helper'; END IF;

  IF NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app','saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_checkout_reconcile_customer_identity_v105(uuid,timestamp with time zone,jsonb,jsonb)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.storefront_checkout_reconcile_customer_identity_v105(uuid,timestamp with time zone,jsonb,jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_RETURNING_CUSTOMER_IDENTITY_CONTRACT_INVALID: acl'; END IF;
END
$f$;

COMMIT;
