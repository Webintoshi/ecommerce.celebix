import {
  CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS,
  parseCustomerPanelStagingAuthConfig,
  resolveCustomerPanelStagingAuthMode,
  type CustomerPanelStagingAuthConfig,
} from "../panel-auth-authority/config.ts";

type Environment = Record<string, string | undefined>;
type RouteSet = Readonly<{
  browserBootstrap(request: Request): Promise<Response>;
  browserCallback(request: Request): Promise<Response>;
  readiness: Readonly<{ mode: string }>;
}>;

export function createCustomerPanelStagingAuthRouteSetResolver<T extends RouteSet>(options: {
  source: Environment;
  disabled(): T;
  unavailable(): T;
  initialize(config: CustomerPanelStagingAuthConfig): Promise<T>;
  diagnostic(code: "customer_panel_staging_auth_initialization_failed"): void;
}) {
  if (!options || typeof options.source !== "object" || typeof options.disabled !== "function" ||
      typeof options.unavailable !== "function" || typeof options.initialize !== "function" ||
      typeof options.diagnostic !== "function") throw new Error("customer_panel_staging_auth_resolver_invalid");
  let disabled: T | undefined;
  let initialization: Promise<T> | undefined;
  const resolve = async (): Promise<T> => {
    if (resolveCustomerPanelStagingAuthMode(options.source) !== "approved_staging") {
      disabled ??= options.disabled();
      return disabled;
    }
    initialization ??= (async () => {
      try {
        const snapshot = Object.fromEntries(
          CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, options.source[name]]),
        ) as Environment;
        return await options.initialize(parseCustomerPanelStagingAuthConfig(snapshot));
      } catch {
        try { options.diagnostic("customer_panel_staging_auth_initialization_failed"); } catch { /* Diagnostic is best effort. */ }
        return options.unavailable();
      }
    })();
    return initialization;
  };
  return Object.freeze({ resolve });
}
