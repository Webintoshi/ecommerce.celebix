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
  let unavailable: T | undefined;
  let retryAt = 0;
  let retryDelayMs = 1_000;
  const resolve = async (): Promise<T> => {
    if (resolveOwnerStagingAuthMode(options.source) !== "approved_staging") {
      disabled ??= options.disabled();
      return disabled;
    }
    if (!initialization && unavailable && Date.now() < retryAt) return unavailable;
    initialization ??= Promise.resolve().then(async () => {
      try {
        const snapshot = Object.fromEntries(
          OWNER_STAGING_AUTH_ENVIRONMENT_FIELDS.map((name) => [name, options.source[name]]),
        ) as Environment;
        return await options.initialize(parseOwnerStagingAuthConfig(snapshot));
      } catch {
        initialization = undefined;
        retryAt = Date.now() + retryDelayMs;
        retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
        try { options.diagnostic("owner_staging_auth_initialization_failed"); } catch { /* Diagnostic is best effort. */ }
        unavailable ??= options.unavailable();
        return unavailable;
      }
    });
    return initialization;
  };
  return Object.freeze({ resolve });
}
