import type { PanelBrowserCredentialDigest } from "../panel-browser-binding/credential-codec.ts";
import {
  beginOidcAuthorization,
  completeOidcCallback,
  OidcFlowError,
  rejectOidcProviderCallback,
  type OidcCallbackInput,
  type OidcProviderPort,
  type OidcTransactionStore,
} from "../self-serve-oidc.ts";
import type { ReturningPanelSessionIssuerResult } from "./postgres-session-issuer.ts";

export type PanelReturningLoginStart = Readonly<
  | { kind: "panel_login_ready"; providerAuthorizationUrl: string; browserBindingExpiresAt: string }
  | { kind: "panel_login_unavailable"; retryable: false }
>;

export type PanelReturningLoginCompletion = Readonly<
  | { kind: "not_panel_login" }
  | { kind: "session_ready"; credential: string; issuedAt: string; expiresAt: string }
  | { kind: "fresh_login_required"; code: "callback_not_granted" | "callback_replayed" | "callback_unavailable" | "membership_denied" }
>;

type InspectorResult = "denied" | "not_panel_login" | Readonly<{
  kind: "approved";
  binding: PanelBrowserCredentialDigest;
}>;

interface InspectingOidcStore extends OidcTransactionStore {
  inspectPanelLoginBinding(
    state: string,
    candidates: readonly PanelBrowserCredentialDigest[],
    now: Date,
  ): Promise<InspectorResult>;
}

function invalid(): never { throw new Error("panel_returning_login_service_invalid"); }

function exactCallback(value: OidcCallbackInput): Readonly<OidcCallbackInput> {
  if (!value || typeof value !== "object" || typeof value.state !== "string" || value.state.length < 16 || value.state.length > 1_024 ||
      typeof value.code !== "string" || !value.code || value.code.length > 4_096 || value.state.trim() !== value.state || value.code.trim() !== value.code) invalid();
  return Object.freeze({ state: value.state, code: value.code, ...(value.responseIssuer ? { responseIssuer: value.responseIssuer } : {}) });
}

function trustedNow(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value);
}

export function createPanelReturningLoginService(options: {
  provider: OidcProviderPort;
  transactionStore: InspectingOidcStore;
  browserBindingCodec: Pick<
    import("../panel-browser-binding/credential-codec.ts").PanelBrowserBindingAuthorityCodec,
    "digestBrowserBindingCredential" | "digestBrowserBindingCredentialCandidates"
  >;
  sessionIssuer: { issue(identity: { issuer: string; subject: string }): Promise<ReturningPanelSessionIssuerResult> };
  callbackAuthority: string;
  expectedIssuer: string;
  expectedAudience: string;
  expectedAuthorizationOrigin: string;
  clock(): Date;
}) {
  if (
    !options?.provider || typeof options.provider.buildAuthorizationUrl !== "function" || typeof options.provider.verifyCallback !== "function" ||
    !options.transactionStore || typeof options.transactionStore.save !== "function" || typeof options.transactionStore.consume !== "function" ||
    typeof options.transactionStore.inspectPanelLoginBinding !== "function" || !options.browserBindingCodec ||
    typeof options.browserBindingCodec.digestBrowserBindingCredential !== "function" ||
    typeof options.browserBindingCodec.digestBrowserBindingCredentialCandidates !== "function" ||
    !options.sessionIssuer || typeof options.sessionIssuer.issue !== "function" || typeof options.clock !== "function"
  ) invalid();
  trustedNow(options.clock);

  return Object.freeze({
    async start(browserBindingCredential: string): Promise<PanelReturningLoginStart> {
      try {
        const binding = options.browserBindingCodec.digestBrowserBindingCredential(browserBindingCredential);
        const started = await beginOidcAuthorization({
          provider: options.provider,
          transactionStore: options.transactionStore,
          redirectUri: options.callbackAuthority,
          returnTo: "/login",
          panelLoginBinding: binding,
          expectedIssuer: options.expectedIssuer,
          expectedAudience: options.expectedAudience,
          expectedAuthorizationOrigin: options.expectedAuthorizationOrigin,
          expectedCallbackAuthority: options.callbackAuthority,
          now: options.clock,
        });
        return Object.freeze({
          kind: "panel_login_ready",
          providerAuthorizationUrl: started.authorizationUrl,
          browserBindingExpiresAt: started.expiresAt,
        });
      } catch {
        return Object.freeze({ kind: "panel_login_unavailable", retryable: false });
      }
    },

    async tryComplete(callbackInput: OidcCallbackInput, browserBindingCredential: string): Promise<PanelReturningLoginCompletion> {
      let callback: Readonly<OidcCallbackInput>;
      let inspected: InspectorResult;
      try {
        callback = exactCallback(callbackInput);
        const candidates = options.browserBindingCodec.digestBrowserBindingCredentialCandidates(browserBindingCredential);
        inspected = await options.transactionStore.inspectPanelLoginBinding(callback.state, candidates, trustedNow(options.clock));
      } catch { return Object.freeze({ kind: "fresh_login_required", code: "callback_not_granted" }); }
      if (inspected === "not_panel_login") return Object.freeze({ kind: "not_panel_login" });
      if (inspected === "denied") return Object.freeze({ kind: "fresh_login_required", code: "callback_not_granted" });

      try {
        const completed = await completeOidcCallback({
          provider: options.provider,
          transactionStore: options.transactionStore,
          callback,
          panelLoginBinding: inspected.binding,
          now: options.clock,
        });
        if (completed.returnTo !== "/login") return Object.freeze({ kind: "fresh_login_required", code: "callback_not_granted" });
        const issued = await options.sessionIssuer.issue({ issuer: completed.identity.issuer, subject: completed.identity.subject });
        if (issued.kind === "session_issued") return Object.freeze({ kind: "session_ready", credential: issued.credential, issuedAt: issued.issuedAt, expiresAt: issued.expiresAt });
        return Object.freeze({
          kind: "fresh_login_required",
          code: issued.kind === "membership_denied" ? "membership_denied" : "callback_unavailable",
        });
      } catch (error) {
        return Object.freeze({
          kind: "fresh_login_required",
          code: error instanceof OidcFlowError && error.code === "oidc_state_replayed" ? "callback_replayed" : "callback_unavailable",
        });
      }
    },

    async tryRejectProvider(state: string, responseIssuer: string | undefined, browserBindingCredential: string): Promise<PanelReturningLoginCompletion> {
      let inspected: InspectorResult;
      try {
        const candidates = options.browserBindingCodec.digestBrowserBindingCredentialCandidates(browserBindingCredential);
        inspected = await options.transactionStore.inspectPanelLoginBinding(state, candidates, trustedNow(options.clock));
      } catch { return Object.freeze({ kind: "fresh_login_required", code: "callback_not_granted" }); }
      if (inspected === "not_panel_login") return Object.freeze({ kind: "not_panel_login" });
      if (inspected === "denied") return Object.freeze({ kind: "fresh_login_required", code: "callback_not_granted" });
      try {
        await rejectOidcProviderCallback({ transactionStore: options.transactionStore, state, responseIssuer, now: options.clock });
        return Object.freeze({ kind: "fresh_login_required", code: "callback_not_granted" });
      } catch (error) {
        return Object.freeze({
          kind: "fresh_login_required",
          code: error instanceof OidcFlowError && error.code === "oidc_state_replayed" ? "callback_replayed" : "callback_unavailable",
        });
      }
    },
  });
}
