-- Admit the three supported immutable free-starter snapshots at tenant commit.
-- Every non-plan expression, IS TRUE check and existing consistency trigger is retained.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.tenant_operations IN ACCESS EXCLUSIVE MODE;
DO $patch$
DECLARE before pg_constraint%ROWTYPE;after pg_constraint%ROWTYPE;definition text;needle text;replacement text;protected_constraints jsonb;protected_triggers jsonb;table_authority jsonb;
BEGIN
 SELECT * INTO STRICT before FROM pg_constraint WHERE conrelid='saas.tenant_operations'::regclass AND conname='tenant_operations_result_payload_shape_check';
 IF encode(sha256(convert_to(pg_get_constraintdef(before.oid),'UTF8')),'hex')<>'de5287936475a21b01cc478e52162380d6c4799c0d9ecb0fa3faad2c726740eb'
  OR before.contype<>'c' OR NOT before.convalidated OR before.condeferrable OR before.condeferred OR NOT before.conislocal OR before.coninhcount<>0 OR before.connoinherit
  OR (SELECT relowner FROM pg_class WHERE oid=before.conrelid)<>'celebix_saas_owner'::regrole
 THEN RAISE EXCEPTION 'STARTER255_PREDECESSOR_DRIFT';END IF;
 SELECT to_jsonb(c)-ARRAY['relpages','reltuples','relallvisible','relfrozenxid','relminmxid'] INTO table_authority FROM pg_class c WHERE oid=before.conrelid;
 SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) INTO protected_constraints FROM pg_constraint c WHERE c.conrelid=before.conrelid AND c.oid<>before.oid;
 SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) INTO protected_triggers FROM pg_trigger t WHERE t.tgrelid=before.conrelid;
 definition:=pg_get_constraintdef(before.oid);
 needle:=$old_plan$(((result_payload #>> '{plan,version}'::text[]))::integer = 1) AND ((result_payload #>> '{plan,status}'::text[]) = 'active'::text) AND ((result_payload #> '{plan,features}'::text[]) = '["catalog", "orders", "customers", "content", "media", "analytics", "checkout"]'::jsonb) AND ((result_payload #> '{plan,limits}'::text[]) = '{"staff": 1, "products": 100, "storageBytes": 1000000000, "customDomains": 0, "monthlyOrders": 100}'::jsonb)$old_plan$;
 replacement:=$new_plan$(((result_payload #>> '{plan,planId}')::uuid='00000000-0000-4000-8000-000000000001'::uuid AND (result_payload #> '{plan,version}')='1'::jsonb AND result_payload #> '{plan,features}'='["catalog","orders","customers","content","media","analytics","checkout"]'::jsonb AND result_payload #> '{plan,limits}'='{"products":100,"staff":1,"storageBytes":1000000000,"monthlyOrders":100,"customDomains":0}'::jsonb) OR ((result_payload #>> '{plan,planId}')::uuid='00000000-0000-4000-8000-000000000003'::uuid AND (result_payload #> '{plan,version}')='2'::jsonb AND result_payload #> '{plan,features}'='["catalog","orders","customers","content","media","analytics","checkout","integrations"]'::jsonb AND result_payload #> '{plan,limits}'='{"products":100,"staff":1,"storageBytes":1000000000,"monthlyOrders":50,"customDomains":0}'::jsonb) OR ((result_payload #>> '{plan,planId}')::uuid='00000000-0000-4000-8000-000000000007'::uuid AND (result_payload #> '{plan,version}')='3'::jsonb AND result_payload #> '{plan,features}'='["catalog","orders","customers","content","media","analytics","checkout","integrations"]'::jsonb AND result_payload #> '{plan,limits}'='{"products":25,"staff":1,"storageBytes":1000000000,"monthlyOrders":50,"customDomains":0}'::jsonb)) AND ((result_payload #>> '{plan,status}'::text[]) = 'active'::text)$new_plan$;
 IF length(definition)-length(replace(definition,needle,''))<>length(needle) THEN RAISE EXCEPTION 'STARTER255_PLAN_SOURCE_COUNT';END IF;
 definition:=replace(definition,needle,replacement);
 ALTER TABLE saas.tenant_operations DROP CONSTRAINT tenant_operations_result_payload_shape_check;
 EXECUTE 'ALTER TABLE saas.tenant_operations ADD CONSTRAINT tenant_operations_result_payload_shape_check '||definition;
 SELECT * INTO STRICT after FROM pg_constraint WHERE conrelid=before.conrelid AND conname=before.conname;
 IF (to_jsonb(before)-ARRAY['oid','conbin']) IS DISTINCT FROM (to_jsonb(after)-ARRAY['oid','conbin']) THEN RAISE EXCEPTION 'STARTER255_CONSTRAINT_AUTHORITY_CHANGED';END IF;
 IF encode(sha256(convert_to(pg_get_constraintdef(after.oid),'UTF8')),'hex')<>'b3fc157237969ac0db8bf44adbaf8ca216f71b224c764d8db9bd97dfc7fec775' THEN RAISE EXCEPTION 'STARTER255_POSTCONDITION_DRIFT';END IF;
 IF protected_constraints IS DISTINCT FROM(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_constraint c WHERE c.conrelid=before.conrelid AND c.oid<>after.oid)
  OR protected_triggers IS DISTINCT FROM(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=before.conrelid)
  OR table_authority IS DISTINCT FROM(SELECT to_jsonb(c)-ARRAY['relpages','reltuples','relallvisible','relfrozenxid','relminmxid'] FROM pg_class c WHERE c.oid=before.conrelid)
 THEN RAISE EXCEPTION 'STARTER255_PROTECTED_AUTHORITY_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_xact_user_tables WHERE schemaname='saas' AND(n_tup_ins<>0 OR n_tup_upd<>0 OR n_tup_del<>0)) THEN RAISE EXCEPTION 'STARTER255_DATA_WRITE_DETECTED';END IF;
END $patch$;
COMMIT;
