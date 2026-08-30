BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.product_media
  ADD COLUMN retention_expires_at timestamptz,
  ADD COLUMN cleanup_state text NOT NULL DEFAULT 'active';

UPDATE saas.product_media
SET retention_expires_at=archived_at+INTERVAL '30 days',
    cleanup_state=CASE WHEN object_deleted_at IS NULL THEN 'retained' ELSE 'object_deleted' END
WHERE status='archived';

ALTER TABLE saas.product_media
  ADD CONSTRAINT product_media_cleanup_state_check CHECK(cleanup_state IN('active','retained','cleanup_pending','object_deleted')),
  ADD CONSTRAINT product_media_retention_lifecycle_check CHECK(
    (status IN('active','pending') AND retention_expires_at IS NULL AND cleanup_state='active' AND object_deleted_at IS NULL)
    OR
    (status='archived' AND retention_expires_at IS NOT NULL AND retention_expires_at>=archived_at
      AND ((cleanup_state IN('retained','cleanup_pending') AND object_deleted_at IS NULL)
        OR (cleanup_state='object_deleted' AND object_deleted_at IS NOT NULL)))
  );

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

CREATE OR REPLACE FUNCTION saas.media_finalize_product_archive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_media_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; operation saas.product_media_archive_operations%ROWTYPE; projection jsonb;
BEGIN
  authority_error:=saas.media_product_operation_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now,'catalog_admin.archive');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT archive.* INTO operation FROM saas.product_media_archive_operations AS archive WHERE archive.operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR operation.store_id<>p_store_id OR operation.media_id<>p_media_id
     OR operation.product_id<>p_product_id OR operation.payload_fingerprint<>p_fingerprint
     OR operation.expected_version<>p_expected_version THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  IF operation.state IN('committed','deleted') THEN
    RETURN QUERY SELECT 'operation_replayed'::text,saas.media_archive_operation_projection(p_operation_id); RETURN;
  END IF;
  PERFORM 1 FROM saas.product_media
    WHERE store_id=p_store_id AND product_id=p_product_id AND id=p_media_id
      AND object_key=operation.object_key AND status='pending' AND version=p_expected_version+1
    FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.product_media
    SET status='archived',archived_at=p_now,retention_expires_at=p_now+INTERVAL '30 days',cleanup_state='retained',updated_at=p_now,version=version+1
    WHERE id=p_media_id;
  projection:=saas.media_archive_operation_projection(p_operation_id);
  INSERT INTO saas.product_media_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,'archive_media',p_fingerprint,projection,p_now);
  UPDATE saas.product_media_archive_operations SET state='committed',committed_at=p_now,updated_at=p_now,version=version+1 WHERE operation_id=p_operation_id;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.media_lifecycle_projection(p_media_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',media.id,'productId',media.product_id,'variantId',media.variant_id,
    'publicUrl',CASE WHEN media.object_deleted_at IS NULL THEN media.public_url END,
    'mediaType',media.media_type,'altText',media.alt_text,'width',media.width,'height',media.height,
    'byteSize',media.byte_size,'sortOrder',media.sort_order,'status',media.status,
    'cleanupState',CASE
      WHEN media.status='active' THEN 'active'
      WHEN media.object_deleted_at IS NOT NULL THEN 'object_deleted'
      WHEN media.cleanup_state='retained' AND media.retention_expires_at<=p_now THEN 'eligible'
      ELSE media.cleanup_state
    END,
    'createdAt',saas.catalog_timestamp(media.created_at),'updatedAt',saas.catalog_timestamp(media.updated_at),
    'archivedAt',CASE WHEN media.archived_at IS NULL THEN NULL ELSE saas.catalog_timestamp(media.archived_at) END,
    'retentionExpiresAt',CASE WHEN media.retention_expires_at IS NULL THEN NULL ELSE saas.catalog_timestamp(media.retention_expires_at) END,
    'version',media.version
  )) FROM saas.product_media AS media WHERE media.id=p_media_id AND media.status IN('active','archived')
$function$;
REVOKE ALL ON FUNCTION saas.media_lifecycle_projection(uuid,timestamptz) FROM PUBLIC;

