-- ATLAS-ORDERS-QA-CLEANUP: staging-only, exact-ID, dry-run by default.
-- Run with -v apply=1 only after every gate succeeds. The current staging
-- schema intentionally rejects these records as immutable history; do not
-- bypass that guard, disable triggers, or broaden this allowlist.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif
\if :{?expected_database}
\else
  \set expected_database celebix_saas_staging_auth01
\endif

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE atlas_orders_qa_cleanup_config(
  store_id uuid PRIMARY KEY,
  store_slug text NOT NULL,
  expected_database text NOT NULL
) ON COMMIT DROP;

INSERT INTO atlas_orders_qa_cleanup_config VALUES (
  'a828862c-4cc1-475a-89cc-5fbee31eb43f',
  'guzide-kuyumcu-4',
  :'expected_database'
);

CREATE TEMP TABLE atlas_orders_qa_cleanup_targets(
  order_id uuid PRIMARY KEY,
  order_number text NOT NULL,
  created_at timestamptz NOT NULL,
  total_cents bigint NOT NULL,
  draft_id uuid NOT NULL UNIQUE,
  draft_created_at timestamptz NOT NULL,
  expected_event_count bigint NOT NULL,
  expected_operation_count bigint NOT NULL
) ON COMMIT DROP;

INSERT INTO atlas_orders_qa_cleanup_targets VALUES
  (
    'af1982e0-c3f2-5f39-8509-8e0250394b13',
    'MAN-af1982e0c3f25f398509',
    '2026-08-01T15:36:36.656Z',
    9094500,
    '195bbbd8-f7f6-46ca-a83a-6e15e30eac23',
    '2026-08-01T15:36:36.269Z',
    2,
    1
  ),
  (
    '0e8bca85-e87c-5a82-8a4e-d615b6d4df29',
    'MAN-0e8bca85e87c5a828a4e',
    '2026-08-01T15:37:26.880Z',
    9094500,
    '3355619c-9e3c-4296-8d7e-8a6848cf54eb',
    '2026-08-01T15:37:26.682Z',
    3,
    2
  );

DO $atlas_gate$
DECLARE
  config atlas_orders_qa_cleanup_config%ROWTYPE;
  dependency record;
  dependency_count bigint;
BEGIN
  SELECT * INTO STRICT config FROM atlas_orders_qa_cleanup_config;

  IF current_database() <> config.expected_database THEN
    RAISE EXCEPTION 'atlas_orders_qa_cleanup_wrong_database';
  END IF;

  IF (SELECT count(*) FROM saas.stores WHERE id=config.store_id AND slug=config.store_slug) <> 1 THEN
    RAISE EXCEPTION 'atlas_orders_qa_cleanup_store_mismatch';
  END IF;

  PERFORM order_row.id
  FROM saas.orders AS order_row
  JOIN atlas_orders_qa_cleanup_targets AS target ON target.order_id=order_row.id
  WHERE order_row.store_id=config.store_id
  ORDER BY order_row.id
  FOR UPDATE OF order_row;

  IF (SELECT count(*) FROM saas.orders AS order_row JOIN atlas_orders_qa_cleanup_targets AS target ON target.order_id=order_row.id WHERE order_row.store_id=config.store_id) <> 2 THEN
    RAISE EXCEPTION 'atlas_orders_qa_cleanup_allowlist_mismatch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM atlas_orders_qa_cleanup_targets AS target
    LEFT JOIN saas.orders AS order_row
      ON order_row.store_id=config.store_id AND order_row.id=target.order_id
    WHERE order_row.id IS NULL
       OR order_row.order_number <> target.order_number
       OR order_row.source <> 'manual'
       OR order_row.status <> 'confirmed'
       OR order_row.payment_status <> 'pending'
       OR order_row.total_cents <> target.total_cents
       OR order_row.created_at <> target.created_at
       OR order_row.customer_id IS NOT NULL
       OR order_row.quick_order_link_id IS NOT NULL
       OR order_row.paid_at IS NOT NULL
       OR order_row.refunded_at IS NOT NULL
       OR order_row.customer_name !~* '(test|qa|atlas|mira|deneme|örnek|ornek)'
       OR order_row.customer_email !~* '(^|@)(example|test)|[.]test$|@(invalid|localhost)$'
  ) THEN
    RAISE EXCEPTION 'atlas_orders_qa_cleanup_order_snapshot_changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM atlas_orders_qa_cleanup_targets AS target
    WHERE (SELECT count(*) FROM saas.order_items AS item WHERE item.store_id=config.store_id AND item.order_id=target.order_id) <> 1
       OR (SELECT count(*) FROM saas.order_events AS event WHERE event.store_id=config.store_id AND event.order_id=target.order_id) <> target.expected_event_count
       OR (SELECT count(*) FROM saas.order_operations AS operation WHERE operation.store_id=config.store_id AND operation.order_id=target.order_id) <> target.expected_operation_count
  ) THEN
    RAISE EXCEPTION 'atlas_orders_qa_cleanup_lifecycle_count_changed';
  END IF;

  PERFORM draft.id
  FROM saas.order_drafts AS draft
  JOIN atlas_orders_qa_cleanup_targets AS target ON target.draft_id=draft.id
  WHERE draft.store_id=config.store_id
  ORDER BY draft.id
  FOR UPDATE OF draft;

  IF EXISTS (
    SELECT 1
    FROM atlas_orders_qa_cleanup_targets AS target
    LEFT JOIN saas.order_drafts AS draft
      ON draft.store_id=config.store_id
     AND draft.id=target.draft_id
     AND draft.converted_order_id=target.order_id
    WHERE draft.id IS NULL
       OR draft.status <> 'converted'
       OR draft.adjust_inventory
       OR draft.total_cents <> target.total_cents
       OR draft.created_at <> target.draft_created_at
       OR draft.customer_name !~* '(test|qa|atlas|mira|deneme|örnek|ornek)'
       OR draft.customer_email !~* '(^|@)(example|test)|[.]test$|@(invalid|localhost)$'
       OR draft.note !~* '(test|qa|atlas|mira|deneme|örnek|ornek)'
       OR (SELECT count(*) FROM saas.order_draft_lines AS line WHERE line.store_id=config.store_id AND line.draft_id=target.draft_id) <> 1
       OR (SELECT count(*) FROM saas.order_draft_operations AS operation WHERE operation.store_id=config.store_id AND operation.draft_id=target.draft_id) <> 3
  ) THEN
    RAISE EXCEPTION 'atlas_orders_qa_cleanup_draft_snapshot_changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger_row
    WHERE trigger_row.tgrelid='saas.order_draft_operations'::regclass
      AND NOT trigger_row.tgisinternal
      AND (trigger_row.tgtype & 8)=8
  ) THEN
    RAISE EXCEPTION 'atlas_orders_qa_cleanup_immutable_history';
  END IF;

  FOR dependency IN
    SELECT column_info.table_name,column_info.column_name
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema='saas'
      AND column_info.column_name IN ('order_id','linked_order_id','recovered_order_id','converted_order_id','settled_order_id')
      AND column_info.table_name NOT IN ('order_items','order_events','order_operations','order_drafts')
      AND EXISTS (
        SELECT 1 FROM information_schema.columns AS store_column
        WHERE store_column.table_schema='saas'
          AND store_column.table_name=column_info.table_name
          AND store_column.column_name='store_id'
      )
    ORDER BY column_info.table_name,column_info.column_name
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM saas.%I WHERE store_id=$1 AND %I = ANY($2)',
      dependency.table_name,
      dependency.column_name
    )
    INTO dependency_count
    USING config.store_id,(SELECT array_agg(order_id ORDER BY order_id) FROM atlas_orders_qa_cleanup_targets);

    IF dependency_count <> 0 THEN
      RAISE EXCEPTION 'atlas_orders_qa_cleanup_forbidden_dependency:%:%', dependency.table_name, dependency.column_name;
    END IF;
  END LOOP;
