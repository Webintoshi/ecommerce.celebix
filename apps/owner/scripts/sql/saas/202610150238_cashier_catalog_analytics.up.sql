-- Extend cashier product/analytics authority and enable collection on existing active sales grants.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE TABLE saas.cashier_238_function_backup(
 signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,
 function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],original_collection_default text NOT NULL
);
CREATE TABLE saas.cashier_238_grant_backup(
 membership_id uuid PRIMARY KEY,original_row jsonb NOT NULL,published_row jsonb
);
ALTER TABLE saas.cashier_238_function_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.cashier_238_function_backup FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.cashier_238_grant_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.cashier_238_grant_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.cashier_238_function_backup,saas.cashier_238_grant_backup FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

INSERT INTO saas.cashier_238_function_backup(signature,definition,original_sha256,function_oid,function_owner,function_acl,original_collection_default)
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.oid,p.proowner,p.proacl,
 (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='saas.in_store_staff_grants'::regclass AND a.attname='can_collect_receivables' AND NOT a.attisdropped)
 FROM pg_proc p WHERE p.oid IN(
  'saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text)'::regprocedure,
  'saas.catalog_authority_error(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz)'::regprocedure
 );

DO $patch$
DECLARE saved record;definition text;old_piece text;new_piece text;
BEGIN
 IF (SELECT count(*) FROM saas.cashier_238_function_backup)<>2 THEN RAISE EXCEPTION 'CASHIER238_BACKUP_INVALID';END IF;
 FOR saved IN SELECT * FROM saas.cashier_238_function_backup ORDER BY signature LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile='s'
   AND (p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[] OR p.proconfig=ARRAY['search_path=pg_catalog,saas']::text[])
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) WHERE grantee=0 AND privilege_type='EXECUTE'))
  THEN RAISE EXCEPTION 'CASHIER238_AUTHORITY_DRIFT: %',saved.signature;END IF;
  definition:=saved.definition;
  IF saved.signature LIKE 'saas.merchant_action_authority_error(%' THEN
   old_piece:=$old$(membership_role='cashier' AND p_required_action IN ('in_store.read','in_store.sell','in_store.discount'))$old$;
   new_piece:=$new$(membership_role='cashier' AND p_required_action IN ('in_store.read','in_store.sell','in_store.discount','analytics.read','catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.delete'))$new$;
  ELSE
   old_piece:=$old$membership.role IN ('store_owner', 'admin', 'editor', 'analyst')$old$;
   new_piece:=$new$membership.role IN ('store_owner', 'admin', 'editor', 'analyst', 'cashier')$new$;
  END IF;
  IF (length(definition)-length(replace(definition,old_piece,'')))/length(old_piece)<>1 THEN RAISE EXCEPTION 'CASHIER238_SOURCE_DRIFT: %',saved.signature;END IF;
  EXECUTE replace(definition,old_piece,new_piece);
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=saved.function_oid AND proowner=saved.function_owner AND proacl IS NOT DISTINCT FROM saved.function_acl)
  THEN RAISE EXCEPTION 'CASHIER238_PUBLISH_AUTHORITY_DRIFT: %',saved.signature;END IF;
  UPDATE saas.cashier_238_function_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex') WHERE signature=saved.signature;
 END LOOP;
END $patch$;

-- Preserve disabled/unassigned access, explicit flags and all historical operations.
-- Only a previously false collection flag on an enabled active cashier grant changes.
LOCK TABLE saas.in_store_staff_grants IN SHARE ROW EXCLUSIVE MODE;
DO $collection$
BEGIN
 PERFORM 1 FROM saas.memberships m JOIN saas.in_store_staff_grants g ON g.store_id=m.store_id AND g.membership_id=m.id
  WHERE m.status='active' AND m.role='cashier' AND g.enabled AND NOT g.can_collect_receivables FOR SHARE OF m;
 IF EXISTS(SELECT 1 FROM saas.in_store_staff_grants g JOIN saas.memberships m ON m.store_id=g.store_id AND m.id=g.membership_id
  WHERE m.status='active' AND m.role='cashier' AND g.enabled AND NOT g.can_collect_receivables AND g.version>=9007199254740991)
 THEN RAISE EXCEPTION 'CASHIER238_GRANT_VERSION_EXHAUSTED';END IF;
 INSERT INTO saas.cashier_238_grant_backup(membership_id,original_row)
  SELECT g.membership_id,to_jsonb(g) FROM saas.in_store_staff_grants g JOIN saas.memberships m ON m.store_id=g.store_id AND m.id=g.membership_id
  WHERE m.status='active' AND m.role='cashier' AND g.enabled AND NOT g.can_collect_receivables;
 UPDATE saas.in_store_staff_grants g SET can_collect_receivables=true,version=g.version+1,updated_at=greatest(g.updated_at,transaction_timestamp())
  FROM saas.cashier_238_grant_backup b WHERE g.membership_id=b.membership_id;
 UPDATE saas.cashier_238_grant_backup b SET published_row=to_jsonb(g) FROM saas.in_store_staff_grants g WHERE g.membership_id=b.membership_id;
END $collection$;
ALTER TABLE saas.in_store_staff_grants ALTER COLUMN can_collect_receivables SET DEFAULT true;
COMMIT;
