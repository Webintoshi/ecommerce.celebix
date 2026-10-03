-- Preserve the first collection timestamp when an already-collected POS sale
-- becomes an order. The accounting sale clock remains the completion clock.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.accounting.release',0));

DO $preflight$
DECLARE signature constant text:='saas.in_store_sales_mutate_v3(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb)';
BEGIN
 IF pg_catalog.to_regclass('saas.in_store_payment_timing_208_backup') IS NOT NULL
  OR pg_catalog.to_regprocedure(signature) IS NULL
  OR NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
   WHERE p.oid=pg_catalog.to_regprocedure(signature)
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid),'UTF8')),'hex')='b359a12e8b2443a89818304e04dd18ae8e6da7c15be157fcfee7f25285f9ed48'
    AND p.proowner='celebix_saas_owner'::regrole
    AND p.proacl::text='{celebix_saas_owner=X/celebix_saas_owner}'
    AND p.prosecdef AND p.provolatile='v' AND p.prokind='f'
    AND NOT p.proleakproof AND NOT p.proisstrict AND p.proparallel='u'
    AND l.lanname='plpgsql' AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
  )
 THEN RAISE EXCEPTION 'IN_STORE_PAYMENT_TIMING_PREDECESSOR_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c WHERE c.conrelid='saas.orders'::regclass
   AND c.conname='orders_commerce_payment_timestamps_check' AND c.contype='c' AND c.convalidated
   AND pg_catalog.pg_get_constraintdef(c.oid)='CHECK ((((paid_at IS NULL) OR (paid_at >= created_at)) AND ((refunded_at IS NULL) OR ((paid_at IS NOT NULL) AND (refunded_at >= paid_at)))))')
 THEN RAISE EXCEPTION 'IN_STORE_PAYMENT_TIMING_ORDER_CONSTRAINT_INVALID';END IF;
END $preflight$;

CREATE TABLE saas.in_store_payment_timing_208_backup(
 singleton boolean PRIMARY KEY CHECK(singleton),function_oid oid NOT NULL,
 definition text NOT NULL,before_hash text NOT NULL,after_hash text NOT NULL,
 owner_oid oid NOT NULL,acl aclitem[] NOT NULL
);
ALTER TABLE saas.in_store_payment_timing_208_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.in_store_payment_timing_208_backup FORCE ROW LEVEL SECURITY;
CREATE POLICY in_store_payment_timing_208_owner ON saas.in_store_payment_timing_208_backup
 TO celebix_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON saas.in_store_payment_timing_208_backup FROM PUBLIC,celebix_saas_app,celebix_saas_identity,
 celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

DO $patch$
DECLARE signature constant text:='saas.in_store_sales_mutate_v3(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb)';
 anchor constant text:='selected.total_cents,''delivered'',CASE WHEN selected.initial_collection_cents=selected.total_cents THEN ''completed'' ELSE ''pending'' END,NULL,p_now,p_now,CASE';
 replacement constant text:='selected.total_cents,''delivered'',CASE WHEN selected.initial_collection_cents=selected.total_cents THEN ''completed'' ELSE ''pending'' END,NULL,coalesce(selected.payment_received_at,p_now),p_now,CASE';
 source text;patched text;before_oid oid;before_owner oid;before_acl aclitem[];
BEGIN
 SELECT p.oid,p.proowner,p.proacl,pg_catalog.pg_get_functiondef(p.oid)
 INTO before_oid,before_owner,before_acl,source FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure(signature);
 IF (pg_catalog.length(source)-pg_catalog.length(pg_catalog.replace(source,anchor,'')))/pg_catalog.length(anchor)<>1
 THEN RAISE EXCEPTION 'IN_STORE_PAYMENT_TIMING_PATCH_ANCHOR_INVALID';END IF;
 patched:=pg_catalog.replace(source,anchor,replacement);
 INSERT INTO saas.in_store_payment_timing_208_backup VALUES(true,before_oid,source,
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(source,'UTF8')),'hex'),
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(patched,'UTF8')),'hex'),before_owner,before_acl);
 EXECUTE patched;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=before_oid AND p.oid=pg_catalog.to_regprocedure(signature)
  AND p.proowner=before_owner AND p.proacl=before_acl AND pg_catalog.pg_get_functiondef(p.oid)=patched)
 THEN RAISE EXCEPTION 'IN_STORE_PAYMENT_TIMING_PATCH_PRESERVATION_FAILED';END IF;
END $patch$;
COMMIT;
