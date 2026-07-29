-- Phase 3B3 rollback removes only migration-031 API objects and restores prior order actions.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DROP FUNCTION saas.abandoned_carts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.abandoned_carts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.abandoned_carts_mark_recovered(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint);
DROP FUNCTION saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text);
DROP FUNCTION saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.abandoned_carts_mutation_projection(uuid,uuid);
DROP FUNCTION saas.abandoned_carts_detail_projection(uuid,uuid);
DROP FUNCTION saas.abandoned_carts_projection(uuid,uuid);
DROP FUNCTION saas.abandoned_carts_json_timestamp(timestamptz);

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_now timestamptz,p_required_feature text,p_required_action text
)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL
     OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL
     OR p_required_action IS NULL OR p_required_action NOT IN (
       'orders.read','orders.manage','orders.fulfill','orders.payment','orders.note'
     ) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.stores AS store WHERE store.id=p_store_id AND store.status='active') THEN RETURN 'store_inactive'; END IF;
  SELECT membership.role INTO membership_role FROM saas.memberships AS membership
  WHERE membership.id=p_membership_id AND membership.store_id=p_store_id AND membership.principal_id=p_principal_id AND membership.status='active';
  IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM saas.subscriptions AS subscription
    JOIN saas.plans AS plan ON plan.id=subscription.plan_id AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
    WHERE subscription.store_id=p_store_id AND subscription.plan_id=p_plan_id AND subscription.plan_code=p_plan_code
      AND subscription.plan_version=p_plan_version AND subscription.status='active' AND subscription.valid_from<=p_now
      AND (subscription.valid_until IS NULL OR subscription.valid_until>p_now) AND plan.status='active'
      AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR plan.valid_until>p_now)
  ) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM (SELECT feature.feature_key FROM saas.plan_features AS feature
      WHERE feature.plan_id=p_plan_id AND feature.enabled ORDER BY feature.feature_ordinal) AS enabled_feature
    WHERE enabled_feature.feature_key=p_required_feature
  ) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT (
    membership_role IN ('store_owner','admin')
    OR (membership_role='editor' AND p_required_action IN ('orders.read','orders.fulfill','orders.note'))
    OR (membership_role='analyst' AND p_required_action='orders.read')
  ) THEN RETURN 'membership_denied'; END IF;
  RETURN NULL;
END
$function$;

COMMIT;
