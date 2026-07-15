import { createDisabledOwnerInternalSelfServeCallbackGateway } from "../self-serve-http/internal-callback-gateway.ts";
import { createSelfServeRegistrationStartHandler } from "../self-serve-http/registration-start.ts";
import { createDisabledSelfServeRuntime } from "../self-serve-http/runtime.ts";
import {
  assertDisabledOwnerSelfServeAuthComposition,
  type DisabledOwnerSelfServeAuthComposition,
} from "../self-serve-auth-composition/composition.ts";
import {
  assertOwnerSelfServeAuthRouteMountApproval,
  type OwnerSelfServeAuthRouteMountApproval,
} from "./activation.ts";

const routeSets = new WeakSet<object>();

type RouteHandler = (request: Request) => Promise<Response>;

export type OwnerSelfServeAuthRouteReadiness = Readonly<{
  schemaVersion: 1;
  phase: "2B2B2C1";
  mode: "disabled" | "approved_staging_injected";
  productionActivation: "forbidden";
  requiredNextGate: "staging_runtime_provider_and_e2e";
  endpoints: Readonly<{
    publicRegistration: Readonly<{
      method: "POST";
      path: "/api/self-serve/register";
      state: "mounted_disabled" | "mounted_approved_staging";
    }>;
    internalBrowserBinding: Readonly<{
      method: "POST";
      path: "/api/internal/self-serve/browser-binding";
      state: "mounted_disabled" | "mounted_approved_staging";
    }>;
    internalCallback: Readonly<{
      method: "POST";
      path: "/api/internal/self-serve/oidc-callback";
      state: "mounted_disabled" | "mounted_approved_staging";
    }>;
  }>;
}>;

export type OwnerSelfServeAuthRouteSet = Readonly<{
  publicRegistration: RouteHandler;
  internalBrowserBinding: RouteHandler;
  internalCallback: RouteHandler;
  readiness: OwnerSelfServeAuthRouteReadiness;
}>;

function invalid(): never {
  throw new Error("owner_self_serve_auth_route_set_invalid");
}

function secure(response: Response): Response {
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.delete("location");
  response.headers.delete("set-cookie");
  return response;
}

function controlled(code: string, status: 405 | 503): Response {
  return secure(Response.json({ code, retryable: false }, { status }));
}

function secureDisabled(handler: RouteHandler): RouteHandler {
  return async function secureDisabledOwnerRoute(request: Request): Promise<Response> {
    return secure(await handler(request));
  };
}

function safeDelegate(handler: RouteHandler): RouteHandler {
  return async function approvedStagingOwnerRoute(request: Request): Promise<Response> {
    try {
      return await handler(request);
    } catch {
      return controlled("owner_auth_route_unavailable", 503);
    }
  };
}

function readiness(): OwnerSelfServeAuthRouteReadiness {
  const endpoints = Object.freeze({
    publicRegistration: Object.freeze({
      method: "POST" as const,
      path: "/api/self-serve/register" as const,
      state: "mounted_disabled" as const,
    }),
    internalBrowserBinding: Object.freeze({
      method: "POST" as const,
      path: "/api/internal/self-serve/browser-binding" as const,
      state: "mounted_disabled" as const,
    }),
    internalCallback: Object.freeze({
      method: "POST" as const,
      path: "/api/internal/self-serve/oidc-callback" as const,
      state: "mounted_disabled" as const,
    }),
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    phase: "2B2B2C1" as const,
    mode: "disabled" as const,
    productionActivation: "forbidden" as const,
    requiredNextGate: "staging_runtime_provider_and_e2e" as const,
    endpoints,
  });
}

function approvedStagingReadiness(): OwnerSelfServeAuthRouteReadiness {
  const endpoints = Object.freeze({
    publicRegistration: Object.freeze({
      method: "POST" as const,
      path: "/api/self-serve/register" as const,
      state: "mounted_approved_staging" as const,
    }),
    internalBrowserBinding: Object.freeze({
      method: "POST" as const,
      path: "/api/internal/self-serve/browser-binding" as const,
      state: "mounted_approved_staging" as const,
    }),
    internalCallback: Object.freeze({
      method: "POST" as const,
      path: "/api/internal/self-serve/oidc-callback" as const,
      state: "mounted_approved_staging" as const,
    }),
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    phase: "2B2B2C1" as const,
    mode: "approved_staging_injected" as const,
    productionActivation: "forbidden" as const,
    requiredNextGate: "staging_runtime_provider_and_e2e" as const,
    endpoints,
  });
}

export function assertOwnerSelfServeAuthRouteSet(
  value: unknown,
): asserts value is OwnerSelfServeAuthRouteSet {
  if (
    !value || typeof value !== "object" || !routeSets.has(value) ||
    !Object.isFrozen(value) || !Object.isSealed(value)
  ) invalid();
}

export function createDisabledOwnerSelfServeAuthRouteSet(): OwnerSelfServeAuthRouteSet {
  const publicRegistration = secureDisabled(createSelfServeRegistrationStartHandler(
    createDisabledSelfServeRuntime(),
  ));
  const internalCallback = secureDisabled(createDisabledOwnerInternalSelfServeCallbackGateway());
  const routeSet: OwnerSelfServeAuthRouteSet = {
    publicRegistration,
    internalBrowserBinding: async (request) => request.method === "POST"
      ? controlled("owner_browser_binding_disabled", 503)
      : controlled("owner_browser_binding_method_not_allowed", 405),
    internalCallback,
    readiness: readiness(),
  };
  routeSets.add(routeSet);
  return Object.freeze(routeSet);
}

export function createApprovedStagingOwnerSelfServeAuthRouteSet(options: {
  approval: OwnerSelfServeAuthRouteMountApproval;
  environment: "approved_staging";
  composition: DisabledOwnerSelfServeAuthComposition;
}): OwnerSelfServeAuthRouteSet {
  assertOwnerSelfServeAuthRouteMountApproval(options?.approval);
  if (options.environment !== "approved_staging") invalid();
  assertDisabledOwnerSelfServeAuthComposition(options.composition);
  const routeSet: OwnerSelfServeAuthRouteSet = {
    publicRegistration: safeDelegate(options.composition.browserBoundRegistrationHandler),
    internalBrowserBinding: safeDelegate(options.composition.browserBindingInternalGateway),
    internalCallback: safeDelegate(options.composition.sessionHandoffInternalGateway),
    readiness: approvedStagingReadiness(),
  };
  routeSets.add(routeSet);
  return Object.freeze(routeSet);
}

const defaultRouteSet = createDisabledOwnerSelfServeAuthRouteSet();

export function getDefaultOwnerSelfServeAuthRouteSet(): OwnerSelfServeAuthRouteSet {
  return defaultRouteSet;
}
