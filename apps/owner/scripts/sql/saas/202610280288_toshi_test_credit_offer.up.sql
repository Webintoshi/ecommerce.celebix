-- Additive one-credit test product. Existing quotes, verified payment checks,
-- wallet locks and once-per-order ledger fulfillment remain byte-identical.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.toshi-test-credit.release288',0));
DO $offer288$
DECLARE r record;p pg_proc%ROWTYPE;definition text;constraint_definition text;constraint_validated boolean;
 needle text:=$needle$('toshi-50000',50000,1249900)$needle$;
 replacement text:=$replacement$('toshi-50000',50000,1249900),('toshi-test-1',1,83)$replacement$;
BEGIN
 FOR r IN SELECT * FROM(VALUES
 ('saas.platform_checkout_fulfill281(uuid,uuid,timestamp with time zone)','7ecfb276d124c51e7060eb34fbd3996d3a840721ceb065b879aba1bf963d6011','6fc11ee0ce00e9cab8ab2d01c9eafad4bab7b7373928c45f96611af09dc4da17','{celebix_saas_owner=X/celebix_saas_owner}'),
 ('saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)','5edd8a6a6171a1f27d1b9e1cc98be54ceef43d78b89df10aac563770ffe06679','f5aba85e14927d5f96eb8aafa20dee7c9683e7004f8fd9cfee55171f7eafe82d','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}')
 )expected(identity,old_hash,new_hash,acl)LOOP
  SELECT *INTO p FROM pg_proc WHERE oid=to_regprocedure(r.identity);
  IF NOT FOUND OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl::text IS DISTINCT FROM r.acl THEN RAISE EXCEPTION 'TOSHI_TEST_CREDIT288_ROUTINE_IDENTITY_INVALID';END IF;
  definition:=pg_get_functiondef(p.oid);
  IF encode(sha256(convert_to(definition,'UTF8')),'hex')NOT IN(r.old_hash,r.new_hash)THEN RAISE EXCEPTION 'TOSHI_TEST_CREDIT288_PREDECESSOR_INVALID';END IF;
  IF encode(sha256(convert_to(definition,'UTF8')),'hex')=r.old_hash THEN
   IF length(definition)-length(replace(definition,needle,''))<>length(needle)THEN RAISE EXCEPTION 'TOSHI_TEST_CREDIT288_PATCH_DRIFT';END IF;
   -- CREATE OR REPLACE retains the existing OID, owner and strict original ACL.
   EXECUTE replace(definition,needle,replacement);
  END IF;
 END LOOP;
 SELECT pg_get_constraintdef(oid),convalidated INTO constraint_definition,constraint_validated FROM pg_constraint
 WHERE conrelid='saas.platform_checkout_orders'::regclass AND conname='platform_checkout_shape283'AND contype='c';
 IF NOT FOUND OR NOT constraint_validated OR encode(sha256(convert_to(constraint_definition,'UTF8')),'hex')NOT IN('001cd618142132f64f651e4fd4ffd1a67853b202f7aad559fb8ba9ecaeb5d04c','a99907470fc8346c25131250ee947c38fb23ac5d2f848d0d159302b4f67dbd30')THEN RAISE EXCEPTION 'TOSHI_TEST_CREDIT288_ORDER_CONSTRAINT_INVALID';END IF;
 IF encode(sha256(convert_to(constraint_definition,'UTF8')),'hex')='001cd618142132f64f651e4fd4ffd1a67853b202f7aad559fb8ba9ecaeb5d04c'THEN
  ALTER TABLE saas.platform_checkout_orders DROP CONSTRAINT platform_checkout_shape283;
  ALTER TABLE saas.platform_checkout_orders ADD CONSTRAINT platform_checkout_shape283 CHECK ((((kind = 'package'::text) AND (term = ANY (ARRAY['monthly'::text, 'annual'::text])) AND (plan_id IS NOT NULL) AND (tool_purchase_id IS NULL) AND (cardinality(tool_keys) = 0)) OR ((kind = 'tool'::text) AND (term = 'once'::text) AND (plan_id IS NULL) AND (tool_purchase_id IS NOT NULL) AND ((cardinality(tool_keys) >= 1) AND (cardinality(tool_keys) <= 5))) OR ((kind = 'toshi_credit'::text) AND (term = 'once'::text) AND (plan_id IS NULL) AND (tool_purchase_id IS NULL) AND (cardinality(tool_keys) = 0) AND (offer_id = ANY (ARRAY['toshi-500'::text, 'toshi-2500'::text, 'toshi-10000'::text, 'toshi-50000'::text, 'toshi-test-1'::text])))));
 END IF;
 SELECT pg_get_constraintdef(oid),convalidated INTO constraint_definition,constraint_validated FROM pg_constraint
 WHERE conrelid='saas.toshi_credit_ledger'::regclass AND conname='toshi_credit_ledger_check'AND contype='c';
 IF NOT FOUND OR NOT constraint_validated OR encode(sha256(convert_to(constraint_definition,'UTF8')),'hex')NOT IN('dba148a49a05cb545db21870ab2c52979d801674030f235bda97348969e95c5c','441c5722d6536aa2dd0175e916eb06fa0530c733bacdd09fe68a2a74f29d7f07')THEN RAISE EXCEPTION 'TOSHI_TEST_CREDIT288_LEDGER_CONSTRAINT_INVALID';END IF;
 IF encode(sha256(convert_to(constraint_definition,'UTF8')),'hex')='dba148a49a05cb545db21870ab2c52979d801674030f235bda97348969e95c5c'THEN
  ALTER TABLE saas.toshi_credit_ledger DROP CONSTRAINT toshi_credit_ledger_check;
  ALTER TABLE saas.toshi_credit_ledger ADD CONSTRAINT toshi_credit_ledger_check CHECK ((((source_kind = 'operation'::text) AND (event = 'reserve'::text) AND (balance_delta = 0) AND ((reserved_delta >= 1) AND (reserved_delta <= 1000)) AND (operator_id IS NULL) AND (reason IS NULL) AND (checkout_order_id IS NULL)) OR ((source_kind = 'operation'::text) AND (event = 'complete'::text) AND ((balance_delta >= '-1000'::integer) AND (balance_delta <= '-1'::integer)) AND ((reserved_delta >= '-1000'::integer) AND (reserved_delta <= '-1'::integer)) AND (balance_delta >= reserved_delta) AND (operator_id IS NULL) AND (reason IS NULL) AND (checkout_order_id IS NULL)) OR ((source_kind = 'operation'::text) AND (event = 'release'::text) AND (balance_delta = 0) AND ((reserved_delta >= '-1000'::integer) AND (reserved_delta <= '-1'::integer)) AND (operator_id IS NULL) AND (reason ~ '^[a-z][a-z0-9_]{0,63}$'::text) AND (checkout_order_id IS NULL)) OR ((source_kind = 'grant'::text) AND (event = 'grant'::text) AND ((balance_delta >= 1) AND (balance_delta <= 1000000000)) AND (reserved_delta = 0) AND (operator_id IS NOT NULL) AND ((length(reason) >= 1) AND (length(reason) <= 1000)) AND (reason = btrim(reason)) AND (reason !~ '[[:cntrl:]]'::text) AND (checkout_order_id IS NULL)) OR ((source_kind = 'purchase'::text) AND (event = 'purchase'::text) AND (balance_delta = ANY (ARRAY[(500)::bigint, (2500)::bigint, (10000)::bigint, (50000)::bigint, (1)::bigint])) AND (reserved_delta = 0) AND (operator_id IS NULL) AND (reason IS NULL) AND (checkout_order_id = source_id))));
 END IF;
END $offer288$;
COMMIT;
