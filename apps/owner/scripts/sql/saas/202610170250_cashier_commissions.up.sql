-- Optional prospective cashier commissions. No payouts, backfill, or existing function edits.
BEGIN;SET LOCAL ROLE celebix_saas_owner;SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.accounting.release250',0));
DO $pre$BEGIN
 IF to_regclass('saas.accounting249_original_functions')IS NULL OR to_regclass('saas.accounting_cashier_commission_sales')IS NOT NULL OR(SELECT count(*)FROM saas.accounting249_original_functions)<>5 THEN RAISE EXCEPTION 'COMMISSION250_PREDECESSOR';END IF;
 IF EXISTS(SELECT 1 FROM saas.accounting249_original_functions WHERE encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(signature)),'UTF8')),'hex')<>published_sha256)THEN RAISE EXCEPTION 'COMMISSION250_249_SOURCE_DRIFT';END IF;
END $pre$;
ALTER TABLE saas.in_store_staff_grants ADD COLUMN commission_enabled boolean NOT NULL DEFAULT false,ADD COLUMN commission_rate_bps integer NOT NULL DEFAULT 0,ADD CONSTRAINT in_store_commission250_rate CHECK(commission_rate_bps BETWEEN 0 AND 10000 AND(NOT commission_enabled OR commission_rate_bps>=1));
CREATE TABLE saas.accounting_cashier_commission_sales(store_id uuid NOT NULL REFERENCES saas.stores(id)ON DELETE CASCADE,sale_id uuid NOT NULL,membership_id uuid NOT NULL,original_operation_id uuid NOT NULL,order_reference_id uuid NOT NULL,receivable_id uuid NOT NULL,display_name text NOT NULL CHECK(length(display_name)BETWEEN 1 AND 200),phone_masked text CHECK(phone_masked IS NULL OR length(phone_masked)BETWEEN 1 AND 80),rate_bps integer NOT NULL CHECK(rate_bps BETWEEN 1 AND 10000),basis text NOT NULL CHECK(basis='net_product_sales'),currency text NOT NULL CHECK(currency='TRY'),merchandise_cents bigint NOT NULL CHECK(merchandise_cents BETWEEN 0 AND 9007199254740991),shipping_cents bigint NOT NULL CHECK(shipping_cents BETWEEN 0 AND 9007199254740991),completed_at timestamptz NOT NULL CHECK(isfinite(completed_at)),PRIMARY KEY(store_id,sale_id));
ALTER TABLE saas.accounting_cashier_commission_sales ENABLE ROW LEVEL SECURITY;ALTER TABLE saas.accounting_cashier_commission_sales FORCE ROW LEVEL SECURITY;
CREATE POLICY commission250_owner ON saas.accounting_cashier_commission_sales TO celebix_saas_owner USING(true)WITH CHECK(true);
REVOKE ALL ON saas.accounting_cashier_commission_sales FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON saas.accounting_cashier_commission_sales FROM %I',r.rolname);END LOOP;END $acl$;
CREATE INDEX accounting_commission250_period ON saas.accounting_cashier_commission_sales(store_id,completed_at,membership_id);
CREATE INDEX in_store_commission250_creator ON saas.in_store_operations(store_id,sale_id,committed_at,operation_id)INCLUDE(actor_membership_id)WHERE operation_kind='create';

