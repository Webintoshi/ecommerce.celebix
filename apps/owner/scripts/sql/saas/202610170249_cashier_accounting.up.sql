-- Optional full accounting access for an explicitly enabled cashier grant. No existing grant is enabled.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release249',0));
DO $pre$BEGIN
 IF to_regclass('saas.commercial248_original_functions') IS NULL OR to_regprocedure('saas.accounting_access_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz)') IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNTING249_PREDECESSOR';END IF;
 IF EXISTS(SELECT 1 FROM saas.commercial248_original_functions WHERE encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(signature)),'UTF8')),'hex')<>published_sha256) THEN RAISE EXCEPTION 'ACCOUNTING249_248_SOURCE_DRIFT';END IF;
END $pre$;
CREATE TABLE saas.accounting249_original_functions(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text NOT NULL,function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],function_config text[],function_security boolean NOT NULL,function_volatility char NOT NULL,function_strict boolean NOT NULL,function_parallel char NOT NULL);
ALTER TABLE saas.accounting249_original_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.accounting249_original_functions FORCE ROW LEVEL SECURITY;
CREATE POLICY accounting249_owner ON saas.accounting249_original_functions TO celebix_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON saas.accounting249_original_functions FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON saas.accounting249_original_functions FROM %I',r.rolname);END LOOP;END $acl$;
ALTER TABLE saas.in_store_staff_grants ADD COLUMN can_manage_accounting boolean NOT NULL DEFAULT false;

CREATE FUNCTION saas.accounting249_base_authority_error(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;actor_role text;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) THEN RETURN 'invalid_input';END IF;
 err:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'orders','in_store.read');
 IF err IS NOT NULL THEN RETURN err;END IF;
 IF NOT saas.commercial_plan_has_capability(p_plan,'accounting') THEN RETURN 'feature_not_enabled';END IF;
 SELECT role INTO actor_role FROM saas.platform_authorized_memberships WHERE store_id=p_store AND id=p_member AND principal_id=p_principal AND status='active';
 IF actor_role NOT IN('store_owner','admin','cashier') OR actor_role IS NULL THEN RETURN 'membership_denied';END IF;
 IF actor_role='cashier' AND (NOT saas.commercial_plan_has_capability(p_plan,'cashier') OR NOT saas.commercial_plan_has_capability(p_plan,'manual_orders')) THEN RETURN 'feature_not_enabled';END IF;
 RETURN NULL;
END $f$;
CREATE FUNCTION saas.accounting249_can_manage(p_store uuid,p_member uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT saas.in_store_is_manager(p_store,p_member) OR EXISTS(SELECT 1 FROM saas.platform_authorized_memberships m JOIN saas.in_store_staff_grants g ON g.store_id=m.store_id AND g.membership_id=m.id WHERE m.store_id=p_store AND m.id=p_member AND m.status='active' AND m.role='cashier' AND g.enabled AND g.can_manage_accounting)
$f$;
CREATE FUNCTION saas.accounting_access_read(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;manage boolean;collect boolean;BEGIN
 err:=saas.accounting249_base_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now);IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 manage:=saas.accounting249_can_manage(p_store,p_member);
 collect:=manage OR EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled AND can_collect_receivables AND cardinality(location_ids)>0);
 RETURN QUERY SELECT 'found',jsonb_build_object('canManageAccounting',manage,'canCollectReceivables',collect);
