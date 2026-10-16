BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
DO $assertions$
DECLARE f record;v jsonb;role_name text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='saas.accounting_release_state'::regclass AND a.attname='collection_discounts_enabled' AND a.atttypid='boolean'::regtype AND a.attnotnull AND NOT a.attisdropped AND pg_get_expr(d.adbin,d.adrelid)='false')
  OR NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='saas.accounting_receivables'::regclass AND a.attname='discount_cents' AND a.atttypid='bigint'::regtype AND a.attnotnull AND NOT a.attisdropped AND pg_get_expr(d.adbin,d.adrelid)='0')
 THEN RAISE EXCEPTION 'ACCOUNTING243_ADDITIVE_COLUMNS_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM saas.accounting_release_state WHERE collection_discounts_enabled)
 THEN RAISE EXCEPTION 'ACCOUNTING243_INITIAL_FLAG_MUST_BE_DISABLED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.accounting_discount_243_backup'::regclass AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'ACCOUNTING243_BACKUP_AUTHORITY_INVALID';END IF;
 FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver','celebix_saas_observability','celebix_saas_migrator'] LOOP
  IF has_table_privilege(role_name,'saas.accounting_discount_243_backup','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  THEN RAISE EXCEPTION 'ACCOUNTING243_BACKUP_EXPOSED: %',role_name;END IF;
 END LOOP;
 IF (SELECT count(*) FROM saas.accounting_discount_243_backup)<>14 THEN RAISE EXCEPTION 'ACCOUNTING243_PREDECESSOR_COUNT_INVALID';END IF;
 FOR f IN SELECT * FROM saas.accounting_discount_243_backup LOOP
  IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>f.original_sha256
   OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.function_oid AND p.oid=to_regprocedure(f.signature) AND p.proowner=f.function_owner AND p.proacl IS NOT DISTINCT FROM f.function_acl
     AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=f.published_sha256 AND p.proconfig=ARRAY['search_path=pg_catalog, saas'])
  THEN RAISE EXCEPTION 'ACCOUNTING243_FUNCTION_SOURCE_OR_AUTHORITY_DRIFT: %',f.signature;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.accounting_receivables'::regclass AND conname='accounting_receivables_discount_cents_check' AND contype='c' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((((discount_cents >= 0) AND (discount_cents <= ''9007199254740991''::bigint)) AND (discount_cents <= (sale_cents - return_cents))))')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.accounting_receivables'::regclass AND conname='accounting_receivables_check1' AND convalidated AND pg_get_constraintdef(oid)='CHECK (((refunded_cents >= 0) AND (refunded_cents <= GREATEST((((collected_cents - sale_cents) + return_cents) + discount_cents), (0)::bigint))))')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.accounting_allocations'::regclass AND conname='accounting_allocations_effect_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((effect = ANY (ARRAY[''collect''::text, ''return''::text, ''refund''::text, ''charge''::text, ''discount''::text])))')
 THEN RAISE EXCEPTION 'ACCOUNTING243_MONEY_CONSTRAINT_DRIFT';END IF;
 v:='{"customerId":"10000000-0000-4000-8000-000000000012","orderId":null,"amountCents":200000,"currency":"TRY","paymentMethod":"cash","accountId":null,"expectedVersion":1,"note":null}';
 IF NOT saas.accounting_intent_valid('collect',v)
  OR NOT saas.accounting_intent_valid('collect',v||'{"discountCents":40000}')
  OR NOT saas.accounting_intent_valid('collect',v||'{"amountCents":0,"discountCents":40000}')
  OR saas.accounting_intent_valid('collect',v||'{"amountCents":0}')
  OR saas.accounting_intent_valid('collect',v||'{"discountCents":-1}')
  OR saas.accounting_intent_valid('collect',v||'{"discountCents":0.5}')
  OR saas.accounting_intent_valid('collect',v||'{"discountCents":null}')
  OR saas.accounting_intent_valid('collect',v||'{"amountCents":9007199254740991,"discountCents":1}')
 THEN RAISE EXCEPTION 'ACCOUNTING243_INPUT_BOUNDARY_INVALID';END IF;
 SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) INTO v FROM saas.accounting_mutate(NULL,NULL,NULL,NULL,NULL,NULL,clock_timestamp(),NULL,NULL,'collect',v);
 IF v IS DISTINCT FROM '{"outcome":"membership_denied","payload":null}'::jsonb
 THEN RAISE EXCEPTION 'ACCOUNTING243_UNAUTHENTICATED_ACCESS';END IF;
END $assertions$;
ROLLBACK;
