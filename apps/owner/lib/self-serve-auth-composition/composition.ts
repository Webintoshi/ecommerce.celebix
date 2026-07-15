import {
  DEFAULT_SAAS_AUTH_AUTHORITY_PROFILE,
  PANEL_BROWSER_BINDING_INTERNAL_PATH,
  PANEL_OIDC_CALLBACK_URL,
  PANEL_SESSION_COMPLETION_REQUEST_SCHEMA_VERSION,
  SELF_SERVE_INTERNAL_CALLBACK_PATH,
  assertSaaSAuthAuthorityProfile,
  type SaaSAuthAuthorityProfile,
} from "../../../../packages/platform-config/src/saas.ts";
import type { PanelBrowserBindingAuthorityCodec } from "../panel-browser-binding/credential-codec.ts";
import {
  createOwnerPanelBrowserBindingInternalGateway,
  createPanelBrowserBindingInternalGatewayApproval,
} from "../panel-browser-binding/internal-gateway.ts";
import type { PostgresPanelBrowserBindingRepository } from "../panel-browser-binding/postgres-repository.ts";
import { createPanelBrowserBindingRegistrationStartExecutor } from "../panel-browser-binding/start-executor.ts";
import { createPanelSessionHandoffApproval } from "../panel-session-handoff/activation.ts";
import { createInitialVerifiedCallbackGrantBoundary } from "../panel-session-handoff/initial-callback-grant.ts";
import { createOwnerPanelSessionInitialCallbackHandler } from "../panel-session-handoff/internal-callback-handler.ts";
import {
  createOwnerPanelSessionHandoffGatewayApproval,
  createOwnerPanelSessionHandoffInternalGateway,
} from "../panel-session-handoff/internal-gateway.ts";
import {
  createFreshLoginRequiredResult,
  createSignedOwnerPanelSessionHandoffResponse,
} from "../panel-session-handoff/internal-response.ts";
import { createPostgresPanelSessionHandoffIssuer } from "../panel-session-handoff/postgres-handoff-issuer.ts";
import type { OpaqueStateDigester } from "../saas-persistence/identity-crypto.ts";
import {
  createBrowserBoundRegistrationBridgeApproval,
} from "../self-serve-browser-bound-registration/activation.ts";
import { createBrowserBoundSelfServeRegistrationHandler } from "../self-serve-browser-bound-registration/handler.ts";
import {
  assertPersistentSelfServeRuntime,
  type PersistentSelfServeRuntime,
} from "../self-serve-http/runtime.ts";
import {
  classifyReconstructedOwnerCallbackRequest,
  copyAuthenticatedOwnerInternalCallbackRawBody,
  createOwnerInternalCallbackRawRequestAuthenticator,
  OwnerInternalCallbackAuthenticationError,
} from "../self-serve-http/internal-callback-gateway.ts";
import { createVerifiedEdgeTrustBoundary } from "../self-serve-http/verified-edge-trust.ts";
import {
  assertOwnerSelfServeAuthCompositionApproval,
  type OwnerSelfServeAuthCompositionApproval,
} from "./activation.ts";

const compositions = new WeakSet<object>();

type Environment = OwnerSelfServeAuthCompositionApproval["environment"];
type HandoffIssuerDependencies = Parameters<typeof createPostgresPanelSessionHandoffIssuer>[1];
type HandoffIssuerOptions = Omit<
  HandoffIssuerDependencies,
  "stateDigester" | "clock" | "randomUuid" | "initialCallbackGrantBoundary"
>;
type BridgeAudit = Parameters<typeof createBrowserBoundSelfServeRegistrationHandler>[0]["audit"];
type BrowserStartAudit = Parameters<typeof createPanelBrowserBindingRegistrationStartExecutor>[0]["audit"];
type BrowserGatewayAudit = Parameters<typeof createOwnerPanelBrowserBindingInternalGateway>[0]["audit"];
type InitialCallbackAudit = Parameters<typeof createOwnerPanelSessionInitialCallbackHandler>[0]["audit"];
type SessionGatewayAudit = Parameters<typeof createOwnerPanelSessionHandoffInternalGateway>[0]["audit"];

