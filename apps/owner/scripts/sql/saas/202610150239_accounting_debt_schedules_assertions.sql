BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE saved record;f record;t text;role_name text;value jsonb;
BEGIN
 IF (SELECT count(*) FROM saas.accounting_schedule_239_backup)<>2 THEN RAISE EXCEPTION 'ACCOUNTING239_BACKUP_INVALID';END IF;
 FOR saved IN SELECT * FROM saas.accounting_schedule_239_backup LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.oid=to_regprocedure(saved.signature)
   AND p.proowner=saved.function_owner AND p.proacl IS NOT DISTINCT FROM saved.function_acl
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=saved.published_sha256)
   OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex') IS DISTINCT FROM saved.original_sha256
  THEN RAISE EXCEPTION 'ACCOUNTING239_PREDECESSOR_AUTHORITY_INVALID: %',saved.signature;END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['accounting_schedule_239_backup','accounting_schedule_plans','accounting_schedule_operations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'ACCOUNTING239_TABLE_AUTHORITY_INVALID: %',t;END IF;
  FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver','celebix_saas_observability','celebix_saas_migrator'] LOOP
   IF has_table_privilege(role_name,'saas.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   THEN RAISE EXCEPTION 'ACCOUNTING239_TABLE_EXPOSED: %:%',t,role_name;END IF;
  END LOOP;
 END LOOP;
 FOR f IN SELECT p.* FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname LIKE 'accounting_schedule_%' LOOP
  IF f.proowner<>'celebix_saas_owner'::regrole OR NOT(f.proconfig @> ARRAY['search_path=pg_catalog, saas'])
  THEN RAISE EXCEPTION 'ACCOUNTING239_FUNCTION_AUTHORITY_INVALID: %',f.proname;END IF;
  IF has_function_privilege('celebix_saas_app',f.oid,'EXECUTE') IS DISTINCT FROM
    (f.proname IN('accounting_schedule_list','accounting_schedule_read','accounting_schedule_mutate','accounting_schedule_get_operation'))
  THEN RAISE EXCEPTION 'ACCOUNTING239_APP_RPC_SCOPE_INVALID: %',f.proname;END IF;
  FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_identity','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver','celebix_saas_observability','celebix_saas_migrator'] LOOP
   IF has_function_privilege(role_name,f.oid,'EXECUTE') THEN RAISE EXCEPTION 'ACCOUNTING239_FUNCTION_EXPOSED: %:%',f.proname,role_name;END IF;
  END LOOP;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['accounting_schedule_plans','accounting_schedule_operations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='accounting_immutable' AND NOT tgisinternal)
   OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=('saas.'||t)::regclass AND tgname='platform_support_journal_write' AND NOT tgisinternal)
  THEN RAISE EXCEPTION 'ACCOUNTING239_APPEND_ONLY_AUDIT_MISSING: %',t;END IF;
 END LOOP;
 IF NOT saas.accounting_schedule_installments_valid('[{"dueDate":"2026-10-01","amountCents":300},{"dueDate":"2026-11-01","amountCents":700}]',1000)
  OR saas.accounting_schedule_installments_valid('[{"dueDate":"2026-02-30","amountCents":1}]',1)
  OR saas.accounting_schedule_installments_valid('[{"dueDate":"2026-10-01","amountCents":1},{"dueDate":"2026-10-01","amountCents":1}]',2)
  OR saas.accounting_schedule_installments_valid('[{"dueDate":"2026-10-01","amountCents":9007199254740992}]',NULL)
  OR saas.accounting_schedule_installments_valid('[{"dueDate":"2026-10-01","amountCents":1,"extra":true}]',1)
  OR saas.accounting_schedule_installments_valid('[]',0)
  OR saas.accounting_schedule_installments_valid('1',NULL) OR saas.accounting_schedule_installments_valid('{}',NULL)
  OR saas.accounting_schedule_installments_valid('[1]',NULL)
  OR saas.accounting_schedule_installments_valid('[{"dueDate":"0000-01-01","amountCents":1}]',1)
  OR saas.accounting_schedule_installments_valid('[{"dueDate":"2026-10-01","amountCents":1}]',2)
 THEN RAISE EXCEPTION 'ACCOUNTING239_INSTALLMENT_VALIDATION_INVALID';END IF;
 SELECT jsonb_agg(jsonb_build_array(amount_cents,covered_cents,due_cents) ORDER BY installment_position) INTO value
 FROM saas.accounting_schedule_parts('[{"dueDate":"2026-10-01","amountCents":300},{"dueDate":"2026-11-01","amountCents":700}]',600);
 IF value<>'[[300,300,0],[700,100,600]]'::jsonb THEN RAISE EXCEPTION 'ACCOUNTING239_OLDEST_FIRST_COVERAGE_INVALID';END IF;
 SELECT jsonb_agg(jsonb_build_array(covered_cents,due_cents) ORDER BY installment_position) INTO value
 FROM saas.accounting_schedule_parts('[{"dueDate":"2026-10-01","amountCents":300},{"dueDate":"2026-11-01","amountCents":700}]',1200);
 IF value<>'[[0,300],[0,700]]'::jsonb THEN RAISE EXCEPTION 'ACCOUNTING239_REOPENED_SCHEDULE_INVENTED_COVERAGE';END IF;
 SELECT jsonb_agg(jsonb_build_array(covered_cents,due_cents) ORDER BY installment_position) INTO value
 FROM saas.accounting_schedule_parts('[{"dueDate":"2026-10-01","amountCents":300},{"dueDate":"2026-11-01","amountCents":700}]',0);
 IF value<>'[[300,0],[700,0]]'::jsonb THEN RAISE EXCEPTION 'ACCOUNTING239_ZERO_DEBT_COVERAGE_INVALID';END IF;
 IF NOT saas.accounting_schedule_filters_valid('{"dueStatus":"today","channel":"POS","salesChannel":"social","dateFrom":"2026-10-01"}')
  OR saas.accounting_schedule_filters_valid('{"dueStatus":"paid"}') OR saas.accounting_schedule_filters_valid('{"amountCents":1}')
  OR saas.accounting_schedule_filters_valid('1') OR saas.accounting_schedule_filters_valid('[]')
 THEN RAISE EXCEPTION 'ACCOUNTING239_FILTER_VALIDATION_INVALID';END IF;
END $assertions$;
ROLLBACK;
