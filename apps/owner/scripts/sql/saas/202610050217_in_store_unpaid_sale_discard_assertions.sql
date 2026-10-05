BEGIN READ ONLY;
DO $assert$
DECLARE r record;suffix text;signature text;d text;
BEGIN
 IF (SELECT count(*) FROM saas.in_store_discard_217_restore)<>3
  OR has_table_privilege('celebix_saas_app','saas.in_store_discard_217_restore','SELECT')
 THEN RAISE EXCEPTION 'DISCARD_RESTORE_PRIVILEGES_INVALID';END IF;
 FOR r IN SELECT * FROM saas.in_store_discard_217_restore LOOP
  d:=pg_get_functiondef(r.function_oid);
  IF encode(sha256(convert_to(d,'UTF8')),'hex')<>r.after_hash
   OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=r.function_oid AND proowner=r.owner_oid AND proacl=r.acl)
   OR position('ELSIF p_kind=''discard'' THEN' IN d)=0
   OR position('UPDATE saas.in_store_sales SET status=''cancelled''' IN d)=0
   OR position('ELSIF p_kind=''cancel'' THEN' IN d)=0
   OR position('UPDATE saas.in_store_sales SET status=''draft''' IN d)=0
   OR position('selected.payment_received_at IS NOT NULL' IN d)=0
   OR position('selected.order_id IS NOT NULL' IN d)=0
   OR position('IF selected.status IN(''completed'',''cancelled'') OR' IN d)=0
   OR position('saas.in_store_payment_attestations WHERE sale_id=p_sale_id' IN d)=0
   OR (position('platform_support_begin' IN r.definition)>0 AND position('platform_support_begin' IN d)=0)
  THEN RAISE EXCEPTION 'DISCARD_MUTATOR_INVALID: %',r.signature;END IF;
 END LOOP;
 FOREACH suffix IN ARRAY ARRAY['','_v2','_v3'] LOOP
  signature:='saas.in_store_sales_discard'||suffix||'(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean)';
  IF to_regprocedure(signature) IS NULL OR NOT has_function_privilege('celebix_saas_app',signature,'EXECUTE')
   OR has_function_privilege('celebix_saas_workflow',signature,'EXECUTE')
   OR has_function_privilege('celebix_saas_identity',signature,'EXECUTE')
   OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(signature) AND prosecdef
    AND proowner='celebix_saas_owner'::regrole AND proconfig=ARRAY['search_path=pg_catalog, saas']::text[])
  THEN RAISE EXCEPTION 'DISCARD_FACADE_INVALID: %',signature;END IF;
  d:=pg_get_functiondef(to_regprocedure(signature));
  IF position('''discard''' IN d)=0 OR position('''cancel''' IN d)>0 THEN RAISE EXCEPTION 'DISCARD_ACTION_INVALID';END IF;
  IF pg_get_functiondef(to_regprocedure('saas.in_store_sales_cancel'||suffix||'(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean)'))
   IS DISTINCT FROM (SELECT b.cancel_definition FROM saas.in_store_discard_217_restore b WHERE b.signature LIKE 'saas.in_store_sales_mutate'||suffix||'(%')
  THEN RAISE EXCEPTION 'CANCEL_COMPATIBILITY_LOST';END IF;
 END LOOP;
END $assert$;
COMMIT;