CREATE FUNCTION saas.in_store_staff_projection_v6(p_store uuid,p_member uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT saas.in_store_staff_projection_v5(p_store,p_member)||jsonb_build_object('commissionEnabled',coalesce((SELECT commission_enabled FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member),false),'commissionRateBps',coalesce((SELECT commission_rate_bps FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member),0))
$f$;
CREATE FUNCTION saas.in_store_sales_list_staff_v6(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('staff',coalesce(jsonb_agg(saas.in_store_staff_projection_v6(p_store_id,m.id) ORDER BY m.id),'[]'::jsonb)) FROM (SELECT id FROM saas.platform_normal_memberships WHERE store_id=p_store_id AND status='active' ORDER BY id LIMIT 100) m;
END $function$;
CREATE FUNCTION saas.in_store_sales_recover_staff_v6(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text)
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
 IF prior.store_id<>p_store_id OR prior.operation_kind<>'set_staff_v6' OR prior.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('commissionEnabled',coalesce((prior.result_payload->>'commissionEnabled')::boolean,false),'commissionRateBps',coalesce((prior.result_payload->>'commissionRateBps')::integer,0),'canManageAccounting',coalesce((prior.result_payload->>'canManageAccounting')::boolean,false),'canEditPrice',coalesce((prior.result_payload->>'canEditPrice')::boolean,false),'canSellOnCredit',coalesce((prior.result_payload->>'canSellOnCredit')::boolean,false),'canCollectReceivables',coalesce((prior.result_payload->>'canCollectReceivables')::boolean,false));
END $function$;
CREATE FUNCTION saas.in_store_sales_set_staff_v6(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_target_member uuid, p_expected_version bigint, p_enabled boolean, p_locations uuid[], p_discount_limit integer, p_can_edit_price boolean, p_can_sell_on_credit boolean, p_can_collect_receivables boolean, p_can_manage_accounting boolean, p_commission_enabled boolean, p_commission_rate_bps integer)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;current_version bigint;projected jsonb;
BEGIN PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'in_store_sales_set_staff_v6');
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_target_member IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_can_edit_price IS NULL OR p_can_sell_on_credit IS NULL OR p_can_collect_receivables IS NULL OR p_can_manage_accounting IS NULL OR p_commission_enabled IS NULL OR p_commission_rate_bps IS NULL OR p_commission_rate_bps NOT BETWEEN 0 AND 10000 OR (p_commission_enabled AND p_commission_rate_bps<1) OR p_enabled IS NULL OR p_locations IS NULL OR cardinality(p_locations)>100 OR array_position(p_locations,NULL) IS NOT NULL OR p_discount_limit IS NULL OR p_discount_limit NOT BETWEEN 0 AND 9999 OR cardinality(p_locations)<>(SELECT count(DISTINCT id) FROM unnest(p_locations) id) OR (p_enabled AND cardinality(p_locations)=0) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
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
  IF prior.store_id=p_store_id AND prior.operation_kind='set_staff_v6' AND prior.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload;ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
 END IF;
 IF ((p_can_manage_accounting OR p_commission_enabled) AND NOT EXISTS(SELECT 1 FROM saas.platform_normal_memberships WHERE id=p_target_member AND store_id=p_store_id AND status='active' AND role='cashier')) OR NOT EXISTS(SELECT 1 FROM saas.platform_normal_memberships WHERE id=p_target_member AND store_id=p_store_id AND status='active' AND role IN('store_owner','admin','cashier')) OR EXISTS(SELECT 1 FROM unnest(p_locations) assigned(id) WHERE NOT EXISTS(SELECT 1 FROM saas.inventory_locations WHERE id=assigned.id AND store_id=p_store_id AND status='active')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT version INTO current_version FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_target_member FOR UPDATE;
 IF coalesce(current_version,0)<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.in_store_staff_grants(store_id,membership_id,enabled,location_ids,discount_limit_bps,version,updated_at,can_edit_price,can_collect_receivables,can_sell_on_credit,can_manage_accounting,commission_enabled,commission_rate_bps) VALUES(p_store_id,p_target_member,p_enabled,p_locations,p_discount_limit,1,p_now,p_can_edit_price,p_can_collect_receivables,p_can_sell_on_credit,p_can_manage_accounting,p_commission_enabled,p_commission_rate_bps)
 ON CONFLICT(membership_id) DO UPDATE SET commission_enabled=excluded.commission_enabled,commission_rate_bps=excluded.commission_rate_bps,can_manage_accounting=excluded.can_manage_accounting,can_collect_receivables=excluded.can_collect_receivables,can_sell_on_credit=excluded.can_sell_on_credit,can_edit_price=excluded.can_edit_price,enabled=excluded.enabled,location_ids=excluded.location_ids,discount_limit_bps=excluded.discount_limit_bps,version=saas.in_store_staff_grants.version+1,updated_at=p_now;
 projected:=saas.in_store_staff_projection_v6(p_store_id,p_target_member);
 INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,NULL,'set_staff_v6',p_fingerprint,projected,p_now);
 RETURN QUERY SELECT 'committed',projected;
END $function$;
CREATE FUNCTION saas.accounting250_commission_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE original record;grant_row saas.in_store_staff_grants%ROWTYPE;label_value text;phone_value text;BEGIN
 -- The private snapshot is append-only. A genuine store cascade may clean it up.
 IF TG_TABLE_NAME='accounting_cashier_commission_sales' THEN
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=OLD.store_id)THEN RETURN OLD;END IF;
  RAISE EXCEPTION 'COMMISSION250_IMMUTABLE';
 END IF;
 IF TG_TABLE_NAME<>'in_store_sales' OR TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'COMMISSION250_TRIGGER_CONTEXT';END IF;
 IF NEW.status<>'completed' OR OLD.status='completed' OR NEW.completed_at IS NULL OR NEW.order_id IS NULL OR NEW.abort_requested THEN RETURN NEW;END IF;
 -- Settlement of an old payment is never blocked because commission eligibility is absent.
 IF NOT EXISTS(SELECT 1 FROM saas.stores st JOIN saas.subscriptions sub ON sub.store_id=st.id JOIN saas.plans p ON p.id=sub.plan_id AND p.plan_code=sub.plan_code AND p.version=sub.plan_version WHERE st.id=NEW.store_id AND st.status='active' AND st.currency='TRY' AND sub.status='active' AND sub.valid_from<=clock_timestamp()AND(sub.valid_until IS NULL OR sub.valid_until>clock_timestamp())AND p.status='active'AND p.valid_from<=clock_timestamp()AND(p.valid_until IS NULL OR p.valid_until>clock_timestamp())AND saas.commercial_plan_has_capability(p.id,'accounting')AND saas.commercial_plan_has_capability(p.id,'cashier'))THEN RETURN NEW;END IF;
 SELECT op.actor_membership_id,op.operation_id INTO original FROM saas.in_store_operations op WHERE op.store_id=NEW.store_id AND op.sale_id=NEW.id AND op.operation_kind='create'ORDER BY op.committed_at,op.operation_id LIMIT 1;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM saas.platform_normal_memberships m WHERE m.store_id=NEW.store_id AND m.id=original.actor_membership_id AND m.role='cashier'AND m.status='active')THEN RETURN NEW;END IF;
 SELECT * INTO grant_row FROM saas.in_store_staff_grants WHERE store_id=NEW.store_id AND membership_id=original.actor_membership_id AND enabled AND commission_enabled AND commission_rate_bps BETWEEN 1 AND 10000;
 IF NOT FOUND THEN RETURN NEW;END IF;
 SELECT nullif(btrim(s.display_name),''),nullif(btrim(p.phone_masked),'')INTO label_value,phone_value FROM saas.merchant_phone_staff s LEFT JOIN saas.merchant_phone_identities p ON p.id=s.phone_id WHERE s.store_id=NEW.store_id AND s.membership_id=original.actor_membership_id;
 INSERT INTO saas.accounting_cashier_commission_sales(store_id,sale_id,membership_id,original_operation_id,order_reference_id,receivable_id,display_name,phone_masked,rate_bps,basis,currency,merchandise_cents,shipping_cents,completed_at)
 VALUES(NEW.store_id,NEW.id,original.actor_membership_id,original.operation_id,NEW.order_id,saas.inventory_deterministic_uuid('accounting','saas.accounting.receivable:'||NEW.store_id::text||':'||NEW.order_id::text),left(coalesce(label_value,'Kasiyer'),200),left(phone_value,80),grant_row.commission_rate_bps,'net_product_sales','TRY',NEW.subtotal_cents-NEW.discount_cents,NEW.shipping_cents,NEW.completed_at)
 ON CONFLICT(store_id,sale_id)DO NOTHING;
 RETURN NEW;
