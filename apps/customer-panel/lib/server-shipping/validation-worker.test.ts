import assert from "node:assert/strict";
import test from "node:test";

import { runShippingValidationJob } from "./validation-worker.ts";

const JOB = "50000000-0000-4000-8000-000000000001";

test("validation worker verifies resources, finalizes, and wipes opened token bytes", async () => {
  const tokenBytes = new TextEncoder().encode("bk_live_secret_123456789");
  const completed: unknown[] = [];
  const runtime = {
    workflow: {
      async claimValidation() { return { jobId: JOB, storeId: "10000000-0000-4000-8000-000000000001", profileId: "40000000-0000-4000-8000-000000000001", providerCode: "basit_kargo", credentialVersion: 1, leaseId: "80000000-0000-4000-8000-000000000001", workerId: "worker-1", fenceToken: 1, version: 2 }; },
      async openClaimedCredential() { return { providerCode: "basit_kargo", tokenBytes }; },
      async completeValidation(input: unknown) { completed.push(input); return "completed" as const; },
      async failValidation() { throw new Error("unexpected"); },
    },
    adapter: {
      providerCode: "basit_kargo",
      parseCredential(value: unknown) { return value as { token: string }; },
      async verifyCredential() { return { kind: "succeeded" as const, accountIdentity: "merchant-a" }; },
      async listBrands() { return { kind: "succeeded" as const, resources: [{ providerResourceId: "brand_1", label: "Marka", active: true }] }; },
      async listSenderAddresses() { return { kind: "succeeded" as const, resources: [{ providerResourceId: "address_1", label: "Depo", active: true }] }; },
      async listHandlers() { return { kind: "succeeded" as const, handlers: [{ handlerCode: "PTT", handlerName: "PTT Kargo", active: true }] }; },
    },
    generateId: (() => { let value = 0; return () => `90000000-0000-4000-8000-${String(++value).padStart(12, "0")}`; })(),
  };
  assert.equal(await runShippingValidationJob({ jobId: JOB, workerId: "worker-1", runtime: runtime as never, now: new Date("2026-08-06T12:00:00.000Z") }), "completed");
  assert.equal(completed.length, 1);
  assert.equal(tokenBytes.every((byte) => byte === 0), true);
});

test("temporary provider failure requeues and still wipes token bytes", async () => {
  const tokenBytes = new TextEncoder().encode("bk_live_secret_123456789");
  const failures: unknown[] = [];
  const runtime = {
    workflow: {
      async claimValidation() { return { jobId: JOB, storeId: "10000000-0000-4000-8000-000000000001", profileId: "40000000-0000-4000-8000-000000000001", providerCode: "basit_kargo", credentialVersion: 1, leaseId: "80000000-0000-4000-8000-000000000001", workerId: "worker-1", fenceToken: 1, version: 2 }; },
      async openClaimedCredential() { return { providerCode: "basit_kargo", tokenBytes }; },
      async completeValidation() { throw new Error("unexpected"); },
      async failValidation(input: unknown) { failures.push(input); return "requeued" as const; },
    },
    adapter: {
      providerCode: "basit_kargo",
      parseCredential(value: unknown) { return value as { token: string }; },
      async verifyCredential() { return { kind: "temporary_failure" as const, safeCode: "provider_unavailable" }; },
    },
    generateId() { return "90000000-0000-4000-8000-000000000001"; },
  };
  assert.equal(await runShippingValidationJob({ jobId: JOB, workerId: "worker-1", runtime: runtime as never, now: new Date("2026-08-06T12:00:00.000Z") }), "requeued");
  assert.equal(failures.length, 1);
  assert.equal(tokenBytes.every((byte) => byte === 0), true);
});
