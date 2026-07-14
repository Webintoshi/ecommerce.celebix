import type { OidcCallbackInput } from "../self-serve-oidc.ts";
import {
  assertPersistentSelfServeRuntime,
  type PersistentSelfServeRuntime,
} from "../self-serve-http/runtime.ts";
import {
  isInitialVerifiedCallbackGrantBoundaryForRuntime,
  type InitialCallbackExecutionResult,
  type InitialVerifiedCallbackCompletion,
  type InitialVerifiedCallbackGrantBoundary,
} from "./initial-callback-grant.ts";
import type {
  PanelSessionHandoffIssuerResult,
  PostgresPanelSessionHandoffIssuer,
} from "./postgres-handoff-issuer.ts";

export interface InitialCallbackPanelSessionHandoffResult {
  completion: InitialVerifiedCallbackCompletion;
  handoff: PanelSessionHandoffIssuerResult;
}

export interface InitialCallbackPanelSessionHandoffExecutor {
  execute(callback: OidcCallbackInput): Promise<InitialCallbackExecutionResult<InitialCallbackPanelSessionHandoffResult>>;
}

export function createInitialCallbackPanelSessionHandoffExecutor(input: {
  runtime: PersistentSelfServeRuntime;
  boundary: InitialVerifiedCallbackGrantBoundary;
  issuer: PostgresPanelSessionHandoffIssuer;
}): InitialCallbackPanelSessionHandoffExecutor {
  if (!input) throw new Error("initial_callback_handoff_executor_invalid");
  assertPersistentSelfServeRuntime(input.runtime);
  if (!isInitialVerifiedCallbackGrantBoundaryForRuntime(input.boundary, input.runtime)) {
    throw new Error("initial_callback_handoff_executor_invalid");
  }
  if (!input.issuer || typeof input.issuer.issueHandoff !== "function" || typeof input.issuer.recoverHandoff !== "function") {
    throw new Error("initial_callback_handoff_executor_invalid");
  }
  const boundary = input.boundary;
  const issuer = input.issuer;

  return Object.freeze({
    execute(callback: OidcCallbackInput) {
      return boundary.executeInitialCallback(callback, async (initialCallbackGrant, completion) => {
        const handoff = await issuer.issueHandoff({
          rawState: callback.state,
          initialCallbackGrant,
        });
        const recovered = handoff.kind === "commit_unknown"
          ? await issuer.recoverHandoff({
            rawState: callback.state,
            candidateCredential: handoff.credential,
            initialCallbackGrant,
          })
          : handoff;
        return Object.freeze({ completion, handoff: recovered });
      });
    },
  });
}
