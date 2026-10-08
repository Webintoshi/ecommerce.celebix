-- SQL220's checkpoint validator must subtract keys from the progress object.
-- Replace only the reviewed expression; preserve function identity and authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $patch$
DECLARE
 signature regprocedure:='saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)'::regprocedure;
 original_hash constant text:='5eae2f2d99f4cd869017da98f075aba2';
 broken constant text:=$expr$p_input->'progress'-ARRAY[$expr$;
 corrected constant text:=$expr$(p_input->'progress')-ARRAY[$expr$;
 definition text:=pg_get_functiondef(signature);
 authority jsonb;
BEGIN
 SELECT jsonb_build_object('oid',oid,'acl',proacl::text,'owner',proowner,'config',proconfig,'securityDefiner',prosecdef,'volatility',provolatile,'parallel',proparallel)
 INTO authority FROM pg_proc WHERE oid=signature;
 IF md5(definition)=original_hash AND (length(definition)-length(replace(definition,broken,'')))/length(broken)=1 THEN
  EXECUTE replace(definition,broken,corrected);
 ELSIF (length(definition)-length(replace(definition,corrected,'')))/length(corrected)=1 AND md5(replace(definition,corrected,broken))=original_hash THEN
  NULL; -- Already applied; no data or version changes.
 ELSE RAISE EXCEPTION 'GOOGLE221_COMMAND_DEFINITION_DRIFT';
 END IF;
 definition:=pg_get_functiondef(signature);
 IF position(broken IN definition)>0 OR (length(definition)-length(replace(definition,corrected,'')))/length(corrected)<>1 OR md5(replace(definition,corrected,broken))<>original_hash THEN
  RAISE EXCEPTION 'GOOGLE221_CHECKPOINT_PATCH_INVALID';
 END IF;
 IF authority IS DISTINCT FROM (SELECT jsonb_build_object('oid',oid,'acl',proacl::text,'owner',proowner,'config',proconfig,'securityDefiner',prosecdef,'volatility',provolatile,'parallel',proparallel) FROM pg_proc WHERE oid=signature) THEN
  RAISE EXCEPTION 'GOOGLE221_COMMAND_AUTHORITY_CHANGED';
 END IF;
END $patch$;
COMMIT;
