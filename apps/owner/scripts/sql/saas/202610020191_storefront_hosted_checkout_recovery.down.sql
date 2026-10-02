-- Existing 35 minute sessions retain their immutable deadlines and the compatible constraint.
-- Only future begin operations return to 15 minutes; no financial row is rewritten.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $rollback$
DECLARE definition text;
  original text:='p_now+CASE WHEN v_authority->>''providerCode''=''paytr_iframe'' THEN pg_catalog.interval ''35 minutes'' ELSE pg_catalog.interval ''15 minutes'' END';
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace='saas'::regnamespace
    AND proname='public_storefront_hosted_checkout_begin_v2'
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(prosrc,'UTF8')),'hex')
      ='1de0f6b10992a25b21361d5d66a912c0c5708ab55f9a90a0a30a0b37f2ff6876')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace='saas'::regnamespace
      AND proname='public_storefront_hosted_checkout_status'
      AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(prosrc,'UTF8')),'hex')
        ='ae19f59f9cb3ef924d2d34d467e42008e4c21554823b0540dd62ada48e145908')
  THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_ROLLBACK_SOURCE_INVALID'; END IF;
  SELECT pg_catalog.pg_get_functiondef(oid) INTO definition FROM pg_catalog.pg_proc
    WHERE pronamespace='saas'::regnamespace AND proname='public_storefront_hosted_checkout_begin_v2';
  IF (pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,original,'')))/pg_catalog.length(original)<>3
  THEN RAISE EXCEPTION 'HOSTED_CHECKOUT_RECOVERY_ROLLBACK_HOLD_INVALID'; END IF;
  EXECUTE pg_catalog.replace(definition,original,'p_now+pg_catalog.interval ''15 minutes''');
END $rollback$;
DROP FUNCTION saas.public_storefront_hosted_checkout_resume(text,timestamptz,text,jsonb,bigint);

CREATE OR REPLACE FUNCTION saas.public_storefront_hosted_checkout_status(
  p_hostname text,p_now timestamptz,p_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_store uuid; selected_session saas.storefront_hosted_checkout_sessions%ROWTYPE;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_credentials,false)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT session.* INTO selected_session FROM saas.storefront_hosted_checkout_sessions session
  JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
    ON candidate->>'keyId'=session.payment_session_key_id
    AND candidate->>'digest'=session.payment_session_credential_digest
  WHERE session.store_id=selected_store ORDER BY session.created_at DESC,session.id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF selected_session.payment_session_expires_at<=p_now
  THEN RETURN QUERY SELECT 'session_expired',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'sessionId',selected_session.id,
    'status',CASE WHEN selected_session.hold_expires_at<=p_now
      AND selected_session.status IN('active','provider_ready','processing') THEN 'expired' ELSE selected_session.status END,
    'safeCode',CASE WHEN selected_session.hold_expires_at<=p_now
      AND selected_session.status IN('active','provider_ready','processing') THEN 'session_expired' ELSE selected_session.safe_code END,
    'version',selected_session.version,
    'paymentSessionExpiresAt',saas.storefront_commerce_timestamp(selected_session.payment_session_expires_at)
  );
END
$f$;

COMMIT;
