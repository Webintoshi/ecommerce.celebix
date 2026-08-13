import assert from "node:assert/strict";
import test from "node:test";

import {
  MerchantProviderWorkflowRepositoryError,
  PostgresMerchantProviderWorkflowRepository,
} from "./index.ts";

const JOB = "71000000-0000-4000-8000-000000000001";
const RECORD = "70000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const PROFILE = "40000000-0000-4000-8000-000000000005";
const LEASE = "73000000-0000-4000-8000-000000000001";
const OPERATION = "74000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-25T12:00:00.000Z");
const LATER = new Date("2026-07-25T12:05:00.000Z");
const AUTHORITY = Object.freeze({ environment: "test" as const, adapterVersion: 1, evidenceDigest: `sha256:${"a".repeat(64)}` });

function sealed() {
  return { algorithm: "A256GCM", ciphertext: "b3BhcXVl", iv: "AQEBAQEBAQEBAQEB", keyId: "provider.current", tag: "AgICAgICAgICAgICAgICAg", version: 1 };
}

function validationClaim() {
  return {
    profileId: PROFILE,
    storeId: STORE,
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    publicConfig: { environment: "test", merchantId: "123456" },
    executionAuthority: AUTHORITY,
    sealedCredentials: sealed(),
    credentialVersion: 2,
    profileVersion: 3,
    leaseId: LEASE,
    leaseOwner: "worker.fixture",
    leaseExpiresAt: LATER.toISOString(),
  };
}

function verificationClaim() {
  return {
    profileId: PROFILE,
    storeId: STORE,
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    publicConfig: { environment: "test" },
    validationIdentity: { environment: "test", adapterVersion: 1 },
    sealedCredentials: sealed(),
    credentialVersion: 2,
    profileVersion: 3,
    leaseId: LEASE,
    leaseOwner: "worker.fixture",
    leaseExpiresAt: LATER.toISOString(),
  };
}

