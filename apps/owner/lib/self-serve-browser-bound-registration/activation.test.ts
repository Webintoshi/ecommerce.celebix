import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBrowserBoundRegistrationBridgeApproval,
  createBrowserBoundRegistrationBridgeApproval,
} from "./activation.ts";

test("bridge approval is exact, frozen, sealed, unforgeable, and never production", () => {
  const approval = createBrowserBoundRegistrationBridgeApproval("disposable_test");
  assert.deepEqual(approval, {
    purpose: "phase2b2b2b_browser_bound_registration_bridge",
    environment: "disposable_test",
    defaultRoute: "disabled",
    responseMode: "auto_post_html",
    providerTransition: "panel_bootstrap_only",
    ownerCookies: "forbidden",
    providerNetworking: "injected_only",
    productionActivation: "forbidden",
  });
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isSealed(approval), true);
  assert.doesNotThrow(() => assertBrowserBoundRegistrationBridgeApproval(approval));
  for (const forged of [
    { ...approval },
    JSON.parse(JSON.stringify(approval)),
    structuredClone(approval),
    { ...approval, environment: "production" },
  ]) {
    assert.throws(() => assertBrowserBoundRegistrationBridgeApproval(forged));
  }
  assert.throws(() => createBrowserBoundRegistrationBridgeApproval("production" as never));
});
