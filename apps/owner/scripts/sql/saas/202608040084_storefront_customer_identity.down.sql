BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
DECLARE table_name text; row_count bigint;
BEGIN
  IF pg_catalog.current_setting('celebix.allow_storefront_customer_identity_down',true) IS DISTINCT FROM 'on'
  THEN RAISE EXCEPTION 'STOREFRONT_CUSTOMER_IDENTITY_DOWN_BLOCKED'; END IF;
  FOREACH table_name IN ARRAY ARRAY[
    'storefront_accounts','storefront_login_challenges','storefront_account_sessions',
    'storefront_account_order_links','storefront_account_favorites','storefront_account_cart_links',
    'storefront_identity_operations','storefront_identity_audit','storefront_identity_email_outbox'
  ] LOOP
    IF pg_catalog.to_regclass('saas.'||table_name) IS NULL THEN RAISE EXCEPTION 'STOREFRONT_CUSTOMER_IDENTITY_DOWN_SOURCE_INVALID'; END IF;
    EXECUTE pg_catalog.format('SELECT pg_catalog.count(*) FROM saas.%I',table_name) INTO row_count;
    IF row_count<>0 THEN RAISE EXCEPTION 'STOREFRONT_CUSTOMER_IDENTITY_DOWN_BLOCKED'; END IF;
  END LOOP;
  IF pg_catalog.to_regprocedure('saas.public_cart_resolve(text,timestamp with time zone,jsonb)') IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_CUSTOMER_IDENTITY_DOWN_SOURCE_INVALID'; END IF;
END
$f$;

DROP FUNCTION saas.public_account_session_revoke(text,timestamptz,jsonb,uuid,text,text,text);
DROP FUNCTION saas.public_account_sessions(text,timestamptz,jsonb);
DROP FUNCTION saas.public_account_order_get(text,timestamptz,jsonb,text);
DROP FUNCTION saas.public_account_orders(text,timestamptz,jsonb,integer,text);
DROP FUNCTION saas.public_account_favorite_set(text,timestamptz,jsonb,uuid,text,uuid,boolean,text);
DROP FUNCTION saas.public_account_address_delete(text,timestamptz,jsonb,uuid,text,uuid,bigint,text);
DROP FUNCTION saas.public_account_address_save(text,timestamptz,jsonb,uuid,text,uuid,text,text,text,text,text,text,text,text,boolean,bigint,text);
DROP FUNCTION saas.public_account_profile_update(text,timestamptz,jsonb,uuid,text,text,text,text,bigint,text);
DROP FUNCTION saas.public_account_logout_all(text,timestamptz,jsonb,text);
DROP FUNCTION saas.public_account_logout(text,timestamptz,jsonb,text);
DROP FUNCTION saas.public_account_session_get(text,timestamptz,jsonb);
DROP FUNCTION saas.public_account_profile_complete(text,timestamptz,jsonb,uuid,text,uuid,text,text,text,uuid,text,text,text,text,text,text);
DROP FUNCTION saas.public_account_auth_verify(text,timestamptz,uuid,text,text,text,uuid,uuid,text,text,text,text,text,text);
DROP FUNCTION saas.public_account_auth_start(text,timestamptz,uuid,text,text,text,text,timestamptz,uuid,text,jsonb,text);
DROP FUNCTION saas.storefront_identity_order_projection(uuid,uuid,uuid);
DROP FUNCTION saas.storefront_identity_snapshot(uuid,uuid,uuid);
DROP FUNCTION saas.storefront_identity_session_context(text,timestamptz,jsonb,boolean);
DROP FUNCTION saas.storefront_identity_email_valid(text);

DROP TABLE saas.storefront_identity_email_outbox;
DROP TABLE saas.storefront_identity_audit;
DROP TABLE saas.storefront_identity_operations;
DROP TABLE saas.storefront_account_cart_links;
DROP TABLE saas.storefront_account_favorites;
DROP TABLE saas.storefront_account_order_links;
DROP TABLE saas.storefront_account_sessions;
DROP TABLE saas.storefront_login_challenges;
DROP TABLE saas.storefront_accounts;

DROP FUNCTION saas.guard_storefront_identity_outbox_mutation();
DROP FUNCTION saas.guard_storefront_identity_operation_mutation();
DROP FUNCTION saas.guard_storefront_identity_audit_mutation();

COMMIT;