CREATE FUNCTION saas.media_list_product_lifecycle(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_storage_bytes bigint,p_now timestamptz,p_product_id uuid,p_include_archived boolean
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.media_read_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_include_archived IS NULL THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.products WHERE id=p_product_id AND store_id=p_store_id) THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,COALESCE(pg_catalog.jsonb_agg(saas.media_lifecycle_projection(media.id,p_now) ORDER BY media.status,media.sort_order,media.id),'[]'::jsonb)
    FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.status IN('active','archived') AND (p_include_archived OR media.status='active');
END
$function$;
REVOKE ALL ON FUNCTION saas.media_list_product_lifecycle(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.media_list_product_lifecycle(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean) TO celebix_saas_app;

ALTER TABLE saas.product_media_operations DROP CONSTRAINT product_media_operations_kind_check;
ALTER TABLE saas.product_media_operations ADD CONSTRAINT product_media_operations_kind_check CHECK(operation_kind IN('attach_media','update_alt','reorder_media','archive_media','restore_media'));

CREATE FUNCTION saas.media_get_product_restore_candidate(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_storage_bytes bigint,p_now timestamptz,p_product_id uuid,p_media_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; selected saas.product_media%ROWTYPE;
BEGIN
  authority_error:=saas.media_product_operation_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now,'catalog_admin.archive');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT media.* INTO selected FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.id=p_media_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'media_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF selected.status<>'archived' OR selected.cleanup_state<>'retained' OR selected.object_deleted_at IS NOT NULL OR selected.retention_expires_at<=p_now THEN RETURN QUERY SELECT 'media_not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_build_object('candidate',pg_catalog.jsonb_build_object(
    'mediaId',selected.id,'productId',selected.product_id,'objectKey',selected.object_key,'mediaType',selected.media_type,
    'byteSize',selected.byte_size,'expectedVersion',selected.version));
END
$function$;

CREATE FUNCTION saas.media_restore_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_storage_bytes bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_media_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; existing saas.product_media_operations%ROWTYPE; projection jsonb;
BEGIN
  authority_error:=saas.media_product_operation_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now,'catalog_admin.archive');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.media.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.product_media_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id=p_store_id AND existing.operation_kind='restore_media' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN; END IF;
  PERFORM 1 FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.id=p_media_id AND media.status='archived' AND media.cleanup_state='retained' AND media.object_deleted_at IS NULL AND media.retention_expires_at>p_now FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'media_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF (SELECT version FROM saas.product_media WHERE id=p_media_id)<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.product_media SET status='active',archived_at=NULL,retention_expires_at=NULL,cleanup_state='active',updated_at=p_now,version=version+1 WHERE id=p_media_id;
  projection:=pg_catalog.jsonb_build_object('media',saas.media_lifecycle_projection(p_media_id,p_now));
  INSERT INTO saas.product_media_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_operation_id,p_store_id,'restore_media',p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'committed'::text,projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb;
END
$function$;

CREATE TABLE saas.product_media_cleanup_operations(
  operation_id uuid PRIMARY KEY,store_id uuid NOT NULL,product_id uuid NOT NULL,media_id uuid NOT NULL,object_key text NOT NULL,
  payload_fingerprint char(64) NOT NULL,expected_version bigint NOT NULL,state text NOT NULL,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,deleted_at timestamptz,
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,media_id) REFERENCES saas.product_media(store_id,id) ON DELETE RESTRICT,
  CHECK(payload_fingerprint~'^[a-f0-9]{64}$' AND expected_version>0),CHECK(state IN('claimed','deleted')),
  CHECK((state='claimed' AND deleted_at IS NULL) OR (state='deleted' AND deleted_at IS NOT NULL)),CHECK(updated_at>=created_at)
);
CREATE UNIQUE INDEX product_media_cleanup_one_claim ON saas.product_media_cleanup_operations(store_id,media_id) WHERE state='claimed';
ALTER TABLE saas.product_media_cleanup_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.product_media_cleanup_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.product_media_cleanup_operations FROM PUBLIC,celebix_saas_app;

