const approvals = new WeakSet<object>();

export type CustomerPanelAuthCompositionApproval = Readonly<{
  phase: "2B2B2B";
  environment: "disposable_test" | "approved_staging";
  composition: "ready_unmounted";
  defaultRoutes: "disabled";
  productionActivation: "forbidden";
  providerNetworking: "injected_only";
  routeMutation: "forbidden";
}>;

function invalid(): never {
  throw new Error("customer_panel_auth_composition_approval_invalid");
}

export function createCustomerPanelAuthCompositionApproval(
  environment: "disposable_test" | "approved_staging",
): CustomerPanelAuthCompositionApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") invalid();
  const approval: CustomerPanelAuthCompositionApproval = {
    phase: "2B2B2B",
    environment,
    composition: "ready_unmounted",
    defaultRoutes: "disabled",
    productionActivation: "forbidden",
    providerNetworking: "injected_only",
    routeMutation: "forbidden",
  };
  approvals.add(approval);
  return Object.freeze(approval);
}

export function assertCustomerPanelAuthCompositionApproval(
  value: unknown,
): asserts value is CustomerPanelAuthCompositionApproval {
  if (!value || typeof value !== "object" || !approvals.has(value) ||
      !Object.isFrozen(value) || !Object.isSealed(value)) invalid();
}
