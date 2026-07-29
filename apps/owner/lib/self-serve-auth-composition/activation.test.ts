import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOwnerSelfServeAuthCompositionApproval,
  createOwnerSelfServeAuthCompositionApproval,
} from "./activation.ts";

test("Owner composition approval is exact, disabled, unmounted, and unforgeable", () => {
  const approval = createOwnerSelfServeAuthCompositionApproval("disposable_test");
  assert.deepEqual(approval, {
    phase: "2B2B2B",
    environment: "disposable_test",
    composition: "ready_unmounted",
    defaultRoutes: "disabled",
    productionActivation: "forbidden",
    providerNetworking: "injected_only",
    routeMutation: "forbidden",
  });
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isSealed(approval), true);
  assert.doesNotThrow(() => assertOwnerSelfServeAuthCompositionApproval(approval));
  for (const copied of [{ ...approval }, JSON.parse(JSON.stringify(approval)), structuredClone(approval)]) {
    assert.throws(() => assertOwnerSelfServeAuthCompositionApproval(copied));
  }
  assert.throws(() => createOwnerSelfServeAuthCompositionApproval("production" as never));
});
