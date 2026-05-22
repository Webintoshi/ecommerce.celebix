import "server-only";

interface CoolifyEnvironmentVariable {
  key?: string;
  name?: string;
  value?: string;
}

const COOLIFY_API_PREFIX = "/api/v1";

function getCoolifyApiUrl(): string | null {
  const value = process.env.COOLIFY_API_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

function getCoolifyApiToken(): string | null {
  const value = process.env.COOLIFY_API_TOKEN?.trim();
  return value || null;
}

function normalizeArrayPayload<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    for (const key of ["data", "result", "services", "envs", "variables"] as const) {
      if (Array.isArray(record[key])) {
        return record[key] as T[];
      }
    }
  }

  return [];
}

async function coolifyFetch<T>(path: string): Promise<T> {
  const apiUrl = getCoolifyApiUrl();
  const token = getCoolifyApiToken();

  if (!apiUrl || !token) {
    throw new Error("Coolify API authority eksik.");
  }

    const response = await fetch(`${apiUrl}${COOLIFY_API_PREFIX}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Coolify runtime authority okunamadi (${response.status})`);
  }

  return (await response.json()) as T;
}

function findEnvValue(variables: CoolifyEnvironmentVariable[], candidates: string[]): string | null {
  const candidateSet = new Set(candidates.map((value) => value.toUpperCase()));
  const match = variables.find((variable) => {
    const key = (variable.key || variable.name || "").toUpperCase();
    return key && candidateSet.has(key);
  });

  return match?.value?.trim() || null;
}

function buildSupabaseDashboardUrl(publicUrl: string): string {
  return `${publicUrl.replace(/\/+$/, "")}/project/default`;
}

export interface CoolifySupabaseRuntimeAuthority {
  dashboardUrl: string;
  internalApiUrl: string | null;
  publicKey: string;
  publicUrl: string;
  serviceKey: string;
}

export async function readCoolifySupabaseRuntimeAuthority(
  serviceUuid: string
): Promise<CoolifySupabaseRuntimeAuthority | null> {
  if (!serviceUuid?.trim()) {
    return null;
  }

  try {
    const payload = await coolifyFetch<unknown>(`/services/${serviceUuid}/envs`);
    const variables = normalizeArrayPayload<CoolifyEnvironmentVariable>(payload);
    const publicUrl =
      findEnvValue(variables, ["SERVICE_URL_SUPABASEKONG", "SUPABASE_URL"])?.replace(/\/+$/, "") || null;
    const publicKey = findEnvValue(variables, [
      "SERVICE_SUPABASEANON_KEY",
      "SERVICE_SUPABASE_ANON_KEY",
      "SUPABASE_ANON_KEY",
    ]);
    const internalApiUrl =
      findEnvValue(variables, ["API_EXTERNAL_URL", "SUPABASE_INTERNAL_URL"])?.replace(/\/+$/, "") || null;
    const serviceKey = findEnvValue(variables, [
      "SERVICE_SUPABASESERVICE_KEY",
      "SERVICE_SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);

    if (!publicUrl || !publicKey || !serviceKey) {
      return null;
    }

    return {
      internalApiUrl,
      publicUrl,
      publicKey,
      serviceKey,
      dashboardUrl: buildSupabaseDashboardUrl(publicUrl),
    };
  } catch {
    return null;
  }
}
