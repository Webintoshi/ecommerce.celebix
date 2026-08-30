BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.product_media WHERE cleanup_state<>'active' OR retention_expires_at IS NOT NULL) OR EXISTS(SELECT 1 FROM saas.product_media_cleanup_operations) THEN
    RAISE EXCEPTION 'CATALOG_118_DOWN_REQUIRES_PRE_RESTORE';
  END IF;
END
$guard$;

DROP FUNCTION saas.media_record_archived_object_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text);
DROP FUNCTION saas.media_claim_archived_cleanup(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint);
DROP FUNCTION saas.media_cleanup_candidate_projection(uuid);
DROP TRIGGER product_media_cleanup_operations_one_way ON saas.product_media_cleanup_operations;
DROP FUNCTION saas.guard_product_media_cleanup_operation();
DROP TABLE saas.product_media_cleanup_operations;
DROP FUNCTION saas.media_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint);
DROP FUNCTION saas.media_get_product_restore_candidate(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,bigint);
DROP FUNCTION saas.media_list_product_lifecycle(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean);
DROP FUNCTION saas.media_lifecycle_projection(uuid,timestamptz);

ALTER TABLE saas.product_media_operations DROP CONSTRAINT product_media_operations_kind_check;
ALTER TABLE saas.product_media_operations ADD CONSTRAINT product_media_operations_kind_check CHECK(operation_kind IN('attach_media','update_alt','reorder_media','archive_media'));
ALTER TABLE saas.product_media DROP CONSTRAINT product_media_retention_lifecycle_check,DROP CONSTRAINT product_media_cleanup_state_check,DROP COLUMN cleanup_state,DROP COLUMN retention_expires_at;

-- Emergency only: the exact pre-118 function bodies must be restored from the verified
-- pre-restore migration snapshot before committing this down migration.
DO $pre_restore_only$
BEGIN
  RAISE EXCEPTION 'CATALOG_118_DOWN_REQUIRES_VERIFIED_PRE_RESTORE_FUNCTION_SNAPSHOT';
END
$pre_restore_only$;
COMMIT;
