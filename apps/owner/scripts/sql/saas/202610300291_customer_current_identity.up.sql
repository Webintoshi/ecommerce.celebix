-- Project current same-store customer identity without rewriting saved transaction evidence.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.customer-current-identity.release291',0));
DO $preflight$ BEGIN
 IF to_regclass('saas.customer_current_identity291_function_backup') IS NOT NULL THEN RAISE EXCEPTION 'CUSTOMER_CURRENT_IDENTITY291_ALREADY_INSTALLED';END IF;
END $preflight$;
CREATE TABLE saas.customer_current_identity291_function_backup(
 signature text PRIMARY KEY,function_oid oid NOT NULL,definition text NOT NULL,
 before_definition_sha text NOT NULL,after_definition_sha text NOT NULL,
 owner_oid oid NOT NULL,acl aclitem[],config text[],security_definer boolean NOT NULL,
 volatility "char" NOT NULL,is_strict boolean NOT NULL,parallel "char" NOT NULL
);
ALTER TABLE saas.customer_current_identity291_function_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.customer_current_identity291_function_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.customer_current_identity291_function_backup FROM PUBLIC;
CREATE POLICY customer_current_identity291_owner ON saas.customer_current_identity291_function_backup TO celebix_saas_owner USING(true) WITH CHECK(true);
DO $privacy$ DECLARE role_name text;BEGIN
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP
  EXECUTE format('REVOKE ALL ON saas.customer_current_identity291_function_backup FROM %I',role_name);
 END LOOP;
