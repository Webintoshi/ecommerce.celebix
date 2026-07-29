import {
  OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS,
  parseOwnerStagingAuthConfig,
  resolveOwnerStagingAuthMode,
  type OwnerStagingAuthConfig,
} from "../self-serve-auth-authority/config.ts";

type Environment = Record<string, string | undefined>;
type RouteSet = Readonly<{
  publicRegistration(request: Request): Promise<Response>;
  internalBrowserBinding(request: Request): Promise<Response>;
  internalCallback(request: Request): Promise<Response>;
  readiness: Readonly<{ mode: string }>;
}>;

export function createOwnerStagingAuthRouteSetResolver<T extends RouteSet>(options: {
  source: Environment;
  disabled(): T;
  unavailable(): T;
  initialize(config: OwnerStagingAuthConfig): Promise<T>;
  diagnostic(code: "owner_staging_auth_initialization_failed"): void;
}) {
  if (!options || typeof options.source !== "object" || typeof options.disabled !== "function" ||
      typeof options.unavailable !== "function" || typeof options.initialize !== "function" ||
      typeof options.diagnostic !== "function") throw new Error("owner_staging_auth_resolver_invalid");
  let disabled: T | undefined;
  let initialization: Promise<T> | undefined;
  const resolve = async (): Promise<T> => {
    if (resolveOwnerStagingAuthMode(options.source) !== "approved_staging") {
      disabled ??= options.disabled();
      return disabled;
    }
    initialization ??= (async () => {
      try {
        const snapshot = Object.fromEntries(
          OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, options.source[name]]),
        ) as Environment;
        return await options.initialize(parseOwnerStagingAuthConfig(snapshot));
      } catch {
        try { options.diagnostic("owner_staging_auth_initialization_failed"); } catch { /* Diagnostic is best effort. */ }
        return options.unavailable();
      }
    })();
    return initialization;
  };
  return Object.freeze({ resolve });
}
