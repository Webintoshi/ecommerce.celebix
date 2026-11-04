BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET LOCAL check_function_bodies=off;
DO $predecessor$BEGIN
 IF to_regclass('saas.loyalty503_functions')IS NULL OR to_regclass('saas.loyalty_checkout_authorizations')IS NULL OR to_regclass('saas.loyalty_pos_redemptions')IS NULL OR to_regprocedure('saas.loyalty_pos_projection_v1(uuid,uuid,jsonb)')IS NULL THEN RAISE EXCEPTION 'LOYALTY504_REQUIRES_503';END IF;
END $predecessor$;
CREATE INDEX IF NOT EXISTS loyalty504_hosted_group ON saas.storefront_hosted_checkout_sessions(store_id,promotion_reservation_group_id)WHERE promotion_reservation_group_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS saas.loyalty504_functions(identity text PRIMARY KEY,definition text NOT NULL,patched_hash text NOT NULL);
ALTER TABLE saas.loyalty504_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.loyalty504_functions FORCE ROW LEVEL SECURITY;
DO $policy$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='saas.loyalty504_functions'::regclass AND polname='loyalty504_owner')THEN CREATE POLICY loyalty504_owner ON saas.loyalty504_functions TO celebix_saas_owner USING(true)WITH CHECK(true);END IF;END $policy$;
REVOKE ALL ON saas.loyalty504_functions FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
DO $drift$DECLARE r record;BEGIN
 IF NOT EXISTS(SELECT 1 FROM saas.loyalty504_functions)THEN
  FOR r IN SELECT *FROM saas.loyalty503_functions WHERE identity IN('saas.promotion_expire_due_reservations_v1(timestamp with time zone,integer)','saas.promotion_commit_reservation_group_v1(uuid,uuid,text,uuid,uuid,timestamp with time zone)','saas.promotion_commit_integrity_valid_v1(uuid,uuid)')LOOP
   IF r.patched_hash IS NULL OR encode(sha256(convert_to(pg_get_functiondef(r.identity::regprocedure),'UTF8')),'hex')<>r.patched_hash THEN RAISE EXCEPTION 'LOYALTY504_PREDECESSOR_DRIFT:%',r.identity;END IF;
  END LOOP;
 END IF;
 FOR r IN SELECT *FROM saas.loyalty504_functions LOOP IF encode(sha256(convert_to(pg_get_functiondef(r.identity::regprocedure),'UTF8')),'hex')<>r.patched_hash THEN RAISE EXCEPTION 'LOYALTY504_FUNCTION_DRIFT:%',r.identity;END IF;END LOOP;END $drift$;