END $f$;
CREATE FUNCTION saas.accounting_commissions_read(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_filters jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;from_date date;to_date date;zone text;start_at timestamptz;end_at timestamptz;payload jsonb;v jsonb;BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store,p_member)THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object'OR pg_column_size(p_filters)>512 OR(SELECT count(*)FROM jsonb_object_keys(p_filters))<>2 OR NOT(p_filters?&ARRAY['dateFrom','dateTo'])OR jsonb_typeof(p_filters->'dateFrom')<>'string'OR jsonb_typeof(p_filters->'dateTo')<>'string'OR p_filters->>'dateFrom'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'OR p_filters->>'dateTo'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 BEGIN from_date:=(p_filters->>'dateFrom')::date;to_date:=(p_filters->>'dateTo')::date;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END;
 IF to_char(from_date,'YYYY-MM-DD')<>p_filters->>'dateFrom'OR to_char(to_date,'YYYY-MM-DD')<>p_filters->>'dateTo'OR to_date<from_date OR to_date-from_date>365 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 zone:=saas.accounting_timezone(p_store);IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone)THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 start_at:=from_date::timestamp AT TIME ZONE zone;end_at:=(to_date+1)::timestamp AT TIME ZONE zone;
 WITH chosen AS MATERIALIZED(SELECT s.*,coalesce(r.return_cents,0)::numeric returns_value,coalesce(r.discount_cents,0)::numeric discount_value FROM saas.accounting_cashier_commission_sales s LEFT JOIN saas.accounting_receivables r ON r.store_id=s.store_id AND r.id=s.receivable_id WHERE s.store_id=p_store AND s.completed_at>=start_at AND s.completed_at<end_at),
 adjusted AS(SELECT c.*,least(c.merchandise_cents::numeric,c.returns_value)return_value,least(greatest(c.merchandise_cents::numeric-c.returns_value,0),c.discount_value)late_discount FROM chosen c),
 per_sale AS(SELECT a.*,greatest(a.merchandise_cents::numeric-a.return_value-a.late_discount,0)eligible_value,round(greatest(a.merchandise_cents::numeric-a.return_value-a.late_discount,0)*a.rate_bps::numeric/10000)commission_value FROM adjusted a),
 totals_by_member AS(SELECT membership_id,count(*)::numeric sale_count,sum(merchandise_cents::numeric)merchandise,sum(return_value)returned,sum(late_discount)discounted,sum(eligible_value)eligible,sum(commission_value)earned FROM per_sale GROUP BY membership_id),
 current_staff AS(SELECT m.id membership_id,left(coalesce(nullif(btrim(ps.display_name),''),'Kasiyer'),200)display_name,left(nullif(btrim(pi.phone_masked),''),80)phone_masked,coalesce(g.enabled AND g.commission_enabled,false)commission_enabled,coalesce(g.commission_rate_bps,0)rate_bps FROM saas.platform_normal_memberships m LEFT JOIN saas.in_store_staff_grants g ON g.store_id=m.store_id AND g.membership_id=m.id LEFT JOIN saas.merchant_phone_staff ps ON ps.store_id=m.store_id AND ps.membership_id=m.id LEFT JOIN saas.merchant_phone_identities pi ON pi.id=ps.phone_id WHERE m.store_id=p_store AND m.status='active'AND m.role='cashier'),
 latest_snapshot AS(SELECT DISTINCT ON(membership_id)membership_id,display_name,phone_masked FROM chosen ORDER BY membership_id,completed_at DESC,sale_id DESC),
 actors AS(SELECT membership_id FROM current_staff UNION SELECT membership_id FROM latest_snapshot),
 row_values AS(SELECT a.membership_id,coalesce(cs.display_name,ls.display_name,'Kasiyer')display_name,coalesce(cs.phone_masked,ls.phone_masked)phone_masked,coalesce(cs.commission_enabled,false)enabled,coalesce(cs.rate_bps,0)rate_bps,coalesce(t.sale_count,0)sale_count,coalesce(t.merchandise,0)merchandise,coalesce(t.returned,0)returned,coalesce(t.discounted,0)discounted,coalesce(t.eligible,0)eligible,coalesce(t.earned,0)earned FROM actors a LEFT JOIN current_staff cs USING(membership_id)LEFT JOIN latest_snapshot ls USING(membership_id)LEFT JOIN totals_by_member t USING(membership_id))
 SELECT jsonb_build_object('dateFrom',p_filters->>'dateFrom','dateTo',p_filters->>'dateTo','basis','net_product_sales','currency','TRY','prospectiveOnly',true,'rows',coalesce(jsonb_agg(jsonb_build_object('membershipId',membership_id,'displayName',display_name,'phoneMasked',phone_masked,'commissionEnabled',enabled,'commissionRateBps',rate_bps,'completedSaleCount',sale_count,'merchandiseSalesCents',merchandise,'returnAdjustmentCents',returned,'collectionDiscountCents',discounted,'eligibleBaseCents',eligible,'earnedCommissionCents',earned)ORDER BY display_name,membership_id),'[]'::jsonb),'totals',jsonb_build_object('completedSaleCount',coalesce(sum(sale_count),0),'merchandiseSalesCents',coalesce(sum(merchandise),0),'returnAdjustmentCents',coalesce(sum(returned),0),'collectionDiscountCents',coalesce(sum(discounted),0),'eligibleBaseCents',coalesce(sum(eligible),0),'earnedCommissionCents',coalesce(sum(earned),0)))INTO payload FROM row_values;
 IF jsonb_array_length(payload->'rows')>1000 THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 FOR v IN SELECT value FROM jsonb_each(payload->'totals')LOOP IF v::numeric<0 OR v::numeric>9007199254740991 THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;END LOOP;
 RETURN QUERY SELECT 'found',payload;
