const ASSET_PROXY_PATH = "/api/assets";

const DEFAULT_ALLOWED_HOST_SUFFIXES = [
  ".r2.dev",
  ".r2.cloudflarestorage.com",
  ".supabase.co",
];

function normalizeConfiguredHost(value?: string) {
  if (!value) {
    return null;
  }

  try {
    const normalized = value.startsWith("http://") || value.startsWith("https://")
      ? value
      : `https://${value}`;

    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getConfiguredAssetHosts() {
  const hosts = new Set<string>();

  for (const value of [
    process.env.R2_PUBLIC_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ]) {
    const hostname = normalizeConfiguredHost(value);
    if (hostname) {
      hosts.add(hostname);
    }
  }

  return hosts;
}

export function isAllowedAdminAssetHost(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  if (getConfiguredAssetHosts().has(normalizedHostname)) {
    return true;
  }

  return DEFAULT_ALLOWED_HOST_SUFFIXES.some((suffix) => (
    normalizedHostname === suffix.slice(1) || normalizedHostname.endsWith(suffix)
  ));
}

export function resolveAdminAssetUrl(source?: string | null) {
  const trimmedSource = typeof source === "string" ? source.trim() : "";

  if (!trimmedSource) {
    return "";
  }

  if (
    trimmedSource.startsWith("/") ||
    trimmedSource.startsWith("data:") ||
    trimmedSource.startsWith("blob:")
  ) {
    return trimmedSource;
  }

  try {
    const parsedUrl = new URL(trimmedSource);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return trimmedSource;
    }

    if (!isAllowedAdminAssetHost(parsedUrl.hostname)) {
      return trimmedSource;
    }

    return `${ASSET_PROXY_PATH}?src=${encodeURIComponent(parsedUrl.toString())}`;
  } catch {
    return trimmedSource;
  }
}

export function resolveAdminDirectAssetUrl(source?: string | null) {
  const trimmedSource = typeof source === "string" ? source.trim() : "";

  if (!trimmedSource) {
    return "";
  }

  if (
    trimmedSource.startsWith("/") ||
    trimmedSource.startsWith("data:") ||
    trimmedSource.startsWith("blob:")
  ) {
    return trimmedSource;
  }

  try {
    const parsedUrl = new URL(trimmedSource);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return "";
    }

    return parsedUrl.toString();
  } catch {
    return "";
  }
}

export function extractAdminStoredAssetUrl(source?: string | null) {
  const trimmedSource = typeof source === "string" ? source.trim() : "";

  if (!trimmedSource) {
    return "";
  }

  try {
    const parsedUrl = trimmedSource.startsWith("/")
      ? new URL(trimmedSource, "https://celebix.local")
      : new URL(trimmedSource);

    if (parsedUrl.pathname === ASSET_PROXY_PATH) {
      const originalSource = parsedUrl.searchParams.get("src");
      if (originalSource) {
        return originalSource.trim();
      }
    }
  } catch {
    return trimmedSource;
  }

  return trimmedSource;
}
