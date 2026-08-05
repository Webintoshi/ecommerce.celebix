import assert from "node:assert/strict";
import test from "node:test";

import { createVerifiedEdgeTrustBoundary } from "./verified-edge-trust.ts";

const CALLBACK = "https://panel.celebix.site/auth/callback?state=state_0123456789abcdefghijklmnop&code=code";

test("verified edge context exists only inside its closure-owned invocation", async () => {
  const boundary = createVerifiedEdgeTrustBoundary();
  let captured: unknown;
  await boundary.invokeWithVerifiedContext(async (context) => {
    captured = context;
    assert.equal(Object.isFrozen(context), true);
    assert.equal(Object.isSealed(context), true);
    assert.deepEqual(JSON.parse(JSON.stringify(context)), {});
    assert.equal(await boundary.requestGate.verify({
      kind: "callback_completion",
      request: new Request(CALLBACK),
      edgeTrustContext: context,
    }), "allowed");
  });
  assert.equal(await boundary.requestGate.verify({
    kind: "callback_completion",
    request: new Request(CALLBACK),
    edgeTrustContext: captured,
  }), "unauthorized");
});

test("serialized, spread, copied, plain, browser, and cross-boundary contexts fail closed", async () => {
  const first = createVerifiedEdgeTrustBoundary();
  const second = createVerifiedEdgeTrustBoundary();
  await first.invokeWithVerifiedContext(async (context) => {
    const rejected = [
      JSON.parse(JSON.stringify(context)),
      { ...(context as object) },
      Object.assign({}, context),
      {},
      { edgeTrust: true },
    ];
    for (const edgeTrustContext of rejected) {
      assert.equal(await first.requestGate.verify({
        kind: "callback_completion",
        request: new Request(CALLBACK),
        edgeTrustContext,
      }), "unauthorized");
    }
    assert.equal(await second.requestGate.verify({
      kind: "callback_completion",
      request: new Request(CALLBACK),
      edgeTrustContext: context,
    }), "unauthorized");
  });
  assert.equal(await first.requestGate.verify({
    kind: "registration_start",
    request: new Request("https://ecommerce.celebix.co/api/self-serve/register"),
  }), "unauthorized");
});

test("an injected registration gate is narrow and cannot mint callback trust", async () => {
  let calls = 0;
  const boundary = createVerifiedEdgeTrustBoundary({
    async verify(input) {
      calls += 1;
      assert.equal(input.kind, "registration_start");
      return "allowed";
    },
  });
  assert.equal(await boundary.requestGate.verify({
    kind: "registration_start",
    request: new Request("https://ecommerce.celebix.co/api/self-serve/register"),
  }), "allowed");
  assert.equal(calls, 1);
  assert.equal(await boundary.requestGate.verify({
    kind: "callback_completion",
    request: new Request(CALLBACK),
    edgeTrustContext: {},
  }), "unauthorized");
  assert.equal(calls, 1);
});
