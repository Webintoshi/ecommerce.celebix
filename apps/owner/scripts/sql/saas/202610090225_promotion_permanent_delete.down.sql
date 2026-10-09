-- Only a pre-use rollback is safe. Once a discount has been permanently
-- deleted, restoring operational visibility would violate the user decision.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
-- Serialize the no-use gate with the first immutable deletion receipt.
LOCK TABLE saas.promotion_deletions IN ACCESS EXCLUSIVE MODE;
DO $safe$ BEGIN
 IF EXISTS(SELECT 1 FROM saas.promotion_deletions) THEN RAISE EXCEPTION 'PROMOTION_DELETE_ROLLBACK_REFUSED_AFTER_USE';END IF;
 IF(SELECT count(*) FROM saas.promotion_deletion_function_baseline)<>24 THEN RAISE EXCEPTION 'PROMOTION_DELETE_ROLLBACK_BASELINE_MISSING';END IF;
 IF EXISTS(SELECT 1 FROM saas.promotion_deletion_function_baseline b LEFT JOIN pg_proc p ON p.oid=to_regprocedure(b.identity) WHERE p.oid IS NULL OR md5(pg_get_functiondef(p.oid))<>b.patched_hash OR p.proowner<>b.owner_oid OR p.proacl::text IS DISTINCT FROM b.acl OR md5(b.definition)<>b.original_hash) THEN RAISE EXCEPTION 'PROMOTION_DELETE_ROLLBACK_NATIVE_DRIFT';END IF;
END $safe$;
DO $restore$ DECLARE r record;f oid;BEGIN
 FOR r IN SELECT * FROM saas.promotion_deletion_function_baseline ORDER BY identity LOOP
  EXECUTE r.definition;f:=to_regprocedure(r.identity);
  IF(SELECT md5(pg_get_functiondef(f))<>r.original_hash OR proowner<>r.owner_oid OR proacl::text IS DISTINCT FROM r.acl FROM pg_proc WHERE oid=f) THEN RAISE EXCEPTION 'PROMOTION_DELETE_ROLLBACK_RESTORE_DRIFT:%',r.identity;END IF;
 END LOOP;
END $restore$;
DROP TRIGGER promotion_deletion_operation_namespace ON saas.promotion_operations;
DROP TRIGGER promotion_deleted_targets ON saas.promotion_targets;
DROP TRIGGER promotion_deleted_batches ON saas.promotion_code_batches;
DROP TRIGGER promotion_deleted_codes ON saas.promotion_codes;
DROP TRIGGER promotion_deleted_parent ON saas.promotions;
DROP TRIGGER promotion_deletion_immutable ON saas.promotion_deletions;
DROP FUNCTION saas.promotion_deletion_write_guard_v1();
DROP FUNCTION saas.promotion_delete_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.promotion_delete_recover_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.promotion_delete_impact_v1(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.promotion_delete_impact_projection_v1(uuid,uuid);
DROP FUNCTION saas.promotion_delete_fingerprint_v1(uuid,uuid,bigint);
DROP FUNCTION saas.promotion_is_deleted_v1(uuid,uuid);
DROP TABLE saas.promotion_deletion_function_baseline;
DROP TABLE saas.promotion_deletions;
COMMIT;
