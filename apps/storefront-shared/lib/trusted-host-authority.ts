import { timingSafeEqual } from "node:crypto";
import { domainToASCII } from "node:url";

import {
  resolveStorefrontProxyConfig,
  type StorefrontProxyEnvironment,
} from "../../../packages/platform-config/src/storefront-proxy.ts";

export interface StorefrontAuthorityHeaders {
  get(name: string): string | null;
}

export type TrustedStorefrontHostAuthority =
  | Readonly<{ kind: "trusted"; hostname: string }>
  | Readonly<{ kind: "disabled" }>
  | Readonly<{ kind: "missing_proxy_authority" }>
  | Readonly<{ kind: "invalid_proxy_authority" }>
  | Readonly<{ kind: "invalid_forwarded_host" }>
  | Readonly<{ kind: "invalid_forwarded_proto" }>;

const PROXY_HEADER = "x-celebix-storefront-proxy";
const FORWARDED_HOST_HEADER = "x-forwarded-host";
const FORWARDED_PROTO_HEADER = "x-forwarded-proto";
const PROXY_PREFIX = "p1.";
const TOKEN_BYTES = 32;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MAX_HOSTNAME_LENGTH = 253;

function canonicalTokenBytes(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength === TOKEN_BYTES && decoded.toString("base64url") === value
    ? decoded
    : null;
}

function authenticProxyToken(provided: string, expected: string): boolean {
  if (
    provided !== provided.trim() ||
    provided.includes(",") ||
    !provided.startsWith(PROXY_PREFIX)
  ) {
    return false;
  }

  const providedBytes = canonicalTokenBytes(provided.slice(PROXY_PREFIX.length));
  const expectedBytes = canonicalTokenBytes(expected);
  return Boolean(
    providedBytes &&
      expectedBytes &&
      providedBytes.byteLength === expectedBytes.byteLength &&
      timingSafeEqual(providedBytes, expectedBytes),
  );
}

function canonicalForwardedHostname(value: string | null): string | null {
  if (
    !value ||
    value !== value.trim() ||
    value.length > MAX_HOSTNAME_LENGTH ||
    CONTROL_CHARACTERS.test(value) ||
    /[,\s:/?#@\\*]/.test(value) ||
    value.endsWith(".")
  ) {
    return null;
  }

  const ascii = domainToASCII(value);
  if (!ascii || ascii !== value || ascii !== ascii.toLowerCase()) {
    return null;
  }

  const labels = ascii.split(".");
  if (
    labels.length < 2 ||
    labels.some((label) => label.length === 0 || label.length > 63 || !DNS_LABEL.test(label))
  ) {
    return null;
  }

  return ascii;
}

export function selectTrustedStorefrontHostAuthority(
  headers: StorefrontAuthorityHeaders,
  source: StorefrontProxyEnvironment = process.env,
): TrustedStorefrontHostAuthority {
  const config = resolveStorefrontProxyConfig(source);
  if (config.mode !== "approved_staging") {
    return { kind: "disabled" };
  }

  const proxyAuthority = headers.get(PROXY_HEADER);
  if (proxyAuthority === null) {
    return { kind: "missing_proxy_authority" };
  }
  if (!authenticProxyToken(proxyAuthority, config.proxyToken)) {
    return { kind: "invalid_proxy_authority" };
  }

  const hostname = canonicalForwardedHostname(headers.get(FORWARDED_HOST_HEADER));
  if (!hostname) {
    return { kind: "invalid_forwarded_host" };
  }

  if (headers.get(FORWARDED_PROTO_HEADER) !== "https") {
    return { kind: "invalid_forwarded_proto" };
  }

  return { kind: "trusted", hostname };
}
