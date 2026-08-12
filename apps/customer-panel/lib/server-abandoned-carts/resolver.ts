import {
  CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS,
  parseCustomerPanelStagingAuthConfig,
  resolveCustomerPanelStagingAuthMode,
  type CustomerPanelStagingAuthConfig,
} from "../panel-auth-authority/config.ts";
import type { ServerAbandonedCartRuntime } from "./runtime.ts";

type Environment = Record<string, string | undefined>;
type Diagnostic = "server_abandoned_cart_runtime_initialization_failed";

export function createServerAbandonedCartRuntimeResolver(options: Readonly<{
  source: Environment;
  initialize(config: CustomerPanelStagingAuthConfig): Promise<ServerAbandonedCartRuntime>;
  diagnostic(code: Diagnostic): void;
}>) {
  if (!options || typeof options.source !== "object" || typeof options.initialize !== "function" || typeof options.diagnostic !== "function") {
    throw new Error("server_abandoned_cart_runtime_resolver_invalid");
  }

  let initialization: Promise<ServerAbandonedCartRuntime | null> | undefined;
  const diagnose = () => {
    try { options.diagnostic("server_abandoned_cart_runtime_initialization_failed"); }
    catch { /* Diagnostics are never request authority. */ }
  };

  const resolve = async (): Promise<ServerAbandonedCartRuntime | null> => {
    if (resolveCustomerPanelStagingAuthMode(options.source) !== "approved_staging") return null;
    initialization ??= (async () => {
      const snapshot = Object.fromEntries(
        CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, options.source[name]]),
      ) as Environment;
      let config: CustomerPanelStagingAuthConfig;
      try { config = parseCustomerPanelStagingAuthConfig(snapshot); }
      catch { diagnose(); return null; }
      try { return await options.initialize(config); }
      catch { diagnose(); return null; }
    })();
    return initialization;
  };

  return Object.freeze({ resolve });
}
