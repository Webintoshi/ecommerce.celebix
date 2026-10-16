-- Commercial packages246: additive native plan policies, owner requests and quota reservations.
-- Existing v1 entitlement projections and legacy subscriptions retain their shape and behavior.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.commercial.release246',0));
CREATE TABLE saas.commercial246_original_functions(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],function_config text[]);
CREATE TABLE saas.commercial_package_release_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),assignments_enabled boolean NOT NULL DEFAULT false);
INSERT INTO saas.commercial_package_release_state(singleton)VALUES(true);
CREATE TABLE saas.commercial_plan_policies(plan_id uuid PRIMARY KEY REFERENCES saas.plans(id),capabilities text[] NOT NULL,variant_limit bigint NOT NULL CHECK(variant_limit>0),seats_include_owner boolean NOT NULL DEFAULT true,installed_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(capabilities<@ARRAY['manual_orders','coupons','growth_tools','email_marketing','advanced_analytics','google_connections','google_merchant','seo_tools','cashier','accounting','reference_pricing','ai','custom_domains','staff_management']::text[]));
CREATE TABLE saas.commercial_upgrade_requests(id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id),principal_id uuid NOT NULL REFERENCES saas.principals(id),plan_id uuid NOT NULL REFERENCES saas.commercial_plan_policies(plan_id),operation_key text NOT NULL UNIQUE CHECK(operation_key~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX commercial_upgrade_requests_store ON saas.commercial_upgrade_requests(store_id,created_at DESC,id);
CREATE TABLE saas.commercial_order_reservations(store_id uuid NOT NULL REFERENCES saas.stores(id),reservation_key text NOT NULL,order_id uuid,month_start timestamptz NOT NULL,state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','consumed','released')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(store_id,reservation_key));
CREATE INDEX commercial_order_reservation_target ON saas.commercial_order_reservations(store_id,order_id) WHERE order_id IS NOT NULL;
DO $acl$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['commercial_package_release_state','commercial246_original_functions','commercial_plan_policies','commercial_upgrade_requests','commercial_order_reservations'] LOOP EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);EXECUTE format('CREATE POLICY commercial246_owner ON saas.%I TO celebix_saas_owner USING(true) WITH CHECK(true)',t);EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator,celebix_saas_platform_operator',t);END LOOP;END $acl$;
CREATE TRIGGER commercial_policy_immutable BEFORE UPDATE OR DELETE ON saas.commercial_plan_policies FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();
CREATE TRIGGER commercial_requests_immutable BEFORE UPDATE OR DELETE ON saas.commercial_upgrade_requests FOR EACH ROW EXECUTE FUNCTION saas.platform_append_only();

INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)VALUES('00000000-0000-4000-8000-000000000003','free_starter',2,'active','2026-10-17T00:00:00+03:00','2026-10-17T00:00:00+03:00','2026-10-17T00:00:00+03:00');
INSERT INTO saas.platform_plan_publications VALUES('00000000-0000-4000-8000-000000000003',txid_current());

INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled)VALUES('00000000-0000-4000-8000-000000000003','catalog',1,true),('00000000-0000-4000-8000-000000000003','orders',2,true),('00000000-0000-4000-8000-000000000003','customers',3,true),('00000000-0000-4000-8000-000000000003','content',4,true),('00000000-0000-4000-8000-000000000003','media',5,true),('00000000-0000-4000-8000-000000000003','analytics',6,true),('00000000-0000-4000-8000-000000000003','checkout',7,true),('00000000-0000-4000-8000-000000000003','custom_domains',8,false),('00000000-0000-4000-8000-000000000003','staff_management',9,false),('00000000-0000-4000-8000-000000000003','promotions',10,false),('00000000-0000-4000-8000-000000000003','integrations',11,true),('00000000-0000-4000-8000-000000000003','accounting',12,false),('00000000-0000-4000-8000-000000000003','marketplaces',13,false);

INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value)VALUES('00000000-0000-4000-8000-000000000003','products',1,100),('00000000-0000-4000-8000-000000000003','staff',2,1),('00000000-0000-4000-8000-000000000003','storageBytes',3,1000000000),('00000000-0000-4000-8000-000000000003','monthlyOrders',4,50),('00000000-0000-4000-8000-000000000003','customDomains',5,0);

DELETE FROM saas.platform_plan_publications WHERE plan_id='00000000-0000-4000-8000-000000000003';
INSERT INTO saas.platform_plan_prices VALUES('00000000-0000-4000-8000-000000000003',0,0);
INSERT INTO saas.commercial_plan_policies(plan_id,capabilities,variant_limit)VALUES('00000000-0000-4000-8000-000000000003',ARRAY[]::text[],500);

INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)VALUES('00000000-0000-4000-8000-000000000004','starter',1,'active','2026-10-17T00:00:00+03:00','2026-10-17T00:00:00+03:00','2026-10-17T00:00:00+03:00');
INSERT INTO saas.platform_plan_publications VALUES('00000000-0000-4000-8000-000000000004',txid_current());

INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled)VALUES('00000000-0000-4000-8000-000000000004','catalog',1,true),('00000000-0000-4000-8000-000000000004','orders',2,true),('00000000-0000-4000-8000-000000000004','customers',3,true),('00000000-0000-4000-8000-000000000004','content',4,true),('00000000-0000-4000-8000-000000000004','media',5,true),('00000000-0000-4000-8000-000000000004','analytics',6,true),('00000000-0000-4000-8000-000000000004','checkout',7,true),('00000000-0000-4000-8000-000000000004','custom_domains',8,true),('00000000-0000-4000-8000-000000000004','staff_management',9,true),('00000000-0000-4000-8000-000000000004','promotions',10,true),('00000000-0000-4000-8000-000000000004','integrations',11,true),('00000000-0000-4000-8000-000000000004','accounting',12,false),('00000000-0000-4000-8000-000000000004','marketplaces',13,true);

INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value)VALUES('00000000-0000-4000-8000-000000000004','products',1,1000),('00000000-0000-4000-8000-000000000004','staff',2,2),('00000000-0000-4000-8000-000000000004','storageBytes',3,5000000000),('00000000-0000-4000-8000-000000000004','monthlyOrders',4,1000),('00000000-0000-4000-8000-000000000004','customDomains',5,4);

DELETE FROM saas.platform_plan_publications WHERE plan_id='00000000-0000-4000-8000-000000000004';
INSERT INTO saas.platform_plan_prices VALUES('00000000-0000-4000-8000-000000000004',199000,1990000);
INSERT INTO saas.commercial_plan_policies(plan_id,capabilities,variant_limit)VALUES('00000000-0000-4000-8000-000000000004',ARRAY['manual_orders','coupons','custom_domains','staff_management','google_connections','google_merchant','seo_tools','ai']::text[],5000);

INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)VALUES('00000000-0000-4000-8000-000000000005','growth',1,'active','2026-10-17T00:00:00+03:00','2026-10-17T00:00:00+03:00','2026-10-17T00:00:00+03:00');
INSERT INTO saas.platform_plan_publications VALUES('00000000-0000-4000-8000-000000000005',txid_current());

INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled)VALUES('00000000-0000-4000-8000-000000000005','catalog',1,true),('00000000-0000-4000-8000-000000000005','orders',2,true),('00000000-0000-4000-8000-000000000005','customers',3,true),('00000000-0000-4000-8000-000000000005','content',4,true),('00000000-0000-4000-8000-000000000005','media',5,true),('00000000-0000-4000-8000-000000000005','analytics',6,true),('00000000-0000-4000-8000-000000000005','checkout',7,true),('00000000-0000-4000-8000-000000000005','custom_domains',8,true),('00000000-0000-4000-8000-000000000005','staff_management',9,true),('00000000-0000-4000-8000-000000000005','promotions',10,true),('00000000-0000-4000-8000-000000000005','integrations',11,true),('00000000-0000-4000-8000-000000000005','accounting',12,false),('00000000-0000-4000-8000-000000000005','marketplaces',13,true);

INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value)VALUES('00000000-0000-4000-8000-000000000005','products',1,5000),('00000000-0000-4000-8000-000000000005','staff',2,5),('00000000-0000-4000-8000-000000000005','storageBytes',3,20000000000),('00000000-0000-4000-8000-000000000005','monthlyOrders',4,5000),('00000000-0000-4000-8000-000000000005','customDomains',5,4);

DELETE FROM saas.platform_plan_publications WHERE plan_id='00000000-0000-4000-8000-000000000005';
INSERT INTO saas.platform_plan_prices VALUES('00000000-0000-4000-8000-000000000005',349000,3490000);
INSERT INTO saas.commercial_plan_policies(plan_id,capabilities,variant_limit)VALUES('00000000-0000-4000-8000-000000000005',ARRAY['manual_orders','coupons','custom_domains','staff_management','google_connections','google_merchant','seo_tools','ai','growth_tools','email_marketing','advanced_analytics']::text[],25000);

INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)VALUES('00000000-0000-4000-8000-000000000006','professional',1,'active','2026-10-17T00:00:00+03:00','2026-10-17T00:00:00+03:00','2026-10-17T00:00:00+03:00');
INSERT INTO saas.platform_plan_publications VALUES('00000000-0000-4000-8000-000000000006',txid_current());

INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled)VALUES('00000000-0000-4000-8000-000000000006','catalog',1,true),('00000000-0000-4000-8000-000000000006','orders',2,true),('00000000-0000-4000-8000-000000000006','customers',3,true),('00000000-0000-4000-8000-000000000006','content',4,true),('00000000-0000-4000-8000-000000000006','media',5,true),('00000000-0000-4000-8000-000000000006','analytics',6,true),('00000000-0000-4000-8000-000000000006','checkout',7,true),('00000000-0000-4000-8000-000000000006','custom_domains',8,true),('00000000-0000-4000-8000-000000000006','staff_management',9,true),('00000000-0000-4000-8000-000000000006','promotions',10,true),('00000000-0000-4000-8000-000000000006','integrations',11,true),('00000000-0000-4000-8000-000000000006','accounting',12,true),('00000000-0000-4000-8000-000000000006','marketplaces',13,true);

INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value)VALUES('00000000-0000-4000-8000-000000000006','products',1,10000),('00000000-0000-4000-8000-000000000006','staff',2,15),('00000000-0000-4000-8000-000000000006','storageBytes',3,50000000000),('00000000-0000-4000-8000-000000000006','monthlyOrders',4,20000),('00000000-0000-4000-8000-000000000006','customDomains',5,4);

DELETE FROM saas.platform_plan_publications WHERE plan_id='00000000-0000-4000-8000-000000000006';
INSERT INTO saas.platform_plan_prices VALUES('00000000-0000-4000-8000-000000000006',599000,5990000);
INSERT INTO saas.commercial_plan_policies(plan_id,capabilities,variant_limit)VALUES('00000000-0000-4000-8000-000000000006',ARRAY['manual_orders','coupons','custom_domains','staff_management','google_connections','google_merchant','seo_tools','ai','growth_tools','email_marketing','advanced_analytics','cashier','accounting','reference_pricing']::text[],50000);

CREATE FUNCTION saas.commercial_default_starter_version() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT CASE WHEN assignments_enabled THEN 2::bigint ELSE 1::bigint END FROM saas.commercial_package_release_state WHERE singleton $f$;
CREATE FUNCTION saas.commercial_plan_has_capability(p_plan uuid,p_capability text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_capability IS NULL OR NOT(p_capability=ANY(ARRAY['manual_orders','coupons','growth_tools','email_marketing','advanced_analytics','google_connections','google_merchant','seo_tools','cashier','accounting','reference_pricing','ai','custom_domains','staff_management'])) THEN false
 WHEN EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=p_plan) THEN EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=p_plan AND p_capability=ANY(capabilities))
 ELSE EXISTS(SELECT 1 FROM saas.plans WHERE id=p_plan) END
$f$;
CREATE FUNCTION saas.commercial_current_plan(p_store uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT sub.plan_id FROM saas.subscriptions sub JOIN saas.plans p ON p.id=sub.plan_id AND p.plan_code=sub.plan_code AND p.version=sub.plan_version WHERE sub.store_id=p_store AND sub.status='active' AND sub.valid_from<=clock_timestamp() AND(sub.valid_until IS NULL OR sub.valid_until>clock_timestamp()) AND p.status='active' AND p.valid_from<=clock_timestamp() AND(p.valid_until IS NULL OR p.valid_until>clock_timestamp()) LIMIT 1
$f$;
CREATE FUNCTION saas.commercial_month(p_store uuid,p_now timestamptz) RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT date_trunc('month',p_now AT TIME ZONE saas.accounting_timezone(p_store)) AT TIME ZONE saas.accounting_timezone(p_store) $f$;
CREATE FUNCTION saas.commercial_usage(p_store uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('products',(SELECT count(*) FROM saas.products WHERE store_id=p_store AND status<>'archived'),'variants',(SELECT count(*) FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id WHERE v.store_id=p_store AND v.status<>'archived' AND p.status<>'archived'),
 'staff',(SELECT count(*) FROM(SELECT 'principal:'||m.principal_id::text person FROM saas.memberships m WHERE m.store_id=p_store AND m.status='active' AND m.support_session_id IS NULL UNION SELECT CASE WHEN m.principal_id IS NOT NULL THEN 'principal:'||m.principal_id::text ELSE 'phone:'||s.phone_id::text END FROM saas.merchant_phone_staff s LEFT JOIN saas.memberships m ON m.store_id=s.store_id AND m.id=s.membership_id AND m.status='active' WHERE s.store_id=p_store AND s.enabled AND s.membership_id IS NULL) people),
 'storageBytes',(SELECT coalesce(sum(bytes),0) FROM(SELECT object_key,max(bytes) bytes FROM(SELECT object_key,byte_size bytes FROM saas.product_media WHERE store_id=p_store AND(status<>'archived' OR object_deleted_at IS NULL) UNION ALL SELECT object_key,byte_size FROM saas.store_media_operations WHERE store_id=p_store AND state IN('reserved','uploaded','cleanup_required') UNION ALL SELECT object_key,byte_size FROM saas.storefront_assets WHERE store_id=p_store) raw GROUP BY object_key) objects),
 'monthlyOrders',(SELECT count(*) FROM saas.orders WHERE store_id=p_store AND created_at>=saas.commercial_month(p_store,p_now) AND created_at<(saas.commercial_month(p_store,p_now) AT TIME ZONE saas.accounting_timezone(p_store)+interval '1 month') AT TIME ZONE saas.accounting_timezone(p_store)),
 'customDomains',(SELECT count(*) FROM(SELECT hostname FROM saas.store_domains WHERE store_id=p_store AND hostname_type='custom_domain' AND status<>'disabled' UNION SELECT normalized_hostname FROM saas.domains WHERE store_id=p_store AND domain_type='custom' AND status<>'disabled') domains))
$f$;
CREATE FUNCTION saas.commercial_request_projection(p_request uuid,p_replayed boolean DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_strip_nulls(jsonb_build_object('requestId',r.id,'storeId',r.store_id,'planId',r.plan_id,'status',CASE WHEN EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=r.store_id AND plan_id=r.plan_id AND created_at>=r.created_at) THEN 'applied' ELSE 'pending' END,'createdAt',saas.orders_json_timestamp(r.created_at),'replayed',p_replayed)) FROM saas.commercial_upgrade_requests r WHERE r.id=p_request
$f$;
CREATE FUNCTION saas.commercial_plan_read(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;r uuid;BEGIN
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN jsonb_build_object('code',e);END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=p_membership_id AND store_id=p_store_id AND principal_id=p_principal_id AND role='store_owner' AND status='active' AND support_session_id IS NULL) THEN RETURN jsonb_build_object('code','membership_denied');END IF;
 SELECT id INTO r FROM saas.commercial_upgrade_requests WHERE store_id=p_store_id ORDER BY created_at DESC,id DESC LIMIT 1;
 RETURN jsonb_strip_nulls(jsonb_build_object('plan',jsonb_build_object('planId',p_plan_id,'planCode',p_plan_code,'version',p_plan_version),'usage',saas.commercial_usage(p_store_id,p_now),'request',saas.commercial_request_projection(r)));
END $f$;
CREATE FUNCTION saas.commercial_upgrade_request(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_target_plan_id uuid,p_operation_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE access jsonb;prior saas.commercial_upgrade_requests;target_price bigint;current_price bigint;BEGIN
 access:=saas.commercial_plan_read(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);IF access?'code' THEN RETURN access;END IF;
 IF p_operation_key IS NULL OR p_operation_key!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN jsonb_build_object('code','invalid_input');END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||p_store_id,0));
 access:=saas.commercial_plan_read(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);IF access?'code' THEN RETURN access;END IF;
 SELECT * INTO prior FROM saas.commercial_upgrade_requests WHERE operation_key=p_operation_key;
 IF FOUND THEN IF prior.store_id<>p_store_id OR prior.principal_id<>p_principal_id OR prior.plan_id<>p_target_plan_id THEN RETURN jsonb_build_object('code','operation_mismatch');END IF;RETURN saas.commercial_request_projection(prior.id,true);END IF;
 SELECT price.monthly_price_cents INTO target_price FROM saas.commercial_plan_policies policy JOIN saas.plans plan ON plan.id=policy.plan_id JOIN saas.platform_plan_prices price ON price.plan_id=plan.id WHERE plan.id=p_target_plan_id AND plan.status='active';
 SELECT monthly_price_cents INTO current_price FROM saas.platform_plan_prices WHERE plan_id=p_plan_id;
 IF target_price IS NULL OR p_target_plan_id=p_plan_id OR(EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=p_plan_id) AND target_price<=coalesce(current_price,0)) THEN RETURN jsonb_build_object('code','invalid_input');END IF;
 INSERT INTO saas.commercial_upgrade_requests(id,store_id,principal_id,plan_id,operation_key)VALUES(gen_random_uuid(),p_store_id,p_principal_id,p_target_plan_id,p_operation_key) RETURNING * INTO prior;
 RETURN saas.commercial_request_projection(prior.id,false);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('code','operation_mismatch');END $f$;
CREATE FUNCTION saas.commercial_reserve_order(p_store uuid,p_key text,p_order uuid,p_now timestamptz,p_legacy_accepted boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE plan uuid;cap bigint;used bigint;month_at timestamptz;BEGIN
 plan:=saas.commercial_current_plan(p_store);IF NOT EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=plan) THEN RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||p_store,0));
 plan:=saas.commercial_current_plan(p_store);IF NOT EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=plan) THEN RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.commercial_order_reservations WHERE store_id=p_store AND reservation_key=p_key AND state IN('reserved','consumed')) THEN RETURN;END IF;
 month_at:=saas.commercial_month(p_store,p_now);SELECT effective_limit INTO cap FROM saas.plan_limits WHERE plan_id=plan AND limit_key='monthlyOrders';
 used:=(saas.commercial_usage(p_store,p_now)->>'monthlyOrders')::bigint+(SELECT count(*) FROM saas.commercial_order_reservations WHERE store_id=p_store AND state='reserved' AND month_start=month_at);
 IF NOT p_legacy_accepted AND used>=cap THEN RAISE EXCEPTION 'monthly_order_limit_reached' USING ERRCODE='P0246';END IF;
 INSERT INTO saas.commercial_order_reservations(store_id,reservation_key,order_id,month_start)VALUES(p_store,p_key,p_order,month_at)ON CONFLICT(store_id,reservation_key)DO UPDATE SET state='reserved',order_id=EXCLUDED.order_id,month_start=EXCLUDED.month_start;
END $f$;
CREATE FUNCTION saas.commercial_quota_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE sid uuid;plan uuid;usage jsonb;key text;cap bigint;value bigint;old_value bigint:=0;target uuid;reserved text;legacy boolean:=false;accepted timestamptz;BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN('products','product_variants','memberships','merchant_phone_staff','product_media','storefront_assets','store_media_operations') AND NOT saas.commercial_capacity_changed(TG_TABLE_NAME,to_jsonb(NEW),to_jsonb(OLD)) THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='orders' AND TG_OP<>'INSERT' THEN RETURN NEW;END IF;
 sid:=NEW.store_id;plan:=saas.commercial_current_plan(sid);IF NOT EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=plan) THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||sid,0));
 plan:=saas.commercial_current_plan(sid);IF NOT EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=plan) THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='orders' THEN
  IF TG_OP<>'INSERT' THEN RETURN NEW;END IF;
  SELECT reservation_key INTO reserved FROM saas.commercial_order_reservations WHERE store_id=sid AND order_id=NEW.id AND state IN('reserved','released') ORDER BY created_at LIMIT 1;
  IF reserved IS NULL THEN
   SELECT a.created_at INTO accepted FROM saas.storefront_hosted_checkout_sessions h JOIN saas.payment_attempts a ON a.id=h.payment_attempt_id AND a.store_id=h.store_id WHERE h.store_id=sid AND h.order_id=NEW.id UNION ALL SELECT a.created_at FROM saas.quick_order_hosted_payment_bridges b JOIN saas.payment_attempts a ON a.store_id=b.store_id AND a.id=b.attempt_id WHERE b.store_id=sid AND b.order_id=NEW.id LIMIT 1;
   legacy:=accepted<(SELECT valid_from FROM saas.subscriptions WHERE store_id=sid AND plan_id=plan AND status='active');
   IF NEW.source='in_store' THEN SELECT coalesce(payment_received_at,created_at) INTO accepted FROM saas.in_store_sales WHERE store_id=sid AND saas.inventory_deterministic_uuid('in-store-order',sid::text||':'||id)=NEW.id AND status IN('payment_pending','payment_received');legacy:=accepted<(SELECT valid_from FROM saas.subscriptions WHERE store_id=sid AND plan_id=plan AND status='active');END IF;
   PERFORM saas.commercial_reserve_order(sid,'order:'||NEW.id,NEW.id,clock_timestamp(),coalesce(legacy,false));reserved:='order:'||NEW.id;
  END IF;
  UPDATE saas.commercial_order_reservations SET state='consumed' WHERE store_id=sid AND reservation_key=reserved;RETURN NEW;
 ELSIF TG_TABLE_NAME='payment_attempts' OR TG_TABLE_NAME='checkout_payment_attempts' THEN
  IF TG_OP='INSERT' THEN PERFORM saas.commercial_reserve_order(sid,CASE WHEN TG_TABLE_NAME='payment_attempts' THEN 'payment:' ELSE 'checkout:' END||NEW.id,NULL,clock_timestamp());
  ELSIF NEW.status IN('failed','expired','cancelled') THEN UPDATE saas.commercial_order_reservations SET state='released' WHERE store_id=sid AND reservation_key=CASE WHEN TG_TABLE_NAME='payment_attempts' THEN 'payment:' ELSE 'checkout:' END||NEW.id AND state='reserved';END IF;RETURN NEW;
 ELSIF TG_TABLE_NAME='storefront_hosted_checkout_sessions' THEN UPDATE saas.commercial_order_reservations SET order_id=NEW.order_id WHERE store_id=sid AND reservation_key='payment:'||NEW.payment_attempt_id;RETURN NEW;
 ELSIF TG_TABLE_NAME='quick_order_hosted_payment_bridges' THEN UPDATE saas.commercial_order_reservations SET order_id=NEW.order_id WHERE store_id=sid AND reservation_key='payment:'||NEW.attempt_id;RETURN NEW;
 ELSIF TG_TABLE_NAME='in_store_sales' THEN
  IF TG_OP='INSERT' THEN IF NOT saas.commercial_plan_has_capability(plan,CASE WHEN NEW.contract_version=4 THEN 'manual_orders' ELSE 'cashier' END) THEN RAISE EXCEPTION 'feature_not_enabled' USING ERRCODE='P0246';END IF;END IF;
  IF NEW.status='payment_pending' AND(TG_OP='INSERT' OR OLD.status NOT IN('payment_pending','payment_received')) THEN IF NEW.initial_collection_cents<NEW.total_cents AND NOT saas.commercial_plan_has_capability(plan,'accounting') THEN RAISE EXCEPTION 'feature_not_enabled' USING ERRCODE='P0246';END IF;PERFORM saas.commercial_reserve_order(sid,'sale:'||NEW.id,saas.inventory_deterministic_uuid('in-store-order',sid::text||':'||NEW.id),clock_timestamp());END IF;
  IF NEW.status IN('cancelled') THEN UPDATE saas.commercial_order_reservations SET state='released' WHERE store_id=sid AND reservation_key='sale:'||NEW.id AND state='reserved';END IF;RETURN NEW;
 END IF;
 RETURN NEW;
END $f$;
CREATE FUNCTION saas.commercial_capacity_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE sid uuid;plan uuid;usage jsonb;lim bigint;old_count bigint;new_count bigint;BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN('products','product_variants','memberships','merchant_phone_staff','product_media','storefront_assets','store_media_operations') AND NOT saas.commercial_capacity_changed(TG_TABLE_NAME,to_jsonb(NEW),to_jsonb(OLD)) THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='orders' AND TG_OP<>'INSERT' THEN RETURN NEW;END IF;
 sid:=NEW.store_id;plan:=saas.commercial_current_plan(sid);IF NOT EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=plan) THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME IN('products','product_variants') THEN IF NEW.status=OLD.status OR NEW.status='archived' THEN RETURN NEW;END IF;END IF;
  IF TG_TABLE_NAME='memberships' THEN IF NEW.status<>'active' OR OLD.status='active' AND NEW.principal_id=OLD.principal_id THEN RETURN NEW;END IF;END IF;
  IF TG_TABLE_NAME='merchant_phone_staff' THEN IF NOT NEW.enabled OR OLD.enabled AND NEW.membership_id IS NOT DISTINCT FROM OLD.membership_id AND NEW.phone_id IS NOT DISTINCT FROM OLD.phone_id THEN RETURN NEW;END IF;END IF;
  IF TG_TABLE_NAME IN('product_media','storefront_assets','store_media_operations') THEN IF NEW.byte_size<=OLD.byte_size AND NEW.object_key=OLD.object_key THEN RETURN NEW;END IF;END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||sid,0));usage:=saas.commercial_usage(sid,clock_timestamp());
 IF TG_TABLE_NAME IN('products','product_variants') THEN
  SELECT effective_limit INTO lim FROM saas.plan_limits WHERE plan_id=plan AND limit_key='products';IF(usage->>'products')::bigint>lim THEN RAISE EXCEPTION 'product_limit_reached' USING ERRCODE='P0246';END IF;
  SELECT variant_limit INTO lim FROM saas.commercial_plan_policies WHERE plan_id=plan;IF(usage->>'variants')::bigint>lim THEN RAISE EXCEPTION 'variant_limit_reached' USING ERRCODE='P0246';END IF;
 ELSIF TG_TABLE_NAME IN('memberships','merchant_phone_staff') THEN
  SELECT effective_limit INTO lim FROM saas.plan_limits WHERE plan_id=plan AND limit_key='staff';IF(usage->>'staff')::bigint>lim THEN RAISE EXCEPTION 'staff_limit_reached' USING ERRCODE='P0246';END IF;
 ELSE
  SELECT effective_limit INTO lim FROM saas.plan_limits WHERE plan_id=plan AND limit_key='storageBytes';IF(usage->>'storageBytes')::bigint>lim THEN RAISE EXCEPTION 'storage_limit_reached' USING ERRCODE='P0246';END IF;
 END IF;RETURN NEW;
END $f$;
-- Acquire before row mutation; AFTER checks see this transaction's resulting usage.
CREATE FUNCTION saas.commercial_capacity_changed(p_table text,p_new jsonb,p_old jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT EXISTS(SELECT 1 FROM unnest(CASE p_table WHEN 'products' THEN ARRAY['status','store_id'] WHEN 'product_variants' THEN ARRAY['status','product_id','store_id'] WHEN 'memberships' THEN ARRAY['status','role','support_session_id','principal_id','store_id'] WHEN 'merchant_phone_staff' THEN ARRAY['enabled','membership_id','phone_id','store_id'] WHEN 'product_media' THEN ARRAY['object_key','byte_size','status','object_deleted_at','store_id'] WHEN 'storefront_assets' THEN ARRAY['object_key','byte_size','store_id'] WHEN 'store_media_operations' THEN ARRAY['state','object_key','byte_size','store_id'] ELSE ARRAY['store_id'] END) key WHERE p_new->key IS DISTINCT FROM p_old->key)
$f$;
CREATE FUNCTION saas.commercial_capacity_lock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN IF TG_OP='UPDATE' AND NOT saas.commercial_capacity_changed(TG_TABLE_NAME,to_jsonb(NEW),to_jsonb(OLD)) THEN RETURN NEW;END IF;IF EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=saas.commercial_current_plan(NEW.store_id)) THEN PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||NEW.store_id,0));END IF;RETURN NEW;END $f$;
DO $triggers$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['products','product_variants','memberships','merchant_phone_staff','product_media','store_media_operations','storefront_assets'] LOOP EXECUTE format('CREATE TRIGGER commercial246_capacity_lock BEFORE INSERT OR UPDATE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.commercial_capacity_lock()',t);EXECUTE format('CREATE TRIGGER commercial246_capacity AFTER INSERT OR UPDATE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.commercial_capacity_after()',t);END LOOP;
 FOREACH t IN ARRAY ARRAY['orders','payment_attempts','checkout_payment_attempts','storefront_hosted_checkout_sessions','quick_order_hosted_payment_bridges','in_store_sales'] LOOP EXECUTE format('CREATE TRIGGER commercial246_quota BEFORE INSERT OR UPDATE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.commercial_quota_guard()',t);END LOOP;
END $triggers$;

DO $patch$BEGIN IF to_regprocedure('saas.order_bump_settings_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.order_bump_settings_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)')),'UTF8')),'hex')<>'dadd671097d46b2fc8e0124d5591c14155f4d0e2134726d21b02033ce3efcd3b' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.order_bump_settings_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.order_bump_settings_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',pg_get_functiondef(p.oid),'dadd671097d46b2fc8e0124d5591c14155f4d0e2134726d21b02033ce3efcd3b',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.order_bump_settings_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)');END $patch$;
CREATE OR REPLACE FUNCTION saas.order_bump_settings_get(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;s saas.order_bump_settings;BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 SELECT * INTO s FROM saas.order_bump_settings WHERE store_id=p_store;
 RETURN QUERY SELECT 'ok',saas.order_bump_workspace(s);
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.seo_admin_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.seo_admin_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)')),'UTF8')),'hex')<>'2880299b55063c45b77ae025097177e64566b5c57ce49e672b62a012c63b5eca' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.seo_admin_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.seo_admin_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)',pg_get_functiondef(p.oid),'2880299b55063c45b77ae025097177e64566b5c57ce49e672b62a012c63b5eca',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.seo_admin_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.seo_admin_read(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_action text, p_request jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;settings jsonb;items jsonb;issues jsonb;check_state jsonb;run_record saas.seo_check_runs%ROWTYPE;n integer;pub integer;entries integer;lim integer;off integer;host text;sitemap_config jsonb;BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'seo_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'seo_control',false);
 IF e IS NOT NULL THEN RETURN QUERY SELECT CASE WHEN e='durable_authority_invalid' THEN 'feature_not_enabled' ELSE e END,NULL::jsonb;RETURN;END IF;
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_action NOT IN('overview','resources','settings','links','notifications') OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>4096 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_action='settings' THEN RETURN QUERY SELECT 'found',saas.seo_settings_projection(p_store_id,p_now);RETURN;END IF;
 IF p_action='links' THEN RETURN QUERY SELECT 'listed',jsonb_build_object('items',saas.seo_links_projection(p_store_id,p_now));RETURN;END IF;
 IF p_action='notifications' THEN RETURN QUERY SELECT 'listed',jsonb_build_object('items',saas.seo_notifications_projection(p_store_id));RETURN;END IF;
 IF p_action='resources' THEN
 IF p_request->>'kind' IS NOT NULL AND p_request->>'kind' NOT IN('product','category','page','blog') OR jsonb_typeof(p_request->'missing') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_request->'limit') IS DISTINCT FROM 'number' OR (p_request->>'limit')!~'^[0-9]{1,3}$' OR coalesce(p_request->>'cursor','0')!~'^[0-9]{1,9}$' OR char_length(coalesce(p_request->>'query',''))>200 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 lim:=(p_request->>'limit')::integer;off:=coalesce(p_request->>'cursor','0')::integer;IF lim NOT BETWEEN 1 AND 100 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 WITH filtered AS(SELECT * FROM saas.seo_resource_rows_scoped(p_store_id,p_now,p_request->>'kind',NULL) x WHERE (p_request->>'kind' IS NULL OR x.kind=p_request->>'kind') AND (p_request->>'query' IS NULL OR position(lower(p_request->>'query') IN lower((x.payload->>'name')||' '||(x.payload->>'path')||' '||(x.payload->>'effectiveCanonicalPath')||' '||x.id::text))>0) AND (p_request->>'missing'<>'true' OR x.payload->>'title' IS NULL OR x.payload->>'description' IS NULL)), page AS(SELECT * FROM filtered ORDER BY kind,id OFFSET off LIMIT lim)
 SELECT (SELECT count(*) FROM filtered),coalesce(jsonb_agg(payload ORDER BY kind,id),'[]'::jsonb) INTO n,items FROM page;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',items,'nextCursor',CASE WHEN off+lim<n THEN (off+lim)::text ELSE NULL END,'total',n);RETURN;END IF;
 settings:=saas.seo_settings_projection(p_store_id,p_now);host:=settings->>'hostname';
 sitemap_config:=saas.public_content_sitemap_config(p_store_id);
 WITH resources AS MATERIALIZED(SELECT * FROM saas.seo_resource_rows(p_store_id,p_now)),
 duplicate_titles AS MATERIALIZED(SELECT lower(payload->>'effectiveTitle') title FROM resources WHERE published GROUP BY lower(payload->>'effectiveTitle') HAVING count(*)>1),
 duplicate_descriptions AS MATERIALIZED(SELECT lower(payload->>'effectiveDescription') description FROM resources WHERE published AND btrim(coalesce(payload->>'effectiveDescription',''))<>'' GROUP BY lower(payload->>'effectiveDescription') HAVING count(*)>1),
 duplicate_categories AS MATERIALIZED(SELECT config->>'resourceId' resource_id FROM saas.merchant_admin_records WHERE store_id=p_store_id AND record_kind='seo_category_entry' AND status='active' GROUP BY config->>'resourceId' HAVING count(*)>1),
 sitemap_candidates AS (
 SELECT CASE WHEN r.kind='product' THEN 'products' ELSE 'content' END shard,r.payload->>'effectiveCanonicalPath' path FROM resources r WHERE r.published AND r.payload->>'allowIndex'='true'
 UNION ALL SELECT 'content','/'
 UNION ALL SELECT 'content',CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/urunler' ELSE '/products' END FROM saas.stores s WHERE s.id=p_store_id
 ),latest_run AS MATERIALIZED(SELECT id FROM saas.seo_check_runs WHERE store_id=p_store_id ORDER BY created_at DESC,id DESC LIMIT 1),
 all_issues AS MATERIALIZED(
 SELECT jsonb_build_object('code','missing_title','severity','warning','message','SEO başlığı eksik.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) issue FROM resources x WHERE x.published AND x.payload->>'title' IS NULL
 UNION ALL SELECT jsonb_build_object('code','missing_description','severity','warning','message','SEO açıklaması eksik.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) FROM resources x WHERE x.published AND x.payload->>'description' IS NULL
 UNION ALL SELECT jsonb_build_object('code','duplicate_title','severity','warning','message','SEO başlığı birden fazla içerikte kullanılıyor.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) FROM resources x WHERE x.published AND EXISTS(SELECT 1 FROM duplicate_titles d WHERE d.title=lower(x.payload->>'effectiveTitle'))
 UNION ALL SELECT jsonb_build_object('code','duplicate_description','severity','warning','message','SEO açıklaması birden fazla içerikte kullanılıyor.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) FROM resources x WHERE x.published AND btrim(coalesce(x.payload->>'effectiveDescription',''))<>'' AND EXISTS(SELECT 1 FROM duplicate_descriptions d WHERE d.description=lower(x.payload->>'effectiveDescription'))
 UNION ALL SELECT jsonb_build_object('code','legacy_seo_conflict','severity','warning','message','Bu kategori için birden fazla etkin SEO kaydı var.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind=category&resourceId='||x.id::text) FROM resources x WHERE x.kind='category' AND EXISTS(SELECT 1 FROM duplicate_categories d WHERE d.resource_id=x.id::text)
 UNION ALL SELECT jsonb_build_object('code','legacy_seo_conflict','severity','warning','message',CASE l.reason
 WHEN 'native_metadata_retained' THEN 'Mevcut SEO alanları korundu; önceki kaydı kontrol edin.'
 WHEN 'native_options_retained' THEN 'Mevcut kanonik adres ve indeksleme tercihi korundu.'
 WHEN 'missing_resource' THEN 'Önceki SEO kaydının hedef içeriği bulunamadı.'
 WHEN 'missing_or_foreign_resource' THEN 'Önceki SEO kaydı bu mağazada yayımlanmış bir içerikle eşleşmiyor.'
 WHEN 'ambiguous_metadata' THEN 'Aynı içerik için birden fazla etkin SEO kaydı var.'
 WHEN 'metadata_exceeds_native_limit' THEN 'Önceki SEO alanı izin verilen uzunluğu aşıyor.'
 WHEN 'invalid_canonical' THEN 'Önceki kanonik adres bu mağazada yayımlanmış bir içerikle eşleşmiyor.'
 WHEN 'native_options_retained' THEN 'Mevcut kanonik adres ve indeksleme tercihi korundu.'
 WHEN 'ambiguous_or_unpublished_link_target' THEN 'Önceki bağlantı bu mağazada yayımlanmış tek bir içerikle eşleşmiyor.'
 WHEN 'duplicate_link' THEN 'Aynı içerikler arasında birden fazla bağlantı kaydı var.'
 WHEN 'self_link' THEN 'Önceki bağlantının kaynak ve hedef içeriği aynı.'
 WHEN 'link_limit' THEN 'Önceki bağlantı, mağazanın bağlantı sınırını aşıyor.'
 ELSE 'Önceki SEO kaydını kontrol edin; bazı alanları otomatik uygulanamadı.' END,'path',NULL,'kind',l.resource_kind,'resourceId',l.resource_id,'fixHref',CASE WHEN l.resource_kind IS NULL OR l.resource_id IS NULL THEN '/seo?tab=checks' ELSE '/seo/content?kind='||l.resource_kind||'&resourceId='||l.resource_id::text END) FROM saas.seo_legacy_reconciliation l WHERE l.store_id=p_store_id AND l.outcome='conflict'
 UNION ALL SELECT jsonb_build_object('code','invalid_canonical','severity','error','message','Kanonik adres mağazada yayımlanmış bir içerikle eşleşmiyor.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) FROM resources x WHERE x.payload->>'canonicalPath' IS NOT NULL AND x.payload->>'canonicalPath' IS DISTINCT FROM x.payload->>'effectiveCanonicalPath'
 UNION ALL SELECT jsonb_build_object('code','invalid_canonical','severity','error','message','Önceki kategori kanonik adresi mağazada yayımlanmış bir içerikle eşleşmiyor.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind=category&resourceId='||x.id::text) FROM resources x WHERE x.kind='category' AND EXISTS(SELECT 1 FROM saas.merchant_admin_records legacy WHERE legacy.store_id=p_store_id AND legacy.record_kind='seo_category_entry' AND legacy.status='active' AND legacy.config->>'resourceId'=x.id::text AND legacy.config->>'canonicalPath' IS NOT NULL AND saas.seo_canonical_owned(p_store_id,p_now,legacy.config->>'canonicalPath',x.kind,x.id) IS DISTINCT FROM true)
 UNION ALL SELECT jsonb_build_object('code','domain_required','severity','warning','message','Doğrulanmış birincil alan adı gerekli.','path',NULL,'kind',NULL,'resourceId',NULL,'fixHref','/seo/settings') WHERE host IS NULL
 UNION ALL SELECT jsonb_build_object('code','indexing_disabled','severity','warning','message','Arama motoru indekslemesi kapalı.','path',NULL,'kind',NULL,'resourceId',NULL,'fixHref','/seo/settings') WHERE settings->>'allowIndex'<>'true'
 UNION ALL SELECT issue.value FROM saas.seo_check_urls u CROSS JOIN LATERAL jsonb_array_elements(u.issues) issue WHERE u.store_id=p_store_id AND u.run_id=(SELECT id FROM latest_run)

 UNION ALL SELECT jsonb_build_object('code','live_check_failed','severity','error','message',CASE u.error
 WHEN 'transport_unavailable' THEN 'Bu adresin yayımlanmış sayfasına ulaşılamadı. Kontrolü yeniden deneyin.'
 WHEN 'host_ineligible' THEN 'Bu adresin alan adı artık doğrulanmış birincil mağaza alan adı değil.'
 WHEN 'retry_limit' THEN 'Bu adresin kontrolü tamamlanamadı. Kontrolü yeniden başlatın.'
 WHEN 'acceptance_cancelled' THEN 'Bu adresin kontrolü iptal edildi. Kontrolü yeniden başlatın.'
 ELSE 'Bu adresin kontrolü tamamlanamadı. Kontrolü yeniden deneyin.' END,'path',u.path,'kind',u.kind,'resourceId',u.resource_id,'fixHref',CASE WHEN u.kind IS NULL OR u.resource_id IS NULL THEN '/seo?tab=checks' ELSE '/seo/content?kind='||u.kind||'&resourceId='||u.resource_id::text END)
 FROM saas.seo_check_urls u WHERE u.store_id=p_store_id AND u.run_id=(SELECT id FROM latest_run) AND u.status='failed' AND u.error IS NOT NULL
 UNION ALL SELECT jsonb_build_object('code','broken_link','severity','error','message','Etkin bağlantının kaynak veya hedef içeriği bulunamıyor ya da yayımlanmamış.','path',src.payload->>'path','kind',l.source_kind,'resourceId',l.source_id,'fixHref','/seo?tab=links')
 FROM saas.seo_links l LEFT JOIN resources src ON src.kind=l.source_kind AND src.id=l.source_id LEFT JOIN resources dst ON dst.kind=l.target_kind AND dst.id=l.target_id
 WHERE l.store_id=p_store_id AND l.enabled AND (src.id IS NULL OR NOT src.published OR dst.id IS NULL OR NOT dst.published)
 ), selected_issues AS (
 SELECT issue,CASE
 WHEN issue->>'code' IN('domain_required','indexing_disabled') THEN 0
 WHEN issue->>'code'='invalid_canonical' THEN 1
 WHEN issue->>'code'='broken_link' THEN 2
 WHEN issue->>'severity'='error' THEN 3
 WHEN issue->>'code' IN('missing_title','missing_description') THEN 5 ELSE 4 END priority
 FROM all_issues ORDER BY priority,issue->>'code',issue->>'path',issue->>'kind',issue->>'resourceId' LIMIT 200
 )
SELECT (SELECT count(*) FROM resources),(SELECT count(*) FROM resources WHERE published),
 (SELECT count(*) FROM (SELECT shard,path FROM sitemap_candidates WHERE saas.seo_path_valid(path) AND (shard='products' AND sitemap_config->>'includeProducts'='true' OR shard='content' AND sitemap_config->>'includeContent'='true') GROUP BY shard,path) sitemap_entries),
(SELECT coalesce(jsonb_agg(issue ORDER BY priority,issue->>'code',issue->>'path',issue->>'kind',issue->>'resourceId'),'[]'::jsonb) FROM selected_issues) INTO n,pub,entries,issues;
 SELECT * INTO run_record FROM saas.seo_check_runs WHERE store_id=p_store_id ORDER BY created_at DESC,id DESC LIMIT 1;
 check_state:=jsonb_build_object('checked',coalesce(run_record.checked,0),'total',coalesce(run_record.total,0),'status',coalesce(run_record.status,'idle'),'lastCheckedAt',saas.merchant_admin_timestamp(run_record.last_checked_at));
 RETURN QUERY SELECT 'found',jsonb_build_object('totalResources',n,'publishedResources',pub,'issues',issues,'sitemap',jsonb_build_object('url',CASE WHEN host IS NULL THEN NULL ELSE 'https://'||host||'/sitemap.xml' END,'robotsUrl',CASE WHEN host IS NULL THEN NULL ELSE 'https://'||host||'/robots.txt' END,'entryCount',CASE WHEN host IS NOT NULL AND settings->>'allowIndex'='true' THEN entries ELSE 0 END),'check',check_state,'notifications',saas.seo_notifications_projection(p_store_id),'settings',settings);
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_reference_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_reference_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)')),'UTF8')),'hex')<>'3dfbc4ed34e479d1f3ddf9d21e5cd69df5c2f5a701c5e4a4e278bf9b03fc1ace' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_reference_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_reference_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',pg_get_functiondef(p.oid),'3dfbc4ed34e479d1f3ddf9d21e5cd69df5c2f5a701c5e4a4e278bf9b03fc1ace',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_reference_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_reference_get(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_set_id uuid)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; selected_id uuid; projected jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  selected_id:=p_set_id;
  IF selected_id IS NULL THEN SELECT state.active_set_id INTO selected_id
    FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id; END IF;
  projected:=saas.pricing_reference_set_projection(p_store_id,selected_id);
  RETURN QUERY SELECT CASE WHEN projected IS NULL THEN 'not_found' ELSE 'found' END,projected;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.store_engagement_campaign_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.store_engagement_campaign_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)')),'UTF8')),'hex')<>'6d2fccbc99c8c372471680a83707e9aaeb813dfecb7fa1373b9e457cdce72f4a' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.store_engagement_campaign_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.store_engagement_campaign_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',pg_get_functiondef(p.oid),'6d2fccbc99c8c372471680a83707e9aaeb813dfecb7fa1373b9e457cdce72f4a',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.store_engagement_campaign_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)');END $patch$;
CREATE OR REPLACE FUNCTION saas.store_engagement_campaign_list(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text; BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'ok',coalesce(jsonb_agg(saas.store_engagement_projection(c) ORDER BY c.kind,c.created_at,c.id),'[]'::jsonb) FROM saas.store_engagement_campaigns c WHERE c.store_id=p_store;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.email_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.email_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)')),'UTF8')),'hex')<>'96062e6e7a26e55d05f80cf45352d69821632cc2cbacd11a532fff7796dd852c' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.email_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.email_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)',pg_get_functiondef(p.oid),'96062e6e7a26e55d05f80cf45352d69821632cc2cbacd11a532fff7796dd852c',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.email_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.email_marketing_command(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_action text, p_input jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE moment timestamptz:=clock_timestamp();err text;op saas.email_marketing_operations;c saas.email_marketing_connections;candidate saas.email_marketing_candidates;oid uuid;token uuid;projection jsonb;current_version bigint;kind text;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan,'email_marketing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 IF p_now IS NULL OR NOT isfinite(p_now) OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR length(p_input::text)>16384 OR p_action NOT IN('overview','candidate_provider','candidate','lists','preview','claim','checkpoint','finalize','fail','private') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Recheck current database time at every write, including after external IO.
 err:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,moment,'integrations',CASE WHEN p_action='overview' THEN 'integrations.read' ELSE 'integrations.manage' END);
 IF err IS NOT NULL OR NOT saas.platform_membership_is_authorized(p_membership) THEN RETURN QUERY SELECT 'forbidden',NULL::jsonb;RETURN;END IF;
 IF p_action='overview' THEN
  RETURN QUERY SELECT 'found',jsonb_build_object('configured',true,'connections',coalesce((SELECT jsonb_agg(saas.email_marketing_projection(p_store,id) ORDER BY created_at DESC) FROM (SELECT id,created_at FROM saas.email_marketing_connections WHERE store_id=p_store ORDER BY created_at DESC LIMIT 20) recent),'[]'::jsonb),'sync',jsonb_build_object('queued',(SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE store_id=p_store AND status IN('queued','running') AND phase='queued'),'verified',(SELECT count(*) FROM saas.email_marketing_contacts WHERE store_id=p_store AND state='verified'),'blocked',(SELECT count(*) FROM saas.email_marketing_contacts WHERE store_id=p_store AND state='blocked'),'failed',(SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE store_id=p_store AND status IN('failed','attention')),'pendingVerification',(SELECT count(*) FROM saas.email_marketing_sync_jobs WHERE store_id=p_store AND phase IN('accepted','unknown','dispatched') AND status NOT IN('verified','blocked')),'asOf',saas.orders_json_timestamp(moment),'suppressionCheckedAt',(SELECT saas.orders_json_timestamp(max(suppression_checked_at)) FROM saas.email_marketing_connections WHERE store_id=p_store)));
  RETURN;
 END IF;
 IF p_action='private' THEN SELECT * INTO c FROM saas.email_marketing_connections WHERE store_id=p_store AND status<>'disconnected';IF NOT FOUND THEN RETURN QUERY SELECT 'not_configured',NULL::jsonb;RETURN;END IF;RETURN QUERY SELECT 'found',jsonb_build_object('connection',saas.email_marketing_projection(p_store,c.id),'credential',c.credential);RETURN;END IF;
 IF p_action='candidate_provider' THEN
  -- Rollout gating reads only provider identity. Consumed/expired metadata must
  -- remain readable for the original request's replay; no key or grant is read.
  SELECT * INTO candidate FROM saas.email_marketing_candidates WHERE id=(p_input->>'candidateId')::uuid AND store_id=p_store AND principal_id=p_principal AND membership_id=p_membership AND session_hash=p_input->>'sessionHash';
  IF NOT FOUND THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT 'found',jsonb_build_object('provider',candidate.provider);RETURN;
 END IF;
 IF p_action IN('candidate','lists','preview') THEN
  SELECT * INTO candidate FROM saas.email_marketing_candidates WHERE id=(p_input->>'candidateId')::uuid AND store_id=p_store AND principal_id=p_principal AND membership_id=p_membership AND session_hash=p_input->>'sessionHash';
  -- Expired discovery is never usable for a new intent. Only the original leased
  -- apply may read the retained key to reconcile its already-dispatched list.
  IF NOT FOUND OR candidate.consumed_at IS NOT NULL OR candidate.credential IS NULL OR candidate.account_id IS NULL OR
    (candidate.expires_at<=moment AND NOT (p_action='candidate' AND EXISTS(
      SELECT 1 FROM saas.email_marketing_operations recovery WHERE recovery.id=(p_input->>'operationId')::uuid
      AND recovery.candidate_id=candidate.id AND recovery.store_id=p_store AND recovery.principal_id=p_principal AND recovery.membership_id=p_membership
      AND recovery.kind='apply' AND recovery.phase<>'complete' AND recovery.created_at<candidate.expires_at
      AND recovery.progress->>'listCreateDispatched'='true' AND recovery.progress->'selection'->>'kind'='create'
      AND recovery.lease_token::text=p_input->>'leaseToken' AND recovery.lease_until>moment
    ))) THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;
  IF p_action='candidate' THEN RETURN QUERY SELECT 'found',jsonb_build_object('candidate',saas.email_marketing_candidate_projection(p_store,candidate.id),'credential',candidate.credential,'credentialVersion',candidate.credential_version,'lists',candidate.lists);RETURN;END IF;
  IF p_action='preview' THEN RETURN QUERY SELECT 'found',saas.email_marketing_preview(p_store,candidate.provider,moment);RETURN;END IF;
  -- Only validated server results are persisted by the lists checkpoint command.
  RETURN QUERY SELECT 'found',candidate.lists;RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('email.marketing:'||p_store::text,0));
 IF p_action='claim' THEN
  oid:=(p_input->>'operationId')::uuid;kind:=p_input->>'kind';
  IF kind NOT IN('validate','apply','rotate','recheck','sync','disconnect') OR p_input->>'fingerprint'!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF p_input?'fingerprints' AND(jsonb_typeof(p_input->'fingerprints') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'fingerprints') NOT BETWEEN 1 AND 16 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'fingerprints') f WHERE jsonb_typeof(f) IS DISTINCT FROM 'string' OR (f#>>'{}')!~'^[a-f0-9]{64}$') OR NOT (p_input->'fingerprints'?(p_input->>'fingerprint'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT * INTO op FROM saas.email_marketing_operations WHERE id=oid FOR UPDATE;
  IF FOUND THEN
   IF op.store_id<>p_store OR op.principal_id<>p_principal OR op.membership_id<>p_membership OR op.kind<>kind OR op.fingerprint IS DISTINCT FROM p_input->>'fingerprint' AND NOT coalesce(p_input->'fingerprints'?op.fingerprint,false) THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb;RETURN;END IF;
   IF op.phase='complete' THEN RETURN QUERY SELECT 'replayed',op.result_payload;RETURN;END IF;
   IF op.lease_until>moment THEN RETURN QUERY SELECT 'cleanup_pending',NULL::jsonb;RETURN;END IF;
   token:=gen_random_uuid();PERFORM saas.platform_support_begin(p_store,p_principal,p_membership,'email_marketing_command.claim');UPDATE saas.email_marketing_operations SET lease_token=token,lease_until=moment+interval '2 minutes' WHERE id=oid;
   RETURN QUERY SELECT 'claimed',jsonb_build_object('leaseToken',token,'phase',op.phase,'progress',op.progress,'candidateId',op.candidate_id,'connectionId',op.connection_id);RETURN;
  END IF;
  SELECT * INTO c FROM saas.email_marketing_connections WHERE store_id=p_store AND status<>'disconnected' FOR UPDATE;current_version:=coalesce(c.version,0);
  IF kind<>'validate' AND (p_input->>'expectedVersion')::bigint IS DISTINCT FROM current_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF kind='apply' AND c.id IS NOT NULL THEN RETURN QUERY SELECT 'cleanup_pending',NULL::jsonb;RETURN;END IF;
  IF kind IN('rotate','recheck','sync','disconnect') AND c.id IS NULL THEN RETURN QUERY SELECT 'not_configured',NULL::jsonb;RETURN;END IF;
  IF kind='sync' AND(c.status<>'connected' OR EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs pending WHERE pending.connection_id=c.id AND pending.kind IN('bootstrap','profile','subscribe') AND(pending.status IN('queued','running','attention') OR pending.phase<>'queued' AND pending.status<>'verified'))) THEN RETURN QUERY SELECT 'cleanup_pending',NULL::jsonb;RETURN;END IF;
  PERFORM saas.platform_support_begin(p_store,p_principal,p_membership,'email_marketing_command.claim');
  IF kind='validate' THEN
   INSERT INTO saas.email_marketing_candidates(id,store_id,principal_id,membership_id,session_hash,provider,credential,created_at,expires_at) VALUES((p_input->>'candidateId')::uuid,p_store,p_principal,p_membership,p_input->>'sessionHash',p_input->>'provider',p_input->'credential',moment,moment+interval '15 minutes');
  ELSIF kind IN('apply','rotate') THEN
   SELECT * INTO candidate FROM saas.email_marketing_candidates WHERE id=(p_input->>'candidateId')::uuid AND store_id=p_store AND principal_id=p_principal AND membership_id=p_membership AND session_hash=p_input->>'sessionHash' FOR UPDATE;
   IF NOT FOUND OR candidate.consumed_at IS NOT NULL OR candidate.expires_at<=moment OR candidate.account_id IS NULL THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;
   IF kind='apply' AND candidate.provider='brevo' AND p_input->'progress'->'selection'->>'kind' IS DISTINCT FROM 'create' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   IF kind='rotate' AND (candidate.account_id IS DISTINCT FROM c.account_id OR candidate.provider IS DISTINCT FROM c.provider) THEN RETURN QUERY SELECT 'account_mismatch',NULL::jsonb;RETURN;END IF;
   IF EXISTS(SELECT 1 FROM saas.email_marketing_connections WHERE provider=candidate.provider AND account_id=candidate.account_id AND status<>'disconnected' AND store_id<>p_store) THEN RETURN QUERY SELECT 'account_in_use',NULL::jsonb;RETURN;END IF;
  END IF;
  token:=gen_random_uuid();INSERT INTO saas.email_marketing_operations(id,store_id,principal_id,membership_id,kind,fingerprint,expected_version,candidate_id,connection_id,phase,lease_token,lease_until,progress) VALUES(oid,p_store,p_principal,p_membership,kind,p_input->>'fingerprint',coalesce((p_input->>'expectedVersion')::bigint,0),CASE WHEN kind IN('validate','apply','rotate') THEN (p_input->>'candidateId')::uuid ELSE NULL END,coalesce(c.id,(p_input->>'connectionId')::uuid),'claimed',token,moment+interval '2 minutes',coalesce(p_input->'progress','{}'));
  RETURN QUERY SELECT 'claimed',jsonb_build_object('leaseToken',token,'phase','claimed','progress',coalesce(p_input->'progress','{}'),'candidateId',(p_input->>'candidateId')::uuid,'connectionId',coalesce(c.id,(p_input->>'connectionId')::uuid));RETURN;
 END IF;
 oid:=(p_input->>'operationId')::uuid;SELECT * INTO op FROM saas.email_marketing_operations WHERE id=oid FOR UPDATE;
 IF NOT FOUND OR op.store_id<>p_store OR op.principal_id<>p_principal OR op.membership_id<>p_membership OR op.lease_token::text IS DISTINCT FROM p_input->>'leaseToken' THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb;RETURN;END IF;
 IF op.phase='complete' AND p_action='finalize' THEN RETURN QUERY SELECT 'replayed',op.result_payload;RETURN;END IF;
 IF op.phase='complete' THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb;RETURN;END IF;
 IF op.lease_until IS NULL OR op.lease_until<=moment THEN RETURN QUERY SELECT 'cleanup_pending',NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store,p_principal,p_membership,'email_marketing_command.'||p_action);
 IF p_action='fail' THEN
  IF op.kind='apply' AND op.phase='dispatched' AND op.progress->>'listCreateDispatched'='true' AND op.progress->>'listId' IS NULL AND p_input->>'effectNotApplied'='true' THEN
   UPDATE saas.email_marketing_operations SET phase='retryable',progress=progress-'listCreateDispatched'-'priorListIds',error_code=p_input->>'errorCode',lease_until=NULL WHERE id=oid;RETURN QUERY SELECT 'saved',NULL::jsonb;RETURN;
  END IF;
  UPDATE saas.email_marketing_operations SET phase=CASE WHEN phase='dispatched' THEN 'unknown' ELSE 'retryable' END,error_code=p_input->>'errorCode',lease_until=NULL WHERE id=oid;RETURN QUERY SELECT 'saved',NULL::jsonb;RETURN;
 END IF;
 IF p_action='checkpoint' THEN
  IF jsonb_typeof(p_input->'progress') IS DISTINCT FROM 'object' OR length((p_input->'progress')::text)>8192 OR (p_input->'progress')-ARRAY['listId','listName','priorListIds','listCreateDispatched','selection','account','lists','cursor','createUnknown']<>'{}' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF op.progress->>'listCreateDispatched'='true' AND p_input->'progress'->>'listCreateDispatched' IS DISTINCT FROM 'true' THEN RETURN QUERY SELECT 'operation_conflict',NULL::jsonb;RETURN;END IF;
  IF p_input->>'dispatched'='true' AND op.kind='apply' AND op.progress->>'listCreateDispatched' IS DISTINCT FROM 'true' THEN
    SELECT * INTO candidate FROM saas.email_marketing_candidates WHERE id=op.candidate_id AND store_id=p_store FOR UPDATE;
    IF NOT FOUND OR candidate.expires_at<=moment OR candidate.credential IS NULL OR candidate.consumed_at IS NOT NULL THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;
  END IF;
  UPDATE saas.email_marketing_operations SET progress=p_input->'progress',phase=CASE WHEN p_input->>'dispatched'='true' THEN 'dispatched' ELSE phase END,lease_until=moment+interval '2 minutes',updated_at=moment WHERE id=oid;RETURN QUERY SELECT 'saved',NULL::jsonb;RETURN;
 END IF;
 SELECT * INTO c FROM saas.email_marketing_connections WHERE store_id=p_store AND id=op.connection_id FOR UPDATE;
 IF op.kind='validate' THEN
  UPDATE saas.email_marketing_candidates SET account_id=p_input->'account'->>'id',account_name=p_input->'account'->>'name',sender_status=p_input->'account'->>'senderStatus',lists=coalesce(p_input->'lists','[]') WHERE id=op.candidate_id AND store_id=p_store AND expires_at>moment;
  IF NOT FOUND THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;projection:=saas.email_marketing_candidate_projection(p_store,op.candidate_id);
 ELSIF op.kind IN('apply','rotate') THEN
  SELECT * INTO candidate FROM saas.email_marketing_candidates WHERE id=op.candidate_id AND store_id=p_store AND principal_id=p_principal AND membership_id=p_membership FOR UPDATE;
  IF NOT FOUND OR candidate.consumed_at IS NOT NULL OR candidate.credential IS NULL OR
    (candidate.expires_at<=moment AND NOT (op.kind='apply' AND op.created_at<candidate.expires_at AND op.progress->>'listCreateDispatched'='true' AND op.progress->'selection'->>'kind'='create'))
    THEN RETURN QUERY SELECT 'candidate_expired',NULL::jsonb;RETURN;END IF;
  IF coalesce(c.version,0)<>op.expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF op.kind='apply' THEN
   INSERT INTO saas.email_marketing_connections(id,store_id,provider,account_id,account_name,list_id,list_name,status,sender_status,credential,last_checked_at) VALUES(op.connection_id,p_store,candidate.provider,candidate.account_id,candidate.account_name,p_input->'list'->>'id',p_input->'list'->>'name','connected',candidate.sender_status,p_input->'credential',moment);
  ELSE
   IF c.account_id IS DISTINCT FROM candidate.account_id OR c.provider IS DISTINCT FROM candidate.provider THEN RETURN QUERY SELECT 'account_mismatch',NULL::jsonb;RETURN;END IF;
   UPDATE saas.email_marketing_connections SET credential=p_input->'credential',credential_version=credential_version+1,version=version+1,last_checked_at=moment,status=CASE WHEN status='needs_reconnect' THEN 'connected' ELSE status END,error_code=NULL WHERE id=c.id AND store_id=p_store;
   UPDATE saas.email_marketing_sync_jobs SET status='queued',available_at=moment,updated_at=moment WHERE connection_id=c.id AND phase='queued' AND status='blocked' AND error_code='credential_rejected';
  END IF;
  UPDATE saas.email_marketing_candidates SET consumed_at=moment,credential=NULL WHERE id=candidate.id;projection:=saas.email_marketing_projection(p_store,op.connection_id);
 ELSIF op.kind='sync' THEN
  IF c.version<>op.expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF c.status<>'connected' OR EXISTS(SELECT 1 FROM saas.email_marketing_sync_jobs pending WHERE pending.connection_id=c.id AND pending.kind IN('bootstrap','profile','subscribe') AND(pending.status IN('queued','running','attention') OR pending.phase<>'queued' AND pending.status<>'verified')) THEN RETURN QUERY SELECT 'cleanup_pending',NULL::jsonb;RETURN;END IF;
  UPDATE saas.email_marketing_connections SET version=version+1,export_sequence=export_sequence+1,updated_at=moment WHERE id=c.id;
  PERFORM saas.email_marketing_request_sync(c.id,c.export_sequence+1,moment);
  projection:=saas.email_marketing_projection(p_store,c.id);
 ELSIF op.kind='disconnect' THEN
  IF c.version<>op.expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  UPDATE saas.email_marketing_connections SET status='draining',version=version+1,generation=generation+1,updated_at=moment WHERE id=c.id;
  INSERT INTO saas.email_marketing_sync_jobs(store_id,connection_id,generation,credential_version,kind) SELECT store_id,id,generation,credential_version,'cleanup' FROM saas.email_marketing_connections WHERE id=c.id;
  projection:=saas.email_marketing_projection(p_store,c.id);
 ELSIF op.kind='recheck' THEN
  IF c.version<>op.expected_version OR c.account_id IS DISTINCT FROM p_input->'account'->>'id' THEN RETURN QUERY SELECT 'account_mismatch',NULL::jsonb;RETURN;END IF;
  UPDATE saas.email_marketing_connections SET last_checked_at=moment,sender_status=p_input->'account'->>'senderStatus',version=version+1,status=CASE WHEN status='needs_reconnect' THEN 'connected' ELSE status END,error_code=NULL WHERE id=c.id;
  UPDATE saas.email_marketing_sync_jobs SET status='queued',available_at=moment,updated_at=moment WHERE connection_id=c.id AND phase='queued' AND status='blocked' AND error_code='credential_rejected';
  projection:=saas.email_marketing_projection(p_store,c.id);
 END IF;
 UPDATE saas.email_marketing_operations SET phase='complete',result_payload=projection,lease_until=NULL,updated_at=moment WHERE id=oid;RETURN QUERY SELECT 'saved',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'account_in_use',NULL::jsonb;
 WHEN invalid_text_representation OR check_violation OR not_null_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.google_merchant_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.google_merchant_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)')),'UTF8')),'hex')<>'b2ccce258bf33c697f4b5c64b9416de481f7271424355e5d42dcc3d20692f02f' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.google_merchant_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.google_merchant_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)',pg_get_functiondef(p.oid),'b2ccce258bf33c697f4b5c64b9416de481f7271424355e5d42dcc3d20692f02f',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.google_merchant_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.google_merchant_command(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_action text, p_input jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE result record;err text;current_version bigint;operation saas.google_merchant_operations;op uuid;payload jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'google_merchant') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 IF p_action IS DISTINCT FROM 'identity' THEN
  IF p_action='overview' AND p_input?'includeIdentity' AND(jsonb_typeof(p_input->'includeIdentity') IS DISTINCT FROM 'boolean' OR p_input-ARRAY['includeIdentity']<>'{}') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT * INTO result FROM saas.google_merchant_command_before_retail_identity(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_action,p_input-'includeIdentity');
  RETURN QUERY SELECT result.outcome::text,CASE WHEN p_action='overview' AND result.outcome='found' AND p_input->>'includeIdentity'='true' THEN result.result_payload||jsonb_build_object('identityProfile',saas.google_merchant_identity_profile(p_store_id)) ELSE result.result_payload END;RETURN;
 END IF;
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','integrations.manage');
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.platform_membership_is_authorized(p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_now IS NULL OR NOT isfinite(p_now) OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR NOT(p_input?&ARRAY['operationId','fingerprint','ownBrand','brandName','expectedVersion']) OR p_input-ARRAY['operationId','fingerprint','ownBrand','brandName','expectedVersion']<>'{}'
  OR jsonb_typeof(p_input->'operationId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'fingerprint') IS DISTINCT FROM 'string' OR p_input->>'operationId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR p_input->>'fingerprint'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(p_input->'ownBrand') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'expectedVersion') IS DISTINCT FROM 'number' OR p_input->>'expectedVersion'!~'^[0-9]{1,16}$' OR(p_input->>'expectedVersion')::numeric>9007199254740991
  OR(CASE WHEN p_input->>'ownBrand'='true' THEN jsonb_typeof(p_input->'brandName') IS DISTINCT FROM 'string' OR p_input->>'brandName'<>btrim(p_input->>'brandName') OR length(p_input->>'brandName') NOT BETWEEN 1 AND 70 OR p_input->>'brandName'~'[<>[:cntrl:]]' ELSE p_input->'brandName'<>'null'::jsonb END)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.store_domains WHERE store_id=p_store_id AND is_primary AND status='active' AND verified_at<=clock_timestamp()) THEN RETURN QUERY SELECT 'wrong_domain',NULL::jsonb;RETURN;END IF;
 op:=(p_input->>'operationId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('google.merchant.operation:'||op::text,232));
 PERFORM pg_advisory_xact_lock(hashtextextended('google.merchant:'||p_store_id::text,230));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 SELECT * INTO operation FROM saas.google_merchant_operations WHERE operation_id=op;
 IF FOUND THEN IF operation.store_id<>p_store_id OR operation.membership_id<>p_membership_id OR operation.fingerprint IS DISTINCT FROM p_input->>'fingerprint' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;RETURN QUERY SELECT 'saved',operation.result_payload||jsonb_build_object('replayed',true);RETURN;END IF;
 SELECT version INTO current_version FROM saas.google_merchant_identity_profiles WHERE store_id=p_store_id;
 IF coalesce(current_version,0)<>(p_input->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF coalesce(current_version,0)>=9007199254740991 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'google_merchant.identity');
 INSERT INTO saas.google_merchant_identity_profiles(store_id,own_brand,brand_name,version) VALUES(p_store_id,(p_input->>'ownBrand')::boolean,p_input->>'brandName',1)
 ON CONFLICT(store_id) DO UPDATE SET own_brand=EXCLUDED.own_brand,brand_name=EXCLUDED.brand_name,version=saas.google_merchant_identity_profiles.version+1,updated_at=clock_timestamp();
 payload:=jsonb_build_object('saved',true,'replayed',false);
 INSERT INTO saas.google_merchant_operations VALUES(op,p_store_id,p_membership_id,p_input->>'fingerprint',payload,clock_timestamp());
 RETURN QUERY SELECT 'saved',payload;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_reference_definitions_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_reference_definitions_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)')),'UTF8')),'hex')<>'e8ef6c62abb44c6ae75694cb2a3061362a58321c17d0a86cd2064362ceda6a72' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_reference_definitions_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_reference_definitions_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',pg_get_functiondef(p.oid),'e8ef6c62abb44c6ae75694cb2a3061362a58321c17d0a86cd2064362ceda6a72',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_reference_definitions_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_reference_definitions_list(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((
    SELECT pg_catalog.jsonb_agg(saas.pricing_reference_definition_projection(p_store_id,definition.id)
      ORDER BY definition.kind,definition.id)
    FROM saas.pricing_reference_definitions definition WHERE definition.store_id=p_store_id),'[]'::jsonb));
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)')),'UTF8')),'hex')<>'facfde8dddb85137a9e332581daf7470542c6166d9f5d157a838b87b265829db' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)',pg_get_functiondef(p.oid),'facfde8dddb85137a9e332581daf7470542c6166d9f5d157a838b87b265829db',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.google_marketing_command(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_action text, p_input jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;svc text:=p_input->>'service';domain_name text;connection saas.google_marketing_connections;op saas.google_marketing_operations;state saas.google_marketing_oauth_states;op_id uuid;token uuid;host_name text;projection jsonb;moment timestamptz:=clock_timestamp();
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'google_connections') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 IF p_now IS NULL OR NOT isfinite(p_now) OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR p_action NOT IN('overview','private','start_oauth','consume_state','credential','refresh','error','scopes','claim','checkpoint','finalize','fail','disconnect') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations',CASE WHEN p_action IN('overview','private') THEN 'integrations.read' ELSE 'integrations.manage' END);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.platform_membership_is_authorized(p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 SELECT d.hostname INTO domain_name FROM saas.store_domains d WHERE d.store_id=p_store_id AND d.status='active' AND d.is_primary AND d.verified_at<=moment LIMIT 1;
 IF domain_name IS NULL THEN RETURN QUERY SELECT 'wrong_domain',NULL::jsonb;RETURN;END IF;
 IF p_action='overview' THEN RETURN QUERY SELECT 'found',jsonb_build_object('domain',domain_name,'connections',jsonb_build_array(saas.google_marketing_connection_projection(p_store_id,'gtm'),saas.google_marketing_connection_projection(p_store_id,'ads'),saas.google_marketing_connection_projection(p_store_id,'search_console'))||CASE WHEN p_input->>'includeMerchant'='true' THEN jsonb_build_array(saas.google_marketing_connection_projection(p_store_id,'merchant')) ELSE '[]'::jsonb END);RETURN;END IF;
 IF p_action='consume_state' THEN
  SELECT * INTO state FROM saas.google_marketing_oauth_states WHERE state_hash=p_input->>'stateHash' FOR UPDATE;
  IF NOT FOUND OR state.store_id<>p_store_id OR state.principal_id<>p_principal_id OR state.actor_membership_id<>p_membership_id OR state.session_hash IS DISTINCT FROM p_input->>'sessionHash' OR state.consumed_at IS NOT NULL OR state.expires_at<=moment THEN RETURN QUERY SELECT 'oauth_state_invalid',NULL::jsonb;RETURN;END IF;
  PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'google_marketing_command.consume_state');
  UPDATE saas.google_marketing_oauth_states SET consumed_at=moment WHERE state_hash=state.state_hash;
  RETURN QUERY SELECT 'consumed',jsonb_build_object('service',state.service,'returnOrigin',state.return_origin);RETURN;
 END IF;
 IF svc IS NULL OR svc NOT IN('gtm','ads','search_console','merchant') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_action='private' THEN SELECT * INTO connection FROM saas.google_marketing_connections WHERE store_id=p_store_id AND service=svc;RETURN QUERY SELECT 'private',jsonb_build_object('domain',domain_name,'connection',saas.google_marketing_connection_projection(p_store_id,svc),'credential',connection.credential,'requiredScopes',coalesce(connection.required_scopes,'[]'));RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'google_marketing_command.'||p_action);
 PERFORM pg_advisory_xact_lock(hashtextextended('google.marketing:'||p_store_id::text,0));
 INSERT INTO saas.google_marketing_connections(store_id,service) VALUES(p_store_id,svc) ON CONFLICT DO NOTHING;
 SELECT * INTO connection FROM saas.google_marketing_connections WHERE store_id=p_store_id AND service=svc FOR UPDATE;
 IF p_action='start_oauth' THEN
  host_name:=substring(p_input->>'returnOrigin' FROM '^https://([a-z0-9.-]+)$');
  IF host_name IS NULL OR p_input->>'stateHash'!~'^[a-f0-9]{64}$' OR p_input->>'sessionHash'!~'^[a-f0-9]{64}$' OR NOT (EXISTS(SELECT 1 FROM saas.admin_domains d WHERE d.store_id=p_store_id AND d.hostname=host_name AND d.status='active' AND d.verified_at<=moment) OR EXISTS(SELECT 1 FROM saas.stores s WHERE s.id=p_store_id AND host_name IN(s.slug||'.admin.celebix.site',s.slug||'.admin.saas-staging.celebix.site',s.slug||'.admin.saas-staging.celebix.net'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  op_id:=(p_input->>'operationId')::uuid;SELECT * INTO state FROM saas.google_marketing_oauth_states WHERE operation_id=op_id FOR UPDATE;
  IF FOUND THEN IF state.store_id<>p_store_id OR state.principal_id<>p_principal_id OR state.actor_membership_id<>p_membership_id OR state.service<>svc OR state.session_hash<>p_input->>'sessionHash' OR state.return_origin<>p_input->>'returnOrigin' OR state.consumed_at IS NOT NULL THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;DELETE FROM saas.google_marketing_oauth_states WHERE operation_id=op_id;END IF;
  INSERT INTO saas.google_marketing_oauth_states VALUES(p_input->>'stateHash',op_id,p_store_id,p_principal_id,p_membership_id,svc,p_input->>'sessionHash',p_input->>'returnOrigin',moment,moment+interval '10 minutes',NULL,NULL);
  RETURN QUERY SELECT 'started',jsonb_build_object('scopes',connection.required_scopes);RETURN;
 ELSIF p_action='credential' THEN
  SELECT * INTO state FROM saas.google_marketing_oauth_states WHERE state_hash=p_input->>'stateHash' AND store_id=p_store_id AND principal_id=p_principal_id AND actor_membership_id=p_membership_id AND service=svc FOR UPDATE;
  IF NOT FOUND OR state.consumed_at IS NULL OR state.completed_at IS NOT NULL OR state.expires_at<=moment THEN RETURN QUERY SELECT 'oauth_state_invalid',NULL::jsonb;RETURN;END IF;
  IF connection.google_subject IS NOT NULL AND connection.google_subject IS DISTINCT FROM p_input->>'subject' THEN UPDATE saas.google_marketing_connections SET selection=NULL,verification_token=NULL,status='disconnected',version=version+1 WHERE store_id=p_store_id AND service=svc;END IF;
  UPDATE saas.google_marketing_connections SET credential=p_input->'credential',google_subject=p_input->>'subject',google_email=p_input->>'email',status=CASE WHEN selection IS NULL THEN 'disconnected' ELSE 'connected' END,error_code=NULL,updated_at=moment WHERE store_id=p_store_id AND service=svc;
  UPDATE saas.google_marketing_oauth_states SET completed_at=moment WHERE state_hash=state.state_hash;
  INSERT INTO saas.google_marketing_events(store_id,actor_membership_id,service,action,operation_id) VALUES(p_store_id,p_membership_id,svc,'oauth.complete',state.operation_id);
 ELSIF p_action='refresh' THEN
  IF connection.google_subject IS DISTINCT FROM p_input->>'subject' OR connection.credential IS NULL THEN RETURN QUERY SELECT 'needs_reconnect',NULL::jsonb;RETURN;END IF;
  UPDATE saas.google_marketing_connections SET credential=p_input->'credential',updated_at=moment WHERE store_id=p_store_id AND service=svc;
 ELSIF p_action='error' THEN
  IF p_input->>'code'<>'needs_reconnect' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  UPDATE saas.google_marketing_connections SET status='needs_reconnect',error_code='needs_reconnect',updated_at=moment WHERE store_id=p_store_id AND service=svc;
 ELSIF p_action='scopes' THEN
  IF svc<>'gtm' OR p_input->'scopes' IS DISTINCT FROM '["https://www.googleapis.com/auth/tagmanager.edit.containers","https://www.googleapis.com/auth/tagmanager.edit.containerversions","https://www.googleapis.com/auth/tagmanager.publish"]'::jsonb THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  UPDATE saas.google_marketing_connections SET required_scopes=p_input->'scopes',error_code='incremental_authorization_required',updated_at=moment WHERE store_id=p_store_id AND service=svc;
 ELSIF p_action IN('claim','disconnect') THEN
  op_id:=(p_input->>'operationId')::uuid;SELECT * INTO op FROM saas.google_marketing_operations WHERE operation_id=op_id FOR UPDATE;
  IF FOUND THEN
   IF op.store_id<>p_store_id OR op.actor_membership_id<>p_membership_id OR op.service<>svc OR op.fingerprint IS DISTINCT FROM p_input->>'fingerprint' OR op.kind IS DISTINCT FROM (CASE WHEN p_action='disconnect' THEN 'disconnect' ELSE 'apply' END) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
   IF op.status='complete' THEN RETURN QUERY SELECT 'operation_replayed',op.result_payload;RETURN;END IF;
   IF op.status='running' AND op.lease_until>moment THEN RETURN QUERY SELECT 'operation_busy',NULL::jsonb;RETURN;END IF;
  END IF;
  IF connection.version IS DISTINCT FROM (p_input->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.google_marketing_operations other WHERE other.store_id=p_store_id AND other.operation_id<>op_id AND other.status='running' AND other.lease_until>moment) THEN RETURN QUERY SELECT 'operation_busy',NULL::jsonb;RETURN;END IF;
  IF p_action='claim' AND saas.google_marketing_selection_valid(p_input->'selection',svc,domain_name) IS DISTINCT FROM TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  token:=gen_random_uuid();
  INSERT INTO saas.google_marketing_operations(operation_id,store_id,actor_membership_id,service,kind,fingerprint,expected_version,requested_selection,status,lease_token,lease_until)
   VALUES(op_id,p_store_id,p_membership_id,svc,CASE WHEN p_action='disconnect' THEN 'disconnect' ELSE 'apply' END,p_input->>'fingerprint',(p_input->>'expectedVersion')::bigint,p_input->'selection','running',token,moment+interval '2 minutes') ON CONFLICT(operation_id) DO UPDATE SET status='running',lease_token=token,lease_until=moment+interval '2 minutes',updated_at=moment;
  IF p_action='claim' THEN RETURN QUERY SELECT 'claimed',jsonb_build_object('leaseToken',token,'progress',coalesce(op.progress,'{}'));RETURN;END IF;
  UPDATE saas.google_marketing_connections SET credential=NULL,google_subject=NULL,google_email=NULL,selection=NULL,verification_token=NULL,status='disconnected',version=version+1,required_scopes='[]',error_code=NULL,updated_at=moment WHERE store_id=p_store_id AND service=svc;
  UPDATE saas.google_marketing_oauth_states SET consumed_at=coalesce(consumed_at,moment),completed_at=moment WHERE store_id=p_store_id AND service=svc AND completed_at IS NULL;
  projection:=saas.google_marketing_connection_projection(p_store_id,svc);UPDATE saas.google_marketing_operations SET status='complete',result_payload=projection,lease_until=NULL,updated_at=moment WHERE operation_id=op_id;
  INSERT INTO saas.google_marketing_events(store_id,actor_membership_id,service,action,operation_id) VALUES(p_store_id,p_membership_id,svc,'disconnect',op_id);RETURN QUERY SELECT 'saved',projection;RETURN;
 ELSIF p_action IN('checkpoint','finalize','fail') THEN
  op_id:=(p_input->>'operationId')::uuid;SELECT * INTO op FROM saas.google_marketing_operations WHERE operation_id=op_id FOR UPDATE;
  IF NOT FOUND OR op.store_id<>p_store_id OR op.actor_membership_id<>p_membership_id OR op.service<>svc OR op.lease_token::text IS DISTINCT FROM p_input->>'leaseToken' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  IF op.status='complete' AND p_action='finalize' THEN RETURN QUERY SELECT 'operation_replayed',op.result_payload;RETURN;END IF;
  IF op.status<>'running' OR op.lease_until<=moment THEN RETURN QUERY SELECT 'operation_busy',NULL::jsonb;RETURN;END IF;
  IF p_action='checkpoint' THEN
   IF jsonb_typeof(p_input->'progress') IS DISTINCT FROM 'object' OR (p_input->'progress')-ARRAY['containerId','baseVersionId','workspacePath','versionId','verificationToken','verified','merchantDataSourceId','merchantSourceName','merchantDomain']<>'{}' OR length((p_input->'progress')::text)>2048 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   UPDATE saas.google_marketing_operations SET progress=p_input->'progress',lease_until=moment+interval '2 minutes',updated_at=moment WHERE operation_id=op_id;
   IF svc='search_console' AND p_input->'progress'?'verificationToken' THEN UPDATE saas.google_marketing_connections SET verification_token=p_input->'progress'->>'verificationToken',updated_at=moment WHERE store_id=p_store_id AND service=svc;END IF;
  ELSIF p_action='fail' THEN
   IF p_input->>'code'!~'^[a-z_]+$' OR length(p_input->>'code')>64 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   UPDATE saas.google_marketing_operations SET status='retryable',lease_until=NULL,error_code=p_input->>'code',updated_at=moment WHERE operation_id=op_id;
   UPDATE saas.google_marketing_connections SET error_code=p_input->>'code',status=CASE WHEN p_input->>'code'='needs_reconnect' THEN 'needs_reconnect' WHEN selection IS NULL THEN 'error' ELSE status END,updated_at=moment WHERE store_id=p_store_id AND service=svc;
  ELSE
   IF connection.version<>op.expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
   IF saas.google_marketing_selection_valid(p_input->'selection',svc,domain_name) IS DISTINCT FROM TRUE OR (svc='gtm' AND p_input->'selection'->>'tagId' IS NULL) OR (svc='ads' AND (p_input->'selection'->>'tagId' IS NULL OR p_input->'selection'->>'conversionLabel' IS NULL)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   IF svc='merchant' AND (op.progress->>'merchantDomain' IS DISTINCT FROM domain_name OR op.progress->>'merchantDataSourceId' IS DISTINCT FROM p_input->'selection'->>'resourceId' OR op.progress->>'merchantSourceName' IS DISTINCT FROM 'Celebix '||p_store_id::text) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF; UPDATE saas.google_marketing_connections SET selection=p_input->'selection',status='connected',version=version+1,last_checked_at=moment,error_code=NULL,verification_token=coalesce(p_input->>'verificationToken',verification_token),updated_at=moment WHERE store_id=p_store_id AND service=svc;
   projection:=saas.google_marketing_connection_projection(p_store_id,svc);UPDATE saas.google_marketing_operations SET status='complete',result_payload=projection,lease_until=NULL,updated_at=moment WHERE operation_id=op_id;
   INSERT INTO saas.google_marketing_events(store_id,actor_membership_id,service,action,operation_id) VALUES(p_store_id,p_membership_id,svc,'apply',op_id);RETURN QUERY SELECT 'saved',projection;RETURN;
  END IF;
 END IF;
 RETURN QUERY SELECT 'saved',NULL::jsonb;
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_reference_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_reference_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)')),'UTF8')),'hex')<>'cac6fe374fe7edf94be404544c5fcdf17b30799fea6e9943bea7df1ab73993c1' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_reference_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_reference_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',pg_get_functiondef(p.oid),'cac6fe374fe7edf94be404544c5fcdf17b30799fea6e9943bea7df1ab73993c1',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_reference_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_reference_operation_get(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; projected jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.jsonb_build_object('operationKind',operation.operation_kind,'result',operation.result_payload)
  INTO projected FROM saas.pricing_reference_operations operation
  WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id;
  RETURN QUERY SELECT CASE WHEN projected IS NULL THEN 'not_found' ELSE 'found' END,projected;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_reference_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,bigint)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_reference_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,bigint)')),'UTF8')),'hex')<>'02e5c1c2aa4514ef1f464b8dd6fd67c94f6b5f8bbc4454145799fa4ba36377c6' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_reference_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,bigint)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_reference_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,bigint)',pg_get_functiondef(p.oid),'02e5c1c2aa4514ef1f464b8dd6fd67c94f6b5f8bbc4454145799fa4ba36377c6',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_reference_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,bigint)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_reference_list(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_page_size integer, p_after_set_version bigint)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; selected_state saas.pricing_reference_state%ROWTYPE;
  items jsonb; has_more boolean; cursor_version bigint;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR (p_after_set_version IS NOT NULL AND p_after_set_version<1) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected_state FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'setId',page.id,'version',page.version,
    'createdAt',saas.pricing_json_timestamp(page.created_at),
    'isActive',COALESCE(page.id=selected_state.active_set_id,false)) ORDER BY page.version DESC),'[]'::jsonb),
    MIN(page.version)
  INTO items,cursor_version
  FROM (SELECT selected.id,selected.version,selected.created_at
    FROM saas.pricing_reference_sets selected WHERE selected.store_id=p_store_id
      AND (p_after_set_version IS NULL OR selected.version<p_after_set_version)
    ORDER BY selected.version DESC LIMIT p_page_size) page;
  SELECT EXISTS(SELECT 1 FROM saas.pricing_reference_sets selected
    WHERE selected.store_id=p_store_id AND selected.version<cursor_version) INTO has_more;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object(
    'activeSetId',selected_state.active_set_id,'stateVersion',COALESCE(selected_state.version,0),
    'items',items,'nextCursor',CASE WHEN has_more THEN cursor_version ELSE NULL::bigint END);
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.seo_admin_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.seo_admin_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)')),'UTF8')),'hex')<>'80294a02baf689774124bf58666f2fb7d1d142b3c3a64e219cee19df5b197d6c' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.seo_admin_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.seo_admin_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)',pg_get_functiondef(p.oid),'80294a02baf689774124bf58666f2fb7d1d142b3c3a64e219cee19df5b197d6c',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.seo_admin_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.seo_admin_mutate(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_action text, p_request jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE check_candidates jsonb;e text;op saas.seo_operations%ROWTYPE;resource jsonb;src jsonb;dst jsonb;result jsonb;selected_kind text;rid uuid;native_version bigint;options_version bigint;settings_version bigint;body_version bigint;link_id uuid;link saas.seo_links%ROWTYPE;candidate record;queued integer:=0;host text;run_id uuid;total integer;allowed jsonb;keys text[];category_record saas.merchant_admin_records%ROWTYPE;category_config jsonb;BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'seo_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'seo_admin_mutate');
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'seo_control',true);
 IF e IS NOT NULL THEN RETURN QUERY SELECT CASE WHEN e='durable_authority_invalid' THEN 'feature_not_enabled' ELSE e END,NULL::jsonb;RETURN;END IF;
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_action IS NULL OR p_action NOT IN('resource','settings','link','notify','check') OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>32768 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.seo.operation:'||p_operation_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.seo_operations WHERE operation_id=p_operation_id) THEN RETURN QUERY SELECT * FROM saas.seo_admin_recover(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_action);RETURN;END IF;
 PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
 SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(p_request) k;
 IF p_action='resource' THEN
 IF keys IS DISTINCT FROM ARRAY['canonicalPath','description','expectedSeoVersion','expectedVersion','id','indexing','kind','title'] OR p_request->>'kind' IS NULL OR p_request->>'kind' NOT IN('product','category','page','blog') OR jsonb_typeof(p_request->'id') IS DISTINCT FROM 'string' OR p_request->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR jsonb_typeof(p_request->'expectedVersion') IS DISTINCT FROM 'number' OR p_request->>'expectedVersion'!~'^[0-9]{1,16}$' OR jsonb_typeof(p_request->'expectedSeoVersion') IS DISTINCT FROM 'number' OR p_request->>'expectedSeoVersion'!~'^[0-9]{1,16}$' OR p_request->>'indexing' IS NULL OR p_request->>'indexing' NOT IN('inherit','index','noindex')
 OR (p_request->>'kind'<>'product' AND (octet_length(p_request->>'title')>160 OR octet_length(p_request->>'description')>4000)) OR saas.seo_text_valid(p_request->'title',CASE WHEN p_request->>'kind'='product' THEN 200 ELSE 160 END) IS DISTINCT FROM true OR saas.seo_text_valid(p_request->'description',CASE WHEN p_request->>'kind'='product' THEN 500 ELSE 4000 END) IS DISTINCT FROM true OR (p_request->'canonicalPath'<>'null'::jsonb AND (jsonb_typeof(p_request->'canonicalPath')<>'string' OR saas.seo_path_valid(p_request->>'canonicalPath') IS DISTINCT FROM true)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_kind:=p_request->>'kind';rid:=(p_request->>'id')::uuid;
 IF selected_kind='product' THEN SELECT p.version INTO native_version FROM saas.products p WHERE p.store_id=p_store_id AND p.id=rid AND p.status<>'archived' FOR UPDATE;
 ELSIF selected_kind='category' THEN SELECT c.version INTO native_version FROM saas.catalog_categories c WHERE c.store_id=p_store_id AND c.id=rid AND c.status<>'archived' FOR UPDATE;
 ELSE SELECT r.version INTO native_version FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=rid AND r.record_kind=CASE WHEN selected_kind='blog' THEN 'blog_post' ELSE 'page' END AND r.status<>'archived' FOR UPDATE;END IF;
 IF native_version IS NULL THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 IF saas.seo_canonical_owned(p_store_id,p_now,p_request->>'canonicalPath',selected_kind,rid) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT version INTO options_version FROM saas.seo_resource_options WHERE store_id=p_store_id AND kind=selected_kind AND resource_id=rid FOR UPDATE;
 IF native_version<>(p_request->>'expectedVersion')::bigint OR coalesce(options_version,0)<>(p_request->>'expectedSeoVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 SELECT x.payload INTO resource FROM saas.seo_resource_rows_scoped(p_store_id,p_now,selected_kind,rid) x WHERE x.kind=selected_kind AND x.id=rid;
 IF selected_kind='product' THEN
 UPDATE saas.products SET version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=rid;
 INSERT INTO saas.catalog_product_profiles(product_id,store_id,product_type,seo_title,seo_description,version,created_at,updated_at) VALUES(rid,p_store_id,'physical',p_request->>'title',p_request->>'description',1,p_now,p_now)
 ON CONFLICT(product_id) DO UPDATE SET seo_title=excluded.seo_title,seo_description=excluded.seo_description,version=saas.catalog_product_profiles.version+1,updated_at=p_now;
 ELSIF selected_kind='category' THEN
 IF (SELECT count(*) FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='seo_category_entry' AND r.status='active' AND r.config->>'resourceId'=rid::text)>1 THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 SELECT * INTO category_record FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='seo_category_entry' AND r.status='active' AND r.config->>'resourceId'=rid::text FOR UPDATE;
 category_config:=(coalesce(category_record.config,'{}'::jsonb)-ARRAY['metaTitle','metaDescription','canonicalPath'])||jsonb_build_object('resourceId',rid);
 IF p_request->>'title' IS NOT NULL THEN category_config:=category_config||jsonb_build_object('metaTitle',p_request->>'title');END IF;
 IF p_request->>'description' IS NOT NULL THEN category_config:=category_config||jsonb_build_object('metaDescription',p_request->>'description');END IF;
 IF p_request->>'canonicalPath' IS NOT NULL THEN category_config:=category_config||jsonb_build_object('canonicalPath',p_request->>'canonicalPath');END IF;
 IF category_record.id IS NULL THEN INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES(gen_random_uuid(),p_store_id,'seo_category_entry',left(resource->>'name',160),category_config,'active',1,p_now,p_now);
 ELSE UPDATE saas.merchant_admin_records SET config=category_config,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=category_record.id;END IF;
 -- The shared legacy metadata trigger advances the category resource version.

 ELSE
 UPDATE saas.merchant_admin_records SET version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=rid;
 INSERT INTO saas.merchant_content_bodies(store_id,record_id,version,body,body_format,origins,excerpt,seo_title,seo_description)
 SELECT p_store_id,r.id,native_version+1,coalesce(r.config->>'body',''),'legacy','{}'::jsonb,r.config->>'excerpt',p_request->>'title',p_request->>'description' FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=rid
 ON CONFLICT(store_id,record_id) DO UPDATE SET version=excluded.version,seo_title=excluded.seo_title,seo_description=excluded.seo_description,
 origins=saas.merchant_content_bodies.origins||jsonb_build_object('seoTitle',jsonb_build_object('state','manual'),'seoDescription',jsonb_build_object('state','manual'));
 INSERT INTO saas.merchant_content_versions(store_id,record_id,version,operation_id,principal_id,write_source,snapshot) VALUES(p_store_id,rid,native_version+1,p_operation_id,p_principal_id,'generic',saas.merchant_content_document(p_store_id,rid));
 END IF;
 INSERT INTO saas.seo_resource_options(store_id,kind,resource_id,version,canonical_path,indexing,updated_at) VALUES(p_store_id,selected_kind,rid,1,p_request->>'canonicalPath',p_request->>'indexing',p_now)
 ON CONFLICT(store_id,kind,resource_id) DO UPDATE SET version=saas.seo_resource_options.version+1,canonical_path=excluded.canonical_path,indexing=excluded.indexing,updated_at=p_now;
 -- Notify both canonical destinations when an override moves; deletion events use the old native path too.
 IF resource->>'allowIndex'='true' THEN PERFORM saas.seo_enqueue(p_store_id,resource->>'effectiveCanonicalPath',p_now);END IF;
 SELECT x.payload INTO resource FROM saas.seo_resource_rows_scoped(p_store_id,p_now,selected_kind,rid) x WHERE x.kind=selected_kind AND x.id=rid;
 IF resource->>'allowIndex'='true' THEN PERFORM saas.seo_enqueue(p_store_id,resource->>'effectiveCanonicalPath',p_now);END IF;
 result:=jsonb_build_object('resource',resource);
 ELSIF p_action='settings' THEN
 IF keys IS DISTINCT FROM ARRAY['allowIndex','bingVerification','expectedVersion','googleVerification','indexNowEnabled','metaDescription','metaTitle','socialAssetId','socialDescription','socialTitle'] OR jsonb_typeof(p_request->'expectedVersion') IS DISTINCT FROM 'number' OR p_request->>'expectedVersion'!~'^[0-9]{1,16}$'
 OR octet_length(p_request->>'metaTitle')>160 OR octet_length(p_request->>'metaDescription')>500 OR octet_length(p_request->>'socialTitle')>160 OR octet_length(p_request->>'socialDescription')>500 OR jsonb_typeof(p_request->'allowIndex') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_request->'indexNowEnabled') IS DISTINCT FROM 'boolean' OR saas.seo_text_valid(p_request->'metaTitle',160) IS DISTINCT FROM true OR saas.seo_text_valid(p_request->'metaDescription',500) IS DISTINCT FROM true OR saas.seo_text_valid(p_request->'socialTitle',160) IS DISTINCT FROM true OR saas.seo_text_valid(p_request->'socialDescription',500) IS DISTINCT FROM true
 OR (p_request->'socialAssetId'<>'null'::jsonb AND (jsonb_typeof(p_request->'socialAssetId')<>'string' OR p_request->>'socialAssetId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'))
 OR EXISTS(SELECT 1 FROM jsonb_each(p_request) x WHERE x.key IN('googleVerification','bingVerification') AND x.value<>'null'::jsonb AND (jsonb_typeof(x.value)<>'string' OR (char_length(x.value#>>'{}') NOT BETWEEN 1 AND 256 OR x.value#>>'{}'!~'^[a-zA-Z0-9_-]+$'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_request->>'socialAssetId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.storefront_assets a WHERE a.store_id=p_store_id AND a.id=(p_request->>'socialAssetId')::uuid AND a.status='active') THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 SELECT version INTO settings_version FROM saas.seo_settings WHERE store_id=p_store_id FOR UPDATE;
 IF coalesce(settings_version,0)<>(p_request->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.seo_settings(store_id,version,meta_title,meta_description,allow_index,social_title,social_description,social_asset_id,google_verification,bing_verification,indexnow_enabled,indexnow_key,updated_at)
 VALUES(p_store_id,1,p_request->>'metaTitle',p_request->>'metaDescription',(p_request->>'allowIndex')::boolean,p_request->>'socialTitle',p_request->>'socialDescription',(p_request->>'socialAssetId')::uuid,p_request->>'googleVerification',p_request->>'bingVerification',(p_request->>'indexNowEnabled')::boolean,replace(gen_random_uuid()::text,'-',''),p_now)
 ON CONFLICT(store_id) DO UPDATE SET version=saas.seo_settings.version+1,meta_title=excluded.meta_title,meta_description=excluded.meta_description,allow_index=excluded.allow_index,social_title=excluded.social_title,social_description=excluded.social_description,social_asset_id=excluded.social_asset_id,google_verification=excluded.google_verification,bing_verification=excluded.bing_verification,indexnow_enabled=excluded.indexnow_enabled,updated_at=p_now;
 result:=jsonb_build_object('settings',saas.seo_settings_projection(p_store_id,p_now));
 ELSIF p_action='link' THEN
 IF keys IS DISTINCT FROM ARRAY['anchorText','enabled','expectedVersion','id','sourceId','sourceKind','targetId','targetKind'] AND keys IS DISTINCT FROM ARRAY['anchorText','enabled','expectedVersion','id','remove','sourceId','sourceKind','targetId','targetKind'] OR jsonb_typeof(p_request->'enabled') IS DISTINCT FROM 'boolean' OR (p_request?'remove' AND jsonb_typeof(p_request->'remove') IS DISTINCT FROM 'boolean') OR saas.seo_text_valid(p_request->'anchorText',160) IS DISTINCT FROM true OR p_request->'anchorText'='null'::jsonb
 OR p_request->>'sourceKind' IS NULL OR p_request->>'sourceKind' NOT IN('product','category','page','blog') OR p_request->>'targetKind' IS NULL OR p_request->>'targetKind' NOT IN('product','category','page','blog')
 OR jsonb_typeof(p_request->'sourceId') IS DISTINCT FROM 'string' OR p_request->>'sourceId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(p_request->'targetId') IS DISTINCT FROM 'string' OR p_request->>'targetId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR (p_request->'id'='null'::jsonb) IS DISTINCT FROM (p_request->'expectedVersion'='null'::jsonb)
 OR (p_request->'id'<>'null'::jsonb AND (jsonb_typeof(p_request->'id')<>'string' OR p_request->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(p_request->'expectedVersion')<>'number' OR p_request->>'expectedVersion'!~'^[0-9]{1,16}$'))
 OR p_request->>'sourceKind'=p_request->>'targetKind' AND p_request->>'sourceId'=p_request->>'targetId' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Existing links are authorized and version-checked before cleanup of orphan references.
 link_id:=coalesce((p_request->>'id')::uuid,gen_random_uuid());
 IF p_request->>'id' IS NOT NULL THEN SELECT * INTO link FROM saas.seo_links WHERE store_id=p_store_id AND id=link_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;IF link.version<>(p_request->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;END IF;
 IF coalesce(p_request->>'remove','false')='true' THEN
 IF link.id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT x.payload INTO src FROM saas.seo_resource_rows_scoped(p_store_id,p_now,link.source_kind,link.source_id) x;
 ELSIF link.id IS NOT NULL AND p_request->>'enabled'='false'
 AND p_request->>'sourceKind'=link.source_kind AND (p_request->>'sourceId')::uuid=link.source_id
 AND p_request->>'targetKind'=link.target_kind AND (p_request->>'targetId')::uuid=link.target_id AND p_request->>'anchorText'=link.anchor_text THEN
 -- Disable-only cleanup cannot change the source, target or anchor of an orphan link.
 SELECT x.payload INTO src FROM saas.seo_resource_rows_scoped(p_store_id,p_now,link.source_kind,link.source_id) x;
 ELSE
 SELECT x.payload INTO src FROM saas.seo_resource_rows_scoped(p_store_id,p_now,p_request->>'sourceKind',(p_request->>'sourceId')::uuid) x WHERE x.published;
 SELECT x.payload INTO dst FROM saas.seo_resource_rows_scoped(p_store_id,p_now,p_request->>'targetKind',(p_request->>'targetId')::uuid) x WHERE x.published;
 IF src IS NULL OR dst IS NULL THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 END IF;
 IF coalesce(p_request->>'remove','false')='true' THEN DELETE FROM saas.seo_links WHERE store_id=p_store_id AND id=link_id;result:=jsonb_build_object('link',NULL);
 ELSE
 IF EXISTS(SELECT 1 FROM saas.seo_links l WHERE l.store_id=p_store_id AND l.source_kind=p_request->>'sourceKind' AND l.source_id=(p_request->>'sourceId')::uuid AND l.target_kind=p_request->>'targetKind' AND l.target_id=(p_request->>'targetId')::uuid AND l.id<>link_id) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF p_request->>'id' IS NULL AND (SELECT count(*) FROM saas.seo_links WHERE store_id=p_store_id)>=500 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.seo_links(id,store_id,version,source_kind,source_id,target_kind,target_id,anchor_text,enabled,updated_at) VALUES(link_id,p_store_id,1,p_request->>'sourceKind',(p_request->>'sourceId')::uuid,p_request->>'targetKind',(p_request->>'targetId')::uuid,p_request->>'anchorText',(p_request->>'enabled')::boolean,p_now)
 ON CONFLICT(id) DO UPDATE SET version=saas.seo_links.version+1,source_kind=excluded.source_kind,source_id=excluded.source_id,target_kind=excluded.target_kind,target_id=excluded.target_id,anchor_text=excluded.anchor_text,enabled=excluded.enabled,updated_at=p_now;
 SELECT jsonb_build_object('link',x.value) INTO result FROM jsonb_array_elements(saas.seo_links_projection(p_store_id,p_now)) x WHERE x.value->>'id'=link_id::text;
 END IF;
 IF src->>'allowIndex'='true' THEN PERFORM saas.seo_enqueue(p_store_id,src->>'effectiveCanonicalPath',p_now);END IF;
 ELSIF p_action='notify' THEN
 IF keys IS DISTINCT FROM ARRAY['resources'] OR jsonb_typeof(p_request->'resources') IS DISTINCT FROM 'array' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF jsonb_array_length(p_request->'resources') NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'resources') x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'object') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'resources') x WHERE (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x.value) k) IS DISTINCT FROM ARRAY['id','kind'] OR x.value->>'kind' IS NULL OR x.value->>'kind' NOT IN('product','category','page','blog') OR jsonb_typeof(x.value->'id') IS DISTINCT FROM 'string' OR x.value->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') OR (SELECT count(*) FROM jsonb_array_elements(p_request->'resources'))<>(SELECT count(DISTINCT x.value) FROM jsonb_array_elements(p_request->'resources') x) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF saas.seo_primary_host(p_store_id,p_now) IS NULL OR NOT EXISTS(SELECT 1 FROM saas.seo_settings WHERE store_id=p_store_id AND indexnow_enabled AND allow_index) THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'resources') x WHERE NOT EXISTS(SELECT 1 FROM saas.seo_resource_rows_scoped(p_store_id,p_now,x.value->>'kind',(x.value->>'id')::uuid) r WHERE r.kind=x.value->>'kind' AND r.id=(x.value->>'id')::uuid AND r.published AND r.payload->>'allowIndex'='true')) THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 FOR candidate IN SELECT DISTINCT r.payload->>'effectiveCanonicalPath' path FROM jsonb_array_elements(p_request->'resources') x CROSS JOIN LATERAL saas.seo_resource_rows_scoped(p_store_id,p_now,x.value->>'kind',(x.value->>'id')::uuid) r LOOP queued:=queued+saas.seo_enqueue(p_store_id,candidate.path,p_now);END LOOP;
 result:=jsonb_build_object('queued',queued);
 ELSIF p_action='check' THEN
 IF p_request<>'{}'::jsonb THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 host:=saas.seo_primary_host(p_store_id,p_now);IF host IS NULL THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
 SELECT id INTO run_id FROM saas.seo_check_runs WHERE store_id=p_store_id AND status='running';
 IF run_id IS NULL THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object('path',x.path,'kind',x.kind,'id',x.id)),'[]'::jsonb) INTO check_candidates FROM (SELECT DISTINCT ON (r.payload->>'path') r.payload->>'path' path,r.kind,r.id FROM saas.seo_resource_rows(p_store_id,p_now) r WHERE r.published AND saas.seo_path_valid(r.payload->>'path') ORDER BY r.payload->>'path',r.kind,r.id) x;total:=jsonb_array_length(check_candidates);IF total>20000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 run_id:=gen_random_uuid();INSERT INTO saas.seo_check_runs(id,store_id,total,status,created_at) VALUES(run_id,p_store_id,total+2,'running',p_now);
 INSERT INTO saas.seo_check_urls(id,run_id,store_id,hostname,path,kind,resource_id,status)
 SELECT gen_random_uuid(),run_id,p_store_id,host,x.value->>'path',x.value->>'kind',(x.value->>'id')::uuid,'queued' FROM jsonb_array_elements(check_candidates) x;
 INSERT INTO saas.seo_check_urls(id,run_id,store_id,hostname,path,status) VALUES(gen_random_uuid(),run_id,p_store_id,host,'/','queued'),(gen_random_uuid(),run_id,p_store_id,host,(SELECT CASE WHEN locale='tr' OR locale LIKE 'tr-%' THEN '/urunler' ELSE '/products' END FROM saas.stores WHERE id=p_store_id),'queued');
 END IF;
 SELECT jsonb_build_object('checked',r.checked,'total',r.total,'status',r.status) INTO result FROM saas.seo_check_runs r WHERE r.id=run_id;
 END IF;
 INSERT INTO saas.seo_operations(operation_id,store_id,principal_id,action,fingerprint,result_payload,created_at) VALUES(p_operation_id,p_store_id,p_principal_id,p_action,p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'saved',result;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,jsonb)')),'UTF8')),'hex')<>'c495ea5b47d93a19b6b0e220fe1ad79912295b478f9d7017996329e7a941c07d' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,jsonb)',pg_get_functiondef(p.oid),'c495ea5b47d93a19b6b0e220fe1ad79912295b478f9d7017996329e7a941c07d',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.order_drafts_create(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_draft_id uuid, p_intent jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; existing saas.order_draft_operations%ROWTYPE; line_outcome text; subtotal bigint; shipping bigint; discount bigint; projection jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'manual_orders') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'order_drafts_create');
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_draft_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR NOT saas.order_drafts_intent_valid(p_intent,false) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.order-draft.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_draft_operations AS operation WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN IF existing.operation_kind='create' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.order_drafts AS draft WHERE draft.id=p_draft_id) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF p_intent ? 'customerId' AND NOT EXISTS(SELECT 1 FROM saas.customers AS customer WHERE customer.store_id=p_store_id AND customer.id=(p_intent->>'customerId')::uuid AND customer.status='active') THEN RETURN QUERY SELECT 'customer_conflict',NULL::jsonb; RETURN; END IF;
  shipping:=(p_intent->>'shippingCents')::bigint; discount:=(p_intent->>'discountCents')::bigint;
  INSERT INTO saas.order_drafts(id,store_id,draft_number,status,customer_id,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,shipping_address,billing_address,note,adjust_inventory,version,created_at,updated_at)
  VALUES(p_draft_id,p_store_id,'TSL-'||pg_catalog.left(pg_catalog.md5(p_draft_id::text),20),'draft',CASE WHEN p_intent ? 'customerId' THEN (p_intent->>'customerId')::uuid END,p_intent->>'customerName',p_intent->>'customerEmail',p_intent->>'customerPhone','TRY',0,shipping,0,shipping,p_intent->'shippingAddress',p_intent->'billingAddress',p_intent->>'note',(p_intent->>'adjustInventory')::boolean,1,p_now,p_now);
  SELECT saved.outcome,saved.subtotal_cents INTO line_outcome,subtotal FROM saas.order_drafts_replace_lines(p_store_id,p_draft_id,p_intent,p_now) AS saved;
  IF line_outcome<>'saved' THEN DELETE FROM saas.order_drafts WHERE store_id=p_store_id AND id=p_draft_id; RETURN QUERY SELECT line_outcome,NULL::jsonb; RETURN; END IF;
  IF discount>subtotal+shipping THEN DELETE FROM saas.order_draft_lines WHERE store_id=p_store_id AND draft_id=p_draft_id; DELETE FROM saas.order_drafts WHERE store_id=p_store_id AND id=p_draft_id; RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  UPDATE saas.order_drafts SET subtotal_cents=subtotal,discount_cents=discount,total_cents=subtotal+shipping-discount WHERE store_id=p_store_id AND id=p_draft_id;
  projection:=saas.order_drafts_detail_projection(p_store_id,p_draft_id);
  INSERT INTO saas.order_draft_operations(operation_id,store_id,draft_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_operation_id,p_store_id,p_draft_id,'create',p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'created',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)')),'UTF8')),'hex')<>'c44bc9b043f7c99b93b10b96bf76455bcb2294b9449b381359afa60255be2c77' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',pg_get_functiondef(p.oid),'c44bc9b043f7c99b93b10b96bf76455bcb2294b9449b381359afa60255be2c77',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)');END $patch$;
CREATE OR REPLACE FUNCTION saas.order_drafts_convert(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_draft_id uuid, p_expected_version bigint)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; existing saas.order_draft_operations%ROWTYPE; current_draft saas.order_drafts%ROWTYPE; order_id uuid; order_number text; projection jsonb; draft_line record;
BEGIN
 BEGIN

IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'manual_orders') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'order_drafts_convert');
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_draft_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.order-draft.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_draft_operations AS operation WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN IF existing.operation_kind='convert' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  SELECT draft.* INTO current_draft FROM saas.order_drafts AS draft WHERE draft.store_id=p_store_id AND draft.id=p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'draft_not_found',NULL::jsonb; RETURN; END IF;
  IF current_draft.status<>'draft' THEN RETURN QUERY SELECT 'draft_not_editable',NULL::jsonb; RETURN; END IF;
  IF current_draft.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.order_draft_lines AS stored_line WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id) THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN; END IF;
  PERFORM variant.id FROM saas.order_draft_lines AS stored_line JOIN saas.products AS product ON product.store_id=p_store_id AND product.id=stored_line.product_id AND product.status='active' JOIN saas.product_variants AS variant ON variant.store_id=p_store_id AND variant.id=stored_line.variant_id AND variant.product_id=product.id AND variant.status='active' WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id ORDER BY variant.id FOR UPDATE OF variant,product;
  IF (SELECT pg_catalog.count(*) FROM saas.order_draft_lines AS stored_line WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id)<>(SELECT pg_catalog.count(*) FROM saas.order_draft_lines AS stored_line JOIN saas.products AS product ON product.store_id=p_store_id AND product.id=stored_line.product_id AND product.status='active' JOIN saas.product_variants AS variant ON variant.store_id=p_store_id AND variant.id=stored_line.variant_id AND variant.product_id=product.id AND variant.status='active' WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id) THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN; END IF;
  IF current_draft.adjust_inventory AND EXISTS(SELECT 1 FROM saas.order_draft_lines AS stored_line JOIN saas.product_variants AS variant ON variant.store_id=p_store_id AND variant.id=stored_line.variant_id WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id AND variant.stock_tracking AND variant.stock_quantity<stored_line.quantity) THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb; RETURN; END IF;
  order_id:=saas.inventory_deterministic_uuid('saas.manual-order',p_operation_id::text);
  order_number:='MAN-'||pg_catalog.left(pg_catalog.replace(pg_catalog.lower(order_id::text),'-',''),20);
  -- ORDER_NUMBER_CREATOR_V161
  order_number := saas.order_number_allocate(p_store_id,order_id,'POS',p_now);
  INSERT INTO saas.orders(id,store_id,order_number,source,customer_id,customer_name,customer_email,customer_phone,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,version,created_at,updated_at)
  VALUES(order_id,p_store_id,order_number,'manual',current_draft.customer_id,current_draft.customer_name,current_draft.customer_email,current_draft.customer_phone,current_draft.currency,current_draft.subtotal_cents,current_draft.shipping_cents,current_draft.discount_cents,current_draft.total_cents,'pending','pending',current_draft.shipping_address,1,p_now,p_now)
  RETURNING orders.order_number INTO order_number;
  INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
  SELECT saas.inventory_deterministic_uuid('saas.manual-order-item',stored_line.id::text),p_store_id,order_id,stored_line.product_id,stored_line.variant_id,stored_line.position,stored_line.product_name,stored_line.variant_name,stored_line.sku,stored_line.unit_price_cents,stored_line.quantity,stored_line.discount_cents,stored_line.line_total_cents,p_now
  FROM saas.order_draft_lines AS stored_line WHERE stored_line.store_id=p_store_id AND stored_line.draft_id=p_draft_id ORDER BY stored_line.position;
  INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at)
  VALUES(saas.inventory_deterministic_uuid('saas.manual-order-event',p_operation_id::text),p_store_id,order_id,p_membership_id,'order_created','Manual order created',pg_catalog.jsonb_build_object('source','manual','adjustedInventory',current_draft.adjust_inventory,'inventoryMessage',CASE WHEN current_draft.adjust_inventory THEN 'Stok güncellendi' ELSE 'Stok değiştirilmedi' END),p_now);
  IF current_draft.adjust_inventory THEN
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','checkout_sale',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id',order_id::text,true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
    FOR draft_line IN SELECT line.variant_id,line.quantity FROM saas.order_draft_lines AS line JOIN saas.product_variants AS variant ON variant.store_id=p_store_id AND variant.id=line.variant_id WHERE line.store_id=p_store_id AND line.draft_id=p_draft_id AND variant.stock_tracking ORDER BY line.variant_id LOOP
      UPDATE saas.product_variants AS variant SET stock_quantity=variant.stock_quantity-draft_line.quantity,version=variant.version+1,updated_at=p_now WHERE variant.store_id=p_store_id AND variant.id=draft_line.variant_id;
      INSERT INTO saas.manual_order_inventory_commitments(store_id,order_id,variant_id,quantity,created_at) VALUES(p_store_id,order_id,draft_line.variant_id,draft_line.quantity,p_now);
    END LOOP;
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  END IF;
  UPDATE saas.order_drafts SET status='converted',converted_order_id=order_id,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_draft_id;
  projection:=pg_catalog.jsonb_build_object('draftId',p_draft_id,'orderId',order_id,'orderNumber',order_number,'draftVersion',current_draft.version+1,'adjustedInventory',current_draft.adjust_inventory,'replayed',false);
  INSERT INTO saas.order_draft_operations(operation_id,store_id,draft_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_operation_id,p_store_id,p_draft_id,'convert',p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'converted',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  WHEN check_violation OR foreign_key_violation THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb;

 END;
 EXCEPTION WHEN SQLSTATE 'P0246' THEN RETURN QUERY SELECT SQLERRM::text,NULL::jsonb;RETURN;
END
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_variant_policy_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_variant_policy_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)')),'UTF8')),'hex')<>'58bc9a83eb6232c8556f73093ff5b7d78af76f0f811174908c3c7d7b435b1720' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_variant_policy_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_variant_policy_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)',pg_get_functiondef(p.oid),'58bc9a83eb6232c8556f73093ff5b7d78af76f0f811174908c3c7d7b435b1720',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_variant_policy_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_variant_policy_preview(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_variant_id uuid, p_policy jsonb, p_channel text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; selected_variant saas.product_variants%ROWTYPE;
  old_price record; candidate record; selected_state saas.pricing_reference_state%ROWTYPE;
  active_set_version bigint; selected_policy_version bigint; selected_list_version bigint;
  selected_source text; selected_list uuid; projected jsonb; signature jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_variant_id IS NULL OR (p_channel IS NULL OR p_channel NOT IN('storefront','quick_order','in_store'))
    OR NOT saas.pricing_variant_policy_valid(p_policy) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id
    AND variant.status='active' AND product.status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(state.current_version,0) INTO selected_policy_version
    FROM saas.pricing_variant_policy_state state WHERE state.store_id=p_store_id AND state.variant_id=p_variant_id;
  selected_policy_version:=COALESCE(selected_policy_version,0);
  SELECT * INTO selected_state FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id;
  IF selected_state.active_set_id IS NOT NULL THEN
    SELECT sets.version INTO active_set_version FROM saas.pricing_reference_sets sets
      WHERE sets.store_id=p_store_id AND sets.id=selected_state.active_set_id;
  END IF;
  SELECT * INTO old_price FROM saas.resolve_effective_variant_price(p_store_id,p_variant_id,p_channel,p_now,NULL::text);
  SELECT * INTO candidate FROM saas.pricing_calculate_policy_candidate(p_store_id,p_variant_id,p_policy,NULL::uuid);
  IF candidate.outcome='invalid_input' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF old_price.outcome NOT IN ('found','unavailable') OR candidate.outcome NOT IN ('found','unavailable') THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
  END IF;
  selected_source:=CASE WHEN old_price.outcome<>'found' THEN NULL::text
    WHEN old_price.source_kind='price_list' THEN 'price_list' ELSE 'base' END;
  selected_list:=CASE WHEN selected_source='price_list' THEN old_price.price_list_id ELSE NULL::uuid END;
  IF selected_list IS NOT NULL THEN
    SELECT list.version INTO selected_list_version FROM saas.price_lists list
      WHERE list.store_id=p_store_id AND list.id=selected_list;
  END IF;
  projected:=pg_catalog.jsonb_build_object(
    'variantId',p_variant_id,'oldPriceCents',CASE WHEN old_price.outcome='found' THEN old_price.price_cents ELSE NULL END,
    'newPriceCents',CASE WHEN candidate.outcome='found' THEN
      CASE WHEN selected_list IS NOT NULL THEN old_price.price_cents ELSE candidate.price_cents END ELSE NULL END,
    'sourceKind',selected_source,'priceListId',selected_list,
    'activeSetId',CASE WHEN p_policy->>'method'='fixed_try' THEN NULL ELSE selected_state.active_set_id END,
    'activeSetVersion',CASE WHEN p_policy->>'method'='fixed_try' THEN NULL ELSE active_set_version END,
    'referenceId',CASE WHEN p_policy->>'method'='fixed_try' THEN NULL ELSE (p_policy->>'referenceId')::uuid END,
    'referenceRateTry',candidate.trace->>'referenceRateTry','method',p_policy->>'method',
    'metalComponentTry',candidate.trace->>'componentTry','laborTry',candidate.trace->>'laborTry',
    'policyVersion',selected_policy_version,'variantVersion',selected_variant.version);
  signature:=pg_catalog.jsonb_build_object('storeId',p_store_id,'channel',p_channel,'policy',p_policy,
    'projection',projected,'activeStateVersion',COALESCE(selected_state.version,0),
    'priceListVersion',selected_list_version);
  RETURN QUERY SELECT 'previewed',projected||pg_catalog.jsonb_build_object('scopeDigest',
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(signature::text,'UTF8')),'hex'));
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.order_bump_settings_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.order_bump_settings_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,jsonb)')),'UTF8')),'hex')<>'97654230a4e94041833891d18b72e6dadf8ef54d5ddf1b4ffee0a336f6fcf2cc' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.order_bump_settings_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.order_bump_settings_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,jsonb)',pg_get_functiondef(p.oid),'97654230a4e94041833891d18b72e6dadf8ef54d5ddf1b4ffee0a336f6fcf2cc',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.order_bump_settings_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.order_bump_settings_save(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation uuid, p_fingerprint text, p_expected_version bigint, p_config jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;s saas.order_bump_settings;op saas.order_bump_operations;request jsonb;result jsonb;r jsonb;k text;item jsonb;found_ref boolean;prior jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.manage');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
 OR p_now IS NULL OR NOT isfinite(p_now) OR saas.order_bump_config_valid(p_config) IS DISTINCT FROM true OR pg_column_size(p_config)>65536 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 request:=jsonb_build_object('action','save_order_bumps','expectedVersion',p_expected_version,'config',p_config);
 PERFORM pg_advisory_xact_lock(hashtextextended('order-bump-settings:'||p_store::text,223));
 SELECT * INTO op FROM saas.order_bump_operations WHERE store_id=p_store AND operation_id=p_operation;
 IF FOUND THEN IF op.principal_id<>p_principal OR op.fingerprint<>p_fingerprint OR op.request_payload<>request THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;RETURN;END IF;
 SELECT * INTO s FROM saas.order_bump_settings WHERE store_id=p_store FOR UPDATE;
 IF coalesce(s.version,0)<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF s.store_id IS NOT NULL AND p_now<s.updated_at THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Existing unavailable selections may be retained while editing/disabling; new references must be active and same-store.
 FOR r IN SELECT value FROM jsonb_array_elements(p_config->'rules') LOOP
  FOREACH k IN ARRAY ARRAY['productIds','categoryIds','variantIds'] LOOP
   FOR item IN SELECT value FROM jsonb_array_elements(r->k) LOOP
    prior:=coalesce(s.config->'rules','[]'::jsonb);
    IF k='productIds' THEN SELECT EXISTS(SELECT 1 FROM saas.products x WHERE x.store_id=p_store AND x.id=(item#>>'{}')::uuid AND(x.status='active' OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior) old WHERE old->k @> jsonb_build_array(item)))) INTO found_ref;
    ELSIF k='categoryIds' THEN SELECT EXISTS(SELECT 1 FROM saas.catalog_categories x WHERE x.store_id=p_store AND x.id=(item#>>'{}')::uuid AND(x.status='active' OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior) old WHERE old->k @> jsonb_build_array(item)))) INTO found_ref;
    ELSE SELECT EXISTS(SELECT 1 FROM saas.product_variants x JOIN saas.products p ON p.store_id=x.store_id AND p.id=x.product_id WHERE x.store_id=p_store AND x.id=(item#>>'{}')::uuid AND(x.status='active' AND p.status='active' AND p.currency='TRY' OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior) old WHERE old->k @> jsonb_build_array(item)))) INTO found_ref;END IF;
    IF NOT found_ref THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb;RETURN;END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 INSERT INTO saas.order_bump_settings(store_id,version,config,created_by,updated_by,created_at,updated_at)
 VALUES(p_store,p_expected_version+1,p_config,p_principal,p_principal,date_trunc('milliseconds',p_now),date_trunc('milliseconds',p_now))
 ON CONFLICT(store_id) DO UPDATE SET version=EXCLUDED.version,config=EXCLUDED.config,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at RETURNING * INTO s;
 result:=saas.order_bump_workspace(s);
 INSERT INTO saas.order_bump_operations(store_id,operation_id,principal_id,membership_id,fingerprint,request_payload,result_payload,created_at) VALUES(p_store,p_operation,p_principal,p_membership,p_fingerprint,request,result,date_trunc('milliseconds',p_now));
 RETURN QUERY SELECT 'saved',result;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)')),'UTF8')),'hex')<>'6d52155773adf603b205b03a2355a19ecb131a2e30d7e3ad32e8b3b204cc2ae1' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)',pg_get_functiondef(p.oid),'6d52155773adf603b205b03a2355a19ecb131a2e30d7e3ad32e8b3b204cc2ae1',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.order_drafts_update(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_draft_id uuid, p_expected_version bigint, p_intent jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; existing saas.order_draft_operations%ROWTYPE; current_draft saas.order_drafts%ROWTYPE; line_outcome text; subtotal bigint; shipping bigint; discount bigint; projection jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'manual_orders') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'order_drafts_update');
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_draft_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR NOT saas.order_drafts_intent_valid(p_intent,true) OR NOT (p_intent ? 'expectedVersion') OR (p_intent->>'expectedVersion')::bigint<>p_expected_version THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.order-draft.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing FROM saas.order_draft_operations AS operation WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN IF existing.operation_kind='update' AND existing.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF; RETURN; END IF;
  SELECT draft.* INTO current_draft FROM saas.order_drafts AS draft WHERE draft.store_id=p_store_id AND draft.id=p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'draft_not_found',NULL::jsonb; RETURN; END IF;
  IF current_draft.status<>'draft' THEN RETURN QUERY SELECT 'draft_not_editable',NULL::jsonb; RETURN; END IF;
  IF current_draft.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF p_intent ? 'customerId' AND NOT EXISTS(SELECT 1 FROM saas.customers AS customer WHERE customer.store_id=p_store_id AND customer.id=(p_intent->>'customerId')::uuid AND customer.status='active') THEN RETURN QUERY SELECT 'customer_conflict',NULL::jsonb; RETURN; END IF;
  SELECT saved.outcome,saved.subtotal_cents INTO line_outcome,subtotal FROM saas.order_drafts_replace_lines(p_store_id,p_draft_id,p_intent,p_now) AS saved;
  IF line_outcome<>'saved' THEN RETURN QUERY SELECT line_outcome,NULL::jsonb; RETURN; END IF;
  shipping:=(p_intent->>'shippingCents')::bigint; discount:=(p_intent->>'discountCents')::bigint;
  IF discount>subtotal+shipping THEN RAISE EXCEPTION 'ORDER_DRAFT_INVALID_TOTAL'; END IF;
  UPDATE saas.order_drafts SET customer_id=CASE WHEN p_intent ? 'customerId' THEN (p_intent->>'customerId')::uuid END,customer_name=p_intent->>'customerName',customer_email=p_intent->>'customerEmail',customer_phone=p_intent->>'customerPhone',subtotal_cents=subtotal,shipping_cents=shipping,discount_cents=discount,total_cents=subtotal+shipping-discount,shipping_address=p_intent->'shippingAddress',billing_address=p_intent->'billingAddress',note=p_intent->>'note',adjust_inventory=(p_intent->>'adjustInventory')::boolean,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_draft_id;
  projection:=saas.order_drafts_detail_projection(p_store_id,p_draft_id);
  INSERT INTO saas.order_draft_operations(operation_id,store_id,draft_id,operation_kind,payload_fingerprint,result_payload,committed_at) VALUES(p_operation_id,p_store_id,p_draft_id,'update',p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'updated',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  WHEN check_violation OR raise_exception THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.order_bump_options(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,integer,text,uuid,uuid[])') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.order_bump_options(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,integer,text,uuid,uuid[])')),'UTF8')),'hex')<>'4f02a87a3fc25e0e0f7c9edcee9714541c6583e6c096add704f0efb1d6746d6c' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.order_bump_options(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,integer,text,uuid,uuid[])';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.order_bump_options(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,integer,text,uuid,uuid[])',pg_get_functiondef(p.oid),'4f02a87a3fc25e0e0f7c9edcee9714541c6583e6c096add704f0efb1d6746d6c',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.order_bump_options(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,integer,text,uuid,uuid[])');END $patch$;
CREATE OR REPLACE FUNCTION saas.order_bump_options(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_kind text, p_page integer, p_search text, p_product uuid, p_ids uuid[])
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;items jsonb;total bigint;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_kind IS NULL OR p_kind NOT IN('product','category','variant') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
 OR p_search IS NOT NULL AND(p_search<>btrim(p_search) OR char_length(p_search) NOT BETWEEN 1 AND 120 OR p_search~'[[:cntrl:]]')
 OR p_product IS NOT NULL AND p_kind<>'variant'
 OR p_ids IS NOT NULL AND(cardinality(p_ids) NOT BETWEEN 1 AND 400 OR array_position(p_ids,NULL) IS NOT NULL OR p_page<>1 OR p_search IS NOT NULL OR p_product IS NOT NULL OR(SELECT count(DISTINCT x) FROM unnest(p_ids) x)<>cardinality(p_ids))
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 WITH candidates AS MATERIALIZED(
  SELECT p.id,p.title label,NULL::uuid product_id,p.status='active' active_source FROM saas.products p WHERE p_kind='product' AND p.store_id=p_store AND(p_ids IS NOT NULL AND p.id=ANY(p_ids) OR p_ids IS NULL AND p.status='active')
  UNION ALL SELECT c.id,c.name,NULL::uuid,c.status='active' FROM saas.catalog_categories c WHERE p_kind='category' AND c.store_id=p_store AND(p_ids IS NOT NULL AND c.id=ANY(p_ids) OR p_ids IS NULL AND c.status='active')
  UNION ALL SELECT v.id,v.title,v.product_id,v.status='active' AND p.status='active' AND p.currency='TRY'
  FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id
  WHERE p_kind='variant' AND v.store_id=p_store AND(p_product IS NULL OR v.product_id=p_product) AND(p_ids IS NOT NULL AND v.id=ANY(p_ids) OR p_ids IS NULL AND v.status='active' AND p.status='active' AND p.currency='TRY')
 ),filtered AS MATERIALIZED(SELECT * FROM candidates WHERE p_ids IS NOT NULL OR p_search IS NULL OR strpos(lower(label),lower(p_search))>0),page AS MATERIALIZED(
  SELECT * FROM filtered ORDER BY CASE WHEN p_ids IS NOT NULL THEN array_position(p_ids,id) END,lower(label),id LIMIT CASE WHEN p_ids IS NULL THEN 20 ELSE 400 END OFFSET CASE WHEN p_ids IS NULL THEN(p_page-1)*20 ELSE 0 END
 ),projected AS(
  SELECT page.*,CASE WHEN p_kind='variant' AND r.outcome='found' AND r.price_cents BETWEEN 0 AND 8000000000 THEN r.price_cents END price_cents,
  coalesce(page.active_source AND(p_kind<>'variant' OR r.outcome='found' AND r.price_cents BETWEEN 0 AND 8000000000 AND coalesce(saas.storefront_available_stock(p_store,page.id,p_now,NULL),0)>0),false) available
  FROM page LEFT JOIN LATERAL saas.resolve_effective_variant_price(p_store,page.id,'storefront',p_now,NULL) r ON p_kind='variant'
 ) SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'productId',product_id,'priceCents',price_cents,'available',available) ORDER BY CASE WHEN p_ids IS NOT NULL THEN array_position(p_ids,id) END,lower(label),id) FROM projected),'[]'::jsonb),(SELECT count(*) FROM filtered) INTO items,total;
 RETURN QUERY SELECT 'ok',jsonb_build_object('items',items,'page',p_page,'totalCount',total);
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)')),'UTF8')),'hex')<>'9c95b5323000946ea6c2e24fda057ad957c54f8aec6daf8798447e7f193b50fe' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',pg_get_functiondef(p.oid),'9c95b5323000946ea6c2e24fda057ad957c54f8aec6daf8798447e7f193b50fe',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)');END $patch$;
CREATE OR REPLACE FUNCTION saas.abandoned_carts_mutate(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_cart_id uuid, p_expected_version bigint, p_kind text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; existing saas.abandoned_cart_operations%ROWTYPE; selected saas.abandoned_carts%ROWTYPE; projection jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'abandoned_carts_mutate');
  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_cart_id IS NULL OR p_expected_version<1 OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_kind NOT IN ('mark_recovered','archive') THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  SELECT * INTO existing FROM saas.abandoned_cart_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id<>p_store_id OR existing.cart_id<>p_cart_id OR existing.operation_kind<>p_kind OR existing.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
    END IF;
    RETURN QUERY SELECT 'operation_replayed'::text,existing.result_payload; RETURN;
  END IF;
  SELECT * INTO selected FROM saas.abandoned_carts WHERE store_id=p_store_id AND id=p_cart_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'cart_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF (p_kind='mark_recovered' AND selected.status<>'abandoned')
     OR (p_kind='archive' AND selected.status NOT IN ('active','abandoned','recovered')) THEN
    RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN;
  END IF;
  IF p_kind='mark_recovered' THEN
    UPDATE saas.abandoned_carts SET status='recovered',recovered_at=p_now,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_cart_id;
  ELSE
    UPDATE saas.abandoned_carts SET status='archived',archived_at=p_now,version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=p_cart_id;
  END IF;
  projection := saas.abandoned_carts_mutation_projection(p_store_id,p_cart_id);
  INSERT INTO saas.abandoned_cart_operations(operation_id,store_id,cart_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES (p_operation_id,p_store_id,p_cart_id,p_kind,p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_reference_set_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,integer,uuid)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_reference_set_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,integer,uuid)')),'UTF8')),'hex')<>'0556821103df09c5bcc489a7f986828149311dc25e683058924bfe30af0dc64b' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_reference_set_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,integer,uuid)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_reference_set_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,integer,uuid)',pg_get_functiondef(p.oid),'0556821103df09c5bcc489a7f986828149311dc25e683058924bfe30af0dc64b',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_reference_set_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,integer,uuid)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_reference_set_preview(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_set_id uuid, p_channel text, p_page_size integer, p_after_variant_id uuid)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; selected_variant record; old_price record; candidate record;
  entries jsonb:='[]'::jsonb; seen_products uuid[]:='{}'::uuid[];
  affected_count bigint:=0; override_count bigint:=0; unavailable_count bigint:=0;
  page_count integer:=0; last_id uuid; has_more boolean:=false; is_override boolean;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_set_id IS NULL OR p_channel IS NULL OR p_channel NOT IN ('storefront','quick_order','in_store')
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.pricing_reference_sets selected
    WHERE selected.store_id=p_store_id AND selected.id=p_set_id) THEN
    RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
  END IF;
  FOR selected_variant IN
    SELECT variant.id,variant.product_id FROM saas.pricing_variant_policy_state state
    JOIN saas.pricing_variant_policy_versions policy
      ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id AND policy.version=state.current_version
    JOIN saas.product_variants variant ON variant.store_id=state.store_id AND variant.id=state.variant_id
    JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE state.store_id=p_store_id AND policy.method<>'fixed_try'
      AND variant.status='active' AND product.status='active'
    ORDER BY variant.id
  LOOP
    affected_count:=affected_count+1;
    IF NOT selected_variant.product_id=ANY(seen_products) THEN
      seen_products:=pg_catalog.array_append(seen_products,selected_variant.product_id);
    END IF;
    SELECT * INTO old_price FROM saas.resolve_effective_variant_price(
      p_store_id,selected_variant.id,p_channel,p_now,NULL::text);
    SELECT * INTO candidate FROM saas.pricing_calculate_variant_price(p_store_id,selected_variant.id,p_set_id);
    is_override:=COALESCE(old_price.source_kind='price_list',false);
    IF is_override THEN override_count:=override_count+1; END IF;
    IF candidate.outcome<>'found' THEN unavailable_count:=unavailable_count+1; END IF;
    IF p_after_variant_id IS NOT NULL AND selected_variant.id<=p_after_variant_id THEN CONTINUE; END IF;
    IF page_count>=p_page_size THEN has_more:=true; CONTINUE; END IF;
    entries:=entries||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'variantId',selected_variant.id,'productId',selected_variant.product_id,
      'oldPriceCents',CASE WHEN old_price.outcome='found' THEN old_price.price_cents ELSE NULL END,
      'newPriceCents',CASE WHEN is_override THEN old_price.price_cents
        WHEN candidate.outcome='found' THEN candidate.price_cents ELSE NULL END,
      'overriddenByPriceList',is_override));
    page_count:=page_count+1; last_id:=selected_variant.id;
  END LOOP;
  RETURN QUERY SELECT 'previewed',pg_catalog.jsonb_build_object(
    'setId',p_set_id,'scopeDigest',saas.pricing_reference_scope_digest(p_store_id,p_set_id,p_now),
    'affectedProducts',pg_catalog.cardinality(seen_products),'affectedVariants',affected_count,
    'fixedOverrideVariants',override_count,'unavailableVariants',unavailable_count,
    'entries',entries,'nextCursor',CASE WHEN has_more THEN last_id ELSE NULL::uuid END);
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_reference_define(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,text)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_reference_define(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,text)')),'UTF8')),'hex')<>'84e3f578dfe621d3e2ec6edcf49eddab0be179659ed93916cab456fd7aa776d7' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_reference_define(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,text)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_reference_define(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,text)',pg_get_functiondef(p.oid),'84e3f578dfe621d3e2ec6edcf49eddab0be179659ed93916cab456fd7aa776d7',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_reference_define(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,text)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_reference_define(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_reference_id uuid, p_kind text, p_label text, p_reference_purity text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE; projected jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'pricing_reference_define');
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_reference_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_kind IS NULL OR p_kind NOT IN ('usd','eur','gold_gram')
    OR p_label IS NULL OR p_label<>pg_catalog.btrim(p_label)
    OR pg_catalog.char_length(p_label) NOT BETWEEN 1 AND 120 OR p_label~'[[:cntrl:]]'
    OR (p_kind<>'gold_gram' AND p_reference_purity IS NOT NULL)
    OR (p_reference_purity IS NOT NULL AND (NOT saas.pricing_decimal_valid(p_reference_purity,8,true,1::numeric))) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='define'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
      CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='define'
        AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM saas.pricing_reference_definitions definition
      WHERE definition.store_id=p_store_id AND (definition.id=p_reference_id OR definition.kind=p_kind AND p_kind IN ('usd','eur'))) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.pricing_reference_definitions definition
      WHERE definition.store_id=p_store_id)>=100 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  INSERT INTO saas.pricing_reference_state(store_id) VALUES(p_store_id) ON CONFLICT (store_id) DO NOTHING;
  INSERT INTO saas.pricing_reference_definitions(id,store_id,kind,label,reference_purity,created_by,created_at)
  VALUES(p_reference_id,p_store_id,p_kind,p_label,p_reference_purity::numeric,p_principal_id,p_now);
  projected:=saas.pricing_reference_definition_projection(p_store_id,p_reference_id);
  INSERT INTO saas.pricing_reference_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'define',p_fingerprint,projected,p_now);
  RETURN QUERY SELECT 'defined',projected;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_reference_set_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_reference_set_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)')),'UTF8')),'hex')<>'53c5887b9e69c6ac94b1a5a6ee23a22082fd9ba1d39e5fa217375c9edf55d850' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_reference_set_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_reference_set_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)',pg_get_functiondef(p.oid),'53c5887b9e69c6ac94b1a5a6ee23a22082fd9ba1d39e5fa217375c9edf55d850',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_reference_set_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_reference_set_save(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_set_id uuid, p_expected_state_version bigint, p_values jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE;
  selected_state saas.pricing_reference_state%ROWTYPE; entry jsonb; reference_text text;
  seen uuid[]:='{}'::uuid[]; reference_id uuid; rate_text text; next_version bigint; projected jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'pricing_reference_set_save');
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_set_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_state_version IS NULL OR p_expected_state_version<0
    OR p_values IS NULL OR pg_catalog.jsonb_typeof(p_values)<>'array' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF pg_catalog.jsonb_array_length(p_values) NOT BETWEEN 1 AND 100 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_values) value LOOP
    IF pg_catalog.jsonb_typeof(entry)<>'object' OR entry - 'referenceId' - 'rateTry' - 'active'<>'{}'::jsonb
      OR NOT (entry ? 'referenceId' AND entry ? 'rateTry' AND entry ? 'active')
      OR pg_catalog.jsonb_typeof(entry->'referenceId')<>'string'
      OR pg_catalog.jsonb_typeof(entry->'active')<>'boolean'
      OR (entry->>'referenceId')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
    reference_text:=entry->>'referenceId'; reference_id:=reference_text::uuid;
    IF reference_id=ANY(seen) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    seen:=pg_catalog.array_append(seen,reference_id);
    rate_text:=entry->>'rateTry';
    IF (entry->>'active')::boolean AND NOT saas.pricing_decimal_valid(rate_text,8,true,9007199254740991::numeric)
      OR (entry->>'active')::boolean IS FALSE AND rate_text IS NOT NULL
        AND NOT saas.pricing_decimal_valid(rate_text,8,true,9007199254740991::numeric) THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
    IF rate_text IS NOT NULL AND pg_catalog.jsonb_typeof(entry->'rateTry')<>'string' THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
  END LOOP;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='save_set'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
      CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='save_set'
        AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END;
    RETURN;
  END IF;
  INSERT INTO saas.pricing_reference_state(store_id) VALUES(p_store_id) ON CONFLICT (store_id) DO NOTHING;
  SELECT * INTO selected_state FROM saas.pricing_reference_state WHERE store_id=p_store_id FOR UPDATE;
  IF selected_state.version<>p_expected_state_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM saas.pricing_reference_sets existing WHERE existing.store_id=p_store_id AND existing.id=p_set_id)
    OR pg_catalog.cardinality(seen)<>(SELECT pg_catalog.count(*) FROM saas.pricing_reference_definitions WHERE store_id=p_store_id)
    OR EXISTS (SELECT 1 FROM pg_catalog.unnest(seen) input_id
      WHERE NOT EXISTS (SELECT 1 FROM saas.pricing_reference_definitions definition
        WHERE definition.store_id=p_store_id AND definition.id=input_id)) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  next_version:=selected_state.last_set_version+1;
  IF next_version>9007199254740991 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.pricing_reference_sets(id,store_id,version,created_by,created_at)
  VALUES(p_set_id,p_store_id,next_version,p_principal_id,p_now);
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_values) value LOOP
    INSERT INTO saas.pricing_reference_set_values(store_id,set_id,reference_id,rate_try,active)
    VALUES(p_store_id,p_set_id,(entry->>'referenceId')::uuid,(entry->>'rateTry')::numeric,(entry->>'active')::boolean);
  END LOOP;
  UPDATE saas.pricing_reference_state SET last_set_version=next_version WHERE store_id=p_store_id;
  projected:=saas.pricing_reference_set_projection(p_store_id,p_set_id);
  INSERT INTO saas.pricing_reference_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'save_set',p_fingerprint,projected,p_now);
  RETURN QUERY SELECT 'saved',projected;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.toshi_conversation_begin_turn(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.toshi_conversation_begin_turn(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)')),'UTF8')),'hex')<>'b59c8de4e64a73dc5ece604f6645b5c8bda5f37c306abf24f391fc23edaee388' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.toshi_conversation_begin_turn(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.toshi_conversation_begin_turn(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',pg_get_functiondef(p.oid),'b59c8de4e64a73dc5ece604f6645b5c8bda5f37c306abf24f391fc23edaee388',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.toshi_conversation_begin_turn(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)');END $patch$;
CREATE OR REPLACE FUNCTION saas.toshi_conversation_begin_turn(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_conversation_id uuid, p_expected_version bigint, p_text text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE denied text; op saas.toshi_generation_operations%ROWTYPE; conv saas.toshi_conversations%ROWTYPE; config saas.toshi_provider_configs%ROWTYPE; attempts integer; stale record;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'ai') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'toshi_conversation_begin_turn');
 denied:=saas.toshi_provider_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
 IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_text IS NULL OR char_length(p_text) NOT BETWEEN 1 AND 4000 OR octet_length(p_text)>16000 OR p_text<>btrim(p_text)
  OR p_text ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' OR (p_conversation_id IS NULL AND p_expected_version IS NOT NULL) OR (p_conversation_id IS NOT NULL AND (p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 100)) THEN
  RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('toshi.operation:'||p_operation_id::text,164));
 PERFORM pg_advisory_xact_lock(hashtextextended('toshi.actor:'||p_store_id::text||':'||p_principal_id::text,164));
 SELECT * INTO op FROM saas.toshi_generation_operations o WHERE o.operation_id=p_operation_id FOR UPDATE;
 IF FOUND THEN
  IF op.store_id<>p_store_id OR op.principal_id<>p_principal_id OR op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  IF op.status='completed' THEN RETURN QUERY SELECT 'replayed'::text,op.result_payload; RETURN; END IF;
  IF op.status='failed' THEN RETURN QUERY SELECT op.error_code,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT CASE WHEN op.lease_expires_at>p_now THEN 'turn_busy' ELSE 'operation_failed' END::text,NULL::jsonb; RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM saas.toshi_generation_operations o WHERE o.store_id=p_store_id AND o.principal_id=p_principal_id AND o.status='pending' AND o.lease_expires_at>p_now) THEN RETURN QUERY SELECT 'turn_busy'::text,NULL::jsonb; RETURN; END IF;
 SELECT count(*) INTO attempts FROM saas.toshi_generation_operations o WHERE o.store_id=p_store_id AND o.principal_id=p_principal_id AND o.created_at>p_now-interval '1 minute';
 IF attempts >= 6 THEN RETURN QUERY SELECT 'rate_limited'::text,NULL::jsonb; RETURN; END IF;
 IF p_conversation_id IS NULL THEN
  SELECT * INTO config FROM saas.toshi_provider_configs c WHERE c.store_id=p_store_id AND c.status='active' AND c.is_default FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'credential_invalid'::text,NULL::jsonb; RETURN; END IF;
  conv.id:=gen_random_uuid(); conv.store_id:=p_store_id; conv.principal_id:=p_principal_id; conv.provider_config_id:=config.id; conv.provider:=config.provider; conv.model:=config.selected_model; conv.version:=0;
  conv.title:=btrim(left(regexp_replace(p_text,'[[:cntrl:]]',' ','g'),80)); conv.created_at:=p_now; conv.updated_at:=p_now;
  INSERT INTO saas.toshi_conversations VALUES(conv.id,conv.store_id,conv.principal_id,conv.provider_config_id,conv.provider,conv.model,conv.title,conv.version,conv.created_at,conv.updated_at);
 ELSE
  SELECT * INTO conv FROM saas.toshi_conversations c WHERE c.id=p_conversation_id AND c.store_id=p_store_id AND c.principal_id=p_principal_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'conversation_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF conv.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF conv.version >= 100 THEN RETURN QUERY SELECT 'conversation_limit_reached'::text,NULL::jsonb; RETURN; END IF;
  SELECT * INTO config FROM saas.toshi_provider_configs c WHERE c.id=conv.provider_config_id AND c.store_id=p_store_id AND c.provider=conv.provider FOR SHARE;
  IF NOT FOUND OR config.status<>'active' THEN RETURN QUERY SELECT 'connection_revoked'::text,NULL::jsonb; RETURN; END IF;
  IF NOT saas.toshi_provider_model_available(config.available_models,conv.model) THEN RETURN QUERY SELECT 'model_unavailable'::text,NULL::jsonb; RETURN; END IF;
 END IF;
 FOR stale IN UPDATE saas.toshi_generation_operations o SET status='failed',error_code='provider_timeout',finished_at=p_now
  WHERE o.store_id=p_store_id AND o.principal_id=p_principal_id AND o.status='pending' AND o.lease_expires_at<=p_now RETURNING o.operation_id LOOP
  INSERT INTO saas.toshi_generation_events VALUES(gen_random_uuid(),stale.operation_id,p_store_id,p_principal_id,'expired',p_now);
 END LOOP;
 INSERT INTO saas.toshi_generation_operations(operation_id,store_id,principal_id,conversation_id,provider_config_id,credential_version,expected_version,payload_fingerprint,user_text,status,created_at,lease_expires_at)
 VALUES(p_operation_id,p_store_id,p_principal_id,conv.id,config.id,config.credential_version,conv.version,p_fingerprint,p_text,'pending',p_now,p_now+interval '120 seconds');
 INSERT INTO saas.toshi_generation_events VALUES(gen_random_uuid(),p_operation_id,p_store_id,p_principal_id,'reserved',p_now);
 RETURN QUERY SELECT 'ready'::text,jsonb_build_object('operationId',p_operation_id,'conversation',saas.toshi_conversation_public_payload(conv.id,p_store_id,p_principal_id),'configId',config.id,'credentialVersion',config.credential_version);
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.google_merchant_command_before_retail_identity(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.google_merchant_command_before_retail_identity(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)')),'UTF8')),'hex')<>'2d48fb15b90363392220350d042da8e80ad012cf3ae3e7b6156f8e75588631d2' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.google_merchant_command_before_retail_identity(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.google_merchant_command_before_retail_identity(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)',pg_get_functiondef(p.oid),'2d48fb15b90363392220350d042da8e80ad012cf3ae3e7b6156f8e75588631d2',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.google_merchant_command_before_retail_identity(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.google_merchant_command_before_retail_identity(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_action text, p_input jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;domain_name text;c saas.google_marketing_connections;operation saas.google_merchant_operations;op_id uuid;queued integer:=0;entry record;items jsonb;limit_value integer;cursor uuid;last_id uuid;more boolean;attrs jsonb;v saas.product_variants;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'google_merchant') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 IF p_now IS NULL OR NOT isfinite(p_now) OR p_action NOT IN('overview','products','sync','preferences') OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations',CASE WHEN p_action IN('overview','products') THEN 'integrations.read' ELSE 'integrations.manage' END);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;IF NOT saas.platform_membership_is_authorized(p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 SELECT hostname INTO domain_name FROM saas.store_domains WHERE store_id=p_store_id AND is_primary AND status='active' AND verified_at<=clock_timestamp();
 IF domain_name IS NULL THEN RETURN QUERY SELECT 'wrong_domain',NULL::jsonb;RETURN;END IF;
 SELECT * INTO c FROM saas.google_marketing_connections WHERE store_id=p_store_id AND service='merchant';
 IF p_action='overview' THEN
 RETURN QUERY SELECT 'found',jsonb_build_object('storeDomain',domain_name,'connection',saas.google_marketing_connection_projection(p_store_id,'merchant'),'dataSourceId',c.selection->>'resourceId','lastSyncedAt',(SELECT CASE WHEN last_synced_at IS NULL THEN NULL ELSE saas.orders_json_timestamp(last_synced_at) END FROM saas.google_merchant_accounts WHERE store_id=p_store_id),'counts',(SELECT jsonb_build_object('ready',0,'pending',count(*) FILTER(WHERE state IN('pending','leased')),'submitted',count(*) FILTER(WHERE state='submitted'),'approved',count(*) FILTER(WHERE state='approved'),'limited',count(*) FILTER(WHERE state='limited'),'disapproved',count(*) FILTER(WHERE state='disapproved'),'excluded',count(*) FILTER(WHERE state='excluded'),'failed',count(*) FILTER(WHERE state='failed')) FROM saas.google_merchant_outbox WHERE store_id=p_store_id));RETURN;
 ELSIF p_action='products' THEN
 limit_value:=(p_input->>'limit')::integer;cursor:=(p_input->>'cursor')::uuid;IF limit_value IS NULL OR limit_value NOT BETWEEN 1 AND 50 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 WITH selected AS MATERIALIZED(SELECT id FROM saas.product_variants WHERE store_id=p_store_id AND (cursor IS NULL OR id>cursor) ORDER BY id LIMIT limit_value+1),page AS(SELECT id FROM selected ORDER BY id LIMIT limit_value)
 SELECT coalesce(jsonb_agg(saas.google_merchant_product_row(p_store_id,id,p_now) ORDER BY id),'[]'),(SELECT count(*)>limit_value FROM selected),(SELECT id FROM page ORDER BY id DESC LIMIT 1) INTO items,more,last_id FROM page;
 RETURN QUERY SELECT 'found',jsonb_build_object('items',items,'nextCursor',CASE WHEN more THEN last_id::text ELSE NULL END);RETURN;
 END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'google_merchant.'||p_action);
 PERFORM pg_advisory_xact_lock(hashtextextended('google.merchant:'||p_store_id::text,230));
 op_id:=(p_input->>'operationId')::uuid;IF op_id IS NULL OR p_input->>'fingerprint'!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO operation FROM saas.google_merchant_operations WHERE operation_id=op_id;
 IF FOUND THEN IF operation.store_id<>p_store_id OR operation.membership_id<>p_membership_id OR operation.fingerprint IS DISTINCT FROM p_input->>'fingerprint' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;RETURN QUERY SELECT CASE p_action WHEN 'sync' THEN 'queued' ELSE 'saved' END,operation.result_payload||jsonb_build_object('replayed',true);RETURN;END IF;
 IF p_action='preferences' THEN
 SELECT * INTO v FROM saas.product_variants WHERE store_id=p_store_id AND product_id=(p_input->>'productId')::uuid AND id=(p_input->>'variantId')::uuid;
 attrs:=coalesce(p_input->'attributes','{}');IF NOT FOUND OR jsonb_typeof(p_input->'enabled') IS DISTINCT FROM 'boolean' OR NOT saas.google_merchant_attributes_valid(attrs) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.google_merchant_preferences(store_id,product_id,variant_id,enabled,attributes) VALUES(p_store_id,v.product_id,v.id,(p_input->>'enabled')::boolean,attrs) ON CONFLICT(store_id,variant_id) DO UPDATE SET enabled=EXCLUDED.enabled,attributes=EXCLUDED.attributes,updated_at=clock_timestamp();
 PERFORM saas.google_merchant_enqueue(p_store_id,v.product_id,v.id);
 items:=jsonb_build_object('saved',true,'replayed',false);
 ELSE
 IF c.status IS DISTINCT FROM 'connected' OR c.selection IS NULL OR c.credential IS NULL THEN RETURN QUERY SELECT 'not_connected',NULL::jsonb;RETURN;END IF;
 FOR entry IN SELECT product_id,id variant_id FROM saas.product_variants WHERE store_id=p_store_id UNION SELECT product_id,variant_id FROM saas.google_merchant_outbox WHERE store_id=p_store_id LOOP PERFORM saas.google_merchant_enqueue(p_store_id,entry.product_id,entry.variant_id);queued:=queued+1;END LOOP;
 items:=jsonb_build_object('queued',queued,'replayed',false);
 END IF;
 INSERT INTO saas.google_merchant_operations VALUES(op_id,p_store_id,p_membership_id,p_input->>'fingerprint',items,clock_timestamp());
 RETURN QUERY SELECT CASE p_action WHEN 'sync' THEN 'queued' ELSE 'saved' END,items;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_reference_set_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_reference_set_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)')),'UTF8')),'hex')<>'445d1e55f06acdc00b86570e0f756db5d5dcf20a60f2a71d6f95db04d7f5942c' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_reference_set_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_reference_set_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',pg_get_functiondef(p.oid),'445d1e55f06acdc00b86570e0f756db5d5dcf20a60f2a71d6f95db04d7f5942c',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_reference_set_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_reference_set_activate(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_set_id uuid, p_expected_state_version bigint, p_expected_scope_digest text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE;
  selected_state saas.pricing_reference_state%ROWTYPE; selected_set saas.pricing_reference_sets%ROWTYPE;
  projected jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'pricing_reference_set_activate');
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_set_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_state_version IS NULL OR p_expected_state_version<0
    OR p_expected_scope_digest IS NULL OR p_expected_scope_digest!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='activate'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
      CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='activate'
        AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END;
    RETURN;
  END IF;
  SELECT * INTO selected_state FROM saas.pricing_reference_state WHERE store_id=p_store_id FOR UPDATE;
  IF NOT FOUND OR selected_state.version<>p_expected_state_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF selected_state.version>=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected_set FROM saas.pricing_reference_sets selected
  WHERE selected.store_id=p_store_id AND selected.id=p_set_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM saas.pricing_reference_set_values value
      WHERE value.store_id=p_store_id AND value.set_id=p_set_id AND value.active)
    AND NOT EXISTS (SELECT 1 FROM saas.pricing_dynamic_activation
      WHERE store_id=p_store_id AND enabled) THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
  END IF;
  IF saas.pricing_reference_scope_digest(p_store_id,p_set_id,p_now) IS DISTINCT FROM p_expected_scope_digest THEN
    RETURN QUERY SELECT 'scope_conflict',NULL::jsonb; RETURN;
  END IF;
  -- The preview may contain unavailable dynamic variants. Publishing this set
  -- intentionally blocks their new sales; no cached price is substituted.
  UPDATE saas.pricing_reference_state SET active_set_id=p_set_id,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id;
  projected:=pg_catalog.jsonb_build_object('setId',p_set_id,'version',selected_set.version,
    'stateVersion',selected_state.version+1,'activatedAt',saas.pricing_json_timestamp(p_now));
  INSERT INTO saas.pricing_reference_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'activate',p_fingerprint,projected,p_now);
  RETURN QUERY SELECT 'activated',projected;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_reference_set_preview_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,integer,uuid,uuid)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_reference_set_preview_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,integer,uuid,uuid)')),'UTF8')),'hex')<>'d7eaed7e353d7be66b5f18624cb3678129c435173cc7ae320e3756f3d8d8346e' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_reference_set_preview_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,integer,uuid,uuid)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_reference_set_preview_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,integer,uuid,uuid)',pg_get_functiondef(p.oid),'d7eaed7e353d7be66b5f18624cb3678129c435173cc7ae320e3756f3d8d8346e',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_reference_set_preview_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,integer,uuid,uuid)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_reference_set_preview_v2(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_set_id uuid, p_channel text, p_page_size integer, p_after_variant_id uuid, p_catalog_gram_reference_id uuid)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; selected record; old_price record; candidate record; entries jsonb:='[]';
 seen_products uuid[]:='{}'; affected_count bigint:=0; override_count bigint:=0; unavailable_count bigint:=0;
 page_count integer:=0; last_id uuid; has_more boolean:=false; is_override boolean;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 IF p_catalog_gram_reference_id IS NULL THEN
   RETURN QUERY SELECT * FROM saas.pricing_reference_set_preview(p_store_id,p_principal_id,p_membership_id,p_plan_id,
     p_plan_code,p_plan_version,p_now,p_set_id,p_channel,p_page_size,p_after_variant_id); RETURN;
 END IF;
 authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,
   p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_set_id IS NULL OR p_channel IS NULL OR p_channel NOT IN('storefront','quick_order','in_store')
   OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
   RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.pricing_reference_sets WHERE store_id=p_store_id AND id=p_set_id) THEN
   RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.pricing_reference_definitions definition
   JOIN saas.pricing_reference_set_values value ON value.store_id=definition.store_id AND value.reference_id=definition.id
   WHERE definition.store_id=p_store_id AND definition.id=p_catalog_gram_reference_id AND definition.kind='gold_gram'
     AND value.set_id=p_set_id AND value.active AND value.rate_try>0) THEN
   RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
 END IF;
 FOR selected IN
   SELECT grams.variant_id AS id,grams.product_id,grams.policy FROM saas.pricing_catalog_gram_candidates(p_store_id,p_catalog_gram_reference_id) grams
   UNION ALL
   SELECT variant.id,variant.product_id,NULL::jsonb FROM saas.pricing_variant_policy_state state
   JOIN saas.pricing_variant_policy_versions policy ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id AND policy.version=state.current_version
   JOIN saas.product_variants variant ON variant.store_id=state.store_id AND variant.id=state.variant_id
   JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
   WHERE state.store_id=p_store_id AND policy.method<>'fixed_try' AND variant.status='active' AND product.status='active'
   ORDER BY id
 LOOP
   affected_count:=affected_count+1;
   IF NOT selected.product_id=ANY(seen_products) THEN seen_products:=pg_catalog.array_append(seen_products,selected.product_id); END IF;
   SELECT * INTO old_price FROM saas.resolve_effective_variant_price(p_store_id,selected.id,p_channel,p_now,NULL::text);
   IF selected.policy IS NULL THEN SELECT * INTO candidate FROM saas.pricing_calculate_variant_price(p_store_id,selected.id,p_set_id);
   ELSE SELECT * INTO candidate FROM saas.pricing_calculate_policy_candidate(p_store_id,selected.id,selected.policy,p_set_id); END IF;
   is_override:=COALESCE(old_price.source_kind='price_list',false);
   IF is_override THEN override_count:=override_count+1; END IF;
   IF candidate.outcome<>'found' THEN unavailable_count:=unavailable_count+1; END IF;
   IF p_after_variant_id IS NOT NULL AND selected.id<=p_after_variant_id THEN CONTINUE; END IF;
   IF page_count>=p_page_size THEN has_more:=true; CONTINUE; END IF;
   entries:=entries||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('variantId',selected.id,'productId',selected.product_id,
     'oldPriceCents',CASE WHEN old_price.outcome='found' THEN old_price.price_cents ELSE NULL END,
     'newPriceCents',CASE WHEN is_override THEN old_price.price_cents WHEN candidate.outcome='found'
       THEN candidate.price_cents ELSE NULL END,'overriddenByPriceList',is_override));
   page_count:=page_count+1; last_id:=selected.id;
 END LOOP;
 RETURN QUERY SELECT 'previewed',pg_catalog.jsonb_build_object('setId',p_set_id,
   'scopeDigest',saas.pricing_catalog_gram_scope_digest(p_store_id,p_set_id,p_catalog_gram_reference_id,p_now),
   'affectedProducts',pg_catalog.cardinality(seen_products),'affectedVariants',affected_count,
   'fixedOverrideVariants',override_count,'unavailableVariants',unavailable_count,'entries',entries,
   'nextCursor',CASE WHEN has_more THEN last_id ELSE NULL::uuid END);
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,jsonb)')),'UTF8')),'hex')<>'9c26ec2e278509fd1448ad65120fb7036c4a80f3c4cb1868352d01b092f8b9b3' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,jsonb)',pg_get_functiondef(p.oid),'9c26ec2e278509fd1448ad65120fb7036c4a80f3c4cb1868352d01b092f8b9b3',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_variant_policy_save(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_variant_id uuid, p_expected_variant_version bigint, p_expected_policy_version bigint, p_policy jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE;
  selected_variant saas.product_variants%ROWTYPE; selected_state saas.pricing_variant_policy_state%ROWTYPE;
  selected_reference saas.pricing_reference_definitions%ROWTYPE; selected_value saas.pricing_reference_set_values%ROWTYPE;
  method text; selected_labor text; next_policy_version bigint; projected jsonb;
  component numeric; labor_component numeric; estimated numeric;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'pricing_variant_policy_save');
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_variant_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_variant_version IS NULL OR p_expected_variant_version<1
    OR p_expected_policy_version IS NULL OR p_expected_policy_version<0
    OR NOT saas.pricing_variant_policy_valid(p_policy) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='policy_save'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
      CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='policy_save'
        AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END;
    RETURN;
  END IF;
  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_state FROM saas.pricing_variant_policy_state state
  WHERE state.store_id=p_store_id AND state.variant_id=p_variant_id FOR UPDATE;
  IF selected_variant.version<>p_expected_variant_version
    OR COALESCE(selected_state.current_version,0)<>p_expected_policy_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF selected_variant.version>=9007199254740991 OR p_expected_policy_version>=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  method:=p_policy->>'method'; selected_labor:=COALESCE(p_policy->>'laborMode','none');
  IF method<>'fixed_try' AND NOT EXISTS (
    SELECT 1 FROM saas.pricing_dynamic_activation
    WHERE store_id=p_store_id AND enabled) THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
  END IF;
  IF method<>'fixed_try' THEN
    SELECT definition.* INTO selected_reference FROM saas.pricing_reference_definitions definition
    WHERE definition.store_id=p_store_id AND definition.id=(p_policy->>'referenceId')::uuid;
    IF NOT FOUND OR selected_reference.kind<>method OR (method='gold_gram'
      AND p_policy->>'purityMode'='ratio' AND selected_reference.reference_purity IS NULL) THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
    SELECT value.* INTO selected_value FROM saas.pricing_reference_state state
    JOIN saas.pricing_reference_set_values value ON value.store_id=state.store_id
      AND value.set_id=state.active_set_id AND value.reference_id=selected_reference.id
    WHERE state.store_id=p_store_id;
    IF FOUND AND selected_value.active AND selected_value.rate_try IS NOT NULL THEN
      IF method='gold_gram' THEN
        component:=(p_policy->>'metalGrams')::numeric*selected_value.rate_try;
        IF p_policy->>'purityMode'='ratio' THEN
          component:=component*(p_policy->>'productPurity')::numeric/selected_reference.reference_purity;
        END IF;
      ELSE
        component:=(p_policy->>'sourceAmount')::numeric*selected_value.rate_try;
      END IF;
      labor_component:=CASE selected_labor
        WHEN 'per_item_try' THEN (p_policy->>'laborAmount')::numeric
        WHEN 'per_gram_try' THEN (p_policy->>'metalGrams')::numeric*(p_policy->>'laborAmount')::numeric
        ELSE 0::numeric END;
      estimated:=component*(1+COALESCE(p_policy->>'upliftPercent','0')::numeric/100)+labor_component;
      IF estimated<0 OR estimated>80000000 OR pg_catalog.round(estimated*100,0)>8000000000 THEN
        RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
      END IF;
    END IF;
  END IF;
  next_policy_version:=p_expected_policy_version+1;
  INSERT INTO saas.pricing_variant_policy_versions(store_id,variant_id,version,method,
    fixed_price_cents,source_amount,metal_grams,reference_id,purity_mode,product_purity,
    labor_mode,labor_amount,uplift_percent,allow_full_discount,policy_payload,created_by,created_at)
  VALUES(p_store_id,p_variant_id,next_policy_version,method,
    CASE WHEN method='fixed_try' THEN (p_policy->>'fixedPriceCents')::bigint ELSE NULL END,
    CASE WHEN method IN ('usd','eur') THEN (p_policy->>'sourceAmount')::numeric ELSE NULL END,
    CASE WHEN method='gold_gram' THEN (p_policy->>'metalGrams')::numeric ELSE NULL END,
    CASE WHEN method='fixed_try' THEN NULL ELSE (p_policy->>'referenceId')::uuid END,
    CASE WHEN method='gold_gram' THEN p_policy->>'purityMode' ELSE NULL END,
    CASE WHEN method='gold_gram' AND p_policy->>'purityMode'='ratio' THEN (p_policy->>'productPurity')::numeric ELSE NULL END,
    CASE WHEN method='fixed_try' THEN NULL ELSE selected_labor END,
    CASE WHEN method='fixed_try' THEN NULL ELSE COALESCE(p_policy->>'laborAmount','0')::numeric END,
    CASE WHEN method='fixed_try' THEN NULL ELSE COALESCE(p_policy->>'upliftPercent','0')::numeric END,
    CASE WHEN method='gold_gram' THEN COALESCE((p_policy->>'allowFullDiscount')::boolean,false) ELSE false END,
    p_policy,p_principal_id,p_now);
  INSERT INTO saas.pricing_variant_policy_state(store_id,variant_id,current_version)
  VALUES(p_store_id,p_variant_id,next_policy_version)
  ON CONFLICT (store_id,variant_id) DO UPDATE SET current_version=EXCLUDED.current_version;
  UPDATE saas.product_variants variant SET
    version=variant.version+1,
    updated_at=p_now,
    price_cents=CASE WHEN method='fixed_try' THEN (p_policy->>'fixedPriceCents')::bigint ELSE variant.price_cents END
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id;
  projected:=saas.pricing_variant_policy_projection(p_store_id,p_variant_id);
  INSERT INTO saas.pricing_reference_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'policy_save',p_fingerprint,projected,p_now);
  RETURN QUERY SELECT 'policy_saved',projected;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_reference_set_activate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_reference_set_activate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid)')),'UTF8')),'hex')<>'386ac9d0af57ec511ae86f942f7fc4e1e4e3c06b41b5632c8316df916e45b7a0' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_reference_set_activate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_reference_set_activate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid)',pg_get_functiondef(p.oid),'386ac9d0af57ec511ae86f942f7fc4e1e4e3c06b41b5632c8316df916e45b7a0',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_reference_set_activate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,uuid)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_reference_set_activate_v2(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_set_id uuid, p_expected_state_version bigint, p_expected_scope_digest text, p_catalog_gram_reference_id uuid)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE; previewed record; candidate record; selected record; activated record;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'pricing_reference_set_activate_v2');
 IF p_catalog_gram_reference_id IS NULL THEN
   RETURN QUERY SELECT * FROM saas.pricing_reference_set_activate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
     p_plan_version,p_now,p_operation_id,p_fingerprint,p_set_id,p_expected_state_version,p_expected_scope_digest); RETURN;
 END IF;
 authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,
   p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_set_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
   OR p_expected_state_version IS NULL OR p_expected_state_version<0 OR p_expected_scope_digest IS NULL
   OR p_expected_scope_digest!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
   RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='activate' AND prior.payload_fingerprint=p_fingerprint
     THEN 'operation_replayed' ELSE 'operation_mismatch' END,
     CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='activate' AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END; RETURN;
 END IF;
 PERFORM 1 FROM saas.pricing_reference_state WHERE store_id=p_store_id AND version=p_expected_state_version FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 -- Protect weights/statuses even against concurrent owner maintenance that omits the catalog lock.
 PERFORM variant.id FROM saas.product_variants variant JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
   WHERE variant.store_id=p_store_id ORDER BY variant.id FOR UPDATE OF variant FOR SHARE OF product;
 SELECT * INTO previewed FROM saas.pricing_reference_set_preview_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
   p_plan_version,p_now,p_set_id,'storefront',1,NULL::uuid,p_catalog_gram_reference_id);
 IF previewed.outcome<>'previewed' THEN RETURN QUERY SELECT previewed.outcome::text,NULL::jsonb; RETURN; END IF;
 IF previewed.result_payload->>'scopeDigest' IS DISTINCT FROM p_expected_scope_digest THEN
   RETURN QUERY SELECT 'scope_conflict',NULL::jsonb; RETURN;
 END IF;
 FOR selected IN SELECT * FROM saas.pricing_catalog_gram_candidates(p_store_id,p_catalog_gram_reference_id) LOOP
   IF selected.variant_version>=9007199254740991 OR selected.policy_version>=9007199254740991 THEN
     RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
   END IF;
   SELECT * INTO candidate FROM saas.pricing_calculate_policy_candidate(p_store_id,selected.variant_id,selected.policy,p_set_id);
   IF candidate.outcome<>'found' OR candidate.price_cents IS NULL THEN
     RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
   END IF;
 END LOOP;
 SELECT * INTO activated FROM saas.pricing_reference_set_activate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
   p_now,p_operation_id,p_fingerprint,p_set_id,p_expected_state_version,saas.pricing_reference_scope_digest(p_store_id,p_set_id,p_now));
 IF activated.outcome<>'activated' THEN RETURN QUERY SELECT activated.outcome::text,activated.result_payload::jsonb; RETURN; END IF;
 -- Batch the canonical immutable policy rows; pricing arithmetic remains in SQL133's calculator.
 WITH candidates AS MATERIALIZED (SELECT * FROM saas.pricing_catalog_gram_candidates(p_store_id,p_catalog_gram_reference_id)), inserted AS (
   INSERT INTO saas.pricing_variant_policy_versions(store_id,variant_id,version,method,fixed_price_cents,source_amount,metal_grams,
     reference_id,purity_mode,product_purity,labor_mode,labor_amount,uplift_percent,allow_full_discount,policy_payload,created_by,created_at)
   SELECT p_store_id,variant_id,policy_version+1,'gold_gram',NULL,NULL,(policy->>'metalGrams')::numeric,p_catalog_gram_reference_id,
     'direct',NULL,'none',0,0,false,policy,p_principal_id,p_now FROM candidates RETURNING variant_id,version
 ), saved_state AS (
   INSERT INTO saas.pricing_variant_policy_state(store_id,variant_id,current_version) SELECT p_store_id,variant_id,version FROM inserted
   ON CONFLICT(store_id,variant_id) DO UPDATE SET current_version=EXCLUDED.current_version RETURNING variant_id
 ) UPDATE saas.product_variants variant SET version=variant.version+1,updated_at=p_now
   FROM saved_state WHERE variant.store_id=p_store_id AND variant.id=saved_state.variant_id;
 RETURN QUERY SELECT 'activated',activated.result_payload::jsonb;
EXCEPTION WHEN OTHERS THEN
 -- The function's subtransaction rolls back the reference pointer, ledger and every policy on failure.
 RETURN QUERY SELECT 'unavailable',NULL::jsonb;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.pricing_variant_policy_save_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,jsonb,text)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.pricing_variant_policy_save_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,jsonb,text)')),'UTF8')),'hex')<>'0e2b92bdaec393b68f9ed313e166f70815a7416ce0b5e0504ebf8546ba476c31' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.pricing_variant_policy_save_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,jsonb,text)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.pricing_variant_policy_save_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,jsonb,text)',pg_get_functiondef(p.oid),'0e2b92bdaec393b68f9ed313e166f70815a7416ce0b5e0504ebf8546ba476c31',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.pricing_variant_policy_save_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,bigint,jsonb,text)');END $patch$;
CREATE OR REPLACE FUNCTION saas.pricing_variant_policy_save_v2(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_variant_id uuid, p_expected_variant_version bigint, p_expected_policy_version bigint, p_policy jsonb, p_expected_scope_digest text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; prior saas.pricing_reference_operations%ROWTYPE; candidate record; saved record;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'reference_pricing') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_variant_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_variant_version IS NULL OR p_expected_variant_version<1
    OR p_expected_policy_version IS NULL OR p_expected_policy_version<0
    OR p_expected_scope_digest IS NULL OR p_expected_scope_digest!~'^[a-f0-9]{64}$'
    OR NOT saas.pricing_variant_policy_valid(p_policy) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.pricing.operation:'||p_operation_id::text,0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:'||p_store_id::text,0));
  SELECT * INTO prior FROM saas.pricing_reference_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='policy_save'
      AND prior.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
      CASE WHEN prior.store_id=p_store_id AND prior.operation_kind='policy_save'
        AND prior.payload_fingerprint=p_fingerprint THEN prior.result_payload ELSE NULL::jsonb END; RETURN;
  END IF;
  PERFORM 1 FROM saas.product_variants variant WHERE variant.store_id=p_store_id AND variant.id=p_variant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO candidate FROM saas.pricing_variant_policy_preview(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_variant_id,p_policy,'storefront');
  IF candidate.outcome<>'previewed' THEN RETURN QUERY SELECT candidate.outcome::text,NULL::jsonb; RETURN; END IF;
  IF (candidate.result_payload->>'variantVersion')::bigint<>p_expected_variant_version
    OR (candidate.result_payload->>'policyVersion')::bigint<>p_expected_policy_version THEN
    RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN;
  END IF;
  IF candidate.result_payload->>'scopeDigest' IS DISTINCT FROM p_expected_scope_digest THEN
    RETURN QUERY SELECT 'scope_conflict',NULL::jsonb; RETURN;
  END IF;
  IF candidate.result_payload->'newPriceCents'='null'::jsonb THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO saved FROM saas.pricing_variant_policy_save(p_store_id,p_principal_id,
    p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,
    p_variant_id,p_expected_variant_version,p_expected_policy_version,p_policy);
  RETURN QUERY SELECT saved.outcome::text,saved.result_payload::jsonb;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.store_engagement_campaign_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,boolean,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.store_engagement_campaign_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,boolean,jsonb)')),'UTF8')),'hex')<>'c8fb71dde1c0888c85feb1b15ac4c5afa3128bb7b5d07e63d2d07f7d08f5cd7c' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.store_engagement_campaign_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,boolean,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.store_engagement_campaign_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,boolean,jsonb)',pg_get_functiondef(p.oid),'c8fb71dde1c0888c85feb1b15ac4c5afa3128bb7b5d07e63d2d07f7d08f5cd7c',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.store_engagement_campaign_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,boolean,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.store_engagement_campaign_save(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation uuid, p_fingerprint text, p_campaign uuid, p_expected_version bigint, p_kind text, p_name text, p_enabled boolean, p_config jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;op saas.store_engagement_admin_operations;c saas.store_engagement_campaigns;request jsonb;result jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store AND plan_id=p_plan AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.manage');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_now IS NULL OR NOT isfinite(p_now)
 OR p_kind IS NULL OR p_kind NOT IN('popup','cart_capture') OR p_name IS NULL OR p_name<>btrim(p_name) OR char_length(p_name) NOT BETWEEN 1 AND 160 OR p_name~'[[:cntrl:]]'
 OR p_enabled IS NULL OR(p_campaign IS NULL)<>(p_expected_version IS NULL) OR p_expected_version IS NOT NULL AND p_expected_version NOT BETWEEN 1 AND 9007199254740991
 OR saas.store_engagement_config_valid(p_config) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 request:=jsonb_build_object('campaignId',p_campaign,'expectedVersion',p_expected_version,'kind',p_kind,'name',p_name,'enabled',p_enabled,'config',p_config);
 PERFORM pg_advisory_xact_lock(hashtextextended('store-engagement-save:'||p_store::text,215));
 SELECT * INTO op FROM saas.store_engagement_admin_operations WHERE store_id=p_store AND operation_id=p_operation;
 IF FOUND THEN IF op.principal_id<>p_principal OR op.fingerprint<>p_fingerprint OR op.request_payload<>request THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;RETURN;END IF;
 IF p_config?'image' AND saas.store_engagement_image_url(p_store,p_config) IS NULL
 AND NOT(p_enabled=false AND p_campaign IS NOT NULL AND EXISTS(SELECT 1 FROM saas.store_engagement_campaigns prior WHERE prior.store_id=p_store AND prior.id=p_campaign AND prior.kind=p_kind AND prior.version=p_expected_version AND prior.config->'image'=p_config->'image'))
 THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb;RETURN;END IF;
 -- Turning off an existing campaign remains possible after its linked coupon expires.
 IF p_config?'promotionId' THEN
  IF NOT EXISTS(SELECT 1 FROM saas.promotions WHERE store_id=p_store AND id=(p_config->>'promotionId')::uuid AND NOT saas.promotion_is_deleted_v1(p_store,(p_config->>'promotionId')::uuid))
  AND NOT(p_enabled=false AND p_campaign IS NOT NULL AND EXISTS(SELECT 1 FROM saas.store_engagement_campaigns prior WHERE prior.store_id=p_store AND prior.id=p_campaign AND prior.kind=p_kind AND prior.version=p_expected_version AND prior.config->'promotionId'=p_config->'promotionId'))
  THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb;RETURN;END IF;
  IF p_enabled AND saas.store_engagement_coupon(p_store,(p_config->>'promotionId')::uuid,p_now) IS NULL THEN RETURN QUERY SELECT 'promotion_unavailable',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_campaign IS NULL THEN
  IF p_kind='popup' AND(SELECT count(*) FROM saas.store_engagement_campaigns WHERE store_id=p_store AND kind='popup')>=20 THEN RETURN QUERY SELECT 'limit_exceeded',NULL::jsonb;RETURN;END IF;
  IF p_kind='cart_capture' AND EXISTS(SELECT 1 FROM saas.store_engagement_campaigns WHERE store_id=p_store AND kind='cart_capture') THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.store_engagement_campaigns(store_id,kind,name,enabled,config,created_by,updated_by,created_at,updated_at) VALUES(p_store,p_kind,p_name,p_enabled,p_config,p_principal,p_principal,date_trunc('milliseconds',p_now),date_trunc('milliseconds',p_now)) RETURNING * INTO c;
 ELSE
  SELECT * INTO c FROM saas.store_engagement_campaigns WHERE store_id=p_store AND id=p_campaign FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF c.version<>p_expected_version OR c.kind<>p_kind THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF c.version>=9007199254740991 OR p_now<c.updated_at THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  UPDATE saas.store_engagement_campaigns SET name=p_name,enabled=p_enabled,config=p_config,version=version+1,updated_by=p_principal,updated_at=date_trunc('milliseconds',p_now) WHERE store_id=p_store AND id=c.id RETURNING * INTO c;
 END IF;
 result:=saas.store_engagement_projection(c);
 INSERT INTO saas.store_engagement_admin_operations VALUES(p_store,p_operation,p_principal,p_fingerprint,request,result,date_trunc('milliseconds',p_now));
 RETURN QUERY SELECT 'saved',result;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.commerce_analytics_snapshot(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.commerce_analytics_snapshot(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)')),'UTF8')),'hex')<>'a7bc46a1c6d4e95fba073ffaeaf3b68a5e2f234f945bfc86866258943b701707' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.commerce_analytics_snapshot(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.commerce_analytics_snapshot(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)',pg_get_functiondef(p.oid),'a7bc46a1c6d4e95fba073ffaeaf3b68a5e2f234f945bfc86866258943b701707',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.commerce_analytics_snapshot(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.commerce_analytics_snapshot(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_filters jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'advanced_analytics') AND coalesce(p_filters->>'view','overview') NOT IN('overview','status') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','analytics.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_start_at>=p_end_at OR p_end_at>p_now OR p_end_at-p_start_at>interval '13 months'
    OR p_filters IS NULL OR pg_catalog.jsonb_typeof(p_filters)<>'object'
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_filters) key WHERE key<>ALL(ARRAY['view','device','source','campaign','productId','categoryId','currency','touch','search','lifecycle','contact','brandId','minimumValueMinor','maximumValueMinor','productPage','cartPage','timezone']))
    OR (p_filters ? 'view' AND p_filters->>'view' NOT IN ('overview','funnel','abandoned-carts','acquisition','products','status'))
    OR (p_filters ? 'minimumValueMinor' AND pg_catalog.jsonb_typeof(p_filters->'minimumValueMinor')<>'number')
    OR (p_filters ? 'maximumValueMinor' AND pg_catalog.jsonb_typeof(p_filters->'maximumValueMinor')<>'number')
    OR (p_filters ? 'productPage' AND (pg_catalog.jsonb_typeof(p_filters->'productPage')<>'number'
      OR (p_filters->>'productPage')::numeric<>pg_catalog.trunc((p_filters->>'productPage')::numeric)
      OR (p_filters->>'productPage')::numeric NOT BETWEEN 1 AND 100000))
    OR (p_filters ? 'cartPage' AND (pg_catalog.jsonb_typeof(p_filters->'cartPage')<>'number'
      OR (p_filters->>'cartPage')::numeric<>pg_catalog.trunc((p_filters->>'cartPage')::numeric)
      OR (p_filters->>'cartPage')::numeric NOT BETWEEN 1 AND 100000))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  RETURN QUERY WITH payment_events AS (
    SELECT orders.id AS order_id,orders.paid_at AS captured_at
    FROM saas.orders orders
    WHERE orders.store_id=p_store_id AND orders.paid_at>=p_start_at AND orders.paid_at<p_end_at
      AND COALESCE(p_filters->>'view','all')<>'status'
  ), refund_events AS (
    SELECT orders.id AS order_id,orders.refunded_at
    FROM saas.orders orders
    WHERE orders.store_id=p_store_id AND orders.refunded_at>=p_start_at AND orders.refunded_at<p_end_at
      AND COALESCE(p_filters->>'view','all')<>'status'
  ), order_scope AS (
    SELECT orders.*
    FROM saas.orders orders
    LEFT JOIN saas.order_commerce_attribution attribution
      ON attribution.store_id=orders.store_id AND attribution.order_id=orders.id
    WHERE orders.store_id=p_store_id AND COALESCE(p_filters->>'view','all')<>'status'
      AND (
        orders.paid_at>=p_start_at AND orders.paid_at<p_end_at
        OR orders.refunded_at>=p_start_at AND orders.refunded_at<p_end_at
        OR EXISTS(SELECT 1 FROM saas.order_events period_event
          WHERE period_event.store_id=orders.store_id AND period_event.order_id=orders.id
            AND period_event.created_at>=p_start_at AND period_event.created_at<p_end_at
            AND period_event.event_type='payment_transition' AND period_event.to_value='failed')
        OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episodes period_episode
          WHERE period_episode.store_id=orders.store_id AND period_episode.linked_order_id=orders.id
            AND period_episode.recovered_at>=p_start_at AND period_episode.recovered_at<p_end_at)
      )
      AND (NOT p_filters ? 'currency' OR orders.currency=p_filters->>'currency')
      AND (NOT p_filters ? 'source' OR CASE COALESCE(p_filters->>'touch','last')
        WHEN 'first' THEN COALESCE(attribution.first_touch_source,'unknown')
        ELSE COALESCE(attribution.last_touch_source,'unknown') END=p_filters->>'source')
      AND (NOT p_filters ? 'campaign' OR CASE COALESCE(p_filters->>'touch','last')
        WHEN 'first' THEN attribution.first_touch_campaign ELSE attribution.last_touch_campaign END=p_filters->>'campaign')
      AND (NOT p_filters ? 'device' OR COALESCE(attribution.device_group,'unknown')=p_filters->>'device')
      AND (NOT p_filters ? 'productId' OR EXISTS(SELECT 1 FROM saas.order_items item WHERE item.store_id=orders.store_id AND item.order_id=orders.id AND item.product_id=(p_filters->>'productId')::uuid))
      AND (NOT p_filters ? 'categoryId' OR EXISTS(SELECT 1 FROM saas.order_items item JOIN saas.catalog_product_categories relation ON relation.store_id=item.store_id AND relation.product_id=item.product_id AND relation.category_id=(p_filters->>'categoryId')::uuid WHERE item.store_id=orders.store_id AND item.order_id=orders.id))
      AND (NOT p_filters ? 'brandId' OR EXISTS(SELECT 1 FROM saas.order_items item JOIN saas.catalog_admin_resource_products relation ON relation.store_id=item.store_id AND relation.product_id=item.product_id AND relation.resource_id=(p_filters->>'brandId')::uuid WHERE item.store_id=orders.store_id AND item.order_id=orders.id))
      AND (NOT p_filters ? 'search' OR EXISTS(SELECT 1 FROM saas.order_items item WHERE item.store_id=orders.store_id AND item.order_id=orders.id AND pg_catalog.lower(item.product_name) LIKE '%'||pg_catalog.lower(p_filters->>'search')||'%'))
  ), cart_scope AS (
    SELECT cart.*
    FROM saas.abandoned_carts cart
    WHERE cart.store_id=p_store_id AND COALESCE(p_filters->>'view','all') IN ('all','overview','abandoned-carts')
      AND (cart.last_activity_at>=p_start_at AND cart.last_activity_at<p_end_at
        OR cart.candidate_at>=p_start_at AND cart.candidate_at<p_end_at
        OR cart.abandoned_at>=p_start_at AND cart.abandoned_at<p_end_at
        OR cart.recovered_at>=p_start_at AND cart.recovered_at<p_end_at)
      AND (NOT p_filters ? 'currency' OR cart.currency=p_filters->>'currency')
      AND (NOT p_filters ? 'source' OR CASE COALESCE(p_filters->>'touch','last') WHEN 'first' THEN COALESCE(cart.first_touch_source,'unknown') ELSE COALESCE(cart.last_touch_source,'unknown') END=p_filters->>'source')
      AND (NOT p_filters ? 'campaign' OR CASE COALESCE(p_filters->>'touch','last') WHEN 'first' THEN cart.first_touch_campaign ELSE cart.last_touch_campaign END=p_filters->>'campaign')
      AND (NOT p_filters ? 'device' OR COALESCE(cart.device_group,'unknown')=p_filters->>'device')
      AND (NOT p_filters ? 'lifecycle' OR cart.lifecycle_status=p_filters->>'lifecycle')
      AND (NOT p_filters ? 'contact' OR CASE p_filters->>'contact' WHEN 'contactable' THEN cart.customer_email IS NOT NULL OR cart.customer_phone IS NOT NULL WHEN 'unavailable' THEN cart.customer_email IS NULL AND cart.customer_phone IS NULL ELSE false END)
      AND (NOT p_filters ? 'minimumValueMinor' OR cart.total_cents>=(p_filters->>'minimumValueMinor')::bigint)
      AND (NOT p_filters ? 'maximumValueMinor' OR cart.total_cents<=(p_filters->>'maximumValueMinor')::bigint)
      AND (NOT p_filters ? 'productId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_items item WHERE item.store_id=cart.store_id AND item.cart_id=cart.id AND item.product_id=(p_filters->>'productId')::uuid))
      AND (NOT p_filters ? 'categoryId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_items item JOIN saas.catalog_product_categories relation ON relation.store_id=item.store_id AND relation.product_id=item.product_id AND relation.category_id=(p_filters->>'categoryId')::uuid WHERE item.store_id=cart.store_id AND item.cart_id=cart.id))
      AND (NOT p_filters ? 'brandId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_items item JOIN saas.catalog_admin_resource_products relation ON relation.store_id=item.store_id AND relation.product_id=item.product_id AND relation.resource_id=(p_filters->>'brandId')::uuid WHERE item.store_id=cart.store_id AND item.cart_id=cart.id))
      AND (NOT p_filters ? 'search' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_items item WHERE item.store_id=cart.store_id AND item.cart_id=cart.id AND pg_catalog.lower(item.product_name) LIKE '%'||pg_catalog.lower(p_filters->>'search')||'%'))
  ), episode_scope AS (
    SELECT episode.*
    FROM saas.abandoned_cart_episodes episode
    JOIN saas.abandoned_carts cart ON cart.store_id=episode.store_id AND cart.id=episode.cart_id
    WHERE episode.store_id=p_store_id AND COALESCE(p_filters->>'view','all') IN ('all','overview','abandoned-carts','acquisition','products')
      AND (episode.candidate_at>=p_start_at AND episode.candidate_at<p_end_at
        OR episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at
        OR episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at)
      AND (NOT p_filters ? 'currency' OR episode.currency=p_filters->>'currency')
      AND (NOT p_filters ? 'source' OR CASE COALESCE(p_filters->>'touch','last')
        WHEN 'first' THEN COALESCE(episode.first_touch->>'source','unknown')
        ELSE COALESCE(episode.last_touch->>'source','unknown') END=p_filters->>'source')
      AND (NOT p_filters ? 'campaign' OR CASE COALESCE(p_filters->>'touch','last')
        WHEN 'first' THEN episode.first_touch->>'campaign' ELSE episode.last_touch->>'campaign' END=p_filters->>'campaign')
      AND (NOT p_filters ? 'device' OR COALESCE(CASE COALESCE(p_filters->>'touch','last')
        WHEN 'first' THEN episode.first_touch->>'device' ELSE episode.last_touch->>'device' END,'unknown')=p_filters->>'device')
      AND (NOT p_filters ? 'lifecycle' OR cart.lifecycle_status=p_filters->>'lifecycle')
      AND (NOT p_filters ? 'contact' OR CASE p_filters->>'contact'
        WHEN 'contactable' THEN cart.customer_email IS NOT NULL OR cart.customer_phone IS NOT NULL
        WHEN 'unavailable' THEN cart.customer_email IS NULL AND cart.customer_phone IS NULL ELSE false END)
      AND (NOT p_filters ? 'minimumValueMinor' OR episode.value_minor>=(p_filters->>'minimumValueMinor')::bigint)
      AND (NOT p_filters ? 'maximumValueMinor' OR episode.value_minor<=(p_filters->>'maximumValueMinor')::bigint)
      AND (NOT p_filters ? 'productId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episode_items item WHERE item.store_id=episode.store_id AND item.episode_id=episode.id AND item.product_id=(p_filters->>'productId')::uuid))
      AND (NOT p_filters ? 'categoryId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episode_items item WHERE item.store_id=episode.store_id AND item.episode_id=episode.id AND item.category_id=(p_filters->>'categoryId')::uuid))
      AND (NOT p_filters ? 'brandId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episode_items item WHERE item.store_id=episode.store_id AND item.episode_id=episode.id AND item.brand_id=(p_filters->>'brandId')::uuid))
      AND (NOT p_filters ? 'search' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episode_items item WHERE item.store_id=episode.store_id AND item.episode_id=episode.id AND pg_catalog.lower(item.product_name) LIKE '%'||pg_catalog.lower(p_filters->>'search')||'%'))
  ), checkout_items AS (
    SELECT snapshot.id AS snapshot_id,
      COALESCE(snapshot.attribution_snapshot->>'anonymousSessionRef','legacy_'||snapshot.id::text) AS session_key,
      snapshot.cart_id,snapshot.intent_id,snapshot.currency,snapshot.started_at AS checkout_started_at,
      (entry.value->>'productId')::uuid AS product_id,(entry.value->>'variantId')::uuid AS variant_id,
      entry.value->>'title' AS product_name,
      COALESCE((entry.value->>'categoryId')::uuid,(SELECT relation.category_id FROM saas.catalog_product_categories relation
        WHERE relation.store_id=snapshot.store_id AND relation.product_id=(entry.value->>'productId')::uuid ORDER BY relation.position,relation.category_id LIMIT 1)) AS category_id,
      (SELECT relation.resource_id FROM saas.catalog_admin_resource_products relation
        JOIN saas.catalog_admin_resources resource ON resource.store_id=relation.store_id AND resource.id=relation.resource_id AND resource.resource_kind='brand'
        WHERE relation.store_id=snapshot.store_id AND relation.product_id=(entry.value->>'productId')::uuid ORDER BY relation.position,relation.resource_id LIMIT 1) AS brand_id,
      COALESCE(snapshot.attribution_snapshot->>'firstTouchSource','unknown') AS first_touch_source,
      snapshot.attribution_snapshot->>'firstTouchCampaign' AS first_touch_campaign,
      COALESCE(snapshot.attribution_snapshot->>'lastTouchSource','unknown') AS last_touch_source,
      snapshot.attribution_snapshot->>'lastTouchCampaign' AS last_touch_campaign,
      COALESCE(snapshot.attribution_snapshot->>'deviceGroup','unknown') AS device_group
    FROM saas.storefront_checkout_start_snapshots snapshot
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(snapshot.item_snapshot) entry(value)
    WHERE snapshot.store_id=p_store_id AND snapshot.started_at>=p_start_at AND snapshot.started_at<p_end_at
      AND COALESCE(p_filters->>'view','all') IN ('all','overview','funnel','abandoned-carts','products')
  ), checkout_scope AS (
    SELECT item.* FROM checkout_items item
    WHERE (NOT p_filters ? 'currency' OR item.currency=p_filters->>'currency')
      AND (NOT p_filters ? 'source' OR CASE COALESCE(p_filters->>'touch','last') WHEN 'first' THEN item.first_touch_source ELSE item.last_touch_source END=p_filters->>'source')
      AND (NOT p_filters ? 'campaign' OR CASE COALESCE(p_filters->>'touch','last') WHEN 'first' THEN item.first_touch_campaign ELSE item.last_touch_campaign END=p_filters->>'campaign')
      AND (NOT p_filters ? 'device' OR item.device_group=p_filters->>'device')
      AND (NOT p_filters ? 'productId' OR item.product_id=(p_filters->>'productId')::uuid)
      AND (NOT p_filters ? 'categoryId' OR item.category_id=(p_filters->>'categoryId')::uuid)
      AND (NOT p_filters ? 'brandId' OR item.brand_id=(p_filters->>'brandId')::uuid)
      AND (NOT p_filters ? 'search' OR pg_catalog.lower(item.product_name) LIKE '%'||pg_catalog.lower(p_filters->>'search')||'%')
  ), checkout_start_scope AS (
    SELECT item.session_key,item.currency,MIN(item.checkout_started_at) AS checkout_started_at
    FROM checkout_scope item GROUP BY item.session_key,item.currency
  ), paid_order_metrics AS (
    SELECT orders.currency,COUNT(*) AS paid,COALESCE(SUM(orders.total_cents),0) AS gross
    FROM order_scope orders JOIN payment_events payment ON payment.order_id=orders.id
    WHERE payment.captured_at>=p_start_at AND payment.captured_at<p_end_at GROUP BY orders.currency
  ), refund_metrics AS (
    SELECT orders.currency,COALESCE(SUM(orders.total_cents),0) AS refunded
    FROM order_scope orders JOIN refund_events refund ON refund.order_id=orders.id
    WHERE refund.refunded_at>=p_start_at AND refund.refunded_at<p_end_at GROUP BY orders.currency
  ), order_metrics AS (
    SELECT currencies.currency,COALESCE(paid.paid,0) AS paid,COALESCE(paid.gross,0) AS gross,COALESCE(refund.refunded,0) AS refunded
    FROM (SELECT currency FROM paid_order_metrics UNION SELECT currency FROM refund_metrics) currencies
    LEFT JOIN paid_order_metrics paid USING(currency) LEFT JOIN refund_metrics refund USING(currency)
  ), recovery AS (
    SELECT episode.currency,COUNT(DISTINCT episode.cart_id) AS abandoned,
      COALESCE(SUM(episode.value_minor),0) AS abandoned_value,
      COUNT(DISTINCT episode.cart_id) FILTER(WHERE episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at) AS recovered,
      COALESCE(SUM(orders.total_cents) FILTER(WHERE episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at AND orders.paid_at IS NOT NULL),0) AS recovered_gross,
      COALESCE(SUM(orders.total_cents) FILTER(WHERE orders.refunded_at>=p_start_at AND orders.refunded_at<p_end_at),0) AS recovered_refunded
    FROM episode_scope episode
      LEFT JOIN order_scope orders ON orders.store_id=episode.store_id AND orders.id=episode.linked_order_id
    WHERE episode.store_id=p_store_id AND episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at GROUP BY episode.currency
  ), eligible_metrics AS (
    SELECT episode.currency,COUNT(DISTINCT episode.cart_id) AS eligible
    FROM episode_scope episode
    WHERE episode.store_id=p_store_id AND (
      (episode.candidate_at>=p_start_at AND episode.candidate_at<p_end_at)
      OR (episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at)
    )
    GROUP BY episode.currency
  ), cart_metrics AS (
    SELECT currency,
      COUNT(DISTINCT id) FILTER(WHERE lifecycle_status IN ('active','resumed') AND last_activity_at>=p_start_at AND last_activity_at<p_end_at) AS active,
      COUNT(DISTINCT id) FILTER(WHERE lifecycle_status='candidate' AND candidate_at>=p_start_at AND candidate_at<p_end_at) AS candidate
    FROM cart_scope GROUP BY currency
    HAVING COUNT(*) FILTER(WHERE lifecycle_status IN ('active','resumed') AND last_activity_at>=p_start_at AND last_activity_at<p_end_at)>0
      OR COUNT(*) FILTER(WHERE candidate_at>=p_start_at AND candidate_at<p_end_at)>0
  ), checkout_metrics AS (
    SELECT checkout.currency,COUNT(DISTINCT checkout.session_key) AS checkout_starts,
      COUNT(DISTINCT checkout.session_key) FILTER(WHERE checkout.checkout_started_at+
        pg_catalog.make_interval(hours=>COALESCE((SELECT setting.abandoned_hours FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=p_store_id),24))<=p_end_at) AS eligible_checkout_starts,
      COUNT(DISTINCT checkout.session_key) FILTER(WHERE checkout.checkout_started_at+
        pg_catalog.make_interval(hours=>COALESCE((SELECT setting.abandoned_hours FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=p_store_id),24))<=p_end_at
        AND NOT EXISTS(
          SELECT 1 FROM checkout_scope member
          JOIN saas.storefront_checkout_operations operation
            ON operation.store_id=p_store_id
            AND operation.cart_id IS NOT DISTINCT FROM member.cart_id
            AND operation.intent_id IS NOT DISTINCT FROM member.intent_id
          JOIN payment_events payment ON payment.order_id=operation.order_id
            AND payment.captured_at>=checkout.checkout_started_at
            AND payment.captured_at<=checkout.checkout_started_at+
            pg_catalog.make_interval(hours=>COALESCE((SELECT setting.abandoned_hours FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=p_store_id),24))
          WHERE member.session_key=checkout.session_key AND member.currency=checkout.currency
        )) AS checkout_abandoned
    FROM checkout_start_scope checkout
    WHERE checkout.checkout_started_at>=p_start_at AND checkout.checkout_started_at<p_end_at
    GROUP BY checkout.currency
  ), failure_facts AS (
    SELECT checkout.snapshot_id,checkout.session_key AS failure_key,checkout.currency,event.occurred_at
    FROM saas.payment_attempt_events event
    JOIN saas.storefront_hosted_checkout_sessions hosted
      ON hosted.store_id=event.store_id AND hosted.payment_attempt_id=event.attempt_id
    JOIN LATERAL (SELECT snapshot.id AS snapshot_id,COALESCE(snapshot.attribution_snapshot->>'anonymousSessionRef','legacy_'||snapshot.id::text) AS session_key,snapshot.currency
      FROM saas.storefront_checkout_start_snapshots snapshot
      WHERE snapshot.store_id=hosted.store_id
        AND snapshot.cart_id IS NOT DISTINCT FROM hosted.cart_id
        AND snapshot.intent_id IS NOT DISTINCT FROM hosted.intent_id
        AND snapshot.started_at<=event.occurred_at
      ORDER BY snapshot.started_at DESC,snapshot.id DESC LIMIT 1) checkout ON true
    WHERE event.store_id=p_store_id AND event.to_status='failed'
    UNION ALL
    SELECT checkout.snapshot_id,checkout.session_key,checkout.currency,event.created_at
    FROM saas.order_events event
    JOIN order_scope orders ON orders.id=event.order_id AND orders.store_id=event.store_id
    JOIN saas.storefront_checkout_operations operation ON operation.store_id=orders.store_id AND operation.order_id=orders.id
    JOIN LATERAL (SELECT snapshot.id AS snapshot_id,COALESCE(snapshot.attribution_snapshot->>'anonymousSessionRef','legacy_'||snapshot.id::text) AS session_key,snapshot.currency
      FROM saas.storefront_checkout_start_snapshots snapshot
      WHERE snapshot.store_id=operation.store_id
        AND snapshot.cart_id IS NOT DISTINCT FROM operation.cart_id
        AND snapshot.intent_id IS NOT DISTINCT FROM operation.intent_id
        AND snapshot.started_at<=event.created_at
      ORDER BY snapshot.started_at DESC,snapshot.id DESC LIMIT 1) checkout ON true
    WHERE event.event_type='payment_transition' AND event.to_value='failed'
  ), failure_metrics AS (
    SELECT failure.currency,COUNT(DISTINCT failure.failure_key) AS failures FROM failure_facts failure
    WHERE failure.occurred_at>=p_start_at AND failure.occurred_at<p_end_at
      AND EXISTS(SELECT 1 FROM checkout_scope checkout
        WHERE checkout.snapshot_id=failure.snapshot_id
          AND checkout.session_key=failure.failure_key
          AND checkout.currency=failure.currency
          AND checkout.checkout_started_at>=p_start_at AND checkout.checkout_started_at<p_end_at)
    GROUP BY failure.currency
  ), currency_set AS (
    SELECT currency FROM order_metrics UNION SELECT currency FROM recovery UNION SELECT currency FROM eligible_metrics UNION SELECT currency FROM cart_metrics UNION SELECT currency FROM checkout_metrics UNION SELECT currency FROM failure_metrics
  ), currency_rows AS (
    SELECT currency_set.currency,COALESCE(cart_metrics.active,0) AS active,COALESCE(cart_metrics.candidate,0) AS candidate,
      COALESCE(eligible_metrics.eligible,0) AS eligible,COALESCE(checkout_metrics.checkout_starts,0) AS checkout_starts,
      COALESCE(checkout_metrics.eligible_checkout_starts,0) AS eligible_checkout_starts,
      COALESCE(checkout_metrics.checkout_abandoned,0) AS checkout_abandoned,COALESCE(failure_metrics.failures,0) AS failures,
      COALESCE(order_metrics.paid,0) AS paid,COALESCE(order_metrics.gross,0) AS gross,COALESCE(order_metrics.refunded,0) AS refunded,
      COALESCE(recovery.abandoned,0) AS abandoned,COALESCE(recovery.abandoned_value,0) AS abandoned_value,
      COALESCE(recovery.recovered,0) AS recovered,COALESCE(recovery.recovered_gross,0) AS recovered_gross,
      COALESCE(recovery.recovered_refunded,0) AS recovered_refunded
    FROM currency_set LEFT JOIN order_metrics USING(currency) LEFT JOIN recovery USING(currency) LEFT JOIN eligible_metrics USING(currency)
      LEFT JOIN cart_metrics USING(currency) LEFT JOIN checkout_metrics USING(currency) LEFT JOIN failure_metrics USING(currency)
  ), attribution_facts AS (
    SELECT touch.kind AS touch,touch.source,touch.medium,touch.campaign,
      orders.currency,1::bigint AS paid,orders.total_cents AS gross,0::bigint AS abandoned,0::bigint AS recovered
    FROM order_scope orders
      JOIN payment_events payment ON payment.order_id=orders.id
      LEFT JOIN saas.order_commerce_attribution attribution ON attribution.store_id=orders.store_id AND attribution.order_id=orders.id
      CROSS JOIN LATERAL (VALUES
        ('first',COALESCE(attribution.first_touch_source,'unknown'),COALESCE(attribution.first_touch_medium,'unknown'),attribution.first_touch_campaign),
        ('last',COALESCE(attribution.last_touch_source,'unknown'),COALESCE(attribution.last_touch_medium,'unknown'),attribution.last_touch_campaign)
      ) touch(kind,source,medium,campaign)
    WHERE orders.store_id=p_store_id AND payment.captured_at>=p_start_at AND payment.captured_at<p_end_at
      AND COALESCE(p_filters->>'view','all') IN ('all','acquisition')
    UNION ALL
    SELECT touch.kind,touch.source,touch.medium,touch.campaign,episode.currency,
      0,0,1,CASE WHEN episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at AND orders.paid_at<p_end_at THEN COALESCE(orders.total_cents,0) ELSE 0 END
    FROM episode_scope episode
      LEFT JOIN order_scope orders ON orders.store_id=episode.store_id AND orders.id=episode.linked_order_id
      CROSS JOIN LATERAL (VALUES
        ('first',COALESCE(episode.first_touch->>'source','unknown'),COALESCE(episode.first_touch->>'medium','unknown'),episode.first_touch->>'campaign'),
        ('last',COALESCE(episode.last_touch->>'source','unknown'),COALESCE(episode.last_touch->>'medium','unknown'),episode.last_touch->>'campaign')
      ) touch(kind,source,medium,campaign)
    WHERE episode.store_id=p_store_id AND episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at
      AND COALESCE(p_filters->>'view','all') IN ('all','acquisition')
  ), attribution_rows AS (
    SELECT touch,source,medium,campaign,currency,SUM(paid) AS paid,SUM(gross) AS gross,SUM(abandoned) AS abandoned,SUM(recovered) AS recovered
    FROM attribution_facts GROUP BY touch,source,medium,campaign,currency
  ), paid_product_facts AS (
    SELECT item.product_id,orders.currency,COUNT(DISTINCT orders.id)::bigint AS paid_orders,
      SUM(item.quantity)::bigint AS quantity,SUM(saas.in_store_order_item_net(item.id,item.line_total_cents))::bigint AS revenue
    FROM saas.order_items item JOIN order_scope orders ON orders.store_id=item.store_id AND orders.id=item.order_id
      JOIN payment_events payment ON payment.order_id=orders.id
    WHERE item.store_id=p_store_id AND item.product_id IS NOT NULL AND payment.captured_at>=p_start_at AND payment.captured_at<p_end_at
    GROUP BY item.product_id,orders.currency
  ), product_cart_facts AS (
    SELECT item.product_id,item.currency,COUNT(DISTINCT item.session_key)::bigint AS checkout_starts
    FROM checkout_scope item
    WHERE item.checkout_started_at>=p_start_at AND item.checkout_started_at<p_end_at
    GROUP BY item.product_id,item.currency
  ), abandoned_product_facts AS (
    SELECT item.product_id,episode.currency,COUNT(DISTINCT (episode.id,item.product_id))::bigint AS abandoned_appearances
    FROM saas.abandoned_cart_episode_items item
    JOIN episode_scope episode ON episode.store_id=item.store_id AND episode.id=item.episode_id
    WHERE item.store_id=p_store_id AND episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at
    GROUP BY item.product_id,episode.currency
  ), recovered_product_facts AS (
    SELECT item.product_id,orders.currency,COALESCE(SUM(saas.in_store_order_item_net(item.id,item.line_total_cents)),0)::bigint AS recovered_revenue
    FROM episode_scope episode
    JOIN order_scope orders ON orders.store_id=episode.store_id AND orders.id=episode.linked_order_id AND orders.paid_at IS NOT NULL
    JOIN saas.order_items item ON item.store_id=orders.store_id AND item.order_id=orders.id AND item.product_id IS NOT NULL
    WHERE episode.store_id=p_store_id AND episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at
    GROUP BY item.product_id,orders.currency
  ), product_primary_categories AS (
    SELECT DISTINCT ON(relation.store_id,relation.product_id)
      relation.store_id,relation.product_id,category.id AS category_id,category.name AS category_name
    FROM saas.catalog_product_categories relation
    JOIN saas.catalog_categories category ON category.store_id=relation.store_id AND category.id=relation.category_id
    WHERE relation.store_id=p_store_id
    ORDER BY relation.store_id,relation.product_id,relation.position,category.id
  ), product_primary_brands AS (
    SELECT DISTINCT ON(relation.store_id,relation.product_id)
      relation.store_id,relation.product_id,brand.id AS brand_id,brand.name AS brand_name
    FROM saas.catalog_admin_resource_products relation
    JOIN saas.catalog_admin_resources brand ON brand.store_id=relation.store_id AND brand.id=relation.resource_id AND brand.resource_kind='brand'
    WHERE relation.store_id=p_store_id
    ORDER BY relation.store_id,relation.product_id,relation.position,brand.id
  ), product_catalog AS (
    SELECT product.id,product.store_id,product.title,product.currency,
      category.category_id,category.category_name,brand.brand_id,brand.brand_name
    FROM saas.products product
    LEFT JOIN product_primary_categories category ON category.store_id=product.store_id AND category.product_id=product.id
    LEFT JOIN product_primary_brands brand ON brand.store_id=product.store_id AND brand.product_id=product.id
    WHERE product.store_id=p_store_id AND COALESCE(p_filters->>'view','all') IN ('all','products')
      AND (NOT p_filters ? 'productId' OR product.id=(p_filters->>'productId')::uuid)
      AND (NOT p_filters ? 'categoryId' OR EXISTS(SELECT 1 FROM saas.catalog_product_categories relation WHERE relation.store_id=product.store_id AND relation.product_id=product.id AND relation.category_id=(p_filters->>'categoryId')::uuid))
      AND (NOT p_filters ? 'brandId' OR EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products relation WHERE relation.store_id=product.store_id AND relation.product_id=product.id AND relation.resource_id=(p_filters->>'brandId')::uuid))
      AND (NOT p_filters ? 'search' OR pg_catalog.lower(product.title) LIKE '%'||pg_catalog.lower(p_filters->>'search')||'%')
  ), product_currencies AS (
    SELECT product.id AS product_id,product.currency
    FROM product_catalog product
    WHERE (NOT p_filters ? 'currency' OR product.currency=p_filters->>'currency')
    UNION SELECT fact.product_id,fact.currency FROM paid_product_facts fact
      JOIN product_catalog product ON product.id=fact.product_id
      WHERE (NOT p_filters ? 'currency' OR fact.currency=p_filters->>'currency')
    UNION SELECT fact.product_id,fact.currency FROM product_cart_facts fact
      JOIN product_catalog product ON product.id=fact.product_id
      WHERE (NOT p_filters ? 'currency' OR fact.currency=p_filters->>'currency')
    UNION SELECT fact.product_id,fact.currency FROM abandoned_product_facts fact
      JOIN product_catalog product ON product.id=fact.product_id
      WHERE (NOT p_filters ? 'currency' OR fact.currency=p_filters->>'currency')
    UNION SELECT fact.product_id,fact.currency FROM recovered_product_facts fact
      JOIN product_catalog product ON product.id=fact.product_id
      WHERE (NOT p_filters ? 'currency' OR fact.currency=p_filters->>'currency')
  ), product_rows AS (
    SELECT product.id AS product_id,product.title,currency.currency,product.category_id,product.category_name,
      product.brand_id,product.brand_name,COALESCE(cart.checkout_starts,0) AS checkout_starts,
      COALESCE(paid.paid_orders,0) AS paid_orders,COALESCE(paid.quantity,0) AS quantity,COALESCE(paid.revenue,0) AS revenue,
      COALESCE(abandoned.abandoned_appearances,0) AS abandoned_appearances,COALESCE(recovered.recovered_revenue,0) AS recovered_revenue
    FROM product_catalog product
    JOIN product_currencies currency ON currency.product_id=product.id
    LEFT JOIN paid_product_facts paid ON paid.product_id=product.id AND paid.currency=currency.currency
    LEFT JOIN product_cart_facts cart ON cart.product_id=product.id AND cart.currency=currency.currency
    LEFT JOIN abandoned_product_facts abandoned ON abandoned.product_id=product.id AND abandoned.currency=currency.currency
    LEFT JOIN recovered_product_facts recovered ON recovered.product_id=product.id AND recovered.currency=currency.currency
    ORDER BY revenue DESC,quantity DESC,product.id,product.currency
    LIMIT 100 OFFSET (COALESCE((p_filters->>'productPage')::integer,1)-1)*100
  ), commerce_series AS (
    SELECT point.starts_at,point.currency,SUM(point.paid_orders)::bigint AS paid_orders,SUM(point.gross)::bigint AS gross,
      SUM(point.abandoned)::bigint AS abandoned,SUM(point.recovered)::bigint AS recovered
    FROM (
      SELECT pg_catalog.date_trunc('day',payment.captured_at,COALESCE(p_filters->>'timezone','Europe/Istanbul')) AS starts_at,orders.currency,1::bigint AS paid_orders,
        orders.total_cents::bigint AS gross,0::bigint AS abandoned,0::bigint AS recovered
      FROM payment_events payment JOIN order_scope orders ON orders.id=payment.order_id
      WHERE payment.captured_at>=p_start_at AND payment.captured_at<p_end_at
      UNION ALL
      SELECT pg_catalog.date_trunc('day',episode.abandoned_at,COALESCE(p_filters->>'timezone','Europe/Istanbul')),episode.currency,0,0,1,0
      FROM episode_scope episode WHERE episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at
      UNION ALL
      SELECT pg_catalog.date_trunc('day',episode.recovered_at,COALESCE(p_filters->>'timezone','Europe/Istanbul')),episode.currency,0,0,0,1
      FROM episode_scope episode WHERE episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at
    ) point WHERE COALESCE(p_filters->>'view','all') IN ('all','overview')
    GROUP BY point.starts_at,point.currency
  ), cart_candidates AS (
    SELECT cart.* FROM cart_scope cart
    WHERE cart.store_id=p_store_id
      AND COALESCE(p_filters->>'view','all') IN ('all','abandoned-carts')
      AND (cart.last_activity_at>=p_start_at AND cart.last_activity_at<p_end_at OR cart.abandoned_at>=p_start_at AND cart.abandoned_at<p_end_at OR cart.recovered_at>=p_start_at AND cart.recovered_at<p_end_at)
  ), cart_page_rows AS (
    SELECT candidate.* FROM cart_candidates candidate
    WHERE (NOT p_filters ? 'currency' OR candidate.currency=p_filters->>'currency')
      AND (NOT p_filters ? 'lifecycle' OR candidate.lifecycle_status=p_filters->>'lifecycle')
      AND (NOT p_filters ? 'contact' OR CASE p_filters->>'contact' WHEN 'contactable' THEN candidate.customer_email IS NOT NULL OR candidate.customer_phone IS NOT NULL WHEN 'unavailable' THEN candidate.customer_email IS NULL AND candidate.customer_phone IS NULL ELSE false END)
      AND (NOT p_filters ? 'minimumValueMinor' OR candidate.total_cents>=(p_filters->>'minimumValueMinor')::bigint)
      AND (NOT p_filters ? 'maximumValueMinor' OR candidate.total_cents<=(p_filters->>'maximumValueMinor')::bigint)
    ORDER BY candidate.last_activity_at DESC,candidate.id DESC
    LIMIT 100 OFFSET (COALESCE((p_filters->>'cartPage')::integer,1)-1)*100
  ), cart_ranked_items AS (
    SELECT item.store_id,item.cart_id,item.product_name,
      pg_catalog.row_number() OVER(PARTITION BY item.store_id,item.cart_id ORDER BY item.position,item.id) AS item_rank
    FROM saas.abandoned_cart_items item JOIN cart_page_rows page
      ON page.store_id=item.store_id AND page.id=item.cart_id
  ), cart_item_summaries AS (
    SELECT item.store_id,item.cart_id,
      pg_catalog.string_agg(item.product_name,', ' ORDER BY item.item_rank) AS product_summary
    FROM cart_ranked_items item WHERE item.item_rank<=3 GROUP BY item.store_id,item.cart_id
  ), cart_contacted AS (
    SELECT attempt.store_id,attempt.cart_id,true AS contacted
    FROM saas.abandoned_cart_recovery_attempts attempt JOIN cart_page_rows page
      ON page.store_id=attempt.store_id AND page.id=attempt.cart_id
    WHERE attempt.channel IN ('contacted','email','whatsapp') GROUP BY attempt.store_id,attempt.cart_id
  ), cart_rows AS (
    SELECT page.*,COALESCE(summary.product_summary,'Ürün bilgisi yok') AS product_summary,
      COALESCE(contact.contacted,false) AS contacted
    FROM cart_page_rows page
    LEFT JOIN cart_item_summaries summary ON summary.store_id=page.store_id AND summary.cart_id=page.id
    LEFT JOIN cart_contacted contact ON contact.store_id=page.store_id AND contact.cart_id=page.id
  ) SELECT 'resolved',pg_catalog.jsonb_build_object('schemaVersion',1,'rangeStart',saas.merchant_admin_timestamp(p_start_at),'rangeEnd',saas.merchant_admin_timestamp(p_end_at),'currencies',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'currency',currency,'activeCarts',active,'candidateCarts',candidate,'eligibleCarts',eligible,'checkoutStarts',checkout_starts,'eligibleCheckoutStarts',eligible_checkout_starts,
      'checkoutAbandoned',checkout_abandoned,'paymentFailures',failures,'paidOrders',paid,'grossRevenueMinor',gross,
      'refundedMinor',refunded,'abandonedCarts',abandoned,'abandonedValueMinor',abandoned_value,'recoveredCarts',recovered,
      'recoveredGrossMinor',recovered_gross,'recoveredRefundedMinor',recovered_refunded,'recoveredNetMinor',recovered_gross-recovered_refunded
    ) ORDER BY currency) FROM currency_rows),'[]'::jsonb),'attribution',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'touch',touch,'source',source,'medium',medium,'campaign',campaign,'currency',currency,'paidOrders',paid,'grossRevenueMinor',gross,
      'abandonedCarts',abandoned,'recoveredRevenueMinor',recovered) ORDER BY touch,source,medium,campaign,currency) FROM attribution_rows),'[]'::jsonb),
    'products',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'productId',product_id,'title',title,'currency',currency,'categoryId',category_id,'categoryName',category_name,
      'brandId',brand_id,'brandName',brand_name,'checkoutStarts',checkout_starts,'paidOrders',paid_orders,'quantity',quantity,
      'revenueMinor',revenue,'abandonedAppearances',abandoned_appearances,'recoveredRevenueMinor',recovered_revenue
    ) ORDER BY revenue DESC,quantity DESC,product_id,title,currency) FROM product_rows),'[]'::jsonb),
    'productPage',pg_catalog.jsonb_build_object(
      'page',COALESCE((p_filters->>'productPage')::integer,1),'pageSize',100,
      'totalItems',(SELECT COUNT(*) FROM product_currencies),
      'totalPages',CASE WHEN (SELECT COUNT(*) FROM product_currencies)=0 THEN 0 ELSE pg_catalog.ceil((SELECT COUNT(*) FROM product_currencies)::numeric/100)::integer END
    ),
    'series',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('startsAt',saas.merchant_admin_timestamp(starts_at),
      'currency',currency,'paidOrders',paid_orders,'grossRevenueMinor',gross,'abandonedCarts',abandoned,'recoveredCarts',recovered)
      ORDER BY starts_at,currency) FROM commerce_series),'[]'::jsonb),
    'carts',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'id',id,'customerLabel',CASE WHEN customer_name IS NOT NULL THEN pg_catalog.left(customer_name,1)||'***' WHEN customer_email IS NOT NULL THEN pg_catalog.left(customer_email,1)||'***@'||pg_catalog.split_part(customer_email,'@',2) WHEN customer_phone IS NOT NULL THEN '***'||pg_catalog.right(customer_phone,2) ELSE 'Anonim ziyaretçi' END,
      'productSummary',product_summary,'subtotalMinor',subtotal_cents,'discountMinor',discount_cents,'shippingMinor',0,'totalMinor',total_cents,
      'currency',currency,'lastActivityAt',saas.merchant_admin_timestamp(last_activity_at),'abandonedAt',CASE WHEN abandoned_at IS NULL THEN NULL ELSE saas.merchant_admin_timestamp(abandoned_at) END,
      'source',COALESCE(last_touch_source,'unknown'),'campaign',last_touch_campaign,'device',COALESCE(device_group,'unknown'),'lifecycle',lifecycle_status,
      'contactable',customer_email IS NOT NULL OR customer_phone IS NOT NULL,'contacted',contacted
    )) ORDER BY last_activity_at DESC,id DESC) FROM cart_rows),'[]'::jsonb),
    'cartPage',pg_catalog.jsonb_build_object(
      'page',COALESCE((p_filters->>'cartPage')::integer,1),'pageSize',100,
      'totalItems',(SELECT COUNT(*) FROM cart_candidates),
      'totalPages',CASE WHEN (SELECT COUNT(*) FROM cart_candidates)=0 THEN 0 ELSE pg_catalog.ceil((SELECT COUNT(*) FROM cart_candidates)::numeric/100)::integer END
    ),
    'worker',saas.commerce_analytics_worker_status(p_store_id,p_now))
    ;
END
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.commerce_analytics_settings_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,integer,integer,integer,boolean,integer,integer,text)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.commerce_analytics_settings_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,integer,integer,integer,boolean,integer,integer,text)')),'UTF8')),'hex')<>'b19cce5e3089f83d2286f40f590af61d784b3c10a38286d542cc4a101ef767ed' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.commerce_analytics_settings_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,integer,integer,integer,boolean,integer,integer,text)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.commerce_analytics_settings_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,integer,integer,integer,boolean,integer,integer,text)',pg_get_functiondef(p.oid),'b19cce5e3089f83d2286f40f590af61d784b3c10a38286d542cc4a101ef767ed',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.commerce_analytics_settings_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,integer,integer,integer,boolean,integer,integer,text)');END $patch$;
CREATE OR REPLACE FUNCTION saas.commerce_analytics_settings_update(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_expected_version bigint, p_candidate_minutes integer, p_abandoned_hours integer, p_recovery_link_hours integer, p_automatic_recovery_enabled boolean, p_maximum_message_attempts integer, p_minimum_message_interval_hours integer, p_tracking_policy text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; current_version bigint;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'advanced_analytics') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'commerce_analytics_settings_update');
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_expected_version<1 OR p_candidate_minutes NOT BETWEEN 15 AND 360 OR p_abandoned_hours NOT BETWEEN 1 AND 168
    OR p_abandoned_hours*60<=p_candidate_minutes OR p_recovery_link_hours NOT BETWEEN 1 AND 168
    OR p_maximum_message_attempts NOT BETWEEN 1 AND 3 OR p_minimum_message_interval_hours NOT BETWEEN 6 AND 168
    OR p_tracking_policy NOT IN ('disabled','anonymous_commerce') OR p_automatic_recovery_enabled THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT version INTO current_version FROM saas.store_commerce_analytics_settings WHERE store_id=p_store_id FOR UPDATE;
  IF current_version IS NULL AND p_expected_version<>1 OR current_version IS NOT NULL AND current_version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.store_commerce_analytics_settings(store_id,candidate_minutes,abandoned_hours,recovery_link_hours,automatic_recovery_enabled,maximum_message_attempts,minimum_message_interval_hours,tracking_policy,version,created_at,updated_at)
  VALUES(p_store_id,p_candidate_minutes,p_abandoned_hours,p_recovery_link_hours,p_automatic_recovery_enabled,p_maximum_message_attempts,p_minimum_message_interval_hours,p_tracking_policy,p_expected_version+1,p_now,p_now)
  ON CONFLICT(store_id) DO UPDATE SET candidate_minutes=EXCLUDED.candidate_minutes,abandoned_hours=EXCLUDED.abandoned_hours,recovery_link_hours=EXCLUDED.recovery_link_hours,
    automatic_recovery_enabled=EXCLUDED.automatic_recovery_enabled,maximum_message_attempts=EXCLUDED.maximum_message_attempts,
    minimum_message_interval_hours=EXCLUDED.minimum_message_interval_hours,tracking_policy=EXCLUDED.tracking_policy,version=EXCLUDED.version,updated_at=EXCLUDED.updated_at;
  RETURN QUERY SELECT 'committed',pg_catalog.jsonb_build_object('candidateInactivityMinutes',p_candidate_minutes,'abandonedInactivityHours',p_abandoned_hours,
    'recoveryLinkHours',p_recovery_link_hours,'automaticRecoveryEnabled',p_automatic_recovery_enabled,'maximumMessageAttempts',p_maximum_message_attempts,
    'minimumMessageIntervalHours',p_minimum_message_interval_hours,'trackingPolicy',p_tracking_policy,'version',p_expected_version+1);
END
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.commerce_analytics_paid_funnel_sessions(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.commerce_analytics_paid_funnel_sessions(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)')),'UTF8')),'hex')<>'6e3d706fa57ba7b1ac001890278b25e89bd0abd574a95d9b4b4887ef361f1cf7' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.commerce_analytics_paid_funnel_sessions(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.commerce_analytics_paid_funnel_sessions(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)',pg_get_functiondef(p.oid),'6e3d706fa57ba7b1ac001890278b25e89bd0abd574a95d9b4b4887ef361f1cf7',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.commerce_analytics_paid_funnel_sessions(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.commerce_analytics_paid_funnel_sessions(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_filters jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; selected_count bigint; selected_payload jsonb;
BEGIN
IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id AND status='active') AND NOT saas.commercial_plan_has_capability(p_plan_id,'advanced_analytics') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','analytics.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_start_at>=p_end_at OR p_end_at>p_now OR p_end_at-p_start_at>interval '13 months'
    OR p_filters IS NULL OR pg_catalog.jsonb_typeof(p_filters)<>'object'
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_filters) key WHERE key<>ALL(ARRAY['currency','device','source','campaign','productId','categoryId']))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  WITH paid_sessions AS (
    SELECT attribution.anonymous_session_ref,orders.paid_at AS occurred_at
    FROM saas.orders orders
    JOIN saas.order_commerce_attribution attribution
      ON attribution.store_id=orders.store_id AND attribution.order_id=orders.id
    WHERE orders.store_id=p_store_id
      AND orders.payment_status IN ('completed','refunded')
      AND orders.paid_at>=p_start_at AND orders.paid_at<p_end_at
      AND (NOT p_filters ? 'currency' OR orders.currency=p_filters->>'currency')
      AND attribution.anonymous_session_ref IS NOT NULL
      AND (NOT p_filters ? 'source' OR attribution.last_touch_source=p_filters->>'source')
      AND (NOT p_filters ? 'campaign' OR attribution.last_touch_campaign=p_filters->>'campaign')
      AND (NOT p_filters ? 'device' OR attribution.device_group=p_filters->>'device')
      AND (NOT p_filters ? 'productId' OR EXISTS(
        SELECT 1 FROM saas.order_items item WHERE item.store_id=orders.store_id AND item.order_id=orders.id
          AND item.product_id=(p_filters->>'productId')::uuid))
      AND (NOT p_filters ? 'categoryId' OR EXISTS(
        SELECT 1 FROM saas.storefront_checkout_operations operation
        JOIN LATERAL (
          SELECT candidate.item_snapshot
          FROM saas.storefront_checkout_start_snapshots candidate
          WHERE candidate.store_id=operation.store_id
            AND candidate.cart_id IS NOT DISTINCT FROM operation.cart_id
            AND candidate.intent_id IS NOT DISTINCT FROM operation.intent_id
            AND candidate.attribution_snapshot->>'anonymousSessionRef'=attribution.anonymous_session_ref
            AND candidate.started_at<=operation.committed_at
          ORDER BY candidate.started_at DESC,candidate.id DESC LIMIT 1
        ) snapshot ON true
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(snapshot.item_snapshot) entry(value)
        WHERE operation.store_id=orders.store_id AND operation.order_id=orders.id
          AND entry.value->>'categoryId'=p_filters->>'categoryId'))
    ORDER BY orders.paid_at,attribution.anonymous_session_ref,orders.id
    LIMIT 10001
  ) SELECT COUNT(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'anonymousSessionRef',anonymous_session_ref,'occurredAt',saas.merchant_admin_timestamp(occurred_at)
    ) ORDER BY occurred_at,anonymous_session_ref),'[]'::jsonb)
    INTO selected_count,selected_payload FROM paid_sessions;
  IF selected_count>10000 THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'resolved',selected_payload;
END
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.toshi_provider_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.toshi_provider_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)')),'UTF8')),'hex')<>'7f98d877a3d3101b4b5a3e697e77c6ce0f768281986eb846100ea96acd1c9ee2' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.toshi_provider_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.toshi_provider_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)',pg_get_functiondef(p.oid),'7f98d877a3d3101b4b5a3e697e77c6ce0f768281986eb846100ea96acd1c9ee2',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.toshi_provider_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)');END $patch$;
CREATE OR REPLACE FUNCTION saas.toshi_provider_authority_error(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_write boolean)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
BEGIN
 IF NOT saas.commercial_plan_has_capability(p_plan_id,'ai') THEN RETURN 'feature_not_enabled';END IF;

  IF p_write THEN
    RETURN saas.merchant_action_authority_error(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
      'catalog','configuration.manage'
    );
  END IF;
  RETURN saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    'catalog','configuration.read'
  );
END
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.accounting_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.accounting_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)')),'UTF8')),'hex')<>'38da97571d28799e0f45b7d9e80dbced0e1acc6db8b2cc83acb1202ca7e0738a' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.accounting_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.accounting_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)',pg_get_functiondef(p.oid),'38da97571d28799e0f45b7d9e80dbced0e1acc6db8b2cc83acb1202ca7e0738a',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.accounting_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,boolean)');END $patch$;
CREATE OR REPLACE FUNCTION saas.accounting_authority_error(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone, p_collection boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE role_name text;err text;BEGIN
 IF NOT saas.commercial_plan_has_capability(p_plan,'accounting') THEN RETURN 'feature_not_enabled';END IF;

 IF p_now IS NULL OR NOT isfinite(p_now) THEN RETURN 'invalid_input';END IF;
 SELECT role INTO role_name FROM saas.platform_authorized_memberships WHERE store_id=p_store AND id=p_member AND principal_id=p_principal AND status='active';
 IF role_name='cashier' AND p_collection THEN
 err:=saas.in_store_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now);
 IF err IS NOT NULL THEN RETURN err;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled AND can_collect_receivables) THEN RETURN 'membership_denied';END IF;RETURN NULL;
 END IF;
 IF role_name IS NULL OR role_name NOT IN('store_owner','admin') THEN RETURN 'membership_denied';END IF;
 RETURN saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'orders','orders.payment');
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)')),'UTF8')),'hex')<>'695b6a69177fa7443cf9e7327e8e22203eb7a8f8e2591485f94f08c59773a72c' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)',pg_get_functiondef(p.oid),'695b6a69177fa7443cf9e7327e8e22203eb7a8f8e2591485f94f08c59773a72c',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.merchant_admin_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,boolean)');END $patch$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_authority_error(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_kind text, p_mutation boolean)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$SELECT CASE WHEN p_kind='administrator_invite' AND p_mutation THEN 'permission_denied'::text WHEN p_kind IN('lucky_wheel','popup','order_bump','recovery','promotion_banner') AND NOT saas.commercial_plan_has_capability(p_plan_id,'growth_tools') THEN 'feature_not_enabled' WHEN p_kind IN('email_campaign','phone_campaign','whatsapp_campaign') AND NOT saas.commercial_plan_has_capability(p_plan_id,'email_marketing') THEN 'feature_not_enabled' WHEN p_kind IN('seo_geo_profile','seo_internal_link','seo_content_entry','seo_category_entry','seo_page_entry','seo_product_entry','indexing_request') AND NOT saas.commercial_plan_has_capability(p_plan_id,'seo_tools') THEN 'feature_not_enabled' WHEN p_kind='ai_setting' AND NOT saas.commercial_plan_has_capability(p_plan_id,'ai') THEN 'feature_not_enabled' WHEN p_kind IN('accounting_profile','invoice_integration') AND NOT saas.commercial_plan_has_capability(p_plan_id,'accounting') THEN 'feature_not_enabled' ELSE ( SELECT saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog',saas.merchant_admin_required_action(p_kind,p_mutation)) ) END$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.lucky_wheel_campaign_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.lucky_wheel_campaign_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)')),'UTF8')),'hex')<>'f96e33a4e8c325bcc81f53beeab9d5e97b2cf29e61f5930db49f6f61fd26254d' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.lucky_wheel_campaign_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.lucky_wheel_campaign_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',pg_get_functiondef(p.oid),'f96e33a4e8c325bcc81f53beeab9d5e97b2cf29e61f5930db49f6f61fd26254d',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.lucky_wheel_campaign_list_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)');END $patch$;
CREATE OR REPLACE FUNCTION saas.lucky_wheel_campaign_list_v1(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;BEGIN
IF NOT saas.commercial_plan_has_capability(p_plan,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 e:=saas.promotion_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'promotions.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'ok',coalesce(jsonb_agg(v.payload ORDER BY v.updated_at DESC,v.payload->>'id' DESC),'[]'::jsonb) FROM(SELECT saas.lucky_wheel_campaign_projection_v1(c,p_now) payload,c.updated_at FROM saas.lucky_wheel_campaigns c WHERE c.store_id=p_store AND c.deleted_at IS NULL UNION ALL SELECT jsonb_build_object('id',r.id,'name',r.name,'enabled',false,'status',CASE WHEN r.status='draft' THEN 'paused' ELSE r.status END,'version',r.version,'config',NULL,'prizes','[]'::jsonb,'blockedReason','legacy_configuration','stats',jsonb_build_object('issued',0,'used',0,'discountMinor',0,'revenueMinor',0,'currency','TRY'),'createdAt',saas.merchant_admin_timestamp(r.created_at),'updatedAt',saas.merchant_admin_timestamp(r.updated_at),'legacy',true,'legacyConfig',r.config),r.updated_at FROM(SELECT * FROM saas.merchant_admin_records WHERE store_id=p_store AND record_kind='lucky_wheel' ORDER BY updated_at DESC,id DESC LIMIT 200) r) v;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)')),'UTF8')),'hex')<>'caefc5071af4687c5f286c1faf8d4e346b8cc11d5848f2ee258fe9759c841416' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)',pg_get_functiondef(p.oid),'caefc5071af4687c5f286c1faf8d4e346b8cc11d5848f2ee258fe9759c841416',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.promotion_create_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.promotion_create_v1(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_promotion_id uuid, p_name text, p_rule_document jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE v_error text; v_operation saas.promotion_operations%ROWTYPE; v_result jsonb; v_failure text;
BEGIN
IF NOT saas.commercial_plan_has_capability(p_plan_id,'coupons') OR(p_rule_document->>'kind' IN('order_bump','popup','lucky_wheel') AND NOT saas.commercial_plan_has_capability(p_plan_id,'growth_tools')) THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'promotion_create_v1');
  IF p_promotion_id IS NULL OR p_operation_id IS NULL OR p_fingerprint IS DISTINCT FROM saas.promotion_operation_fingerprint_v2('create',p_store_id,pg_catalog.jsonb_build_object('name',p_name,'ruleDocument',p_rule_document)) OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR pg_catalog.length(p_name) NOT BETWEEN 1 AND 200 OR pg_catalog.octet_length(p_name)>800 OR p_name~'[[:cntrl:]]' OR saas.promotion_rule_document_valid(p_rule_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.manage_draft'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.promotion_operations op WHERE op.store_id=p_store_id AND op.operation_id=p_operation_id AND ((op.result_entity_kind='promotion' AND saas.promotion_is_deleted_v1(p_store_id,op.result_entity_id)) OR (op.result_entity_kind='code_batch' AND EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=op.result_entity_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id))))) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'create' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF saas.promotion_operation_result_valid('create',v_operation.result_payload) IS NOT TRUE OR v_operation.result_entity_kind<>'promotion' OR v_operation.result_entity_id IS DISTINCT FROM saas.promotion_operation_entity_id('create',v_operation.result_payload) THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload; END IF;
    RETURN;
  END IF;
  IF saas.promotion_lock_definition_references(p_store_id,p_rule_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-create:'||p_store_id::text,0));
  BEGIN
    INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES(p_promotion_id,p_store_id,p_name,'draft',1,p_rule_document,p_now,p_now) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'promotion_mutation:conflict'; END IF;
    v_error:=saas.promotion_sync_direct_codes(p_store_id,p_promotion_id,p_rule_document,p_now);
    IF v_error IS NOT NULL THEN RAISE EXCEPTION 'promotion_mutation:%',v_error; END IF;
    PERFORM saas.promotion_materialize_targets(p_store_id,p_promotion_id,p_rule_document);
    INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_promotion_id,1,p_rule_document,p_now);
    v_result:=saas.promotion_projection(p_store_id,p_promotion_id);
    PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'create',p_fingerprint,v_result,p_now);
    INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at) VALUES(p_operation_id,p_store_id,p_promotion_id,p_principal_id,'created',pg_catalog.jsonb_build_object('version',1),p_now);
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_failure=MESSAGE_TEXT;
    IF v_failure LIKE 'promotion_mutation:%' THEN RETURN QUERY SELECT pg_catalog.substr(v_failure,20),NULL::jsonb; RETURN; END IF;
    RAISE;
  END;
  RETURN QUERY SELECT 'created',v_result;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.lucky_wheel_campaign_delete_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.lucky_wheel_campaign_delete_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)')),'UTF8')),'hex')<>'8698ac8d91deb4c7eb88200faa1b370b4314e217e70a303d584309e681dbeeac' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.lucky_wheel_campaign_delete_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.lucky_wheel_campaign_delete_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',pg_get_functiondef(p.oid),'8698ac8d91deb4c7eb88200faa1b370b4314e217e70a303d584309e681dbeeac',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.lucky_wheel_campaign_delete_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)');END $patch$;
CREATE OR REPLACE FUNCTION saas.lucky_wheel_campaign_delete_v1(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation uuid, p_fingerprint text, p_campaign uuid, p_expected_version bigint)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;c saas.lucky_wheel_campaigns;op saas.lucky_wheel_admin_operations;request jsonb;result jsonb;BEGIN
IF NOT saas.commercial_plan_has_capability(p_plan,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.promotion_operation_authority_lock_v1(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,p_operation,'promotions.archive');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_campaign IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lucky-wheel-save:'||p_store::text,226));request:=jsonb_build_object('campaignId',p_campaign,'expectedVersion',p_expected_version);
 SELECT * INTO op FROM saas.lucky_wheel_admin_operations WHERE store_id=p_store AND operation_id=p_operation;IF FOUND THEN IF op.action<>'delete' OR op.principal_id<>p_principal OR op.membership_id<>p_membership OR op.fingerprint<>p_fingerprint OR op.request_payload<>request THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;RETURN;END IF;
 SELECT * INTO c FROM saas.lucky_wheel_campaigns WHERE store_id=p_store AND id=p_campaign AND deleted_at IS NULL FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;IF c.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 UPDATE saas.lucky_wheel_campaigns SET enabled=false,deleted_at=date_trunc('milliseconds',p_now),updated_at=date_trunc('milliseconds',p_now),updated_by=p_principal WHERE store_id=p_store AND id=p_campaign;
 result:=jsonb_build_object('campaignId',p_campaign,'deleted',true,'issuedCouponsPreserved',true);INSERT INTO saas.lucky_wheel_admin_operations VALUES(p_store,p_operation,p_principal,p_membership,'delete',p_fingerprint,request,result,date_trunc('milliseconds',p_now));INSERT INTO saas.lucky_wheel_events(store_id,campaign_id,action,version,principal_id,at) VALUES(p_store,c.id,'deleted',c.version,p_principal,date_trunc('milliseconds',p_now));RETURN QUERY SELECT 'saved',result;END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.lucky_wheel_campaign_revoke_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.lucky_wheel_campaign_revoke_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)')),'UTF8')),'hex')<>'f6019cbcdb19cdf7cf67c5f1f5bbe1679f1bd926c6e1afa935d89360016b4535' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.lucky_wheel_campaign_revoke_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.lucky_wheel_campaign_revoke_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',pg_get_functiondef(p.oid),'f6019cbcdb19cdf7cf67c5f1f5bbe1679f1bd926c6e1afa935d89360016b4535',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.lucky_wheel_campaign_revoke_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)');END $patch$;
CREATE OR REPLACE FUNCTION saas.lucky_wheel_campaign_revoke_v1(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation uuid, p_fingerprint text, p_campaign uuid, p_expected_version bigint)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;c saas.lucky_wheel_campaigns;op saas.lucky_wheel_admin_operations;request jsonb;result jsonb;revoked_count bigint;held_count bigint;BEGIN
IF NOT saas.commercial_plan_has_capability(p_plan,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.promotion_operation_authority_lock_v1(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,p_operation,'promotions.publish');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_campaign IS NULL OR p_expected_version IS NULL OR p_expected_version<1 OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lucky-wheel-save:'||p_store::text,226));request:=jsonb_build_object('campaignId',p_campaign,'expectedVersion',p_expected_version);SELECT * INTO op FROM saas.lucky_wheel_admin_operations WHERE store_id=p_store AND operation_id=p_operation;IF FOUND THEN IF op.action<>'revoke' OR op.principal_id<>p_principal OR op.membership_id<>p_membership OR op.fingerprint<>p_fingerprint OR op.request_payload<>request THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;RETURN;END IF;
 SELECT * INTO c FROM saas.lucky_wheel_campaigns WHERE store_id=p_store AND id=p_campaign FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;IF c.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 -- Same row and namespace locks as native reserve; durable holds remain settleable even after their wall clock expiry.
 PERFORM p.id FROM saas.promotions p JOIN saas.lucky_wheel_rewards r ON r.store_id=p.store_id AND r.managed_promotion_id=p.id WHERE r.store_id=p_store AND r.campaign_id=p_campaign ORDER BY p.id FOR UPDATE OF p;
 PERFORM pg_advisory_xact_lock(hashtextextended('promotion-code:'||p_store::text,0));PERFORM pc.id FROM saas.promotion_codes pc JOIN saas.lucky_wheel_awards a ON a.store_id=pc.store_id AND a.code_id=pc.id WHERE a.store_id=p_store AND a.campaign_id=p_campaign ORDER BY pc.id FOR UPDATE OF pc;
 SELECT count(*) INTO held_count FROM saas.lucky_wheel_awards a WHERE a.store_id=p_store AND a.campaign_id=p_campaign AND EXISTS(SELECT 1 FROM saas.promotion_usage_reservations h WHERE h.store_id=p_store AND h.code_id=a.code_id AND h.status='reserved');
 UPDATE saas.promotion_codes pc SET status='revoked' FROM saas.lucky_wheel_awards a WHERE a.store_id=p_store AND a.campaign_id=p_campaign AND pc.store_id=a.store_id AND pc.id=a.code_id AND pc.status='active' AND NOT EXISTS(SELECT 1 FROM saas.promotion_usage_reservations h WHERE h.store_id=p_store AND h.code_id=a.code_id AND h.status IN('reserved','committed')) AND NOT EXISTS(SELECT 1 FROM saas.promotion_redemptions d WHERE d.store_id=p_store AND d.code_id=a.code_id);GET DIAGNOSTICS revoked_count=ROW_COUNT;
 result:=jsonb_build_object('campaignId',p_campaign,'revoked',revoked_count,'held',held_count);INSERT INTO saas.lucky_wheel_admin_operations VALUES(p_store,p_operation,p_principal,p_membership,'revoke',p_fingerprint,request,result,date_trunc('milliseconds',p_now));INSERT INTO saas.lucky_wheel_events(store_id,campaign_id,action,version,principal_id,at) VALUES(p_store,c.id,'coupons_revoked',c.version,p_principal,date_trunc('milliseconds',p_now));RETURN QUERY SELECT 'saved',result;END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)')),'UTF8')),'hex')<>'8211dd18edfe7e90cf1c127e4b5dab5bf7c3944d292b4d41e66bf7e6f8b7df93' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)',pg_get_functiondef(p.oid),'8211dd18edfe7e90cf1c127e4b5dab5bf7c3944d292b4d41e66bf7e6f8b7df93',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.promotion_update_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.promotion_update_v1(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_promotion_id uuid, p_expected_version bigint, p_name text, p_rule_document jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE v_error text; v_observed saas.promotions%ROWTYPE; v_current saas.promotions%ROWTYPE; v_operation saas.promotion_operations%ROWTYPE; v_result jsonb; v_readiness jsonb; v_failure text; v_used bigint:=0; v_budget bigint:=0;
BEGIN
IF NOT saas.commercial_plan_has_capability(p_plan_id,'coupons') OR(p_rule_document->>'kind' IN('order_bump','popup','lucky_wheel') AND NOT saas.commercial_plan_has_capability(p_plan_id,'growth_tools')) THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'promotion_update_v1');
  IF p_promotion_id IS NULL OR p_operation_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_fingerprint IS DISTINCT FROM saas.promotion_operation_fingerprint_v2('update',p_store_id,pg_catalog.jsonb_build_object('id',p_promotion_id,'expectedVersion',p_expected_version,'name',p_name,'ruleDocument',p_rule_document)) OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR pg_catalog.length(p_name) NOT BETWEEN 1 AND 200 OR pg_catalog.octet_length(p_name)>800 OR p_name~'[[:cntrl:]]' OR saas.promotion_rule_document_valid(p_rule_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  v_error:=saas.promotion_operation_authority_lock_v1(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,'promotions.manage_draft'); IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.promotion_deletions WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.promotion_operations op WHERE op.store_id=p_store_id AND op.operation_id=p_operation_id AND ((op.result_entity_kind='promotion' AND saas.promotion_is_deleted_v1(p_store_id,op.result_entity_id)) OR (op.result_entity_kind='code_batch' AND EXISTS(SELECT 1 FROM saas.promotion_code_batches batch WHERE batch.store_id=p_store_id AND batch.id=op.result_entity_id AND saas.promotion_is_deleted_v1(p_store_id,batch.promotion_id))))) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_operation FROM saas.promotion_operations WHERE store_id=p_store_id AND operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF v_operation.operation_kind<>'update' OR v_operation.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSIF saas.promotion_operation_result_valid('update',v_operation.result_payload) IS NOT TRUE OR v_operation.result_entity_kind<>'promotion' OR v_operation.result_entity_id IS DISTINCT FROM saas.promotion_operation_entity_id('update',v_operation.result_payload) THEN RETURN QUERY SELECT 'operation_result_invalid',NULL::jsonb;
    ELSE
      IF v_operation.result_payload->>'status'<>'draft' THEN
        v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.publish');
        IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
      END IF;
      RETURN QUERY SELECT 'operation_replayed',v_operation.result_payload;
    END IF;
    RETURN;
  END IF;
  -- Observe without a row lock, acquire all catalog/reference locks first, and
  -- only then lock the promotion. Checkout uses that same refs -> promotion
  -- order, so the two paths cannot form a promotion <-> variant cycle.
  SELECT * INTO v_observed FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_observed.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF;
  IF v_observed.version=9007199254740991 OR v_observed.status='archived' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF v_observed.status<>'draft' THEN
    v_error:=saas.promotion_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'promotions.publish');
    IF v_error IS NOT NULL THEN RETURN QUERY SELECT v_error,NULL::jsonb; RETURN; END IF;
  END IF;
  IF saas.promotion_lock_definition_references(p_store_id,p_rule_document) IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb; RETURN; END IF;
  SELECT * INTO v_current FROM saas.promotions WHERE store_id=p_store_id AND id=p_promotion_id FOR UPDATE;
  IF saas.promotion_is_deleted_v1(p_store_id,p_promotion_id) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF v_current.version IS DISTINCT FROM p_expected_version
     OR v_current.version IS DISTINCT FROM v_observed.version
     OR v_current.status IS DISTINCT FROM v_observed.status
     OR v_current.name IS DISTINCT FROM v_observed.name
     OR v_current.rule_document IS DISTINCT FROM v_observed.rule_document
  THEN RETURN QUERY SELECT 'version_conflict',saas.promotion_projection(p_store_id,p_promotion_id); RETURN; END IF;
  IF v_current.version=9007199254740991 OR v_current.status='archived' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF v_current.status='scheduled' AND (p_rule_document->'schedule'->>'startsAt' IS NULL OR (p_rule_document->'schedule'->>'startsAt')::timestamptz<=p_now) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF v_current.status='active' THEN
    SELECT count(*) FILTER (WHERE reservation.status='committed' OR (reservation.status='reserved' AND reservation.expires_at>p_now))::bigint,
      COALESCE(sum(reservation.reserved_budget_minor) FILTER (WHERE reservation.status='committed' OR (reservation.status='reserved' AND reservation.expires_at>p_now)),0)::bigint
      INTO v_used,v_budget FROM saas.promotion_usage_reservations reservation WHERE reservation.store_id=p_store_id AND reservation.promotion_id=p_promotion_id;
    IF saas.promotion_effective_status_v1('active',p_rule_document,COALESCE(v_used,0),COALESCE(v_budget,0),p_now)<>'active' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  END IF;
  IF v_current.status IN ('active','scheduled') THEN
    -- Freeze the same store-wide code namespace used by direct and batch
    -- materialization before deriving the publish-readiness projection.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('promotion-code:'||p_store_id::text,0));
    v_readiness:=saas.promotion_conflict_projection_v1(p_store_id,p_now,p_rule_document,p_promotion_id);
    IF v_readiness IS NULL THEN RETURN QUERY SELECT 'projection_unavailable',NULL::jsonb; RETURN; END IF;
    IF (v_readiness->>'blocking')::boolean THEN RETURN QUERY SELECT 'publish_blocked',v_readiness; RETURN; END IF;
  END IF;
  BEGIN
    v_error:=saas.promotion_sync_direct_codes(p_store_id,p_promotion_id,p_rule_document,p_now);
    IF v_error IS NOT NULL THEN RAISE EXCEPTION 'promotion_mutation:%',v_error; END IF;
    PERFORM saas.promotion_materialize_targets(p_store_id,p_promotion_id,p_rule_document);
    UPDATE saas.promotions SET name=p_name,rule_document=p_rule_document,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_promotion_id;
    INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_promotion_id,v_current.version+1,p_rule_document,p_now);
    v_result:=saas.promotion_projection(p_store_id,p_promotion_id);
    PERFORM saas.promotion_record_operation(p_store_id,p_operation_id,'update',p_fingerprint,v_result,p_now);
    INSERT INTO saas.promotion_audit_events(id,store_id,promotion_id,actor_principal_id,event_kind,payload,created_at) VALUES(p_operation_id,p_store_id,p_promotion_id,p_principal_id,'updated',pg_catalog.jsonb_build_object('fromVersion',v_current.version,'toVersion',v_current.version+1),p_now);
  EXCEPTION WHEN raise_exception THEN
    GET STACKED DIAGNOSTICS v_failure=MESSAGE_TEXT;
    IF v_failure LIKE 'promotion_mutation:%' THEN RETURN QUERY SELECT pg_catalog.substr(v_failure,20),NULL::jsonb; RETURN; END IF;
    RAISE;
  END;
  RETURN QUERY SELECT 'updated',v_result;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.lucky_wheel_campaign_save_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,boolean,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.lucky_wheel_campaign_save_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,boolean,jsonb)')),'UTF8')),'hex')<>'bcb423efab3985b9e0fd745a46121233fccef76a05aad6cec993246d8c4abe12' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.lucky_wheel_campaign_save_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,boolean,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.lucky_wheel_campaign_save_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,boolean,jsonb)',pg_get_functiondef(p.oid),'bcb423efab3985b9e0fd745a46121233fccef76a05aad6cec993246d8c4abe12',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.lucky_wheel_campaign_save_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,boolean,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.lucky_wheel_campaign_save_v1(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation uuid, p_fingerprint text, p_campaign uuid, p_expected_version bigint, p_name text, p_enabled boolean, p_config jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;op saas.lucky_wheel_admin_operations;c saas.lucky_wheel_campaigns;src saas.promotions;v jsonb;rules jsonb:='[]';frozen jsonb;request jsonb;result jsonb;managed uuid;reward uuid;pos integer:=0;stamp timestamptz:=date_trunc('milliseconds',p_now);BEGIN
IF NOT saas.commercial_plan_has_capability(p_plan,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;

 e:=saas.promotion_operation_authority_lock_v1(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,p_operation,'promotions.manage_draft');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_enabled THEN e:=saas.promotion_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'promotions.publish');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_name IS NULL OR p_name<>btrim(p_name) OR length(p_name) NOT BETWEEN 1 AND 160 OR p_name~'[[:cntrl:]]' OR p_enabled IS NULL OR(p_campaign IS NULL)<>(p_expected_version IS NULL) OR p_expected_version IS NOT NULL AND p_expected_version NOT BETWEEN 1 AND 9007199254740991 OR saas.lucky_wheel_config_valid(p_config) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lucky-wheel-save:'||p_store::text,226));request:=jsonb_build_object('campaignId',p_campaign,'expectedVersion',p_expected_version,'name',p_name,'enabled',p_enabled,'config',p_config);
 SELECT * INTO op FROM saas.lucky_wheel_admin_operations WHERE store_id=p_store AND operation_id=p_operation;IF FOUND THEN IF op.action<>'save' OR op.principal_id<>p_principal OR op.membership_id<>p_membership OR op.fingerprint<>p_fingerprint OR op.request_payload<>request THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;RETURN;END IF;
 IF p_campaign IS NOT NULL THEN SELECT * INTO c FROM saas.lucky_wheel_campaigns WHERE store_id=p_store AND id=p_campaign AND deleted_at IS NULL FOR UPDATE;IF NOT FOUND THEN RETURN QUERY SELECT CASE WHEN EXISTS(SELECT 1 FROM saas.merchant_admin_records WHERE store_id=p_store AND id=p_campaign AND record_kind='lucky_wheel') THEN 'legacy_configuration' ELSE 'not_found' END,NULL::jsonb;RETURN;END IF;IF c.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;IF c.version=9007199254740991 OR stamp<c.updated_at THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;END IF;
 IF p_enabled AND EXISTS(SELECT 1 FROM saas.lucky_wheel_campaigns WHERE store_id=p_store AND enabled AND deleted_at IS NULL AND id IS DISTINCT FROM p_campaign) THEN RETURN QUERY SELECT 'active_campaign_conflict',NULL::jsonb;RETURN;END IF;
 IF p_campaign IS NULL AND(SELECT count(*) FROM saas.lucky_wheel_campaigns WHERE store_id=p_store AND deleted_at IS NULL)>=80 THEN RETURN QUERY SELECT 'limit_exceeded',NULL::jsonb;RETURN;END IF;
 -- Source conditions are locked and copied. They are not a live eligibility dependency after issuance.
 FOR v IN SELECT value FROM jsonb_array_elements(p_config->'prizes') LOOP
 IF NOT p_enabled AND c.id IS NOT NULL AND c.config=p_config THEN
 SELECT jsonb_build_object('sourceId',source_promotion_id,'sourceVersion',source_version,'rule',rule_document) INTO frozen FROM saas.lucky_wheel_rewards WHERE store_id=p_store AND campaign_id=c.id AND campaign_version=c.version AND prize_id=(v->>'id')::uuid;rules:=rules||jsonb_build_array(frozen);CONTINUE;END IF;
 SELECT * INTO src FROM saas.promotions WHERE store_id=p_store AND id=(v->>'promotionId')::uuid FOR SHARE;
 IF NOT FOUND OR saas.promotion_is_deleted_v1(p_store,src.id) OR EXISTS(SELECT 1 FROM saas.lucky_wheel_rewards WHERE store_id=p_store AND managed_promotion_id=src.id) OR src.status NOT IN('active','scheduled') OR saas.lucky_wheel_rule_eligible_v1(src.rule_document) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'promotion_unavailable',NULL::jsonb;RETURN;END IF;
 -- A stopped unchanged campaign can always be saved after its frozen source is removed.
 frozen:=jsonb_set(jsonb_set(src.rule_document,'{conditions,salesChannels}','["storefront"]'::jsonb,true),'{trigger}',jsonb_build_object('kind','code','codes',jsonb_build_array('W-'||upper(replace(gen_random_uuid()::text,'-','')))),false);
 rules:=rules||jsonb_build_array(jsonb_build_object('sourceId',src.id,'sourceVersion',src.version,'rule',frozen));END LOOP;
 IF p_campaign IS NULL THEN INSERT INTO saas.lucky_wheel_campaigns(store_id,name,enabled,version,config,created_at,updated_at,created_by,updated_by) VALUES(p_store,p_name,p_enabled,1,p_config,stamp,stamp,p_principal,p_principal) RETURNING * INTO c;ELSE UPDATE saas.lucky_wheel_campaigns SET name=p_name,enabled=p_enabled,version=version+1,config=p_config,updated_at=stamp,updated_by=p_principal WHERE store_id=p_store AND id=p_campaign RETURNING * INTO c;END IF;
 INSERT INTO saas.lucky_wheel_campaign_versions VALUES(p_store,c.id,c.version,p_config,stamp);
 FOR v IN SELECT value FROM jsonb_array_elements(p_config->'prizes') LOOP
 INSERT INTO saas.lucky_wheel_prize_counters(store_id,campaign_id,prize_id) VALUES(p_store,c.id,(v->>'id')::uuid) ON CONFLICT DO NOTHING;
 managed:=gen_random_uuid();reward:=gen_random_uuid();frozen:=rules->pos->'rule';
 INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at) VALUES(managed,p_store,'Şans Çarkı · '||saas.lucky_wheel_label_v1(frozen),'active',1,frozen,stamp,stamp);
 INSERT INTO saas.promotion_versions(id,store_id,promotion_id,version,rule_document,created_at) VALUES(gen_random_uuid(),p_store,managed,1,frozen,stamp);
 INSERT INTO saas.lucky_wheel_rewards(id,store_id,campaign_id,campaign_version,prize_id,position,source_promotion_id,source_version,managed_promotion_id,rule_document,weight_bps,issuance_limit,created_at) VALUES(reward,p_store,c.id,c.version,(v->>'id')::uuid,pos,(rules->pos->>'sourceId')::uuid,(rules->pos->>'sourceVersion')::bigint,managed,frozen,(v->>'weightBps')::integer,(v->>'issuanceLimit')::bigint,stamp);pos:=pos+1;END LOOP;
 result:=saas.lucky_wheel_campaign_projection_v1(c,p_now);INSERT INTO saas.lucky_wheel_admin_operations VALUES(p_store,p_operation,p_principal,p_membership,'save',p_fingerprint,request,result,stamp);INSERT INTO saas.lucky_wheel_events(store_id,campaign_id,action,version,principal_id,at) VALUES(p_store,c.id,CASE WHEN c.version=1 THEN 'created' ELSE 'updated' END,c.version,p_principal,stamp);RETURN QUERY SELECT 'saved',result;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.lucky_wheel_managed_promotions_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,uuid)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.lucky_wheel_managed_promotions_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,uuid)')),'UTF8')),'hex')<>'c61882a716e351e5ab1c5a396deea55edd60568f80193ebe06c83a5483c15101' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.lucky_wheel_managed_promotions_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,uuid)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.lucky_wheel_managed_promotions_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,uuid)',pg_get_functiondef(p.oid),'c61882a716e351e5ab1c5a396deea55edd60568f80193ebe06c83a5483c15101',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.lucky_wheel_managed_promotions_v1(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,uuid)');END $patch$;
CREATE OR REPLACE FUNCTION saas.lucky_wheel_managed_promotions_v1(p_store uuid, p_principal uuid, p_membership uuid, p_plan uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_limit integer, p_after_at timestamp with time zone, p_after_id uuid)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE e text;BEGIN
IF NOT saas.commercial_plan_has_capability(p_plan,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 e:=saas.promotion_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'promotions.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 OR(p_after_at IS NULL)<>(p_after_id IS NULL) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 RETURN QUERY WITH page AS(SELECT r.*,c.name campaign_name,c.deleted_at IS NOT NULL deleted FROM saas.lucky_wheel_rewards r JOIN saas.lucky_wheel_campaigns c ON c.store_id=r.store_id AND c.id=r.campaign_id WHERE r.store_id=p_store AND(p_after_at IS NULL OR(r.created_at,r.id)<(p_after_at,p_after_id)) ORDER BY r.created_at DESC,r.id DESC LIMIT p_limit+1),bounded AS(SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT p_limit) SELECT 'ok',jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('promotionId',r.managed_promotion_id,'campaignId',r.campaign_id,'campaignName',r.campaign_name,'issued',(SELECT count(*) FROM saas.lucky_wheel_awards a WHERE a.store_id=r.store_id AND a.reward_id=r.id),'used',(SELECT count(*) FROM saas.lucky_wheel_awards a JOIN saas.promotion_redemptions d ON d.store_id=a.store_id AND d.code_id=a.code_id WHERE a.store_id=r.store_id AND a.reward_id=r.id),'deleted',r.deleted) ORDER BY r.created_at DESC,r.id DESC) FROM bounded r),'[]'::jsonb),'hasMore',(SELECT count(*)>p_limit FROM page),'nextCursor',CASE WHEN(SELECT count(*)>p_limit FROM page) THEN(SELECT saas.merchant_admin_timestamp(created_at)||'|'||id::text FROM bounded ORDER BY created_at,id LIMIT 1) END);END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.platform_command(uuid,text,jsonb,bigint,text)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.platform_command(uuid,text,jsonb,bigint,text)')),'UTF8')),'hex')<>'f7e8ed9432f4185e0be57926912b258233d917d25e19ac0e61a9efabd02199a7' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.platform_command(uuid,text,jsonb,bigint,text)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.platform_command(uuid,text,jsonb,bigint,text)',pg_get_functiondef(p.oid),'f7e8ed9432f4185e0be57926912b258233d917d25e19ac0e61a9efabd02199a7',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.platform_command(uuid,text,jsonb,bigint,text)');END $patch$;
CREATE OR REPLACE FUNCTION saas.platform_command(p_operator uuid, p_action text, p_payload jsonb, p_expected_version bigint, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE commercial_previous_subscription saas.subscriptions%ROWTYPE;sid uuid; ver bigint; request jsonb; prior saas.platform_command_results; result jsonb; entity uuid; period saas.platform_billing_periods; receipt saas.platform_receipts; amount bigint; plan saas.plans; target saas.principals; token text; usage jsonb; feature text; limits text[]:=ARRAY['products','staff','storageBytes','monthlyOrders','customDomains']; features text[]:=ARRAY['catalog','orders','customers','content','media','analytics','checkout','custom_domains','staff_management','promotions','integrations','accounting','marketplaces']; i integer;BEGIN
   IF p_action='ownership.invite' THEN RAISE EXCEPTION 'merchant_invitations_retired';END IF;
   IF p_action='membership.update' AND saas.merchant_whatsapp_policy_enabled((p_payload->>'storeId')::uuid) THEN RAISE EXCEPTION 'merchant_owner_required';END IF;
  
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR pg_column_size(p_payload)>16384 OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 128 OR p_idempotency_key<>btrim(p_idempotency_key) OR p_idempotency_key~'[[:cntrl:]]' THEN RAISE EXCEPTION 'invalid_input';END IF;
 request:=jsonb_build_object('action',p_action,'payload',CASE WHEN p_action='support.issue' THEN (p_payload-'handoff')||jsonb_build_object('handoffHash',encode(sha256(convert_to(p_payload->>'handoff','UTF8')),'hex')) ELSE p_payload END,'expectedVersion',p_expected_version);PERFORM pg_advisory_xact_lock(hashtextextended('platform-replay:'||p_operator::text||':'||p_idempotency_key,0));SELECT * INTO prior FROM saas.platform_command_results WHERE operator_id=p_operator AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF prior.request<>request THEN RAISE EXCEPTION 'operation_mismatch';END IF;result:=jsonb_set(prior.result,'{outcome}','"replayed"');IF p_action='support.issue' THEN result:=jsonb_set(result,'{result,handoff}',to_jsonb(p_payload->>'handoff'));END IF;RETURN result;END IF;
 IF p_action IN('support.issue','support.revoke','sales.pause','sales.resume') THEN
  IF p_action='support.issue' THEN IF p_payload-ARRAY['storeId','adminHost','host','reason','handoff']<>'{}' OR NOT(p_payload ?& ARRAY['storeId','reason','handoff']) OR NOT(p_payload ? 'adminHost' OR p_payload ? 'host') THEN RAISE EXCEPTION 'invalid_input';END IF;EXECUTE 'SELECT saas.platform_support_issue($1,$2,$3,$4,$5,$6,$7)' INTO result USING p_operator,(p_payload->>'storeId')::uuid,coalesce(p_payload->>'adminHost',p_payload->>'host'),p_payload->>'reason',p_expected_version,p_idempotency_key,p_payload->>'handoff';
  ELSIF p_action='support.revoke' THEN IF p_payload-ARRAY['sessionId']<>'{}' OR NOT(p_payload ? 'sessionId') THEN RAISE EXCEPTION 'invalid_input';END IF;EXECUTE 'SELECT saas.platform_support_revoke($1,$2,$3,$4)' INTO result USING p_operator,(p_payload->>'sessionId')::uuid,p_expected_version,p_idempotency_key;
  ELSE IF p_payload-ARRAY['storeId','reason']<>'{}' OR NOT(p_payload ?& ARRAY['storeId','reason']) THEN RAISE EXCEPTION 'invalid_input';END IF;EXECUTE 'SELECT saas.platform_sales_policy_set($1,$2,$3,$4,$5,$6)' INTO result USING p_operator,(p_payload->>'storeId')::uuid,p_action='sales.pause',p_payload->>'reason',p_expected_version,p_idempotency_key;END IF;
  result:=jsonb_build_object('outcome',CASE WHEN result->>'replayed'='true' THEN 'replayed' ELSE 'committed' END,'version',(result->>'version')::bigint,'result',result);
  INSERT INTO saas.platform_command_results(operator_id,idempotency_key,request,result) VALUES(p_operator,p_idempotency_key,request,result#-ARRAY['result','handoff']);RETURN result;
 END IF;
 IF p_action='plan.publish' THEN
  IF p_payload-ARRAY['code','features','limits','monthlyPriceCents','yearlyPriceCents']<>'{}' OR NOT(p_payload ?& ARRAY['code','features','limits']) OR jsonb_typeof(p_payload->'features')<>'object' OR jsonb_typeof(p_payload->'limits')<>'object' OR NOT(p_payload->'features' ?& features) OR (p_payload->'features')-features<>'{}' OR NOT(p_payload->'limits' ?& limits) OR (p_payload->'limits')-limits<>'{}' THEN RAISE EXCEPTION 'invalid_input';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('platform-plan:'||(p_payload->>'code'),0));SELECT coalesce(max(version),0) INTO ver FROM saas.plans WHERE plan_code=p_payload->>'code';IF ver<>p_expected_version THEN RAISE EXCEPTION 'version_conflict';END IF;entity:=gen_random_uuid();
  INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at) VALUES(entity,p_payload->>'code',ver+1,'active',now(),now(),now());INSERT INTO saas.platform_plan_publications VALUES(entity,txid_current());
  FOR i IN 1..array_length(features,1) LOOP IF jsonb_typeof(p_payload->'features'->features[i])<>'boolean' THEN RAISE EXCEPTION 'invalid_input';END IF;INSERT INTO saas.plan_features VALUES(entity,features[i],i,(p_payload->'features'->>features[i])::boolean);END LOOP;
  FOR i IN 1..array_length(limits,1) LOOP IF jsonb_typeof(p_payload->'limits'->limits[i])<>'number' OR (p_payload->'limits'->>limits[i])::numeric<>trunc((p_payload->'limits'->>limits[i])::numeric) OR (p_payload->'limits'->>limits[i])::numeric NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'invalid_input';END IF;INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value) VALUES(entity,limits[i],i,(p_payload->'limits'->>limits[i])::numeric);END LOOP;DELETE FROM saas.platform_plan_publications WHERE plan_id=entity;
  FOREACH feature IN ARRAY ARRAY['monthlyPriceCents','yearlyPriceCents'] LOOP IF p_payload ? feature AND p_payload->feature<>'null'::jsonb AND (jsonb_typeof(p_payload->feature)<>'number' OR (p_payload->>feature)::numeric<>trunc((p_payload->>feature)::numeric) OR (p_payload->>feature)::numeric NOT BETWEEN 0 AND 9007199254740991) THEN RAISE EXCEPTION 'invalid_input';END IF;END LOOP;
  INSERT INTO saas.platform_plan_prices VALUES(entity,(p_payload->>'monthlyPriceCents')::bigint,(p_payload->>'yearlyPriceCents')::bigint);ver:=ver+1;result:=jsonb_build_object('planId',entity);
 ELSE
  sid:=(p_payload->>'storeId')::uuid;IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=sid) THEN RAISE EXCEPTION 'record_not_found';END IF;INSERT INTO saas.platform_store_versions(store_id) VALUES(sid) ON CONFLICT DO NOTHING;SELECT version INTO ver FROM saas.platform_store_versions WHERE store_id=sid FOR UPDATE;IF ver<>p_expected_version THEN RAISE EXCEPTION 'version_conflict';END IF;
  IF p_action='billing.period.create' THEN
   IF p_payload-ARRAY['storeId','label','startsOn','endsOn','dueOn','amountCents']<>'{}' OR NOT(p_payload ?& ARRAY['label','startsOn','endsOn','dueOn','amountCents']) THEN RAISE EXCEPTION 'invalid_input';END IF;
   IF jsonb_typeof(p_payload->'amountCents')<>'number' OR (p_payload->>'amountCents')::numeric<>trunc((p_payload->>'amountCents')::numeric) THEN RAISE EXCEPTION 'invalid_input';END IF;
   INSERT INTO saas.platform_billing_periods(store_id,label,starts_on,ends_on,due_on,amount_cents) VALUES(sid,p_payload->>'label',(p_payload->>'startsOn')::date,(p_payload->>'endsOn')::date,(p_payload->>'dueOn')::date,(p_payload->>'amountCents')::bigint) RETURNING id INTO entity;result:=jsonb_build_object('periodId',entity);
  ELSIF p_action='billing.period.adjust' THEN
   IF p_payload-ARRAY['storeId','periodId','deltaCents','reason']<>'{}' OR NOT(p_payload ?& ARRAY['periodId','deltaCents','reason']) OR jsonb_typeof(p_payload->'deltaCents')<>'number' OR (p_payload->>'deltaCents')::numeric<>trunc((p_payload->>'deltaCents')::numeric) OR (p_payload->>'deltaCents')::numeric NOT BETWEEN -9007199254740991 AND 9007199254740991 OR (p_payload->>'deltaCents')::numeric=0 OR jsonb_typeof(p_payload->'reason')<>'string' OR length(btrim(p_payload->>'reason')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'invalid_input';END IF;
   SELECT * INTO period FROM saas.platform_billing_periods WHERE store_id=sid AND id=(p_payload->>'periodId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;amount:=(p_payload->>'deltaCents')::bigint;
   IF (saas.platform_period_projection(period.id)->>'amountCents')::numeric+amount NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'invalid_input';END IF;
   IF (saas.platform_period_projection(period.id)->>'remainingCents')::numeric+amount<0 THEN RAISE EXCEPTION 'charge_below_collected';END IF;
   INSERT INTO saas.platform_billing_adjustments(store_id,period_id,delta_cents,reason) VALUES(sid,period.id,amount,btrim(p_payload->>'reason')) RETURNING id INTO entity;result:=jsonb_build_object('adjustmentId',entity,'periodId',period.id);
  ELSIF p_action='billing.receipt.record' THEN
   IF p_payload-ARRAY['storeId','periodId','amountCents','method','reference']<>'{}' OR NOT(p_payload ?& ARRAY['periodId','amountCents','method','reference']) OR jsonb_typeof(p_payload->'amountCents')<>'number' OR (p_payload->>'amountCents')::numeric<>trunc((p_payload->>'amountCents')::numeric) THEN RAISE EXCEPTION 'invalid_input';END IF;
   SELECT * INTO period FROM saas.platform_billing_periods WHERE store_id=sid AND id=(p_payload->>'periodId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;amount:=(p_payload->>'amountCents')::bigint;
   IF amount<1 OR amount>(saas.platform_period_projection(period.id)->>'remainingCents')::bigint THEN RAISE EXCEPTION 'overpayment';END IF;INSERT INTO saas.platform_receipts(store_id,period_id,amount_cents,method,reference) VALUES(sid,period.id,amount,p_payload->>'method',p_payload->>'reference') RETURNING id INTO entity;result:=jsonb_build_object('receiptId',entity,'periodId',period.id);
  ELSIF p_action='billing.receipt.reverse' THEN
   IF p_payload-ARRAY['storeId','receiptId','reason']<>'{}' OR NOT(p_payload ?& ARRAY['receiptId','reason']) THEN RAISE EXCEPTION 'invalid_input';END IF;SELECT * INTO receipt FROM saas.platform_receipts WHERE store_id=sid AND id=(p_payload->>'receiptId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;IF EXISTS(SELECT 1 FROM saas.platform_receipt_reversals WHERE receipt_id=receipt.id) THEN RAISE EXCEPTION 'already_reversed';END IF;INSERT INTO saas.platform_receipt_reversals(store_id,receipt_id,reason) VALUES(sid,receipt.id,p_payload->>'reason') RETURNING id INTO entity;result:=jsonb_build_object('reversalId',entity,'periodId',receipt.period_id);
  ELSIF p_action='subscription.assign' THEN
   IF EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=(p_payload->>'planId')::uuid) AND NOT(SELECT assignments_enabled FROM saas.commercial_package_release_state WHERE singleton) THEN RAISE EXCEPTION 'commercial_assignment_disabled';END IF;
   SELECT * INTO commercial_previous_subscription FROM saas.subscriptions WHERE store_id=sid AND status='active' FOR UPDATE;
   PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||sid,0));
   IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=sid AND status='active' AND valid_until<=clock_timestamp()) THEN RAISE EXCEPTION 'subscription_expired';END IF;
   IF p_payload-ARRAY['storeId','planId']<>'{}' OR NOT(p_payload ? 'planId') THEN RAISE EXCEPTION 'invalid_input';END IF;SELECT * INTO plan FROM saas.plans WHERE id=(p_payload->>'planId')::uuid AND status='active' AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now());IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;
   IF EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=plan.id) AND (SELECT effective_limit FROM saas.plan_limits WHERE plan_id=plan.id AND limit_key='monthlyOrders')<(saas.commercial_usage(sid,clock_timestamp())->>'monthlyOrders')::bigint+(SELECT count(*) FROM saas.commercial_order_reservations WHERE store_id=sid AND state='reserved' AND month_start=saas.commercial_month(sid,clock_timestamp())) THEN RAISE EXCEPTION 'limit_below_usage';END IF;IF EXISTS(SELECT 1 FROM saas.commercial_plan_policies p WHERE p.plan_id=plan.id AND p.variant_limit<(saas.commercial_usage(sid,clock_timestamp())->>'variants')::bigint) THEN RAISE EXCEPTION 'limit_below_usage';END IF;usage:=CASE WHEN EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=plan.id) THEN saas.commercial_usage(sid,clock_timestamp())-'variants' ELSE saas.platform_store_usage(sid) END;FOR i IN 1..array_length(limits,1) LOOP IF NOT EXISTS(SELECT 1 FROM saas.plan_limits WHERE plan_id=plan.id AND limit_key=limits[i] AND effective_limit>=(usage->>limits[i])::bigint) THEN RAISE EXCEPTION 'limit_below_usage';END IF;END LOOP;
   IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=sid AND status IN('payment_pending','payment_received')) THEN FOREACH feature IN ARRAY ARRAY['orders','checkout','catalog'] LOOP IF NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=plan.id AND feature_key=feature AND enabled) THEN RAISE EXCEPTION 'pending_pos_blocks_downgrade';END IF;END LOOP;END IF;
   IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=sid AND status IN('payment_pending','payment_received') AND ((contract_version=4 AND NOT saas.commercial_plan_has_capability(plan.id,'manual_orders')) OR(contract_version<>4 AND NOT saas.commercial_plan_has_capability(plan.id,'cashier')))) THEN RAISE EXCEPTION 'pending_pos_blocks_downgrade';END IF;
   IF (EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE store_id=sid AND sale_cents-return_cents-discount_cents-collected_cents>0) OR EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=sid AND status IN('payment_pending','payment_received') AND contract_version IN(3,4) AND initial_collection_cents<total_cents)) AND NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=plan.id AND feature_key='accounting' AND enabled) THEN RAISE EXCEPTION 'open_debt_blocks_downgrade';END IF;
   UPDATE saas.subscriptions SET status='inactive',updated_at=greatest(clock_timestamp(),updated_at) WHERE store_id=sid AND status='active';INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES(gen_random_uuid(),sid,plan.id,plan.plan_code,plan.version,'active',clock_timestamp(),commercial_previous_subscription.valid_until,clock_timestamp(),clock_timestamp()) RETURNING id INTO entity;result:=jsonb_build_object('subscriptionId',entity,'planId',plan.id);
  ELSIF p_action='membership.update' THEN
   IF p_payload-ARRAY['storeId','membershipId','role','status']<>'{}' OR NOT(p_payload ?& ARRAY['membershipId','role','status']) OR p_payload->>'role' NOT IN('store_owner','admin','editor','analyst','cashier') OR p_payload->>'status' NOT IN('active','invited','revoked') THEN RAISE EXCEPTION 'invalid_input';END IF;
   IF NOT EXISTS(SELECT 1 FROM saas.memberships m WHERE store_id=sid AND id=(p_payload->>'membershipId')::uuid AND coalesce(to_jsonb(m)->>'support_session_id','')='') THEN RAISE EXCEPTION 'record_not_found';END IF;
   IF p_payload->>'role'='store_owner' AND NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=(p_payload->>'membershipId')::uuid AND role='store_owner' AND status='active') THEN RAISE EXCEPTION 'ownership_acceptance_required';END IF;
   IF p_payload->>'status'='active' AND EXISTS(SELECT 1 FROM saas.memberships WHERE id=(p_payload->>'membershipId')::uuid AND status='invited') THEN RAISE EXCEPTION 'invitation_acceptance_required';END IF;
   IF p_payload->>'role'<>'store_owner' AND p_payload->>'status'='active' AND EXISTS(SELECT 1 FROM saas.memberships WHERE id=(p_payload->>'membershipId')::uuid AND (role='store_owner' OR status<>'active')) AND NOT EXISTS(SELECT 1 FROM saas.plan_limits l JOIN saas.subscriptions sub ON sub.plan_id=l.plan_id WHERE sub.store_id=sid AND sub.status='active' AND l.limit_key='staff' AND l.effective_limit>(saas.platform_store_usage(sid)->>'staff')::bigint) THEN RAISE EXCEPTION 'staff_limit_reached';END IF;
   UPDATE saas.memberships SET role=p_payload->>'role',status=p_payload->>'status',updated_at=greatest(clock_timestamp(),updated_at) WHERE id=(p_payload->>'membershipId')::uuid AND store_id=sid RETURNING id INTO entity;result:=jsonb_build_object('membershipId',entity);
  ELSIF p_action='ownership.invite' THEN
   IF p_payload-ARRAY['storeId','targetPrincipalId','role','kind','previousOwnerDisposition']<>'{}' OR NOT(p_payload ?& ARRAY['targetPrincipalId','role','kind']) THEN RAISE EXCEPTION 'invalid_input';END IF;SELECT * INTO target FROM saas.principals WHERE id=(p_payload->>'targetPrincipalId')::uuid AND email_verified;IF NOT FOUND THEN RAISE EXCEPTION 'verified_identity_required';END IF;token:=gen_random_uuid()::text||gen_random_uuid()::text;
   INSERT INTO saas.platform_ownership_invitations(store_id,target_principal_id,target_issuer,target_subject,role,kind,previous_owner_disposition,created_by,token_hash,expires_at) VALUES(sid,target.id,target.issuer,target.subject,p_payload->>'role',p_payload->>'kind',p_payload->>'previousOwnerDisposition',p_operator,sha256(convert_to(token,'UTF8')),now()+interval '7 days') RETURNING id INTO entity;result:=jsonb_build_object('invitationId',entity,'acceptanceToken',token,'expiresAt',now()+interval '7 days');
  ELSE RAISE EXCEPTION 'invalid_input';END IF;
  ver:=ver+1;UPDATE saas.platform_store_versions SET version=ver WHERE store_id=sid;
 END IF;
 INSERT INTO saas.platform_audit(operator_id,store_id,action,payload) VALUES(p_operator,sid,p_action,p_payload);
 result:=jsonb_build_object('outcome','committed','version',ver,'result',result);INSERT INTO saas.platform_command_results(operator_id,idempotency_key,request,result) VALUES(p_operator,p_idempotency_key,request,result);RETURN result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range OR check_violation OR not_null_violation THEN RAISE EXCEPTION 'invalid_input';
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.platform_read(uuid,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.platform_read(uuid,text,jsonb)')),'UTF8')),'hex')<>'d136143b4d7253bba61ce45cb3d5d9312e7b35968f5923c6af48b672c986e9f7' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.platform_read(uuid,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.platform_read(uuid,text,jsonb)',pg_get_functiondef(p.oid),'d136143b4d7253bba61ce45cb3d5d9312e7b35968f5923c6af48b672c986e9f7',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.platform_read(uuid,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.platform_read(p_operator uuid, p_resource text, p_query jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE items jsonb; sid uuid; envelope jsonb:=jsonb_build_object('available',true,'observedAt',statement_timestamp());BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);IF p_query IS NULL OR jsonb_typeof(p_query)<>'object' OR pg_column_size(p_query)>8192 OR p_query-ARRAY['storeId','limit','email','q','status','from','to','after']<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid_input';END IF;
 IF p_query ? 'limit' AND ((p_query->>'limit')!~'^[0-9]{1,3}$' OR (p_query->>'limit')::integer NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'invalid_input';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_query) WHERE jsonb_typeof(value) NOT IN('string','number')) THEN RAISE EXCEPTION 'invalid_input';END IF;
 sid:=(p_query->>'storeId')::uuid;
 IF p_resource='package-requests' THEN
 SELECT coalesce(jsonb_agg(payload ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO items FROM(SELECT r.id,r.created_at,jsonb_build_object('id',r.id,'storeId',r.store_id,'storeName',s.name,'planId',r.plan_id,'createdAt',saas.orders_json_timestamp(r.created_at),'status',CASE WHEN EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=r.store_id AND plan_id=r.plan_id AND created_at>=r.created_at) THEN 'applied' ELSE 'pending' END,'storeVersion',coalesce(v.version,0)) payload FROM saas.commercial_upgrade_requests r JOIN saas.stores s ON s.id=r.store_id LEFT JOIN saas.platform_store_versions v ON v.store_id=r.store_id WHERE(sid IS NULL OR r.store_id=sid) AND(p_query->>'after' IS NULL OR r.created_at<(p_query->>'after')::timestamptz) ORDER BY r.created_at DESC,r.id DESC LIMIT least(coalesce((p_query->>'limit')::integer,100),200)) page;
 RETURN envelope||jsonb_build_object('items',items,'nextCursor',CASE WHEN jsonb_array_length(items)=least(coalesce((p_query->>'limit')::integer,100),200) THEN items->(jsonb_array_length(items)-1)->>'createdAt' ELSE NULL END);
 ELSIF p_resource='store-detail' THEN RETURN envelope||jsonb_build_object('store',saas.platform_store_projection(sid,true));
 ELSIF p_resource='stores' THEN SELECT coalesce(jsonb_agg(saas.platform_store_projection(id,false) ORDER BY created_at DESC),'[]'::jsonb) INTO items FROM saas.stores WHERE (sid IS NULL OR id=sid) AND (p_query->>'q' IS NULL OR strpos(lower(name||' '||slug),lower(p_query->>'q'))>0) AND (p_query->>'status' IS NULL OR status=p_query->>'status');
 ELSIF p_resource='usage' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('storeId',id,'usage',saas.platform_store_usage(id))),'[]'::jsonb) INTO items FROM saas.stores WHERE sid IS NULL OR id=sid;
 ELSIF p_resource='memberships' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'storeId',m.store_id,'principalId',m.principal_id,'email',p.email,'role',m.role,'status',m.status,'version',coalesce(v.version,0))),'[]'::jsonb) INTO items FROM saas.memberships m JOIN saas.principals p ON p.id=m.principal_id LEFT JOIN saas.platform_store_versions v ON v.store_id=m.store_id WHERE (sid IS NULL OR m.store_id=sid) AND coalesce(to_jsonb(m)->>'support_session_id','')='';
 ELSIF p_resource='invitations' THEN
  IF p_query ? 'email' AND (jsonb_typeof(p_query->'email')<>'string' OR length(p_query->>'email') NOT BETWEEN 3 AND 320 OR p_query->>'email'<>lower(btrim(p_query->>'email'))) THEN RAISE EXCEPTION 'invalid_input';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'storeId',store_id,'targetPrincipalId',target_principal_id,'role',role,'kind',kind,'expiresAt',expires_at,'acceptedAt',accepted_at)),'[]'::jsonb) INTO items FROM saas.platform_ownership_invitations WHERE sid IS NULL OR store_id=sid;
  RETURN envelope||jsonb_build_object('items',items,'candidates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'email',email,'verified',email_verified)) FROM saas.principals WHERE email_verified AND email=p_query->>'email'),'[]'::jsonb));
 ELSIF p_resource='plans' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'code',p.plan_code,'version',p.version,'status',p.status,'monthlyPriceCents',(SELECT monthly_price_cents FROM saas.platform_plan_prices WHERE plan_id=p.id),'yearlyPriceCents',(SELECT yearly_price_cents FROM saas.platform_plan_prices WHERE plan_id=p.id),'features',(SELECT jsonb_object_agg(feature_key,enabled ORDER BY feature_ordinal) FROM saas.plan_features WHERE plan_id=p.id),'limits',(SELECT jsonb_object_agg(limit_key,effective_limit ORDER BY limit_ordinal) FROM saas.plan_limits WHERE plan_id=p.id)) ORDER BY p.plan_code,p.version),'[]'::jsonb) INTO items FROM saas.plans p;
 ELSIF p_resource='subscriptions' THEN SELECT coalesce(jsonb_agg(saas.platform_subscription_projection(id)) FILTER(WHERE saas.platform_subscription_projection(id) IS NOT NULL),'[]'::jsonb) INTO items FROM saas.stores WHERE sid IS NULL OR id=sid;
 ELSIF p_resource='billing' THEN SELECT coalesce(jsonb_agg(saas.platform_period_projection(id) ORDER BY starts_on DESC),'[]'::jsonb) INTO items FROM saas.platform_billing_periods WHERE (sid IS NULL OR store_id=sid) AND (p_query->>'q' IS NULL OR strpos(lower(label),lower(p_query->>'q'))>0) AND (p_query->>'from' IS NULL OR starts_on>=(p_query->>'from')::date) AND (p_query->>'to' IS NULL OR starts_on<=(p_query->>'to')::date);
 ELSIF p_resource='audit' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'operatorId',operator_id,'storeId',store_id,'action',action,'payload',payload,'createdAt',created_at) ORDER BY created_at DESC),'[]'::jsonb) INTO items FROM (SELECT * FROM saas.platform_audit WHERE (sid IS NULL OR store_id=sid) AND (p_query->>'q' IS NULL OR strpos(lower(action||' '||payload::text),lower(p_query->>'q'))>0) AND (p_query->>'from' IS NULL OR created_at>=(p_query->>'from')::timestamptz) AND (p_query->>'to' IS NULL OR created_at<(p_query->>'to')::date+interval '1 day') AND (p_query->>'after' IS NULL OR created_at<(p_query->>'after')::timestamptz) ORDER BY created_at DESC LIMIT least(coalesce((p_query->>'limit')::integer,100),200)) a;
 ELSIF p_resource='operations' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'storeId',result_store_id,'status',status,'createdAt',created_at,'updatedAt',updated_at,'retryable',false) ORDER BY created_at DESC),'[]'::jsonb) INTO items FROM (SELECT * FROM saas.tenant_operations WHERE sid IS NULL OR result_store_id=sid ORDER BY created_at DESC LIMIT 100) o;
 ELSIF p_resource='support-sessions' AND to_regprocedure('saas.platform_support_list(uuid,jsonb)') IS NOT NULL THEN EXECUTE 'SELECT saas.platform_support_list($1,$2)' INTO items USING p_operator,p_query;RETURN envelope||items;
 ELSIF p_resource='overview' THEN RETURN envelope||jsonb_build_object('storeCount',(SELECT count(*) FROM saas.stores),'activeStoreCount',(SELECT count(*) FROM saas.stores WHERE status='active'),'pendingSetupCount',(SELECT count(*) FROM saas.stores WHERE status='provisioning'),'attentionIssueCount',(SELECT count(*) FROM saas.registration_onboarding_jobs WHERE state='attention_required')+(SELECT count(*) FROM (SELECT store_id,hostname FROM saas.store_domains WHERE status='pending' UNION SELECT store_id,hostname FROM saas.admin_domains WHERE status='pending_verification' UNION SELECT store_id,normalized_hostname FROM saas.domains WHERE status='pending_verification') pending_domains),'upcomingDueCount',(SELECT count(*) FROM saas.platform_billing_periods WHERE due_on BETWEEN current_date AND current_date+7 AND (saas.platform_period_projection(id)->>'remainingCents')::numeric>0),'merchantSales',saas.platform_merchant_sales_projection(NULL),'currency','TRY','receivableCents',(SELECT coalesce(sum((saas.platform_period_projection(id)->>'remainingCents')::bigint),0) FROM saas.platform_billing_periods),'collectedCents',(SELECT coalesce(sum(amount_cents),0) FROM saas.platform_receipts r WHERE NOT EXISTS(SELECT 1 FROM saas.platform_receipt_reversals x WHERE x.receipt_id=r.id)),'overdueCents',(SELECT coalesce(sum((saas.platform_period_projection(id)->>'remainingCents')::bigint),0) FROM saas.platform_billing_periods WHERE due_on<current_date),'financialSetupRequired',(SELECT count(*) FROM saas.stores s WHERE NOT EXISTS(SELECT 1 FROM saas.platform_billing_periods WHERE store_id=s.id)));
 ELSE RAISE EXCEPTION 'invalid_input';END IF;RETURN envelope||jsonb_build_object('items',items);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN RAISE EXCEPTION 'invalid_input';
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)')),'UTF8')),'hex')<>'17e36cf2d7ba678fe913b6152e08f10d7b13210bf56b1d8d325c554e1b03314d' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)',pg_get_functiondef(p.oid),'17e36cf2d7ba678fe913b6152e08f10d7b13210bf56b1d8d325c554e1b03314d',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.quick_checkout_settle_success_core(uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)');END $patch$;
CREATE OR REPLACE FUNCTION saas.quick_checkout_settle_success_core(p_attempt_id uuid, p_worker_id uuid, p_lease_token text, p_order_id uuid, p_order_item_ids uuid[], p_order_event_id uuid, p_order_number text, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE current_attempt saas.checkout_payment_attempts%ROWTYPE; current_link saas.quick_order_links%ROWTYPE;
  current_job saas.checkout_reconciliation_jobs%ROWTYPE; item_record record; item_index integer:=0;
  expected_item_count bigint; tracked_count bigint; updated_count bigint; projection jsonb;
BEGIN
  SELECT attempt.* INTO current_attempt FROM saas.checkout_payment_attempts AS attempt
    WHERE attempt.id=p_attempt_id FOR UPDATE OF attempt;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link
    WHERE link.store_id=current_attempt.store_id AND link.id=current_attempt.quick_order_link_id FOR UPDATE OF link;
  IF NOT FOUND THEN RETURN QUERY SELECT 'conflict'::text,NULL::jsonb; RETURN; END IF;
  -- inventory checkout store lock begin
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'saas.catalog.store:'||current_attempt.store_id::text,0
    )
  );
  -- inventory checkout store lock end
  -- Shared success settlement lock order is exact: attempt -> link -> persisted products by id -> variants by id -> reservations by variant_id.
  PERFORM product.id FROM saas.products AS product
    WHERE product.store_id=current_attempt.store_id AND EXISTS(
      SELECT 1 FROM saas.checkout_inventory_reservations AS reservation
      WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
        AND reservation.product_id=product.id
    ) ORDER BY product.id FOR KEY SHARE OF product;
  PERFORM variant.id FROM saas.product_variants AS variant
    WHERE variant.store_id=current_attempt.store_id AND EXISTS(
      SELECT 1 FROM saas.checkout_inventory_reservations AS reservation
      WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
        AND reservation.variant_id=variant.id
    ) ORDER BY variant.id FOR UPDATE OF variant;
  PERFORM reservation.id FROM saas.checkout_inventory_reservations AS reservation
    WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
    ORDER BY reservation.variant_id,reservation.id FOR UPDATE OF reservation;

  IF current_attempt.status NOT IN ('provider_ready','initiation_unknown')
     OR current_link.status NOT IN ('active','opened')
     OR p_now<current_attempt.updated_at OR p_now<current_link.updated_at
     OR current_attempt.version=9007199254740991 OR current_link.version=9007199254740991
     OR NOT EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations AS reservation
       WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id)
     OR EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations AS reservation
       WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
         AND (reservation.status<>'held' OR reservation.updated_at>p_now OR reservation.version=9007199254740991)) THEN
    RETURN QUERY SELECT 'conflict'::text,NULL::jsonb; RETURN;
  END IF;
  IF p_worker_id IS NOT NULL THEN
    SELECT job.* INTO current_job FROM saas.checkout_reconciliation_jobs AS job
      WHERE job.attempt_id=current_attempt.id FOR UPDATE OF job;
    IF NOT FOUND OR current_job.status<>'leased' OR current_job.worker_id IS DISTINCT FROM p_worker_id
       OR current_job.lease_expires_at<=p_now OR p_now<current_job.updated_at
       OR saas.quick_checkout_digest_matches(current_job.lease_token_digest,
         saas.quick_checkout_token_digest(p_lease_token)) IS DISTINCT FROM TRUE THEN
      RETURN QUERY SELECT 'invalid_lease'::text,NULL::jsonb; RETURN;
    END IF;
  END IF;
  SELECT pg_catalog.count(*) INTO expected_item_count FROM saas.quick_order_link_items AS item
    WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id;
  IF saas.quick_checkout_uuid_is_valid(p_order_id) IS DISTINCT FROM TRUE
     OR saas.quick_checkout_uuid_is_valid(p_order_event_id) IS DISTINCT FROM TRUE
     OR p_order_item_ids IS NULL OR pg_catalog.array_ndims(p_order_item_ids)<>1
     OR pg_catalog.array_lower(p_order_item_ids,1) IS DISTINCT FROM 1
     OR pg_catalog.cardinality(p_order_item_ids)<>expected_item_count
     OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_order_item_ids) AS supplied(id)
       WHERE saas.quick_checkout_uuid_is_valid(supplied.id) IS DISTINCT FROM TRUE)
     OR (SELECT pg_catalog.count(DISTINCT supplied.id) FROM pg_catalog.unnest(p_order_item_ids) AS supplied(id))<>expected_item_count
     OR p_order_number IS NULL OR p_order_number<>pg_catalog.btrim(p_order_number)
     OR pg_catalog.char_length(p_order_number) NOT BETWEEN 1 AND 64 OR p_order_number~'[[:cntrl:]]' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  IF EXISTS(
    SELECT 1 FROM saas.checkout_inventory_reservations AS reservation
    JOIN saas.product_variants AS variant ON variant.store_id=reservation.store_id AND variant.id=reservation.variant_id
    WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
      AND reservation.stock_tracked AND variant.stock_quantity<reservation.quantity
  ) THEN RETURN QUERY SELECT 'conflict'::text,NULL::jsonb; RETURN; END IF;

  -- ORDER_NUMBER_CREATOR_V161
  p_order_number := saas.order_number_allocate(current_link.store_id,p_order_id,'WEB',p_now);
  PERFORM saas.commercial_reserve_order(current_link.store_id,'checkout:'||p_attempt_id,p_order_id,p_now,current_attempt.created_at<(SELECT valid_from FROM saas.subscriptions WHERE store_id=current_link.store_id AND status='active'));
  UPDATE saas.commercial_order_reservations SET order_id=p_order_id WHERE store_id=current_link.store_id AND reservation_key='checkout:'||p_attempt_id;
  INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
    shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at
  ) VALUES(
    p_order_id,current_link.store_id,p_order_number,'quick_link',current_link.customer_name,
    current_link.customer_email,current_link.customer_phone,current_link.currency,current_link.subtotal_cents,
    current_link.shipping_cents,current_link.discount_cents,current_link.total_cents,'confirmed','completed',
    current_link.shipping_address,current_link.billing_address,current_link.id,1,p_now,p_now
  )
  RETURNING orders.order_number INTO p_order_number;
  FOR item_record IN
    SELECT item.* FROM saas.quick_order_link_items AS item
    WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id
    ORDER BY item.position,item.id
  LOOP
    item_index:=item_index+1;
    INSERT INTO saas.order_items(
      id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,
      unit_price_cents,quantity,discount_cents,line_total_cents,created_at
    ) VALUES(
      p_order_item_ids[item_index],current_link.store_id,p_order_id,item_record.product_id,item_record.variant_id,
      item_record.position,item_record.product_name,item_record.variant_name,item_record.sku,item_record.unit_price_cents,
      item_record.quantity,0,item_record.line_total_cents,p_now
    );
  END LOOP;
  INSERT INTO saas.order_events(
    id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at
  ) VALUES(
    p_order_event_id,current_link.store_id,p_order_id,NULL,'order_created',NULL,'confirmed',
    'Quick order payment confirmed',pg_catalog.jsonb_build_object('source','quick_link'),p_now
  );
  UPDATE saas.checkout_inventory_reservations SET status='consumed',consumed_at=p_now,
    version=version+1,updated_at=p_now
    WHERE store_id=current_attempt.store_id AND attempt_id=current_attempt.id AND status='held';
  SELECT pg_catalog.count(*) INTO tracked_count FROM saas.checkout_inventory_reservations AS reservation
    WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
      AND reservation.stock_tracked;
  -- inventory marker begin
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','checkout_sale',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id',current_attempt.id::text,true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
  UPDATE saas.product_variants AS variant SET stock_quantity=variant.stock_quantity-reservation.quantity,
    version=variant.version+1,updated_at=p_now
    FROM saas.checkout_inventory_reservations AS reservation
    WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
      AND reservation.stock_tracked AND variant.store_id=reservation.store_id AND variant.id=reservation.variant_id;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  -- inventory marker end
  IF updated_count<>tracked_count THEN RAISE check_violation USING MESSAGE='controlled checkout stock transition'; END IF;
  UPDATE saas.checkout_payment_attempts SET status='succeeded',succeeded_at=p_now,settled_order_id=p_order_id,
    version=version+1,updated_at=p_now WHERE id=current_attempt.id;
  UPDATE saas.quick_order_links SET status='paid',opened_at=COALESCE(opened_at,p_now),paid_at=p_now,order_id=p_order_id,
    version=version+1,updated_at=p_now WHERE store_id=current_link.store_id AND id=current_link.id;
  UPDATE saas.checkout_reconciliation_jobs SET status='completed',worker_id=NULL,lease_token_digest=NULL,
    lease_expires_at=NULL,updated_at=p_now WHERE attempt_id=current_attempt.id AND status<>'completed';
  projection:=pg_catalog.jsonb_build_object(
    'outcome','settled','status','succeeded','orderId',p_order_id,'orderNumber',p_order_number
  );
  RETURN QUERY SELECT 'settled'::text,projection;
END
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.store_engagement_public_settings(text,timestamp with time zone)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.store_engagement_public_settings(text,timestamp with time zone)')),'UTF8')),'hex')<>'85ef15e858c372531493e945ab3c4646f9d17e16db9ba265dbe76bbdac4916d2' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.store_engagement_public_settings(text,timestamp with time zone)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.store_engagement_public_settings(text,timestamp with time zone)',pg_get_functiondef(p.oid),'85ef15e858c372531493e945ab3c4646f9d17e16db9ba265dbe76bbdac4916d2',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.store_engagement_public_settings(text,timestamp with time zone)');END $patch$;
CREATE OR REPLACE FUNCTION saas.store_engagement_public_settings(p_hostname text, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE st uuid;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 st:=saas.store_policy_public_store(p_hostname,p_now);IF st IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF NOT saas.commercial_plan_has_capability(saas.commercial_current_plan(st),'growth_tools') THEN RETURN QUERY SELECT 'ok',jsonb_build_object('popups','[]'::jsonb,'cartCapture',NULL);RETURN;END IF;
 RETURN QUERY SELECT 'ok',jsonb_build_object('popups',coalesce((SELECT jsonb_agg(saas.store_engagement_public_projection(c,p_now) ORDER BY c.created_at,c.id) FROM saas.store_engagement_campaigns c WHERE c.store_id=st AND c.enabled AND c.kind='popup' AND(NOT c.config?'promotionId' OR saas.store_engagement_coupon(st,(c.config->>'promotionId')::uuid,p_now) IS NOT NULL)),'[]'::jsonb),'cartCapture',(SELECT saas.store_engagement_public_projection(c,p_now) FROM saas.store_engagement_campaigns c WHERE c.store_id=st AND c.enabled AND c.kind='cart_capture' AND(NOT c.config?'promotionId' OR saas.store_engagement_coupon(st,(c.config->>'promotionId')::uuid,p_now) IS NOT NULL)));
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.order_bump_public_offers(text,timestamp with time zone,jsonb,text)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.order_bump_public_offers(text,timestamp with time zone,jsonb,text)')),'UTF8')),'hex')<>'84fb36b45cd9d1dc9c2ae365134bca92c01219e19c015518e3cdb368bd852629' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.order_bump_public_offers(text,timestamp with time zone,jsonb,text)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.order_bump_public_offers(text,timestamp with time zone,jsonb,text)',pg_get_functiondef(p.oid),'84fb36b45cd9d1dc9c2ae365134bca92c01219e19c015518e3cdb368bd852629',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.order_bump_public_offers(text,timestamp with time zone,jsonb,text)');END $patch$;
CREATE OR REPLACE FUNCTION saas.order_bump_public_offers(p_hostname text, p_now timestamp with time zone, p_credentials jsonb, p_placement text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE st uuid;cart saas.storefront_carts;config jsonb;product_payload jsonb;variant_payload jsonb;subtotal numeric;invalid_cart boolean;r jsonb;vid jsonb;v record;price record;offers jsonb:='[]'::jsonb;product_ids uuid[];offered_ids uuid[]:='{}'::uuid[];media jsonb;media_id uuid;empty jsonb:=jsonb_build_object('cartVersion',NULL,'heading',NULL,'offers','[]'::jsonb);
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true
 OR saas.storefront_credential_candidates_valid(p_credentials,true) IS DISTINCT FROM true OR p_placement IS NULL OR p_placement NOT IN('side_cart','checkout') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 st:=saas.storefront_public_store(p_hostname,p_now);IF st IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF NOT saas.commercial_plan_has_capability(saas.commercial_current_plan(st),'growth_tools') THEN RETURN QUERY SELECT 'ok',empty;RETURN;END IF;
 SELECT c.* INTO cart FROM saas.storefront_carts c JOIN saas.storefront_cart_credentials cred ON cred.store_id=c.store_id AND cred.cart_id=c.id
 WHERE c.store_id=st AND c.status='active' AND c.expires_at>p_now AND cred.expires_at>p_now AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_credentials) candidate WHERE candidate->>'keyId'=cred.key_id AND candidate->>'digest'=cred.credential_digest)
 ORDER BY c.created_at DESC,c.id LIMIT 1;
 IF NOT FOUND THEN RETURN QUERY SELECT 'ok',empty;RETURN;END IF;
 SELECT array_agg(DISTINCT i.product_id),sum(i.unit_price_cents::numeric*i.quantity),bool_or(p.id IS NULL OR p.status<>'active' OR p.currency<>'TRY' OR ci_variant.id IS NULL OR ci_variant.status<>'active' OR ci_price.outcome IS DISTINCT FROM 'found' OR ci_price.price_cents IS DISTINCT FROM i.unit_price_cents OR coalesce(saas.storefront_available_stock(st,i.variant_id,p_now,NULL),0)<i.quantity)
 INTO product_ids,subtotal,invalid_cart FROM saas.storefront_cart_items i LEFT JOIN saas.products p ON p.store_id=i.store_id AND p.id=i.product_id LEFT JOIN saas.product_variants ci_variant ON ci_variant.store_id=i.store_id AND ci_variant.id=i.variant_id AND ci_variant.product_id=i.product_id
 LEFT JOIN LATERAL saas.resolve_effective_variant_price(st,i.variant_id,'storefront',p_now,NULL) ci_price ON true WHERE i.store_id=st AND i.cart_id=cart.id;
 IF product_ids IS NULL OR invalid_cart OR subtotal>8000000000 THEN RETURN QUERY SELECT 'ok',empty;RETURN;END IF;
 SELECT s.config INTO config FROM saas.order_bump_settings s WHERE s.store_id=st;
 IF config IS NULL OR config->'enabled'<>'true'::jsonb OR config->'placements'->(CASE WHEN p_placement='side_cart' THEN 'sideCart' ELSE 'checkout' END)<>'true'::jsonb THEN RETURN QUERY SELECT 'ok',jsonb_build_object('cartVersion',cart.version,'heading',NULL,'offers','[]'::jsonb);RETURN;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(config->'rules') LOOP
  IF r->'enabled'<>'true'::jsonb OR r->'minSubtotalCents'<>'null'::jsonb AND subtotal<(r->>'minSubtotalCents')::bigint OR r->'maxSubtotalCents'<>'null'::jsonb AND subtotal>(r->>'maxSubtotalCents')::bigint THEN CONTINUE;END IF;
  IF jsonb_array_length(r->'productIds')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'productIds') x WHERE x::uuid=ANY(product_ids)) THEN CONTINUE;END IF;
  IF jsonb_array_length(r->'categoryIds')>0 AND NOT EXISTS(SELECT 1 FROM saas.catalog_product_categories a JOIN saas.catalog_categories c ON c.store_id=a.store_id AND c.id=a.category_id AND c.status='active' WHERE a.store_id=st AND a.product_id=ANY(product_ids) AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'categoryIds') x WHERE x::uuid=a.category_id)) THEN CONTINUE;END IF;
  FOR vid IN SELECT value FROM jsonb_array_elements(r->'variantIds') LOOP
   SELECT pv.*,p.slug,p.title product_title,p.currency,p.status product_status INTO v FROM saas.product_variants pv JOIN saas.products p ON p.store_id=pv.store_id AND p.id=pv.product_id WHERE pv.store_id=st AND pv.id=(vid#>>'{}')::uuid AND pv.status='active' AND p.status='active' AND p.currency='TRY';
   IF NOT FOUND OR v.product_id=ANY(product_ids) OR v.product_id=ANY(offered_ids) OR coalesce(saas.storefront_available_stock(st,v.id,p_now,NULL),0)<1 THEN CONTINUE;END IF;
   -- Publication and exact variant price come from the same canonical public product reader as catalog/detail.
   product_payload:=saas.public_effective_product_projection(st,v.product_id,p_now);
   IF product_payload IS NULL OR product_payload->>'currency' IS DISTINCT FROM 'TRY' THEN CONTINUE;END IF;
   SELECT value INTO variant_payload FROM jsonb_array_elements(product_payload->'variants') WHERE value->>'id'=v.id::text;
   IF variant_payload IS NULL OR variant_payload->'available' IS DISTINCT FROM 'true'::jsonb OR(variant_payload->>'priceCents')::numeric NOT BETWEEN 0 AND 8000000000 THEN CONTINUE;END IF;
   media_id:=saas.variant_primary_media_id(st,v.product_id,v.id);SELECT jsonb_strip_nulls(jsonb_build_object('url',m.public_url,'altText',coalesce(m.alt_text,''),'width',m.width,'height',m.height)) INTO media FROM saas.product_media m WHERE m.store_id=st AND m.product_id=v.product_id AND m.id=media_id AND m.status='active' AND m.object_deleted_at IS NULL AND m.media_type='image' AND m.public_url~'^https://[^/@# :]+([/?][^#]*)?$';
   offers:=offers||jsonb_build_array(jsonb_build_object('ruleId',r->>'id','productId',v.product_id,'variantId',v.id,'slug',product_payload->>'slug','title',product_payload->>'title','variantTitle',variant_payload->>'title','priceCents',(variant_payload->>'priceCents')::bigint,'currency','TRY','media',media));offered_ids:=array_append(offered_ids,v.product_id);
   IF jsonb_array_length(offers)>=(config->>'maxOffers')::integer THEN EXIT;END IF;
  END LOOP;
  IF jsonb_array_length(offers)>=(config->>'maxOffers')::integer THEN EXIT;END IF;
 END LOOP;
 RETURN QUERY SELECT 'ok',jsonb_build_object('cartVersion',cart.version,'heading',config->>'heading','offers',offers);
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.lucky_wheel_feature_enabled_v1(uuid,timestamp with time zone)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.lucky_wheel_feature_enabled_v1(uuid,timestamp with time zone)')),'UTF8')),'hex')<>'22101ae48a4b0052d5c88f0e617c4a6d85ea297de139e1d141c34dfebb9f2b6d' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.lucky_wheel_feature_enabled_v1(uuid,timestamp with time zone)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.lucky_wheel_feature_enabled_v1(uuid,timestamp with time zone)',pg_get_functiondef(p.oid),'22101ae48a4b0052d5c88f0e617c4a6d85ea297de139e1d141c34dfebb9f2b6d',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.lucky_wheel_feature_enabled_v1(uuid,timestamp with time zone)');END $patch$;
CREATE OR REPLACE FUNCTION saas.lucky_wheel_feature_enabled_v1(p_store uuid, p_now timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
 SELECT EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version AND p.status='active' AND p.valid_from<=p_now AND(p.valid_until IS NULL OR p_now<p.valid_until) JOIN saas.plan_features f ON f.plan_id=p.id AND f.feature_key='promotions' AND f.enabled AND saas.commercial_plan_has_capability(p.id,'growth_tools') WHERE s.store_id=p_store AND s.status='active' AND s.valid_from<=p_now AND(s.valid_until IS NULL OR p_now<s.valid_until))
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamp with time zone)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamp with time zone)')),'UTF8')),'hex')<>'556a87cd760db9184bf56573437c72494f5b3d5c33f2bfd99c053c26dfbd28fa' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamp with time zone)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamp with time zone)',pg_get_functiondef(p.oid),'556a87cd760db9184bf56573437c72494f5b3d5c33f2bfd99c053c26dfbd28fa',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamp with time zone)');END $patch$;
CREATE OR REPLACE FUNCTION saas.checkout_begin_attempt(p_hostname text, p_redemption_digest text, p_attempt_id uuid, p_merchant_oid text, p_operation_id uuid, p_fingerprint text, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE current_link saas.quick_order_links%ROWTYPE; current_session saas.quick_order_redemption_sessions%ROWTYPE;
  current_provider saas.checkout_provider_configs%ROWTYPE; existing_operation saas.checkout_operations%ROWTYPE;
  projection jsonb; basket_encoding text; requested_count bigint; locked_count bigint;
  held_quantity numeric; requested_quantity numeric; item_record record; resolved_store_id uuid; resolved_link_id uuid;
BEGIN
 BEGIN

  IF saas.quick_checkout_hostname_is_valid(p_hostname) IS DISTINCT FROM TRUE
     OR p_redemption_digest IS NULL OR p_redemption_digest!~'^[a-f0-9]{64}$'
     OR saas.quick_checkout_uuid_is_valid(p_attempt_id) IS DISTINCT FROM TRUE
     OR p_merchant_oid IS NULL OR p_merchant_oid!~'^[a-f0-9]{32}$'
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.checkout.operation:'||p_operation_id::text,0));
  -- Link is the first mutable checkout lock. Host authority participates in the
  -- same query so token/cookie digests never become global lookup oracles.
  SELECT session.store_id,session.quick_order_link_id INTO resolved_store_id,resolved_link_id
  FROM saas.store_domains AS domain
  JOIN saas.stores AS store ON store.id=domain.store_id AND store.status='active'
  JOIN saas.quick_order_redemption_sessions AS session ON session.store_id=domain.store_id
    AND session.cookie_digest=p_redemption_digest
  WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary AND domain.verified_at<=p_now;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.catalog.store:'||resolved_store_id::text,0)
  );
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link
  WHERE link.store_id=resolved_store_id AND link.id=resolved_link_id FOR UPDATE OF link;
  PERFORM 1 FROM saas.stores AS store
  JOIN saas.store_domains AS domain ON domain.store_id=store.id
  WHERE store.id=resolved_store_id AND store.status='active'
    AND domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary
    AND domain.verified_at<=p_now
  FOR SHARE OF store,domain;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  SELECT session.* INTO current_session FROM saas.quick_order_redemption_sessions AS session
  WHERE session.store_id=resolved_store_id AND session.quick_order_link_id=resolved_link_id
    AND session.cookie_digest=p_redemption_digest FOR UPDATE OF session;
  IF NOT FOUND OR current_session.revoked_at IS NOT NULL OR current_session.consumed_at IS NOT NULL
     OR current_session.expires_at<=p_now OR current_link.status NOT IN ('active','opened')
     OR current_link.expires_at<=p_now OR saas.quick_checkout_customer_snapshot_is_valid(current_link) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_link.updated_at OR p_now<current_session.updated_at THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind='begin_attempt' AND existing_operation.attempt_id=p_attempt_id
       AND existing_operation.store_id=resolved_store_id AND existing_operation.payload_fingerprint=p_fingerprint
       AND EXISTS(SELECT 1 FROM saas.checkout_payment_attempts AS replayed_attempt
         WHERE replayed_attempt.id=p_attempt_id AND replayed_attempt.store_id=resolved_store_id
           AND replayed_attempt.redemption_session_id=current_session.id AND replayed_attempt.quick_order_link_id=current_link.id) THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  IF saas.quick_link_current_prices_match(current_link.store_id,current_link.id,p_now)
    IS DISTINCT FROM true THEN
    RETURN QUERY SELECT 'price_changed'::text,NULL::jsonb; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM saas.checkout_payment_attempts AS attempt
    WHERE attempt.store_id=current_link.store_id AND attempt.quick_order_link_id=current_link.id
      AND attempt.status IN ('reserved','provider_ready','initiation_unknown')) THEN
    RETURN QUERY SELECT 'attempt_in_progress'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.checkout.merchant_oid:'||p_merchant_oid,0)
  );
  IF NOT saas.platform_new_sales_allowed(resolved_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF; SELECT provider.* INTO current_provider FROM saas.checkout_provider_configs AS provider
    WHERE provider.store_id=current_link.store_id AND provider.id=current_link.provider_config_id
      AND provider.status='active' AND provider.provider_key='paytr'
      AND provider.configuration_digest~'^[a-f0-9]{64}$'
    FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'provider_not_ready'::text,NULL::jsonb; RETURN; END IF;
  IF p_now<current_provider.updated_at THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.count(*),
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(item.product_name,item.unit_price_cents,item.quantity)
      ORDER BY item.position,item.id)::text
  INTO requested_count,basket_encoding
  FROM saas.quick_order_link_items AS item
  WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id;
  IF requested_count NOT BETWEEN 1 AND 100 OR pg_catalog.octet_length(basket_encoding) NOT BETWEEN 2 AND 65536
     OR EXISTS (SELECT 1 FROM saas.quick_order_link_items AS item
       WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id
         AND (item.product_name<>pg_catalog.btrim(item.product_name)
           OR pg_catalog.char_length(item.product_name) NOT BETWEEN 1 AND 200
           OR item.product_name~'[[:cntrl:]]' OR item.unit_price_cents NOT BETWEEN 1 AND 8000000000
           OR item.quantity NOT BETWEEN 1 AND 9999 OR item.line_total_cents NOT BETWEEN 1 AND 79992000000000)) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.product_variants AS variant
  JOIN saas.products AS product ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE (variant.store_id,variant.product_id,variant.id) IN (
    SELECT item.store_id,item.product_id,item.variant_id FROM saas.quick_order_link_items AS item
    WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id
  ) AND variant.status='active' AND variant.archived_at IS NULL AND product.status='active' AND product.archived_at IS NULL
  ORDER BY product.id,variant.id FOR UPDATE OF product,variant;
  GET DIAGNOSTICS locked_count=ROW_COUNT;
  SELECT pg_catalog.count(DISTINCT item.variant_id) INTO requested_count
  FROM saas.quick_order_link_items AS item WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id;
  IF locked_count<>requested_count THEN RETURN QUERY SELECT 'catalog_item_unavailable'::text,NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM saas.quick_order_link_items AS item
    JOIN saas.product_variants AS variant ON variant.store_id=item.store_id AND variant.product_id=item.product_id AND variant.id=item.variant_id
    JOIN saas.products AS product ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id
      AND (variant.updated_at>p_now OR product.updated_at>p_now)
  ) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  FOR item_record IN
    SELECT item.product_id,item.variant_id,pg_catalog.sum(item.quantity)::bigint AS quantity,
      variant.stock_tracking,variant.stock_quantity
    FROM saas.quick_order_link_items AS item
    JOIN saas.product_variants AS variant ON variant.store_id=item.store_id AND variant.product_id=item.product_id AND variant.id=item.variant_id
    WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id
    GROUP BY item.product_id,item.variant_id,variant.stock_tracking,variant.stock_quantity
    ORDER BY item.product_id,item.variant_id
  LOOP
    SELECT COALESCE(pg_catalog.sum(reservation.quantity),0) INTO held_quantity
    FROM saas.all_inventory_reservations AS reservation
    WHERE reservation.store_id=current_link.store_id AND reservation.variant_id=item_record.variant_id
      AND reservation.status='held' AND reservation.stock_tracked;
    requested_quantity:=item_record.quantity;
    IF item_record.stock_tracking AND item_record.stock_quantity::numeric-held_quantity<requested_quantity THEN
      RETURN QUERY SELECT 'stock_unavailable'::text,NULL::jsonb; RETURN;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM saas.checkout_payment_attempts AS attempt WHERE attempt.merchant_oid=p_merchant_oid) THEN
    RETURN QUERY SELECT 'merchant_oid_conflict'::text,NULL::jsonb; RETURN;
  END IF;
  BEGIN
    INSERT INTO saas.checkout_payment_attempts(
      id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,provider_config_version,
      configuration_digest,configuration_key_id,sealed_configuration,merchant_oid,
      expected_subtotal_cents,expected_shipping_cents,expected_discount_cents,expected_payment_amount,
      currency,status,hold_expires_at,version,created_at,updated_at
    ) VALUES(
      p_attempt_id,current_link.store_id,current_link.id,current_session.id,current_provider.id,current_provider.version,
      current_provider.configuration_digest,current_provider.configuration_key_id,current_provider.sealed_configuration,p_merchant_oid,
      current_link.subtotal_cents,current_link.shipping_cents,current_link.discount_cents,current_link.total_cents,
      'TRY','reserved',p_now+interval '5 minutes',1,p_now,p_now
    );
    FOR item_record IN
      SELECT item.product_id,item.variant_id,pg_catalog.sum(item.quantity)::bigint AS quantity,variant.stock_tracking
      FROM saas.quick_order_link_items AS item
      JOIN saas.product_variants AS variant ON variant.store_id=item.store_id AND variant.product_id=item.product_id AND variant.id=item.variant_id
      WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id
      GROUP BY item.product_id,item.variant_id,variant.stock_tracking ORDER BY item.product_id,item.variant_id
    LOOP
      INSERT INTO saas.checkout_inventory_reservations(
        id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at
      ) VALUES(
        (pg_catalog.substr(pg_catalog.md5(p_attempt_id::text||item_record.variant_id::text),1,8)||'-'||
         pg_catalog.substr(pg_catalog.md5(p_attempt_id::text||item_record.variant_id::text),9,4)||'-4'||
         pg_catalog.substr(pg_catalog.md5(p_attempt_id::text||item_record.variant_id::text),14,3)||'-8'||
         pg_catalog.substr(pg_catalog.md5(p_attempt_id::text||item_record.variant_id::text),18,3)||'-'||
         pg_catalog.substr(pg_catalog.md5(p_attempt_id::text||item_record.variant_id::text),21,12))::uuid,
        current_link.store_id,p_attempt_id,current_link.id,item_record.product_id,item_record.variant_id,
        item_record.quantity,item_record.stock_tracking,'held',p_now,1,p_now
      );
    END LOOP;
    projection:=pg_catalog.jsonb_build_object(
      'attemptId',p_attempt_id,'storeId',current_link.store_id,'providerConfigId',current_provider.id,
      'status','reserved','holdExpiresAt',saas.quick_links_json_timestamp(p_now+interval '5 minutes'),
      'merchantOid',p_merchant_oid,'paymentAmount',current_link.total_cents,'currency','TRY',
      'customerName',current_link.customer_name,'customerEmail',current_link.customer_email,
      'customerPhone',current_link.customer_phone,
      'shippingAddress',pg_catalog.concat_ws(' ',
        current_link.shipping_address->>'recipientName',current_link.shipping_address->>'phone',
        current_link.shipping_address->>'line1',current_link.shipping_address->>'line2',
        current_link.shipping_address->>'district',current_link.shipping_address->>'city',
        current_link.shipping_address->>'region',current_link.shipping_address->>'postalCode',
        current_link.shipping_address->>'country'),
      'basket',basket_encoding::jsonb,'providerConfigVersion',current_provider.version,
      'configurationDigest',current_provider.configuration_digest,
      'configurationKeyId',current_provider.configuration_key_id,
      'sealedConfiguration',current_provider.sealed_configuration
    );
    INSERT INTO saas.checkout_operations(operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,result_payload,committed_at)
      VALUES(p_operation_id,current_link.store_id,p_attempt_id,'begin_attempt',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;

 END;
 EXCEPTION WHEN SQLSTATE 'P0246' THEN RETURN QUERY SELECT SQLERRM::text,NULL::jsonb;RETURN;
END
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)')),'UTF8')),'hex')<>'4acf5906efc56d3fd02e989121da2c68ac8afef2a1b7951ae5fd14137a479a4f' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)',pg_get_functiondef(p.oid),'4acf5906efc56d3fd02e989121da2c68ac8afef2a1b7951ae5fd14137a479a4f',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)');END $patch$;
CREATE OR REPLACE FUNCTION saas.payment_attempt_begin(p_store_id uuid, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_payment_method_id uuid, p_order_reference text, p_amount_minor bigint, p_currency text, p_callback_binding_digest text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE operation saas.payment_attempt_operations%ROWTYPE;
  method saas.payment_methods%ROWTYPE; profile saas.merchant_provider_profiles%ROWTYPE;
  snapshot_method saas.payment_methods%ROWTYPE;
  snapshot_profile saas.merchant_provider_profiles%ROWTYPE;
  is_replay boolean;
BEGIN
 BEGIN

  IF p_store_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_operation_id IS NULL OR p_payment_method_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.payment_attempt_operations
  WHERE operation_id=p_operation_id;
  is_replay:=FOUND;
  IF is_replay THEN
    SELECT profile_row.* INTO snapshot_profile
    FROM saas.payment_attempts AS attempt
    JOIN saas.merchant_provider_profiles AS profile_row
      ON profile_row.store_id=attempt.store_id AND profile_row.id=attempt.profile_id
    WHERE attempt.id=operation.attempt_id;
  ELSE
    SELECT * INTO snapshot_method FROM saas.payment_methods
    WHERE store_id=p_store_id AND id=p_payment_method_id;
    IF FOUND AND snapshot_method.kind='provider' THEN
      SELECT * INTO snapshot_profile FROM saas.merchant_provider_profiles
      WHERE store_id=p_store_id AND id=snapshot_method.profile_id
        AND provider_code=snapshot_method.provider_code;
    END IF;
  END IF;
  IF snapshot_profile.id IS NOT NULL AND snapshot_profile.capability='payment_processing'
    AND NOT saas.merchant_provider_execution_authority_matches(
    snapshot_profile.provider_code,snapshot_profile.capability,snapshot_profile.execution_environment,
    snapshot_profile.execution_adapter_version,snapshot_profile.execution_evidence_digest
  ) THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF NOT is_replay AND snapshot_method.id IS NOT NULL AND snapshot_method.kind='provider' THEN
    SELECT * INTO method FROM saas.payment_methods
    WHERE store_id=p_store_id AND id=p_payment_method_id FOR SHARE;
    IF NOT FOUND OR method.kind<>'provider' OR method.profile_id<>snapshot_method.profile_id
      OR method.provider_code<>snapshot_method.provider_code
    THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
    SELECT * INTO profile FROM saas.merchant_provider_profiles
    WHERE store_id=p_store_id AND id=method.profile_id
      AND provider_code=method.provider_code FOR SHARE;
    IF NOT FOUND OR profile.execution_environment<>snapshot_profile.execution_environment
      OR profile.execution_adapter_version<>snapshot_profile.execution_adapter_version
      OR profile.execution_evidence_digest<>snapshot_profile.execution_evidence_digest
    THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  END IF;
  RETURN QUERY SELECT * FROM saas.payment_attempt_begin_without_execution_authority(
    p_store_id,p_now,p_operation_id,p_fingerprint,p_payment_method_id,p_order_reference,
    p_amount_minor,p_currency,p_callback_binding_digest
  );

 END;
 EXCEPTION WHEN SQLSTATE 'P0246' THEN RETURN QUERY SELECT SQLERRM::text,NULL::jsonb;RETURN;
END
$function$
;

DO $patch$BEGIN IF to_regprocedure('saas.in_store_sales_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.in_store_sales_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)')),'UTF8')),'hex')<>'bf6203e2c6e11cf191d4ecf706b5989d29605f4a975464e71d236b2222b03dc2' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.in_store_sales_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.in_store_sales_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)',pg_get_functiondef(p.oid),'bf6203e2c6e11cf191d4ecf706b5989d29605f4a975464e71d236b2222b03dc2',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.in_store_sales_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.in_store_sales_mutate(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_sale_id uuid, p_expected_version bigint, p_kind text, p_args jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE actual_order_number text; err text; prior saas.in_store_operations%ROWTYPE; selected saas.in_store_sales%ROWTYPE; quote record; intent_payload jsonb; line jsonb; variant record; amount bigint; selected_location_name text; manager boolean; changed boolean:=false; projected jsonb; target_order uuid; target_item uuid; position integer:=0; selected_location uuid;
BEGIN
 BEGIN
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'in_store_sales_mutate');
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,p_kind='takeover');
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_sale_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_kind NOT IN('create','update','hold','prepare','confirm_payment','complete','cancel','takeover','discard') OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' OR pg_column_size(p_args)>65536 OR (p_kind<>'create' AND (p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740990)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||p_operation_id::text,0));
 IF p_kind='discard' THEN PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.store_id<>p_store_id OR prior.operation_kind<>p_kind OR prior.payload_fingerprint<>p_fingerprint OR prior.sale_id IS DISTINCT FROM p_sale_id OR (prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id)) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  projected:=prior.result_payload||jsonb_build_object('replayed',true);
  IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
  RETURN QUERY SELECT 'operation_replayed',projected;RETURN;
 END IF;
 manager:=saas.in_store_is_manager(p_store_id,p_membership_id);
 IF p_kind='create' THEN IF NOT saas.platform_new_sales_allowed(p_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF;
  IF p_expected_version IS NOT NULL OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') OR EXISTS(SELECT 1 FROM saas.in_store_sales WHERE id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  intent_payload:=p_args->'intent';
 ELSE
  SELECT * INTO selected FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF selected.contract_version=2 THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
  IF selected.contract_version=3 THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
  IF selected.contract_version=4 THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
  IF selected.owner_membership_id<>p_membership_id AND NOT manager THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF selected.version<>p_expected_version OR p_now<selected.updated_at THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  intent_payload:=CASE WHEN p_kind='update' THEN p_args->'intent' ELSE selected.intent END;
 END IF;
 IF p_kind IN('create','update','prepare') THEN
  SELECT * INTO quote FROM saas.in_store_quote(p_store_id,p_membership_id,p_now,intent_payload);
  IF quote.outcome<>'found' THEN RETURN QUERY SELECT quote.outcome::text,NULL::jsonb;RETURN;END IF;
 END IF;
 selected_location:=CASE WHEN p_kind IN('create','update') THEN (intent_payload->>'locationId')::uuid ELSE selected.location_id END;
 -- Payment already received can always be recovered by a manager, even if a location was archived.
 IF p_kind<>'complete' OR selected.status<>'payment_received' THEN
  err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,selected_location,false);
  IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 ELSIF NOT manager THEN
  IF NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id AND enabled AND selected_location=ANY(location_ids)) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 END IF;
 SELECT name INTO selected_location_name FROM saas.inventory_locations WHERE store_id=p_store_id AND id=selected_location;
 IF p_kind='create' THEN IF NOT saas.platform_new_sales_allowed(p_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.in_store_sales(id,store_id,sale_number,status,owner_membership_id,location_id,location_name,intent,price_provenance,items,subtotal_cents,eligible_subtotal_cents,discount_cents,total_cents,created_at,updated_at)
  VALUES(p_sale_id,p_store_id,'POS-'||upper(replace(p_sale_id::text,'-','')),'draft',p_membership_id,selected_location,selected_location_name,intent_payload,quote.result_payload->'priceProvenance',quote.result_payload->'items',(quote.result_payload->>'subtotalCents')::bigint,(quote.result_payload->>'eligibleSubtotalCents')::bigint,(quote.result_payload->>'discountCents')::bigint,(quote.result_payload->>'totalCents')::bigint,p_now,p_now);
 ELSIF p_kind='update' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET location_id=selected_location,location_name=selected_location_name,intent=intent_payload,price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
 ELSIF p_kind='hold' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'held')<>'boolean' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET status=CASE WHEN (p_args->>'held')::boolean THEN 'held' ELSE 'draft' END WHERE id=p_sale_id;
 ELSIF p_kind='prepare' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'expectedTotalCents')<>'number' OR (p_args->>'expectedTotalCents')::numeric<>trunc((p_args->>'expectedTotalCents')::numeric) OR (p_args->>'expectedTotalCents')::numeric<=0 OR (quote.result_payload->>'totalCents')::bigint<=0 OR jsonb_array_length(selected.items)=0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  changed:=selected.items IS DISTINCT FROM quote.result_payload->'items' OR selected.total_cents<>(p_args->>'expectedTotalCents')::numeric;
  IF changed THEN
   UPDATE saas.in_store_sales SET status='draft',price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
  ELSE
   -- Global inventory and selected location are checked under the same store lock as online/count/transfer.
   FOR line IN SELECT value FROM jsonb_array_elements(selected.items) ORDER BY value->>'variantId' LOOP
    SELECT * INTO variant FROM saas.product_variants WHERE store_id=p_store_id AND id=(line->>'variantId')::uuid FOR UPDATE;
    IF variant.stock_tracking THEN
     SELECT coalesce(quantity,0) INTO amount FROM saas.inventory_balances WHERE store_id=p_store_id AND location_id=selected.location_id AND variant_id=variant.id FOR UPDATE;
     IF coalesce(amount,0)-saas.in_store_held_quantity(p_store_id,variant.id,selected.location_id,p_sale_id)<(line->>'quantity')::integer OR variant.stock_quantity-saas.in_store_held_quantity(p_store_id,variant.id,NULL,p_sale_id)<(line->>'quantity')::integer THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
    END IF;
   END LOOP;
   INSERT INTO saas.in_store_inventory_reservations(id,store_id,sale_id,location_id,product_id,variant_id,quantity,stock_tracked,status,held_at,updated_at)
   SELECT saas.inventory_deterministic_uuid('in-store-reservation',p_sale_id::text||':'||v.id::text),p_store_id,p_sale_id,selected.location_id,v.product_id,v.id,(i->>'quantity')::integer,v.stock_tracking,'held',p_now,p_now
   FROM jsonb_array_elements(selected.items) i JOIN saas.product_variants v ON v.store_id=p_store_id AND v.id=(i->>'variantId')::uuid
   ON CONFLICT(sale_id,variant_id) DO UPDATE SET location_id=excluded.location_id,quantity=excluded.quantity,stock_tracked=excluded.stock_tracked,status='held',held_at=p_now,consumed_at=NULL,released_at=NULL,updated_at=p_now,version=saas.in_store_inventory_reservations.version+1;
   INSERT INTO saas.in_store_price_snapshots(store_id,sale_id,prepare_operation_id,variant_id,provenance,prepared_at) SELECT p_store_id,p_sale_id,p_operation_id,(value->>'variantId')::uuid,value,p_now FROM jsonb_array_elements(quote.result_payload->'priceProvenance');
   UPDATE saas.in_store_sales SET status='payment_pending',price_provenance=quote.result_payload->'priceProvenance' WHERE id=p_sale_id;
  END IF;
 ELSIF p_kind='confirm_payment' THEN
  IF selected.status<>'payment_pending' OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'slipReference') OR (p_args->'slipReference'<>'null'::jsonb AND (jsonb_typeof(p_args->'slipReference')<>'string' OR length(p_args->>'slipReference') NOT BETWEEN 1 AND 100 OR p_args->>'slipReference'<>btrim(p_args->>'slipReference') OR p_args->>'slipReference'~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.in_store_payment_attestations(sale_id,store_id,actor_membership_id,amount_cents,slip_reference,received_at) VALUES(p_sale_id,p_store_id,p_membership_id,selected.total_cents,p_args->>'slipReference',p_now);
  UPDATE saas.in_store_sales SET status='payment_received',payment_received_at=p_now WHERE id=p_sale_id;
 ELSIF p_kind='complete' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF selected.status='completed' THEN
   projected:=jsonb_build_object('sale',saas.in_store_sales_projection(p_store_id,p_sale_id),'replayed',false,'priceChanged',false);
   INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
   RETURN QUERY SELECT 'committed',projected;RETURN;
  END IF;
  IF selected.status<>'payment_received' OR NOT EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id AND store_id=p_store_id AND amount_cents=selected.total_cents) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.in_store_inventory_reservations r LEFT JOIN saas.inventory_balances b ON b.store_id=r.store_id AND b.location_id=r.location_id AND b.variant_id=r.variant_id WHERE r.sale_id=p_sale_id AND r.status='held' AND r.stock_tracked AND coalesce(b.quantity,0)<r.quantity) OR (SELECT count(*) FROM saas.in_store_inventory_reservations WHERE sale_id=p_sale_id AND status='held')<>jsonb_array_length(selected.items) THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
  target_order:=saas.inventory_deterministic_uuid('in-store-order',p_store_id::text||':'||p_sale_id::text);
  -- ORDER_NUMBER_CREATOR_V161
  actual_order_number := saas.order_number_allocate(p_store_id,target_order,'POS',p_now);
  INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,customer_id,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,paid_at)
  VALUES(target_order,p_store_id,actual_order_number,'in_store',selected.intent->>'customerName',NULL,NULL,NULL,'TRY',selected.subtotal_cents,0,selected.discount_cents,selected.total_cents,'delivered','completed',NULL,selected.created_at,p_now,selected.payment_received_at)
  RETURNING orders.order_number INTO actual_order_number;
  FOR line IN SELECT value FROM jsonb_array_elements(selected.items) LOOP
   target_item:=saas.inventory_deterministic_uuid('in-store-order-item',p_sale_id::text||':'||(line->>'variantId'));
   INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
   VALUES(target_item,p_store_id,target_order,(line->>'productId')::uuid,(line->>'variantId')::uuid,position,line->>'productName',line->>'variantName',line->>'sku',(line->>'unitPriceCents')::bigint,(line->>'quantity')::integer,0,(line->>'lineSubtotalCents')::bigint,p_now);
   INSERT INTO saas.in_store_discount_allocations VALUES(p_store_id,p_sale_id,(line->>'variantId')::uuid,target_item,(line->>'quantity')::integer,(line->>'lineSubtotalCents')::bigint,(line->>'allocatedDiscountCents')::bigint,(line->>'lineNetCents')::bigint,(line->>'allocatedDiscountCents')::bigint/(line->>'quantity')::integer,((line->>'allocatedDiscountCents')::bigint%(line->>'quantity')::integer)::integer);
   position:=position+1;
  END LOOP;
  UPDATE saas.in_store_inventory_reservations SET status='consumed',consumed_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  PERFORM set_config('saas.inventory.source_marker','inventory_managed',true);
  FOR variant IN SELECT r.* FROM saas.in_store_inventory_reservations r WHERE r.sale_id=p_sale_id AND r.stock_tracked AND r.status='consumed' ORDER BY r.variant_id LOOP
   UPDATE saas.inventory_balances SET quantity=quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND location_id=variant.location_id AND variant_id=variant.variant_id;
   INSERT INTO saas.inventory_movements(id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,source_kind,source_id,occurred_at,created_at)
   VALUES(saas.inventory_deterministic_uuid('in-store-inventory',p_sale_id::text||':'||variant.variant_id::text),p_store_id,variant.location_id,variant.variant_id,'in_store_sale','out',-variant.quantity,'in_store_sale',p_sale_id,p_now,p_now);
   UPDATE saas.product_variants SET stock_quantity=stock_quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=variant.variant_id;
  END LOOP;
  INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at) VALUES(saas.inventory_deterministic_uuid('in-store-order-event',p_sale_id::text),p_store_id,target_order,p_membership_id,'order_created','Mağaza satışı tamamlandı',jsonb_build_object('source','in_store','saleId',p_sale_id,'paymentMethod','manual_bank_pos'),p_now);
  UPDATE saas.in_store_sales SET status='completed',completed_at=p_now,order_id=target_order,order_number=actual_order_number WHERE id=p_sale_id;
 ELSIF p_kind='discard' THEN
  IF selected.status NOT IN('draft','held','payment_pending') OR p_args<>jsonb_build_object('confirmUnpaid',true)
   OR selected.payment_received_at IS NOT NULL OR selected.completed_at IS NOT NULL
   OR selected.order_id IS NOT NULL OR selected.order_number IS NOT NULL
   OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id)
  THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  UPDATE saas.in_store_sales SET status='cancelled' WHERE id=p_sale_id;
 ELSIF p_kind='cancel' THEN
  IF selected.status NOT IN('draft','held','payment_pending') OR p_args<>jsonb_build_object('confirmUnpaid',true) OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  UPDATE saas.in_store_sales SET status='draft' WHERE id=p_sale_id;
 ELSIF p_kind='takeover' THEN
  IF selected.status IN('completed','cancelled') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET owner_membership_id=p_membership_id WHERE id=p_sale_id;
 END IF;
 IF p_kind<>'create' THEN UPDATE saas.in_store_sales SET version=version+1,updated_at=p_now WHERE id=p_sale_id;END IF;
 projected:=jsonb_build_object('sale',saas.in_store_sales_projection(p_store_id,p_sale_id),'replayed',false,'priceChanged',changed);
 INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
 INSERT INTO saas.in_store_sale_events VALUES(saas.inventory_deterministic_uuid('in-store-event',p_operation_id::text),p_store_id,p_sale_id,p_membership_id,p_kind,jsonb_build_object('version',projected->'sale'->'version','operationId',p_operation_id),p_now);
 RETURN QUERY SELECT 'committed',projected;

 END;
 EXCEPTION WHEN SQLSTATE 'P0246' THEN RETURN QUERY SELECT SQLERRM::text,NULL::jsonb;RETURN;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.in_store_sales_mutate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.in_store_sales_mutate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)')),'UTF8')),'hex')<>'8b97e38e8a0f52ba959f2fb6a602c2bb5f4e131c074db21c50598bd5a86ffe8e' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.in_store_sales_mutate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.in_store_sales_mutate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)',pg_get_functiondef(p.oid),'8b97e38e8a0f52ba959f2fb6a602c2bb5f4e131c074db21c50598bd5a86ffe8e',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.in_store_sales_mutate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.in_store_sales_mutate_v2(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_sale_id uuid, p_expected_version bigint, p_kind text, p_args jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE actual_order_number text; err text; prior saas.in_store_operations%ROWTYPE; selected saas.in_store_sales%ROWTYPE; quote record; intent_payload jsonb; line jsonb; variant record; amount bigint; selected_location_name text; manager boolean; changed boolean:=false; projected jsonb; target_order uuid; target_item uuid; position integer:=0; selected_location uuid;
BEGIN
 BEGIN
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'in_store_sales_mutate_v2');
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,p_kind='takeover');
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_sale_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_kind NOT IN('create','update','hold','prepare','confirm_payment','complete','cancel','takeover','discard') OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' OR pg_column_size(p_args)>65536 OR (p_kind<>'create' AND (p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740990)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||p_operation_id::text,0));
 IF p_kind='discard' THEN PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.store_id<>p_store_id OR prior.operation_kind<>p_kind OR prior.payload_fingerprint<>p_fingerprint OR prior.sale_id IS DISTINCT FROM p_sale_id OR (prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id)) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  projected:=prior.result_payload||jsonb_build_object('replayed',true);
  IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
  RETURN QUERY SELECT 'operation_replayed',projected;RETURN;
 END IF;
 manager:=saas.in_store_is_manager(p_store_id,p_membership_id);
 IF p_kind='create' THEN IF NOT saas.platform_new_sales_allowed(p_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF;
  IF p_expected_version IS NOT NULL OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') OR EXISTS(SELECT 1 FROM saas.in_store_sales WHERE id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  intent_payload:=p_args->'intent';
 ELSE
  SELECT * INTO selected FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF selected.contract_version=3 THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
  IF selected.contract_version=4 THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
  IF selected.owner_membership_id<>p_membership_id AND NOT manager THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF selected.version<>p_expected_version OR p_now<selected.updated_at THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  intent_payload:=CASE WHEN p_kind='update' THEN p_args->'intent' ELSE selected.intent END;
 END IF;
 IF p_kind IN('create','update','prepare') THEN
  IF p_kind='prepare' AND selected.contract_version=1 AND NOT (intent_payload ? 'paymentMethod') THEN
   intent_payload:=intent_payload||jsonb_build_object('paymentMethod',selected.payment_method,'items',(SELECT coalesce(jsonb_agg(i||jsonb_build_object('unitPriceOverrideCents',NULL)),'[]'::jsonb) FROM jsonb_array_elements(intent_payload->'items') i));
  END IF;
  IF p_kind='prepare' AND intent_payload->>'paymentMethod' IS NULL THEN RETURN QUERY SELECT 'payment_method_required',NULL::jsonb;RETURN;END IF;
  SELECT * INTO quote FROM saas.in_store_quote_v2(p_store_id,p_membership_id,p_now,intent_payload,coalesce(selected.items,'[]'::jsonb));
  IF quote.outcome<>'found' THEN RETURN QUERY SELECT quote.outcome::text,NULL::jsonb;RETURN;END IF;
 END IF;
 selected_location:=CASE WHEN p_kind IN('create','update') THEN (intent_payload->>'locationId')::uuid ELSE selected.location_id END;
 -- Payment already received can always be recovered by a manager, even if a location was archived.
 IF p_kind<>'complete' OR selected.status<>'payment_received' THEN
  err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,selected_location,false);
  IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 ELSIF NOT manager THEN
  IF NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id AND enabled AND selected_location=ANY(location_ids)) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 END IF;
 SELECT name INTO selected_location_name FROM saas.inventory_locations WHERE store_id=p_store_id AND id=selected_location;
 IF p_kind='create' THEN IF NOT saas.platform_new_sales_allowed(p_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.in_store_sales(id,store_id,sale_number,status,owner_membership_id,location_id,location_name,intent,price_provenance,items,subtotal_cents,eligible_subtotal_cents,discount_cents,total_cents,created_at,updated_at)
  VALUES(p_sale_id,p_store_id,'POS-'||upper(replace(p_sale_id::text,'-','')),'draft',p_membership_id,selected_location,selected_location_name,intent_payload,quote.result_payload->'priceProvenance',quote.result_payload->'items',(quote.result_payload->>'subtotalCents')::bigint,(quote.result_payload->>'eligibleSubtotalCents')::bigint,(quote.result_payload->>'discountCents')::bigint,(quote.result_payload->>'totalCents')::bigint,p_now,p_now);
  UPDATE saas.in_store_sales SET contract_version=2,payment_method=intent_payload->>'paymentMethod' WHERE id=p_sale_id;
 ELSIF p_kind='update' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET contract_version=2,payment_method=intent_payload->>'paymentMethod',location_id=selected_location,location_name=selected_location_name,intent=intent_payload,price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
 ELSIF p_kind='hold' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'held')<>'boolean' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET status=CASE WHEN (p_args->>'held')::boolean THEN 'held' ELSE 'draft' END WHERE id=p_sale_id;
 ELSIF p_kind='prepare' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'expectedTotalCents')<>'number' OR (p_args->>'expectedTotalCents')::numeric<>trunc((p_args->>'expectedTotalCents')::numeric) OR (p_args->>'expectedTotalCents')::numeric<=0 OR (quote.result_payload->>'totalCents')::bigint<=0 OR jsonb_array_length(selected.items)=0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  changed:=selected.items IS DISTINCT FROM quote.result_payload->'items' OR selected.total_cents<>(p_args->>'expectedTotalCents')::numeric;
  IF changed THEN
   UPDATE saas.in_store_sales SET status='draft',price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
  ELSE
   -- Global inventory and selected location are checked under the same store lock as online/count/transfer.
   FOR line IN SELECT value FROM jsonb_array_elements(selected.items) ORDER BY value->>'variantId' LOOP
    SELECT * INTO variant FROM saas.product_variants WHERE store_id=p_store_id AND id=(line->>'variantId')::uuid FOR UPDATE;
    IF variant.stock_tracking THEN
     SELECT coalesce(quantity,0) INTO amount FROM saas.inventory_balances WHERE store_id=p_store_id AND location_id=selected.location_id AND variant_id=variant.id FOR UPDATE;
     IF coalesce(amount,0)-saas.in_store_held_quantity(p_store_id,variant.id,selected.location_id,p_sale_id)<(line->>'quantity')::integer OR variant.stock_quantity-saas.in_store_held_quantity(p_store_id,variant.id,NULL,p_sale_id)<(line->>'quantity')::integer THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
    END IF;
   END LOOP;
   INSERT INTO saas.in_store_inventory_reservations(id,store_id,sale_id,location_id,product_id,variant_id,quantity,stock_tracked,status,held_at,updated_at)
   SELECT saas.inventory_deterministic_uuid('in-store-reservation',p_sale_id::text||':'||v.id::text),p_store_id,p_sale_id,selected.location_id,v.product_id,v.id,(i->>'quantity')::integer,v.stock_tracking,'held',p_now,p_now
   FROM jsonb_array_elements(selected.items) i JOIN saas.product_variants v ON v.store_id=p_store_id AND v.id=(i->>'variantId')::uuid
   ON CONFLICT(sale_id,variant_id) DO UPDATE SET location_id=excluded.location_id,quantity=excluded.quantity,stock_tracked=excluded.stock_tracked,status='held',held_at=p_now,consumed_at=NULL,released_at=NULL,updated_at=p_now,version=saas.in_store_inventory_reservations.version+1;
   INSERT INTO saas.in_store_price_snapshots(store_id,sale_id,prepare_operation_id,variant_id,provenance,prepared_at) SELECT p_store_id,p_sale_id,p_operation_id,(value->>'variantId')::uuid,value,p_now FROM jsonb_array_elements(quote.result_payload->'priceProvenance');
   UPDATE saas.in_store_sales SET status='payment_pending',price_provenance=quote.result_payload->'priceProvenance' WHERE id=p_sale_id;
  END IF;
 ELSIF p_kind='confirm_payment' THEN
  IF selected.status<>'payment_pending' OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>2 OR NOT(p_args ? 'slipReference') OR (p_args->'slipReference'<>'null'::jsonb AND (jsonb_typeof(p_args->'slipReference')<>'string' OR length(p_args->>'slipReference') NOT BETWEEN 1 AND 100 OR p_args->>'slipReference'<>btrim(p_args->>'slipReference') OR p_args->>'slipReference'~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF NOT(p_args ? 'paymentMethod') OR (p_args->'paymentMethod'<>'null'::jsonb AND (jsonb_typeof(p_args->'paymentMethod')<>'string' OR p_args->>'paymentMethod' NOT IN('card','cash'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF selected.payment_method IS NOT NULL AND p_args->>'paymentMethod' IS NOT NULL AND selected.payment_method<>p_args->>'paymentMethod' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF selected.payment_method IS NULL THEN
   IF p_args->>'paymentMethod' IS NULL THEN RETURN QUERY SELECT 'payment_method_required',NULL::jsonb;RETURN;END IF;
   UPDATE saas.in_store_sales SET payment_method=p_args->>'paymentMethod',contract_version=2 WHERE id=p_sale_id;
  END IF;
  INSERT INTO saas.in_store_payment_attestations(sale_id,store_id,actor_membership_id,amount_cents,slip_reference,received_at,payment_method) VALUES(p_sale_id,p_store_id,p_membership_id,selected.total_cents,p_args->>'slipReference',p_now,coalesce(selected.payment_method,p_args->>'paymentMethod'));
  UPDATE saas.in_store_sales SET status='payment_received',payment_received_at=p_now WHERE id=p_sale_id;
 ELSIF p_kind='complete' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF selected.status='completed' THEN
   projected:=jsonb_build_object('sale',saas.in_store_sales_projection_v2(p_store_id,p_sale_id),'replayed',false,'priceChanged',false);
   INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
   RETURN QUERY SELECT 'committed',projected;RETURN;
  END IF;
  IF selected.status<>'payment_received' OR NOT EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id AND store_id=p_store_id AND amount_cents=selected.total_cents) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.in_store_inventory_reservations r LEFT JOIN saas.inventory_balances b ON b.store_id=r.store_id AND b.location_id=r.location_id AND b.variant_id=r.variant_id WHERE r.sale_id=p_sale_id AND r.status='held' AND r.stock_tracked AND coalesce(b.quantity,0)<r.quantity) OR (SELECT count(*) FROM saas.in_store_inventory_reservations WHERE sale_id=p_sale_id AND status='held')<>jsonb_array_length(selected.items) THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
  target_order:=saas.inventory_deterministic_uuid('in-store-order',p_store_id::text||':'||p_sale_id::text);
  -- ORDER_NUMBER_CREATOR_V161
  actual_order_number := saas.order_number_allocate(p_store_id,target_order,'POS',p_now);
  INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,customer_id,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,paid_at)
  VALUES(target_order,p_store_id,actual_order_number,'in_store',selected.intent->>'customerName',NULL,NULL,NULL,'TRY',selected.subtotal_cents,0,selected.discount_cents,selected.total_cents,'delivered','completed',NULL,selected.created_at,p_now,selected.payment_received_at)
  RETURNING orders.order_number INTO actual_order_number;
  FOR line IN SELECT value FROM jsonb_array_elements(selected.items) LOOP
   target_item:=saas.inventory_deterministic_uuid('in-store-order-item',p_sale_id::text||':'||(line->>'variantId'));
   INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
   VALUES(target_item,p_store_id,target_order,(line->>'productId')::uuid,(line->>'variantId')::uuid,position,line->>'productName',line->>'variantName',line->>'sku',(line->>'unitPriceCents')::bigint,(line->>'quantity')::integer,0,(line->>'lineSubtotalCents')::bigint,p_now);
   INSERT INTO saas.in_store_discount_allocations VALUES(p_store_id,p_sale_id,(line->>'variantId')::uuid,target_item,(line->>'quantity')::integer,(line->>'lineSubtotalCents')::bigint,(line->>'allocatedDiscountCents')::bigint,(line->>'lineNetCents')::bigint,(line->>'allocatedDiscountCents')::bigint/(line->>'quantity')::integer,((line->>'allocatedDiscountCents')::bigint%(line->>'quantity')::integer)::integer);
   position:=position+1;
  END LOOP;
  UPDATE saas.in_store_inventory_reservations SET status='consumed',consumed_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  PERFORM set_config('saas.inventory.source_marker','inventory_managed',true);
  FOR variant IN SELECT r.* FROM saas.in_store_inventory_reservations r WHERE r.sale_id=p_sale_id AND r.stock_tracked AND r.status='consumed' ORDER BY r.variant_id LOOP
   UPDATE saas.inventory_balances SET quantity=quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND location_id=variant.location_id AND variant_id=variant.variant_id;
   INSERT INTO saas.inventory_movements(id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,source_kind,source_id,occurred_at,created_at)
   VALUES(saas.inventory_deterministic_uuid('in-store-inventory',p_sale_id::text||':'||variant.variant_id::text),p_store_id,variant.location_id,variant.variant_id,'in_store_sale','out',-variant.quantity,'in_store_sale',p_sale_id,p_now,p_now);
   UPDATE saas.product_variants SET stock_quantity=stock_quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=variant.variant_id;
  END LOOP;
  INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at) VALUES(saas.inventory_deterministic_uuid('in-store-order-event',p_sale_id::text),p_store_id,target_order,p_membership_id,'order_created','Mağaza satışı tamamlandı',jsonb_build_object('source','in_store','saleId',p_sale_id,'paymentMethod',selected.payment_method),p_now);
  UPDATE saas.in_store_sales SET status='completed',completed_at=p_now,order_id=target_order,order_number=actual_order_number WHERE id=p_sale_id;
 ELSIF p_kind='discard' THEN
  IF selected.status NOT IN('draft','held','payment_pending') OR p_args<>jsonb_build_object('confirmUnpaid',true)
   OR selected.payment_received_at IS NOT NULL OR selected.completed_at IS NOT NULL
   OR selected.order_id IS NOT NULL OR selected.order_number IS NOT NULL
   OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id)
  THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  UPDATE saas.in_store_sales SET status='cancelled' WHERE id=p_sale_id;
 ELSIF p_kind='cancel' THEN
  IF selected.status NOT IN('draft','held','payment_pending') OR p_args<>jsonb_build_object('confirmUnpaid',true) OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  UPDATE saas.in_store_sales SET status='draft' WHERE id=p_sale_id;
 ELSIF p_kind='takeover' THEN
  IF selected.status IN('completed','cancelled') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET owner_membership_id=p_membership_id WHERE id=p_sale_id;
 END IF;
 IF p_kind<>'create' THEN UPDATE saas.in_store_sales SET version=version+1,updated_at=p_now WHERE id=p_sale_id;END IF;
 projected:=jsonb_build_object('sale',saas.in_store_sales_projection_v2(p_store_id,p_sale_id),'replayed',false,'priceChanged',changed);
 INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
 INSERT INTO saas.in_store_sale_events VALUES(saas.inventory_deterministic_uuid('in-store-event',p_operation_id::text),p_store_id,p_sale_id,p_membership_id,p_kind,jsonb_build_object('version',projected->'sale'->'version','operationId',p_operation_id),p_now);
 RETURN QUERY SELECT 'committed',projected;

 END;
 EXCEPTION WHEN SQLSTATE 'P0246' THEN RETURN QUERY SELECT SQLERRM::text,NULL::jsonb;RETURN;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.in_store_sales_mutate_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.in_store_sales_mutate_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)')),'UTF8')),'hex')<>'021074ac6c015be101696190b57ea63596f5320ce825306614062fe8fc73c919' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.in_store_sales_mutate_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.in_store_sales_mutate_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)',pg_get_functiondef(p.oid),'021074ac6c015be101696190b57ea63596f5320ce825306614062fe8fc73c919',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.in_store_sales_mutate_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.in_store_sales_mutate_v3(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_sale_id uuid, p_expected_version bigint, p_kind text, p_args jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE receipt saas.in_store_payment_attestations%ROWTYPE; actual_order_number text; err text; prior saas.in_store_operations%ROWTYPE; selected saas.in_store_sales%ROWTYPE; quote record; intent_payload jsonb; line jsonb; variant record; amount bigint; selected_location_name text; manager boolean; changed boolean:=false; projected jsonb; target_order uuid; target_item uuid; position integer:=0; selected_location uuid;
BEGIN
 BEGIN
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'in_store_sales_mutate_v3');
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,p_kind='takeover');
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_sale_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_kind NOT IN('create','update','hold','prepare','confirm_payment','complete','cancel','takeover','discard') OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' OR pg_column_size(p_args)>65536 OR (p_kind<>'create' AND (p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740990)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 -- Lock durable authority and recheck after any wait on the store writer lock.
 PERFORM 1 FROM saas.platform_authorized_memberships WHERE store_id=p_store_id AND id=p_membership_id FOR SHARE;
 PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR SHARE;
 PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id FOR SHARE;
 PERFORM 1 FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id FOR SHARE;
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,p_kind='takeover');
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;

 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.store_id<>p_store_id OR prior.operation_kind<>p_kind OR prior.payload_fingerprint<>p_fingerprint OR prior.sale_id IS DISTINCT FROM p_sale_id OR (prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id)) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  projected:=prior.result_payload||jsonb_build_object('replayed',true);
  IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
  RETURN QUERY SELECT 'operation_replayed',projected;RETURN;
 END IF;
 manager:=saas.in_store_is_manager(p_store_id,p_membership_id);
 IF p_kind='create' THEN IF NOT saas.platform_new_sales_allowed(p_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF;
  IF p_expected_version IS NOT NULL OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') OR EXISTS(SELECT 1 FROM saas.in_store_sales WHERE id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  intent_payload:=p_args->'intent';
 ELSE
  SELECT * INTO selected FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF selected.contract_version=4 THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
  IF selected.owner_membership_id<>p_membership_id AND NOT manager THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF selected.version<>p_expected_version OR p_now<selected.updated_at THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF selected.contract_version<3 AND p_kind<>'update' THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
  intent_payload:=CASE WHEN p_kind='update' THEN p_args->'intent' ELSE selected.intent END;
 END IF;
 IF p_kind IN('create','update','prepare') THEN
  SELECT * INTO quote FROM saas.in_store_quote_v3(p_store_id,p_membership_id,p_now,intent_payload,coalesce(selected.items,'[]'::jsonb));
  IF quote.outcome<>'found' THEN RETURN QUERY SELECT quote.outcome::text,NULL::jsonb;RETURN;END IF;
  IF p_kind='prepare' THEN
   IF (quote.result_payload->>'initialCollectionCents')::bigint>0 AND intent_payload->>'paymentMethod' IS NULL THEN RETURN QUERY SELECT 'payment_method_required',NULL::jsonb;RETURN;END IF;
   IF (quote.result_payload->>'initialCollectionCents')::bigint<(quote.result_payload->>'totalCents')::bigint THEN
    IF NOT saas.accounting_credit_enabled() THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
    IF NOT saas.in_store_can_sell_on_credit(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'credit_denied',NULL::jsonb;RETURN;END IF;
   END IF;
  END IF;
 END IF;
 selected_location:=CASE WHEN p_kind IN('create','update') THEN (intent_payload->>'locationId')::uuid ELSE selected.location_id END;
 -- Payment already received can always be recovered by a manager, even if a location was archived.
 IF p_kind<>'complete' OR selected.status<>'payment_received' THEN
  err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,selected_location,false);
  IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 ELSIF NOT manager THEN
  IF NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id AND enabled AND selected_location=ANY(location_ids)) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 END IF;
 SELECT name INTO selected_location_name FROM saas.inventory_locations WHERE store_id=p_store_id AND id=selected_location;
 IF p_kind='create' THEN IF NOT saas.platform_new_sales_allowed(p_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.in_store_sales(id,store_id,sale_number,status,owner_membership_id,location_id,location_name,intent,price_provenance,items,subtotal_cents,eligible_subtotal_cents,discount_cents,total_cents,created_at,updated_at)
  VALUES(p_sale_id,p_store_id,'POS-'||upper(replace(p_sale_id::text,'-','')),'draft',p_membership_id,selected_location,selected_location_name,intent_payload,quote.result_payload->'priceProvenance',quote.result_payload->'items',(quote.result_payload->>'subtotalCents')::bigint,(quote.result_payload->>'eligibleSubtotalCents')::bigint,(quote.result_payload->>'discountCents')::bigint,(quote.result_payload->>'totalCents')::bigint,p_now,p_now);
  UPDATE saas.in_store_sales SET contract_version=3,payment_method=intent_payload->>'paymentMethod',customer_id=(intent_payload->>'customerId')::uuid,customer_snapshot=nullif(quote.result_payload->'customer','null'::jsonb),initial_collection_cents=(quote.result_payload->>'initialCollectionCents')::bigint,due_date=(intent_payload->>'dueDate')::date WHERE id=p_sale_id;
 ELSIF p_kind='update' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET contract_version=3,payment_method=intent_payload->>'paymentMethod',customer_id=(intent_payload->>'customerId')::uuid,customer_snapshot=nullif(quote.result_payload->'customer','null'::jsonb),initial_collection_cents=(quote.result_payload->>'initialCollectionCents')::bigint,due_date=(intent_payload->>'dueDate')::date,location_id=selected_location,location_name=selected_location_name,intent=intent_payload,price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
 ELSIF p_kind='hold' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'held')<>'boolean' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET status=CASE WHEN (p_args->>'held')::boolean THEN 'held' ELSE 'draft' END WHERE id=p_sale_id;
 ELSIF p_kind='prepare' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'expectedTotalCents')<>'number' OR (p_args->>'expectedTotalCents')::numeric<>trunc((p_args->>'expectedTotalCents')::numeric) OR (p_args->>'expectedTotalCents')::numeric<=0 OR (quote.result_payload->>'totalCents')::bigint<=0 OR jsonb_array_length(selected.items)=0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  changed:=selected.items IS DISTINCT FROM quote.result_payload->'items' OR selected.total_cents<>(p_args->>'expectedTotalCents')::numeric;
  IF changed THEN
   UPDATE saas.in_store_sales SET initial_collection_cents=(quote.result_payload->>'initialCollectionCents')::bigint,customer_snapshot=nullif(quote.result_payload->'customer','null'::jsonb),status='draft',price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
  ELSE
   -- Global inventory and selected location are checked under the same store lock as online/count/transfer.
   FOR line IN SELECT value FROM jsonb_array_elements(selected.items) ORDER BY value->>'variantId' LOOP
    SELECT * INTO variant FROM saas.product_variants WHERE store_id=p_store_id AND id=(line->>'variantId')::uuid FOR UPDATE;
    IF variant.stock_tracking THEN
     SELECT coalesce(quantity,0) INTO amount FROM saas.inventory_balances WHERE store_id=p_store_id AND location_id=selected.location_id AND variant_id=variant.id FOR UPDATE;
     IF coalesce(amount,0)-saas.in_store_held_quantity(p_store_id,variant.id,selected.location_id,p_sale_id)<(line->>'quantity')::integer OR variant.stock_quantity-saas.in_store_held_quantity(p_store_id,variant.id,NULL,p_sale_id)<(line->>'quantity')::integer THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
    END IF;
   END LOOP;
   INSERT INTO saas.in_store_inventory_reservations(id,store_id,sale_id,location_id,product_id,variant_id,quantity,stock_tracked,status,held_at,updated_at)
   SELECT saas.inventory_deterministic_uuid('in-store-reservation',p_sale_id::text||':'||v.id::text),p_store_id,p_sale_id,selected.location_id,v.product_id,v.id,(i->>'quantity')::integer,v.stock_tracking,'held',p_now,p_now
   FROM jsonb_array_elements(selected.items) i JOIN saas.product_variants v ON v.store_id=p_store_id AND v.id=(i->>'variantId')::uuid
   ON CONFLICT(sale_id,variant_id) DO UPDATE SET location_id=excluded.location_id,quantity=excluded.quantity,stock_tracked=excluded.stock_tracked,status='held',held_at=p_now,consumed_at=NULL,released_at=NULL,updated_at=p_now,version=saas.in_store_inventory_reservations.version+1;
   INSERT INTO saas.in_store_price_snapshots(store_id,sale_id,prepare_operation_id,variant_id,provenance,prepared_at) SELECT p_store_id,p_sale_id,p_operation_id,(value->>'variantId')::uuid,value,p_now FROM jsonb_array_elements(quote.result_payload->'priceProvenance');
   UPDATE saas.in_store_sales SET customer_id=(intent_payload->>'customerId')::uuid,customer_snapshot=nullif(quote.result_payload->'customer','null'::jsonb),initial_collection_cents=(quote.result_payload->>'initialCollectionCents')::bigint,due_date=(intent_payload->>'dueDate')::date,status='payment_pending',price_provenance=quote.result_payload->'priceProvenance' WHERE id=p_sale_id;
  END IF;
 ELSIF p_kind='confirm_payment' THEN
  IF selected.status<>'payment_pending' OR selected.initial_collection_cents=0 OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>2 OR NOT(p_args ? 'slipReference') OR (p_args->'slipReference'<>'null'::jsonb AND (jsonb_typeof(p_args->'slipReference')<>'string' OR length(p_args->>'slipReference') NOT BETWEEN 1 AND 100 OR p_args->>'slipReference'<>btrim(p_args->>'slipReference') OR p_args->>'slipReference'~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF NOT(p_args ? 'paymentMethod') OR (p_args->'paymentMethod'<>'null'::jsonb AND (jsonb_typeof(p_args->'paymentMethod')<>'string' OR p_args->>'paymentMethod' NOT IN('card','cash','bank_transfer'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF selected.payment_method IS NOT NULL AND p_args->>'paymentMethod' IS NOT NULL AND selected.payment_method<>p_args->>'paymentMethod' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF selected.payment_method IS NULL THEN
   IF p_args->>'paymentMethod' IS NULL THEN RETURN QUERY SELECT 'payment_method_required',NULL::jsonb;RETURN;END IF;
   UPDATE saas.in_store_sales SET payment_method=p_args->>'paymentMethod',contract_version=3 WHERE id=p_sale_id;
  END IF;
  INSERT INTO saas.in_store_payment_attestations(sale_id,store_id,actor_membership_id,amount_cents,slip_reference,received_at,payment_method) VALUES(p_sale_id,p_store_id,p_membership_id,selected.initial_collection_cents,p_args->>'slipReference',p_now,coalesce(selected.payment_method,p_args->>'paymentMethod'));
  UPDATE saas.in_store_sales SET status='payment_received',payment_received_at=p_now WHERE id=p_sale_id;
 ELSIF p_kind='complete' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF selected.status='completed' THEN
   projected:=jsonb_build_object('sale',saas.in_store_sales_projection_v3(p_store_id,p_sale_id),'replayed',false,'priceChanged',false);
   INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
   RETURN QUERY SELECT 'committed',projected;RETURN;
  END IF;
  IF selected.initial_collection_cents<selected.total_cents AND NOT saas.accounting_credit_enabled() THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
  IF NOT (selected.initial_collection_cents=0 AND selected.status='payment_pending') AND NOT (selected.initial_collection_cents>0 AND selected.status='payment_received' AND EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id AND store_id=p_store_id AND amount_cents=selected.initial_collection_cents AND payment_method=selected.payment_method)) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF selected.initial_collection_cents=0 AND NOT saas.in_store_can_sell_on_credit(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'credit_denied',NULL::jsonb;RETURN;END IF;
  SELECT * INTO receipt FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id AND store_id=p_store_id;
  IF EXISTS(SELECT 1 FROM saas.in_store_inventory_reservations r LEFT JOIN saas.inventory_balances b ON b.store_id=r.store_id AND b.location_id=r.location_id AND b.variant_id=r.variant_id WHERE r.sale_id=p_sale_id AND r.status='held' AND r.stock_tracked AND coalesce(b.quantity,0)<r.quantity) OR (SELECT count(*) FROM saas.in_store_inventory_reservations WHERE sale_id=p_sale_id AND status='held')<>jsonb_array_length(selected.items) THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
  target_order:=saas.inventory_deterministic_uuid('in-store-order',p_store_id::text||':'||p_sale_id::text);
  -- ORDER_NUMBER_CREATOR_V161
  actual_order_number := saas.order_number_allocate(p_store_id,target_order,'POS',p_now);
  INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,customer_id,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,paid_at)
  VALUES(target_order,p_store_id,actual_order_number,'in_store',coalesce(selected.customer_snapshot->>'name',selected.intent->>'customerName'),selected.customer_snapshot->>'email',selected.customer_snapshot->>'phone',selected.customer_id,'TRY',selected.subtotal_cents,0,selected.discount_cents,selected.total_cents,'delivered',CASE WHEN selected.initial_collection_cents=selected.total_cents THEN 'completed' ELSE 'pending' END,NULL,coalesce(selected.payment_received_at,p_now),p_now,CASE WHEN selected.initial_collection_cents=selected.total_cents THEN selected.payment_received_at ELSE NULL END)
  RETURNING orders.order_number INTO actual_order_number;
  FOR line IN SELECT value FROM jsonb_array_elements(selected.items) LOOP
   target_item:=saas.inventory_deterministic_uuid('in-store-order-item',p_sale_id::text||':'||(line->>'variantId'));
   INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
   VALUES(target_item,p_store_id,target_order,(line->>'productId')::uuid,(line->>'variantId')::uuid,position,line->>'productName',line->>'variantName',line->>'sku',(line->>'unitPriceCents')::bigint,(line->>'quantity')::integer,0,(line->>'lineSubtotalCents')::bigint,p_now);
   INSERT INTO saas.in_store_discount_allocations VALUES(p_store_id,p_sale_id,(line->>'variantId')::uuid,target_item,(line->>'quantity')::integer,(line->>'lineSubtotalCents')::bigint,(line->>'allocatedDiscountCents')::bigint,(line->>'lineNetCents')::bigint,(line->>'allocatedDiscountCents')::bigint/(line->>'quantity')::integer,((line->>'allocatedDiscountCents')::bigint%(line->>'quantity')::integer)::integer);
   position:=position+1;
  END LOOP;
  UPDATE saas.in_store_inventory_reservations SET status='consumed',consumed_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  PERFORM set_config('saas.inventory.source_marker','inventory_managed',true);
  FOR variant IN SELECT r.* FROM saas.in_store_inventory_reservations r WHERE r.sale_id=p_sale_id AND r.stock_tracked AND r.status='consumed' ORDER BY r.variant_id LOOP
   UPDATE saas.inventory_balances SET quantity=quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND location_id=variant.location_id AND variant_id=variant.variant_id;
   INSERT INTO saas.inventory_movements(id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,source_kind,source_id,occurred_at,created_at)
   VALUES(saas.inventory_deterministic_uuid('in-store-inventory',p_sale_id::text||':'||variant.variant_id::text),p_store_id,variant.location_id,variant.variant_id,'in_store_sale','out',-variant.quantity,'in_store_sale',p_sale_id,p_now,p_now);
   UPDATE saas.product_variants SET stock_quantity=stock_quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=variant.variant_id;
  END LOOP;
  INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at) VALUES(saas.inventory_deterministic_uuid('in-store-order-event',p_sale_id::text),p_store_id,target_order,p_membership_id,'order_created','Mağaza satışı tamamlandı',jsonb_build_object('source','in_store','saleId',p_sale_id,'paymentMethod',selected.payment_method),p_now);
  PERFORM saas.accounting_post_pos_sale(p_store_id,target_order,p_operation_id,selected.customer_id,coalesce(selected.customer_snapshot,'{}'::jsonb),selected.total_cents,selected.initial_collection_cents,'TRY',selected.payment_method,selected.due_date,p_membership_id,p_now,receipt.received_at,receipt.actor_membership_id);
  UPDATE saas.in_store_sales SET status='completed',completed_at=p_now,order_id=target_order,order_number=actual_order_number WHERE id=p_sale_id;
 ELSIF p_kind='discard' THEN
  IF selected.status NOT IN('draft','held','payment_pending') OR p_args<>jsonb_build_object('confirmUnpaid',true)
   OR selected.payment_received_at IS NOT NULL OR selected.completed_at IS NOT NULL
   OR selected.order_id IS NOT NULL OR selected.order_number IS NOT NULL
   OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id)
  THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  UPDATE saas.in_store_sales SET status='cancelled' WHERE id=p_sale_id;
 ELSIF p_kind='cancel' THEN
  IF selected.status NOT IN('draft','held','payment_pending') OR p_args<>jsonb_build_object('confirmUnpaid',true) OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  UPDATE saas.in_store_sales SET status='draft' WHERE id=p_sale_id;
 ELSIF p_kind='takeover' THEN
  IF selected.status IN('completed','cancelled') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET owner_membership_id=p_membership_id WHERE id=p_sale_id;
 END IF;
 IF p_kind<>'create' THEN UPDATE saas.in_store_sales SET version=version+1,updated_at=p_now WHERE id=p_sale_id;END IF;
 projected:=jsonb_build_object('sale',saas.in_store_sales_projection_v3(p_store_id,p_sale_id),'replayed',false,'priceChanged',changed);
 INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
 INSERT INTO saas.in_store_sale_events VALUES(saas.inventory_deterministic_uuid('in-store-event',p_operation_id::text),p_store_id,p_sale_id,p_membership_id,p_kind,jsonb_build_object('version',projected->'sale'->'version','operationId',p_operation_id),p_now);
 RETURN QUERY SELECT 'committed',projected;

 END;
 EXCEPTION WHEN SQLSTATE 'P0246' THEN RETURN QUERY SELECT SQLERRM::text,NULL::jsonb;RETURN;
END $function$
;

DO $patch$BEGIN IF to_regprocedure('saas.in_store_sales_mutate_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)') IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('saas.in_store_sales_mutate_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)')),'UTF8')),'hex')<>'b3f2193ed574aebfcc6f8de58f2c0f4fcf74b1ab15eca81ea280245e4116f493' THEN RAISE EXCEPTION 'COMMERCIAL246_PREDECESSOR_DRIFT: %','saas.in_store_sales_mutate_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)';END IF;INSERT INTO saas.commercial246_original_functions SELECT 'saas.in_store_sales_mutate_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)',pg_get_functiondef(p.oid),'b3f2193ed574aebfcc6f8de58f2c0f4fcf74b1ab15eca81ea280245e4116f493',NULL,p.oid,p.proowner,p.proacl,p.proconfig FROM pg_proc p WHERE p.oid=to_regprocedure('saas.in_store_sales_mutate_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,jsonb)');END $patch$;
CREATE OR REPLACE FUNCTION saas.in_store_sales_mutate_v4(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_sale_id uuid, p_expected_version bigint, p_kind text, p_args jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE receipt saas.in_store_payment_attestations%ROWTYPE; actual_order_number text; err text; prior saas.in_store_operations%ROWTYPE; selected saas.in_store_sales%ROWTYPE; quote record; intent_payload jsonb; line jsonb; variant record; amount bigint; selected_location_name text; manager boolean; changed boolean:=false; projected jsonb; target_order uuid; target_item uuid; position integer:=0; selected_location uuid; part jsonb; receipt_v4 saas.in_store_payment_receipts_v4%ROWTYPE; customer_v4 saas.customers%ROWTYPE; account_v4 uuid; event_v4 uuid; receipt_id_v4 uuid; initial_v4 bigint; method_v4 text; parts_v4 jsonb; due_v4 date; original_prepare_v4 jsonb;original_part_v4 jsonb;
BEGIN
 BEGIN
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'in_store_sales_mutate_v4');
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,p_kind='takeover');
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_sale_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_kind NOT IN('create','update','hold','prepare','confirm_payment','complete','revise_payments','abort','return_payment','reconcile_payment','cancel','takeover','discard') OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' OR pg_column_size(p_args)>65536 OR (p_kind<>'create' AND (p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740990)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||p_operation_id::text,0));
 IF p_kind='reconcile_payment' THEN IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||(p_args->>'originalOperationId'),0));END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended('saas.accounting.release',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 -- Lock durable authority and recheck after any wait on the store writer lock.
 PERFORM 1 FROM saas.platform_authorized_memberships WHERE store_id=p_store_id AND id=p_membership_id FOR SHARE;
 PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR SHARE;
 PERFORM 1 FROM saas.subscriptions WHERE store_id=p_store_id AND plan_id=p_plan_id FOR SHARE;
 PERFORM 1 FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id FOR SHARE;
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,p_kind='takeover');
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;

 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.store_id<>p_store_id OR prior.operation_kind<>p_kind OR prior.payload_fingerprint<>p_fingerprint OR prior.sale_id IS DISTINCT FROM p_sale_id OR (prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id)) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  projected:=prior.result_payload||jsonb_build_object('replayed',true);
  IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
  RETURN QUERY SELECT 'operation_replayed',projected;RETURN;
 END IF;
 IF p_kind='confirm_payment' AND EXISTS(SELECT 1 FROM saas.in_store_obsolete_payment_reconciliations_v4 WHERE original_operation_id=p_operation_id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 manager:=saas.in_store_is_manager(p_store_id,p_membership_id);
 IF p_kind='create' THEN IF NOT saas.platform_new_sales_allowed(p_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF;
  IF NOT (SELECT manual_sales_v4_enabled FROM saas.accounting_release_state WHERE singleton) THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
  IF p_expected_version IS NOT NULL OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') OR EXISTS(SELECT 1 FROM saas.in_store_sales WHERE id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  intent_payload:=p_args->'intent';
 ELSE
  SELECT * INTO selected FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF selected.owner_membership_id<>p_membership_id AND NOT manager THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF (selected.version<>p_expected_version AND NOT(p_expected_version<=selected.version AND (p_kind='return_payment' AND selected.abort_requested OR p_kind='reconcile_payment' OR p_kind='confirm_payment' AND selected.prepare_operation_id=(p_args->>'prepareOperationId')::uuid AND EXISTS(SELECT 1 FROM saas.in_store_operations history CROSS JOIN LATERAL jsonb_array_elements(history.result_payload#>'{sale,paymentParts}') old_part JOIN LATERAL jsonb_array_elements(selected.payment_parts) current_part ON current_part->>'partId'=old_part->>'partId' AND current_part->>'paymentMethod'=old_part->>'paymentMethod' AND current_part->>'amountCents'=old_part->>'amountCents' WHERE history.store_id=p_store_id AND history.sale_id=p_sale_id AND (history.result_payload#>>'{sale,version}')::bigint=p_expected_version AND history.result_payload#>>'{sale,prepareOperationId}'=p_args->>'prepareOperationId' AND old_part->>'partId'=p_args->>'partId')))) OR p_now<selected.updated_at THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF selected.contract_version<>4 AND p_kind<>'update' THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
  IF selected.contract_version<>4 AND p_kind='update' AND NOT (SELECT manual_sales_v4_enabled FROM saas.accounting_release_state WHERE singleton) THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
  intent_payload:=CASE WHEN p_kind='update' THEN p_args->'intent' ELSE selected.intent END;
 END IF;
 IF p_kind IN('create','update','prepare') THEN
  SELECT * INTO quote FROM saas.in_store_quote_v4(p_store_id,p_membership_id,p_now,intent_payload,coalesce(selected.items,'[]'::jsonb));
  IF quote.outcome<>'found' THEN RETURN QUERY SELECT quote.outcome::text,NULL::jsonb;RETURN;END IF;
  IF p_kind='prepare' THEN
   -- Payment/customer authority is checked after price-change reconciliation.

  END IF;
 END IF;
 selected_location:=CASE WHEN p_kind IN('create','update') THEN (intent_payload->>'locationId')::uuid ELSE selected.location_id END;
 -- Payment already received can always be recovered by a manager, even if a location was archived.
 IF p_kind='reconcile_payment' AND manager THEN NULL;
 ELSIF p_kind NOT IN('complete','abort','return_payment','revise_payments') OR selected.status NOT IN('payment_pending','payment_received') THEN
  err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,selected_location,false);
  IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 ELSIF NOT manager THEN
  IF NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id AND enabled AND selected_location=ANY(location_ids)) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 END IF;
 SELECT name INTO selected_location_name FROM saas.inventory_locations WHERE store_id=p_store_id AND id=selected_location;
 IF p_kind='create' THEN IF NOT saas.platform_new_sales_allowed(p_store_id) THEN RETURN QUERY SELECT 'sales_paused',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.in_store_sales(id,store_id,sale_number,status,contract_version,owner_membership_id,location_id,location_name,intent,price_provenance,items,subtotal_cents,eligible_subtotal_cents,discount_cents,total_cents,shipping_cents,created_at,updated_at)
  VALUES(p_sale_id,p_store_id,'POS-'||upper(replace(p_sale_id::text,'-','')),'draft',4,p_membership_id,selected_location,selected_location_name,intent_payload,quote.result_payload->'priceProvenance',quote.result_payload->'items',(quote.result_payload->>'subtotalCents')::bigint,(quote.result_payload->>'eligibleSubtotalCents')::bigint,(quote.result_payload->>'discountCents')::bigint,(quote.result_payload->>'totalCents')::bigint,(intent_payload->>'shippingCents')::bigint,p_now,p_now);
  UPDATE saas.in_store_sales SET contract_version=4,payment_method=quote.result_payload->>'paymentMethod',sales_channel=intent_payload->>'salesChannel',social_platform=intent_payload->>'socialPlatform',social_reference=intent_payload->>'socialReference',fulfillment_method=intent_payload->>'fulfillmentMethod',shipping_address=nullif(intent_payload->'shippingAddress','null'),billing_address=coalesce(nullif(intent_payload->'billingAddress','null'),nullif(intent_payload->'shippingAddress','null')),shipping_cents=(intent_payload->>'shippingCents')::bigint,payment_parts=quote.result_payload->'paymentParts',customer_id=(intent_payload->>'customerId')::uuid,customer_snapshot=nullif(quote.result_payload->'customer','null'::jsonb),initial_collection_cents=(quote.result_payload->>'initialCollectionCents')::bigint,due_date=(intent_payload->>'dueDate')::date WHERE id=p_sale_id;
 ELSIF p_kind='update' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET contract_version=4,payment_method=quote.result_payload->>'paymentMethod',sales_channel=intent_payload->>'salesChannel',social_platform=intent_payload->>'socialPlatform',social_reference=intent_payload->>'socialReference',fulfillment_method=intent_payload->>'fulfillmentMethod',shipping_address=nullif(intent_payload->'shippingAddress','null'),billing_address=coalesce(nullif(intent_payload->'billingAddress','null'),nullif(intent_payload->'shippingAddress','null')),shipping_cents=(intent_payload->>'shippingCents')::bigint,payment_parts=quote.result_payload->'paymentParts',customer_id=(intent_payload->>'customerId')::uuid,customer_snapshot=nullif(quote.result_payload->'customer','null'::jsonb),initial_collection_cents=(quote.result_payload->>'initialCollectionCents')::bigint,due_date=(intent_payload->>'dueDate')::date,location_id=selected_location,location_name=selected_location_name,intent=jsonb_set(intent_payload,'{paymentParts}',quote.result_payload->'paymentParts'),price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
 ELSIF p_kind='hold' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'held')<>'boolean' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET status=CASE WHEN (p_args->>'held')::boolean THEN 'held' ELSE 'draft' END WHERE id=p_sale_id;
 ELSIF p_kind='prepare' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'expectedTotalCents')<>'number' OR (p_args->>'expectedTotalCents')::numeric<>trunc((p_args->>'expectedTotalCents')::numeric) OR (p_args->>'expectedTotalCents')::numeric<=0 OR (quote.result_payload->>'totalCents')::bigint<=0 OR jsonb_array_length(selected.items)=0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  changed:=selected.items IS DISTINCT FROM quote.result_payload->'items' OR selected.total_cents<>(p_args->>'expectedTotalCents')::numeric;
  IF changed THEN
   UPDATE saas.in_store_sales SET payment_parts=quote.result_payload->'paymentParts',payment_method=quote.result_payload->>'paymentMethod',intent=jsonb_set(intent,'{paymentParts}',quote.result_payload->'paymentParts'),initial_collection_cents=(quote.result_payload->>'initialCollectionCents')::bigint,customer_snapshot=nullif(quote.result_payload->'customer','null'::jsonb),status='draft',price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
  ELSE
   IF ((quote.result_payload->>'initialCollectionCents')::bigint<(quote.result_payload->>'totalCents')::bigint OR intent_payload->>'fulfillmentMethod'='shipping') AND (quote.result_payload->'customer'->>'phone' IS NULL OR quote.result_payload->'customer'->>'firstName'='' OR quote.result_payload->'customer'->>'lastName'='') THEN RETURN QUERY SELECT 'customer_required',NULL::jsonb;RETURN;END IF;
   IF (quote.result_payload->>'initialCollectionCents')::bigint<(quote.result_payload->>'totalCents')::bigint THEN IF NOT saas.accounting_credit_enabled() THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;IF NOT saas.in_store_can_sell_on_credit(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'credit_denied',NULL::jsonb;RETURN;END IF;END IF;
   -- Global inventory and selected location are checked under the same store lock as online/count/transfer.
   FOR line IN SELECT value FROM jsonb_array_elements(selected.items) ORDER BY value->>'variantId' LOOP
    SELECT * INTO variant FROM saas.product_variants WHERE store_id=p_store_id AND id=(line->>'variantId')::uuid FOR UPDATE;
    IF variant.stock_tracking THEN
     SELECT coalesce(quantity,0) INTO amount FROM saas.inventory_balances WHERE store_id=p_store_id AND location_id=selected.location_id AND variant_id=variant.id FOR UPDATE;
     IF coalesce(amount,0)-saas.in_store_held_quantity(p_store_id,variant.id,selected.location_id,p_sale_id)<(line->>'quantity')::integer OR variant.stock_quantity-saas.in_store_held_quantity(p_store_id,variant.id,NULL,p_sale_id)<(line->>'quantity')::integer THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
    END IF;
   END LOOP;
   INSERT INTO saas.in_store_inventory_reservations(id,store_id,sale_id,location_id,product_id,variant_id,quantity,stock_tracked,status,held_at,updated_at)
   SELECT saas.inventory_deterministic_uuid('in-store-reservation',p_sale_id::text||':'||v.id::text),p_store_id,p_sale_id,selected.location_id,v.product_id,v.id,(i->>'quantity')::integer,v.stock_tracking,'held',p_now,p_now
   FROM jsonb_array_elements(selected.items) i JOIN saas.product_variants v ON v.store_id=p_store_id AND v.id=(i->>'variantId')::uuid
   ON CONFLICT(sale_id,variant_id) DO UPDATE SET location_id=excluded.location_id,quantity=excluded.quantity,stock_tracked=excluded.stock_tracked,status='held',held_at=p_now,consumed_at=NULL,released_at=NULL,updated_at=p_now,version=saas.in_store_inventory_reservations.version+1;
   INSERT INTO saas.in_store_price_snapshots(store_id,sale_id,prepare_operation_id,variant_id,provenance,prepared_at) SELECT p_store_id,p_sale_id,p_operation_id,(value->>'variantId')::uuid,value,p_now FROM jsonb_array_elements(quote.result_payload->'priceProvenance');
   UPDATE saas.in_store_sales SET customer_id=(intent_payload->>'customerId')::uuid,customer_snapshot=nullif(quote.result_payload->'customer','null'::jsonb),initial_collection_cents=(quote.result_payload->>'initialCollectionCents')::bigint,due_date=(intent_payload->>'dueDate')::date,status='payment_pending',prepare_operation_id=p_operation_id,payment_plan_version=selected.version+1,abort_requested=false,price_provenance=quote.result_payload->'priceProvenance' WHERE id=p_sale_id;
  END IF;
 ELSIF p_kind='confirm_payment' THEN
  IF selected.status NOT IN('payment_pending','payment_received') OR selected.abort_requested OR p_args IS NULL OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>3 OR NOT(p_args?&ARRAY['partId','prepareOperationId','slipReference']) OR selected.prepare_operation_id IS DISTINCT FROM (p_args->>'prepareOperationId')::uuid OR p_args->>'partId' IS NULL OR p_args->'slipReference'<>'null' AND (jsonb_typeof(p_args->'slipReference')<>'string' OR length(p_args->>'slipReference') NOT BETWEEN 1 AND 100 OR p_args->>'slipReference'<>btrim(p_args->>'slipReference') OR p_args->>'slipReference'~'[[:cntrl:]]') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  SELECT value INTO part FROM jsonb_array_elements(selected.payment_parts) WHERE value->>'partId'=p_args->>'partId';
  IF part IS NULL OR EXISTS(SELECT 1 FROM saas.in_store_payment_receipts_v4 WHERE store_id=p_store_id AND sale_id=p_sale_id AND part_id=(part->>'partId')::uuid) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store_id::text,0));
  account_v4:=saas.accounting_default_account(p_store_id,'TRY',part->>'paymentMethod',p_now);
  PERFORM 1 FROM saas.accounting_accounts WHERE store_id=p_store_id AND id=account_v4 FOR UPDATE;
  IF(SELECT balance_cents::numeric+(part->>'amountCents')::numeric>9007199254740991 FROM saas.accounting_accounts WHERE store_id=p_store_id AND id=account_v4) THEN RETURN QUERY SELECT 'amount_overflow',NULL::jsonb;RETURN;END IF;
  event_v4:=saas.inventory_deterministic_uuid('accounting','saas.accounting.manual-receipt:'||p_operation_id::text);receipt_id_v4:=saas.inventory_deterministic_uuid('in-store-receipt-v4',p_sale_id::text||':'||(part->>'partId'));
  INSERT INTO saas.accounting_events(id,store_id,operation_id,kind,currency,amount_cents,account_id,customer_id,channel,payment_method,actor_membership_id,occurred_at,created_at,metadata) VALUES(event_v4,p_store_id,p_operation_id,'collection','TRY',(part->>'amountCents')::bigint,account_v4,selected.customer_id,'POS',part->>'paymentMethod',p_membership_id,p_now,p_now,jsonb_build_object('saleId',p_sale_id,'partId',part->'partId','salesChannel',selected.sales_channel,'pendingSale',true));
  INSERT INTO saas.accounting_account_movements VALUES(p_store_id,event_v4,account_v4,(part->>'amountCents')::bigint);
  UPDATE saas.accounting_accounts SET balance_cents=balance_cents+(part->>'amountCents')::bigint,version=version+1 WHERE store_id=p_store_id AND id=account_v4;
  INSERT INTO saas.in_store_payment_receipts_v4 VALUES(receipt_id_v4,p_store_id,p_sale_id,(part->>'partId')::uuid,selected.prepare_operation_id,p_operation_id,p_membership_id,(part->>'amountCents')::bigint,part->>'paymentMethod',p_args->>'slipReference',p_now,event_v4,account_v4);
  UPDATE saas.in_store_sales SET status=CASE WHEN (SELECT count(*) FROM saas.in_store_payment_receipts_v4 WHERE store_id=p_store_id AND sale_id=p_sale_id)=jsonb_array_length(selected.payment_parts) THEN 'payment_received' ELSE 'payment_pending' END,payment_received_at=CASE WHEN (SELECT count(*) FROM saas.in_store_payment_receipts_v4 WHERE store_id=p_store_id AND sale_id=p_sale_id)=jsonb_array_length(selected.payment_parts) THEN p_now ELSE NULL END WHERE id=p_sale_id;
  PERFORM saas.accounting_bump_customer(p_store_id,selected.customer_id,'TRY');
 ELSIF p_kind='complete' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF selected.status='completed' THEN
   projected:=jsonb_build_object('sale',saas.in_store_sales_projection_v4(p_store_id,p_sale_id),'replayed',false,'priceChanged',false);
   INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
   RETURN QUERY SELECT 'committed',projected;RETURN;
  END IF;
  IF selected.abort_requested THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF selected.status NOT IN('payment_pending','payment_received') OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected.payment_parts) frozen_part LEFT JOIN saas.in_store_payment_receipts_v4 r ON r.store_id=p_store_id AND r.sale_id=p_sale_id AND r.part_id=(frozen_part->>'partId')::uuid LEFT JOIN saas.in_store_payment_returns_v4 returned ON returned.store_id=r.store_id AND returned.receipt_id=r.id WHERE r.id IS NULL OR returned.receipt_id IS NOT NULL) OR coalesce((SELECT sum(amount_cents) FROM saas.in_store_payment_receipts_v4 WHERE store_id=p_store_id AND sale_id=p_sale_id),0)<>selected.initial_collection_cents THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF selected.initial_collection_cents<selected.total_cents AND selected.customer_id IS NULL THEN RETURN QUERY SELECT 'customer_required',NULL::jsonb;RETURN;END IF;
  -- Existing prepared debt authority is frozen; a release rollback cannot strand received money.
  IF EXISTS(SELECT 1 FROM saas.in_store_inventory_reservations r LEFT JOIN saas.inventory_balances b ON b.store_id=r.store_id AND b.location_id=r.location_id AND b.variant_id=r.variant_id WHERE r.sale_id=p_sale_id AND r.status='held' AND r.stock_tracked AND coalesce(b.quantity,0)<r.quantity) OR (SELECT count(*) FROM saas.in_store_inventory_reservations WHERE sale_id=p_sale_id AND status='held')<>jsonb_array_length(selected.items) THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
  target_order:=saas.inventory_deterministic_uuid('in-store-order',p_store_id::text||':'||p_sale_id::text);
  -- ORDER_NUMBER_CREATOR_V161
  actual_order_number := saas.order_number_allocate(p_store_id,target_order,'POS',p_now);
  INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,customer_id,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,billing_address,created_at,updated_at,paid_at)
  VALUES(target_order,p_store_id,actual_order_number,'in_store',coalesce(selected.customer_snapshot->>'name',selected.intent->>'customerName'),selected.customer_snapshot->>'email',selected.customer_snapshot->>'phone',selected.customer_id,'TRY',selected.subtotal_cents,selected.shipping_cents,selected.discount_cents,selected.total_cents,CASE WHEN selected.fulfillment_method='shipping' THEN 'pending' ELSE 'delivered' END,CASE WHEN selected.initial_collection_cents=selected.total_cents THEN 'completed' ELSE 'pending' END,selected.shipping_address,selected.billing_address,coalesce(selected.payment_received_at,p_now),p_now,CASE WHEN selected.initial_collection_cents=selected.total_cents THEN selected.payment_received_at ELSE NULL END)
  RETURNING orders.order_number INTO actual_order_number;
  FOR line IN SELECT value FROM jsonb_array_elements(selected.items) LOOP
   target_item:=saas.inventory_deterministic_uuid('in-store-order-item',p_sale_id::text||':'||(line->>'variantId'));
   INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
   VALUES(target_item,p_store_id,target_order,(line->>'productId')::uuid,(line->>'variantId')::uuid,position,line->>'productName',line->>'variantName',line->>'sku',(line->>'unitPriceCents')::bigint,(line->>'quantity')::integer,0,(line->>'lineSubtotalCents')::bigint,p_now);
   INSERT INTO saas.in_store_discount_allocations VALUES(p_store_id,p_sale_id,(line->>'variantId')::uuid,target_item,(line->>'quantity')::integer,(line->>'lineSubtotalCents')::bigint,(line->>'allocatedDiscountCents')::bigint,(line->>'lineNetCents')::bigint,(line->>'allocatedDiscountCents')::bigint/(line->>'quantity')::integer,((line->>'allocatedDiscountCents')::bigint%(line->>'quantity')::integer)::integer);
   position:=position+1;
  END LOOP;
  UPDATE saas.in_store_inventory_reservations SET status='consumed',consumed_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  PERFORM set_config('saas.inventory.source_marker','inventory_managed',true);
  FOR variant IN SELECT r.* FROM saas.in_store_inventory_reservations r WHERE r.sale_id=p_sale_id AND r.stock_tracked AND r.status='consumed' ORDER BY r.variant_id LOOP
   UPDATE saas.inventory_balances SET quantity=quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND location_id=variant.location_id AND variant_id=variant.variant_id;
   INSERT INTO saas.inventory_movements(id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,source_kind,source_id,occurred_at,created_at)
   VALUES(saas.inventory_deterministic_uuid('in-store-inventory',p_sale_id::text||':'||variant.variant_id::text),p_store_id,variant.location_id,variant.variant_id,'in_store_sale','out',-variant.quantity,'in_store_sale',p_sale_id,p_now,p_now);
   UPDATE saas.product_variants SET stock_quantity=stock_quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=variant.variant_id;
  END LOOP;
  INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at) VALUES(saas.inventory_deterministic_uuid('in-store-order-event',p_sale_id::text),p_store_id,target_order,p_membership_id,'order_created','Mağaza satışı tamamlandı',jsonb_build_object('source','in_store','saleId',p_sale_id,'paymentMethod',selected.payment_method),p_now);
  PERFORM saas.accounting_post_pos_sale_v4(p_store_id,p_sale_id,target_order,p_operation_id,p_membership_id,p_now);
  UPDATE saas.in_store_sales SET status='completed',completed_at=p_now,order_id=target_order,order_number=actual_order_number WHERE id=p_sale_id;
 ELSIF p_kind='discard' THEN
  IF selected.status NOT IN('draft','held','payment_pending') OR p_args<>jsonb_build_object('confirmUnpaid',true)
   OR selected.payment_received_at IS NOT NULL OR selected.completed_at IS NOT NULL
   OR selected.order_id IS NOT NULL OR selected.order_number IS NOT NULL
   OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id)
  THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  UPDATE saas.in_store_sales SET status='cancelled' WHERE id=p_sale_id;
 ELSIF p_kind='reconcile_payment' THEN
  IF NOT manager THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>3 OR NOT(p_args?&ARRAY['originalOperationId','prepareOperationId','partId']) OR p_operation_id=(p_args->>'originalOperationId')::uuid THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.in_store_operations WHERE operation_id=(p_args->>'originalOperationId')::uuid) OR EXISTS(SELECT 1 FROM saas.in_store_obsolete_payment_reconciliations_v4 WHERE original_operation_id=(p_args->>'originalOperationId')::uuid) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  SELECT prepared.result_payload->'sale' INTO original_prepare_v4 FROM saas.in_store_operations prepared WHERE prepared.store_id=p_store_id AND prepared.sale_id=p_sale_id AND prepared.operation_id=(p_args->>'prepareOperationId')::uuid AND prepared.operation_kind='prepare' AND prepared.result_payload->>'priceChanged'='false' AND prepared.result_payload#>>'{sale,contractVersion}'='4';
  IF original_prepare_v4 IS NULL THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  SELECT historical_part INTO original_part_v4 FROM saas.in_store_operations history CROSS JOIN LATERAL jsonb_array_elements(history.result_payload#>'{sale,paymentParts}') historical_part WHERE history.store_id=p_store_id AND history.sale_id=p_sale_id AND history.operation_kind IN('prepare','revise_payments') AND history.result_payload#>>'{sale,prepareOperationId}'=p_args->>'prepareOperationId' AND historical_part->>'partId'=p_args->>'partId' ORDER BY history.committed_at,history.operation_id LIMIT 1;
  IF original_part_v4 IS NULL OR EXISTS(SELECT 1 FROM saas.in_store_payment_receipts_v4 WHERE store_id=p_store_id AND sale_id=p_sale_id AND part_id=(p_args->>'partId')::uuid) OR selected.prepare_operation_id=(p_args->>'prepareOperationId')::uuid AND EXISTS(SELECT 1 FROM jsonb_array_elements(selected.payment_parts) current_part WHERE current_part->>'partId'=original_part_v4->>'partId' AND current_part->>'paymentMethod'=original_part_v4->>'paymentMethod' AND current_part->>'amountCents'=original_part_v4->>'amountCents') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.in_store_obsolete_payment_reconciliations_v4 VALUES(p_operation_id,p_store_id,p_sale_id,(p_args->>'originalOperationId')::uuid,(p_args->>'prepareOperationId')::uuid,(p_args->>'partId')::uuid,(original_part_v4->>'amountCents')::bigint,original_part_v4->>'paymentMethod',p_membership_id,p_now,'physical_return_confirmed');
 ELSIF p_kind='revise_payments' THEN
  IF selected.status NOT IN('payment_pending','payment_received') OR selected.abort_requested OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>3 OR NOT(p_args?&ARRAY['paymentParts','customerId','dueDate']) OR NOT saas.in_store_payment_parts_valid_v4(p_args->'paymentParts') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  parts_v4:=p_args->'paymentParts';
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(parts_v4) proposed_part JOIN saas.in_store_operations history ON history.store_id=p_store_id AND history.sale_id=p_sale_id AND history.operation_kind IN('prepare','revise_payments') AND history.result_payload#>>'{sale,prepareOperationId}'=selected.prepare_operation_id::text CROSS JOIN LATERAL jsonb_array_elements(history.result_payload#>'{sale,paymentParts}') prior_part WHERE prior_part->>'partId'=proposed_part->>'partId' AND (prior_part->>'paymentMethod'<>proposed_part->>'paymentMethod' OR prior_part->>'amountCents'<>proposed_part->>'amountCents')) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.in_store_payment_receipts_v4 received LEFT JOIN LATERAL (SELECT value FROM jsonb_array_elements(parts_v4) WHERE value->>'partId'=received.part_id::text) proposed ON true WHERE received.store_id=p_store_id AND received.sale_id=p_sale_id AND (proposed.value IS NULL OR (proposed.value->>'amountCents')::bigint<>received.amount_cents OR proposed.value->>'paymentMethod'<>received.payment_method)) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  SELECT coalesce(sum((value->>'amountCents')::bigint),0),CASE WHEN count(DISTINCT value->>'paymentMethod')=1 THEN min(value->>'paymentMethod') ELSE NULL END INTO initial_v4,method_v4 FROM jsonb_array_elements(parts_v4);
  IF initial_v4>selected.total_cents THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF selected.customer_id IS NOT NULL AND selected.customer_id IS DISTINCT FROM (p_args->>'customerId')::uuid THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF p_args->>'customerId' IS NOT NULL THEN SELECT * INTO customer_v4 FROM saas.customers WHERE store_id=p_store_id AND id=(p_args->>'customerId')::uuid;IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;IF customer_v4.status<>'active' OR customer_v4.archived_at IS NOT NULL THEN RETURN QUERY SELECT 'customer_archived',NULL::jsonb;RETURN;END IF;END IF;
  IF initial_v4<selected.total_cents THEN IF NOT saas.accounting_credit_enabled() THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;IF NOT saas.in_store_can_sell_on_credit(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'credit_denied',NULL::jsonb;RETURN;END IF;IF customer_v4.id IS NULL OR customer_v4.phone IS NULL OR customer_v4.first_name='' OR customer_v4.last_name='' THEN RETURN QUERY SELECT 'customer_required',NULL::jsonb;RETURN;END IF;END IF;
  due_v4:=(p_args->>'dueDate')::date;IF p_args->>'dueDate' IS NOT NULL AND due_v4::text<>p_args->>'dueDate' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  PERFORM set_config('saas.in_store.v4_revision',p_store_id::text||':'||p_sale_id::text,true);
  UPDATE saas.in_store_sales SET payment_parts=parts_v4,payment_plan_version=selected.version+1,payment_method=method_v4,initial_collection_cents=initial_v4,customer_id=customer_v4.id,customer_snapshot=CASE WHEN selected.customer_id IS NOT NULL THEN selected.customer_snapshot WHEN customer_v4.id IS NULL THEN NULL ELSE saas.in_store_pos_customer_projection(customer_v4) END,due_date=due_v4,intent=intent||jsonb_build_object('paymentParts',parts_v4,'customerId',customer_v4.id,'dueDate',due_v4),status=CASE WHEN initial_v4>0 AND (SELECT count(*) FROM saas.in_store_payment_receipts_v4 WHERE store_id=p_store_id AND sale_id=p_sale_id)=jsonb_array_length(parts_v4) THEN 'payment_received' ELSE 'payment_pending' END,payment_received_at=CASE WHEN initial_v4>0 AND (SELECT count(*) FROM saas.in_store_payment_receipts_v4 WHERE store_id=p_store_id AND sale_id=p_sale_id)=jsonb_array_length(parts_v4) THEN (SELECT max(received_at) FROM saas.in_store_payment_receipts_v4 WHERE store_id=p_store_id AND sale_id=p_sale_id) ELSE NULL END WHERE id=p_sale_id;
  PERFORM set_config('saas.in_store.v4_revision','',true);
 ELSIF p_kind='abort' THEN
  IF NOT manager THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF selected.status NOT IN('payment_pending','payment_received') OR p_args<>'{}' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.in_store_payment_receipts_v4 received LEFT JOIN saas.in_store_payment_returns_v4 returned ON returned.store_id=received.store_id AND returned.receipt_id=received.id WHERE received.store_id=p_store_id AND received.sale_id=p_sale_id AND returned.receipt_id IS NULL) THEN
   UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
   UPDATE saas.in_store_sales SET abort_requested=true,status='cancelled',payment_received_at=NULL WHERE id=p_sale_id;
  ELSE UPDATE saas.in_store_sales SET abort_requested=true WHERE id=p_sale_id;END IF;
 ELSIF p_kind='return_payment' THEN
  IF NOT manager THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF selected.status NOT IN('payment_pending','payment_received') OR NOT selected.abort_requested OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>2 OR NOT(p_args?&ARRAY['partId','reason']) OR jsonb_typeof(p_args->'reason')<>'string' OR length(p_args->>'reason') NOT BETWEEN 1 AND 2000 OR p_args->>'reason'<>btrim(p_args->>'reason') OR p_args->>'reason'~'[[:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  SELECT * INTO receipt_v4 FROM saas.in_store_payment_receipts_v4 WHERE store_id=p_store_id AND sale_id=p_sale_id AND part_id=(p_args->>'partId')::uuid;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM saas.in_store_payment_returns_v4 WHERE receipt_id=receipt_v4.id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.accounting.store:'||p_store_id::text,0));
  PERFORM 1 FROM saas.accounting_accounts WHERE store_id=p_store_id AND id=receipt_v4.account_id FOR UPDATE;
  IF(SELECT balance_cents<receipt_v4.amount_cents FROM saas.accounting_accounts WHERE store_id=p_store_id AND id=receipt_v4.account_id) THEN RETURN QUERY SELECT 'insufficient_funds',NULL::jsonb;RETURN;END IF;
  event_v4:=saas.inventory_deterministic_uuid('accounting','saas.accounting.manual-pending-return:'||p_operation_id::text);
  INSERT INTO saas.accounting_events(id,store_id,operation_id,kind,currency,amount_cents,account_id,customer_id,channel,payment_method,note,actor_membership_id,occurred_at,created_at,metadata) VALUES(event_v4,p_store_id,p_operation_id,'refund','TRY',receipt_v4.amount_cents,receipt_v4.account_id,selected.customer_id,'POS',receipt_v4.payment_method,p_args->>'reason',p_membership_id,p_now,p_now,jsonb_build_object('saleId',p_sale_id,'partId',receipt_v4.part_id,'receiptId',receipt_v4.id,'salesChannel',selected.sales_channel,'pendingSale',true));
  INSERT INTO saas.accounting_account_movements VALUES(p_store_id,event_v4,receipt_v4.account_id,-receipt_v4.amount_cents);
  UPDATE saas.accounting_accounts SET balance_cents=balance_cents-receipt_v4.amount_cents,version=version+1 WHERE store_id=p_store_id AND id=receipt_v4.account_id;
  INSERT INTO saas.in_store_payment_returns_v4 VALUES(receipt_v4.id,p_store_id,event_v4,p_operation_id,p_membership_id,p_now,p_args->>'reason');
  IF NOT EXISTS(SELECT 1 FROM saas.in_store_payment_receipts_v4 received LEFT JOIN saas.in_store_payment_returns_v4 returned ON returned.store_id=received.store_id AND returned.receipt_id=received.id WHERE received.store_id=p_store_id AND received.sale_id=p_sale_id AND returned.receipt_id IS NULL) THEN
   UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
   UPDATE saas.in_store_sales SET status='cancelled',payment_received_at=NULL WHERE id=p_sale_id;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE id=p_sale_id AND status<>'cancelled') THEN UPDATE saas.in_store_sales SET status='payment_pending',payment_received_at=NULL WHERE id=p_sale_id;END IF;
  PERFORM saas.accounting_bump_customer(p_store_id,selected.customer_id,'TRY');
 ELSIF p_kind='cancel' THEN
  IF selected.status NOT IN('draft','held','payment_pending') OR p_args<>jsonb_build_object('confirmUnpaid',true) OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id) OR EXISTS(SELECT 1 FROM saas.in_store_payment_receipts_v4 WHERE store_id=p_store_id AND sale_id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  UPDATE saas.in_store_sales SET status='draft',prepare_operation_id=NULL,abort_requested=false WHERE id=p_sale_id;
 ELSIF p_kind='takeover' THEN
  IF selected.status IN('completed','cancelled') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET owner_membership_id=p_membership_id WHERE id=p_sale_id;
 END IF;
 IF p_kind<>'create' THEN UPDATE saas.in_store_sales SET version=version+1,updated_at=p_now WHERE id=p_sale_id;END IF;
 projected:=jsonb_build_object('sale',saas.in_store_sales_projection_v4(p_store_id,p_sale_id),'replayed',false,'priceChanged',changed);
 INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
 INSERT INTO saas.in_store_sale_events VALUES(saas.inventory_deterministic_uuid('in-store-event',p_operation_id::text),p_store_id,p_sale_id,p_membership_id,p_kind,jsonb_build_object('version',projected->'sale'->'version','operationId',p_operation_id),p_now);
 RETURN QUERY SELECT 'committed',projected;

 END;
 EXCEPTION WHEN SQLSTATE 'P0246' THEN RETURN QUERY SELECT SQLERRM::text,NULL::jsonb;RETURN;
END $function$
;

UPDATE saas.commercial246_original_functions SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(signature)),'UTF8')),'hex');
DO $functions_acl$DECLARE f regprocedure;BEGIN FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname LIKE 'commercial_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator,celebix_saas_platform_operator',f);END LOOP;END $functions_acl$;
GRANT EXECUTE ON FUNCTION saas.commercial_default_starter_version() TO celebix_saas_bootstrap;
GRANT EXECUTE ON FUNCTION saas.commercial_plan_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.commercial_upgrade_request(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) TO celebix_saas_app;
COMMIT;