function authorityBoundSessionGateway(options: {
  ownerInternalOrigin: string;
  panelCallbackAuthority: string;
  keys: ReadonlyMap<string, Uint8Array>;
  clock(): Date;
  maximumBodyBytes: number;
  edgeTrustBoundary: ReturnType<typeof createVerifiedEdgeTrustBoundary>;
  callbackHandler: ReturnType<typeof createOwnerPanelSessionInitialCallbackHandler>;
  audit: SessionGatewayAudit;
}) {
  const authenticator = createOwnerInternalCallbackRawRequestAuthenticator({
    ownerInternalOrigin: options.ownerInternalOrigin,
    keys: options.keys,
    clock: options.clock,
    maximumBodyBytes: options.maximumBodyBytes,
  });
  const binding = (value: unknown): string => {
    if (typeof value !== "string" || !/^pb1\.[A-Za-z0-9_-]{43}$/.test(value)) invalid();
    const bytes = Buffer.from(value.slice(4), "base64url");
    if (bytes.byteLength !== 32 || bytes.toString("base64url") !== value.slice(4)) invalid();
    return value;
  };
  return async function ownerAuthorityBoundSessionGateway(request: Request): Promise<Response> {
    let authenticated;
    try { authenticated = await authenticator.authenticate(request); }
    catch (error) {
      const status = error instanceof OwnerInternalCallbackAuthenticationError ? error.status : 400;
      return new Response('{"code":"owner_session_handoff_request_invalid"}', {
        status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
    let result;
    try {
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(
        copyAuthenticatedOwnerInternalCallbackRawBody(authenticated),
      );
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (
        !parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        Object.keys(parsed).join(",") !== "schemaVersion,callbackUrl,browserBindingCredential" ||
        parsed.schemaVersion !== PANEL_SESSION_COMPLETION_REQUEST_SCHEMA_VERSION ||
        typeof parsed.callbackUrl !== "string"
      ) invalid();
      const callback = classifyReconstructedOwnerCallbackRequest(
        new Request(parsed.callbackUrl, { method: "GET" }),
        options.panelCallbackAuthority,
      );
      const browserBindingCredential = binding(parsed.browserBindingCredential);
      if (raw !== JSON.stringify({
        schemaVersion: PANEL_SESSION_COMPLETION_REQUEST_SCHEMA_VERSION,
        callbackUrl: callback.callbackUrl,
        browserBindingCredential,
      })) invalid();
      result = await options.edgeTrustBoundary.invokeWithVerifiedContext((context) =>
        options.callbackHandler.handle(
          new Request(`${PANEL_OIDC_CALLBACK_URL}${new URL(callback.callbackUrl).search}`, { method: "GET" }),
          context,
          browserBindingCredential,
        ));
      try { void Promise.resolve(options.audit(Object.freeze({ stage: "callback", outcome: "completed" }))).catch(() => undefined); }
      catch { /* Observability only. */ }
    } catch {
      try { void Promise.resolve(options.audit(Object.freeze({ stage: "callback", outcome: "unavailable" }))).catch(() => undefined); }
      catch { /* Observability only. */ }
      result = createFreshLoginRequiredResult("callback_unavailable");
    }
    try { return createSignedOwnerPanelSessionHandoffResponse(result, authenticated as never); }
    catch {
      return new Response('{"code":"owner_session_handoff_request_invalid"}', {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }
  };
}

export type OwnerSelfServeAuthReadiness = Readonly<{
  schemaVersion: 1;
  phase: "2B2B2B";
  productionActivation: "forbidden";
  requiredNextGate: "route_mount_and_staging_e2e";
  endpoints: Readonly<{
    publicRegistration: Readonly<{ method: "POST"; path: "/api/self-serve/register"; state: "disabled_unmounted" }>;
    internalBrowserBinding: Readonly<{ method: "POST"; path: typeof PANEL_BROWSER_BINDING_INTERNAL_PATH; state: "disabled_unmounted" }>;
    internalCallback: Readonly<{ method: "POST"; path: typeof SELF_SERVE_INTERNAL_CALLBACK_PATH; state: "disabled_unmounted" }>;
  }>;
}>;

export type DisabledOwnerSelfServeAuthComposition = Readonly<{
  browserBoundRegistrationHandler: ReturnType<typeof createBrowserBoundSelfServeRegistrationHandler>;
  browserBindingInternalGateway: ReturnType<typeof createOwnerPanelBrowserBindingInternalGateway>;
  sessionHandoffInternalGateway: ReturnType<typeof createOwnerPanelSessionHandoffInternalGateway>;
  readiness: OwnerSelfServeAuthReadiness;
}>;

function invalid(): never {
  throw new Error("owner_self_serve_auth_composition_invalid");
}

function readiness(): OwnerSelfServeAuthReadiness {
  const endpoints = Object.freeze({
    publicRegistration: Object.freeze({
      method: "POST" as const,
      path: "/api/self-serve/register" as const,
      state: "disabled_unmounted" as const,
    }),
    internalBrowserBinding: Object.freeze({
      method: "POST" as const,
      path: PANEL_BROWSER_BINDING_INTERNAL_PATH,
      state: "disabled_unmounted" as const,
    }),
    internalCallback: Object.freeze({
      method: "POST" as const,
      path: SELF_SERVE_INTERNAL_CALLBACK_PATH,
      state: "disabled_unmounted" as const,
    }),
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    phase: "2B2B2B" as const,
    productionActivation: "forbidden" as const,
    requiredNextGate: "route_mount_and_staging_e2e" as const,
    endpoints,
  });
}

export function assertDisabledOwnerSelfServeAuthComposition(
  value: unknown,
): asserts value is DisabledOwnerSelfServeAuthComposition {
  if (!value || typeof value !== "object" || !compositions.has(value) ||
      !Object.isFrozen(value) || !Object.isSealed(value)) invalid();
}

export function createDisabledOwnerSelfServeAuthComposition(options: {
  activationApproval: unknown;
  runtime: PersistentSelfServeRuntime;
  authorityProfile?: SaaSAuthAuthorityProfile;
  stateDigester: OpaqueStateDigester;
  browserBindingCredentialCodec: PanelBrowserBindingAuthorityCodec;
  browserBindingRepository: PostgresPanelBrowserBindingRepository;
  ownerInternalOrigin: string;
  browserBindingInternalKeys: ReadonlyMap<string, Uint8Array>;
  sessionCompletionInternalKeys: ReadonlyMap<string, Uint8Array>;
  browserBindingMaximumBodyBytes: number;
  sessionCompletionMaximumBodyBytes: number;
  clock(): Date;
  randomUuid(): string;
  randomNonceBytes(size: number): Uint8Array;
  handoffIssuer: HandoffIssuerOptions;
  bridgeAudit: BridgeAudit;
  browserBindingStartAudit: BrowserStartAudit;
  browserBindingGatewayAudit: BrowserGatewayAudit;
  initialCallbackAudit: InitialCallbackAudit;
  sessionHandoffGatewayAudit: SessionGatewayAudit;
}): DisabledOwnerSelfServeAuthComposition {
  assertOwnerSelfServeAuthCompositionApproval(options?.activationApproval);
  assertPersistentSelfServeRuntime(options.runtime);
  if (
    !options.stateDigester || typeof options.stateDigester.digest !== "function" ||
    !options.browserBindingCredentialCodec || !options.browserBindingRepository ||
    typeof options.clock !== "function" || typeof options.randomUuid !== "function" ||
    typeof options.randomNonceBytes !== "function"
  ) invalid();
  const environment: Environment = options.activationApproval.environment;
  const authority = options.authorityProfile ?? DEFAULT_SAAS_AUTH_AUTHORITY_PROFILE;
  try { assertSaaSAuthAuthorityProfile(authority); } catch { return invalid(); }
  if (options.ownerInternalOrigin !== authority.ownerOrigin) invalid();
  const runtime = options.runtime;
  const clock = options.clock;
  const randomUuid = options.randomUuid;
  const stateDigester = options.stateDigester;
  const repository = options.browserBindingRepository;

  const registrationStartExecutor = createPanelBrowserBindingRegistrationStartExecutor({
    runtime,
    stateDigester,
    credentialCodec: options.browserBindingCredentialCodec,
    repository,
    panelBootstrapAuthority: authority.panelBootstrapUrl,
    panelCallbackAuthority: authority.panelCallbackUrl,
    clock,
    randomUuid,
    audit: options.browserBindingStartAudit,
  });
  const browserBoundRegistrationHandler = createBrowserBoundSelfServeRegistrationHandler({
    activationApproval: createBrowserBoundRegistrationBridgeApproval(environment),
    runtime,
    registrationStartExecutor,
    randomBytes: options.randomNonceBytes,
    panelBootstrapAuthority: authority.panelBootstrapUrl,
    audit: options.bridgeAudit,
  });

  const browserBindingInternalGateway = createOwnerPanelBrowserBindingInternalGateway({
    activationApproval: createPanelBrowserBindingInternalGatewayApproval(environment),
    ownerInternalOrigin: options.ownerInternalOrigin,
    panelCallbackAuthority: authority.panelCallbackUrl,
    keys: options.browserBindingInternalKeys,
    clock,
    maximumBodyBytes: options.browserBindingMaximumBodyBytes,
    repository,
    audit: options.browserBindingGatewayAudit,
  });

  const edgeTrustBoundary = createVerifiedEdgeTrustBoundary();
  const initialCallbackGrantBoundary = createInitialVerifiedCallbackGrantBoundary(runtime);
  const handoffApproval = createPanelSessionHandoffApproval(environment);
  const issuer = createPostgresPanelSessionHandoffIssuer(handoffApproval, {
    ...options.handoffIssuer,
    stateDigester,
    clock,
    randomUuid,
    initialCallbackGrantBoundary,
  });
  const callbackHandler = createOwnerPanelSessionInitialCallbackHandler({
    runtime,
    edgeTrustBoundary,
    initialCallbackGrantBoundary,
    issuer,
    browserBindingRepository: repository,
    clock,
    audit: options.initialCallbackAudit,
  });
  const sessionHandoffInternalGateway = authority === DEFAULT_SAAS_AUTH_AUTHORITY_PROFILE
    ? createOwnerPanelSessionHandoffInternalGateway({
        activationApproval: createOwnerPanelSessionHandoffGatewayApproval(environment),
        ownerInternalOrigin: options.ownerInternalOrigin,
        keys: options.sessionCompletionInternalKeys,
        clock,
        maximumBodyBytes: options.sessionCompletionMaximumBodyBytes,
        edgeTrustBoundary,
        callbackHandler,
        audit: options.sessionHandoffGatewayAudit,
      })
    : authorityBoundSessionGateway({
        ownerInternalOrigin: options.ownerInternalOrigin,
        panelCallbackAuthority: authority.panelCallbackUrl,
        keys: options.sessionCompletionInternalKeys,
        clock,
        maximumBodyBytes: options.sessionCompletionMaximumBodyBytes,
        edgeTrustBoundary,
        callbackHandler,
        audit: options.sessionHandoffGatewayAudit,
      });

  const composition: DisabledOwnerSelfServeAuthComposition = {
    browserBoundRegistrationHandler,
    browserBindingInternalGateway,
    sessionHandoffInternalGateway,
    readiness: readiness(),
  };
  compositions.add(composition);
  return Object.freeze(composition);
}
