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
type ServerPanelAccessDiagnosticCode =
  | "server_panel_access_initialization_failed"
  | "server_panel_access_database_preflight_failed"
  | "server_panel_access_database_contract_preflight_failed"
  | "server_panel_access_database_activation_preflight_failed"
  | "server_panel_access_database_commit_preflight_failed"
  | "server_iyzico_activation_runtime_preflight_failed"
  | "server_shipping_runtime_invalid";

const SAFE_INITIALIZATION_DIAGNOSTICS = new Set<ServerPanelAccessDiagnosticCode>([
  "server_panel_access_database_preflight_failed",
  "server_panel_access_database_contract_preflight_failed",
  "server_panel_access_database_activation_preflight_failed",
  "server_panel_access_database_commit_preflight_failed",
  "server_iyzico_activation_runtime_preflight_failed",
  "server_shipping_runtime_invalid",
]);

export function createServerPanelAccessRuntimeResolver(options: {
  source: Environment;
  disabled(): ServerPanelAccessRuntime;
  unavailable(): ServerPanelAccessRuntime;
  initialize(config: CustomerPanelStagingAuthConfig): Promise<ServerPanelAccessRuntime>;
  diagnostic(code: ServerPanelAccessDiagnosticCode): void;
}) {
  if (
    !options || typeof options.source !== "object" ||
    typeof options.disabled !== "function" || typeof options.unavailable !== "function" ||
    typeof options.initialize !== "function" || typeof options.diagnostic !== "function"
  ) throw new Error("server_panel_access_resolver_invalid");

  let disabled: ServerPanelAccessRuntime | undefined;
  let initialization: Promise<ServerPanelAccessRuntime> | undefined;
  const disabledRuntime = () => (disabled ??= options.disabled());
  const diagnose = (error?: unknown) => {
    const code = error instanceof Error
      && SAFE_INITIALIZATION_DIAGNOSTICS.has(error.message as ServerPanelAccessDiagnosticCode)
      ? error.message as ServerPanelAccessDiagnosticCode
      : "server_panel_access_initialization_failed";
    try { options.diagnostic(code); }
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
      catch (error) { diagnose(error); return disabledRuntime(); }
      try { return await options.initialize(config); }
      catch (error) { diagnose(error); return options.unavailable(); }
    })();
    return initialization;
  };
  return Object.freeze({ resolve });
}
