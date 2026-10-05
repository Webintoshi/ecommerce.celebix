BEGIN READ ONLY;
DO $assert$
DECLARE r record;d text;
BEGIN
 IF (SELECT count(*) FROM saas.permanent_order_accounting_restore)<>6
 THEN RAISE EXCEPTION 'MISSING_PREDECESSOR_DEFINITIONS';END IF;
 IF has_function_privilege('celebix_saas_app','saas.accounting_detach_deleted_order(uuid,uuid)','EXECUTE')
 OR has_function_privilege('celebix_saas_workflow','saas.accounting_detach_deleted_order(uuid,uuid)','EXECUTE')
 OR has_table_privilege('celebix_saas_app','saas.accounting_events','UPDATE')
 OR has_table_privilege('celebix_saas_app','saas.permanent_order_accounting_restore','SELECT')
 THEN RAISE EXCEPTION 'FINANCIAL_RETENTION_PRIVILEGE_LEAK';END IF;
 IF NOT has_function_privilege('celebix_saas_app','saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text)','EXECUTE')
 THEN RAISE EXCEPTION 'AUTHORIZED_DELETION_UNAVAILABLE';END IF;
 FOR r IN SELECT signature,definition FROM saas.permanent_order_accounting_restore LOOP
   d:=pg_get_functiondef(r.signature::regprocedure);
   IF position('platform_support_begin' IN r.definition)>0 AND position('platform_support_begin' IN d)=0
   THEN RAISE EXCEPTION 'PLATFORM_SUPPORT_WRAPPER_LOST: %',r.signature;END IF;
 END LOOP;
 d:=pg_get_functiondef('saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text)'::regprocedure);
 IF position('saas.accounting_detach_deleted_order' IN d)=0
 OR (length(d)-length(replace(d,'authority_error:=saas.merchant_action_authority_error','')))/length('authority_error:=saas.merchant_action_authority_error')<>2
 THEN RAISE EXCEPTION 'DELETE_DETACH_OR_AUTHORITY_RECHECK_MISSING';END IF;
 IF EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE deleted_order_id IS NOT NULL AND order_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM saas.accounting_events WHERE deleted_order_id IS NOT NULL AND order_id IS NOT NULL)
 THEN RAISE EXCEPTION 'INVALID_FINANCIAL_REFERENCE';END IF;
END $assert$;
COMMIT;
