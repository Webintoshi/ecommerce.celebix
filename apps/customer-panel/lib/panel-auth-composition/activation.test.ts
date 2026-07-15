import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCustomerPanelAuthCompositionApproval,
  createCustomerPanelAuthCompositionApproval,
} from "./activation.ts";

test("customer composition approval is exact, disabled, unmounted, and unforgeable", () => {
  const approval = createCustomerPanelAuthCompositionApproval("approved_staging");
  assert.deepEqual(approval, {
    phase: "2B2B2B",
    environment: "approved_staging",
    composition: "ready_unmounted",
    defaultRoutes: "disabled",
    productionActivation: "forbidden",
    providerNetworking: "injected_only",
    routeMutation: "forbidden",
  });
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isSealed(approval), true);
  assert.doesNotThrow(() => assertCustomerPanelAuthCompositionApproval(approval));
  for (const copied of [{ ...approval }, JSON.parse(JSON.stringify(approval)), structuredClone(approval)]) {
    assert.throws(() => assertCustomerPanelAuthCompositionApproval(copied));
  }
  assert.throws(() => createCustomerPanelAuthCompositionApproval("production" as never));
});