CREATE FUNCTION saas.guard_product_media_cleanup_operation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$
BEGIN
 IF TG_OP='DELETE' AND pg_catalog.current_setting('celebix.catalog_safe_remove',true)=OLD.store_id::text||':'||OLD.product_id::text THEN RETURN OLD; END IF;
 IF TG_OP='DELETE' OR NEW.operation_id<>OLD.operation_id OR NEW.store_id<>OLD.store_id OR NEW.product_id<>OLD.product_id OR NEW.media_id<>OLD.media_id OR NEW.object_key<>OLD.object_key OR NEW.payload_fingerprint<>OLD.payload_fingerprint OR NEW.expected_version<>OLD.expected_version OR NEW.created_at<>OLD.created_at OR NOT(OLD.state='claimed' AND NEW.state='deleted' AND OLD.deleted_at IS NULL AND NEW.deleted_at=NEW.updated_at AND NEW.updated_at>=OLD.updated_at) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_CLEANUP_OPERATION_MUTATION_FORBIDDEN'; END IF;
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_product_media_cleanup_operation() FROM PUBLIC;
CREATE TRIGGER product_media_cleanup_operations_one_way BEFORE UPDATE OR DELETE ON saas.product_media_cleanup_operations FOR EACH ROW EXECUTE FUNCTION saas.guard_product_media_cleanup_operation();