END $f$;
CREATE FUNCTION saas.in_store_staff_projection_v5(p_store uuid,p_member uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT saas.in_store_staff_projection_v3(p_store,p_member)||jsonb_build_object('canManageAccounting',coalesce((SELECT can_manage_accounting FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member),false))
$f$;
CREATE FUNCTION saas.in_store_sales_list_staff_v5(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('staff',coalesce(jsonb_agg(saas.in_store_staff_projection_v5(p_store_id,m.id) ORDER BY m.id),'[]'::jsonb)) FROM (SELECT id FROM saas.platform_normal_memberships WHERE store_id=p_store_id AND status='active' ORDER BY id LIMIT 100) m;
END $function$;
CREATE FUNCTION saas.in_store_sales_recover_staff_v5(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;
BEGIN
 err:=saas.commercial248_receipt_in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.store_id<>p_store_id OR prior.operation_kind<>'set_staff_v5' OR prior.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('canManageAccounting',coalesce((prior.result_payload->>'canManageAccounting')::boolean,false),'canEditPrice',coalesce((prior.result_payload->>'canEditPrice')::boolean,false),'canSellOnCredit',coalesce((prior.result_payload->>'canSellOnCredit')::boolean,false),'canCollectReceivables',coalesce((prior.result_payload->>'canCollectReceivables')::boolean,false));
END $function$;
CREATE FUNCTION saas.in_store_sales_set_staff_v5(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_target_member uuid, p_expected_version bigint, p_enabled boolean, p_locations uuid[], p_discount_limit integer, p_can_edit_price boolean, p_can_sell_on_credit boolean, p_can_collect_receivables boolean, p_can_manage_accounting boolean)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;current_version bigint;projected jsonb;
BEGIN PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'in_store_sales_set_staff_v5');
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_target_member IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_can_edit_price IS NULL OR p_can_sell_on_credit IS NULL OR p_can_collect_receivables IS NULL OR p_can_manage_accounting IS NULL OR p_enabled IS NULL OR p_locations IS NULL OR cardinality(p_locations)>100 OR array_position(p_locations,NULL) IS NOT NULL OR p_discount_limit IS NULL OR p_discount_limit NOT BETWEEN 0 AND 9999 OR cardinality(p_locations)<>(SELECT count(DISTINCT id) FROM unnest(p_locations) id) OR (p_enabled AND cardinality(p_locations)=0) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 -- Lock durable authority and recheck after any wait on the store writer lock.
 PERFORM 1 FROM saas.platform_normal_memberships WHERE store_id=p_store_id AND id=p_membership_id FOR SHARE;
 PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR SHARE;
 PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id FOR SHARE;
 PERFORM 1 FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id FOR SHARE;
 PERFORM 1 FROM saas.platform_normal_memberships WHERE store_id=p_store_id AND id=p_target_member FOR SHARE;
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;

 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.store_id=p_store_id AND prior.operation_kind='set_staff_v5' AND prior.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload;ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
 END IF;
 IF (p_can_manage_accounting AND NOT EXISTS(SELECT 1 FROM saas.platform_normal_memberships WHERE id=p_target_member AND store_id=p_store_id AND status='active' AND role='cashier')) OR NOT EXISTS(SELECT 1 FROM saas.platform_normal_memberships WHERE id=p_target_member AND store_id=p_store_id AND status='active' AND role IN('store_owner','admin','cashier')) OR EXISTS(SELECT 1 FROM unnest(p_locations) assigned(id) WHERE NOT EXISTS(SELECT 1 FROM saas.inventory_locations WHERE id=assigned.id AND store_id=p_store_id AND status='active')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT version INTO current_version FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_target_member FOR UPDATE;
 IF coalesce(current_version,0)<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.in_store_staff_grants(store_id,membership_id,enabled,location_ids,discount_limit_bps,version,updated_at,can_edit_price,can_collect_receivables,can_sell_on_credit,can_manage_accounting) VALUES(p_store_id,p_target_member,p_enabled,p_locations,p_discount_limit,1,p_now,p_can_edit_price,p_can_collect_receivables,p_can_sell_on_credit,p_can_manage_accounting)
 ON CONFLICT(membership_id) DO UPDATE SET can_manage_accounting=excluded.can_manage_accounting,can_collect_receivables=excluded.can_collect_receivables,can_sell_on_credit=excluded.can_sell_on_credit,can_edit_price=excluded.can_edit_price,enabled=excluded.enabled,location_ids=excluded.location_ids,discount_limit_bps=excluded.discount_limit_bps,version=saas.in_store_staff_grants.version+1,updated_at=p_now;
 projected:=saas.in_store_staff_projection_v5(p_store_id,p_target_member);
 INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,NULL,'set_staff_v5',p_fingerprint,projected,p_now);
 RETURN QUERY SELECT 'committed',projected;
END $function$;
CREATE FUNCTION saas.accounting_invoice_profiles_read(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_status text DEFAULT NULL)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text;
BEGIN
  IF p_status IS NOT NULL AND p_status NOT IN('pending_validation','active','disabled','rotation_required','revoked') THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.accounting_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((
    SELECT pg_catalog.jsonb_agg(saas.merchant_provider_profile_projection(p_store_id,listed.id)
      ORDER BY listed.updated_at DESC,listed.id DESC)
    FROM (
      SELECT profile.id,profile.updated_at
      FROM saas.merchant_provider_profiles AS profile
      WHERE profile.store_id=p_store_id AND profile.capability='invoice_reconciliation' AND (p_status IS NULL OR profile.status=p_status)
      ORDER BY profile.updated_at DESC,profile.id DESC
      LIMIT 100
    ) AS listed
  ),'[]'::jsonb));
END
$function$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.accounting_authority_error(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone, p_collection boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE role_name text;err text;BEGIN
 IF NOT saas.commercial_plan_has_capability(p_plan,'accounting') THEN RETURN 'feature_not_enabled';END IF;

 IF p_now IS NULL OR NOT isfinite(p_now) THEN RETURN 'invalid_input';END IF;
 SELECT role INTO role_name FROM saas.platform_authorized_memberships WHERE store_id=p_store AND id=p_member AND principal_id=p_principal AND status='active';
 IF role_name='cashier' THEN
  err:=saas.accounting249_base_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now);IF err IS NOT NULL THEN RETURN err;END IF;
  IF saas.accounting249_can_manage(p_store,p_member) THEN RETURN NULL;END IF;
  IF p_collection THEN
   err:=saas.in_store_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now);IF err IS NOT NULL THEN RETURN err;END IF;
   IF EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled AND can_collect_receivables) THEN RETURN NULL;END IF;
  END IF;
  RETURN 'membership_denied';
 END IF;
 IF role_name IS NULL OR role_name NOT IN('store_owner','admin') THEN RETURN 'membership_denied';END IF;
 RETURN saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'orders','orders.payment');
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.accounting_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'4d97e0fe4ccbe34afd7408633fe582db7dc9709535dd807177930c8c397a8eab' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'ACCOUNTING249_PREDECESSOR_DRIFT:%','saas.accounting_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)';END IF;
 INSERT INTO saas.accounting249_original_functions VALUES('saas.accounting_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)',f.definition,'4d97e0fe4ccbe34afd7408633fe582db7dc9709535dd807177930c8c397a8eab','ecd043c8a8fd68936925a3805369f84ecddb663e80b4f6f4da3c573dd51d880e',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='ecd043c8a8fd68936925a3805369f84ecddb663e80b4f6f4da3c573dd51d880e' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'ACCOUNTING249_POSTCONDITION:%','saas.accounting_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.accounting_mutate(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation uuid, p_fingerprint text, p_kind text, p_args jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.accounting_operations%ROWTYPE;account saas.accounting_accounts%ROWTYPE;target saas.accounting_accounts%ROWTYPE;debt saas.accounting_receivables%ROWTYPE;original saas.accounting_events%ROWTYPE;r record;event uuid;customer uuid;order_id_value uuid;account_id_value uuid;currency_code text;amount bigint;commission bigint:=0;current_version bigint;leftover bigint;take bigint;occurred timestamptz;kind_value text;note_value text;method text;channel_value text;reverses uuid;metadata_value jsonb:='{}';result jsonb;projection jsonb;refundable bigint;discount bigint:=0;discount_left bigint:=0;discount_take bigint:=0;discount_allocations jsonb:='[]';
BEGIN PERFORM saas.platform_support_begin(p_store,p_principal,p_member,'accounting_mutate');
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_plan_version,p_now,p_kind='collect');IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR NOT saas.accounting_intent_valid(p_kind,p_args) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.operation:'||p_operation::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store::text,0));
 PERFORM 1 FROM saas.platform_authorized_memberships WHERE store_id=p_store AND id=p_member FOR SHARE;PERFORM 1 FROM saas.stores WHERE id=p_store FOR SHARE;PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan FOR SHARE;PERFORM 1 FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member FOR SHARE;
 -- Recheck durable role/grant after waiting; revocation never grants a queued writer.
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_plan_version,p_now,p_kind='collect');IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 discount:=CASE WHEN p_kind='collect' THEN coalesce((p_args->>'discountCents')::bigint,0) ELSE 0 END;
 IF discount>0 AND NOT saas.accounting249_can_manage(p_store,p_member) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_operations WHERE operation_id=p_operation;
 IF FOUND THEN IF prior.store_id=p_store AND prior.kind=p_kind AND prior.payload_fingerprint=p_fingerprint AND (prior.actor_membership_id=p_member OR saas.in_store_is_manager(p_store,p_member)) THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload||jsonb_build_object('replayed',true);ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;END IF;
 IF discount>0 AND NOT coalesce((SELECT collection_discounts_enabled FROM saas.accounting_release_state WHERE singleton),false) THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
 event:=saas.inventory_deterministic_uuid('accounting','saas.accounting.event:'||p_operation::text);amount:=(p_args->>'amountCents')::bigint;customer:=(p_args->>'customerId')::uuid;order_id_value:=(p_args->>'orderId')::uuid;account_id_value:=(p_args->>'accountId')::uuid;currency_code:=p_args->>'currency';note_value:=coalesce(p_args->>'note',p_args->>'reason');method:=p_args->>'paymentMethod';occurred:=CASE WHEN p_args?'occurredOn' THEN (p_args->>'occurredOn')::date::timestamp AT TIME ZONE saas.accounting_timezone(p_store) ELSE p_now END;
 IF occurred>p_now THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_kind IN('collect','openingDebt') THEN
 IF NOT EXISTS(SELECT 1 FROM saas.customers WHERE store_id=p_store AND id=customer) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT version INTO current_version FROM saas.accounting_customer_versions WHERE store_id=p_store AND customer_id=customer AND currency=currency_code FOR UPDATE;
 IF coalesce(current_version,0)<>(p_args->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code HAVING sum(sale_cents::numeric)+coalesce(amount,0)>9007199254740991 OR sum(collected_cents::numeric)+coalesce(amount,0)>9007199254740991) THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_kind='saveAccount' THEN account_id_value:=saas.inventory_deterministic_uuid('accounting','saas.accounting.account:'||p_operation::text);INSERT INTO saas.accounting_accounts(id,store_id,name,account_type,currency,created_at) VALUES(account_id_value,p_store,p_args->>'name',p_args->>'type',currency_code,p_now);
 ELSE
 IF p_kind IN('openBalance','expense','refund') THEN
 SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=account_id_value FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF p_kind<>'refund' AND account.version<>(p_args->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF currency_code IS NOT NULL AND account.currency<>currency_code THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb;RETURN;END IF;currency_code:=account.currency;
 ELSIF p_kind IN('transfer','settleCard') THEN
 SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=(p_args->>'fromAccountId')::uuid FOR UPDATE;SELECT * INTO target FROM saas.accounting_accounts WHERE store_id=p_store AND id=(p_args->>'toAccountId')::uuid FOR UPDATE;
 IF account.id IS NULL OR target.id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF account.version<>(p_args->>'expectedVersion')::bigint OR target.version<>(p_args->>'toExpectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF account.currency<>target.currency THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb;RETURN;END IF;
 IF p_kind='settleCard' AND (account.account_type<>'card' OR target.account_type<>'bank') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 commission:=coalesce((p_args->>'commissionCents')::bigint,0);currency_code:=account.currency;account_id_value:=account.id;metadata_value:=jsonb_build_object('toAccountId',target.id,'grossCents',amount,'netCents',amount-commission,'commissionCents',commission);
 END IF;
 IF p_kind IN('returnCredit','refund') THEN
 SELECT * INTO debt FROM saas.accounting_receivables WHERE store_id=p_store AND order_id=order_id_value FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF debt.version<>(p_args->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF currency_code IS NOT NULL AND currency_code<>debt.currency THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb;RETURN;END IF;currency_code:=debt.currency;customer:=debt.customer_id;channel_value:=debt.channel;
 IF p_kind='returnCredit' AND amount>debt.sale_cents-debt.return_cents-debt.discount_cents THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_kind='refund' AND amount>greatest(debt.collected_cents-debt.sale_cents+debt.return_cents+debt.discount_cents-debt.refunded_cents,0) THEN RETURN QUERY SELECT 'overpayment',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_kind='collect' THEN
 IF order_id_value IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE store_id=p_store AND order_id=order_id_value AND customer_id=customer AND currency=currency_code) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF amount::numeric+discount>(SELECT coalesce(sum(greatest(sale_cents-return_cents-discount_cents-collected_cents,0)),0) FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code AND (order_id_value IS NULL OR order_id=order_id_value)) THEN RETURN QUERY SELECT 'overpayment',NULL::jsonb;RETURN;END IF;
 IF amount>0 THEN
 IF account_id_value IS NULL THEN account_id_value:=saas.accounting_default_account(p_store,currency_code,method,p_now);END IF;
 SELECT * INTO account FROM saas.accounting_accounts WHERE store_id=p_store AND id=account_id_value FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF account.currency<>currency_code THEN RETURN QUERY SELECT 'currency_mismatch',NULL::jsonb;RETURN;END IF;
 IF account.account_type<>(CASE method WHEN 'bank_transfer' THEN 'bank' ELSE method END) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 ELSE account_id_value:=NULL;method:=NULL;END IF;
 -- A customer receipt can span POS/WEB only when real receivables exist. Channel follows allocations.
 WITH fifo_debts AS(SELECT channel,coalesce(sum(greatest(sale_cents-return_cents-discount_cents-collected_cents,0)::numeric) OVER(ORDER BY occurred_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior_due FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code AND (order_id_value IS NULL OR order_id=order_id_value) AND sale_cents-return_cents-discount_cents-collected_cents>0) SELECT CASE WHEN count(DISTINCT channel)=1 AND count(*) FILTER(WHERE channel IS NULL)=0 THEN min(channel) ELSE NULL END INTO channel_value FROM fifo_debts WHERE prior_due<amount::numeric+discount;
 IF discount>0 THEN
  -- Allocate real money first, then forgive only the remaining debt, in the same FIFO sequence.
  leftover:=amount;discount_left:=discount;
  FOR debt IN SELECT * FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code AND (order_id_value IS NULL OR order_id=order_id_value) ORDER BY occurred_at,id FOR UPDATE LOOP
   take:=least(leftover,greatest(debt.sale_cents-debt.return_cents-debt.discount_cents-debt.collected_cents,0));leftover:=leftover-take;
   discount_take:=least(discount_left,greatest(debt.sale_cents-debt.return_cents-debt.discount_cents-debt.collected_cents-take,0));
   IF discount_take>0 THEN discount_allocations:=discount_allocations||jsonb_build_array(jsonb_build_object('receivableId',debt.id,'orderId',debt.order_id,'amountCents',discount_take));discount_left:=discount_left-discount_take;END IF;
   EXIT WHEN leftover=0 AND discount_left=0;
  END LOOP;
  IF leftover<>0 OR discount_left<>0 THEN RETURN QUERY SELECT 'overpayment',NULL::jsonb;RETURN;END IF;
  metadata_value:=jsonb_build_object('discountCents',discount,'discountAllocations',discount_allocations);
 END IF;
 END IF;
 IF p_kind IN('collect','openBalance') AND account.balance_cents::numeric+amount>9007199254740991 OR p_kind IN('expense','refund','transfer','settleCard') AND account.balance_cents<amount OR p_kind IN('transfer','settleCard') AND target.balance_cents::numeric+amount-commission>9007199254740991 THEN RETURN QUERY SELECT CASE WHEN p_kind IN('expense','refund','transfer','settleCard') AND account.balance_cents<amount THEN 'insufficient_funds' ELSE 'amount_overflow' END,NULL::jsonb;RETURN;END IF;
 IF p_kind='refund' AND account.account_type<>(CASE method WHEN 'bank_transfer' THEN 'bank' ELSE method END) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_kind='reverse' THEN
 SELECT * INTO original FROM saas.accounting_events WHERE store_id=p_store AND id=(p_args->>'eventId')::uuid;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.in_store_payment_receipts_v4 pending_receipt JOIN saas.in_store_sales s ON s.store_id=pending_receipt.store_id AND s.id=pending_receipt.sale_id LEFT JOIN saas.in_store_payment_returns_v4 returned ON returned.store_id=pending_receipt.store_id AND returned.receipt_id=pending_receipt.id WHERE pending_receipt.store_id=p_store AND (pending_receipt.event_id=original.id OR returned.event_id=original.id) AND s.status<>'completed') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 IF original.kind IN('sale','reversal') OR EXISTS(SELECT 1 FROM saas.accounting_events WHERE store_id=p_store AND reverses_event_id=original.id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 customer:=original.customer_id;currency_code:=original.currency;order_id_value:=original.order_id;account_id_value:=original.account_id;amount:=original.amount_cents;channel_value:=original.channel;reverses:=original.id;metadata_value:=jsonb_build_object('reversedKind',original.kind)||CASE WHEN coalesce((original.metadata->>'discountCents')::bigint,0)>0 THEN jsonb_build_object('discountCents',(original.metadata->>'discountCents')::bigint,'discountAllocations',original.metadata->'discountAllocations') ELSE '{}'::jsonb END;
 IF order_id_value IS NULL THEN SELECT min(allocated.order_id::text)::uuid INTO order_id_value FROM saas.accounting_allocations allocation JOIN saas.accounting_receivables allocated ON allocated.store_id=allocation.store_id AND allocated.id=allocation.receivable_id WHERE allocation.store_id=p_store AND allocation.event_id=original.id HAVING count(DISTINCT allocated.order_id)=1 AND count(*) FILTER(WHERE allocated.order_id IS NULL)=0;END IF;
 IF customer IS NOT NULL THEN SELECT version INTO current_version FROM saas.accounting_customer_versions WHERE store_id=p_store AND customer_id=customer AND currency=currency_code FOR UPDATE;
 ELSIF order_id_value IS NOT NULL THEN SELECT version INTO current_version FROM saas.accounting_receivables WHERE store_id=p_store AND order_id=order_id_value FOR UPDATE;
 ELSIF original.kind='return_credit' AND account_id_value IS NULL THEN
 SELECT d.version INTO current_version FROM saas.accounting_receivables d
 JOIN saas.accounting_allocations a ON a.store_id=d.store_id AND a.receivable_id=d.id
 WHERE a.store_id=p_store AND a.event_id=original.id AND a.effect='return' FOR UPDATE OF d;
 ELSE SELECT version INTO current_version FROM saas.accounting_accounts WHERE store_id=p_store AND id=account_id_value FOR UPDATE;END IF;
 IF current_version IS NULL OR current_version<>(p_args->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 FOR r IN SELECT m.*,a.balance_cents FROM saas.accounting_account_movements m JOIN saas.accounting_accounts a ON a.store_id=m.store_id AND a.id=m.account_id WHERE m.store_id=p_store AND m.event_id=original.id ORDER BY m.account_id FOR UPDATE OF a LOOP IF r.balance_cents::numeric-r.amount_cents NOT BETWEEN 0 AND 9007199254740991 THEN RETURN QUERY SELECT 'insufficient_funds',NULL::jsonb;RETURN;END IF;END LOOP;
 FOR r IN SELECT a.*,d.sale_cents,d.collected_cents,d.return_cents,d.discount_cents,d.refunded_cents FROM saas.accounting_allocations a JOIN saas.accounting_receivables d ON d.store_id=a.store_id AND d.id=a.receivable_id WHERE a.store_id=p_store AND a.event_id=original.id ORDER BY d.id FOR UPDATE OF d LOOP
 IF r.effect='collect' AND r.collected_cents<r.amount_cents OR r.effect='discount' AND r.discount_cents<r.amount_cents OR r.effect='return' AND r.return_cents<r.amount_cents OR r.effect='refund' AND r.refunded_cents<r.amount_cents OR r.effect='charge' AND (r.collected_cents>0 OR r.return_cents>0 OR r.discount_cents>0) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 IF r.refunded_cents-coalesce((SELECT sum(amount_cents) FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=original.id AND receivable_id=r.receivable_id AND effect='refund'),0) > greatest(r.collected_cents-r.sale_cents+r.return_cents+r.discount_cents
  -coalesce((SELECT sum(amount_cents) FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=original.id AND receivable_id=r.receivable_id AND effect IN('collect','discount','return')),0)
  +coalesce((SELECT sum(amount_cents) FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=original.id AND receivable_id=r.receivable_id AND effect='charge'),0),0)
 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 END LOOP;
 END IF;
 kind_value:=CASE p_kind WHEN 'collect' THEN 'collection' WHEN 'reverse' THEN 'reversal' WHEN 'openingDebt' THEN 'opening_debt' WHEN 'openBalance' THEN 'account_opening' WHEN 'settleCard' THEN 'card_settlement' WHEN 'returnCredit' THEN 'return_credit' ELSE p_kind END;
 INSERT INTO saas.accounting_events(id,store_id,operation_id,kind,currency,amount_cents,account_id,customer_id,order_id,channel,payment_method,note,category,document_number,actor_membership_id,occurred_at,created_at,reverses_event_id,metadata) VALUES(event,p_store,p_operation,kind_value,currency_code,amount,account_id_value,customer,order_id_value,channel_value,method,note_value,p_args->>'category',p_args->>'documentNumber',p_member,occurred,p_now,reverses,metadata_value);
 IF p_kind='openingDebt' THEN
 INSERT INTO saas.accounting_receivables(id,store_id,customer_id,customer_snapshot,currency,sale_cents,occurred_at) SELECT event,p_store,customer,jsonb_build_object('name',concat_ws(' ',first_name,last_name),'phone',phone),currency_code,amount,occurred FROM saas.customers WHERE store_id=p_store AND id=customer;
 INSERT INTO saas.accounting_allocations VALUES(p_store,event,event,'charge',amount);
 ELSIF p_kind='collect' THEN
 leftover:=amount;discount_left:=discount;
 FOR debt IN SELECT * FROM saas.accounting_receivables WHERE store_id=p_store AND customer_id=customer AND currency=currency_code AND (order_id_value IS NULL OR order_id=order_id_value) ORDER BY occurred_at,id FOR UPDATE LOOP
  take:=least(leftover,greatest(debt.sale_cents-debt.return_cents-debt.discount_cents-debt.collected_cents,0));
  discount_take:=least(discount_left,greatest(debt.sale_cents-debt.return_cents-debt.discount_cents-debt.collected_cents-take,0));
  IF take>0 THEN INSERT INTO saas.accounting_allocations VALUES(p_store,event,debt.id,'collect',take);END IF;
  IF discount_take>0 THEN INSERT INTO saas.accounting_allocations VALUES(p_store,event,debt.id,'discount',discount_take);END IF;
  IF take>0 OR discount_take>0 THEN UPDATE saas.accounting_receivables SET collected_cents=collected_cents+take,discount_cents=discount_cents+discount_take,version=version+1 WHERE store_id=p_store AND id=debt.id;PERFORM saas.accounting_sync_order(p_store,debt.order_id,p_now);END IF;
  leftover:=leftover-take;discount_left:=discount_left-discount_take;EXIT WHEN leftover=0 AND discount_left=0;
 END LOOP;
 IF amount>0 THEN INSERT INTO saas.accounting_account_movements VALUES(p_store,event,account_id_value,amount);UPDATE saas.accounting_accounts SET balance_cents=balance_cents+amount,version=version+1 WHERE store_id=p_store AND id=account_id_value;END IF;
 ELSIF p_kind IN('returnCredit','refund') THEN
 INSERT INTO saas.accounting_allocations VALUES(p_store,event,debt.id,CASE p_kind WHEN 'refund' THEN 'refund' ELSE 'return' END,amount);
 UPDATE saas.accounting_receivables SET return_cents=return_cents+CASE WHEN p_kind='returnCredit' THEN amount ELSE 0 END,refunded_cents=refunded_cents+CASE WHEN p_kind='refund' THEN amount ELSE 0 END,version=version+1 WHERE store_id=p_store AND id=debt.id;
 IF p_kind='refund' THEN INSERT INTO saas.accounting_account_movements VALUES(p_store,event,account_id_value,-amount);UPDATE saas.accounting_accounts SET balance_cents=balance_cents-amount,version=version+1 WHERE store_id=p_store AND id=account_id_value;END IF;PERFORM saas.accounting_sync_order(p_store,order_id_value,p_now);
 ELSIF p_kind IN('openBalance','expense','transfer','settleCard') THEN
 INSERT INTO saas.accounting_account_movements VALUES(p_store,event,account_id_value,CASE p_kind WHEN 'openBalance' THEN amount ELSE -amount END);UPDATE saas.accounting_accounts SET balance_cents=balance_cents+CASE p_kind WHEN 'openBalance' THEN amount ELSE -amount END,version=version+1 WHERE store_id=p_store AND id=account_id_value;
 IF p_kind IN('transfer','settleCard') THEN INSERT INTO saas.accounting_account_movements VALUES(p_store,event,target.id,amount-commission);UPDATE saas.accounting_accounts SET balance_cents=balance_cents+amount-commission,version=version+1 WHERE store_id=p_store AND id=target.id;END IF;
 ELSE
 INSERT INTO saas.accounting_allocations SELECT store_id,event,receivable_id,effect,-amount_cents FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=original.id;
 FOR r IN SELECT receivable_id,sum(amount_cents)FILTER(WHERE effect='collect') collected,sum(amount_cents)FILTER(WHERE effect='discount') discounted,sum(amount_cents)FILTER(WHERE effect='return') returned,sum(amount_cents)FILTER(WHERE effect='refund') refunded,sum(amount_cents)FILTER(WHERE effect='charge') charged FROM saas.accounting_allocations WHERE store_id=p_store AND event_id=original.id GROUP BY receivable_id LOOP
  UPDATE saas.accounting_receivables SET collected_cents=collected_cents-coalesce(r.collected,0),discount_cents=discount_cents-coalesce(r.discounted,0),return_cents=return_cents-coalesce(r.returned,0),refunded_cents=refunded_cents-coalesce(r.refunded,0),sale_cents=sale_cents-coalesce(r.charged,0),version=version+1 WHERE store_id=p_store AND id=r.receivable_id;
  PERFORM saas.accounting_sync_order(p_store,(SELECT order_id FROM saas.accounting_receivables WHERE store_id=p_store AND id=r.receivable_id),p_now);
 END LOOP;
 FOR r IN SELECT * FROM saas.accounting_account_movements WHERE store_id=p_store AND event_id=original.id LOOP INSERT INTO saas.accounting_account_movements VALUES(p_store,event,r.account_id,-r.amount_cents);UPDATE saas.accounting_accounts SET balance_cents=balance_cents-r.amount_cents,version=version+1 WHERE store_id=p_store AND id=r.account_id;END LOOP;
 END IF;
 IF p_kind='reverse' THEN PERFORM saas.accounting_bump_customer(p_store,affected.customer_id,currency_code) FROM (SELECT DISTINCT allocated.customer_id FROM saas.accounting_allocations allocation JOIN saas.accounting_receivables allocated ON allocated.store_id=allocation.store_id AND allocated.id=allocation.receivable_id WHERE allocation.store_id=p_store AND allocation.event_id=original.id AND allocated.customer_id IS NOT NULL AND allocated.customer_id IS DISTINCT FROM customer) affected;END IF;
 PERFORM saas.accounting_bump_customer(p_store,customer,currency_code);
 END IF;
 result:=jsonb_build_object('operationId',p_operation,'replayed',false,'event',CASE WHEN p_kind='saveAccount' THEN NULL ELSE saas.accounting_event_projection(p_store,event) END,'account',CASE WHEN saas.accounting249_can_manage(p_store,p_member) THEN saas.accounting_account_projection(p_store,account_id_value) ELSE NULL END,'customerAccount',saas.accounting_customer_projection(p_store,customer,currency_code),'finance',saas.accounting_order_finance(p_store,order_id_value));
 -- Keep the exact frozen operation payload for ambiguous-commit recovery.
 INSERT INTO saas.accounting_operations VALUES(p_operation,p_store,p_member,p_kind,p_fingerprint,result,p_now);RETURN QUERY SELECT 'committed',result;
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.accounting_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'fc3611abeaa897ff62fd01bc760ac4275c299d87c92dcb6e013653380b89a356' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'v' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'ACCOUNTING249_PREDECESSOR_DRIFT:%','saas.accounting_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)';END IF;
 INSERT INTO saas.accounting249_original_functions VALUES('saas.accounting_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)',f.definition,'fc3611abeaa897ff62fd01bc760ac4275c299d87c92dcb6e013653380b89a356','f34ea324c4217a9123cac4ee3c09d387d06a92e618b65b5ecd9cc789114690d5',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='f34ea324c4217a9123cac4ee3c09d387d06a92e618b65b5ecd9cc789114690d5' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'ACCOUNTING249_POSTCONDITION:%','saas.accounting_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.accounting_get_operation(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone, p_operation uuid, p_expected_fingerprint text DEFAULT NULL::text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.accounting_operations%ROWTYPE;BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,true);IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_expected_fingerprint IS NOT NULL AND p_expected_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.accounting_operations WHERE operation_id=p_operation AND store_id=p_store AND (actor_membership_id=p_member OR saas.in_store_is_manager(p_store,p_member));
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF NOT saas.accounting249_can_manage(p_store,p_member) AND prior.kind<>'collect' THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_expected_fingerprint IS NOT NULL AND prior.payload_fingerprint<>p_expected_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('replayed',true);
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.accounting_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'590e45aa8cbaab6f6368d2c712b0eea4f1abf8608ba7507f6b973bd058892cb6' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'ACCOUNTING249_PREDECESSOR_DRIFT:%','saas.accounting_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
 INSERT INTO saas.accounting249_original_functions VALUES('saas.accounting_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',f.definition,'590e45aa8cbaab6f6368d2c712b0eea4f1abf8608ba7507f6b973bd058892cb6','14b27875426919bef2ff613f02fe2e77820a8e7318af154b9a0169e7cc201328',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='14b27875426919bef2ff613f02fe2e77820a8e7318af154b9a0169e7cc201328' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'ACCOUNTING249_POSTCONDITION:%','saas.accounting_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.merchant_admin_authority_error(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_kind text, p_mutation boolean)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$SELECT CASE WHEN p_kind='administrator_invite' AND p_mutation THEN 'permission_denied'::text WHEN p_kind IN('lucky_wheel','popup','order_bump','recovery','promotion_banner') AND NOT saas.commercial_plan_has_capability(p_plan_id,'growth_tools') THEN 'feature_not_enabled' WHEN p_kind IN('email_campaign','phone_campaign','whatsapp_campaign') AND NOT saas.commercial_plan_has_capability(p_plan_id,'email_marketing') THEN 'feature_not_enabled' WHEN p_kind IN('seo_geo_profile','seo_internal_link','seo_content_entry','seo_category_entry','seo_page_entry','seo_product_entry','indexing_request') AND NOT saas.commercial_plan_has_capability(p_plan_id,'seo_tools') THEN 'feature_not_enabled' WHEN p_kind='ai_setting' AND NOT saas.commercial_plan_has_capability(p_plan_id,'ai') THEN 'feature_not_enabled' WHEN p_kind IN('accounting_profile','invoice_integration') AND NOT saas.commercial_plan_has_capability(p_plan_id,'accounting') THEN 'feature_not_enabled' WHEN p_kind IN('accounting_profile','invoice_integration') AND EXISTS(SELECT 1 FROM saas.platform_authorized_memberships WHERE store_id=p_store_id AND id=p_membership_id AND principal_id=p_principal_id AND status='active' AND role='cashier') THEN saas.accounting_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false) ELSE ( SELECT saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog',saas.merchant_admin_required_action(p_kind,p_mutation)) ) END$function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'2306a1b5b329494df3edb816ea7b68c33f841d5e593f6d78d12c3fadd2935ae4' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'ACCOUNTING249_PREDECESSOR_DRIFT:%','saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)';END IF;
 INSERT INTO saas.accounting249_original_functions VALUES('saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)',f.definition,'2306a1b5b329494df3edb816ea7b68c33f841d5e593f6d78d12c3fadd2935ae4','71b8fd8164d49a17edbe2f7660f8a017daa70066bb15266f04d7938319820ae0',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='71b8fd8164d49a17edbe2f7660f8a017daa70066bb15266f04d7938319820ae0' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'ACCOUNTING249_POSTCONDITION:%','saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.merchant_provider_queue(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_job_id uuid, p_expected_job_version bigint, p_profile_id uuid, p_expected_profile_version bigint)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; operation saas.merchant_provider_operations%ROWTYPE;
  job saas.merchant_provider_jobs%ROWTYPE; profile saas.merchant_provider_profiles%ROWTYPE;
  expected_capability text; result jsonb;
BEGIN PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'merchant_provider_queue');
 IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL
  OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_operation_id IS NULL
  OR p_job_id IS NULL OR p_profile_id IS NULL OR p_fingerprint IS NULL
  OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_job_version<1 OR p_expected_profile_version<1
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.provider.operation:'||p_operation_id::text,0));
 SELECT * INTO operation FROM saas.merchant_provider_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF operation.store_id<>p_store_id OR operation.operation_kind<>'queue' OR operation.payload_fingerprint<>p_fingerprint
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO job FROM saas.merchant_provider_jobs WHERE store_id=p_store_id AND id=p_job_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(
  p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,job.record_kind,true
 );
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF job.record_kind='invoice_integration' AND EXISTS(SELECT 1 FROM saas.platform_authorized_memberships WHERE store_id=p_store_id AND id=p_membership_id AND principal_id=p_principal_id AND status='active' AND role='cashier') THEN
  authority_error:=saas.accounting_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
 ELSE
  authority_error:=saas.merchant_provider_profile_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
 END IF;
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF job.status<>'awaiting_provider_activation' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
 IF job.version<>p_expected_job_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 SELECT * INTO profile FROM saas.merchant_provider_profiles
 WHERE store_id=p_store_id AND id=p_profile_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'profile_not_found',NULL::jsonb; RETURN; END IF;
 IF profile.version<>p_expected_profile_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 expected_capability:=saas.merchant_provider_capability_for_kind(job.record_kind);
 IF profile.capability<>expected_capability THEN RETURN QUERY SELECT 'provider_capability_mismatch',NULL::jsonb; RETURN; END IF;
 IF profile.status<>'active' OR NOT EXISTS(
   SELECT 1 FROM saas.merchant_provider_definitions definition
   WHERE definition.provider_code=profile.provider_code AND definition.capability=profile.capability AND definition.enabled
 ) THEN RETURN QUERY SELECT 'provider_disabled',NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_provider_jobs SET
  profile_id=profile.id,provider_code=profile.provider_code,credential_version=profile.credential_version,
  plan_id=p_plan_id,plan_code=p_plan_code,plan_version=p_plan_version,
  status='queued',version=version+1,updated_at=p_now
 WHERE store_id=p_store_id AND id=p_job_id;
 result:=saas.merchant_provider_job_mutation_projection(p_store_id,p_job_id);
 INSERT INTO saas.merchant_provider_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
 VALUES(p_operation_id,p_store_id,'queue',p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'queued',result;
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.merchant_provider_queue(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'23b2a2a757b35deb247eb7508b87ada2e6a3c62fc33c4ed270e948172e3062b9' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'v' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'ACCOUNTING249_PREDECESSOR_DRIFT:%','saas.merchant_provider_queue(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)';END IF;
 INSERT INTO saas.accounting249_original_functions VALUES('saas.merchant_provider_queue(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)',f.definition,'23b2a2a757b35deb247eb7508b87ada2e6a3c62fc33c4ed270e948172e3062b9','046ef9e9e516376b727cae9bf0a0f29d7baf462853b477a418e52e24e53ac801',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='046ef9e9e516376b727cae9bf0a0f29d7baf462853b477a418e52e24e53ac801' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'ACCOUNTING249_POSTCONDITION:%','saas.merchant_provider_queue(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,bigint)';END IF;
END $patch$;
REVOKE ALL ON FUNCTION saas.accounting249_base_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.accounting249_base_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) FROM %I',r.rolname);END LOOP;END $acl$;
REVOKE ALL ON FUNCTION saas.accounting249_can_manage(uuid,uuid) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.accounting249_can_manage(uuid,uuid) FROM %I',r.rolname);END LOOP;END $acl$;
REVOKE ALL ON FUNCTION saas.accounting_access_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.accounting_access_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) FROM %I',r.rolname);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION saas.accounting_access_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.in_store_staff_projection_v5(uuid,uuid) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.in_store_staff_projection_v5(uuid,uuid) FROM %I',r.rolname);END LOOP;END $acl$;
REVOKE ALL ON FUNCTION saas.in_store_sales_list_staff_v5(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.in_store_sales_list_staff_v5(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) FROM %I',r.rolname);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION saas.in_store_sales_list_staff_v5(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.in_store_sales_recover_staff_v5(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.in_store_sales_recover_staff_v5(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text) FROM %I',r.rolname);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION saas.in_store_sales_recover_staff_v5(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.in_store_sales_set_staff_v5(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.in_store_sales_set_staff_v5(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean) FROM %I',r.rolname);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION saas.in_store_sales_set_staff_v5(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.accounting_invoice_profiles_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.accounting_invoice_profiles_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text) FROM %I',r.rolname);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION saas.accounting_invoice_profiles_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text) TO celebix_saas_app;
DO $post$BEGIN
 IF EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE can_manage_accounting) OR (SELECT count(*) FROM saas.accounting249_original_functions)<>5 THEN RAISE EXCEPTION 'ACCOUNTING249_INITIAL_STATE';END IF;
 IF saas.built_in_payment_methods_preflight() IS DISTINCT FROM true OR saas.payment_provider_keyed_lifecycle_preflight() IS DISTINCT FROM true OR saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true OR saas.quick_order_hosted_payment_authority_preflight() IS DISTINCT FROM true OR saas.shipping_provider_preflight() IS DISTINCT FROM true THEN RAISE EXCEPTION 'ACCOUNTING249_PAYMENT_PREFLIGHT';END IF;
END $post$;
COMMIT;
