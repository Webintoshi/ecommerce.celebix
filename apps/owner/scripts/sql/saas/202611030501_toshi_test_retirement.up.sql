-- Retire new one-lira purchases; historical settlement and wallet entries remain valid.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.toshi-test-retirement.release501',0));
DO $retire501$
DECLARE r record;p pg_proc%ROWTYPE;definition text;needle text;replacement text;current_hash text;
BEGIN
 FOR r IN SELECT *FROM(VALUES
 ('saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)','9a66db7c528966865d5be36f31c7c4b257e86088ce71f879c904260a8862cfcb','b61e52784ddc7a399d13c81cb7bcc65eda15e1c125769b535889cb13e045d08e','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'),
 ('saas.platform_checkout_machine(text,jsonb)','a61d3f87e6e848aa6eaa06384810e8df6b9f9e25f226db47f2103b2810805852','832c3187132a72c20bf3559ad78f6a8dfcaef37df87aeb321f5dd0729dc1695b','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_platform_operator=X/celebix_saas_owner}'),
 ('saas.platform_checkout_public_test_create(timestamp with time zone,uuid,text,text,text)','f4273c228083bd70d2ef911bd6d7d46abb77c0ff7653282d6444a135bee11c64','e15e43c94597ea0f34318c44bb41905d5aea83824976aac67302f0409481bf51','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_platform_operator=X/celebix_saas_owner}')
 )expected(identity,old_hash,new_hash,acl)LOOP
  SELECT *INTO p FROM pg_proc WHERE oid=to_regprocedure(r.identity);
  IF NOT FOUND OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl::text IS DISTINCT FROM r.acl THEN RAISE EXCEPTION 'TOSHI_RETIRE501_IDENTITY_DRIFT';END IF;
  definition:=pg_get_functiondef(p.oid);current_hash:=encode(sha256(convert_to(definition,'UTF8')),'hex');
  IF current_hash=r.new_hash THEN CONTINUE;END IF;
  IF current_hash<>r.old_hash THEN RAISE EXCEPTION 'TOSHI_RETIRE501_PREDECESSOR_DRIFT';END IF;
  IF p.proname='platform_checkout_create'THEN
   needle:=$needle$,('toshi-test-1',1,83)$needle$;replacement:='';
  ELSIF p.proname='platform_checkout_public_test_create'THEN
   needle:=p.prosrc;replacement:=$body$
BEGIN
 RETURN QUERY SELECT 'store_unavailable'::text,NULL::jsonb;
END
$body$;
  ELSE
   needle:=$needle$  INSERT INTO saas.platform_checkout_attempts(id,order_id,request_digest,status,sealed_buyer,created_at,updated_at)$needle$;
   replacement:=$guard$  IF o.kind='toshi_credit'AND o.offer_id='toshi-test-1'THEN RETURN QUERY SELECT 'checkout_expired',NULL::jsonb;RETURN;END IF;
$guard$||needle;
  END IF;
  IF needle=''OR length(definition)-length(replace(definition,needle,''))<>length(needle)THEN RAISE EXCEPTION 'TOSHI_RETIRE501_PATCH_DRIFT';END IF;
  definition:=replace(definition,needle,replacement);
  IF encode(sha256(convert_to(definition,'UTF8')),'hex')<>r.new_hash THEN RAISE EXCEPTION 'TOSHI_RETIRE501_REPLACEMENT_DRIFT';END IF;
  EXECUTE definition;
  IF encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>r.new_hash THEN RAISE EXCEPTION 'TOSHI_RETIRE501_POSTCONDITION_FAILED';END IF;
 END LOOP;
END $retire501$;
COMMIT;
