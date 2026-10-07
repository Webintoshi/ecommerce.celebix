-- Rollback is allowed only before V4 data exists. Operational rollback uses the release flag.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $restore$ DECLARE saved record;fn record;BEGIN
 IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE contract_version=4) OR EXISTS(SELECT 1 FROM saas.in_store_payment_receipts_v4) THEN RAISE EXCEPTION 'MANUAL_V4_DATA_PRESENT_USE_RELEASE_FLAG';END IF;
 FOR saved IN SELECT * FROM saas.manual_sales_v4_restore ORDER BY signature LOOP
 IF md5(pg_get_functiondef(saved.signature::regprocedure)) IS DISTINCT FROM saved.after_hash THEN RAISE EXCEPTION 'MANUAL_V4_DOWN_DEFINITION_DRIFT: %',saved.signature;END IF;
 EXECUTE saved.definition;
 END LOOP;
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname=ANY(ARRAY['in_store_payment_parts_valid_v4','in_store_address_valid_v4','in_store_quote_v4','in_store_projection_v4_value','in_store_sales_projection_v4','accounting_post_pos_sale_v4','in_store_sales_mutate_v4','in_store_sales_create_v4','in_store_sales_update_v4','in_store_sales_hold_v4','in_store_sales_prepare_v4','in_store_sales_complete_v4','in_store_sales_cancel_v4','in_store_sales_discard_v4','in_store_sales_takeover_v4','in_store_sales_get_v4','in_store_sales_get_operation_v4','in_store_sales_list_v4','in_store_sales_bootstrap_v4','in_store_sales_list_staff_v4','in_store_sales_recover_staff_v4','in_store_sales_set_staff_v4','in_store_sales_confirm_payment_v4','in_store_sales_revise_payments_v4','in_store_sales_abort_v4','in_store_sales_return_payment_v4','in_store_sales_reconcile_payment_v4','accounting_sales_channel_matches_v4','accounting_pending_receipt_v4','accounting_event_sales_channel_matches_v4','accounting_manual_event_context_v4']) LOOP EXECUTE format('DROP FUNCTION %s',fn.oid::regprocedure);END LOOP;
END $restore$;
DROP TABLE saas.in_store_obsolete_payment_reconciliations_v4,saas.in_store_payment_returns_v4,saas.in_store_payment_receipts_v4;
ALTER TABLE saas.in_store_sales DROP CONSTRAINT in_store_v4_contract_version,DROP CONSTRAINT in_store_v4_total,DROP CONSTRAINT in_store_v4_payment_stage,DROP CONSTRAINT in_store_sales_lifecycle,DROP CONSTRAINT in_store_v4_receivable,
 DROP COLUMN sales_channel,DROP COLUMN social_platform,DROP COLUMN social_reference,DROP COLUMN fulfillment_method,DROP COLUMN shipping_address,DROP COLUMN billing_address,DROP COLUMN shipping_cents,DROP COLUMN payment_parts,DROP COLUMN prepare_operation_id,DROP COLUMN payment_plan_version,DROP COLUMN abort_requested,DROP COLUMN accounting_receivable_id,
 ADD CONSTRAINT in_store_v3_contract_version CHECK(contract_version IN(1,2,3)),
 ADD CONSTRAINT in_store_sales_check1 CHECK(total_cents=subtotal_cents-discount_cents AND total_cents>=0),
 ADD CONSTRAINT in_store_v3_payment_stage CHECK(contract_version=1 OR status NOT IN('payment_pending','payment_received','completed') OR payment_method IS NOT NULL OR contract_version=3 AND initial_collection_cents=0),
 ADD CONSTRAINT in_store_sales_lifecycle CHECK((status IN('draft','held','payment_pending','cancelled') AND payment_received_at IS NULL AND completed_at IS NULL AND order_id IS NULL AND order_number IS NULL) OR(status='payment_received' AND payment_received_at IS NOT NULL AND completed_at IS NULL AND order_id IS NULL AND order_number IS NULL) OR(status='completed' AND (payment_received_at IS NOT NULL OR contract_version=3 AND initial_collection_cents=0) AND completed_at IS NOT NULL AND order_number IS NOT NULL));
ALTER TABLE saas.accounting_release_state DROP COLUMN manual_sales_v4_enabled;
DROP TABLE saas.manual_sales_v4_restore;
COMMIT;
