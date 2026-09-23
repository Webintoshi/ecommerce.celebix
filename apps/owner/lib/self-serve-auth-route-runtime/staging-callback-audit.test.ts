import assert from "node:assert/strict";
import test from "node:test";

import { createOwnerStagingCallbackAudit } from "./staging-callback-audit.ts";

test("staging callback audit emits only allowlisted diagnostic fields", () => {
  const lines: string[] = [];
  const audit = createOwnerStagingCallbackAudit((line) => lines.push(line));
  audit({
    stage: "callback",
    outcome: "rejected",
    completionKind: "rejected",
    completionErrorCode: "tenant_transaction_failed",
    secret: "do-not-log",
  } as Parameters<typeof audit>[0]);
  assert.deepEqual(JSON.parse(lines[0] ?? ""), {
    schemaVersion: 1,
    event: "owner_staging_callback_audit",
    stage: "callback",
    outcome: "rejected",
    completionKind: "rejected",
    completionErrorCode: "tenant_transaction_failed",
  });
  assert.doesNotMatch(lines[0] ?? "", /do-not-log/);
  audit({ stage: "callback", outcome: "rejected", completionKind: "private-value" } as unknown as Parameters<typeof audit>[0]);
  assert.equal(JSON.parse(lines[1] ?? "").completionKind, undefined);
});
