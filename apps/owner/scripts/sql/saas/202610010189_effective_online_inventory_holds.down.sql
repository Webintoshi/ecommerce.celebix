-- Restore the exact prior view and terminal stock counters without touching
-- payment, session, reservation, inventory or order data.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
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
    IF target IS NULL THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_ROLLBACK_TERMINAL_MISSING'; END IF;
    SELECT pg_catalog.pg_get_functiondef(p.oid),pg_catalog.to_jsonb(p)-'prosrc'
      INTO original,metadata FROM pg_catalog.pg_proc p WHERE p.oid=target;
    IF (pg_catalog.length(original)-pg_catalog.length(pg_catalog.replace(original,fn.new_anchor,'')))/pg_catalog.length(fn.new_anchor)<>1
      OR (fn.new_second IS NOT NULL AND (pg_catalog.length(original)-pg_catalog.length(pg_catalog.replace(original,fn.new_second,'')))/pg_catalog.length(fn.new_second)<>1)
    THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_ROLLBACK_TERMINAL_PREDECESSOR_INVALID'; END IF;
    changed:=pg_catalog.replace(original,fn.new_anchor,fn.old_anchor);
    IF fn.new_second IS NOT NULL THEN changed:=pg_catalog.replace(changed,fn.new_second,fn.old_second); END IF;
    IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(changed,'UTF8')),'hex')<>fn.expected_digest
    THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_ROLLBACK_TERMINAL_BODY_CHANGED'; END IF;
    EXECUTE changed;
    IF (SELECT pg_catalog.to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p WHERE p.oid=target) IS DISTINCT FROM metadata
      OR pg_catalog.pg_get_functiondef(target) IS DISTINCT FROM changed
    THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_ROLLBACK_TERMINAL_AUTHORITY_CHANGED'; END IF;
  END LOOP;
END
$terminal$;
DO $migration$
DECLARE
  target regclass := 'saas.all_inventory_reservations'::regclass;
  original text;
  restored text;
  before_contract jsonb;
  after_contract jsonb;
BEGIN
  original:=pg_catalog.pg_get_viewdef(target,false);
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(original,'UTF8')),'hex')
    <> '22507ced2df83d396c8acf68b978aec39af1e62ae2fe6ff22ca58b60d253c6d3'
  THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_ROLLBACK_PREDECESSOR_INVALID'; END IF;
  SELECT pg_catalog.jsonb_build_object('owner',c.relowner,'acl',c.relacl::text,
    'options',c.reloptions,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
    'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname,a.atttypid,a.atttypmod,a.attcollation,a.attnotnull,a.attacl::text) ORDER BY a.attnum)
      FROM pg_catalog.pg_attribute a WHERE a.attrelid=target AND a.attnum>0 AND NOT a.attisdropped))
  INTO before_contract FROM pg_catalog.pg_class c WHERE c.oid=target;
  IF before_contract->>'owner' IS DISTINCT FROM 'celebix_saas_owner'::regrole::oid::text
  THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_ROLLBACK_OWNER_INVALID'; END IF;
  -- This is the reviewed migration157 union, including all original columns.
  CREATE OR REPLACE VIEW saas.all_inventory_reservations AS
    SELECT id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,
      held_at,consumed_at,released_at,expired_at,version,updated_at,NULL::uuid AS location_id,NULL::uuid AS sale_id,payment_attempt_id,storefront_hosted_session_id
    FROM saas.checkout_inventory_reservations
    UNION ALL
    SELECT id,store_id,NULL::uuid,NULL::uuid,product_id,variant_id,quantity,stock_tracked,status,
      held_at,consumed_at,released_at,NULL::timestamptz,version,updated_at,location_id,sale_id,NULL::uuid,NULL::uuid
    FROM saas.in_store_inventory_reservations;
  restored:=pg_catalog.pg_get_viewdef(target,false);
  SELECT pg_catalog.jsonb_build_object('owner',c.relowner,'acl',c.relacl::text,
    'options',c.reloptions,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
    'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname,a.atttypid,a.atttypmod,a.attcollation,a.attnotnull,a.attacl::text) ORDER BY a.attnum)
      FROM pg_catalog.pg_attribute a WHERE a.attrelid=target AND a.attnum>0 AND NOT a.attisdropped))
  INTO after_contract FROM pg_catalog.pg_class c WHERE c.oid=target;
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(restored,'UTF8')),'hex')
      <> '67badca113347e3ae9084236d2d37369377053497662be661d769a45981c4d8a'
    OR after_contract IS DISTINCT FROM before_contract
  THEN RAISE EXCEPTION 'EFFECTIVE_ONLINE_HOLDS_ROLLBACK_AUTHORITY_OR_COLUMNS_CHANGED'; END IF;
END
$migration$;
COMMIT;
