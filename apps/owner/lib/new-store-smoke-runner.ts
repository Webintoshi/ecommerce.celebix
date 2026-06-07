import "server-only";

import {
  requireStoreConfig,
  updateStoreSmokeReport,
  type StoreConfig,
  type StoreSmokeCheckResult,
  type StoreSmokeOverallStatus,
  type StoreSmokeReport,
  type StoreSmokeStatus,
} from "@celebix/platform-config";
import {
  buildNewStoreSmokeChecks,
  buildPlanResult,
  type SmokeCheckDefinition,
} from "@/lib/new-store-smoke-checks";

export type NewStoreSmokeRunnerMode = "plan" | "execute";

export interface NewStoreSmokeRunnerOptions {
  mode?: NewStoreSmokeRunnerMode;
  persist?: boolean;
  timeoutMs?: number;
}

const FORBIDDEN_PUBLIC_URL_PATTERNS = [
  /localhost/i,
  /0\.0\.0\.0/,
  /127\.0\.0\.1/,
  /:3000(?:\/|$)/,
];

function buildUrl(store: StoreConfig, definition: SmokeCheckDefinition): string | undefined {
  if (!definition.path || definition.target === "owner") {
    return undefined;
  }

  const baseUrl =
    definition.target === "admin"
      ? `https://${store.domains.admin}`
      : `https://${store.domains.storefront}`;

  return new URL(definition.path, baseUrl).toString();
}

function isExpectedStatus(actual: number, expected?: number | number[]): boolean {
  if (!expected) {
    return true;
  }

  return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
}

function summarizeExpectedStatus(expected?: number | number[]): string {
  if (!expected) {
    return "any status";
  }

  return Array.isArray(expected) ? expected.join("/") : String(expected);
}

function hasForbiddenPublicUrl(value: string | null | undefined): boolean {
  return Boolean(value && FORBIDDEN_PUBLIC_URL_PATTERNS.some((pattern) => pattern.test(value)));
}

function readPath(record: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, record);
}

function makeResult(
  definition: SmokeCheckDefinition,
  patch: Partial<StoreSmokeCheckResult>,
): StoreSmokeCheckResult {
  return {
    id: definition.id,
    label: definition.label,
    category: definition.category,
    status: patch.status ?? "pending",
    expected: patch.expected ?? definition.expected,
    actual: patch.actual,
    url: patch.url,
    statusCode: patch.statusCode,
    durationMs: patch.durationMs,
    errorCode: patch.errorCode,
    message: patch.message,
    repairAction: patch.repairAction ?? definition.repairAction,
  };
}

async function runHttpCheck(
  store: StoreConfig,
  definition: SmokeCheckDefinition,
  timeoutMs: number,
): Promise<StoreSmokeCheckResult> {
  const url = buildUrl(store, definition);

  if (!url) {
    return makeResult(definition, {
      status: "skipped",
      message: "HTTP check icin URL uretilemedi.",
    });
  }

  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      redirect: definition.kind === "redirect" ? "manual" : "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const durationMs = Date.now() - startedAt;
    const location = response.headers.get("location");
    const expectedStatusOk = isExpectedStatus(response.status, definition.expectedStatus);
    const redirectTargetOk =
      definition.kind !== "redirect" ||
      Boolean(location && /logto|auth\.celebix/i.test(location) && !hasForbiddenPublicUrl(location));
    const noDevUrl = !hasForbiddenPublicUrl(location) && !hasForbiddenPublicUrl(response.url);
    const passed = expectedStatusOk && redirectTargetOk && noDevUrl;

    return makeResult(definition, {
      status: passed ? "passed" : "failed",
      url,
      statusCode: response.status,
      durationMs,
      actual: location ? `${response.status} -> ${location}` : String(response.status),
      message: passed
        ? "HTTP smoke check passed."
        : `Beklenen ${summarizeExpectedStatus(definition.expectedStatus)}, gelen ${response.status}.`,
      errorCode: passed ? undefined : "http_status_mismatch",
      repairAction: passed ? undefined : definition.repairAction ?? "Runtime route ve redirect authority kontrol edilmeli.",
    });
  } catch (error) {
    return makeResult(definition, {
      status: "failed",
      url,
      durationMs: Date.now() - startedAt,
      errorCode: "http_request_failed",
      message: error instanceof Error ? error.message : "HTTP smoke request basarisiz oldu.",
      repairAction: definition.repairAction ?? "Runtime erisimi, DNS/proxy ve generated deployment kontrol edilmeli.",
    });
  }
}

