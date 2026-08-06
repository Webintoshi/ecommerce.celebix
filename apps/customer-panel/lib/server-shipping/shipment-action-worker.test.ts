import assert from "node:assert/strict";
import test from "node:test";

import { runShippingShipmentActionJob } from "./shipment-action-worker.ts";

const JOB = "75000000-0000-4000-8000-000000000001";
const STORE = "75000000-0000-4000-8000-000000000002";
const PROFILE = "75000000-0000-4000-8000-000000000003";
const SHIPMENT = "75000000-0000-4000-8000-000000000004";
const LEASE = "75000000-0000-4000-8000-000000000005";
const EVENT = "75000000-0000-4000-8000-000000000006";
const NOW = new Date("2026-08-06T12:00:00.000Z");

function fixture(actionKind: "refresh" | "label" | "cancel" | "return", providerResult: unknown) {
  const tokenBytes = new TextEncoder().encode("bk_live_secret_123456789");
  const completed: unknown[] = [], failed: unknown[] = [], unknown: unknown[] = [];
  const claim = { jobId: JOB, actionKind, storeId: STORE, profileId: PROFILE, shipmentId: SHIPMENT, credentialVersion: 1, leaseId: LEASE, workerId: "panel.qa", fenceToken: 1, version: 2 } as const;
  const adapterMethod = async () => providerResult as never;
  const runtime = {
    generateId: () => EVENT,
    workflow: {
      async claimShipmentAction() { return claim; },
      async openShipmentAction() { return { claim, providerCode: "basit_kargo", tokenBytes, providerReference: "BK-REF", barcode: "BK-BAR" }; },
      async completeShipmentAction(value: unknown) { completed.push(structuredClone(value)); return "completed" as const; },
      async failShipmentAction(value: unknown) { failed.push(value); return "failed" as const; },
      async markShipmentActionUnknown(value: unknown) { unknown.push(value); return "marked_unknown" as const; },
    },
    adapter: {
      parseCredential: () => ({ token: "parsed" }), downloadLabel: adapterMethod, getShipment: adapterMethod,
      cancelShipment: adapterMethod, createReturnShipment: adapterMethod,
    },
  };
  return { runtime, tokenBytes, completed, failed, unknown };
}

test("shipment refresh persists canonical provider tracking and wipes credential bytes", async () => {
  const selected = fixture("refresh", { kind: "succeeded", shipment: { providerReference: "BK-REF", direction: "outgoing", status: "shipped", providerStatus: "SHIPPED", handlerName: "Yurtiçi Kargo", barcode: "BK-BAR", trackingNumber: "TRK-1", priceCents: 12000, currency: "TRY" } });
  assert.equal(await runShippingShipmentActionJob({ jobId: JOB, workerId: "panel.qa", runtime: selected.runtime as never, now: NOW }), "completed");
  assert.equal(selected.completed.length, 1);
  assert.equal((selected.completed[0] as { status: string }).status, "shipped");
  assert.equal((selected.completed[0] as { trackingNumber: string }).trackingNumber, "TRK-1");
  assert.deepEqual([...selected.tokenBytes], Array(selected.tokenBytes.length).fill(0));
});

test("shipment label is hash-pinned before durable storage", async () => {
  const bytes = new TextEncoder().encode("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
  const selected = fixture("label", { kind: "succeeded", contentType: "image/svg+xml", bytes });
  assert.equal(await runShippingShipmentActionJob({ jobId: JOB, workerId: "panel.qa", runtime: selected.runtime as never, now: NOW }), "completed");
  const completed = selected.completed[0] as { labelBytes: Uint8Array; labelSha256: string; status: null };
  assert.equal(completed.status, null);
  assert.equal(new TextDecoder().decode(completed.labelBytes), new TextDecoder().decode(bytes));
  assert.match(completed.labelSha256, /^[a-f0-9]{64}$/u);
});

test("ambiguous cancel is never retried and becomes attention required", async () => {
  const selected = fixture("cancel", { kind: "provider_outcome_unknown", providerReference: null });
  assert.equal(await runShippingShipmentActionJob({ jobId: JOB, workerId: "panel.qa", runtime: selected.runtime as never, now: NOW }), "marked_unknown");
  assert.equal(selected.completed.length, 0);
  assert.equal(selected.unknown.length, 1);
});

test("successful cancel and return persist only canonical adapter output", async () => {
  for (const actionKind of ["cancel", "return"] as const) {
    const selected = fixture(actionKind, { kind: "succeeded", shipment: {
      providerReference: actionKind === "return" ? "BK-RETURN" : "BK-REF", direction: actionKind === "return" ? "incoming" : "outgoing",
      status: actionKind === "return" ? "ready" : "cancelled", providerStatus: "DONE", barcode: actionKind === "return" ? "RETURN-BAR" : "BK-BAR", currency: "TRY",
    } });
    assert.equal(await runShippingShipmentActionJob({ jobId: JOB, workerId: "panel.qa", runtime: selected.runtime as never, now: NOW }), "completed");
    assert.equal((selected.completed[0] as { providerShipmentId: string }).providerShipmentId, actionKind === "return" ? "BK-RETURN" : "BK-REF");
  }
});

test("read failures are safely finalized without exposing provider details", async () => {
  const selected = fixture("refresh", { kind: "temporary_failure", safeCode: "provider_response_invalid" });
  assert.equal(await runShippingShipmentActionJob({ jobId: JOB, workerId: "panel.qa", runtime: selected.runtime as never, now: NOW }), "failed");
  assert.equal(selected.failed.length, 1);
});
