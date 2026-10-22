-- Permanent deletion forgives only the unpaid balance. Actual money, returns,
-- inventory and immutable accounting evidence remain unchanged.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));

CREATE TABLE saas.order_delete_debt261_restore(
 signature text PRIMARY KEY,definition text NOT NULL,before_hash text NOT NULL,
 after_hash text,function_oid oid NOT NULL,function_owner oid NOT NULL,
 function_acl aclitem[],function_config text[],security_definer boolean NOT NULL,
 function_volatility "char" NOT NULL,function_strict boolean NOT NULL,function_parallel "char" NOT NULL
);
ALTER TABLE saas.order_delete_debt261_restore ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_delete_debt261_restore FORCE ROW LEVEL SECURITY;
CREATE POLICY order_delete_debt261_owner ON saas.order_delete_debt261_restore
 TO celebix_saas_owner USING(true)WITH CHECK(true);
DO $private$DECLARE r record;BEGIN
 REVOKE ALL ON saas.order_delete_debt261_restore FROM PUBLIC;
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
  EXECUTE format('REVOKE ALL ON saas.order_delete_debt261_restore FROM %I',r.rolname);
 END LOOP;
END $private$;

-- Reviewed predecessors include native260 and the support audit wrappers.
DO $predecessors$DECLARE r record;p record;BEGIN
 FOR r IN SELECT * FROM(VALUES
  ('saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)','27dd06d038f9538c3bcf7ce12cc3cbc124c41356c9b08adbfc947f229c6ce719','v'),
  ('saas.accounting_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)','71382486fe5c66b2e8115f0f5bae7e40fdbd5dfd641648f09ed01358964f526a','v'),
  ('saas.accounting_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)','623321074d2c021e7213298580fb90f9017747858143dd43582ff63d90e4dfe5','s'),
  ('saas.accounting_schedule_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)','fdd07af7175ab6f869a006cf447d7392ff6db3eaea6648fd7cf1779d1a0eb229','s')
 )x(signature,hash,volatility)LOOP
  SELECT f.*,pg_get_functiondef(f.oid)definition INTO p FROM pg_proc f WHERE f.oid=to_regprocedure(r.signature);
  IF p.oid IS NULL OR encode(sha256(convert_to(p.definition,'UTF8')),'hex')<>r.hash
   OR p.proowner<>'celebix_saas_owner'::regrole
   OR p.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[]
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
   OR p.prosecdef IS DISTINCT FROM true OR p.provolatile<>r.volatility::"char"
   OR p.proisstrict IS DISTINCT FROM false OR p.proparallel<>'u'
  THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_PREDECESSOR_DRIFT:%',r.signature;END IF;
  INSERT INTO saas.order_delete_debt261_restore VALUES(
   r.signature,p.definition,r.hash,NULL,p.oid,p.proowner,p.proacl,p.proconfig,
   p.prosecdef,p.provolatile,p.proisstrict,p.proparallel
  );
 END LOOP;
END $predecessors$;

