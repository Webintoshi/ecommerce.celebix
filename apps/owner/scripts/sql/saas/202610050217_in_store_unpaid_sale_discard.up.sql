-- A terminal unpaid-sale discard is separate from returning a payment to its cart.
-- Patch the current definitions so platform support and all paid-sale guards survive.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release',0));

CREATE TABLE saas.in_store_discard_217_restore(
 signature text PRIMARY KEY,definition text NOT NULL,after_hash text NOT NULL,
 function_oid oid NOT NULL,owner_oid oid NOT NULL,acl aclitem[] NOT NULL,
 cancel_definition text NOT NULL
);
ALTER TABLE saas.in_store_discard_217_restore ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.in_store_discard_217_restore FORCE ROW LEVEL SECURITY;
CREATE POLICY in_store_discard_217_owner ON saas.in_store_discard_217_restore
 TO celebix_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON saas.in_store_discard_217_restore FROM PUBLIC,celebix_saas_app,celebix_saas_identity,
 celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

DO $patch$
DECLARE suffix text;signature text;cancel_signature text;discard_signature text;
 source text;patched text;cancel_source text;discard_source text;
 original_oid oid;original_owner oid;original_acl aclitem[];
 kinds constant text:='p_kind NOT IN(''create'',''update'',''hold'',''prepare'',''confirm_payment'',''complete'',''cancel'',''takeover'')';
 cancel_anchor constant text:='ELSIF p_kind=''cancel'' THEN';
 takeover_guard constant text:='IF selected.status=''completed'' OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN';
 operation_lock constant text:='PERFORM pg_advisory_xact_lock(hashtextextended(''saas.in_store.operation:''||p_operation_id::text,0));';
 discard_branch constant text:=$body$ELSIF p_kind='discard' THEN
  IF selected.status NOT IN('draft','held','payment_pending') OR p_args<>jsonb_build_object('confirmUnpaid',true)
   OR selected.payment_received_at IS NOT NULL OR selected.completed_at IS NOT NULL
   OR selected.order_id IS NOT NULL OR selected.order_number IS NOT NULL
   OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id)
  THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  UPDATE saas.in_store_sales SET status='cancelled' WHERE id=p_sale_id;
 ELSIF p_kind='cancel' THEN$body$;
BEGIN
 FOREACH suffix IN ARRAY ARRAY['','_v2','_v3'] LOOP
  signature:='saas.in_store_sales_mutate'||suffix||'(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb)';
  cancel_signature:='saas.in_store_sales_cancel'||suffix||'(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean)';
  discard_signature:='saas.in_store_sales_discard'||suffix||'(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean)';
  IF to_regprocedure(discard_signature) IS NOT NULL OR to_regprocedure(cancel_signature) IS NULL
   OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(signature)
    AND proowner='celebix_saas_owner'::regrole AND proacl=ARRAY['celebix_saas_owner=X/celebix_saas_owner']::aclitem[]
    AND prosecdef AND provolatile='v' AND proconfig=ARRAY['search_path=pg_catalog, saas']::text[])
  THEN RAISE EXCEPTION 'DISCARD_PREDECESSOR_INVALID: %',signature;END IF;
  SELECT oid,proowner,proacl,pg_get_functiondef(oid) INTO original_oid,original_owner,original_acl,source
   FROM pg_proc WHERE oid=to_regprocedure(signature);
  cancel_source:=pg_get_functiondef(to_regprocedure(cancel_signature));
  IF (length(source)-length(replace(source,kinds,'')))/length(kinds)<>1
   OR (length(source)-length(replace(source,cancel_anchor,'')))/length(cancel_anchor)<>1
   OR (length(source)-length(replace(source,operation_lock,'')))/length(operation_lock)<>1
   OR (length(source)-length(replace(source,takeover_guard,'')))/length(takeover_guard)<>1
  THEN RAISE EXCEPTION 'DISCARD_PATCH_ANCHOR_INVALID: %',signature;END IF;
  patched:=replace(replace(source,kinds,replace(kinds,'''takeover'')','''takeover'',''discard'')')),cancel_anchor,discard_branch);
  patched:=replace(patched,takeover_guard,replace(takeover_guard,'selected.status=''completed''','selected.status IN(''completed'',''cancelled'')'));
  -- V3 already has the release lock. Add it only for this new V1/V2 operation.
  IF suffix<>'_v3' THEN
   patched:=replace(patched,operation_lock,operation_lock||E'\n IF p_kind=''discard'' THEN PERFORM pg_advisory_xact_lock_shared(hashtextextended(''saas.accounting.release'',0));END IF;');
  END IF;
  INSERT INTO saas.in_store_discard_217_restore VALUES(signature,source,
   encode(sha256(convert_to(patched,'UTF8')),'hex'),original_oid,original_owner,original_acl,cancel_source);
  EXECUTE patched;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=original_oid AND proowner=original_owner
   AND proacl=original_acl AND pg_get_functiondef(oid)=patched)
  THEN RAISE EXCEPTION 'DISCARD_PREDECESSOR_PRESERVATION_FAILED: %',signature;END IF;
  -- The existing SQL facade carries the same arguments and authority. Only its
  -- public name and operational kind change; returning-to-cart remains cancel.
  IF (length(cancel_source)-length(replace(cancel_source,'''cancel''','')))/length('''cancel''')<>1
  THEN RAISE EXCEPTION 'DISCARD_FACADE_ANCHOR_INVALID: %',cancel_signature;END IF;
  discard_source:=replace(replace(cancel_source,'FUNCTION saas.in_store_sales_cancel'||suffix||'(','FUNCTION saas.in_store_sales_discard'||suffix||'('),'''cancel''','''discard''');
  IF discard_source=cancel_source THEN RAISE EXCEPTION 'DISCARD_FACADE_NAME_INVALID';END IF;
  EXECUTE discard_source;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',discard_signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',discard_signature);
 END LOOP;
END $patch$;
COMMIT;
