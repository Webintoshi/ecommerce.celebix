export type OwnerStagingCallbackAuditEvent = Readonly<{
  stage: "request_gate" | "callback" | "browser_claim" | "provider_rejection" | "handoff";
  outcome: "accepted" | "rejected" | "unavailable";
  completionKind?:
    | "tenant_created_session_pending" | "tenant_recovered_session_pending" | "tenant_already_created_session_pending"
    | "in_progress" | "commit_unknown" | "reconciliation_required" | "completion_state_unknown"
    | "restart_required" | "recovery_failed" | "recovery_absent" | "completion_failed" | "rejected";
  completionErrorCode?: string;
}>;

const SAFE_COMPLETION_CODES = new Set([
  "durable_authority_invalid", "registration_attempt_missing", "registration_workflow_conflict",
  "registration_workflow_invalid_transition", "registration_identity_not_consumed",
  "registration_verified_identity_conflict", "completion_persistence_failed", "tenant_transaction_failed",
  "invalid_input", "slug_conflict", "domain_conflict", "membership_conflict", "idempotency_mismatch",
  "identity_unverified",
]);
const SAFE_COMPLETION_KINDS = new Set([
  "tenant_created_session_pending", "tenant_recovered_session_pending", "tenant_already_created_session_pending",
  "in_progress", "commit_unknown", "reconciliation_required", "completion_state_unknown",
  "restart_required", "recovery_failed", "recovery_absent", "completion_failed", "rejected",
]);

export type OwnerStagingOidcAuditEvent = Readonly<{
  stage:
    | "token_response"
    | "jwks_response"
    | "id_token_verification"
    | "id_token_time_nonce"
    | "id_token_identity"
    | "id_token_audience";
  outcome: "accepted" | "rejected" | "unavailable";
}>;

type AuditSink = (line: string) => void;

function defaultSink(line: string): void {
  console.info(line);
}

export function createOwnerStagingCallbackAudit(
  sink: AuditSink = defaultSink,
): (event: OwnerStagingCallbackAuditEvent) => void {
  return (event) => {
    const line = JSON.stringify({
      schemaVersion: 1,
      event: "owner_staging_callback_audit",
      stage: event.stage,
      outcome: event.outcome,
      ...(event.stage === "callback" && event.completionKind && SAFE_COMPLETION_KINDS.has(event.completionKind)
        ? { completionKind: event.completionKind }
        : {}),
      ...(event.stage === "callback" && event.completionKind === "rejected" && event.completionErrorCode
        && SAFE_COMPLETION_CODES.has(event.completionErrorCode)
        ? { completionErrorCode: event.completionErrorCode }
        : {}),
    });
    try { sink(line); }
    catch { /* Staging diagnostics are observational only. */ }
  };
}

export function createOwnerStagingOidcAudit(
  sink: AuditSink = defaultSink,
): (event: OwnerStagingOidcAuditEvent) => void {
  return (event) => {
    const line = JSON.stringify({
      schemaVersion: 1,
      event: "owner_staging_oidc_audit",
      stage: event.stage,
      outcome: event.outcome,
    });
    try { sink(line); }
    catch { /* Staging diagnostics are observational only. */ }
  };
}
