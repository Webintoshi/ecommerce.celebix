export type PanelSessionPersistenceEnvironment = "disposable_test" | "approved_staging";

export interface PanelSessionPersistenceApproval {
  readonly purpose: "phase2b2a_panel_session_persistence";
  readonly environment: PanelSessionPersistenceEnvironment;
  readonly publicActivation: "disabled";
  readonly cookies: "forbidden";
  readonly routes: "forbidden";
  readonly callbackIssuance: "forbidden";
  readonly providerNetworking: "forbidden";
}

const approvals = new WeakSet<object>();

function invalid(): never {
  throw new Error("panel_session_approval_invalid");
}

export function createPanelSessionPersistenceApproval(
  environment: PanelSessionPersistenceEnvironment,
): PanelSessionPersistenceApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") invalid();
  const approval: PanelSessionPersistenceApproval = Object.freeze({
    purpose: "phase2b2a_panel_session_persistence",
    environment,
    publicActivation: "disabled",
    cookies: "forbidden",
    routes: "forbidden",
    callbackIssuance: "forbidden",
    providerNetworking: "forbidden",
  });
  approvals.add(approval);
  return approval;
}

export function assertPanelSessionPersistenceApproval(
  approval: unknown,
): asserts approval is PanelSessionPersistenceApproval {
  if (
    typeof approval !== "object"
    || approval === null
    || !approvals.has(approval)
    || !Object.isFrozen(approval)
    || !Object.isSealed(approval)
  ) {
    invalid();
  }
}
