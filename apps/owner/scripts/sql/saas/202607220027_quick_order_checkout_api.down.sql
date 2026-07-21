-- Disposable-only rollback for Phase 3B2 quick-order checkout authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $rollback_guard$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.checkout_operations
    WHERE provider_config_id IS NOT NULL OR worker_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'QUICK_ORDER_CHECKOUT_API_ROLLBACK_HISTORY_CONFLICT';
  END IF;
END
$rollback_guard$;

REVOKE USAGE ON SCHEMA saas FROM celebix_saas_workflow;

DROP FUNCTION saas.checkout_recover_attempt_operation(uuid,uuid,text,text);
DROP FUNCTION saas.checkout_get_redemption_status(text,text,timestamptz);
DROP FUNCTION saas.checkout_get_payment_presentation(text,text,timestamptz);
DROP FUNCTION saas.checkout_recover_cleanup_operation(uuid,uuid,text);
DROP FUNCTION saas.checkout_cleanup_pre_provider_attempts(uuid,uuid,text,timestamptz,bigint);
DROP FUNCTION saas.checkout_mark_initiation_failed(uuid,uuid,text,timestamptz);
DROP FUNCTION saas.checkout_mark_initiation_unknown(uuid,uuid,text,timestamptz);
DROP FUNCTION saas.quick_checkout_mark_attempt_without_token(uuid,uuid,text,timestamptz,text);
DROP FUNCTION saas.checkout_mark_provider_ready(uuid,uuid,text,jsonb,text,timestamptz);
DROP FUNCTION saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamptz);
DROP FUNCTION saas.quick_checkout_customer_snapshot_is_valid(saas.quick_order_links);
DROP FUNCTION saas.quick_links_recover_redemption_revoke(text,text,uuid,text,timestamptz);
DROP FUNCTION saas.quick_links_revoke_redemption(text,text,uuid,text,timestamptz);
DROP FUNCTION saas.quick_links_resolve_redemption(text,text,timestamptz);
DROP FUNCTION saas.quick_links_claim_redemption(text,text,uuid,text,timestamptz,timestamptz);
DROP FUNCTION saas.quick_checkout_public_quote(uuid,uuid);
DROP FUNCTION saas.quick_links_recover_provider_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text);
DROP FUNCTION saas.quick_links_reveal_provider_configuration(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.quick_links_reveal_credential(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.quick_links_revoke_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,uuid,text);
DROP FUNCTION saas.quick_links_configure_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,text,jsonb,uuid,text);
DROP FUNCTION saas.quick_links_get_provider_readiness(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.quick_checkout_manage_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.quick_checkout_provider_projection(uuid,uuid);
DROP FUNCTION saas.quick_checkout_uuid_is_valid(uuid);
DROP FUNCTION saas.quick_checkout_hostname_is_valid(text);

DROP FUNCTION saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text);
ALTER FUNCTION saas.quick_links_duplicate_025(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text)
  RENAME TO quick_links_duplicate;
DROP FUNCTION saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text);
ALTER FUNCTION saas.quick_links_create_025(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)
  RENAME TO quick_links_create;
GRANT EXECUTE ON FUNCTION saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text) TO celebix_saas_app;

ALTER TABLE saas.checkout_operations
  DROP CONSTRAINT checkout_operations_provider_store_fk,
  DROP CONSTRAINT checkout_operations_scope_check,
  DROP CONSTRAINT checkout_operations_worker_id_check,
  DROP CONSTRAINT checkout_operations_kind_check,
  DROP COLUMN worker_id,
  DROP COLUMN provider_config_id,
  ALTER COLUMN store_id SET NOT NULL,
  ADD CONSTRAINT checkout_operations_kind_check CHECK (operation_kind IN (
    'revoke_redemption','begin_attempt','provider_ready','initiation_unknown','initiation_failed',
    'cleanup_attempt','settle_callback','reconcile_success','reconcile_unknown'
  )),
  ADD CONSTRAINT checkout_operations_scope_check CHECK (
    attempt_id IS NOT NULL OR redemption_session_id IS NOT NULL
  );

COMMIT;
