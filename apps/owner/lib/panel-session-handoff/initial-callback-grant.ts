import { OidcFlowError, type OidcCallbackInput } from "../self-serve-oidc.ts";
import {
  assertPersistentSelfServeRuntime,
  type PersistentSelfServeRuntime,
  type SelfServeCallbackServiceResult,
} from "../self-serve-http/runtime.ts";

export type InitialVerifiedCallbackCompletion = Extract<
  SelfServeCallbackServiceResult,
  { kind: "tenant_created_session_pending" | "tenant_recovered_session_pending" | "tenant_already_created_session_pending" }
>;

export interface InitialVerifiedCallbackGrant {
  readonly __initialVerifiedCallbackGrant?: never;
}

export type InitialCallbackExecutionResult<T> =
  | { kind: "initial_callback_granted"; completion: InitialVerifiedCallbackCompletion; value: T }
  | { kind: "initial_callback_completed_without_grant"; completion: SelfServeCallbackServiceResult }
  | { kind: "initial_callback_replayed" };

export interface InitialVerifiedCallbackGrantBoundary {
  executeInitialCallback<T>(
    callback: OidcCallbackInput,
    work: (grant: InitialVerifiedCallbackGrant, completion: InitialVerifiedCallbackCompletion) => T | Promise<T>,
  ): Promise<InitialCallbackExecutionResult<T>>;
}

interface BoundaryAuthority {
  runtime: PersistentSelfServeRuntime;
  active: WeakSet<object>;
}

const authorities = new WeakMap<object, BoundaryAuthority>();

function successful(
  completion: SelfServeCallbackServiceResult,
): completion is InitialVerifiedCallbackCompletion {
  return completion.kind === "tenant_created_session_pending"
    || completion.kind === "tenant_recovered_session_pending"
    || completion.kind === "tenant_already_created_session_pending";
}

function frozenResult<T extends object>(value: T): T {
  return Object.freeze(value);
}

export function isActiveInitialVerifiedCallbackGrant(
  boundary: InitialVerifiedCallbackGrantBoundary,
  grant: unknown,
): grant is InitialVerifiedCallbackGrant {
  const authority = boundary && typeof boundary === "object" ? authorities.get(boundary) : undefined;
  return Boolean(authority && grant && typeof grant === "object" && authority.active.has(grant));
}

export function isInitialVerifiedCallbackGrantBoundary(
  boundary: unknown,
): boundary is InitialVerifiedCallbackGrantBoundary {
  return Boolean(boundary && typeof boundary === "object" && authorities.has(boundary));
}

export function isInitialVerifiedCallbackGrantBoundaryForRuntime(
  boundary: InitialVerifiedCallbackGrantBoundary,
  runtime: PersistentSelfServeRuntime,
): boolean {
  return authorities.get(boundary)?.runtime === runtime;
}

export function createInitialVerifiedCallbackGrantBoundary(
  runtime: PersistentSelfServeRuntime,
): InitialVerifiedCallbackGrantBoundary {
  assertPersistentSelfServeRuntime(runtime);
  const completeCallback = runtime.completeCallback.bind(runtime);
  const authority: BoundaryAuthority = { runtime, active: new WeakSet<object>() };

  const boundary: InitialVerifiedCallbackGrantBoundary = {
    async executeInitialCallback<T>(
      callback: OidcCallbackInput,
      work: (grant: InitialVerifiedCallbackGrant, completion: InitialVerifiedCallbackCompletion) => T | Promise<T>,
    ): Promise<InitialCallbackExecutionResult<T>> {
      if (typeof work !== "function") throw new Error("initial_verified_callback_grant_invalid");
      let completion: SelfServeCallbackServiceResult;
      try {
        completion = await completeCallback(callback);
      } catch (error) {
        if (error instanceof OidcFlowError && error.code === "oidc_state_replayed") {
          return frozenResult({ kind: "initial_callback_replayed" });
        }
        throw error;
      }
      const capturedCompletion = frozenResult({ ...completion }) as SelfServeCallbackServiceResult;
      if (!successful(capturedCompletion)) {
        return frozenResult({ kind: "initial_callback_completed_without_grant", completion: capturedCompletion });
      }

      const grant = Object.freeze(Object.create(null)) as InitialVerifiedCallbackGrant;
      authority.active.add(grant);
      try {
        const value = await work(grant, capturedCompletion);
        return frozenResult({ kind: "initial_callback_granted", completion: capturedCompletion, value });
      } finally {
        authority.active.delete(grant);
      }
    },
  };
  authorities.set(boundary, authority);
  return Object.freeze(boundary);
}
