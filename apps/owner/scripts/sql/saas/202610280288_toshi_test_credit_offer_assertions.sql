BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
DO $assert288$
DECLARE r record;p pg_proc%ROWTYPE;
BEGIN
 FOR r IN SELECT * FROM(VALUES
 ('saas.platform_checkout_fulfill281(uuid,uuid,timestamp with time zone)','7ecfb276d124c51e7060eb34fbd3996d3a840721ceb065b879aba1bf963d6011','6fc11ee0ce00e9cab8ab2d01c9eafad4bab7b7373928c45f96611af09dc4da17','{celebix_saas_owner=X/celebix_saas_owner}'),
 ('saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)','5edd8a6a6171a1f27d1b9e1cc98be54ceef43d78b89df10aac563770ffe06679','f5aba85e14927d5f96eb8aafa20dee7c9683e7004f8fd9cfee55171f7eafe82d','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}')
 )expected(identity,old_hash,new_hash,acl)LOOP
  SELECT *INTO p FROM pg_proc WHERE oid=to_regprocedure(r.identity);
  IF NOT FOUND OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl::text IS DISTINCT FROM r.acl
   OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>r.new_hash THEN RAISE EXCEPTION 'TOSHI_TEST_CREDIT288_ROUTINE_INVALID';END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.platform_checkout_orders'::regclass AND conname='platform_checkout_shape283'AND contype='c'AND convalidated
  AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='a99907470fc8346c25131250ee947c38fb23ac5d2f848d0d159302b4f67dbd30')THEN RAISE EXCEPTION 'TOSHI_TEST_CREDIT288_CONSTRAINT_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.toshi_credit_ledger'::regclass AND conname='toshi_credit_ledger_check'AND contype='c'AND convalidated
  AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='441c5722d6536aa2dd0175e916eb06fa0530c733bacdd09fe68a2a74f29d7f07')THEN RAISE EXCEPTION 'TOSHI_TEST_CREDIT288_LEDGER_CONSTRAINT_INVALID';END IF;
 IF round(83::numeric/5)<>17 OR 83+round(83::numeric/5)<>100 THEN RAISE EXCEPTION 'TOSHI_TEST_CREDIT288_VAT_INVALID';END IF;
END $assert288$;
COMMIT;
