DO $f$
DECLARE
  owner_oid oid:='celebix_saas_owner'::pg_catalog.regrole;
  workflow_oid oid:='celebix_saas_workflow'::pg_catalog.regrole;
  function_oid oid;
BEGIN
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute attribute
      WHERE attribute.attrelid='saas.checkout_inventory_reservations'::pg_catalog.regclass
        AND attribute.attname IN('attempt_id','payment_attempt_id')
        AND NOT attribute.attisdropped AND NOT attribute.attnotnull)<>2
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint constraint_info
      WHERE constraint_info.conrelid='saas.checkout_inventory_reservations'::pg_catalog.regclass
        AND constraint_info.conname='checkout_inventory_reservations_one_attempt_owner_check'
        AND constraint_info.contype='c' AND constraint_info.convalidated
        AND pg_catalog.pg_get_constraintdef(constraint_info.oid)~
          'attempt_id IS NOT NULL.*payment_attempt_id IS NULL.*attempt_id IS NULL.*payment_attempt_id IS NOT NULL')
    OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint constraint_info
      WHERE constraint_info.conrelid='saas.checkout_inventory_reservations'::pg_catalog.regclass
        AND constraint_info.conname='checkout_inventory_reservations_payment_attempt_store_fk'
        AND constraint_info.contype='f' AND constraint_info.convalidated)
  THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_RESERVATION_OWNER_ASSERTION_FAILED'; END IF;

  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class table_info
      WHERE table_info.oid='saas.quick_order_hosted_payment_bridges'::pg_catalog.regclass
        AND table_info.relowner=owner_oid AND table_info.relrowsecurity
        AND table_info.relforcerowsecurity)
    OR EXISTS(SELECT 1 FROM pg_catalog.pg_policy policy_info
      WHERE policy_info.polrelid='saas.quick_order_hosted_payment_bridges'::pg_catalog.regclass)
    OR pg_catalog.has_table_privilege('public','saas.quick_order_hosted_payment_bridges','SELECT')
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.quick_order_hosted_payment_bridges','SELECT')
    OR pg_catalog.has_table_privilege('celebix_saas_workflow','saas.quick_order_hosted_payment_bridges','SELECT')
  THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_BRIDGE_RLS_ACL_ASSERTION_FAILED'; END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger trigger_info
      JOIN (VALUES
        ('saas.payment_attempts'::pg_catalog.regclass,'payment_attempt_quick_order_terminal',
          'saas.quick_order_hosted_payment_terminal_transition()'::pg_catalog.regprocedure,17,false),
        ('saas.checkout_payment_attempts'::pg_catalog.regclass,'checkout_payment_attempts_no_generic_parallel',
          'saas.guard_checkout_generic_parallel_attempt()'::pg_catalog.regprocedure,7,false),
        ('saas.quick_order_hosted_payment_bridges'::pg_catalog.regclass,'quick_order_hosted_payment_bridges_immutable',
          'saas.guard_quick_order_hosted_payment_bridge()'::pg_catalog.regprocedure,27,false),
        ('saas.checkout_inventory_reservations'::pg_catalog.regclass,'checkout_inventory_reservations_transition',
          'saas.guard_checkout_reservation_transition()'::pg_catalog.regprocedure,27,false),
        ('saas.quick_order_links'::pg_catalog.regclass,'quick_order_links_live_attempt',
          'saas.guard_checkout_quick_link_live_attempt()'::pg_catalog.regprocedure,19,false),
        ('saas.quick_order_links'::pg_catalog.regclass,'quick_order_links_live_attempt_commit',
          'saas.guard_checkout_quick_link_live_attempt()'::pg_catalog.regprocedure,17,true)
      ) expected(tgrelid,tgname,tgfoid,tgtype,constraint_trigger)
        ON expected.tgrelid=trigger_info.tgrelid AND expected.tgname=trigger_info.tgname
        AND expected.tgfoid=trigger_info.tgfoid AND expected.tgtype=trigger_info.tgtype
        AND expected.constraint_trigger=(trigger_info.tgconstraint<>0)
      WHERE NOT trigger_info.tgisinternal AND trigger_info.tgenabled='O')<>6
  THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_BRIDGE_TRIGGER_ASSERTION_FAILED'; END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc procedure
      JOIN (VALUES
        ('saas.quick_order_hosted_payment_terminal_transition()'::pg_catalog.regprocedure,true),
        ('saas.guard_checkout_generic_parallel_attempt()'::pg_catalog.regprocedure,false),
        ('saas.guard_quick_order_hosted_payment_bridge()'::pg_catalog.regprocedure,false),
        ('saas.guard_checkout_reservation_transition()'::pg_catalog.regprocedure,false),
        ('saas.guard_checkout_quick_link_live_attempt()'::pg_catalog.regprocedure,true)
      ) expected(oid,security_definer) ON expected.oid=procedure.oid
      WHERE procedure.proowner=owner_oid AND procedure.prosecdef=expected.security_definer
        AND procedure.provolatile='v'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[])<>5
  THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_BRIDGE_INTERNAL_FUNCTION_ASSERTION_FAILED'; END IF;

  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid IN(
        'saas.quick_order_hosted_payment_authority(text,text,timestamp with time zone)'::pg_catalog.regprocedure,
        'saas.quick_order_hosted_payment_begin(text,text,uuid,text,text,text,timestamp with time zone)'::pg_catalog.regprocedure,
        'saas.quick_order_hosted_payment_expire_created(timestamp with time zone,integer)'::pg_catalog.regprocedure,
        'saas.quick_order_hosted_payment_reconciliation_candidates(timestamp with time zone,integer)'::pg_catalog.regprocedure,
        'saas.quick_order_hosted_payment_bridge_preflight()'::pg_catalog.regprocedure
      ) AND procedure.proowner=owner_oid AND procedure.prosecdef
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[])<>5
  THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_BRIDGE_FUNCTION_ASSERTION_FAILED'; END IF;

  FOREACH function_oid IN ARRAY ARRAY[
    'saas.quick_order_hosted_payment_authority(text,text,timestamp with time zone)'::pg_catalog.regprocedure::oid,
    'saas.quick_order_hosted_payment_begin(text,text,uuid,text,text,text,timestamp with time zone)'::pg_catalog.regprocedure::oid,
    'saas.quick_order_hosted_payment_expire_created(timestamp with time zone,integer)'::pg_catalog.regprocedure::oid,
    'saas.quick_order_hosted_payment_reconciliation_candidates(timestamp with time zone,integer)'::pg_catalog.regprocedure::oid,
    'saas.quick_order_hosted_payment_bridge_preflight()'::pg_catalog.regprocedure::oid
  ] LOOP
    IF NOT pg_catalog.has_function_privilege(workflow_oid,function_oid,'EXECUTE')
      OR pg_catalog.has_function_privilege('public',function_oid,'EXECUTE')
      OR pg_catalog.has_function_privilege('celebix_saas_app',function_oid,'EXECUTE')
      OR pg_catalog.has_function_privilege('celebix_saas_identity',function_oid,'EXECUTE')
      OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))) privilege
        WHERE procedure.oid=function_oid AND (
          privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
          OR privilege.grantor<>owner_oid OR privilege.grantee NOT IN(owner_oid,workflow_oid)))
    THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_BRIDGE_FUNCTION_ACL_ASSERTION_FAILED'; END IF;
  END LOOP;

  IF (SELECT procedure.prosrc FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid='saas.quick_order_hosted_payment_projection(text,text,timestamp with time zone)'::pg_catalog.regprocedure)
      !~ 'eligible_item_count<>total_item_count'
    OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid='saas.quick_order_hosted_payment_projection(text,text,timestamp with time zone)'::pg_catalog.regprocedure)
      !~ 'basket_subtotal<>selected.subtotal_cents'
    OR (SELECT procedure.prosrc FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid='saas.quick_order_hosted_payment_projection(text,text,timestamp with time zone)'::pg_catalog.regprocedure)
      !~ 'item.line_total_cents::numeric=item.unit_price_cents::numeric\*item.quantity::numeric'
  THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_BASKET_AUTHORITY_ASSERTION_FAILED'; END IF;

  IF saas.quick_order_hosted_payment_bridge_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_BRIDGE_PREFLIGHT_ASSERTION_FAILED'; END IF;
END
$f$;
