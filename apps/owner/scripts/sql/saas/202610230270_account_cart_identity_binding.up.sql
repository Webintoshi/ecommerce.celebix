-- Join a verified full storefront account to a cart proved by the same browser.
-- Additive boundary only: never infer identity from time or mutable contacts.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.account-cart.release270',0));

DO $preflight$
DECLARE dependency record;
BEGIN
 IF to_regprocedure('saas.public_account_cart_bind(text,timestamptz,jsonb,jsonb)') IS NOT NULL
  OR to_regclass('saas.account_cart270_single_account_idx') IS NOT NULL
  OR to_regclass('saas.storefront_account_cart_links') IS NULL
  OR to_regclass('saas.abandoned_carts') IS NULL
 THEN RAISE EXCEPTION 'ACCOUNT_CART270_SOURCE_INVALID'; END IF;
 FOR dependency IN SELECT * FROM (VALUES
  ('saas.storefront_credential_candidates_valid(jsonb,boolean)','a921268767f8aeffb0fb96fa7896a62c8e89640524c4205605b31e9807de4417',false),
  ('saas.storefront_public_store(text,timestamptz)','2003d91dbdb2d024db28d06b729c6d9c9a8c09e095e5b79dc5743694ca34b103',true),
  ('saas.storefront_identity_session_context(text,timestamptz,jsonb,boolean)','112d28a3cdb6ea51eed19b36327307383483658cbd355a144bec76229e4f5c3f',true),
  ('saas.sync_durable_abandoned_cart(uuid,uuid,timestamptz)','42e013dd90e0825199dfa8481ed98a85f033d677a9f5512059722174da0ca2bc',true)
 ) reviewed(signature,body_hash,definer) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(dependency.signature)
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=dependency.body_hash
   AND p.proowner='celebix_saas_owner'::regrole
   AND p.proacl::text='{celebix_saas_owner=X/celebix_saas_owner}'
   AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
   AND p.prosecdef=dependency.definer)
  THEN RAISE EXCEPTION 'ACCOUNT_CART270_PREDECESSOR_DRIFT:%',dependency.signature; END IF;
 END LOOP;
END $preflight$;

-- Enforce and index the identity boundary for every cart, including closed links.
-- Existing duplicate authority aborts this transaction; no row is repaired/merged.
CREATE UNIQUE INDEX account_cart270_single_account_idx ON saas.storefront_account_cart_links(store_id,cart_id);

