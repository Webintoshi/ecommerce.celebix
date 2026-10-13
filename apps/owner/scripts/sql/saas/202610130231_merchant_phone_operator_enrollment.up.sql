-- Central TOTP authority reserves an existing merchant principal's personal phone.
-- No membership, role or verified-email authority is created or changed.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.merchant_phone_enrollment_original_functions(signature text PRIMARY KEY,definition text NOT NULL,installed_definition text);
CREATE TABLE saas.merchant_phone_enrollment_schema_backup(name text PRIMARY KEY,definition text NOT NULL);
CREATE TABLE saas.merchant_phone_enrollment_operations(
 operation_id uuid PRIMARY KEY,operator_id uuid NOT NULL REFERENCES saas.platform_operators(id),principal_id uuid NOT NULL REFERENCES saas.principals(id),input jsonb NOT NULL,
 outcome text NOT NULL,authority jsonb,previous_identity jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE saas.merchant_phone_identities ADD COLUMN reserved_principal_id uuid REFERENCES saas.principals(id);
ALTER TABLE saas.merchant_phone_identities ADD COLUMN operator_enrolled_at timestamptz;
UPDATE saas.merchant_phone_identities SET reserved_principal_id=principal_id WHERE principal_id IS NOT NULL;
DO $constraints$ DECLARE r record;counted integer:=0;BEGIN
 FOR r IN SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='saas.merchant_phone_identities'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%principal_id%' AND pg_get_constraintdef(oid) LIKE '%verified_at%' LOOP
  counted:=counted+1;INSERT INTO saas.merchant_phone_enrollment_schema_backup VALUES(r.conname,r.definition);EXECUTE format('ALTER TABLE saas.merchant_phone_identities DROP CONSTRAINT %I',r.conname);
 END LOOP;
 IF counted<>1 THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_CONSTRAINT_PREDECESSOR';END IF;
END $constraints$;
ALTER TABLE saas.merchant_phone_identities ADD CONSTRAINT merchant_phone_enrollment_binding_check CHECK((
 (principal_id IS NULL AND verified_at IS NULL) OR
 (principal_id IS NOT NULL AND(verified_at IS NOT NULL OR(reserved_principal_id=principal_id AND operator_enrolled_at IS NOT NULL)))
) IS TRUE);
ALTER TABLE saas.merchant_phone_identities ADD CONSTRAINT merchant_phone_enrollment_reservation_check CHECK(reserved_principal_id IS NULL OR principal_id IS NULL OR reserved_principal_id=principal_id);
CREATE FUNCTION saas.merchant_phone_operator_enroll(p_input jsonb) RETURNS TABLE(outcome text,authority jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE n timestamptz:=clock_timestamp();op uuid;actor uuid;pid uuid;prior saas.merchant_phone_enrollment_operations;phone saas.merchant_phone_identities;previous saas.merchant_phone_identities;principal saas.principals;r record;result text;projection jsonb;v bigint;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR NOT(p_input ?& ARRAY['operatorId','operationId','principalId','reason','phoneKeyId','phoneDigest','phoneCiphertext','phoneMasked']) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k<>ALL(ARRAY['operatorId','operationId','principalId','reason','phoneKeyId','phoneDigest','phoneCiphertext','phoneMasked'])) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_input) e WHERE jsonb_typeof(e.value)<>'string') OR
  ((p_input->>'operatorId')~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' AND (p_input->>'operationId')~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' AND (p_input->>'principalId')~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' AND
  (p_input->>'phoneKeyId')~'^[a-z][a-z0-9_-]{2,31}$' AND (p_input->>'phoneDigest')~'^[a-f0-9]{64}$' AND length(p_input->>'phoneCiphertext') BETWEEN 1 AND 4096 AND length(p_input->>'phoneMasked') BETWEEN 1 AND 80 AND length(p_input->>'reason') BETWEEN 10 AND 1000 AND (p_input->>'reason')=btrim(p_input->>'reason')) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 op:=(p_input->>'operationId')::uuid;actor:=(p_input->>'operatorId')::uuid;pid:=(p_input->>'principalId')::uuid;
 PERFORM saas.platform_operator_require_active(actor);
 PERFORM 1 FROM saas.platform_operators WHERE id=actor AND active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'platform_access_denied';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('merchant.enrollment.operation:'||op,0));
 SELECT * INTO prior FROM saas.merchant_phone_enrollment_operations WHERE operation_id=op;
 IF FOUND THEN
  IF prior.operator_id<>actor OR prior.principal_id<>pid OR prior.input<>p_input THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT CASE WHEN prior.outcome IN('prepared','already_verified') THEN 'operation_replayed' ELSE prior.outcome END,prior.authority;END IF;RETURN;
 END IF;
 SELECT * INTO principal FROM saas.principals WHERE id=pid FOR SHARE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.memberships m JOIN saas.stores s ON s.id=m.store_id WHERE m.principal_id=pid AND m.status='active' AND m.support_session_id IS NULL AND s.status='active') THEN
  INSERT INTO saas.merchant_phone_enrollment_operations(operation_id,operator_id,principal_id,input,outcome) VALUES(op,actor,pid,p_input,'membership_denied');RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;
 END IF;
 INSERT INTO saas.admin_login_factors(principal_id) VALUES(pid) ON CONFLICT DO NOTHING;
 SELECT security_version INTO v FROM saas.admin_login_factors WHERE principal_id=pid FOR UPDATE;
 -- Factor precedes phone locks, matching OTP verification and security reset.
 PERFORM pg_advisory_xact_lock(hashtextextended('merchant.phone:'||(p_input->>'phoneKeyId')||':'||(p_input->>'phoneDigest'),0));
 SELECT * INTO phone FROM saas.merchant_phone_identities WHERE phone_key_id=p_input->>'phoneKeyId' AND phone_digest=p_input->>'phoneDigest' FOR UPDATE;
 SELECT * INTO previous FROM saas.merchant_phone_identities WHERE principal_id=pid FOR UPDATE;
 n:=clock_timestamp();
 IF (phone.principal_id IS NOT NULL AND phone.principal_id<>pid) OR (phone.reserved_principal_id IS NOT NULL AND phone.reserved_principal_id<>pid) THEN
  INSERT INTO saas.merchant_phone_enrollment_operations(operation_id,operator_id,principal_id,input,outcome) VALUES(op,actor,pid,p_input,'phone_conflict');RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;
 END IF;
 IF phone.principal_id=pid AND phone.verified_at IS NOT NULL AND phone.disabled_at IS NULL THEN result:='already_verified';
 ELSE
  IF EXISTS(SELECT 1 FROM saas.merchant_phone_staff s JOIN saas.memberships m ON m.store_id=s.store_id AND m.principal_id=pid AND m.support_session_id IS NULL WHERE s.phone_id=phone.id AND s.membership_id IS NULL) THEN
   INSERT INTO saas.merchant_phone_enrollment_operations(operation_id,operator_id,principal_id,input,outcome) VALUES(op,actor,pid,p_input,'phone_conflict');RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;
  END IF;
  IF previous.id IS NOT NULL AND(previous.id IS DISTINCT FROM phone.id OR previous.disabled_at IS NOT NULL) THEN
   SELECT * INTO r FROM saas.admin_login_security_invalidate(jsonb_build_object('issuer',principal.issuer,'subject',principal.subject,'eventId','merchant-enrollment:'||op,'reason','support_reset','operatorId',actor,'supportReason',p_input->>'reason'));
   IF r.outcome<>'invalidated' THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_RESET_INVARIANT';END IF;
   SELECT security_version INTO v FROM saas.admin_login_factors WHERE principal_id=pid;
  END IF;
  IF previous.id IS NOT NULL AND previous.id IS DISTINCT FROM phone.id THEN
   UPDATE saas.merchant_phone_identities SET reserved_principal_id=pid,principal_id=NULL,verified_at=NULL,disabled_at=coalesce(disabled_at,n) WHERE id=previous.id;
  END IF;
  IF phone.id IS NULL THEN
   INSERT INTO saas.merchant_phone_identities(id,phone_key_id,phone_digest,phone_ciphertext,phone_masked,principal_id,verified_at,reserved_principal_id,operator_enrolled_at)
   VALUES(gen_random_uuid(),p_input->>'phoneKeyId',p_input->>'phoneDigest',p_input->>'phoneCiphertext',p_input->>'phoneMasked',pid,NULL,pid,n) RETURNING * INTO phone;
  ELSE
   UPDATE saas.merchant_phone_identities SET principal_id=pid,reserved_principal_id=pid,verified_at=NULL,disabled_at=NULL,operator_enrolled_at=n,phone_ciphertext=p_input->>'phoneCiphertext',phone_masked=p_input->>'phoneMasked' WHERE id=phone.id RETURNING * INTO phone;
  END IF;
  -- Change only phone metadata for already linked ordinary staff memberships.
  -- Pending grants without membership authority retain their original phone.
  FOR r IN SELECT DISTINCT s.store_id FROM saas.merchant_phone_staff s JOIN saas.memberships m ON m.id=s.membership_id WHERE m.principal_id=pid AND m.support_session_id IS NULL AND m.role<>'store_owner' AND s.phone_id IS DISTINCT FROM phone.id ORDER BY s.store_id LOOP
   INSERT INTO saas.merchant_phone_staff_versions(store_id) VALUES(r.store_id) ON CONFLICT DO NOTHING;
   UPDATE saas.merchant_phone_staff_versions SET version=version+1 WHERE store_id=r.store_id;
   UPDATE saas.merchant_phone_staff s SET phone_id=phone.id,version=s.version+1,updated_at=n WHERE s.store_id=r.store_id AND s.phone_id IS DISTINCT FROM phone.id AND EXISTS(SELECT 1 FROM saas.memberships m WHERE m.id=s.membership_id AND m.principal_id=pid AND m.support_session_id IS NULL AND m.role<>'store_owner');
  END LOOP;
  result:='prepared';
 END IF;
 projection:=jsonb_build_object('principalId',pid,'phoneMasked',phone.phone_masked,'phoneVerified',phone.verified_at IS NOT NULL,'operationId',op,'securityVersion',v);
 INSERT INTO saas.merchant_phone_enrollment_operations(operation_id,operator_id,principal_id,input,outcome,authority,previous_identity) VALUES(op,actor,pid,p_input,result,projection,CASE WHEN previous.id IS NOT NULL THEN to_jsonb(previous) END);
 RETURN QUERY SELECT result,projection;