CREATE FUNCTION saas.permanent_order_close_debt(
 p_store uuid,p_order uuid,p_actor uuid,p_operation uuid,p_now timestamptz
)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.accounting_receivables%ROWTYPE;number_value text;remaining bigint;event_value uuid;
BEGIN
 IF saas.permanent_order_deletion_context(p_store,p_order)IS DISTINCT FROM true
  OR p_actor IS NULL OR p_operation IS NULL OR p_now IS NULL
 THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_CONTEXT_REQUIRED';END IF;
 SELECT order_number INTO STRICT number_value FROM saas.orders
 WHERE store_id=p_store AND id=p_order FOR UPDATE;
 FOR r IN SELECT * FROM saas.accounting_receivables
  WHERE store_id=p_store AND order_id=p_order ORDER BY id FOR UPDATE LOOP
  remaining:=greatest(r.sale_cents-r.return_cents-r.discount_cents-r.collected_cents,0);
  IF remaining=0 THEN CONTINUE;END IF;
  event_value:=saas.inventory_deterministic_uuid('order-deletion-debt-closure',p_store::text||':'||p_operation::text||':'||r.id::text);
  -- Native243's zero-cash discount closes debt without inventing a receipt,
  -- a physical return, an account movement or an additional refund credit.
  INSERT INTO saas.accounting_events(
   id,store_id,operation_id,kind,currency,amount_cents,customer_id,order_id,
   channel,note,actor_membership_id,occurred_at,created_at,metadata
  )VALUES(
   event_value,p_store,p_operation,'collection',r.currency,0,r.customer_id,p_order,
   r.channel,'Silinen siparişin kalan borcu otomatik kapatıldı.',p_actor,p_now,p_now,
   jsonb_build_object(
    'permanentOrderDebtClosure',true,'deletionOperationId',p_operation,
    'deletedOrderNumber',number_value,'discountCents',remaining,
    'discountAllocations',jsonb_build_array(jsonb_build_object(
     'receivableId',r.id,'orderId',p_order,'amountCents',remaining
    )),
    'beforeReceivable',jsonb_build_object(
     'saleCents',r.sale_cents,'collectedCents',r.collected_cents,
     'returnCents',r.return_cents,'settlementDiscountCents',r.discount_cents,
     'refundedCents',r.refunded_cents,'version',r.version
    )
   )
  );
  INSERT INTO saas.accounting_allocations VALUES(p_store,event_value,r.id,'discount',remaining);
  UPDATE saas.accounting_receivables SET discount_cents=discount_cents+remaining,version=version+1
  WHERE store_id=p_store AND id=r.id;
  -- The immediately following existing detachment bumps the customer version
  -- and snapshots both this event and the original immutable financial history.
 END LOOP;
END $f$;
DO $private$DECLARE r record;BEGIN
 REVOKE ALL ON FUNCTION saas.permanent_order_close_debt(uuid,uuid,uuid,uuid,timestamptz)FROM PUBLIC;
 FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION saas.permanent_order_close_debt(uuid,uuid,uuid,uuid,timestamptz)FROM %I',r.rolname);
 END LOOP;
END $private$;