CREATE FUNCTION saas.public_account_cart_bind(
 p_hostname text,p_now timestamptz,p_account_credentials jsonb,p_cart_credentials jsonb
) RETURNS TABLE(outcome text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE
 selected_store uuid;
 context record;
 account saas.storefront_accounts%ROWTYPE;
 customer saas.customers%ROWTYPE;
 cart saas.storefront_carts%ROWTYPE;
 cart_credential saas.storefront_cart_credentials%ROWTYPE;
 abandoned saas.abandoned_carts%ROWTYPE;
 was_bound boolean;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now)
  OR saas.storefront_credential_candidates_valid(p_account_credentials,true) IS DISTINCT FROM true
  OR saas.storefront_credential_candidates_valid(p_cart_credentials,true) IS DISTINCT FROM true
 THEN RETURN QUERY SELECT 'invalid_input'::text; RETURN; END IF;
 selected_store:=saas.storefront_public_store(p_hostname,p_now);
 IF selected_store IS NULL THEN RETURN QUERY SELECT 'unavailable'::text; RETURN; END IF;
 SELECT * INTO context FROM saas.storefront_identity_session_context(p_hostname,p_now,p_account_credentials,false);
 IF NOT FOUND OR context.store_id IS DISTINCT FROM selected_store
  OR context.session_kind IS DISTINCT FROM 'full' OR context.customer_id IS NULL
 THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
 IF jsonb_array_length(p_cart_credentials)=0 THEN RETURN QUERY SELECT 'no_cart'::text; RETURN; END IF;

 -- Serialize an account's active-link replacement, then lock its current proof.
 -- The cart row is locked before sync's advisory lock, matching cart mutations.
 SELECT * INTO account FROM saas.storefront_accounts a
 WHERE a.store_id=selected_store AND a.id=context.account_id FOR UPDATE;
 IF NOT FOUND OR account.status<>'active' OR account.customer_id IS DISTINCT FROM context.customer_id
 THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
 PERFORM 1 FROM saas.storefront_account_sessions s
 WHERE s.store_id=selected_store AND s.id=context.session_id AND s.account_id=account.id
  AND s.session_kind='full' AND s.revoked_at IS NULL AND s.created_at<=p_now
  AND s.idle_expires_at>p_now AND s.absolute_expires_at>p_now
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_account_credentials) candidate
   WHERE candidate->>'keyId'=s.key_id AND candidate->>'digest'=s.credential_digest)
 FOR SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
 SELECT * INTO customer FROM saas.customers c
 WHERE c.store_id=selected_store AND c.id=account.customer_id AND c.status='active' FOR SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;

 SELECT c.* INTO cart FROM saas.storefront_carts c
 WHERE c.store_id=selected_store AND c.status='active' AND c.created_at<=p_now AND c.expires_at>p_now
  AND EXISTS(SELECT 1 FROM saas.storefront_cart_credentials proof
   WHERE proof.store_id=c.store_id AND proof.cart_id=c.id AND proof.expires_at>p_now
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_cart_credentials) candidate
     WHERE candidate->>'keyId'=proof.key_id AND candidate->>'digest'=proof.credential_digest))
 ORDER BY c.created_at DESC,c.id LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'no_cart'::text; RETURN; END IF;
 SELECT * INTO cart_credential FROM saas.storefront_cart_credentials proof
 WHERE proof.store_id=selected_store AND proof.cart_id=cart.id AND proof.expires_at>p_now
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_cart_credentials) candidate
   WHERE candidate->>'keyId'=proof.key_id AND candidate->>'digest'=proof.credential_digest)
 FOR SHARE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM saas.storefront_cart_items i WHERE i.store_id=selected_store AND i.cart_id=cart.id)
 THEN RETURN QUERY SELECT 'no_cart'::text; RETURN; END IF;

 -- A cart already associated with another verified identity is never reassigned,
 -- including closed links. Possessing a cart alone is not account authority.
 IF EXISTS(SELECT 1 FROM saas.storefront_account_cart_links link
  WHERE link.store_id=selected_store AND link.cart_id=cart.id AND link.account_id<>account.id)
 THEN RETURN QUERY SELECT 'cart_conflict'::text; RETURN; END IF;
 PERFORM 1 FROM saas.abandoned_carts a
 WHERE a.store_id=selected_store AND (a.source_cart_id=cart.id
  OR (a.source_cart_id IS NULL AND a.public_cart_digest=cart_credential.credential_digest)) FOR UPDATE;
 IF EXISTS(SELECT 1 FROM saas.abandoned_carts a WHERE a.store_id=selected_store
  AND (a.source_cart_id=cart.id OR (a.source_cart_id IS NULL AND a.public_cart_digest=cart_credential.credential_digest))
  AND a.customer_id IS NOT NULL AND a.customer_id<>customer.id)
 THEN RETURN QUERY SELECT 'cart_conflict'::text; RETURN; END IF;

 -- Existing snapshots keep their money and activity chronology. Sync is needed
 -- only for a missing source-cart projection, and only after both proofs pass.
 IF NOT EXISTS(SELECT 1 FROM saas.abandoned_carts a WHERE a.store_id=selected_store AND a.source_cart_id=cart.id) THEN
  PERFORM saas.sync_durable_abandoned_cart(selected_store,cart.id,p_now);
 END IF;
 SELECT * INTO abandoned FROM saas.abandoned_carts a
 WHERE a.store_id=selected_store AND a.source_cart_id=cart.id FOR UPDATE;
 IF NOT FOUND OR abandoned.status NOT IN('active','abandoned') OR abandoned.recovered_order_id IS NOT NULL
 THEN RETURN QUERY SELECT 'no_cart'::text; RETURN; END IF;
 IF abandoned.customer_id IS NOT NULL AND abandoned.customer_id<>customer.id
 THEN RETURN QUERY SELECT 'cart_conflict'::text; RETURN; END IF;
 was_bound:=abandoned.customer_id=customer.id AND EXISTS(SELECT 1 FROM saas.storefront_account_cart_links link
  WHERE link.store_id=selected_store AND link.account_id=account.id AND link.cart_id=cart.id AND link.status='active');
 IF was_bound IS TRUE THEN RETURN QUERY SELECT 'already_bound'::text; RETURN; END IF;

 UPDATE saas.storefront_account_cart_links link SET status='closed',updated_at=greatest(link.updated_at,p_now)
 WHERE link.store_id=selected_store AND link.account_id=account.id AND link.status='active' AND link.cart_id<>cart.id;
 INSERT INTO saas.storefront_account_cart_links(store_id,account_id,cart_id,status,linked_at,updated_at)
 VALUES(selected_store,account.id,cart.id,'active',p_now,p_now)
 ON CONFLICT(store_id,account_id,cart_id) DO UPDATE SET status='active',updated_at=greatest(saas.storefront_account_cart_links.updated_at,EXCLUDED.updated_at);
 UPDATE saas.abandoned_carts a SET customer_id=customer.id,
  customer_name=customer.first_name||' '||customer.last_name,customer_email=customer.email,
  customer_phone=coalesce(customer.phone,account.phone_normalized),version=a.version+1,
  updated_at=greatest(a.updated_at,p_now)
 WHERE a.store_id=selected_store AND a.id=abandoned.id AND (a.customer_id IS NULL OR a.customer_id=customer.id);
 RETURN QUERY SELECT 'bound'::text;
END $function$;
REVOKE ALL ON FUNCTION saas.public_account_cart_bind(text,timestamptz,jsonb,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
 celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_account_cart_bind(text,timestamptz,jsonb,jsonb) TO celebix_saas_host_resolver;
COMMIT;
