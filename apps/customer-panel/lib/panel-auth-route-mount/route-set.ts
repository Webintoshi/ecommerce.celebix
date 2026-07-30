import { createDisabledCustomerPanelSelfServeCallbackEdge } from "../self-serve-callback-edge/edge.ts";
import {
  assertDisabledCustomerPanelAuthComposition,
  type DisabledCustomerPanelAuthComposition,
} from "../panel-auth-composition/composition.ts";
import {
  assertCustomerPanelAuthRouteMountApproval,
  type CustomerPanelAuthRouteMountApproval,
} from "./activation.ts";

const routeSets = new WeakSet<object>();

type RouteHandler = (request: Request) => Promise<Response>;

export type CustomerPanelAuthRouteReadiness = Readonly<{
  schemaVersion: 1;
  phase: "2B2B2C1";
  mode: "disabled" | "approved_staging_injected";
  productionActivation: "forbidden";
  requiredNextGate: "staging_runtime_provider_and_e2e";
  endpoints: Readonly<{
    browserBootstrap: Readonly<{
      method: "POST";
      path: "/auth/bootstrap";
      state: "mounted_disabled" | "mounted_approved_staging";
    }>;
    browserCallback: Readonly<{
      method: "GET";
      path: "/auth/callback";
      state: "mounted_disabled" | "mounted_approved_staging";
    }>;
    browserLogin: Readonly<{
      method: "GET";
      path: "/auth/login";
      state: "mounted_disabled" | "mounted_approved_staging";
    }>;
  }>;
}>;

export type CustomerPanelAuthRouteSet = Readonly<{
  browserBootstrap: RouteHandler;
  browserCallback: RouteHandler;
  browserLogin: RouteHandler;
  readiness: CustomerPanelAuthRouteReadiness;
}>;

function invalid(): never {
  throw new Error("customer_panel_auth_route_set_invalid");
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

function safeDelegate(handler: RouteHandler): RouteHandler {
  return async function approvedStagingCustomerRoute(request: Request): Promise<Response> {
    try {
      return await handler(request);
    } catch {
      return controlled("panel_auth_route_unavailable", 503);
    }
  };
}

function readiness(): CustomerPanelAuthRouteReadiness {
  const endpoints = Object.freeze({
    browserBootstrap: Object.freeze({
      method: "POST" as const,
      path: "/auth/bootstrap" as const,
      state: "mounted_disabled" as const,
    }),
    browserCallback: Object.freeze({
      method: "GET" as const,
      path: "/auth/callback" as const,
      state: "mounted_disabled" as const,
    }),
    browserLogin: Object.freeze({
      method: "GET" as const,
      path: "/auth/login" as const,
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

function approvedStagingReadiness(): CustomerPanelAuthRouteReadiness {
  const endpoints = Object.freeze({
    browserBootstrap: Object.freeze({
      method: "POST" as const,
      path: "/auth/bootstrap" as const,
      state: "mounted_approved_staging" as const,
    }),
    browserCallback: Object.freeze({
      method: "GET" as const,
      path: "/auth/callback" as const,
      state: "mounted_approved_staging" as const,
    }),
    browserLogin: Object.freeze({
      method: "GET" as const,
      path: "/auth/login" as const,
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

export function assertCustomerPanelAuthRouteSet(
  value: unknown,
): asserts value is CustomerPanelAuthRouteSet {
  if (
    !value || typeof value !== "object" || !routeSets.has(value) ||
    !Object.isFrozen(value) || !Object.isSealed(value)
  ) invalid();
}

export function createDisabledCustomerPanelAuthRouteSet(): CustomerPanelAuthRouteSet {
  const disabledCallback = createDisabledCustomerPanelSelfServeCallbackEdge();
  const routeSet: CustomerPanelAuthRouteSet = {
    browserBootstrap: async (request) => request.method === "POST"
      ? controlled("panel_browser_bootstrap_disabled", 503)
      : controlled("panel_browser_bootstrap_method_not_allowed", 405),
    browserCallback: async (request) => request.method === "GET"
      ? secure(await disabledCallback(request))
      : controlled("panel_callback_method_not_allowed", 405),
    browserLogin: async (request) => request.method === "GET"
      ? controlled("panel_login_disabled", 503)
      : controlled("panel_login_method_not_allowed", 405),
    readiness: readiness(),
  };
  routeSets.add(routeSet);
  return Object.freeze(routeSet);
}

export function createUnavailableCustomerPanelStagingAuthRouteSet(): CustomerPanelAuthRouteSet {
  const routeSet: CustomerPanelAuthRouteSet = {
    browserBootstrap: async (request) => request.method === "POST"
      ? controlled("panel_auth_route_unavailable", 503)
      : controlled("panel_browser_bootstrap_method_not_allowed", 405),
    browserCallback: async (request) => request.method === "GET"
      ? controlled("panel_auth_route_unavailable", 503)
      : controlled("panel_callback_method_not_allowed", 405),
    browserLogin: async (request) => request.method === "GET"
      ? controlled("panel_auth_route_unavailable", 503)
      : controlled("panel_login_method_not_allowed", 405),
    readiness: approvedStagingReadiness(),
  };
  routeSets.add(routeSet);
  return Object.freeze(routeSet);
}

export function createApprovedStagingCustomerPanelAuthRouteSet(options: {
  approval: CustomerPanelAuthRouteMountApproval;
  environment: "approved_staging";
  composition: DisabledCustomerPanelAuthComposition;
}): CustomerPanelAuthRouteSet {
  assertCustomerPanelAuthRouteMountApproval(options?.approval);
  if (options.environment !== "approved_staging") invalid();
  assertDisabledCustomerPanelAuthComposition(options.composition);
  const routeSet: CustomerPanelAuthRouteSet = {
    browserBootstrap: safeDelegate(options.composition.browserBootstrapHandler),
    browserCallback: safeDelegate(options.composition.panelSessionCompletionHandler),
    browserLogin: safeDelegate(options.composition.panelReturningLoginHandler),
    readiness: approvedStagingReadiness(),
  };
  routeSets.add(routeSet);
  return Object.freeze(routeSet);
}

const defaultRouteSet: CustomerPanelAuthRouteSet = (() => {
  const resolve = async () => (await import("../panel-auth-route-runtime/default.ts"))
    .resolveDefaultCustomerPanelStagingAuthRouteSet();
  const routeSet: CustomerPanelAuthRouteSet = {
    browserBootstrap: async (request) => (await resolve()).browserBootstrap(request),
    browserCallback: async (request) => (await resolve()).browserCallback(request),
    browserLogin: async (request) => (await resolve()).browserLogin(request),
    readiness: readiness(),
  };
  routeSets.add(routeSet);
  return Object.freeze(routeSet);
})();

export function getDefaultCustomerPanelAuthRouteSet(): CustomerPanelAuthRouteSet {
  return defaultRouteSet;
}