END $f$;
-- A recovery assignment cannot reuse a challenge or signup proof created before it.
DO $patch$ DECLARE r record;d text;anchor text;BEGIN
 FOR r IN SELECT p.oid::regprocedure::text signature,p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname IN('merchant_whatsapp_command','merchant_whatsapp_bootstrap_principal') LOOP
  INSERT INTO saas.merchant_phone_enrollment_original_functions(signature,definition) VALUES(r.signature,r.definition);d:=r.definition;
  IF r.proname='merchant_whatsapp_command' THEN
   anchor:='IF phone.disabled_at IS NOT NULL THEN';
   IF position(anchor in d)=0 THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_VERIFY_PREDECESSOR';END IF;
   d:=replace(d,anchor,'IF phone.operator_enrolled_at IS NOT NULL AND pending.created_at<phone.operator_enrolled_at THEN RETURN QUERY SELECT ''unauthenticated'',NULL::jsonb;RETURN;END IF; '||anchor);
   anchor:='UPDATE saas.merchant_phone_pending SET principal_id=pid,verified_at=n WHERE pending_id=pending.pending_id;';
   IF position(anchor in d)=0 THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_CENTRAL_SELECTION_PREDECESSOR';END IF;
   d:=replace(d,anchor,$central$
   IF pending.purpose='login' AND pending.store_id IS NULL THEN
    SELECT s.id INTO sid FROM saas.memberships m JOIN saas.stores s ON s.id=m.store_id
    WHERE m.principal_id=pid AND m.status='active' AND m.support_session_id IS NULL AND s.status='active'
     AND EXISTS(SELECT 1 FROM saas.subscriptions sub JOIN saas.plans p ON p.id=sub.plan_id AND p.plan_code=sub.plan_code AND p.version=sub.plan_version
      WHERE sub.store_id=s.id AND sub.status='active' AND sub.valid_from<=n AND(sub.valid_until IS NULL OR sub.valid_until>n)
       AND p.status='active' AND p.valid_from<=n AND(p.valid_until IS NULL OR p.valid_until>n))
     AND EXISTS(SELECT 1 FROM saas.admin_domains ad WHERE ad.store_id=s.id AND ad.status='active' AND ad.canonical AND ad.verified_at<=n)
    ORDER BY s.slug,s.id LIMIT 1;
    IF sid IS NULL THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
   END IF;
   $central$||anchor);
   anchor:='IF pending.purpose=''signup'' THEN SELECT ''https://''||hostname INTO destination';
   IF position(anchor in d)=0 THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_CENTRAL_DESTINATION_PREDECESSOR';END IF;
   d:=replace(d,anchor,'IF pending.purpose=''signup'' OR(pending.purpose=''login'' AND pending.store_id IS NULL) THEN SELECT ''https://''||hostname INTO destination');
  ELSE
   anchor:='AND disabled_at IS NULL AND verified_at IS NOT NULL) THEN RAISE EXCEPTION ''MERCHANT_SIGNUP_PROOF_REQUIRED'';';
   IF position(anchor in d)=0 THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_BOOTSTRAP_PREDECESSOR';END IF;
   d:=replace(d,anchor,'AND disabled_at IS NULL AND verified_at IS NOT NULL AND(operator_enrolled_at IS NULL OR pending.created_at>=operator_enrolled_at)) THEN RAISE EXCEPTION ''MERCHANT_SIGNUP_PROOF_REQUIRED'';');
  END IF;
  EXECUTE d;UPDATE saas.merchant_phone_enrollment_original_functions SET installed_definition=pg_get_functiondef(r.signature::regprocedure) WHERE signature=r.signature;
 END LOOP;
 IF (SELECT count(*) FROM saas.merchant_phone_enrollment_original_functions)<>2 THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_FUNCTION_PREDECESSOR';END IF;
END $patch$;
DO $security$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['merchant_phone_enrollment_operations','merchant_phone_enrollment_original_functions','merchant_phone_enrollment_schema_backup'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_platform_operator',t);
 END LOOP;
END $security$;
REVOKE ALL ON FUNCTION saas.merchant_phone_operator_enroll(jsonb) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_platform_operator;
GRANT EXECUTE ON FUNCTION saas.merchant_phone_operator_enroll(jsonb) TO celebix_saas_platform_operator;
COMMIT;
