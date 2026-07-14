export type PanelSessionHandoffEnvironment = "disposable_test" | "approved_staging";

export interface PanelSessionHandoffApproval {
  readonly purpose: "phase2b2b1_panel_session_handoff";
  readonly environment: PanelSessionHandoffEnvironment;
  readonly routes: "forbidden";
  readonly cookies: "forbidden";
  readonly callbackMount: "forbidden";
  readonly publicResponse: "forbidden";
  readonly providerNetworking: "forbidden";
}

const approvals = new WeakSet<object>();

function invalid(): never {
  throw new Error("panel_session_handoff_approval_invalid");
}

export function createPanelSessionHandoffApproval(
  environment: PanelSessionHandoffEnvironment,
): PanelSessionHandoffApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") invalid();
  const approval: PanelSessionHandoffApproval = Object.freeze({
    purpose: "phase2b2b1_panel_session_handoff",
    environment,
    routes: "forbidden",
    cookies: "forbidden",
    callbackMount: "forbidden",
    publicResponse: "forbidden",
    providerNetworking: "forbidden",
  });
  approvals.add(approval);
  return approval;
}

export function assertPanelSessionHandoffApproval(
  approval: unknown,
): asserts approval is PanelSessionHandoffApproval {
  if (
    typeof approval !== "object"
    || approval === null
    || !approvals.has(approval)
    || !Object.isFrozen(approval)
    || !Object.isSealed(approval)
  ) invalid();
}
