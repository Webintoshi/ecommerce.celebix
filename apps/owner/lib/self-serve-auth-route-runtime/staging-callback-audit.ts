export type OwnerStagingCallbackAuditEvent = Readonly<{
  stage: "request_gate" | "callback" | "browser_claim" | "provider_rejection" | "handoff";
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
    });
    try { sink(line); }
    catch { /* Staging diagnostics are observational only. */ }
  };
}
