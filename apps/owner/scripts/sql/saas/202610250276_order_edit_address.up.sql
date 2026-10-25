-- Read saved delivery addresses through the established order-detail projection.
-- Stored order snapshots and strict edit intent validation remain authoritative.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.order-edit-address.release276',0));
DO $preflight$ BEGIN
 IF to_regclass('saas.order_edit_address276_function_backup')IS NOT NULL THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_ALREADY_INSTALLED';END IF;
END $preflight$;
CREATE TABLE saas.order_edit_address276_function_backup(
 signature text PRIMARY KEY,function_oid oid NOT NULL,definition text NOT NULL,
 before_definition_sha text NOT NULL,after_definition_sha text NOT NULL,
 owner_oid oid NOT NULL,acl aclitem[],config text[],security_definer boolean NOT NULL,volatility "char" NOT NULL
);
ALTER TABLE saas.order_edit_address276_function_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_edit_address276_function_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.order_edit_address276_function_backup FROM PUBLIC;
CREATE POLICY order_edit_address276_owner ON saas.order_edit_address276_function_backup TO celebix_saas_owner USING(true)WITH CHECK(true);
DO $privacy$ DECLARE role_name text;BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
  EXECUTE format('REVOKE ALL ON saas.order_edit_address276_function_backup FROM %I',role_name);
 END LOOP;
END $privacy$;
DO $patch$
DECLARE reviewed record;proc record;saved record;definition text;old text:=$old$'shippingAddress',o.shipping_address$old$;
 replacement text:=$new$'shippingAddress',CASE WHEN o.source='in_store' THEN o.shipping_address ELSE saas.orders_detail_projection(p_store_id,p_order_id)->'shippingAddress' END$new$;
BEGIN
 FOR reviewed IN SELECT *FROM(VALUES
  ('saas.orders_edit_workspace(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)','4c455d3dfa206da0b3ddbb6abb799a21436595eeacc797c58fcc7f457d8248dd','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}',true),
  ('saas.orders_detail_projection(uuid,uuid)','d9c3322f5412395ad335d3d36073979e253b12f2a7430588d1538df519f5d6bf','{celebix_saas_owner=X/celebix_saas_owner}',false)
 )evidence(signature,sha256,acl,definer)LOOP
  SELECT p.*,pg_get_functiondef(to_regprocedure(reviewed.signature))definition INTO proc FROM pg_proc p WHERE p.oid=to_regprocedure(reviewed.signature);
  IF proc.definition IS NULL OR encode(sha256(convert_to(proc.definition,'UTF8')),'hex')IS DISTINCT FROM reviewed.sha256
   OR proc.proowner IS DISTINCT FROM 'celebix_saas_owner'::regrole OR proc.proacl::text IS DISTINCT FROM reviewed.acl
   OR proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
   OR proc.prosecdef IS DISTINCT FROM reviewed.definer OR proc.provolatile IS DISTINCT FROM 's'::"char"
  THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_PREDECESSOR_DRIFT:%',reviewed.signature;END IF;
  IF reviewed.definer THEN
   INSERT INTO saas.order_edit_address276_function_backup VALUES(reviewed.signature,proc.oid,proc.definition,reviewed.sha256,'101a8c2436b00783f4b308db6300fd293569c758bc6874164922063092739d6e',proc.proowner,proc.proacl,proc.proconfig,proc.prosecdef,proc.provolatile);
  END IF;
 END LOOP;
 SELECT *INTO STRICT saved FROM saas.order_edit_address276_function_backup;
 definition:=saved.definition;
 IF(length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_PATCH_DRIFT';END IF;
 EXECUTE replace(definition,old,replacement);
 -- A fixed, validated OID keeps function rendering independent of pg_proc scan order.
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid
  AND encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex')=saved.after_definition_sha
   AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl
   AND p.proconfig IS NOT DISTINCT FROM saved.config AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility)
 THEN RAISE EXCEPTION 'ORDER_EDIT_ADDRESS276_INSTALLED_FUNCTION_INVALID';END IF;
END $patch$;
COMMIT;