END $privacy$;
DO $patch$
DECLARE reviewed record;proc record;saved record;definition text;replacement jsonb;old text;
BEGIN
 FOR reviewed IN SELECT * FROM(VALUES
  ('saas.abandoned_carts_list_without_durable_reconciliation_v101(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)','e2f971e4ec017297c3cbb74af097b7147d0505664a0602f38034b362f0e2b646','332ef3ddc982547facc9e5d14c2cdaac2d9863e57faaa7607fd7b0fe52224eb5',true,'[["OR COALESCE(cart.customer_phone,'''') ILIKE ''%''||p_search||''%''", "OR COALESCE(cart.customer_phone,'''') ILIKE ''%''||p_search||''%''\n        OR EXISTS(\n          SELECT 1 FROM saas.customers customer\n          WHERE customer.store_id=cart.store_id AND customer.id=cart.customer_id\n            AND (customer.first_name||'' ''||customer.last_name ILIKE ''%''||p_search||''%''\n              OR customer.email ILIKE ''%''||p_search||''%''\n              OR customer.phone ILIKE ''%''||p_search||''%'')\n        )"]]'::jsonb),
  ('saas.abandoned_carts_projection(uuid,uuid)','e96f824519fe4fe2794c607385edbb5c29d391e7529a17620454af8a882020e9','1133116b8a51efa8719e0d246cb214bf1514ca0d0af152e587f49c43c604d1c2',false,'[["''customerName'',cart.customer_name", "''customerName'',CASE WHEN customer.id IS NOT NULL THEN customer.first_name||'' ''||customer.last_name ELSE cart.customer_name END"], ["''customerEmail'',cart.customer_email", "''customerEmail'',CASE WHEN customer.id IS NOT NULL THEN customer.email ELSE cart.customer_email END"], ["''customerPhone'',cart.customer_phone", "''customerPhone'',CASE WHEN customer.id IS NOT NULL THEN customer.phone ELSE cart.customer_phone END"], ["FROM saas.abandoned_carts cart\n", "FROM saas.abandoned_carts cart\n  LEFT JOIN saas.customers customer ON customer.store_id=cart.store_id AND customer.id=cart.customer_id\n"]]'::jsonb),
  ('saas.accounting_receivable_projection(uuid,uuid)','1b9f355323a8d4727cc03da9d4d49f389ad7c691e6da0bb7ba473ba2b21ea418','5dd750d3133aa97311e24a4739f32395cd5f8012f7bebcf495e0371e736b117f',true,'[["''customerName'',coalesce(nullif(r.customer_snapshot->>''name'',''''),nullif(concat_ws('' '',c.first_name,c.last_name),''''),''Mağaza müşterisi'')", "''customerName'',CASE WHEN c.id IS NOT NULL THEN c.first_name||'' ''||c.last_name ELSE coalesce(nullif(r.customer_snapshot->>''name'',''''),nullif(concat_ws('' '',c.first_name,c.last_name),''''),''Mağaza müşterisi'') END"], ["''customerPhone'',CASE WHEN r.customer_snapshot?''phone'' THEN r.customer_snapshot->>''phone'' ELSE c.phone END", "''customerPhone'',CASE WHEN c.id IS NOT NULL THEN c.phone WHEN r.customer_snapshot?''phone'' THEN r.customer_snapshot->>''phone'' ELSE c.phone END"]]'::jsonb),
  ('saas.in_store_sales_projection_v3(uuid,uuid)','29f84ec8829fa86b393835e78553ad9e8b2e8d75c0564cf5b0799d2b7872209d','a20bae5c73624f766e492ce51af1298075e7cd9b42062c3b4790a077ff6bc8b3',true,'[["''customerName'',coalesce(s.customer_snapshot->>''name'',s.intent->>''customerName'')", "''customerName'',CASE WHEN customer.id IS NOT NULL THEN customer.first_name||'' ''||customer.last_name ELSE coalesce(s.customer_snapshot->>''name'',s.intent->>''customerName'') END"], ["FROM saas.in_store_sales s WHERE s.store_id=p_store AND s.id=p_sale", "FROM saas.in_store_sales s LEFT JOIN saas.customers customer ON customer.store_id=s.store_id AND customer.id=s.customer_id AND s.status=''completed'' WHERE s.store_id=p_store AND s.id=p_sale"]]'::jsonb)
 )evidence(signature,before_sha,after_sha,definer,replacements) LOOP
  SELECT p.*,pg_get_functiondef(p.oid) definition INTO proc FROM pg_proc p WHERE p.oid=to_regprocedure(reviewed.signature);
  IF proc.definition IS NULL OR encode(sha256(convert_to(proc.definition,'UTF8')),'hex') IS DISTINCT FROM reviewed.before_sha
   OR proc.proowner IS DISTINCT FROM 'celebix_saas_owner'::regrole
   OR proc.proacl::text IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'
   OR proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
   OR proc.prosecdef IS DISTINCT FROM reviewed.definer OR proc.provolatile IS DISTINCT FROM 's'::"char"
   OR proc.proisstrict IS DISTINCT FROM false OR proc.proparallel IS DISTINCT FROM 'u'::"char"
  THEN RAISE EXCEPTION 'CUSTOMER_CURRENT_IDENTITY291_PREDECESSOR_DRIFT:%',reviewed.signature;END IF;
  INSERT INTO saas.customer_current_identity291_function_backup VALUES(reviewed.signature,proc.oid,proc.definition,reviewed.before_sha,reviewed.after_sha,proc.proowner,proc.proacl,proc.proconfig,proc.prosecdef,proc.provolatile,proc.proisstrict,proc.proparallel);
  definition:=proc.definition;
  FOR replacement IN SELECT value FROM jsonb_array_elements(reviewed.replacements) LOOP
   old:=replacement->>0;
   IF (length(definition)-length(replace(definition,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'CUSTOMER_CURRENT_IDENTITY291_PATCH_DRIFT:%',reviewed.signature;END IF;
   definition:=replace(definition,old,replacement->>1);
  END LOOP;
  IF encode(sha256(convert_to(definition,'UTF8')),'hex') IS DISTINCT FROM reviewed.after_sha THEN RAISE EXCEPTION 'CUSTOMER_CURRENT_IDENTITY291_PATCH_HASH:%',reviewed.signature;END IF;
  EXECUTE definition;
  SELECT * INTO STRICT saved FROM saas.customer_current_identity291_function_backup WHERE signature=reviewed.signature;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.oid=to_regprocedure(saved.signature)
   AND encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex')=saved.after_definition_sha
   AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl AND p.proconfig IS NOT DISTINCT FROM saved.config
   AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility AND p.proisstrict=saved.is_strict AND p.proparallel=saved.parallel)
  THEN RAISE EXCEPTION 'CUSTOMER_CURRENT_IDENTITY291_INSTALLED_FUNCTION_INVALID:%',saved.signature;END IF;
 END LOOP;
END $patch$;
COMMIT;
