BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DROP FUNCTION saas.customers_export(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.customers_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.customer_set_taxonomy(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,uuid[]);
DROP FUNCTION saas.customer_taxonomy_upsert(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,uuid,text,text,bigint);
DROP FUNCTION saas.customer_segments_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.customer_tags_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.customers_add_note(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text);
DROP FUNCTION saas.customers_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.customers_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,jsonb,jsonb);
DROP FUNCTION saas.customers_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.customers_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.customers_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.customer_mutation_projection(uuid,uuid);
DROP FUNCTION saas.customer_detail_projection(uuid,uuid);
DROP FUNCTION saas.customer_list_projection(uuid,uuid);
DROP FUNCTION saas.customer_json_timestamp(timestamptz);

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_required_feature text,p_required_action text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL OR p_required_action IS NULL OR p_required_action NOT IN ('orders.read','orders.manage','orders.fulfill','orders.payment','orders.note','carts.read','carts.manage') THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores s WHERE s.id=p_store_id AND s.status='active') THEN RETURN 'store_inactive'; END IF;
  SELECT m.role INTO membership_role FROM saas.memberships m WHERE m.id=p_membership_id AND m.store_id=p_store_id AND m.principal_id=p_principal_id AND m.status='active'; IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version WHERE s.store_id=p_store_id AND s.plan_id=p_plan_id AND s.plan_code=p_plan_code AND s.plan_version=p_plan_version AND s.status='active' AND s.valid_from<=p_now AND (s.valid_until IS NULL OR s.valid_until>p_now) AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.plan_features f WHERE f.plan_id=p_plan_id AND f.enabled AND f.feature_key=p_required_feature) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT (membership_role IN ('store_owner','admin') OR (membership_role='editor' AND p_required_action IN ('orders.read','orders.fulfill','orders.note','carts.read')) OR (membership_role='analyst' AND p_required_action IN ('orders.read','carts.read'))) THEN RETURN 'membership_denied'; END IF; RETURN NULL;
END $f$;
COMMIT;
