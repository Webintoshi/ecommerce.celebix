const approvals = new WeakSet<object>();

export type BrowserBoundRegistrationBridgeApproval = Readonly<{
  purpose: "phase2b2b2b_browser_bound_registration_bridge";
  environment: "disposable_test" | "approved_staging";
  defaultRoute: "disabled";
  responseMode: "auto_post_html";
  providerTransition: "panel_bootstrap_only";
  ownerCookies: "forbidden";
  providerNetworking: "injected_only";
  productionActivation: "forbidden";
}>;

function invalid(): never {
  throw new Error("browser_bound_registration_bridge_approval_invalid");
}

export function createBrowserBoundRegistrationBridgeApproval(
  environment: "disposable_test" | "approved_staging",
): BrowserBoundRegistrationBridgeApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") invalid();
  const approval: BrowserBoundRegistrationBridgeApproval = {
    purpose: "phase2b2b2b_browser_bound_registration_bridge",
    environment,
    defaultRoute: "disabled",
    responseMode: "auto_post_html",
    providerTransition: "panel_bootstrap_only",
    ownerCookies: "forbidden",
    providerNetworking: "injected_only",
    productionActivation: "forbidden",
  };
  approvals.add(approval);
  return Object.freeze(approval);
}

export function assertBrowserBoundRegistrationBridgeApproval(
  value: unknown,
): asserts value is BrowserBoundRegistrationBridgeApproval {
  if (
    !value || typeof value !== "object" || !approvals.has(value) ||
    !Object.isFrozen(value) || !Object.isSealed(value)
  ) invalid();
}