CREATE OR REPLACE FUNCTION saas.loyalty504_patch(signature text,changes jsonb)RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
DECLARE original text;definition text;change jsonb;anchor text;BEGIN
 IF EXISTS(SELECT 1 FROM saas.loyalty504_functions WHERE identity=signature)THEN RETURN;END IF;
 original:=pg_get_functiondef(signature::regprocedure);definition:=original;
 FOR change IN SELECT value FROM jsonb_array_elements(changes)LOOP anchor:=change->>0;IF anchor=''OR(length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>coalesce((change->>2)::integer,1)THEN RAISE EXCEPTION 'LOYALTY504_PATCH_ANCHOR:%:%',signature,anchor;END IF;definition:=replace(definition,anchor,change->>1);END LOOP;
 EXECUTE definition;INSERT INTO saas.loyalty504_functions VALUES(signature,original,encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex'));
END $f$;

-- Only the original native checkout and immutable bank-attempt authority can extend a reward hold.
CREATE OR REPLACE FUNCTION saas.loyalty504_hosted_proof_v1(s uuid,session_id uuid,group_id uuid,order_id uuid,n timestamptz,captured boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
SELECT $5 IS NOT NULL AND isfinite($5)AND EXISTS(
 SELECT 1 FROM saas.storefront_hosted_checkout_sessions h
 JOIN saas.payment_attempts a ON a.store_id=h.store_id AND a.id=h.payment_attempt_id
 JOIN saas.storefront_hosted_checkout_operations op ON op.store_id=h.store_id AND op.operation_id=a.id AND op.session_id=h.id AND op.operation_kind='start'
 JOIN saas.payment_callback_bindings cb ON cb.store_id=a.store_id AND cb.attempt_id=a.id AND cb.payment_method_id=a.payment_method_id AND cb.profile_id=a.profile_id AND cb.provider_code=a.provider_code AND cb.environment=a.environment AND cb.credential_version=a.credential_version
 WHERE h.store_id=$1 AND h.id=$2 AND h.promotion_reservation_group_id IS NOT DISTINCT FROM $3
  AND((h.terminal_at IS NULL AND h.status IN('active','provider_ready','processing'))OR($6 AND h.status='captured'AND h.terminal_at=$5))AND h.created_at<=$5
  AND h.evaluator_authority_digest IS NOT NULL
  AND a.payment_method_id=h.payment_method_id AND a.profile_id=h.profile_id AND a.provider_code=h.provider_code AND a.environment=h.environment AND a.credential_version=h.credential_version
  AND a.execution_adapter_version=h.execution_adapter_version AND a.execution_evidence_digest=h.execution_evidence_digest
  AND a.order_reference=h.order_reference AND a.amount_minor=h.total_minor AND a.currency=h.currency AND a.created_at=h.created_at
  AND CASE WHEN $6 THEN h.order_id=$4 AND((a.status='captured'AND a.updated_at=$5)OR(h.status='captured'AND h.terminal_at=$5 AND a.status IN('captured','partially_refunded','refunded')AND EXISTS(SELECT 1 FROM saas.payment_attempt_events evidence WHERE evidence.store_id=a.store_id AND evidence.attempt_id=a.id AND evidence.profile_id=a.profile_id AND evidence.provider_code=a.provider_code AND evidence.environment=a.environment AND evidence.to_status='captured'AND evidence.source IN('callback','reconciliation')AND evidence.occurred_at=$5 AND evidence.attempt_version<=a.version)))ELSE a.updated_at<=$5 AND a.status IN('awaiting_customer','submitted','authorized','provider_outcome_unknown','reconciliation_required')END
  AND op.result_payload->'authority'->>'authorityDigest'=h.commerce_authority_digest
  AND op.result_payload->'authority'->>'evaluatorAuthorityDigest'=h.evaluator_authority_digest
  AND op.result_payload->'authority'->>'orderId'=h.order_id::text AND op.result_payload->'authority'->>'customerId'=h.customer_id::text
  AND op.result_payload->'authority'->>'currency'=h.currency
  AND op.result_payload->'authority'->>'sourceKind'=CASE WHEN h.cart_id IS NOT NULL THEN 'cart'ELSE 'buy_now'END
  AND op.result_payload->'authority'->>'sourceId'=coalesce(h.cart_id,h.intent_id)::text AND(op.result_payload->'authority'->>'sourceVersion')::bigint=h.source_version
  AND op.result_payload->'authority'->>'paymentMethodId'=h.payment_method_id::text AND op.result_payload->'authority'->>'profileId'=h.profile_id::text
  AND(op.result_payload->'authority'->>'totalMinor')::bigint=h.total_minor AND op.result_payload->'authority'->'items'=h.item_snapshot
  AND EXISTS(SELECT 1 FROM saas.loyalty_checkout_authorizations authz JOIN saas.storefront_accounts account ON account.store_id=authz.store_id AND account.id=authz.account_id AND account.customer_id=authz.customer_id
    WHERE authz.store_id=$1 AND authz.operation_id=a.id AND authz.hosted_session_id=h.id AND authz.reservation_group_id IS NOT DISTINCT FROM $3 AND authz.customer_id=h.customer_id AND authz.created_at<=h.created_at AND authz.expires_at>h.created_at
    AND($3 IS NULL OR EXISTS(SELECT 1 FROM saas.promotion_usage_reservations r JOIN saas.loyalty_rewards reward ON reward.store_id=r.store_id AND reward.code_id=r.code_id
      WHERE r.store_id=$1 AND r.reservation_group_id=$3 AND r.source_kind='hosted_checkout'AND r.source_reference=h.id::text AND r.customer_id=h.customer_id AND r.currency=h.currency AND reward.customer_id=authz.customer_id AND reward.account_id=authz.account_id AND authz.normalized_codes @> jsonb_build_array(r.normalized_code)
      AND NOT EXISTS(SELECT 1 FROM saas.promotion_redemptions redemption WHERE redemption.store_id=$1 AND redemption.code_id=r.code_id AND(redemption.reservation_group_id<>$3 OR redemption.order_id<>h.order_id)))))
  AND($3 IS NOT NULL OR NOT EXISTS(SELECT 1 FROM saas.promotion_usage_reservations r WHERE r.store_id=$1 AND r.source_kind='hosted_checkout'AND r.source_reference=h.id::text))
  AND NOT EXISTS(SELECT 1 FROM saas.promotion_usage_reservations r WHERE r.store_id=$1 AND r.reservation_group_id=$3 AND(r.source_kind<>'hosted_checkout'OR r.source_reference<>h.id::text OR r.customer_id IS DISTINCT FROM h.customer_id OR r.currency<>h.currency))
)
$f$;
CREATE OR REPLACE FUNCTION saas.loyalty504_pending_session_v1(s uuid,session_id uuid,n timestamptz)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
SELECT EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions h WHERE h.store_id=$1 AND h.id=$2 AND saas.loyalty504_hosted_proof_v1($1,h.id,h.promotion_reservation_group_id,NULL,$3,false))
$f$;
CREATE OR REPLACE FUNCTION saas.loyalty504_pending_group_v1(s uuid,group_id uuid,n timestamptz)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
SELECT EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions h WHERE h.store_id=$1 AND h.promotion_reservation_group_id=$2 AND saas.loyalty504_hosted_proof_v1($1,h.id,$2,NULL,$3,false))
$f$;
CREATE OR REPLACE FUNCTION saas.loyalty504_captured_group_v1(s uuid,group_id uuid,order_id uuid,n timestamptz)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
SELECT EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions h WHERE h.store_id=$1 AND h.order_id=$3 AND h.promotion_reservation_group_id IS NOT DISTINCT FROM $2 AND saas.loyalty504_hosted_proof_v1($1,h.id,$2,$3,$4,true))
$f$;
DO $patch$BEGIN
 PERFORM saas.loyalty504_patch('saas.promotion_expire_due_reservations_v1(timestamp with time zone,integer)',jsonb_build_array(jsonb_build_array('WHERE due.status=''reserved'' AND due.expires_at<=p_now','WHERE due.status=''reserved'' AND due.expires_at<=p_now AND NOT saas.loyalty504_pending_group_v1(due.store_id,due.reservation_group_id,p_now)')));
 PERFORM saas.loyalty504_patch('saas.promotion_release_reservation_group_v1(uuid,uuid,text,uuid,timestamp with time zone)',jsonb_build_array(jsonb_build_array('  IF v_status<>''reserved'' THEN','  IF saas.loyalty504_pending_group_v1(p_store_id,p_reservation_group_id,p_now)THEN RETURN QUERY SELECT ''invalid_transition'',NULL::jsonb;RETURN;END IF;'||E'\n'||'  IF v_status<>''reserved'' THEN')));
 PERFORM saas.loyalty504_patch('saas.promotion_commit_reservation_group_v1(uuid,uuid,text,uuid,uuid,timestamp with time zone)',jsonb_build_array(
  jsonb_build_array('IF v_status<>''reserved'' THEN','IF v_status<>''reserved'' AND NOT(v_status IN(''expired'',''released'')AND saas.loyalty504_captured_group_v1(p_store_id,p_reservation_group_id,p_order_id,p_now))THEN'),
  jsonb_build_array('p_now>=v_expires_at','p_now>=v_expires_at AND NOT saas.loyalty504_captured_group_v1(p_store_id,p_reservation_group_id,p_order_id,p_now)')
 ));
 PERFORM saas.loyalty504_patch('saas.promotion_commit_integrity_valid_v1(uuid,uuid)',jsonb_build_array(jsonb_build_array('v_operation.created_at>=v_group_expires','v_operation.created_at>=v_group_expires AND NOT saas.loyalty504_captured_group_v1(p_store_id,v_group_id,v_order.id,v_operation.created_at)')));
 PERFORM saas.loyalty504_patch('saas.promotion_reservation_transition_only()',jsonb_build_array(jsonb_build_array('(OLD.status<>''reserved'' AND NEW.status<>OLD.status)','(OLD.status<>''reserved'' AND NEW.status<>OLD.status AND NOT(OLD.status IN(''expired'',''released'')AND NEW.status=''committed''AND EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions h WHERE h.store_id=NEW.store_id AND h.promotion_reservation_group_id=NEW.reservation_group_id AND saas.loyalty504_captured_group_v1(NEW.store_id,NEW.reservation_group_id,h.order_id,NEW.updated_at))))')));
 PERFORM saas.loyalty504_patch('saas.storefront_hosted_checkout_promotion_terminal_v2()',jsonb_build_array(
  jsonb_build_array('OR NEW.updated_at>=v_session.promotion_reservation_expires_at)','OR NEW.updated_at>=v_session.promotion_reservation_expires_at)AND NOT saas.loyalty504_captured_group_v1(v_session.store_id,v_session.promotion_reservation_group_id,v_session.order_id,NEW.updated_at)'),
  jsonb_build_array('v_session.customer_credential_digest,v_session.customer_expires_at,NEW.updated_at,NEW.updated_at','v_session.customer_credential_digest,CASE WHEN saas.loyalty504_captured_group_v1(v_session.store_id,v_session.promotion_reservation_group_id,v_session.order_id,NEW.updated_at)THEN greatest(v_session.customer_expires_at,NEW.updated_at+interval ''30 days'')ELSE v_session.customer_expires_at END,NEW.updated_at,NEW.updated_at'),
  jsonb_build_array('v_session.receipt_key_id,v_session.receipt_credential_digest,v_session.receipt_expires_at,NEW.updated_at','v_session.receipt_key_id,v_session.receipt_credential_digest,CASE WHEN saas.loyalty504_captured_group_v1(v_session.store_id,v_session.promotion_reservation_group_id,v_session.order_id,NEW.updated_at)THEN greatest(v_session.receipt_expires_at,NEW.updated_at+interval ''1 day'')ELSE v_session.receipt_expires_at END,NEW.updated_at'),
  jsonb_build_array('AND other_session.hold_expires_at>NEW.updated_at','AND(other_session.hold_expires_at>NEW.updated_at OR saas.loyalty504_pending_session_v1(other_session.store_id,other_session.id,NEW.updated_at))')
 ));
 PERFORM saas.loyalty504_patch('saas.public_storefront_hosted_checkout_status(text,timestamp with time zone,jsonb)',jsonb_build_array(jsonb_build_array('IF selected_session.receipt_expires_at<=p_now','IF selected_session.receipt_expires_at<=p_now AND NOT(selected_session.status=''captured''AND saas.loyalty504_captured_group_v1(selected_store,selected_session.promotion_reservation_group_id,selected_session.order_id,selected_session.terminal_at)AND EXISTS(SELECT 1 FROM saas.storefront_order_receipts receipt WHERE receipt.store_id=selected_store AND receipt.id=selected_session.receipt_id AND receipt.order_id=selected_session.order_id AND receipt.key_id=selected_session.receipt_key_id AND receipt.credential_digest=selected_session.receipt_credential_digest AND receipt.expires_at>p_now))')));
 PERFORM saas.loyalty504_patch('saas.storefront_available_stock(uuid,uuid,timestamp with time zone,uuid)',jsonb_build_array(jsonb_build_array('AND session.hold_expires_at>p_now','AND(session.hold_expires_at>p_now OR saas.loyalty504_pending_session_v1(session.store_id,session.id,p_now))')));
END $patch$;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'loyalty504_%'LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',r.signature);END LOOP;END $acl$;
DO $manifest$DECLARE r record;BEGIN FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'loyalty504_%'LOOP INSERT INTO saas.loyalty504_functions VALUES('saas.'||r.oid::regprocedure::text,'',encode(sha256(convert_to(pg_get_functiondef(r.oid),'UTF8')),'hex'))ON CONFLICT DO NOTHING;END LOOP;END $manifest$;
COMMIT;
