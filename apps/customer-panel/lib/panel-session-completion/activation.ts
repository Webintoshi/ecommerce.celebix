const approvals = new WeakSet<object>();

export type PanelSessionCompletionApproval = Readonly<{
  purpose: "phase2b2b2a_panel_session_completion";
  environment: "disposable_test" | "approved_staging";
  defaultRoute: "disabled";
  cookiePolicy: "secure_host_only";
  redirectPolicy: "fixed_same_origin";
  callbackReplay: "fresh_login_required";
  providerNetworking: "forbidden";
}>;

function invalid(): never {
  throw new Error("panel_session_completion_approval_invalid");
}

export function createPanelSessionCompletionApproval(
  environment: "disposable_test" | "approved_staging",
): PanelSessionCompletionApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") invalid();
  const approval: PanelSessionCompletionApproval = {
    purpose: "phase2b2b2a_panel_session_completion",
    environment,
    defaultRoute: "disabled",
    cookiePolicy: "secure_host_only",
    redirectPolicy: "fixed_same_origin",
    callbackReplay: "fresh_login_required",
    providerNetworking: "forbidden",
  };
  approvals.add(approval);
  return Object.freeze(approval);
}

export function assertPanelSessionCompletionApproval(
  value: unknown,
): asserts value is PanelSessionCompletionApproval {
  if (!value || typeof value !== "object" || !approvals.has(value) || !Object.isFrozen(value) || !Object.isSealed(value)) invalid();
}
