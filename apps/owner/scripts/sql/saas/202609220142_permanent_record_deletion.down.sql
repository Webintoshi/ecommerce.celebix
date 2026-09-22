BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM saas.record_deletion_operations) THEN
    RAISE EXCEPTION 'PERMANENT_RECORD_DELETION_ROLLBACK_BLOCKED';
  END IF;
END
$guard$;

DROP TRIGGER record_deletion_operations_immutable ON saas.record_deletion_operations;
DROP FUNCTION saas.delete_order_recover(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text);
DROP FUNCTION saas.order_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);

CREATE OR REPLACE FUNCTION saas.guard_order_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN RAISE EXCEPTION 'ORDER_EVENT_IMMUTABLE'; END
$function$;
CREATE OR REPLACE FUNCTION saas.guard_order_operation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN RAISE EXCEPTION 'ORDER_OPERATION_IMMUTABLE'; END
$function$;
CREATE OR REPLACE FUNCTION saas.order_archive_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN RAISE EXCEPTION 'ORDER_ARCHIVE_AUDIT_IMMUTABLE'; END
$function$;

DROP FUNCTION saas.permanent_order_deletion_context(uuid,uuid);
DROP FUNCTION saas.record_deletion_operation_replay(uuid, uuid, text, uuid, text);
DROP FUNCTION saas.record_deletion_operation_lock(uuid, uuid);
DROP FUNCTION saas.guard_record_deletion_operation_immutable();
DROP TABLE saas.record_deletion_operations;

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_required_feature text,p_required_action text
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL
    OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL
    OR p_required_action IS NULL OR p_required_action NOT IN (
      'orders.read','orders.manage','orders.fulfill','orders.payment','orders.note','shipping.read','shipping.manage',
      'carts.read','carts.manage','customers.read','customers.manage','customers.archive',
      'catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.import','catalog_admin.moderate',
      'promotions.read','promotions.manage','promotions.archive','content.read','content.manage','content.archive',
      'marketing.read','marketing.manage','configuration.read','configuration.manage','configuration.archive',
      'integrations.read','integrations.manage','analytics.read','inventory.read','inventory.manage',
      'purchasing.read','purchasing.manage','pricing.read','pricing.manage'
    ) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores store_row WHERE store_row.id=p_store_id AND store_row.status='active')
  THEN RETURN 'store_inactive'; END IF;
  SELECT membership.role INTO membership_role FROM saas.memberships membership
  WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
    AND membership.principal_id=p_principal_id AND membership.status='active';
  IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.subscriptions subscription
    JOIN saas.plans plan ON plan.id=subscription.plan_id AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
    WHERE subscription.store_id=p_store_id AND subscription.plan_id=p_plan_id
      AND subscription.plan_code=p_plan_code AND subscription.plan_version=p_plan_version
      AND subscription.status='active' AND subscription.valid_from<=p_now
      AND (subscription.valid_until IS NULL OR subscription.valid_until>p_now)
      AND plan.status='active' AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR plan.valid_until>p_now)
  ) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.plan_features feature
    WHERE feature.plan_id=p_plan_id AND feature.enabled AND feature.feature_key=p_required_feature
  ) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT (
    membership_role IN ('store_owner','admin')
    OR (membership_role='editor' AND p_required_action IN (
      'orders.read','orders.fulfill','orders.note','shipping.read','shipping.manage','carts.read','customers.read',
      'customers.manage','catalog_admin.read','catalog_admin.manage','promotions.read','content.read','content.manage',
      'marketing.read','configuration.read','integrations.read','analytics.read','inventory.read','inventory.manage',
      'purchasing.read','purchasing.manage','pricing.read'
    ))
    OR (membership_role='analyst' AND p_required_action IN (
      'orders.read','shipping.read','carts.read','customers.read','catalog_admin.read','promotions.read','content.read',
      'marketing.read','configuration.read','integrations.read','analytics.read','inventory.read','purchasing.read','pricing.read'
    ))
  ) THEN RETURN 'membership_denied'; END IF;
  RETURN NULL;
END
$function$;

COMMIT;
