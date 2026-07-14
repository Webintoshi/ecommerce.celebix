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
import {
  isPostgresPanelSessionHandoffIssuerForBoundary,
  type PanelSessionHandoffIssuerResult,
  type PostgresPanelSessionHandoffIssuer,
} from "./postgres-handoff-issuer.ts";

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function callbackValue(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum
    || value.trim() !== value || CONTROL_CHARACTER.test(value)) {
    throw new Error("initial_callback_handoff_executor_invalid");
  }
  return value;
}

function snapshotCallback(callback: OidcCallbackInput): Readonly<OidcCallbackInput> {
  if (!callback || typeof callback !== "object") throw new Error("initial_callback_handoff_executor_invalid");
  const state = callbackValue(callback.state, 16, 1_024);
  const code = callbackValue(callback.code, 1, 4_096);
  return Object.freeze({ state, code });
}

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
  if (!isPostgresPanelSessionHandoffIssuerForBoundary(input.issuer, input.boundary)) {
    throw new Error("initial_callback_handoff_executor_invalid");
  }
  const boundary = input.boundary;
  const issuer = input.issuer;

  return Object.freeze({
    execute(callback: OidcCallbackInput) {
      const callbackSnapshot = snapshotCallback(callback);
      return boundary.executeInitialCallback(callbackSnapshot, async (initialCallbackGrant, completion) => {
        const handoff = await issuer.issueHandoff({
          rawState: callbackSnapshot.state,
          initialCallbackGrant,
        });
        const recovered = handoff.kind === "commit_unknown"
          ? await issuer.recoverHandoff({
            rawState: callbackSnapshot.state,
            candidateCredential: handoff.credential,
            initialCallbackGrant,
          })
          : handoff;
        return Object.freeze({ completion, handoff: recovered });
      });
    },
  });
}
