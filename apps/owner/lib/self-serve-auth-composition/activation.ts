const approvals = new WeakSet<object>();

export type OwnerSelfServeAuthCompositionApproval = Readonly<{
  phase: "2B2B2B";
  environment: "disposable_test" | "approved_staging";
  composition: "ready_unmounted";
  defaultRoutes: "disabled";
  productionActivation: "forbidden";
  providerNetworking: "injected_only";
  routeMutation: "forbidden";
}>;

function invalid(): never {
  throw new Error("owner_self_serve_auth_composition_approval_invalid");
}

export function createOwnerSelfServeAuthCompositionApproval(
  environment: "disposable_test" | "approved_staging",
): OwnerSelfServeAuthCompositionApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") invalid();
  const approval: OwnerSelfServeAuthCompositionApproval = {
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

export function assertOwnerSelfServeAuthCompositionApproval(
  value: unknown,
): asserts value is OwnerSelfServeAuthCompositionApproval {
  if (!value || typeof value !== "object" || !approvals.has(value) ||
      !Object.isFrozen(value) || !Object.isSealed(value)) invalid();
}