async function runRuntimeCheck(
  store: StoreConfig,
  definition: SmokeCheckDefinition,
  timeoutMs: number,
): Promise<StoreSmokeCheckResult> {
  const url = buildUrl(store, definition);

  if (!url) {
    return makeResult(definition, {
      status: "skipped",
      message: "Runtime check icin URL uretilemedi.",
    });
  }

  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = (await response.json()) as unknown;
    const mismatches = Object.entries(definition.runtimeAssertions ?? {}).filter(([path, expected]) => {
      const actual = readPath(payload, path);
      return String(actual ?? "") !== expected;
    });
    const passed = response.ok && mismatches.length === 0;

    return makeResult(definition, {
      status: passed ? "passed" : "failed",
      url,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
      actual: mismatches.length > 0
        ? mismatches.map(([path, expected]) => `${path}!=${expected}`).join(", ")
        : "runtime matched",
      message: passed ? "Runtime metadata matched." : "Runtime metadata mismatch.",
      errorCode: passed ? undefined : "runtime_metadata_mismatch",
      repairAction: passed ? undefined : definition.repairAction,
    });
  } catch (error) {
    return makeResult(definition, {
      status: "failed",
      url,
      durationMs: Date.now() - startedAt,
      errorCode: "runtime_request_failed",
      message: error instanceof Error ? error.message : "Runtime smoke request basarisiz oldu.",
      repairAction: definition.repairAction ?? "Runtime endpoint ve generated env kontrol edilmeli.",
    });
  }
}

function runMetadataCheck(store: StoreConfig, definition: SmokeCheckDefinition): StoreSmokeCheckResult {
  let passed = true;
  let actual = "metadata matched";
  let repairAction = definition.repairAction;

  if (definition.id === "optional_modules_safe_disabled") {
    actual = "optional modules safe-disabled model expected";
  } else if (definition.id === "umami_metadata") {
    passed = store.analyticsProvider === "umami" && Boolean(store.umami?.scriptUrl || store.umami?.host);
    actual = `analyticsProvider=${store.analyticsProvider}, script=${store.umami?.scriptUrl || "pending"}`;
    repairAction = "Umami metadata/config generation yeniden calistirilmali.";
  } else if (definition.id === "r2_media_metadata") {
    passed = store.storageProvider === "r2" && Boolean(store.r2?.prefix || store.media?.prefix);
    actual = `storageProvider=${store.storageProvider}, prefix=${store.r2?.prefix || store.media?.prefix || "missing"}`;
    repairAction = "R2 media metadata/config generation yeniden calistirilmali.";
  } else if (definition.id === "supabase_absence") {
    passed =
      store.databaseMode === "light_postgres" &&
      store.supabaseStatus === "none" &&
      store.supabase.storage === "disabled-by-database-mode" &&
      store.authProvider !== "supabase" &&
      store.customerAuthProvider !== "supabase";
    actual = `databaseMode=${store.databaseMode}, supabaseStatus=${store.supabaseStatus}, auth=${store.authProvider}/${store.customerAuthProvider}`;
    repairAction = "Yeni Standart store config Supabase-free metadata kontrol edilmeli.";
  }

  return makeResult(definition, {
    status: passed ? "passed" : "failed",
    actual,
    message: passed ? "Metadata smoke check passed." : "Metadata smoke check failed.",
    errorCode: passed ? undefined : "metadata_mismatch",
    repairAction: passed ? undefined : repairAction,
  });
}

