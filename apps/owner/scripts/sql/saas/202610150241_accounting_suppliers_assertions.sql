BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
DO $assertions$
DECLARE t text;role_name text;f record;v jsonb;
BEGIN
 WITH schema_definition AS(
SELECT jsonb_object_agg(c.relname,jsonb_build_object(
 'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated)ORDER BY k.conname),'[]')FROM pg_constraint k WHERE k.conrelid=c.oid),
 'indexes',(SELECT coalesce(jsonb_agg(pg_get_indexdef(i.indexrelid)ORDER BY ic.relname),'[]')FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'type',t.tgtype,'enabled',t.tgenabled)ORDER BY t.tgname),'[]')FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal))) AS schema
 FROM pg_class c WHERE c.relnamespace='saas'::regnamespace AND c.relkind='r'AND c.relname IN('accounting_supplier_debts','accounting_supplier_payments','accounting_supplier_cancellations','accounting_supplier_operations')
) SELECT schema INTO v FROM schema_definition;
 IF encode(sha256(convert_to(v::text,'UTF8')),'hex') IS DISTINCT FROM 'be3692a203159c2405b07a37fd02883acff7ee537f0a3cd1d3b392edd957bf05'
 THEN RAISE EXCEPTION 'SUPPLIERS241_SCHEMA_DEFINITION_DRIFT';END IF;
 WITH expected(signature,source_sha256) AS(VALUES
 ('saas.accounting_suppliers_debt_projection(uuid,uuid)','078378fb03ae2c8caae2d42bd0f4cbbe4a32be1fdcadffce6aa3e37ea57d21a6'),
 ('saas.accounting_suppliers_filters_valid(jsonb)','e599c84e08117f959bddde9ea79e3c114435154eadbda27751b698e0e5ecbd41'),
 ('saas.accounting_suppliers_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)','3d554ffd4fd72ee3ddb7c9322b27131982cb86c52236288f0c010fa0da83cd3a'),
 ('saas.accounting_suppliers_intent_valid(text,jsonb)','c3ec74b2f9991effddd1d9f625fe7da34f02d7f9acb56e3c67a7de9e17becaa8'),
 ('saas.accounting_suppliers_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)','0b145812d85bd744a2a513411e84bee7a00034c87cbd732148bd0e831495c7c2'),
 ('saas.accounting_suppliers_payment_projection(uuid,uuid)','568cbce0b0e47759045fe66c615fb6a543133108ad741a41eac8c3e467dee46e'),
 ('saas.accounting_suppliers_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb,uuid)','d2fa883445a9f9c149f0acf6908a0e421956e68488fd2f13478d6d5d9d377b24')
) SELECT jsonb_build_object('valid',count(*)=7 AND bool_and(coalesce(encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=e.source_sha256,false))) INTO v
 FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature);
 IF v->>'valid' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'SUPPLIERS241_FUNCTION_DEFINITION_DRIFT';END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_suppliers_%')<>7
 THEN RAISE EXCEPTION 'SUPPLIERS241_FUNCTION_COUNT_INVALID';END IF;
 FOREACH t IN ARRAY ARRAY['accounting_supplier_debts','accounting_supplier_payments','accounting_supplier_cancellations','accounting_supplier_operations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'SUPPLIERS241_TABLE_AUTHORITY_INVALID: %',t;END IF;
  FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver','celebix_saas_observability','celebix_saas_migrator'] LOOP
   IF has_table_privilege(role_name,'saas.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   THEN RAISE EXCEPTION 'SUPPLIERS241_TABLE_EXPOSED: %:%',t,role_name;END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='accounting_immutable'
    AND tgfoid='saas.accounting_immutable()'::regprocedure AND tgtype=27 AND tgenabled='O' AND NOT tgisinternal)
   OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='platform_support_journal_write'
    AND tgfoid='saas.platform_support_journal_write()'::regprocedure AND tgtype=29 AND tgenabled='O' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'SUPPLIERS241_IMMUTABLE_AUDIT_MISSING: %',t;END IF;
 END LOOP;
 FOR f IN SELECT * FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'accounting_suppliers_%' LOOP
  IF f.proowner<>'celebix_saas_owner'::regrole OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
   OR f.prosecdef IS DISTINCT FROM(f.proname NOT IN('accounting_suppliers_intent_valid','accounting_suppliers_filters_valid'))
   OR f.provolatile::text<>(CASE WHEN f.proname IN('accounting_suppliers_intent_valid','accounting_suppliers_filters_valid') THEN 'i'
    WHEN f.proname='accounting_suppliers_mutate' THEN 'v' ELSE 's' END)
  THEN RAISE EXCEPTION 'SUPPLIERS241_FUNCTION_AUTHORITY_INVALID: %',f.proname;END IF;
  IF has_function_privilege('celebix_saas_app',f.oid,'EXECUTE') IS DISTINCT FROM
    (f.proname IN('accounting_suppliers_read','accounting_suppliers_mutate','accounting_suppliers_get_operation'))
  THEN RAISE EXCEPTION 'SUPPLIERS241_RPC_SCOPE_INVALID: %',f.proname;END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
   WHERE a.grantor<>'celebix_saas_owner'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable
    OR a.grantee NOT IN('celebix_saas_owner'::regrole,'celebix_saas_app'::regrole))
  THEN RAISE EXCEPTION 'SUPPLIERS241_UNEXPECTED_FUNCTION_GRANT: %',f.proname;END IF;
  FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_identity','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver','celebix_saas_observability','celebix_saas_migrator'] LOOP
   IF has_function_privilege(role_name,f.oid,'EXECUTE') THEN RAISE EXCEPTION 'SUPPLIERS241_FUNCTION_EXPOSED: %:%',f.proname,role_name;END IF;
  END LOOP;
 END LOOP;
 v:='{"supplierName":"Örnek tedarikçi","amountCents":1000,"currency":"TRY","occurredOn":"2026-10-15","dueOn":null,"documentNumber":null,"note":"Borç kaydı"}';
 IF NOT saas.accounting_suppliers_intent_valid('createDebt',v)
  OR saas.accounting_suppliers_intent_valid('createDebt',v-'dueOn')
  OR saas.accounting_suppliers_intent_valid('createDebt',v||'{"extra":true}')
  OR saas.accounting_suppliers_intent_valid('createDebt',v||'{"amountCents":0}')
  OR saas.accounting_suppliers_intent_valid('createDebt',v||'{"amountCents":9007199254740992}')
  OR saas.accounting_suppliers_intent_valid('createDebt',v||'{"amountCents":1.5}')
  OR saas.accounting_suppliers_intent_valid('createDebt',v||'{"amountCents":"1"}')
  OR saas.accounting_suppliers_intent_valid('createDebt',v||'{"occurredOn":"2026-02-30"}')
  OR saas.accounting_suppliers_intent_valid('createDebt',v||'{"occurredOn":"0000-01-01"}')
  OR saas.accounting_suppliers_intent_valid('createDebt',v||'{"dueOn":"2026-10-01"}')
  OR saas.accounting_suppliers_intent_valid('createDebt',v||'{"currency":"try"}')
  OR saas.accounting_suppliers_intent_valid('createDebt',v||'{"note":" "}')
  OR saas.accounting_suppliers_intent_valid('createDebt','[]') OR saas.accounting_suppliers_intent_valid('createDebt','1')
  OR saas.accounting_suppliers_intent_valid('other',v)
 THEN RAISE EXCEPTION 'SUPPLIERS241_STRICT_DEBT_INPUT_INVALID';END IF;
 v:='{"debtId":"11111111-1111-4111-8111-111111111111","accountId":"22222222-2222-4222-8222-222222222222","amountCents":100,"currency":"TRY","occurredOn":"2026-10-15","note":"Ödeme","expectedVersion":1,"expectedAccountVersion":1}';
 IF NOT saas.accounting_suppliers_intent_valid('pay',v)
  OR saas.accounting_suppliers_intent_valid('pay',v-'expectedAccountVersion')
  OR saas.accounting_suppliers_intent_valid('pay',v||'{"expectedVersion":0}')
  OR saas.accounting_suppliers_intent_valid('pay',v||'{"actorMembershipId":"11111111-1111-4111-8111-111111111111"}')
  OR NOT saas.accounting_suppliers_intent_valid('reversePayment','{"debtId":"11111111-1111-4111-8111-111111111111","paymentId":"22222222-2222-4222-8222-222222222222","reason":"Hatalı kayıt","expectedVersion":2,"expectedAccountVersion":2}')
  OR NOT saas.accounting_suppliers_intent_valid('cancelDebt','{"debtId":"11111111-1111-4111-8111-111111111111","reason":"Mükerrer borç","expectedVersion":1}')
 THEN RAISE EXCEPTION 'SUPPLIERS241_STRICT_PAYMENT_INPUT_INVALID';END IF;
 IF NOT saas.accounting_suppliers_filters_valid('{"query":"Örnek","status":"open","due":"overdue","currency":"TRY"}')
  OR saas.accounting_suppliers_filters_valid('{"status":"partial"}') OR saas.accounting_suppliers_filters_valid('{"due":"yesterday"}')
  OR saas.accounting_suppliers_filters_valid('{"query":" bad "}') OR saas.accounting_suppliers_filters_valid('{"storeId":"bad"}')
  OR saas.accounting_suppliers_filters_valid('[]') OR saas.accounting_suppliers_filters_valid('1')
 THEN RAISE EXCEPTION 'SUPPLIERS241_STRICT_FILTER_INPUT_INVALID';END IF;
END $assertions$;
ROLLBACK;
