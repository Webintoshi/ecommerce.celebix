BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assert$ DECLARE fn record;BEGIN
 IF (SELECT manual_sales_v4_enabled FROM saas.accounting_release_state WHERE singleton) THEN RAISE EXCEPTION 'MANUAL_V4_RELEASE_MUST_START_DISABLED';END IF;
 IF NOT saas.in_store_payment_parts_valid_v4('[]') OR saas.in_store_payment_parts_valid_v4('[{"partId":"11111111-1111-4111-8111-111111111111","paymentMethod":"cash","amountCents":0}]') THEN RAISE EXCEPTION 'MANUAL_V4_PART_VALIDATION';END IF;
 IF EXISTS(SELECT 1 FROM saas.manual_sales_v4_restore WHERE after_hash IS NULL OR after_hash<>md5(pg_get_functiondef(signature::regprocedure))) THEN RAISE EXCEPTION 'MANUAL_V4_RESTORE_PROOF';END IF;
 FOR fn IN SELECT p.oid,p.proname,p.proowner,p.prosecdef,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN('in_store_sales_mutate_v4','in_store_quote_v4','in_store_sales_projection_v4','accounting_post_pos_sale_v4','accounting_pending_receipt_v4','accounting_sales_channel_matches_v4','accounting_event_sales_channel_matches_v4','accounting_manual_event_context_v4') LOOP
 IF has_function_privilege('celebix_saas_app',fn.oid,'EXECUTE') OR fn.proowner<>'celebix_saas_owner'::regrole OR NOT fn.prosecdef THEN RAISE EXCEPTION 'MANUAL_V4_INTERNAL_AUTHORITY: %',fn.proname;END IF;
 END LOOP;
 IF NOT has_function_privilege('celebix_saas_app','saas.in_store_sales_confirm_payment_v4(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,uuid,uuid,text)','EXECUTE') OR has_table_privilege('celebix_saas_app','saas.in_store_payment_receipts_v4','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('celebix_saas_app','saas.in_store_payment_returns_v4','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'MANUAL_V4_RPC_SEAL';END IF;
END $assert$;
ROLLBACK;
