import assert from "node:assert/strict";
import test from "node:test";

import { createPanelBrowserBindingBootstrapApproval } from "./activation.ts";

test("browser bootstrap approval is sealed, unmounted, injected-only, and never production", () => {
  const approval = createPanelBrowserBindingBootstrapApproval("disposable_test");
  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isSealed(approval), true);
  assert.deepEqual(approval, {
    purpose: "phase2b2b2a1_panel_browser_bootstrap",
    environment: "disposable_test",
    defaultRoute: "disabled",
    ownerTransport: "authenticated_injected_only",
    providerRedirect: "owner_verified_only",
  });
  assert.throws(() => createPanelBrowserBindingBootstrapApproval("production" as never), /panel_browser_binding_bootstrap_approval_invalid/);
});
