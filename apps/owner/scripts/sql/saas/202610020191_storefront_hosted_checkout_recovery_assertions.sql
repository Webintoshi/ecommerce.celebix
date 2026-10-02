BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL statement_timeout='30s';

DO $contract$
DECLARE signature regprocedure; reviewed record; selected record; observed record; credentials jsonb;
  source_credentials jsonb; alternate_hostname text; source_version bigint; latest_session uuid; latest_created_at timestamptz;
  late_observation_time timestamptz; source_deadline timestamptz;
  constraint_expression text; accepted boolean;
  captured_cases integer:=0; source_cases integer:=0; cross_store_cases integer:=0; pending_cases integer:=0; late_pending_cases integer:=0;
  selected_now timestamptz:=pg_catalog.date_trunc('milliseconds',pg_catalog.transaction_timestamp());
BEGIN
  SELECT pg_catalog.regexp_replace(pg_catalog.pg_get_constraintdef(oid),'^CHECK \((.*)\)$','\1')
    INTO constraint_expression FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.storefront_hosted_checkout_sessions'::regclass
      AND conname='storefront_hosted_checkout_sessions_check4' AND convalidated;
  IF constraint_expression IS NULL THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_TIMESTAMP_CONSTRAINT_MISSING'; END IF;
  FOR reviewed IN SELECT * FROM (VALUES
    ('paytr_iframe',15,true),('paytr_iframe',35,true),('iyzico_iframe',15,true),('iyzico_iframe',35,false),('paytr_iframe',36,false)
  ) AS cases(provider,minutes,expected) LOOP
    EXECUTE 'SELECT '||constraint_expression||' FROM (SELECT $1::text provider_code,$2::timestamptz created_at,
      $2::timestamptz updated_at,$2::timestamptz+pg_catalog.make_interval(mins=>$3::integer) hold_expires_at,
      $2::timestamptz+pg_catalog.make_interval(mins=>$3::integer) payment_session_expires_at,
      $2::timestamptz+interval ''1 day'' receipt_expires_at,$2::timestamptz+interval ''30 days'' customer_expires_at) source'
      INTO accepted USING reviewed.provider,selected_now,reviewed.minutes;
    IF accepted IS DISTINCT FROM reviewed.expected THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_HOLD_BOUNDARY_INVALID'; END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    pg_catalog.to_regprocedure('saas.public_storefront_hosted_checkout_resume(text,timestamptz,text,jsonb,bigint)'),
    pg_catalog.to_regprocedure('saas.public_storefront_hosted_checkout_status(text,timestamptz,jsonb)')
  ] LOOP
    IF signature IS NULL THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_READER_MISSING'; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=signature
      AND proowner='celebix_saas_owner'::regrole AND prosecdef AND provolatile='s'
      AND proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
      AND proacl::text='{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}')
    THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_READER_AUTHORITY_INVALID'; END IF;
  END LOOP;
  SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_resume(
    'invalid.example',selected_now,'cart','[{"keyId":"invalid","digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb,NULL);
  IF observed.outcome IS DISTINCT FROM 'not_found' OR observed.result_payload IS NOT NULL
  THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_UNTRUSTED_HOST_ACCEPTED'; END IF;
  SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_resume(
    'invalid.example',selected_now,'cart','[]'::jsonb,NULL);
  IF observed.outcome IS DISTINCT FROM 'invalid_input' OR observed.result_payload IS NOT NULL
  THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_EMPTY_AUTHORITY_ACCEPTED'; END IF;
  SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_resume(
    'invalid.example',selected_now,'customer','[{"keyId":"invalid","digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb,NULL);
  IF observed.outcome IS DISTINCT FROM 'invalid_input' THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_INVALID_KIND_ACCEPTED'; END IF;
  -- Real rows are observed only. No checkout, inventory or financial mutation occurs here.
  FOR selected IN SELECT session.*, domain.hostname
    FROM saas.storefront_hosted_checkout_sessions session
    JOIN saas.store_domains domain ON domain.store_id=session.store_id
    WHERE session.receipt_expires_at>selected_now AND session.created_at<=selected_now
      AND saas.storefront_public_store(domain.hostname,selected_now)=session.store_id
    ORDER BY session.created_at DESC,session.id LIMIT 25
  LOOP
    credentials:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'keyId',selected.payment_session_key_id,'digest',selected.payment_session_credential_digest));
    SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_status(selected.hostname,selected_now,credentials);
    IF observed.outcome IS DISTINCT FROM 'found' OR observed.result_payload->>'sessionId' IS DISTINCT FROM selected.id::text
      OR observed.result_payload ?| ARRAY['customerId','customerEmail','customerPhone','providerReference','operationId']
    THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_OBSERVATION_UNAVAILABLE'; END IF;
    IF selected.hold_expires_at<=selected_now AND selected.status IN('active','provider_ready','processing')
      AND (observed.result_payload->>'status' NOT IN('processing','captured','failed','cancelled','expired','stock_conflict')
        OR (observed.result_payload->>'status'='processing'
          AND observed.result_payload->>'safeCode'<>'provider_confirmation_pending'))
    THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_PENDING_TRUTH_LOST'; END IF;
    IF selected.hold_expires_at<=selected_now AND selected.status IN('active','provider_ready','processing')
    THEN pending_cases:=pending_cases+1; END IF;
    IF selected.cart_id IS NOT NULL THEN
      SELECT pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('keyId',credential.key_id,'digest',credential.credential_digest)),cart.version,
        least(cart.expires_at,credential.expires_at)
        INTO source_credentials,source_version,source_deadline FROM saas.storefront_cart_credentials credential
        JOIN saas.storefront_carts cart ON cart.store_id=credential.store_id AND cart.id=credential.cart_id
        WHERE cart.store_id=selected.store_id AND cart.id=selected.cart_id AND cart.status IN('active','converted')
          AND credential.expires_at>selected_now AND cart.expires_at>selected_now;
      IF FOUND THEN
        SELECT session.id,session.created_at INTO latest_session,latest_created_at FROM saas.storefront_hosted_checkout_sessions session
          WHERE session.store_id=selected.store_id AND session.cart_id=selected.cart_id
            AND session.receipt_expires_at>selected_now AND session.created_at<=selected_now
          ORDER BY session.created_at DESC,session.id LIMIT 1;
        SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_resume(selected.hostname,selected_now,'cart',source_credentials,source_version);
        IF observed.outcome IS DISTINCT FROM 'found' OR observed.result_payload->'status'->>'sessionId' IS DISTINCT FROM latest_session::text
          OR observed.result_payload->>'createdAt' IS DISTINCT FROM saas.storefront_commerce_timestamp(latest_created_at)
          OR observed.result_payload ?| ARRAY['customerId','customerEmail','customerPhone','providerReference','operationId']
        THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_SOURCE_AUTHORITY_INVALID'; END IF;
        source_cases:=source_cases+1;
        SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_resume(selected.hostname,selected_now,'cart',source_credentials,
          CASE WHEN source_version=1 THEN 2 ELSE 1 END);
        IF observed.outcome IS DISTINCT FROM 'found' OR observed.result_payload->'presentation' IS DISTINCT FROM 'null'::jsonb
        THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_CHANGED_SOURCE_PRESENTATION_EXPOSED'; END IF;
        late_observation_time:=selected.receipt_expires_at+interval '1 millisecond';
        IF selected.status IN('active','provider_ready','processing') AND source_deadline>late_observation_time
          AND saas.storefront_public_store(selected.hostname,late_observation_time)=selected.store_id THEN
          SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_resume(selected.hostname,late_observation_time,'cart',source_credentials,source_version);
          IF observed.outcome IS DISTINCT FROM 'found' OR observed.result_payload->'status'->>'status' IS DISTINCT FROM 'processing'
            OR observed.result_payload->'status'->>'safeCode' IS DISTINCT FROM 'provider_confirmation_pending'
            OR observed.result_payload->'presentation' IS DISTINCT FROM 'null'::jsonb
          THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_LONG_PENDING_SOURCE_LOST'; END IF;
          late_pending_cases:=late_pending_cases+1;
          SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_status(selected.hostname,late_observation_time,credentials);
          IF observed.outcome IS DISTINCT FROM 'session_expired' OR observed.result_payload IS NOT NULL
          THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_LONG_PENDING_COOKIE_AUTH_EXTENDED'; END IF;
          SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_resume(selected.hostname,source_deadline,'cart',source_credentials,source_version);
          IF observed.outcome IS DISTINCT FROM 'not_found' OR observed.result_payload IS NOT NULL
          THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_EXPIRED_SOURCE_ACCEPTED'; END IF;
        END IF;
        SELECT domain.hostname INTO alternate_hostname FROM saas.store_domains domain
          WHERE domain.store_id<>selected.store_id AND saas.storefront_public_store(domain.hostname,selected_now)=domain.store_id LIMIT 1;
        IF FOUND THEN
          SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_resume(alternate_hostname,selected_now,'cart',source_credentials,NULL);
          IF observed.outcome IS DISTINCT FROM 'not_found' OR observed.result_payload IS NOT NULL
          THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_CROSS_STORE_AUTHORITY_ACCEPTED'; END IF;
          cross_store_cases:=cross_store_cases+1;
        END IF;
      END IF;
    END IF;
  END LOOP;
  -- A genuine previously captured session can be checked at an observation time within its receipt window.
  -- This reads the existing terminal result; it neither fabricates nor writes a captured payment.
  FOR selected IN SELECT session.*,domain.hostname,greatest(session.created_at,domain.verified_at) observation_time
    FROM saas.storefront_hosted_checkout_sessions session
    JOIN saas.store_domains domain ON domain.store_id=session.store_id
    WHERE session.status='captured' AND domain.verified_at<session.receipt_expires_at
      AND saas.storefront_public_store(domain.hostname,greatest(session.created_at,domain.verified_at))=session.store_id
    ORDER BY session.created_at DESC,session.id LIMIT 25
  LOOP
    credentials:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'keyId',selected.payment_session_key_id,'digest',selected.payment_session_credential_digest));
    SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_status(selected.hostname,selected.observation_time,credentials);
    IF observed.outcome IS DISTINCT FROM 'found' OR observed.result_payload->>'status' IS DISTINCT FROM 'captured'
      OR observed.result_payload->>'sessionId' IS DISTINCT FROM selected.id::text
    THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_CAPTURED_TRUTH_LOST'; END IF;
    captured_cases:=captured_cases+1;
    SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_status(selected.hostname,selected.receipt_expires_at,credentials);
    IF observed.outcome IS DISTINCT FROM 'session_expired' OR observed.result_payload IS NOT NULL
    THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_OBSERVATION_DEADLINE_BYPASSED'; END IF;
    IF selected.cart_id IS NOT NULL THEN
      SELECT pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('keyId',credential.key_id,'digest',credential.credential_digest))
        INTO source_credentials FROM saas.storefront_cart_credentials credential
        JOIN saas.storefront_carts cart ON cart.store_id=credential.store_id AND cart.id=credential.cart_id
        WHERE cart.store_id=selected.store_id AND cart.id=selected.cart_id AND cart.status IN('active','converted')
          AND credential.expires_at>selected.receipt_expires_at AND cart.expires_at>selected.receipt_expires_at;
      IF FOUND THEN
        SELECT * INTO observed FROM saas.public_storefront_hosted_checkout_resume(selected.hostname,selected.receipt_expires_at,'cart',source_credentials,NULL);
        IF observed.outcome NOT IN('found','not_found')
          OR (observed.outcome='found' AND observed.result_payload->'status'->>'sessionId'=selected.id::text)
          OR (observed.outcome='not_found' AND observed.result_payload IS NOT NULL)
        THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_TERMINAL_SOURCE_DEADLINE_BYPASSED'; END IF;
      END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'recovery191_readonly_cases pending=%,late_pending=%,source=%,cross_store=%,captured=%,hold_boundaries=5',
    pending_cases,late_pending_cases,source_cases,cross_store_cases,captured_cases;
END $contract$;

ROLLBACK;
