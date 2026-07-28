import assert from "node:assert/strict";
import test from "node:test";

import {
  IyzicoActivationApiError,
  createIyzicoActivationApi,
} from "./client.ts";

const METHOD_ID = "40000000-0000-4000-8000-000000000061";
const OPERATION_ID = "50000000-0000-4000-8000-000000000061";

function state(overrides: Record<string, unknown> = {}) {
  return {
    phase: "evidence_pending",
    canBegin: true,
    canActivate: false,
    methodId: null,
    expectedMethodVersion: null,
    ...overrides,
  };
}

test("iyzico activation client uses exact same-origin no-store requests and server-owned authority", async () => {
  const calls: Array<Readonly<{ input: RequestInfo | URL; init?: RequestInit }>> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(Object.freeze({ input, init }));
    const phase = String(input).endsWith("/activate")
      ? state({ phase: "active", canBegin: false, methodId: METHOD_ID, expectedMethodVersion: 7 })
      : String(input).endsWith("/begin") ? state({ phase: "running", canBegin: false }) : state();
    return Response.json(phase);
  };
  const api = createIyzicoActivationApi(fetcher, () => OPERATION_ID);

  await api.current();
  await api.begin();
  await api.activate(METHOD_ID, 6);

  assert.deepEqual(calls.map(({ input }) => input), [
    "/api/payment-providers/iyzico/sandbox-activation/current",
    "/api/payment-providers/iyzico/sandbox-activation/begin",
    "/api/payment-providers/iyzico/sandbox-activation/activate",
  ]);
  for (const { init } of calls) {
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.cache, "no-store");
  }
  assert.deepEqual(calls[0]?.init, { method: "GET", credentials: "same-origin", cache: "no-store" });
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {});
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), {
    methodId: METHOD_ID,
    expectedMethodVersion: 6,
  });
  for (const call of calls.slice(1)) {
    assert.equal(new Headers(call.init?.headers).get("idempotency-key"), OPERATION_ID);
    assert.equal(new Headers(call.init?.headers).get("content-type"), "application/json");
    assert.deepEqual([...new Headers(call.init?.headers).keys()].sort(), ["content-type", "idempotency-key"]);
  }
  const mutationBodies = calls.slice(1).map(({ init }) => String(init?.body)).join("\n");
  assert.doesNotMatch(mutationBodies, /attestation|evidenceDigest|fingerprint|credential|secret/i);
});

test("iyzico activation client accepts only the finite public DTO", async () => {
  const invalid = [
    state({ privateEvidence: "hidden" }),
    state({ phase: "unknown" }),
    state({ canBegin: false }),
    state({ phase: "ready_to_activate", canBegin: false, canActivate: true }),
    state({ phase: "active", canBegin: false, methodId: METHOD_ID, expectedMethodVersion: null }),
    state({ phase: "active", canBegin: false, methodId: METHOD_ID, expectedMethodVersion: 0 }),
  ];
  for (const payload of invalid) {
    const api = createIyzicoActivationApi(async () => Response.json(payload), () => OPERATION_ID);
    await assert.rejects(() => api.current(), (error: unknown) =>
      error instanceof IyzicoActivationApiError && error.code === "unavailable");
  }

  const ready = state({
    phase: "ready_to_activate",
    canBegin: false,
    canActivate: true,
    methodId: METHOD_ID,
    expectedMethodVersion: 6,
  });
  const api = createIyzicoActivationApi(async () => Response.json(ready), () => OPERATION_ID);
  assert.deepEqual(await api.current(), ready);
  assert.equal(Object.isFrozen(await api.current()), true);
});

test("iyzico activation client maps only allowlisted errors and rejects invalid operation ids", async () => {
  const denied = createIyzicoActivationApi(
    async () => Response.json({ code: "provider_already_active" }, { status: 409 }),
    () => OPERATION_ID,
  );
  await assert.rejects(() => denied.begin(), (error: unknown) =>
    error instanceof IyzicoActivationApiError
      && error.code === "provider_already_active"
      && error.status === 409
      && /Başka bir ödeme sağlayıcısı/.test(error.message));

  const privateError = createIyzicoActivationApi(
    async () => Response.json({ code: "database_secret", detail: "private" }, { status: 500 }),
    () => OPERATION_ID,
  );
  await assert.rejects(() => privateError.begin(), (error: unknown) =>
    error instanceof IyzicoActivationApiError && error.code === "unavailable");

  const invalidOperation = createIyzicoActivationApi(async () => Response.json(state()), () => "not-a-uuid");
  assert.throws(() => invalidOperation.begin(), (error: unknown) =>
    error instanceof IyzicoActivationApiError && error.code === "unavailable");
});
