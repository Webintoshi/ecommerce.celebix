import assert from "node:assert/strict";
import test from "node:test";

import { createPaymentMethodApi, PaymentMethodApiError } from "./client.ts";

const METHOD_ID = "40000000-0000-4000-8000-000000000001";
const PROFILE_ID = "40000000-0000-4000-8000-000000000002";
const OPERATION_IDS = [
  "70000000-0000-4000-8000-000000000001",
  "70000000-0000-4000-8000-000000000002",
  "70000000-0000-4000-8000-000000000003",
] as const;
const NOW = "2026-07-27T12:00:00.000Z";

const catalogEntry = Object.freeze({
  providerCode: "paytr_iframe",
  familyCode: "paytr",
  modeCode: "iframe",
  sourceSlug: "paytr-iframe",
  label: "PayTR",
  modeLabel: "iFrame",
  category: "payment_institution",
  interactionMode: "iframe",
  readiness: "planned",
  executionAuthority: null,
  support: Object.freeze({
    threeDSecure: "unknown", installments: "unknown", refund: "unknown",
    cancel: "unknown", capture: "unknown",
  }),
  logoPath: "/payment-providers/paytr.svg",
  aliases: Object.freeze(["pay tr"]),
  environments: Object.freeze(["test", "live"]),
});
const method = Object.freeze({
  id: METHOD_ID,
  kind: "provider",
  profileId: PROFILE_ID,
  providerCode: "paytr_iframe",
  label: "Kredi Kartı",
  state: "active",
  emergencyReason: null,
  position: 0,
  config: Object.freeze({ environment: "test" }),
  version: 2,
  createdAt: NOW,
  updatedAt: NOW,
});
const mutation = Object.freeze({
  id: METHOD_ID,
  state: "active",
  position: 0,
  version: 3,
  updatedAt: NOW,
  replayed: false,
});

test("payment method client uses exact relative paths, same-origin credentials and no-store", async () => {
  const calls: Array<Readonly<{ path: string; init: RequestInit | undefined }>> = [];
  let operationIndex = 0;
  const api = createPaymentMethodApi(async (input, init) => {
    const path = String(input);
    calls.push({ path, init });
    if (path === "/api/payment-providers/catalog") return Response.json({ items: [catalogEntry] });
    if (path === "/api/payment-methods" && init?.method !== "POST") return Response.json({ items: [method] });
    if (path === "/api/payment-methods/reorder") return Response.json({ items: [mutation], replayed: false });
    return Response.json(mutation);
  }, () => OPERATION_IDS[operationIndex++] ?? OPERATION_IDS[2]);

  assert.equal((await api.catalog())[0]?.providerCode, "paytr_iframe");
  assert.equal((await api.list())[0]?.id, METHOD_ID);
  await api.save({
    methodId: METHOD_ID,
    expectedVersion: 2,
    kind: "provider",
    profileId: PROFILE_ID,
    providerCode: "paytr_iframe",
    label: "Kredi Kartı",
    config: { environment: "test" },
  });
  await api.setState(METHOD_ID, { expectedVersion: 3, state: "active", emergencyReason: null });
  await api.reorder([{ id: METHOD_ID, expectedVersion: 3, position: 0 }]);

  assert.deepEqual(calls.map(({ path }) => path), [
    "/api/payment-providers/catalog",
    "/api/payment-methods",
    "/api/payment-methods",
    `/api/payment-methods/${METHOD_ID}/state`,
    "/api/payment-methods/reorder",
  ]);
  for (const call of calls) {
    assert.equal(call.init?.credentials, "same-origin");
    assert.equal(call.init?.cache, "no-store");
  }
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal(calls[1]?.init?.method, "GET");
  assert.equal(calls[2]?.init?.method, "POST");
  assert.equal(new Headers(calls[2]?.init?.headers).get("content-type"), "application/json");
  assert.equal(new Headers(calls[2]?.init?.headers).get("idempotency-key"), OPERATION_IDS[0]);
  assert.equal(new Headers(calls[3]?.init?.headers).get("idempotency-key"), OPERATION_IDS[1]);
  assert.equal(new Headers(calls[4]?.init?.headers).get("idempotency-key"), OPERATION_IDS[2]);
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), {
    expectedVersion: 3, state: "active", emergencyReason: null,
  });
  assert.deepEqual(JSON.parse(String(calls[4]?.init?.body)), {
    items: [{ id: METHOD_ID, expectedVersion: 3, position: 0 }],
  });
});

test("payment method client maps only finite safe server errors", async () => {
  const denied = createPaymentMethodApi(async () => Response.json(
    { code: "membership_denied" },
    { status: 403 },
  ), () => OPERATION_IDS[0]);
  await assert.rejects(
    () => denied.list(),
    (error: unknown) => error instanceof PaymentMethodApiError
      && error.code === "membership_denied"
      && error.status === 403
      && error.message === "Bu işlem için yetkiniz yok.",
  );

  const hostile = createPaymentMethodApi(async () => Response.json(
    { code: "database_password_exposed", detail: "private" },
    { status: 500 },
  ), () => OPERATION_IDS[0]);
  await assert.rejects(
    () => hostile.catalog(),
    (error: unknown) => error instanceof PaymentMethodApiError
      && error.code === "unavailable"
      && !error.message.includes("private"),
  );
});

test("payment method client rejects malformed, oversized and private success projections", async () => {
  const malformed = createPaymentMethodApi(async () => new Response("not json", {
    headers: { "content-type": "text/plain" },
  }), () => OPERATION_IDS[0]);
  await assert.rejects(
    () => malformed.catalog(),
    (error: unknown) => error instanceof PaymentMethodApiError && error.code === "unavailable",
  );

  const oversized = createPaymentMethodApi(async () => new Response("{}", {
    headers: { "content-type": "application/json", "content-length": "524289" },
  }), () => OPERATION_IDS[0]);
  await assert.rejects(
    () => oversized.list(),
    (error: unknown) => error instanceof PaymentMethodApiError && error.code === "unavailable",
  );

  const privateProjection = createPaymentMethodApi(async () => Response.json({
    items: [{ ...method, ciphertext: "private" }],
  }), () => OPERATION_IDS[0]);
  await assert.rejects(
    () => privateProjection.list(),
    (error: unknown) => error instanceof PaymentMethodApiError && error.code === "unavailable",
  );
});

test("payment method client validates generated idempotency keys before a mutation", async () => {
  let calls = 0;
  const api = createPaymentMethodApi(async () => { calls += 1; return Response.json(mutation); }, () => "not-a-uuid");
  await assert.rejects(
    () => api.setState(METHOD_ID, { expectedVersion: 2, state: "disabled", emergencyReason: null }),
    (error: unknown) => error instanceof PaymentMethodApiError && error.code === "unavailable",
  );
  assert.equal(calls, 0);
});
