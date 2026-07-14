const approvals = new WeakSet<object>();

export type PanelBrowserBindingBootstrapApproval = Readonly<{
  purpose: "phase2b2b2a1_panel_browser_bootstrap";
  environment: "disposable_test" | "approved_staging";
  defaultRoute: "disabled";
  ownerTransport: "authenticated_injected_only";
  providerRedirect: "owner_verified_only";
}>;

function invalid(): never {
  throw new Error("panel_browser_binding_bootstrap_approval_invalid");
}

export function createPanelBrowserBindingBootstrapApproval(
  environment: "disposable_test" | "approved_staging",
): PanelBrowserBindingBootstrapApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") invalid();
  const approval: PanelBrowserBindingBootstrapApproval = {
    purpose: "phase2b2b2a1_panel_browser_bootstrap",
    environment,
    defaultRoute: "disabled",
    ownerTransport: "authenticated_injected_only",
    providerRedirect: "owner_verified_only",
  };
  approvals.add(approval);
  return Object.freeze(approval);
}

export function assertPanelBrowserBindingBootstrapApproval(
  value: unknown,
): asserts value is PanelBrowserBindingBootstrapApproval {
  if (!value || typeof value !== "object" || !approvals.has(value) || !Object.isFrozen(value)) invalid();
}
