-- Count online inventory holds only while their existing parent hold is live.
-- Raw reservations, payment attempts and sessions remain unchanged. POS holds
-- and non-held reservation history retain the migration157 view contract.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $migration$
DECLARE
  target regclass := 'saas.all_inventory_reservations'::regclass;
  original text;
  changed text;
  before_contract jsonb;
  after_contract jsonb;
  anchor text := 'FROM saas.checkout_inventory_reservations';
  live_online text := $predicate$FROM saas.checkout_inventory_reservations
  WHERE checkout_inventory_reservations.status <> 'held'
    OR (
      (checkout_inventory_reservations.attempt_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM saas.checkout_payment_attempts legacy_attempt
        WHERE legacy_attempt.store_id=checkout_inventory_reservations.store_id
          AND legacy_attempt.id=checkout_inventory_reservations.attempt_id
          AND legacy_attempt.status IN('reserved','provider_ready','initiation_unknown')
          AND legacy_attempt.hold_expires_at>pg_catalog.statement_timestamp()
      ))
      OR
      (checkout_inventory_reservations.payment_attempt_id IS NOT NULL
        AND checkout_inventory_reservations.quick_order_link_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM saas.quick_order_hosted_payment_bridges bridge
        WHERE bridge.store_id=checkout_inventory_reservations.store_id
          AND bridge.attempt_id=checkout_inventory_reservations.payment_attempt_id
          AND bridge.quick_order_link_id=checkout_inventory_reservations.quick_order_link_id
          AND bridge.status='active'
          AND bridge.hold_expires_at>pg_catalog.statement_timestamp()
      ))
      OR
      (checkout_inventory_reservations.storefront_hosted_session_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM saas.storefront_hosted_checkout_sessions session
        WHERE session.store_id=checkout_inventory_reservations.store_id
          AND session.id=checkout_inventory_reservations.storefront_hosted_session_id
          AND session.payment_attempt_id=checkout_inventory_reservations.payment_attempt_id
          AND session.status IN('active','provider_ready','processing')
          AND session.hold_expires_at>pg_catalog.statement_timestamp()
      ))
    )$predicate$;
BEGIN
  IF pg_catalog.to_regclass('saas.checkout_payment_attempts') IS NULL
    OR pg_catalog.to_regclass('saas.quick_order_hosted_payment_bridges') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_hosted_checkout_sessions') IS NULL
    OR pg_catalog.to_regclass('saas.in_store_inventory_reservations') IS NULL
  THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_PARENT_CONTRACT_MISSING'; END IF;
  original:=pg_catalog.pg_get_viewdef(target,false);
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(original,'UTF8')),'hex')
      <> '67badca113347e3ae9084236d2d37369377053497662be661d769a45981c4d8a'
    OR (pg_catalog.length(original)-pg_catalog.length(pg_catalog.replace(original,anchor,'')))/pg_catalog.length(anchor)<>1
  THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_PREDECESSOR_INVALID'; END IF;
  SELECT pg_catalog.jsonb_build_object('owner',c.relowner,'acl',c.relacl::text,
    'options',c.reloptions,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
    'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname,a.atttypid,a.atttypmod,a.attcollation,a.attnotnull,a.attacl::text) ORDER BY a.attnum)
      FROM pg_catalog.pg_attribute a WHERE a.attrelid=target AND a.attnum>0 AND NOT a.attisdropped))
  INTO before_contract FROM pg_catalog.pg_class c WHERE c.oid=target;
  IF before_contract->>'owner' IS DISTINCT FROM 'celebix_saas_owner'::regrole::oid::text
  THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_OWNER_INVALID'; END IF;
  changed:=pg_catalog.replace(original,anchor,live_online);
  EXECUTE 'CREATE OR REPLACE VIEW saas.all_inventory_reservations AS '||changed;
  SELECT pg_catalog.jsonb_build_object('owner',c.relowner,'acl',c.relacl::text,
    'options',c.reloptions,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
    'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname,a.atttypid,a.atttypmod,a.attcollation,a.attnotnull,a.attacl::text) ORDER BY a.attnum)
      FROM pg_catalog.pg_attribute a WHERE a.attrelid=target AND a.attnum>0 AND NOT a.attisdropped))
  INTO after_contract FROM pg_catalog.pg_class c WHERE c.oid=target;
  IF after_contract IS DISTINCT FROM before_contract
  THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_AUTHORITY_OR_COLUMNS_CHANGED'; END IF;