DO $patch$DECLARE d text;anchor text;replacement text;r record;p record;BEGIN
 SELECT definition INTO STRICT d FROM saas.order_delete_debt261_restore WHERE signature LIKE 'saas.delete_order(%';
 anchor:='  PERFORM saas.accounting_detach_deleted_order(p_store_id,p_order_id);';
 IF (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_DELETE_ANCHOR';END IF;
 replacement:='  PERFORM saas.permanent_order_close_debt(p_store_id,p_order_id,p_membership_id,p_operation_id,p_now);'||E'\n'||anchor;
 EXECUTE replace(d,anchor,replacement);

 SELECT definition INTO STRICT d FROM saas.order_delete_debt261_restore WHERE signature LIKE 'saas.accounting_mutate(%';
 anchor:='OR original.metadata->>''orderEditCancellation''=''true'' OR EXISTS';
 IF (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_REVERSE_ANCHOR';END IF;
 d:=replace(d,anchor,'OR original.metadata->>''orderEditCancellation''=''true'' OR original.metadata->>''permanentOrderDebtClosure''=''true'' OR EXISTS');
 anchor:=' FOR r IN SELECT a.*,d.sale_cents,d.collected_cents,d.return_cents,d.discount_cents,d.refunded_cents FROM saas.accounting_allocations a JOIN saas.accounting_receivables d ON d.store_id=a.store_id AND d.id=a.receivable_id WHERE a.store_id=p_store AND a.event_id=original.id ORDER BY d.id FOR UPDATE OF d LOOP';
 IF (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_REVERSE_BALANCE_ANCHOR';END IF;
 replacement:=$new$ FOR r IN SELECT a.*,d.sale_cents,d.collected_cents,d.return_cents,d.discount_cents,d.refunded_cents,d.deleted_order_id FROM saas.accounting_allocations a JOIN saas.accounting_receivables d ON d.store_id=a.store_id AND d.id=a.receivable_id WHERE a.store_id=p_store AND a.event_id=original.id ORDER BY d.id FOR UPDATE OF d LOOP
 -- A legitimate correction may consume customer credit, but must not reopen
 -- debt on a deleted order. Historical already-open detached debt is unchanged.
 IF r.deleted_order_id IS NOT NULL
  AND r.sale_cents::numeric-r.return_cents-r.discount_cents-r.collected_cents<=0
  AND r.sale_cents::numeric-r.return_cents-r.discount_cents-r.collected_cents
   +coalesce((SELECT sum(CASE WHEN effect IN('collect','discount','return')THEN amount_cents::numeric WHEN effect='charge'THEN -amount_cents::numeric ELSE 0 END)
    FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=original.id AND receivable_id=r.receivable_id),0)>0
 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;$new$;
 EXECUTE replace(d,anchor,replacement);

 -- Remove settled deleted orders from debt work lists before pagination. Keep
 -- the full customer/accounting history and any real refund still owed.
 SELECT definition INTO STRICT d FROM saas.order_delete_debt261_restore WHERE signature LIKE 'saas.accounting_read(%';
 anchor:=$old$ ELSIF p_kind='receivables' THEN SELECT jsonb_build_object('receivables',coalesce(jsonb_agg(saas.accounting_receivable_projection(p_store,r.id) ORDER BY r.occurred_at,r.id),'[]'::jsonb)) INTO result FROM saas.accounting_receivables r LEFT JOIN saas.customers c ON c.store_id=r.store_id AND c.id=r.customer_id LEFT JOIN saas.orders o ON o.store_id=r.store_id AND o.id=r.order_id WHERE r.store_id=p_store$old$;
 IF (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_RECEIVABLE_LIST_ANCHOR';END IF;
 replacement:=anchor||' AND (r.deleted_order_id IS NULL OR greatest(r.sale_cents-r.return_cents-r.discount_cents-r.collected_cents,0)>0 OR greatest(r.collected_cents-r.sale_cents+r.return_cents+r.discount_cents-r.refunded_cents,0)>0)';
 EXECUTE replace(d,anchor,replacement);
 SELECT definition INTO STRICT d FROM saas.order_delete_debt261_restore WHERE signature LIKE 'saas.accounting_schedule_list(%';
 anchor:=$old$  WHERE r.store_id=p_store AND (NOT(p_filters?'customerId') OR r.customer_id=(p_filters->>'customerId')::uuid)$old$;
 IF (length(d)-length(replace(d,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_SCHEDULE_LIST_ANCHOR';END IF;
 replacement:=anchor||' AND (r.deleted_order_id IS NULL OR greatest(r.sale_cents-r.return_cents-r.discount_cents-r.collected_cents,0)>0 OR greatest(r.collected_cents-r.sale_cents+r.return_cents+r.discount_cents-r.refunded_cents,0)>0)';
 EXECUTE replace(d,anchor,replacement);

 FOR r IN SELECT * FROM saas.order_delete_debt261_restore LOOP
  SELECT f.* INTO STRICT p FROM pg_proc f WHERE f.oid=to_regprocedure(r.signature);
  IF p.oid<>r.function_oid OR p.proowner<>r.function_owner OR p.proacl IS DISTINCT FROM r.function_acl
   OR p.proconfig IS DISTINCT FROM r.function_config OR p.prosecdef<>r.security_definer
   OR p.provolatile<>r.function_volatility OR p.proisstrict<>r.function_strict OR p.proparallel<>r.function_parallel
  THEN RAISE EXCEPTION 'ORDER_DELETE_DEBT261_POSTCONDITION:%',r.signature;END IF;
  UPDATE saas.order_delete_debt261_restore SET after_hash=encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')WHERE signature=r.signature;
 END LOOP;
END $patch$;
COMMIT;
