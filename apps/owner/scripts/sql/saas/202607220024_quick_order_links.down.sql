-- Phase 3B2 rollback is intentionally destructive to checkout configuration and quick-order link rows.
-- It is permitted only in an isolated disposable rehearsal before shared quick-link data exists.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

-- The four table-local public UUID checks are removed with their owning tables below.

DROP FUNCTION saas.quick_link_merchant_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.quick_link_canonical_image_url(uuid,uuid,uuid);

DROP TRIGGER quick_order_link_operations_immutable ON saas.quick_order_link_operations;
DROP INDEX saas.quick_order_link_operations_store_committed_idx;
DROP TABLE saas.quick_order_link_operations;
DROP FUNCTION saas.guard_quick_link_operation_mutation();
DROP FUNCTION saas.quick_link_operation_result_is_valid(jsonb,uuid);
DROP FUNCTION saas.quick_link_timestamp_is_canonical(text);

DROP INDEX saas.quick_order_link_items_link_position_idx;
DROP TABLE saas.quick_order_link_items;

DROP TRIGGER quick_order_links_provider_authority ON saas.quick_order_links;
DROP INDEX saas.quick_order_links_token_digest_idx;
DROP INDEX saas.quick_order_links_store_status_expiry_idx;
DROP TABLE saas.quick_order_links;
DROP FUNCTION saas.guard_quick_link_provider_authority();

DROP INDEX saas.checkout_provider_configs_store_status_idx;
DROP TABLE saas.checkout_provider_configs;

DROP FUNCTION saas.quick_link_sealed_envelope_is_valid(jsonb,text);
DROP FUNCTION saas.quick_link_base64url_is_canonical(text);
DROP FUNCTION saas.quick_link_address_is_valid(jsonb);

ALTER TABLE saas.product_variants
  DROP CONSTRAINT product_variants_store_product_id_key;

COMMIT;
