-- Extend only future PayTR holds; recover existing immutable payments through source credentials.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $preflight$
DECLARE reviewed record; definition text; original text:='p_now+pg_catalog.interval ''15 minutes''';
  replacement text:='p_now+CASE WHEN v_authority->>''providerCode''=''paytr_iframe'' THEN pg_catalog.interval ''35 minutes'' ELSE pg_catalog.interval ''15 minutes'' END';
BEGIN
  IF pg_catalog.to_regprocedure('saas.public_storefront_hosted_checkout_resume(text,timestamptz,text,jsonb,bigint)') IS NOT NULL
  THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_ALREADY_EXISTS'; END IF;
  FOR reviewed IN SELECT * FROM (VALUES
    ('public_storefront_hosted_checkout_begin_v2','348cee046b1266e3148b2a1bf169da62025ce40f774df168c958c223c76fe734','v'),
    ('public_storefront_hosted_checkout_status','b1b863f758f147db06dd29200f498c756fe4cbb79d01f65f20eda2d3521d4742','s'),
    ('public_storefront_hosted_checkout_presentation','30b2310a55f5df566279d8ca0b311a20a7ef3bb106669b868e9567d19c5bb118','s')
  ) AS prior(name,body_hash,volatility) LOOP
    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc WHERE pronamespace='saas'::regnamespace AND proname=reviewed.name)<>1
      OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace='saas'::regnamespace AND proname=reviewed.name
        AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(prosrc,'UTF8')),'hex')=reviewed.body_hash
        AND proowner='celebix_saas_owner'::regrole AND prosecdef AND provolatile::text=reviewed.volatility
        AND proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
        AND proacl::text='{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}')
    THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_PREDECESSOR_INVALID'; END IF;
  END LOOP;
  SELECT pg_catalog.pg_get_functiondef(oid) INTO definition FROM pg_catalog.pg_proc
    WHERE pronamespace='saas'::regnamespace AND proname='public_storefront_hosted_checkout_begin_v2';
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,original,'')))/pg_catalog.length(original)<>3
  THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_HOLD_REPLACEMENT_INVALID'; END IF;
  EXECUTE pg_catalog.replace(definition,original,replacement);
  SELECT pg_catalog.pg_get_constraintdef(oid) INTO definition FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.storefront_hosted_checkout_sessions'::regclass
      AND conname='storefront_hosted_checkout_sessions_check4' AND contype='c' AND convalidated;
  original:='(hold_expires_at = (created_at + ''00:15:00''::interval))';
  IF definition IS NULL OR pg_catalog.strpos(definition,original)=0
    OR (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,original,'')))/pg_catalog.length(original)<>1
  THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_TIMESTAMP_CONSTRAINT_INVALID'; END IF;
  ALTER TABLE saas.storefront_hosted_checkout_sessions DROP CONSTRAINT storefront_hosted_checkout_sessions_check4;
  EXECUTE 'ALTER TABLE saas.storefront_hosted_checkout_sessions ADD CONSTRAINT storefront_hosted_checkout_sessions_check4 '
    ||pg_catalog.replace(definition,original,
      '((hold_expires_at = (created_at + ''00:15:00''::interval)) OR (provider_code = ''paytr_iframe'' AND hold_expires_at = (created_at + ''00:35:00''::interval)))');
END $preflight$;

CREATE OR REPLACE FUNCTION saas.public_storefront_hosted_checkout_status(
  p_hostname text,p_now timestamptz,p_credentials jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_store uuid; selected_session saas.storefront_hosted_checkout_sessions%ROWTYPE;
BEGIN
  IF p_hostname IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now
    OR saas.storefront_credential_candidates_valid(p_credentials,false) IS DISTINCT FROM TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT session.* INTO selected_session FROM saas.storefront_hosted_checkout_sessions session
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=session.payment_session_key_id AND candidate->>'digest'=session.payment_session_credential_digest
    WHERE session.store_id=selected_store ORDER BY session.created_at DESC,session.id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  -- The payment credential remains usable for observation only until the existing receipt deadline.
  IF selected_session.receipt_expires_at<=p_now
  THEN RETURN QUERY SELECT 'session_expired',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'sessionId',selected_session.id,
    'status',CASE WHEN selected_session.hold_expires_at<=p_now AND selected_session.status IN('active','provider_ready','processing')
      THEN 'processing' ELSE selected_session.status END,
    'safeCode',CASE WHEN selected_session.hold_expires_at<=p_now AND selected_session.status IN('active','provider_ready','processing')
      THEN 'provider_confirmation_pending' ELSE selected_session.safe_code END,
    'version',selected_session.version,
    'paymentSessionExpiresAt',saas.storefront_commerce_timestamp(selected_session.payment_session_expires_at)
  );
