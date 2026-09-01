BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.guard_product_media_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.product_id<>OLD.product_id
    OR NEW.variant_id IS DISTINCT FROM OLD.variant_id OR NEW.object_key<>OLD.object_key
    OR NEW.public_url<>OLD.public_url OR NEW.media_type<>OLD.media_type
    OR NEW.width IS DISTINCT FROM OLD.width OR NEW.height IS DISTINCT FROM OLD.height
    OR NEW.byte_size<>OLD.byte_size OR NEW.created_at<>OLD.created_at
    OR NEW.version<>OLD.version+1
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_AUTHORITY_IMMUTABLE'; END IF;
  IF TG_OP='UPDATE' AND NOT(
    (OLD.status='active' AND NEW.status IN('active','pending') AND NEW.cleanup_state='active' AND NEW.retention_expires_at IS NULL)
    OR (OLD.status='pending' AND NEW.status='archived' AND NEW.cleanup_state='retained' AND NEW.retention_expires_at=NEW.archived_at+INTERVAL '30 days')
    OR (OLD.status='archived' AND OLD.cleanup_state='retained' AND NEW.status='active' AND NEW.archived_at IS NULL AND NEW.retention_expires_at IS NULL AND NEW.cleanup_state='active')
    OR (OLD.status='archived' AND OLD.cleanup_state='retained' AND NEW.status='archived' AND NEW.cleanup_state='cleanup_pending' AND NEW.retention_expires_at=OLD.retention_expires_at)
    OR (OLD.status='archived' AND OLD.cleanup_state='cleanup_pending' AND NEW.status='archived' AND NEW.cleanup_state='object_deleted' AND NEW.object_deleted_at=NEW.updated_at AND NEW.retention_expires_at=OLD.retention_expires_at)
    OR (OLD.status='archived' AND OLD.cleanup_state='retained' AND NEW.status='archived' AND NEW.cleanup_state='object_deleted' AND NEW.object_deleted_at=NEW.updated_at AND NEW.retention_expires_at=OLD.retention_expires_at AND pg_catalog.current_setting('celebix.media_rollback_cleanup',true)=OLD.id::text)
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_LIFECYCLE_INVALID'; END IF;
  IF NEW.variant_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM saas.product_variants AS variant
    WHERE variant.id=NEW.variant_id AND variant.product_id=NEW.product_id AND variant.store_id=NEW.store_id
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_VARIANT_SCOPE_INVALID'; END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION saas.guard_product_media_authority() FROM PUBLIC;
ALTER FUNCTION saas.guard_product_media_authority() OWNER TO celebix_saas_owner;

COMMIT;
