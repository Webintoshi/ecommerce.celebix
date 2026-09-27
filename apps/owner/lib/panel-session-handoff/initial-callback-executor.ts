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
  const responseIssuer = callback.responseIssuer === undefined
    ? undefined
    : callbackValue(callback.responseIssuer, 1, 2_048);
  return Object.freeze({ state, code, ...(responseIssuer ? { responseIssuer } : {}) });
}

export type InitialCallbackPanelSessionHandoffResult = Readonly<
 | {kind:"handoff_ready";completion:InitialVerifiedCallbackCompletion;handoff:PanelSessionHandoffIssuerResult}
 | {kind:"onboarding_pending";completion:InitialVerifiedCallbackCompletion;handoff?:never}
>;

export interface InitialCallbackPanelSessionHandoffExecutor {
  execute(callback: OidcCallbackInput, budget?: {remainingBudgetMs():number}): Promise<InitialCallbackExecutionResult<InitialCallbackPanelSessionHandoffResult>>;
}

export function createInitialCallbackPanelSessionHandoffExecutor(input: {
  runtime: PersistentSelfServeRuntime;
  boundary: InitialVerifiedCallbackGrantBoundary;
  issuer: PostgresPanelSessionHandoffIssuer;
  onboarding?: {readCachedReady(rawState:string):Promise<boolean>};
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
    execute(callback: OidcCallbackInput, budget?: {remainingBudgetMs():number}) {
      const callbackSnapshot = snapshotCallback(callback);
      return boundary.executeInitialCallback<InitialCallbackPanelSessionHandoffResult>(callbackSnapshot, async (initialCallbackGrant, completion) => {
        if (input.onboarding) {
          const remaining=budget?.remainingBudgetMs() ?? 0;
          const milliseconds=Math.min(100, Math.floor(remaining));
          let timer:ReturnType<typeof setTimeout>|undefined;
          let ready=false;
          if(milliseconds>0) {
            try { ready=await Promise.race([Promise.resolve().then(()=>input.onboarding!.readCachedReady(callbackSnapshot.state)),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),milliseconds);})]); }
            catch { ready=false; } finally {if(timer!==undefined)clearTimeout(timer);}
          }
          if(ready !== true || (budget?.remainingBudgetMs() ?? 0)<=0) return Object.freeze({kind:"onboarding_pending",completion});
        }
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
        return Object.freeze({ kind:"handoff_ready", completion, handoff: recovered });
      });
    },
  });
}
