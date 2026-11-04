BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL check_function_bodies=off;
SET LOCAL lock_timeout='5s';
DO $guard$DECLARE r record;BEGIN
 IF current_setting('celebix.allow_loyalty504_down',true)IS DISTINCT FROM 'on'THEN RAISE EXCEPTION 'LOYALTY504_DOWN_OPT_IN_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions h JOIN saas.promotion_usage_reservations reservation ON reservation.store_id=h.store_id AND reservation.reservation_group_id=h.promotion_reservation_group_id JOIN saas.loyalty_rewards reward ON reward.store_id=reservation.store_id AND reward.code_id=reservation.code_id)THEN RAISE EXCEPTION 'LOYALTY504_LIVE_BANK_RIGHTS_ROLL_FORWARD_REQUIRED';END IF;
 FOR r IN SELECT *FROM saas.loyalty504_functions LOOP IF encode(sha256(convert_to(pg_get_functiondef(r.identity::regprocedure),'UTF8')),'hex')<>r.patched_hash THEN RAISE EXCEPTION 'LOYALTY504_DOWN_ROUTINE_DRIFT:%',r.identity;END IF;END LOOP;
 FOR r IN SELECT *FROM saas.loyalty504_functions WHERE definition<>''LOOP EXECUTE r.definition;END LOOP;
END $guard$;
DROP FUNCTION saas.loyalty504_pending_session_v1(uuid,uuid,timestamptz),saas.loyalty504_pending_group_v1(uuid,uuid,timestamptz),saas.loyalty504_captured_group_v1(uuid,uuid,uuid,timestamptz);
DROP FUNCTION saas.loyalty504_hosted_proof_v1(uuid,uuid,uuid,uuid,timestamptz,boolean),saas.loyalty504_patch(text,jsonb);
DROP TABLE saas.loyalty504_functions;
DROP INDEX saas.loyalty504_hosted_group;
COMMIT;
