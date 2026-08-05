import {
  classifyReconstructedOwnerCallbackRequest,
  copyAuthenticatedOwnerInternalCallbackRawBody,
  createOwnerInternalCallbackRawRequestAuthenticator,
  OwnerInternalCallbackAuthenticationError,
} from "../self-serve-http/internal-callback-gateway.ts";
import { PANEL_SESSION_COMPLETION_REQUEST_SCHEMA_VERSION } from "../../../../packages/platform-config/src/saas.ts";
import {
  assertVerifiedEdgeTrustBoundary,
  type VerifiedEdgeTrustBoundary,
} from "../self-serve-http/verified-edge-trust.ts";
import {
  isOwnerPanelSessionInitialCallbackHandlerForBoundary,
  type OwnerPanelSessionInitialCallbackHandler,
} from "./internal-callback-handler.ts";
import {
  createFreshLoginRequiredResult,
  createSignedOwnerPanelSessionHandoffResponse,
} from "./internal-response.ts";

const approvals = new WeakSet<object>();

export type OwnerPanelSessionHandoffGatewayApproval = Readonly<{
  purpose: "phase2b2b2a_owner_session_handoff_gateway";
  environment: "disposable_test" | "approved_staging";
  defaultRoute: "disabled";
  publicResponse: "forbidden";
  cookies: "forbidden";
  callbackReplay: "no_handoff";
  providerNetworking: "forbidden";
}>;

function invalid(): never {
  throw new Error("owner_panel_session_handoff_gateway_approval_invalid");
}

export function createOwnerPanelSessionHandoffGatewayApproval(
  environment: "disposable_test" | "approved_staging",
): OwnerPanelSessionHandoffGatewayApproval {
  if (environment !== "disposable_test" && environment !== "approved_staging") invalid();
  const approval: OwnerPanelSessionHandoffGatewayApproval = {
    purpose: "phase2b2b2a_owner_session_handoff_gateway",
    environment,
    defaultRoute: "disabled",
    publicResponse: "forbidden",
    cookies: "forbidden",
    callbackReplay: "no_handoff",
    providerNetworking: "forbidden",
  };
  approvals.add(approval);
  return Object.freeze(approval);
}

export function assertOwnerPanelSessionHandoffGatewayApproval(
  value: unknown,
): asserts value is OwnerPanelSessionHandoffGatewayApproval {
  if (!value || typeof value !== "object" || !approvals.has(value) || !Object.isFrozen(value) || !Object.isSealed(value)) invalid();
}

type GatewayAudit = (event: Readonly<{
  stage: "request_authentication" | "callback" | "response";
  outcome: "completed" | "rejected" | "unavailable";
}>) => void | Promise<void>;

function gatewayInvalid(): never {
  throw new Error("owner_panel_session_handoff_gateway_invalid");
}

function canonicalBrowserBindingCredential(value: unknown): string {
  if (typeof value !== "string" || !/^pb1\.[A-Za-z0-9_-]{43}$/.test(value)) gatewayInvalid();
  const token = value.slice(4);
  const bytes = Buffer.from(token, "base64url");
  if (bytes.byteLength !== 32 || bytes.toString("base64url") !== token) gatewayInvalid();
  return value;
}

export function parseCanonicalPanelSessionCompletionEnvelope(bytes: Uint8Array): Readonly<{
  callbackUrl: string;
  browserBindingCredential: string;
}> {
  try {
    if (!(bytes instanceof Uint8Array)) gatewayInvalid();
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) gatewayInvalid();
    const object = parsed as Record<string, unknown>;
    const keys = Object.keys(object);
    if (
      keys.length !== 3 || keys[0] !== "schemaVersion" || keys[1] !== "callbackUrl" ||
      keys[2] !== "browserBindingCredential" ||
      object.schemaVersion !== PANEL_SESSION_COMPLETION_REQUEST_SCHEMA_VERSION ||
      typeof object.callbackUrl !== "string"
    ) gatewayInvalid();
    const callback = classifyReconstructedOwnerCallbackRequest(new Request(object.callbackUrl, { method: "GET" }));
    const browserBindingCredential = canonicalBrowserBindingCredential(object.browserBindingCredential);
    const canonical = JSON.stringify({
      schemaVersion: PANEL_SESSION_COMPLETION_REQUEST_SCHEMA_VERSION,
      callbackUrl: callback.callbackUrl,
      browserBindingCredential,
    });
    if (canonical !== raw) gatewayInvalid();
    return Object.freeze({ callbackUrl: callback.callbackUrl, browserBindingCredential });
  } catch {
    return gatewayInvalid();
  }
}

function auditSafely(audit: GatewayAudit, event: Parameters<GatewayAudit>[0]): void {
  try { void Promise.resolve(audit(Object.freeze({ ...event }))).catch(() => undefined); }
  catch { /* Audit is observational only. */ }
}

function unsignedFailure(status: number): Response {
  return new Response('{"code":"owner_session_handoff_request_invalid"}', {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function createOwnerPanelSessionHandoffInternalGateway(options: {
  activationApproval: unknown;
  ownerInternalOrigin: string;
  keys: ReadonlyMap<string, Uint8Array>;
  clock(): Date;
  maximumBodyBytes: number;
  edgeTrustBoundary: VerifiedEdgeTrustBoundary;
  callbackHandler: OwnerPanelSessionInitialCallbackHandler;
  audit: GatewayAudit;
}) {
  assertOwnerPanelSessionHandoffGatewayApproval(options?.activationApproval);
  assertVerifiedEdgeTrustBoundary(options.edgeTrustBoundary);
  if (!isOwnerPanelSessionInitialCallbackHandlerForBoundary(options.callbackHandler, options.edgeTrustBoundary)) gatewayInvalid();
  if (typeof options.audit !== "function") gatewayInvalid();
  const authenticator = createOwnerInternalCallbackRawRequestAuthenticator({
    ownerInternalOrigin: options.ownerInternalOrigin,
    keys: options.keys,
    clock: options.clock,
    maximumBodyBytes: options.maximumBodyBytes,
  });
  const boundary = options.edgeTrustBoundary;
  const handler = options.callbackHandler;
  const audit = options.audit;

  return async function ownerPanelSessionHandoffInternalGateway(request: Request): Promise<Response> {
    let authenticated;
    try { authenticated = await authenticator.authenticate(request); }
    catch (error) {
      const status = error instanceof OwnerInternalCallbackAuthenticationError ? error.status : 400;
      auditSafely(audit, { stage: "request_authentication", outcome: "rejected" });
      return unsignedFailure(status);
    }

    let result;
    try {
      const envelope = parseCanonicalPanelSessionCompletionEnvelope(
        copyAuthenticatedOwnerInternalCallbackRawBody(authenticated),
      );
      result = await boundary.invokeWithVerifiedContext((context) => handler.handle(
        new Request(envelope.callbackUrl, { method: "GET" }),
        context,
        envelope.browserBindingCredential,
      ));
      auditSafely(audit, { stage: "callback", outcome: "completed" });
    } catch {
      auditSafely(audit, { stage: "callback", outcome: "unavailable" });
      result = createFreshLoginRequiredResult("callback_unavailable");
    }
    try {
      const response = createSignedOwnerPanelSessionHandoffResponse(result, authenticated as never);
      auditSafely(audit, { stage: "response", outcome: "completed" });
      return response;
    } catch {
      auditSafely(audit, { stage: "response", outcome: "unavailable" });
      return unsignedFailure(503);
    }
  };
}
