import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createCustomerPanelAuthCompositionApproval } from "./activation.ts";
import {
  assertDisabledCustomerPanelAuthComposition,
  createDisabledCustomerPanelAuthComposition,
} from "./composition.ts";

const NOW = new Date("2026-07-15T12:00:00.000Z");
const BOOTSTRAP_SECRET = new Uint8Array(32).fill(11);
const SESSION_SECRET = new Uint8Array(32).fill(13);
const BS1 = `bs1.active.${Buffer.alloc(32, 5).toString("base64url")}`;
const PROVIDER = "https://identity.example.test/authorize?response_type=code&response_mode=query&state=opaque_state_1234567890&redirect_uri=https%3A%2F%2Fpanel.celebix.site%2Fauth%2Fcallback";

function fixture() {
  let originalFetchCalls = 0;
  let replacementFetchCalls = 0;
  let capturedRequest: Request | undefined;
  const mutable = {
    fetch: async (request: Request) => {
      originalFetchCalls += 1;
      capturedRequest = request.clone();
      return new Response('{"invalid":true}', {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    },
  };
  const options = {
    activationApproval: createCustomerPanelAuthCompositionApproval("disposable_test"),
    ownerInternalOrigin: "https://ecommerce.celebix.co",
    randomBytes: (size: number) => new Uint8Array(size).fill(17),
    clock: () => new Date(NOW),
    fetch: mutable.fetch,
    browserBinding: {
      activeKeyId: "bootstrap-key",
      activeSecret: BOOTSTRAP_SECRET,
      maximumBodyBytes: 16_384,
      deadlineMs: 1_000,
      maximumResponseBytes: 4_096,
      transportAudit: () => undefined,
      handlerAudit: () => undefined,
    },
    sessionCompletion: {
      activeKeyId: "session-key",
      activeSecret: SESSION_SECRET,
      maximumQueryBytes: 8_192,
      deadlineMs: 1_000,
      maximumResponseBytes: 4_096,
      transportAudit: () => undefined,
      handlerAudit: () => undefined,
    },
    handoffRedeemer: {
      async redeemHandoff() { return { kind: "unavailable" } as const; },
      async recoverRedemption() { return { kind: "unavailable" } as const; },
    },
  };
  const composition = createDisabledCustomerPanelAuthComposition(options);
  return {
    composition,
    replaceFetch() {
      options.fetch = async () => {
        replacementFetchCalls += 1;
        throw new Error("replacement");
      };
    },
    counts: () => ({ originalFetchCalls, replacementFetchCalls }),
    capturedRequest: () => capturedRequest,
  };
}

test("customer composition returns only genuine frozen unmounted handlers and exact readiness", () => {
  const { composition } = fixture();
  assert.deepEqual(Object.keys(composition), [
    "browserBootstrapHandler",
    "panelSessionCompletionHandler",
    "readiness",
  ]);
  assert.equal(typeof composition.browserBootstrapHandler, "function");
  assert.equal(typeof composition.panelSessionCompletionHandler, "function");
  assert.equal(Object.isFrozen(composition), true);
  assert.equal(Object.isSealed(composition), true);
  assert.doesNotThrow(() => assertDisabledCustomerPanelAuthComposition(composition));
  assert.throws(() => assertDisabledCustomerPanelAuthComposition({ ...composition }));
  assert.deepEqual(composition.readiness, {
    schemaVersion: 1,
    phase: "2B2B2B",
    productionActivation: "forbidden",
    requiredNextGate: "route_mount_and_staging_e2e",
    endpoints: {
      browserBootstrap: { method: "POST", path: "/auth/bootstrap", state: "disabled_unmounted" },
      browserCallback: { method: "GET", path: "/auth/callback", state: "disabled_unmounted" },
    },
  });
  assert.equal(Object.isFrozen(composition.readiness), true);
  assert.equal(Object.isFrozen(composition.readiness.endpoints), true);
  assert.equal(JSON.stringify(composition).includes("key"), false);
});

test("customer composition captures fetch and defensively copies internal key bytes", async () => {
  const fixtureValue = fixture();
  BOOTSTRAP_SECRET.fill(99);
  fixtureValue.replaceFetch();
  const body = new URLSearchParams({ bootstrapCredential: BS1, providerAuthorizationUrl: PROVIDER }).toString();
  const response = await fixtureValue.composition.browserBootstrapHandler(new Request(
    "https://panel.celebix.site/auth/bootstrap",
    {
      method: "POST",
      headers: {
        origin: "https://ecommerce.celebix.co",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
  ));
  assert.equal(response.status, 503);
  assert.deepEqual(fixtureValue.counts(), { originalFetchCalls: 1, replacementFetchCalls: 0 });
  const request = fixtureValue.capturedRequest();
  assert.ok(request);
  const timestamp = request.headers.get("x-celebix-browser-bootstrap-timestamp")!;
  const raw = await request.text();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const digestHex = Buffer.from(digest).toString("hex");
  const expected = createHmac("sha256", new Uint8Array(32).fill(11))
    .update(`celebix-panel-browser-bootstrap-request-v1\n${timestamp}\n${digestHex}`, "utf8")
    .digest("base64url");
  assert.equal(request.headers.get("x-celebix-browser-bootstrap-signature"), expected);
});
