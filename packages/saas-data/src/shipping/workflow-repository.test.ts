import assert from "node:assert/strict";
import test from "node:test";

import { sealShippingCredential } from "./credential-crypto.ts";
import { PostgresShippingWorkflowRepository } from "./workflow-repository.ts";

const JOB = "50000000-0000-4000-8000-000000000001";
const LEASE = "80000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const PROFILE = "40000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-06T12:00:00.000Z");
const keyring = Object.freeze({ activeKeyId: "shipping.current", keys: Object.freeze([
  Object.freeze({ keyId: "shipping.current", key: new Uint8Array(32).fill(9) }),
]) });
const envelope = sealShippingCredential({
  plaintext: new TextEncoder().encode("bk_live_secret_123456789"), storeId: STORE, profileId: PROFILE,
  providerCode: "basit_kargo", credentialVersion: 1, keyring,
});

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = text.includes("shipping_validation_claim_job") ? [{ outcome: "claimed", result_payload: {
      jobId: JOB, storeId: STORE, profileId: PROFILE, providerCode: "basit_kargo", credentialVersion: 1,
      leaseId: LEASE, fenceToken: 1, version: 2,
    } }] : text.includes("shipping_validation_open_credential") ? [{ outcome: "opened", result_payload: {
      providerCode: "basit_kargo", credentialEnvelope: envelope, credentialDigest: "a".repeat(64),
      credentialKeyId: "shipping.current", credentialVersion: 1,
    } }] : [];
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release() {}
}

test("an exact validation lease opens one credential bound to that claim", async () => {
  const client = new Client();
  const repository = new PostgresShippingWorkflowRepository({
    pool: { async connect() { return client; } }, role: "celebix_saas_workflow", keyring,
    timeouts: { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 },
  });
  const claim = await repository.claimValidation({ jobId: JOB, workerId: "worker-1", now: NOW, leaseSeconds: 30, leaseId: LEASE });
  assert.ok(claim);
  const credential = await repository.openClaimedCredential({ claim, now: NOW });
  assert.equal(new TextDecoder().decode(credential.tokenBytes), "bk_live_secret_123456789");
  assert.equal(credential.providerCode, "basit_kargo");
  credential.tokenBytes.fill(0);
});