function runSecurityCheck(store: StoreConfig, definition: SmokeCheckDefinition): StoreSmokeCheckResult {
  const urls = [
    store.domains.storefront,
    store.domains.admin,
    store.storefront?.runtimeUrl,
    store.bootstrap?.adminDeploymentRuntimeUrl,
    ...(store.logto?.adminRedirectUris ?? []),
    ...(store.logto?.adminPostLogoutRedirectUris ?? []),
    ...(store.logto?.customerRedirectUris ?? []),
    ...(store.logto?.customerPostLogoutRedirectUris ?? []),
    store.r2?.publicUrl,
    store.umami?.scriptUrl,
    store.umami?.host,
  ].filter((value): value is string => Boolean(value));

  const leakedDevUrl = urls.find((value) => hasForbiddenPublicUrl(value));
  const secretLikePublicMetadata =
    definition.id === "no_secret_leak"
      ? urls.some((value) => /secret|token|access_key|service_role/i.test(value))
      : false;
  const passed = !leakedDevUrl && !secretLikePublicMetadata;

  return makeResult(definition, {
    status: passed ? "passed" : "failed",
    actual: leakedDevUrl || (secretLikePublicMetadata ? "secret-like public metadata" : "no leak"),
    message: passed ? "Security smoke metadata passed." : "Security smoke metadata failed.",
    errorCode: passed ? undefined : "security_metadata_mismatch",
    repairAction: passed ? undefined : "Generated runtime URL/secret metadata kontrol edilmeli.",
  });
}

function deriveOverallStatus(checks: StoreSmokeCheckResult[]): StoreSmokeOverallStatus {
  if (checks.every((check) => check.status === "pending")) {
    return "pending";
  }

  if (checks.some((check) => check.status === "failed")) {
    return checks.some((check) => check.status === "passed") ? "partial" : "failed";
  }

  if (checks.every((check) => check.status === "passed" || check.status === "skipped")) {
    return "passed";
  }

  return "partial";
}

export async function runNewStoreSmokeRunner(
  slugOrStore: string | StoreConfig,
  options: NewStoreSmokeRunnerOptions = {},
): Promise<StoreSmokeReport> {
  const store = typeof slugOrStore === "string" ? requireStoreConfig(slugOrStore) : slugOrStore;
  const mode = options.mode ?? "plan";
  const timeoutMs = options.timeoutMs ?? 6_000;
  const startedAt = new Date().toISOString();
  const definitions = buildNewStoreSmokeChecks(store);
  const checks =
    mode === "plan"
      ? definitions.map((definition) => buildPlanResult(definition, store))
      : await Promise.all(
          definitions.map((definition) => {
            if (definition.authenticated) {
              return Promise.resolve(
                makeResult(definition, {
                  status: "skipped",
                  message: "Authenticated session yok; check skipped.",
                }),
              );
            }

            if (definition.kind === "http" || definition.kind === "redirect") {
              return runHttpCheck(store, definition, timeoutMs);
            }

            if (definition.kind === "runtime") {
              return runRuntimeCheck(store, definition, timeoutMs);
            }

            if (definition.kind === "security") {
              return Promise.resolve(runSecurityCheck(store, definition));
            }

            return Promise.resolve(runMetadataCheck(store, definition));
          }),
        );
  const report: StoreSmokeReport = {
    storeSlug: store.slug,
    startedAt,
    finishedAt: mode === "execute" ? new Date().toISOString() : undefined,
    mode,
    overallStatus: deriveOverallStatus(checks),
    checks,
  };

  if (options.persist) {
    updateStoreSmokeReport(store.slug, report);
  }

  return report;
}

export function buildNewStoreSmokePlan(slugOrStore: string | StoreConfig): StoreSmokeReport {
  const store = typeof slugOrStore === "string" ? requireStoreConfig(slugOrStore) : slugOrStore;
  const checks = buildNewStoreSmokeChecks(store).map((definition) => buildPlanResult(definition, store));

  return {
    storeSlug: store.slug,
    startedAt: new Date().toISOString(),
    mode: "plan",
    overallStatus: "pending",
    checks,
  };
}
