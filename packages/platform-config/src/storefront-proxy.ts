export type StorefrontProxyEnvironment = Readonly<Record<string, string | undefined>>;

export type StorefrontProxyConfig =
  | Readonly<{ mode: "disabled" }>
  | Readonly<{ mode: "approved_staging"; proxyToken: string }>;

const DISABLED: StorefrontProxyConfig = Object.freeze({ mode: "disabled" as const });
const TOKEN_BYTES = 32;

function canonicalBase64UrlToken(value: string | undefined): string | null {
  if (!value || value !== value.trim() || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== TOKEN_BYTES || decoded.toString("base64url") !== value) {
    return null;
  }

  return value;
}

export function resolveStorefrontProxyConfig(
  source: StorefrontProxyEnvironment,
): StorefrontProxyConfig {
  if (
    source.CELEBIX_DEPLOYMENT_TIER !== "staging" ||
    source.CELEBIX_STOREFRONT_PROXY_MODE !== "approved_staging"
  ) {
    return DISABLED;
  }

  const proxyToken = canonicalBase64UrlToken(
    source.CELEBIX_STOREFRONT_PROXY_TOKEN_B64URL,
  );
  if (!proxyToken) {
    return DISABLED;
  }

  return Object.freeze({ mode: "approved_staging" as const, proxyToken });
}