END $fn$;

CREATE FUNCTION saas.public_storefront_hosted_checkout_resume(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_expected_source_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE selected_store uuid; selected_session saas.storefront_hosted_checkout_sessions%ROWTYPE;
  source_status text; source_version bigint; own_credentials jsonb; observation record; presentation_record record;
  presentation jsonb:=NULL;
BEGIN
  IF p_hostname IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR pg_catalog.date_trunc('milliseconds',p_now)<>p_now OR p_kind IS NULL OR p_kind NOT IN('cart','buy_now')
    OR saas.storefront_credential_candidates_valid(p_credentials,false) IS DISTINCT FROM TRUE
    OR (p_expected_source_version IS NOT NULL AND p_expected_source_version NOT BETWEEN 1 AND 9007199254740991)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF p_kind='cart' THEN
    SELECT session.* INTO selected_session FROM saas.storefront_hosted_checkout_sessions session
      JOIN saas.storefront_carts cart ON cart.store_id=session.store_id AND cart.id=session.cart_id
      JOIN saas.storefront_cart_credentials credential ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
      JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
        ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
      WHERE session.store_id=selected_store AND session.created_at<=p_now
        AND (session.receipt_expires_at>p_now OR session.status IN('active','provider_ready','processing'))
        AND cart.status IN('active','converted') AND cart.expires_at>p_now AND credential.expires_at>p_now
      ORDER BY session.created_at DESC,session.id LIMIT 1;
    IF FOUND THEN SELECT cart.status,cart.version INTO source_status,source_version FROM saas.storefront_carts cart
      WHERE cart.store_id=selected_store AND cart.id=selected_session.cart_id; END IF;
  ELSE
    SELECT session.* INTO selected_session FROM saas.storefront_hosted_checkout_sessions session
      JOIN saas.storefront_checkout_intents intent ON intent.store_id=session.store_id AND intent.id=session.intent_id
      JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
        ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
      WHERE session.store_id=selected_store AND session.created_at<=p_now
        AND (session.receipt_expires_at>p_now OR session.status IN('active','provider_ready','processing'))
        AND intent.kind='buy_now' AND intent.status IN('active','converted') AND intent.expires_at>p_now
      ORDER BY session.created_at DESC,session.id LIMIT 1;
    IF FOUND THEN SELECT intent.status,1::bigint INTO source_status,source_version FROM saas.storefront_checkout_intents intent
      WHERE intent.store_id=selected_store AND intent.id=selected_session.intent_id; END IF;
  END IF;
  IF selected_session.id IS NULL OR source_status IS NULL
  THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  own_credentials:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'keyId',selected_session.payment_session_key_id,'digest',selected_session.payment_session_credential_digest));
  IF selected_session.receipt_expires_at>p_now THEN
    SELECT * INTO observation FROM saas.public_storefront_hosted_checkout_status(p_hostname,p_now,own_credentials);
    IF observation.outcome IS DISTINCT FROM 'found'
    THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  ELSE
    -- After the receipt deadline only a still-valid source credential may observe a pending payment.
    -- Payment/receipt cookie authority and terminal observation remain capped at their original deadline.
    SELECT 'found'::text outcome,pg_catalog.jsonb_build_object(
      'sessionId',selected_session.id,'status','processing','safeCode','provider_confirmation_pending',
      'version',selected_session.version,
      'paymentSessionExpiresAt',saas.storefront_commerce_timestamp(selected_session.payment_session_expires_at)
    ) result_payload INTO observation;
  END IF;
  -- Reuse only an existing presentation for the exact unchanged active source.
  IF selected_session.receipt_expires_at>p_now AND selected_session.status='provider_ready'
    AND source_status='active' AND selected_session.source_version=source_version
    AND (p_expected_source_version IS NULL OR p_expected_source_version=source_version)
    AND selected_session.hold_expires_at>p_now AND selected_session.payment_session_expires_at>p_now
    AND selected_session.presentation_expires_at>p_now THEN
    SELECT * INTO presentation_record FROM saas.public_storefront_hosted_checkout_presentation(p_hostname,p_now,own_credentials);
    IF presentation_record.outcome='found' THEN presentation:=presentation_record.result_payload; END IF;
  END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'createdAt',saas.storefront_commerce_timestamp(selected_session.created_at),
    'status',observation.result_payload,'presentation',presentation);
END $fn$;

REVOKE ALL ON FUNCTION saas.public_storefront_hosted_checkout_resume(text,timestamptz,text,jsonb,bigint)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
  celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_storefront_hosted_checkout_resume(text,timestamptz,text,jsonb,bigint)
TO celebix_saas_host_resolver;

COMMIT;
