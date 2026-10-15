-- Remove disabled personnel grants while retaining membership and durable history.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.merchant_phone_237_backup(
 signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,
 function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE saas.merchant_phone_237_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.merchant_phone_237_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.merchant_phone_237_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
INSERT INTO saas.merchant_phone_237_backup(signature,definition,original_sha256,function_oid,function_owner,function_acl)
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.oid,p.proowner,p.proacl
 FROM pg_proc p WHERE p.oid='saas.merchant_whatsapp_command(text,jsonb)'::regprocedure;
DO $patch$
DECLARE saved record;definition text;old_piece text;new_piece text;
BEGIN
 IF (SELECT count(*) FROM saas.merchant_phone_237_backup)<>1 THEN RAISE EXCEPTION 'MERCHANT237_BACKUP_INVALID';END IF;
 SELECT * INTO STRICT saved FROM saas.merchant_phone_237_backup;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=saved.function_oid AND proowner='celebix_saas_owner'::regrole AND prosecdef
  AND proconfig=ARRAY['search_path=pg_catalog, saas']::text[] AND pg_get_function_result(oid)='TABLE(outcome text, authority jsonb)')
 THEN RAISE EXCEPTION 'MERCHANT237_AUTHORITY_DRIFT';END IF;
 definition:=saved.definition;
 IF position('saas.admin_login_session_allowed' IN definition)=0
  OR position('saas.platform_store_versions WHERE store_id=sid FOR UPDATE' IN definition)=0
  OR position('merchant.staff:' IN definition)=0 OR position('staff_management' IN definition)=0
  OR position('phone.operator_enrolled_at' IN definition)=0
 THEN RAISE EXCEPTION 'MERCHANT237_PREDECESSOR_FENCE_DRIFT';END IF;
 FOR old_piece,new_piece IN SELECT * FROM (VALUES
  ($old0$ WHEN 'staff_update' THEN ARRAY['actorTokenKeyId','actorTokenDigest','operationId','staffId','expectedVersion','displayName','role','enabled'] END;$old0$,$new0$ WHEN 'staff_delete' THEN ARRAY['actorTokenKeyId','actorTokenDigest','operationId','staffId','expectedVersion']
 WHEN 'staff_update' THEN ARRAY['actorTokenKeyId','actorTokenDigest','operationId','staffId','expectedVersion','displayName','role','enabled'] END;$new0$),
  ($old1$  ELSE
   SELECT * INTO staff FROM saas.merchant_phone_staff WHERE id=(p_input->>'staffId')::uuid AND store_id=sid FOR UPDATE;$old1$,$new1$  ELSIF p_action='staff_delete' THEN
   SELECT * INTO staff FROM saas.merchant_phone_staff WHERE id=(p_input->>'staffId')::uuid AND store_id=sid FOR UPDATE;
   IF NOT FOUND OR staff.version<>(p_input->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
   IF staff.enabled THEN RETURN QUERY SELECT 'staff_not_disabled',NULL::jsonb;RETURN;END IF;
   IF staff.membership_id IS NOT NULL THEN
    PERFORM 1 FROM saas.memberships WHERE id=staff.membership_id AND store_id=sid AND role<>'store_owner' AND support_session_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'owner_required',NULL::jsonb;RETURN;END IF;
    UPDATE saas.memberships SET status='revoked',updated_at=n WHERE id=staff.membership_id AND status<>'revoked';
   END IF;
   DELETE FROM saas.merchant_phone_staff WHERE id=staff.id;out:='deleted';
  ELSE
   SELECT * INTO staff FROM saas.merchant_phone_staff WHERE id=(p_input->>'staffId')::uuid AND store_id=sid FOR UPDATE;$new1$),
  ($old2$  IF FOUND THEN IF prior.actor_id<>actor OR prior.store_id<>sid OR prior.action<>p_action OR prior.input<>p_input THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',prior.authority;END IF;RETURN;END IF;$old2$,$new2$  IF FOUND THEN IF prior.actor_id<>actor OR prior.store_id<>sid OR prior.action<>p_action OR prior.input<>p_input THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',CASE WHEN p_action='staff_delete' THEN prior.authority-'deletedStaff' ELSE prior.authority END;END IF;RETURN;END IF;$new2$),
  ($old3$  INSERT INTO saas.merchant_phone_operations VALUES(op,actor,sid,p_action,p_input,out,body,n);RETURN QUERY SELECT out,body;RETURN;$old3$,$new3$  INSERT INTO saas.merchant_phone_operations VALUES(op,actor,sid,p_action,p_input,out,CASE WHEN p_action='staff_delete' THEN body||jsonb_build_object('deletedStaff',to_jsonb(staff)) ELSE body END,n);RETURN QUERY SELECT out,body;RETURN;$new3$)
 ) AS changes(old_value,new_value) LOOP
  IF (length(definition)-length(replace(definition,old_piece,'')))/length(old_piece)<>1 THEN RAISE EXCEPTION 'MERCHANT237_SOURCE_DRIFT';END IF;
  definition:=replace(definition,old_piece,new_piece);
 END LOOP;
 EXECUTE definition;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=saved.function_oid AND proowner=saved.function_owner AND proacl IS NOT DISTINCT FROM saved.function_acl)
 THEN RAISE EXCEPTION 'MERCHANT237_PUBLISH_AUTHORITY_DRIFT';END IF;
 UPDATE saas.merchant_phone_237_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(function_oid),'UTF8')),'hex');
END $patch$;
COMMIT;