END $f$;
CREATE TRIGGER accounting_commission250_capture AFTER UPDATE OF status ON saas.in_store_sales FOR EACH ROW WHEN(NEW.status='completed'AND OLD.status IS DISTINCT FROM NEW.status)EXECUTE FUNCTION saas.accounting250_commission_guard();
CREATE TRIGGER accounting_commission250_immutable BEFORE UPDATE OR DELETE ON saas.accounting_cashier_commission_sales FOR EACH ROW EXECUTE FUNCTION saas.accounting250_commission_guard();
REVOKE ALL ON FUNCTION saas.in_store_staff_projection_v6(uuid,uuid) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.in_store_staff_projection_v6(uuid,uuid) FROM %I',r.rolname);END LOOP;END $acl$;
REVOKE ALL ON FUNCTION saas.in_store_sales_list_staff_v6(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.in_store_sales_list_staff_v6(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) FROM %I',r.rolname);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION saas.in_store_sales_list_staff_v6(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.in_store_sales_recover_staff_v6(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.in_store_sales_recover_staff_v6(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text) FROM %I',r.rolname);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION saas.in_store_sales_recover_staff_v6(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.in_store_sales_set_staff_v6(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean,boolean,integer) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.in_store_sales_set_staff_v6(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean,boolean,integer) FROM %I',r.rolname);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION saas.in_store_sales_set_staff_v6(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,boolean,uuid[],integer,boolean,boolean,boolean,boolean,boolean,integer) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.accounting250_commission_guard() FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.accounting250_commission_guard() FROM %I',r.rolname);END LOOP;END $acl$;
REVOKE ALL ON FUNCTION saas.accounting_commissions_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb) FROM PUBLIC;
DO $acl$DECLARE r record;BEGIN FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP EXECUTE format('REVOKE ALL ON FUNCTION saas.accounting_commissions_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb) FROM %I',r.rolname);END LOOP;END $acl$;
GRANT EXECUTE ON FUNCTION saas.accounting_commissions_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb) TO celebix_saas_app;
DO $post$BEGIN IF EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE commission_enabled)OR EXISTS(SELECT 1 FROM saas.accounting_cashier_commission_sales)THEN RAISE EXCEPTION 'COMMISSION250_NO_AUTOMATIC_GRANTS_OR_BACKFILL';END IF;END $post$;
COMMIT;
