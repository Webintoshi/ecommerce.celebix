import "server-only";

import {
  CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS,
  parseCustomerPanelStagingAuthConfig,
  resolveCustomerPanelStagingAuthMode,
  type CustomerPanelStagingAuthConfig,
} from "../panel-auth-authority/config.ts";
import type { ServerPanelAccessRuntime } from "./runtime.ts";

export type { ServerPanelAccessRuntime } from "./runtime.ts";

type Environment = Record<string, string | undefined>;

export function createServerPanelAccessRuntimeResolver(options: {
  source: Environment;
  disabled(): ServerPanelAccessRuntime;
  unavailable(): ServerPanelAccessRuntime;
  initialize(config: CustomerPanelStagingAuthConfig): Promise<ServerPanelAccessRuntime>;
  diagnostic(code: "server_panel_access_initialization_failed"): void;
}) {
  if (
    !options || typeof options.source !== "object" ||
    typeof options.disabled !== "function" || typeof options.unavailable !== "function" ||
    typeof options.initialize !== "function" || typeof options.diagnostic !== "function"
  ) throw new Error("server_panel_access_resolver_invalid");

  let disabled: ServerPanelAccessRuntime | undefined;
  let initialization: Promise<ServerPanelAccessRuntime> | undefined;
  const disabledRuntime = () => (disabled ??= options.disabled());
  const diagnose = () => {
    try { options.diagnostic("server_panel_access_initialization_failed"); }
    catch { /* Diagnostic is best effort and never access authority. */ }
  };

  const resolve = async (): Promise<ServerPanelAccessRuntime> => {
    if (resolveCustomerPanelStagingAuthMode(options.source) !== "approved_staging") {
      return disabledRuntime();
    }
    initialization ??= (async () => {
      const snapshot = Object.fromEntries(
        CUSTOMER_PANEL_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, options.source[name]]),
      ) as Environment;
      let config: CustomerPanelStagingAuthConfig;
      try { config = parseCustomerPanelStagingAuthConfig(snapshot); }
      catch { diagnose(); return disabledRuntime(); }
      try { return await options.initialize(config); }
      catch { diagnose(); return options.unavailable(); }
    })();
    return initialization;
  };
  return Object.freeze({ resolve });
}
