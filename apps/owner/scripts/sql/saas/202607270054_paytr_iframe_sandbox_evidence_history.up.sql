BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.paytr_iframe_sandbox_evidence_history(
  p_success_operation_id uuid,
  p_decline_operation_id uuid,
  p_replay_operation_id uuid,
  p_timeout_operation_id uuid,
  p_status_operation_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE evidence jsonb;
BEGIN
  IF p_success_operation_id IS NULL
    OR p_decline_operation_id IS NULL
    OR p_replay_operation_id IS NULL
    OR p_timeout_operation_id IS NULL
    OR p_status_operation_id IS NULL
    OR p_replay_operation_id<>p_success_operation_id
    OR (
      SELECT pg_catalog.count(DISTINCT selector)=4
      FROM pg_catalog.unnest(ARRAY[
        p_success_operation_id,p_decline_operation_id,
        p_timeout_operation_id,p_status_operation_id
      ]) AS selector
    ) IS DISTINCT FROM true
  THEN
    RETURN QUERY SELECT 'incomplete'::text,NULL::jsonb;
    RETURN;
  END IF;

  WITH selected(kind,operation_id,ordinality) AS (
    VALUES
      ('success'::text,p_success_operation_id,1),
      ('decline'::text,p_decline_operation_id,2),
      ('replay'::text,p_replay_operation_id,3),
      ('timeout'::text,p_timeout_operation_id,4),
      ('status'::text,p_status_operation_id,5)
  ), authority AS (
    SELECT
      success_attempt.store_id,
      success_attempt.provider_config_id,
      success_attempt.provider_config_version,
      success_attempt.configuration_digest
    FROM saas.checkout_operations AS success_operation
    JOIN saas.checkout_payment_attempts AS success_attempt
      ON success_attempt.id=success_operation.attempt_id
      AND success_attempt.store_id=success_operation.store_id
    JOIN saas.checkout_provider_configs AS success_provider
      ON success_provider.store_id=success_attempt.store_id
      AND success_provider.id=success_attempt.provider_config_id
      AND success_provider.provider_key='paytr'
    WHERE success_operation.operation_id=p_success_operation_id
  ), raw_facts AS (
    SELECT
      selected.kind,
      selected.ordinality,
      operation.operation_id,
      operation.attempt_id,
      operation.operation_kind,
      operation.result_payload->>'status' AS result_status,
      operation.result_payload->>'testMode' AS operation_test_mode,
      operation.result_payload->>'totalAmount' AS replay_total_amount_text,
      operation.result_payload->>'paymentType' AS replay_payment_type,
      operation.payload_fingerprint,
      operation.committed_at,
      attempt.store_id,
      attempt.provider_config_id,
      attempt.provider_config_version,
      attempt.configuration_digest,
      attempt.status AS attempt_status,
      attempt.merchant_oid AS safe_provider_reference,
      attempt.created_at,
      attempt.expected_payment_amount AS amount_minor,
      attempt.currency,
      callback.callback_digest,
      callback.callback_status,
      reconciliation.payload_fingerprint AS reconciliation_digest,
      reconciliation.outcome AS reconciliation_outcome,
      EXISTS(
        SELECT 1
        FROM saas.checkout_operations AS unknown_operation
        WHERE unknown_operation.attempt_id=attempt.id
          AND unknown_operation.store_id=attempt.store_id
          AND unknown_operation.operation_kind='initiation_unknown'
      ) AS saw_unknown,
      EXISTS(
        SELECT 1
        FROM saas.checkout_operations AS reconciled_operation
        JOIN saas.checkout_reconciliation_receipts AS receipt
          ON receipt.operation_id=reconciled_operation.operation_id
          AND receipt.attempt_id=reconciled_operation.attempt_id
          AND receipt.store_id=reconciled_operation.store_id
        WHERE reconciled_operation.attempt_id=attempt.id
          AND reconciled_operation.store_id=attempt.store_id
          AND reconciled_operation.operation_kind='reconcile_success'
          AND reconciled_operation.result_payload->>'status'='success'
          AND receipt.outcome='succeeded'
      ) AS has_reconciled_captured,
      (
        SELECT pg_catalog.count(*)
        FROM saas.checkout_operations AS settlement
        WHERE settlement.attempt_id=attempt.id
          AND settlement.store_id=attempt.store_id
          AND settlement.operation_kind='settle_callback'
      )::integer AS success_settlement_count,
      (
        SELECT pg_catalog.count(*)
        FROM saas.checkout_callback_receipts AS receipt
        WHERE receipt.attempt_id=attempt.id
          AND receipt.store_id=attempt.store_id
      )::integer AS success_receipt_count,
      (
        SELECT pg_catalog.count(*)
        FROM saas.checkout_operations AS unknown_operation
        WHERE unknown_operation.attempt_id=attempt.id
          AND unknown_operation.store_id=attempt.store_id
          AND unknown_operation.operation_kind='initiation_unknown'
      )::integer AS timeout_unknown_count,
      (
        SELECT pg_catalog.count(*)
        FROM saas.checkout_operations AS reconciled_operation
        JOIN saas.checkout_reconciliation_receipts AS receipt
          ON receipt.operation_id=reconciled_operation.operation_id
          AND receipt.attempt_id=reconciled_operation.attempt_id
          AND receipt.store_id=reconciled_operation.store_id
        WHERE reconciled_operation.attempt_id=attempt.id
          AND reconciled_operation.store_id=attempt.store_id
          AND reconciled_operation.operation_kind='reconcile_success'
          AND reconciled_operation.result_payload->>'status'='success'
          AND receipt.outcome='succeeded'
      )::integer AS status_reconcile_count
    FROM selected
    JOIN saas.checkout_operations AS operation
      ON operation.operation_id=selected.operation_id
    JOIN saas.checkout_payment_attempts AS attempt
      ON attempt.id=operation.attempt_id
      AND attempt.store_id=operation.store_id
    JOIN saas.checkout_provider_configs AS provider
      ON provider.store_id=attempt.store_id
      AND provider.id=attempt.provider_config_id
      AND provider.provider_key='paytr'
    CROSS JOIN authority
    LEFT JOIN saas.checkout_callback_receipts AS callback
      ON callback.id=operation.operation_id
      AND callback.attempt_id=operation.attempt_id
      AND callback.store_id=operation.store_id
    LEFT JOIN saas.checkout_reconciliation_receipts AS reconciliation
      ON reconciliation.operation_id=operation.operation_id
      AND reconciliation.attempt_id=operation.attempt_id
      AND reconciliation.store_id=operation.store_id
    WHERE attempt.store_id=authority.store_id
      AND attempt.provider_config_id=authority.provider_config_id
      AND attempt.provider_config_version=authority.provider_config_version
      AND attempt.configuration_digest=authority.configuration_digest
  ), facts AS (
    SELECT
      raw_facts.*,
      CASE
        WHEN raw_facts.operation_test_mode~'^[0-9]+$'
          THEN raw_facts.operation_test_mode::integer
        WHEN raw_facts.kind='timeout' THEN (
          SELECT CASE
            WHEN reconciled_operation.result_payload->>'testMode'~'^[0-9]+$'
              THEN (reconciled_operation.result_payload->>'testMode')::integer
            ELSE NULL
          END
          FROM saas.checkout_operations AS reconciled_operation
          JOIN saas.checkout_reconciliation_receipts AS receipt
            ON receipt.operation_id=reconciled_operation.operation_id
            AND receipt.attempt_id=reconciled_operation.attempt_id
            AND receipt.store_id=reconciled_operation.store_id
          WHERE reconciled_operation.attempt_id=raw_facts.attempt_id
            AND reconciled_operation.store_id=raw_facts.store_id
            AND reconciled_operation.operation_kind='reconcile_success'
            AND reconciled_operation.result_payload->>'status'='success'
            AND receipt.outcome='succeeded'
          ORDER BY reconciled_operation.committed_at,reconciled_operation.operation_id
          LIMIT 1
        )
        ELSE NULL
      END AS test_mode,
      CASE
        WHEN raw_facts.replay_total_amount_text~'^[0-9]{1,16}$'
          THEN raw_facts.replay_total_amount_text::bigint
        ELSE NULL
      END AS replay_total_amount,
      CASE raw_facts.kind
        WHEN 'success' THEN raw_facts.callback_digest
        WHEN 'decline' THEN raw_facts.callback_digest
        WHEN 'replay' THEN raw_facts.callback_digest
        WHEN 'status' THEN raw_facts.reconciliation_digest
        ELSE raw_facts.payload_fingerprint
      END AS evidence_callback_digest,
      CASE
        WHEN raw_facts.kind='status' THEN raw_facts.has_reconciled_captured
        ELSE false
      END AS saw_reconciled_captured
    FROM raw_facts
  ), projected AS (
    SELECT
      facts.*,
      pg_catalog.jsonb_build_object(
        'kind',facts.kind,
        'operationId',facts.operation_id,
        'attemptId',facts.attempt_id,
        'operationKind',facts.operation_kind,
        'resultStatus',facts.result_status,
        'attemptStatus',facts.attempt_status,
        'testMode',facts.test_mode,
        'replayed',false,
        'safeProviderReference',facts.safe_provider_reference,
        'callbackDigest',facts.evidence_callback_digest,
        'startedAt',pg_catalog.to_char(
          facts.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'completedAt',pg_catalog.to_char(
          facts.committed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'amountMinor',facts.amount_minor,
        'currency',facts.currency,
        'sawUnknown',facts.saw_unknown,
        'sawReconciledCaptured',facts.saw_reconciled_captured
      ) AS fact_payload
    FROM facts
  ), summary AS (
    SELECT
      pg_catalog.count(*)::integer AS fact_count,
      pg_catalog.count(*) FILTER (WHERE kind='success')::integer AS success_count,
      pg_catalog.count(*) FILTER (WHERE kind='decline')::integer AS decline_count,
      pg_catalog.count(*) FILTER (WHERE kind='replay')::integer AS replay_count,
      pg_catalog.count(*) FILTER (WHERE kind='timeout')::integer AS timeout_count,
      pg_catalog.count(*) FILTER (WHERE kind='status')::integer AS status_count,
      (pg_catalog.array_agg(attempt_id ORDER BY ordinality)
        FILTER (WHERE kind='success'))[1] AS success_attempt_id,
      (pg_catalog.array_agg(attempt_id ORDER BY ordinality)
        FILTER (WHERE kind='decline'))[1] AS decline_attempt_id,
      (pg_catalog.array_agg(attempt_id ORDER BY ordinality)
        FILTER (WHERE kind='timeout'))[1] AS timeout_attempt_id,
      (pg_catalog.array_agg(attempt_id ORDER BY ordinality)
        FILTER (WHERE kind='status'))[1] AS status_attempt_id,
      (pg_catalog.array_agg(success_settlement_count ORDER BY ordinality)
        FILTER (WHERE kind='success'))[1] AS success_settlement_count,
      (pg_catalog.array_agg(success_receipt_count ORDER BY ordinality)
        FILTER (WHERE kind='success'))[1] AS success_receipt_count,
      (pg_catalog.array_agg(timeout_unknown_count ORDER BY ordinality)
        FILTER (WHERE kind='timeout'))[1] AS timeout_unknown_count,
      (pg_catalog.array_agg(status_reconcile_count ORDER BY ordinality)
        FILTER (WHERE kind='status'))[1] AS status_reconcile_count,
      (pg_catalog.array_agg(safe_provider_reference ORDER BY ordinality)
        FILTER (WHERE kind='success'))[1] AS replay_merchant_oid,
      (pg_catalog.array_agg(replay_total_amount ORDER BY ordinality)
        FILTER (WHERE kind='success'))[1] AS replay_total_amount,
      (pg_catalog.array_agg(replay_payment_type ORDER BY ordinality)
        FILTER (WHERE kind='success'))[1] AS replay_payment_type,
      pg_catalog.bool_and(
        CASE kind
          WHEN 'success' THEN
            operation_kind='settle_callback'
            AND result_status='success'
            AND attempt_status='succeeded'
            AND test_mode=1
            AND callback_status='success'
            AND callback_digest IS NOT NULL
            AND replay_total_amount BETWEEN amount_minor AND 9007199254740991
            AND replay_payment_type IN('card','eft')
            AND NOT saw_unknown
            AND NOT saw_reconciled_captured
          WHEN 'decline' THEN
            operation_kind='settle_callback'
            AND result_status='failed'
            AND attempt_status='failed'
            AND test_mode=1
            AND callback_status='failed'
            AND callback_digest IS NOT NULL
            AND NOT saw_unknown
            AND NOT saw_reconciled_captured
          WHEN 'replay' THEN
            operation_id=p_success_operation_id
            AND operation_kind='settle_callback'
            AND result_status='success'
            AND attempt_status='succeeded'
            AND test_mode=1
            AND callback_status='success'
            AND callback_digest IS NOT NULL
            AND NOT saw_unknown
            AND NOT saw_reconciled_captured
          WHEN 'timeout' THEN
            operation_kind='initiation_unknown'
            AND result_status='initiation_unknown'
            AND attempt_status='succeeded'
            AND test_mode=1
            AND saw_unknown
            AND NOT saw_reconciled_captured
          WHEN 'status' THEN
            operation_kind='reconcile_success'
            AND result_status='success'
            AND attempt_status='succeeded'
            AND test_mode=1
            AND reconciliation_outcome='succeeded'
            AND reconciliation_digest IS NOT NULL
            AND saw_unknown
            AND saw_reconciled_captured
          ELSE false
        END
        AND safe_provider_reference~'^[a-f0-9]{32}$'
        AND evidence_callback_digest~'^[a-f0-9]{64}$'
        AND amount_minor BETWEEN 1 AND 8500000000000000
        AND currency='TRY'
        AND committed_at>=created_at
      ) AS facts_valid,
      pg_catalog.jsonb_agg(fact_payload ORDER BY ordinality) AS facts_payload
    FROM projected
  )
  SELECT pg_catalog.jsonb_build_object(
    'successSettlementCount',summary.success_settlement_count,
    'successReceiptCount',summary.success_receipt_count,
    'replayInput',pg_catalog.jsonb_build_object(
      'merchantOid',summary.replay_merchant_oid,
      'totalAmount',summary.replay_total_amount,
      'paymentType',summary.replay_payment_type
    ),
    'facts',summary.facts_payload
  ) INTO evidence
  FROM summary
  WHERE summary.fact_count=5
    AND summary.success_count=1
    AND summary.decline_count=1
    AND summary.replay_count=1
    AND summary.timeout_count=1
    AND summary.status_count=1
    AND summary.facts_valid
    AND summary.success_attempt_id<>summary.decline_attempt_id
    AND summary.success_attempt_id<>summary.timeout_attempt_id
    AND summary.decline_attempt_id<>summary.timeout_attempt_id
    AND summary.status_attempt_id=summary.timeout_attempt_id
    AND summary.success_settlement_count=1
    AND summary.success_receipt_count=1
    AND summary.timeout_unknown_count=1
    AND summary.status_reconcile_count=1
    AND summary.replay_merchant_oid~'^[a-f0-9]{32}$'
    AND summary.replay_total_amount BETWEEN 1 AND 9007199254740991
    AND summary.replay_payment_type IN('card','eft');

  IF evidence IS NULL THEN
    RETURN QUERY SELECT 'incomplete'::text,NULL::jsonb;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'found'::text,evidence;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT 'incomplete'::text,NULL::jsonb;
END
$function$;

REVOKE ALL ON FUNCTION
  saas.paytr_iframe_sandbox_evidence_history(uuid,uuid,uuid,uuid,uuid)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.paytr_iframe_sandbox_evidence_history(uuid,uuid,uuid,uuid,uuid)
TO celebix_saas_app;

COMMIT;
