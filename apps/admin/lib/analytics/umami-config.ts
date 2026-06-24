export type UmamiConfig = {
  baseUrl: string;
  apiToken: string;
  websiteId: string;
};

export type UmamiConfigPresence = {
  baseUrlPresent: boolean;
  apiTokenPresent: boolean;
  websiteIdPresent: boolean;
  configured: boolean;
  selectedKeys: {
    baseUrl: string | null;
    apiToken: string | null;
    websiteId: string | null;
  };
};

export type ResolvedUmamiConfig = {
  config: UmamiConfig | null;
  presence: UmamiConfigPresence;
};

type EnvSource = Record<string, string | undefined>;

function normalizeEnvKeySuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "_").toUpperCase();
}

function readEnv(env: EnvSource, key: string): string | null {
  const value = env[key];
  if (!value || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function pickEnv(env: EnvSource, keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = readEnv(env, key);
    if (value) {
      return { key, value };
    }
  }

  return null;
}

function buildCandidates(baseName: string, storeSlug: string, aliasNames: string[]): string[] {
  const suffix = normalizeEnvKeySuffix(storeSlug);
  const scopedPrimary = `${baseName}_${suffix}`;
  const scopedAliases = aliasNames.map((aliasName) => `${aliasName}_${suffix}`);

  return [scopedPrimary, baseName, ...scopedAliases, ...aliasNames];
}

export function resolveUmamiConfigFromEnv(args: {
  env: EnvSource;
  storeSlug: string;
}): ResolvedUmamiConfig {
  const baseUrl = pickEnv(
    args.env,
    buildCandidates("UMAMI_BASE_URL", args.storeSlug, ["NEXT_PUBLIC_UMAMI_BASE_URL"]),
  );
  const apiToken = pickEnv(
    args.env,
    buildCandidates("UMAMI_API_TOKEN", args.storeSlug, ["UMAMI_MANAGEMENT_TOKEN"]),
  );
  const websiteId = pickEnv(
    args.env,
    buildCandidates("UMAMI_WEBSITE_ID", args.storeSlug, [
      "UMAMI_SITE_ID",
      "NEXT_PUBLIC_UMAMI_WEBSITE_ID",
    ]),
  );

  const presence: UmamiConfigPresence = {
    baseUrlPresent: Boolean(baseUrl),
    apiTokenPresent: Boolean(apiToken),
    websiteIdPresent: Boolean(websiteId),
    configured: Boolean(baseUrl && apiToken && websiteId),
    selectedKeys: {
      baseUrl: baseUrl?.key ?? null,
      apiToken: apiToken?.key ?? null,
      websiteId: websiteId?.key ?? null,
    },
  };

  if (!baseUrl || !apiToken || !websiteId) {
    return {
      config: null,
      presence,
    };
  }

  return {
    config: {
      baseUrl: baseUrl.value.replace(/\/+$/, ""),
      apiToken: apiToken.value,
      websiteId: websiteId.value,
    },
    presence,
  };
}
