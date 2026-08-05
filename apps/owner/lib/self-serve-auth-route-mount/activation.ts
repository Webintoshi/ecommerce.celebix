const approvals = new WeakSet<object>();

export type OwnerSelfServeAuthRouteMountApproval = Readonly<{
  phase: "2B2B2C1";
  environment: "approved_staging";
  routeMount: "injected_only";
  defaultMode: "disabled";
  productionActivation: "forbidden";
  secretLoading: "forbidden";
  providerNetworking: "forbidden";
  deployment: "forbidden";
}>;

function invalid(): never {
  throw new Error("owner_self_serve_auth_route_mount_approval_invalid");
}

export function createOwnerSelfServeAuthRouteMountApproval(
  environment: "approved_staging",
): OwnerSelfServeAuthRouteMountApproval {
  if (environment !== "approved_staging") invalid();
  const approval: OwnerSelfServeAuthRouteMountApproval = {
    phase: "2B2B2C1",
    environment,
    routeMount: "injected_only",
    defaultMode: "disabled",
    productionActivation: "forbidden",
    secretLoading: "forbidden",
    providerNetworking: "forbidden",
    deployment: "forbidden",
  };
  approvals.add(approval);
  return Object.freeze(approval);
}

export function assertOwnerSelfServeAuthRouteMountApproval(
  value: unknown,
): asserts value is OwnerSelfServeAuthRouteMountApproval {
  if (
    !value || typeof value !== "object" || !approvals.has(value) ||
    !Object.isFrozen(value) || !Object.isSealed(value)
  ) invalid();
}