function verificationProfile(status = "active") {
  return {
    id: PROFILE,
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    publicConfig: { environment: "test" },
    maskedAccountReference: "iyzico merchant",
    status,
    credentialVersion: 2,
    version: 4,
    lastValidatedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function workflowClaim() {
  return {
    jobId: JOB,
    recordId: RECORD,
    storeId: STORE,
    profileId: PROFILE,
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    publicConfig: { accountReference: "merchant-42" },
    sealedCredentials: sealed(),
    credentialVersion: 2,
    jobVersion: 3,
    leaseId: LEASE,
    leaseOwner: "worker.fixture",
    leaseExpiresAt: LATER.toISOString(),
    attempt: 1,
  };
}

function job(status = "provider_outcome_unknown", version = 4) {
  return {
    id: JOB,
    recordId: RECORD,
    recordKind: "marketplace_connection",
    action: "synchronization",
    status,
    profileId: PROFILE,
    providerCode: "fixture_provider",
    credentialVersion: 2,
    attempt: 1,
    safeProviderReference: null,
    outcomeCode: status === "leased" ? null : "transport_outcome_unknown",
    version,
    requestedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

function profile(status = "active") {
  return {
    id: PROFILE,
    providerCode: "fixture_provider",
    capability: "marketplace_sync",
    publicConfig: { accountReference: "merchant-42" },
    maskedAccountReference: "••••nt-42",
    status,
    credentialVersion: 2,
    version: 4,
    lastValidatedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;
class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  readonly responder: Responder;
  constructor(responder: Responder = () => []) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release(value?: unknown) { this.releases.push(value); }
}
class Pool {
  private index = 0;
  readonly clients: Client[];
  constructor(clients: Client[]) { this.clients = clients; }
  async connect() { const selected = this.clients[this.index++]; if (!selected) throw new Error("checkout"); return selected; }
}

function repository(pool: Pool, audit: string[] = [], uuids = [LEASE, OPERATION]) {
  let index = 0;
  return new PostgresMerchantProviderWorkflowRepository({
    pool,
    role: "celebix_saas_workflow",
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
    uuid: () => uuids[index++] ?? OPERATION,
    audit(event) { audit.push(event.type); },
  });
}

function call(client: Client, name: string) {
  const selected = client.calls.find((entry) => entry.text.includes(`saas.${name}`));
  assert.ok(selected);
  return selected;
}

test("workflow claim returns one credential snapshot and no raw secret", async () => {
  const client = new Client((text) => text.includes("merchant_provider_claim") ? [{ outcome: "claimed", result_payload: workflowClaim() }] : []);
  const claim = await repository(new Pool([client])).claim({ workerId: "worker.fixture", now: NOW, leaseExpiresAt: LATER });
  assert.equal(claim.kind, "claimed");
  if (claim.kind !== "claimed") assert.fail("claim expected");
  assert.equal(claim.job.credentialVersion, 2);
  assert.equal(claim.job.leaseId, LEASE);
  assert.doesNotMatch(JSON.stringify(claim), /apiSecret|password|token/);
  assert.equal(call(client, "merchant_provider_claim").values[3], LEASE);
});

test("profile validation claim binds lease and credential authority", async () => {
  const client = new Client((text) => text.includes("merchant_provider_profile_claim_validation") ? [{ outcome: "claimed", result_payload: validationClaim() }] : []);
  const claim = await repository(new Pool([client])).claimProfileValidation({ workerId: "worker.fixture", providerCode: "paytr_iframe", capability: "payment_processing", executionAuthority: AUTHORITY, now: NOW, leaseExpiresAt: LATER });
  assert.equal(claim.kind, "claimed");
  if (claim.kind !== "claimed") assert.fail("validation claim expected");
  assert.equal(claim.profile.credentialVersion, 2);
  assert.equal(claim.profile.leaseOwner, "worker.fixture");
  assert.doesNotMatch(JSON.stringify(claim.profile.publicConfig), /secret|token|password/i);
});

test("profile verification claim binds validation identity without checkout evidence", async () => {
  const client = new Client((text) => text.includes("merchant_provider_profile_claim_verification")
    ? [{ outcome: "claimed", result_payload: verificationClaim() }]
    : []);
  const claim = await repository(new Pool([client])).claimProfileVerification({
    workerId: "worker.fixture",
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    validationIdentity: { environment: "test", adapterVersion: 1 },
    now: NOW,
    leaseExpiresAt: LATER,
  });
  assert.equal(claim.kind, "claimed");
  if (claim.kind !== "claimed") assert.fail("verification claim expected");
  assert.deepEqual(claim.profile.validationIdentity, { environment: "test", adapterVersion: 1 });
  assert.doesNotMatch(JSON.stringify(claim.profile), /evidenceDigest|executionAuthority/);
  assert.deepEqual(call(client, "merchant_provider_profile_claim_verification").values, [
    "worker.fixture", "iyzico_iframe", "payment_processing", "test", 1, NOW, LATER, LEASE,
  ]);
});

test("empty workflow claims commit a frozen empty result", async () => {
  const client = new Client((text) => text.includes("merchant_provider_claim") ? [{ outcome: "empty", result_payload: null }] : []);
  const result = await repository(new Pool([client])).claim({ workerId: "worker.fixture", now: NOW, leaseExpiresAt: LATER });
  assert.deepEqual(result, { kind: "empty" });
  assert.equal(Object.isFrozen(result), true);
});

test("profile validation result binds every lease field", async () => {
  const client = new Client((text) => text.includes("merchant_provider_profile_mark_validation") ? [{ outcome: "validated", result_payload: profile() }] : []);
  const result = await repository(new Pool([client])).markProfileValidation({ profileId: PROFILE, providerCode: "paytr_iframe", capability: "payment_processing", executionAuthority: AUTHORITY, credentialVersion: 2, profileVersion: 3, leaseId: LEASE, leaseOwner: "worker.fixture", now: NOW, outcome: "validated", outcomeCode: "validated" });
  assert.equal(result.status, "active");
  assert.deepEqual(call(client, "merchant_provider_profile_mark_validation").values.slice(0, 6), [PROFILE, "paytr_iframe", "payment_processing", "test", 1, AUTHORITY.evidenceDigest]);
});

test("profile verification result marks the exact validation identity without evidence", async () => {
  const client = new Client((text) => text.includes("merchant_provider_profile_mark_verification")
    ? [{ outcome: "validated", result_payload: verificationProfile() }]
    : []);
  const result = await repository(new Pool([client])).markProfileVerification({
    profileId: PROFILE,
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    validationIdentity: { environment: "test", adapterVersion: 1 },
    credentialVersion: 2,
    profileVersion: 3,
    leaseId: LEASE,
    leaseOwner: "worker.fixture",
    now: NOW,
    outcome: "validated",
    outcomeCode: "validated",
  });
  assert.equal(result.status, "active");
  assert.deepEqual(call(client, "merchant_provider_profile_mark_verification").values.slice(0, 5), [
    PROFILE, "iyzico_iframe", "payment_processing", "test", 1,
  ]);
  assert.equal(call(client, "merchant_provider_profile_mark_verification").values.some(
    (value) => typeof value === "string" && value.startsWith("sha256:"),
  ), false);
});

test("PayTR verification uses the atomic merchant activation boundary without client authority", async () => {
  const client = new Client((text) => text.includes("paytr_merchant_self_service_mark_verification")
    ? [{ outcome: "validated", result_payload: verificationProfile() }]
    : []);
  const result = await repository(new Pool([client])).markProfileVerification({
    profileId: PROFILE,
    providerCode: "paytr_iframe",
    capability: "payment_processing",
    validationIdentity: { environment: "live", adapterVersion: 1 },
    credentialVersion: 2,
    profileVersion: 3,
    leaseId: LEASE,
    leaseOwner: "worker.fixture",
    now: NOW,
    outcome: "validated",
    outcomeCode: "validated",
  });

  assert.equal(result.status, "active");
  const activation = call(client, "paytr_merchant_self_service_mark_verification");
  assert.deepEqual(activation.values.slice(0, 5), [
    PROFILE, "paytr_iframe", "payment_processing", "live", 1,
  ]);
  assert.equal(activation.values.length, 12);
  assert.equal(activation.values.some(
    (value) => typeof value === "string" && value.startsWith("sha256:"),
  ), false);
  assert.equal(client.calls.some(
    ({ text }) => text.includes("merchant_provider_profile_mark_verification")
      && !text.includes("paytr_merchant_self_service_mark_verification"),
  ), false);
});

test("profile verification unavailability releases the lease while preserving pending validation", async () => {
  const client = new Client((text) => text.includes("merchant_provider_profile_mark_verification")
    ? [{ outcome: "unavailable", result_payload: verificationProfile("pending_validation") }]
    : []);
  const result = await repository(new Pool([client])).markProfileVerification({
    profileId: PROFILE,
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    validationIdentity: { environment: "test", adapterVersion: 1 },
    credentialVersion: 2,
    profileVersion: 3,
    leaseId: LEASE,
    leaseOwner: "worker.fixture",
    now: NOW,
    outcome: "unavailable",
    outcomeCode: "validation_unavailable",
  });
  assert.equal(result.status, "pending_validation");
  assert.deepEqual(call(client, "merchant_provider_profile_mark_verification").values.slice(-2), [
    "unavailable", "validation_unavailable",
  ]);
});

test("verification claim commit ambiguity audits safely and replays the exact lease once", async () => {
  let writerCommits = 0;
  const projected = verificationClaim();
  const writer = new Client((text) => {
    if (text.includes("merchant_provider_profile_claim_verification")) {
      return [{ outcome: "claimed", result_payload: projected }];
    }
    if (text === "COMMIT" && writerCommits++ === 0) {
      throw new Error("raw-provider-detail-must-not-escape");
    }
    return [];
  });
  const recovery = new Client((text) => text.includes("merchant_provider_profile_claim_verification")
    ? [{ outcome: "operation_replayed", result_payload: projected }]
    : []);
  const audit: string[] = [];

  const result = await repository(new Pool([writer, recovery]), audit).claimProfileVerification({
    workerId: "worker.fixture",
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    validationIdentity: { environment: "test", adapterVersion: 1 },
    now: NOW,
    leaseExpiresAt: LATER,
  });

  assert.equal(result.kind, "claimed");
  assert.equal(writer.calls.filter((entry) => entry.text.includes("merchant_provider_profile_claim_verification")).length, 1);
  assert.equal(recovery.calls.filter((entry) => entry.text.includes("merchant_provider_profile_claim_verification")).length, 1);
  assert.deepEqual(
    call(recovery, "merchant_provider_profile_claim_verification").values,
    call(writer, "merchant_provider_profile_claim_verification").values,
  );
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audit, ["merchant_provider_verification_commit_unknown"]);
  assert.doesNotMatch(JSON.stringify(audit), /raw-provider-detail/);
});

test("verification mark commit ambiguity audits safely and accepts one exact replay after binding drift", async () => {
  let writerCommits = 0;
  const projected = verificationProfile();
  const writer = new Client((text) => {
    if (text.includes("merchant_provider_profile_mark_verification")) {
      return [{ outcome: "validated", result_payload: projected }];
    }
    if (text === "COMMIT" && writerCommits++ === 0) {
      throw new Error("raw-database-detail-must-not-escape");
    }
    return [];
  });
  const recovery = new Client((text) => text.includes("merchant_provider_profile_mark_verification")
    ? [{ outcome: "operation_replayed", result_payload: projected }]
    : []);
  const audit: string[] = [];

  const result = await repository(new Pool([writer, recovery]), audit).markProfileVerification({
    profileId: PROFILE,
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    validationIdentity: { environment: "test", adapterVersion: 1 },
    credentialVersion: 2,
    profileVersion: 3,
    leaseId: LEASE,
    leaseOwner: "worker.fixture",
    now: NOW,
    outcome: "validated",
    outcomeCode: "validated",
  });

  assert.deepEqual(result, projected);
  assert.equal(writer.calls.filter((entry) => entry.text.includes("merchant_provider_profile_mark_verification")).length, 1);
  assert.equal(recovery.calls.filter((entry) => entry.text.includes("merchant_provider_profile_mark_verification")).length, 1);
  assert.deepEqual(
    call(recovery, "merchant_provider_profile_mark_verification").values,
    call(writer, "merchant_provider_profile_mark_verification").values,
  );
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audit, ["merchant_provider_verification_commit_unknown"]);
  assert.doesNotMatch(JSON.stringify(audit), /raw-database-detail/);
});

test("verification unavailable commit ambiguity replays the same pending projection", async () => {
  let writerCommits = 0;
  const projected = verificationProfile("pending_validation");
  const writer = new Client((text) => {
    if (text.includes("merchant_provider_profile_mark_verification")) {
      return [{ outcome: "unavailable", result_payload: projected }];
    }
    if (text === "COMMIT" && writerCommits++ === 0) throw new Error("ambiguous");
    return [];
  });
  const recovery = new Client((text) => text.includes("merchant_provider_profile_mark_verification")
    ? [{ outcome: "operation_replayed", result_payload: projected }]
    : []);
  const audit: string[] = [];

  const result = await repository(new Pool([writer, recovery]), audit).markProfileVerification({
    profileId: PROFILE,
    providerCode: "iyzico_iframe",
    capability: "payment_processing",
    validationIdentity: { environment: "test", adapterVersion: 1 },
    credentialVersion: 2,
    profileVersion: 3,
    leaseId: LEASE,
    leaseOwner: "worker.fixture",
    now: NOW,
    outcome: "unavailable",
    outcomeCode: "validation_unavailable",
  });

  assert.deepEqual(result, projected);
  assert.equal(writer.calls.filter((entry) => entry.text.includes("merchant_provider_profile_mark_verification")).length, 1);
  assert.equal(recovery.calls.filter((entry) => entry.text.includes("merchant_provider_profile_mark_verification")).length, 1);
  assert.deepEqual(audit, ["merchant_provider_verification_commit_unknown"]);
});

test("verification commit recovery rejects a projection different from the observed write", async () => {
  const observed = verificationProfile();
  const writer = new Client((text) => {
    if (text.includes("merchant_provider_profile_mark_verification")) {
      return [{ outcome: "validated", result_payload: observed }];
    }
    if (text === "COMMIT") throw new Error("ambiguous");
    return [];
  });
  const recovery = new Client((text) => text.includes("merchant_provider_profile_mark_verification")
    ? [{ outcome: "operation_replayed", result_payload: { ...observed, version: 5 } }]
    : []);

  await assert.rejects(
    () => repository(new Pool([writer, recovery])).markProfileVerification({
      profileId: PROFILE,
      providerCode: "iyzico_iframe",
      capability: "payment_processing",
      validationIdentity: { environment: "test", adapterVersion: 1 },
      credentialVersion: 2,
      profileVersion: 3,
      leaseId: LEASE,
      leaseOwner: "worker.fixture",
      now: NOW,
      outcome: "validated",
      outcomeCode: "validated",
    }),
    (error: unknown) => error instanceof MerchantProviderWorkflowRepositoryError && error.code === "unavailable",
  );
  assert.equal(writer.calls.filter((entry) => entry.text.includes("merchant_provider_profile_mark_verification")).length, 1);
  assert.equal(recovery.calls.filter((entry) => entry.text.includes("merchant_provider_profile_mark_verification")).length, 1);
});

test("heartbeat carries the exact lease ID and parses a safe job", async () => {
  const client = new Client((text) => text.includes("merchant_provider_heartbeat") ? [{ outcome: "heartbeat", result_payload: job("leased", 4) }] : []);
  const result = await repository(new Pool([client])).heartbeat({ jobId: JOB, leaseOwner: "worker.fixture", leaseId: LEASE, expectedVersion: 3, now: NOW, leaseExpiresAt: LATER });
  assert.equal(result.status, "leased");
  assert.deepEqual(call(client, "merchant_provider_heartbeat").values.slice(0, 3), [JOB, "worker.fixture", LEASE]);
});

test("finalize commit unknown performs one recovery and never repeats finalize", async () => {
  let commits = 0;
  const projected = job();
  const writer = new Client((text) => {
    if (text.includes("merchant_provider_finalize")) return [{ outcome: "provider_outcome_unknown", result_payload: projected }];
    if (text === "COMMIT" && commits++ === 0) throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("merchant_provider_recover_workflow_operation") ? [{ outcome: "operation_replayed", result_payload: projected }] : []);
  const audit: string[] = [];
  const result = await repository(new Pool([writer, recovery]), audit).finalize({ jobId: JOB, leaseOwner: "worker.fixture", leaseId: LEASE, expectedVersion: 3, now: NOW, outcome: "provider_outcome_unknown", outcomeCode: "transport_outcome_unknown", safeProviderReference: null });
  assert.equal(result.status, "provider_outcome_unknown");
  assert.equal(writer.calls.filter((entry) => entry.text.includes("merchant_provider_finalize")).length, 1);
  assert.equal(recovery.calls.filter((entry) => entry.text.includes("merchant_provider_recover_workflow_operation")).length, 1);
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audit, ["merchant_provider_finalize_commit_unknown"]);
});

test("reconciliation is versioned separate from execution leases", async () => {
  const projected = { ...job("succeeded", 5), safeProviderReference: "provider-safe", outcomeCode: "accepted" };
  const client = new Client((text) => text.includes("merchant_provider_reconcile") ? [{ outcome: "succeeded", result_payload: projected }] : []);
  const result = await repository(new Pool([client]), [], [OPERATION]).reconcile({ jobId: JOB, workerId: "worker.reconciler", expectedVersion: 4, now: NOW, outcome: "succeeded", outcomeCode: "accepted", safeProviderReference: "provider-safe" });
  assert.equal(result.status, "succeeded");
  assert.equal(call(client, "merchant_provider_reconcile").values[2], OPERATION);
});

test("workflow repository requires the exact role and rejects malformed public inputs before checkout", async () => {
  assert.throws(() => new PostgresMerchantProviderWorkflowRepository({ pool: new Pool([]), role: "celebix_saas_app", timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 }, uuid: () => LEASE, audit() {} } as never), /unavailable/);
  await assert.rejects(
    () => repository(new Pool([])).claim({ workerId: " worker", now: NOW, leaseExpiresAt: LATER }),
    (error: unknown) => error instanceof MerchantProviderWorkflowRepositoryError && error.code === "invalid_input",
  );
});