CREATE FUNCTION saas.media_cleanup_candidate_projection(p_operation_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
 SELECT pg_catalog.jsonb_build_object('candidate',pg_catalog.jsonb_build_object(
   'mediaId',media.id,'productId',media.product_id,'objectKey',media.object_key,'mediaType',media.media_type,
   'byteSize',media.byte_size,'expectedVersion',operation.expected_version))
 FROM saas.product_media_cleanup_operations AS operation JOIN saas.product_media AS media ON media.store_id=operation.store_id AND media.id=operation.media_id
 WHERE operation.operation_id=p_operation_id
$function$;
REVOKE ALL ON FUNCTION saas.media_cleanup_candidate_projection(uuid) FROM PUBLIC;

CREATE FUNCTION saas.media_claim_archived_cleanup(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_media_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; existing saas.product_media_cleanup_operations%ROWTYPE; selected saas.product_media%ROWTYPE;
BEGIN
 authority_error:=saas.media_product_operation_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now,'catalog_admin.archive');
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.media.cleanup:'||p_operation_id::text,0));
 SELECT operation.* INTO existing FROM saas.product_media_cleanup_operations AS operation WHERE operation.operation_id=p_operation_id;
 IF FOUND THEN IF existing.store_id=p_store_id AND existing.product_id=p_product_id AND existing.media_id=p_media_id AND existing.payload_fingerprint=p_fingerprint AND existing.expected_version=p_expected_version THEN RETURN QUERY SELECT 'operation_replayed'::text,saas.media_cleanup_candidate_projection(p_operation_id); ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN; END IF;
 SELECT media.* INTO selected FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.id=p_media_id FOR UPDATE;
 IF NOT FOUND OR selected.status<>'archived' OR selected.object_deleted_at IS NOT NULL THEN RETURN QUERY SELECT 'media_not_found'::text,NULL::jsonb; RETURN; END IF;
 IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
 IF selected.cleanup_state<>'retained' OR selected.retention_expires_at>p_now THEN RETURN QUERY SELECT 'retention_active'::text,NULL::jsonb; RETURN; END IF;
 UPDATE saas.product_media SET cleanup_state='cleanup_pending',updated_at=p_now,version=version+1 WHERE id=p_media_id;
 INSERT INTO saas.product_media_cleanup_operations(operation_id,store_id,product_id,media_id,object_key,payload_fingerprint,expected_version,state,created_at,updated_at) VALUES(p_operation_id,p_store_id,p_product_id,p_media_id,selected.object_key,p_fingerprint,p_expected_version,'claimed',p_now,p_now);
 RETURN QUERY SELECT 'claimed'::text,saas.media_cleanup_candidate_projection(p_operation_id);
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.media_record_archived_object_deleted(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_product_id uuid,p_media_id uuid,p_object_key text
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; operation saas.product_media_cleanup_operations%ROWTYPE; projection jsonb;
BEGIN
 authority_error:=saas.media_product_operation_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now,'catalog_admin.archive');
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 SELECT cleanup.* INTO operation FROM saas.product_media_cleanup_operations AS cleanup WHERE cleanup.operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR operation.store_id<>p_store_id OR operation.product_id<>p_product_id OR operation.media_id<>p_media_id OR operation.object_key<>p_object_key THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
 IF operation.state='deleted' THEN RETURN QUERY SELECT 'operation_replayed'::text,pg_catalog.jsonb_build_object('media',saas.media_lifecycle_projection(p_media_id,p_now)); RETURN; END IF;
 PERFORM 1 FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.product_id=p_product_id AND media.id=p_media_id AND media.object_key=p_object_key AND media.status='archived' AND media.cleanup_state='cleanup_pending' AND media.object_deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
 UPDATE saas.product_media SET cleanup_state='object_deleted',object_deleted_at=p_now,updated_at=p_now,version=version+1 WHERE id=p_media_id;
 UPDATE saas.product_media_cleanup_operations SET state='deleted',deleted_at=p_now,updated_at=p_now WHERE operation_id=p_operation_id;
 projection:=pg_catalog.jsonb_build_object('media',saas.media_lifecycle_projection(p_media_id,p_now));
 RETURN QUERY SELECT 'deleted'::text,projection;
END
$function$;

-- Rollback compatibility: the historical application deletes the exact object before recording
-- proof. Keep that function callable on the additive schema while confining its exceptional
-- retained -> deleted transition to this SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION saas.media_mark_archived_object_deleted(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_media_id uuid,p_product_id uuid,p_object_key text
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; selected saas.product_media%ROWTYPE; archive_operation saas.product_media_archive_operations%ROWTYPE;
BEGIN
 authority_error:=saas.media_product_operation_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now,'catalog_admin.archive');
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 SELECT media.* INTO selected FROM saas.product_media AS media WHERE media.store_id=p_store_id AND media.id=p_media_id AND media.product_id=p_product_id AND media.object_key=p_object_key AND media.status='archived' FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
 SELECT archive.* INTO archive_operation FROM saas.product_media_archive_operations AS archive WHERE archive.operation_id=p_operation_id FOR UPDATE;
 IF NOT FOUND OR archive_operation.store_id<>p_store_id OR archive_operation.media_id<>p_media_id OR archive_operation.product_id<>p_product_id OR archive_operation.object_key<>p_object_key OR archive_operation.state NOT IN('committed','deleted') THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
 IF selected.object_deleted_at IS NOT NULL THEN RETURN QUERY SELECT 'operation_replayed'::text,pg_catalog.jsonb_build_object('media',saas.media_projection(p_media_id)); RETURN; END IF;
 PERFORM pg_catalog.set_config('celebix.media_rollback_cleanup',p_media_id::text,true);
 UPDATE saas.product_media SET cleanup_state='object_deleted',object_deleted_at=p_now,updated_at=p_now,version=version+1 WHERE id=p_media_id;
 UPDATE saas.product_media_archive_operations SET state='deleted',deleted_at=p_now,updated_at=p_now,version=version+1 WHERE operation_id=p_operation_id;
 RETURN QUERY SELECT 'deleted'::text,pg_catalog.jsonb_build_object('media',saas.media_projection(p_media_id));
END
$function$;

REVOKE ALL ON FUNCTION saas.media_get_product_restore_candidate(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_claim_archived_cleanup(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_record_archived_object_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.media_get_product_restore_candidate(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_claim_archived_cleanup(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_record_archived_object_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) TO celebix_saas_app;
ALTER FUNCTION saas.guard_product_media_authority() OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.media_finalize_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.media_lifecycle_projection(uuid,timestamptz) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.media_list_product_lifecycle(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.media_get_product_restore_candidate(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,bigint) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.media_restore_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.guard_product_media_cleanup_operation() OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.media_cleanup_candidate_projection(uuid) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.media_claim_archived_cleanup(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.media_record_archived_object_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) OWNER TO celebix_saas_owner;
ALTER FUNCTION saas.media_mark_archived_object_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) OWNER TO celebix_saas_owner;

COMMIT;