END
$atlas_gate$;

SELECT
  target.order_id::text,
  target.order_number,
  'manual QA draft + exact timestamp + QA identity markers' AS test_evidence,
  format('items=1 events=%s operations=%s draft=1 draft_lines=1 draft_operations=3',target.expected_event_count,target.expected_operation_count) AS dependencies,
  CASE WHEN :apply::integer=1 THEN 'DELETE' ELSE 'DRY_RUN_DELETE' END AS proposed_action,
  'no payment/refund/shipment/inventory/provider/email/outbox dependency' AS protection_reason
FROM atlas_orders_qa_cleanup_targets AS target
ORDER BY target.created_at,target.order_id;

\if :apply
DO $atlas_delete$
DECLARE
  config atlas_orders_qa_cleanup_config%ROWTYPE;
  affected bigint;
BEGIN
  SELECT * INTO STRICT config FROM atlas_orders_qa_cleanup_config;

  DELETE FROM saas.order_draft_operations
  WHERE store_id=config.store_id
    AND draft_id IN (SELECT draft_id FROM atlas_orders_qa_cleanup_targets);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 6 THEN RAISE EXCEPTION 'atlas_orders_qa_cleanup_delete_count:order_draft_operations:%',affected; END IF;

  DELETE FROM saas.order_draft_lines
  WHERE store_id=config.store_id
    AND draft_id IN (SELECT draft_id FROM atlas_orders_qa_cleanup_targets);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'atlas_orders_qa_cleanup_delete_count:order_draft_lines:%',affected; END IF;

  DELETE FROM saas.order_drafts
  WHERE store_id=config.store_id
    AND id IN (SELECT draft_id FROM atlas_orders_qa_cleanup_targets);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'atlas_orders_qa_cleanup_delete_count:order_drafts:%',affected; END IF;

  DELETE FROM saas.order_operations
  WHERE store_id=config.store_id
    AND order_id IN (SELECT order_id FROM atlas_orders_qa_cleanup_targets);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 3 THEN RAISE EXCEPTION 'atlas_orders_qa_cleanup_delete_count:order_operations:%',affected; END IF;

  DELETE FROM saas.order_events
  WHERE store_id=config.store_id
    AND order_id IN (SELECT order_id FROM atlas_orders_qa_cleanup_targets);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 5 THEN RAISE EXCEPTION 'atlas_orders_qa_cleanup_delete_count:order_events:%',affected; END IF;

  DELETE FROM saas.order_items
  WHERE store_id=config.store_id
    AND order_id IN (SELECT order_id FROM atlas_orders_qa_cleanup_targets);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'atlas_orders_qa_cleanup_delete_count:order_items:%',affected; END IF;

  DELETE FROM saas.orders
  WHERE store_id=config.store_id
    AND id IN (SELECT order_id FROM atlas_orders_qa_cleanup_targets);
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 2 THEN RAISE EXCEPTION 'atlas_orders_qa_cleanup_delete_count:orders:%',affected; END IF;
END
$atlas_delete$;
COMMIT;
\else
ROLLBACK;
\endif