END
$migration$;
-- A late captured payment keeps its raw own reservation. Count every other
-- effective online or POS hold before choosing capture or stock_conflict.
DO $terminal$
DECLARE
  fn record;
  target regprocedure;
  original text;
  changed text;
  metadata jsonb;
BEGIN
  FOR fn IN SELECT * FROM (VALUES
    ('saas.storefront_hosted_checkout_terminal_transition()',
      '40413b0ccb18eeb79fb034a81be2bbc9675753d3ae1db9920cbda18e4add7d69',
      $old$AND reservation.stock_tracked AND variant.stock_quantity<reservation.quantity$old$,
      $new$AND reservation.stock_tracked AND variant.stock_quantity-COALESCE((
          SELECT pg_catalog.sum(other_hold.quantity)::bigint
          FROM saas.all_inventory_reservations other_hold
          WHERE other_hold.store_id=reservation.store_id
            AND other_hold.variant_id=reservation.variant_id
            AND other_hold.stock_tracked AND other_hold.status='held'
            AND other_hold.storefront_hosted_session_id IS DISTINCT FROM selected_session.id
        ),0::bigint)<reservation.quantity$new$,
      NULL::text,NULL::text),
    ('saas.storefront_hosted_checkout_promotion_terminal_v2()',
      '537aac4c66dbcd93629f3ae6bf7ea2f144c6f0c7e06e076add0a8c60149288fa',
      'FROM saas.checkout_inventory_reservations other_hold',
      'FROM saas.all_inventory_reservations other_hold',
      $old$AND (
            (other_hold.attempt_id IS NOT NULL AND EXISTS($old$,
      $new$AND (
            (other_hold.sale_id IS NOT NULL) OR
            (other_hold.attempt_id IS NOT NULL AND EXISTS($new$)
  ) AS patches(signature,expected_digest,old_anchor,new_anchor,old_second,new_second)
  LOOP
    target:=pg_catalog.to_regprocedure(fn.signature);
    IF target IS NULL THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_TERMINAL_MISSING'; END IF;
    SELECT pg_catalog.pg_get_functiondef(p.oid),pg_catalog.to_jsonb(p)-'prosrc'
      INTO original,metadata FROM pg_catalog.pg_proc p WHERE p.oid=target;
    IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(original,'UTF8')),'hex')<>fn.expected_digest
      OR (pg_catalog.length(original)-pg_catalog.length(pg_catalog.replace(original,fn.old_anchor,'')))/pg_catalog.length(fn.old_anchor)<>1
      OR (fn.old_second IS NOT NULL AND (pg_catalog.length(original)-pg_catalog.length(pg_catalog.replace(original,fn.old_second,'')))/pg_catalog.length(fn.old_second)<>1)
    THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_TERMINAL_PREDECESSOR_INVALID'; END IF;
    changed:=pg_catalog.replace(original,fn.old_anchor,fn.new_anchor);
    IF fn.old_second IS NOT NULL THEN changed:=pg_catalog.replace(changed,fn.old_second,fn.new_second); END IF;
    EXECUTE changed;
    IF (SELECT pg_catalog.to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata
      OR pg_catalog.pg_get_functiondef(target) IS DISTINCT FROM changed
    THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_TERMINAL_AUTHORITY_CHANGED'; END IF;
  END LOOP;
END
$terminal$;
COMMIT;
