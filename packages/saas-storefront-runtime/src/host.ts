import { isIP } from "node:net";
import { domainToASCII } from "node:url";

export interface TrustedHostPolicy {
  allowLocalTestHosts?: boolean;
}

export interface ParsedTrustedHost {
  hostname: string;
  localTest: boolean;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const INTERNAL_WHITESPACE = /\s/u;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const MAX_DNS_HOSTNAME_LENGTH = 253;

function parsePort(port: string | undefined): void {
  if (port === undefined) {
    return;
  }

  if (!/^\d+$/.test(port)) {
    throw new TypeError("Trusted host contains a non-numeric port.");
  }

  const numericPort = Number(port);
  if (!Number.isSafeInteger(numericPort) || numericPort < 1 || numericPort > 65_535) {
    throw new TypeError("Trusted host contains an invalid port.");
  }
}

function localHostResult(hostname: string, policy: TrustedHostPolicy): ParsedTrustedHost {
  if (!policy.allowLocalTestHosts) {
    throw new TypeError("Local and IP hosts require explicit local-test mode.");
  }

  const allowed = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (!allowed) {
    throw new TypeError("Only loopback hosts are permitted in local-test mode.");
  }

  return { hostname, localTest: true };
}

/**
 * Normalizes a host value selected by a trusted server/proxy adapter.
 * This function deliberately knows nothing about X-Forwarded-Host.
 */
export function normalizeStoreHostname(
  trustedHost: string,
  policy: TrustedHostPolicy = {},
): ParsedTrustedHost {
  if (typeof trustedHost !== "string" || trustedHost.length === 0) {
    throw new TypeError("Trusted host is required.");
  }

  if (CONTROL_CHARACTERS.test(trustedHost)) {
    throw new TypeError("Trusted host contains control characters.");
  }

  let value = trustedHost.trim();
  if (value.length === 0) {
    throw new TypeError("Trusted host is required.");
  }

  if (
    value.includes(",") ||
    value.includes("://") ||
    value.includes("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("@") ||
    value.includes("\\") ||
    INTERNAL_WHITESPACE.test(value)
  ) {
    throw new TypeError("Trusted host contains forbidden authority syntax.");
  }

  if (value.startsWith("[")) {
    const bracketed = /^\[([^\]]+)](?::([^:]+))?$/.exec(value);
    if (!bracketed || isIP(bracketed[1]) !== 6) {
      throw new TypeError("Trusted host contains malformed IPv6.");
    }

    parsePort(bracketed[2]);
    return localHostResult(bracketed[1].toLowerCase(), policy);
  }

  if (value.includes("[") || value.includes("]")) {
    throw new TypeError("Trusted host contains malformed IPv6.");
  }

  const directIpVersion = isIP(value);
  if (directIpVersion !== 0) {
    return localHostResult(value.toLowerCase(), policy);
  }

  const colonCount = [...value].filter((character) => character === ":").length;
  if (colonCount > 1) {
    throw new TypeError("Trusted host contains malformed IPv6.");
  }

  if (colonCount === 1) {
    const separator = value.lastIndexOf(":");
    const hostname = value.slice(0, separator);
    const port = value.slice(separator + 1);
    parsePort(port);
    if (hostname.length === 0) {
      throw new TypeError("Trusted host is required.");
    }
    value = hostname;
  }

  if (value.endsWith(".")) {
    value = value.slice(0, -1);
  }

  if (value.length === 0) {
    throw new TypeError("Trusted host is required.");
  }

  const asciiHostname = domainToASCII(value).toLowerCase();
  if (asciiHostname.length === 0 || asciiHostname.length > MAX_DNS_HOSTNAME_LENGTH) {
    throw new TypeError("Trusted host exceeds accepted DNS length.");
  }

  if (asciiHostname === "localhost" || isIP(asciiHostname) !== 0) {
    return localHostResult(asciiHostname, policy);
  }

  const labels = asciiHostname.split(".");
  for (const label of labels) {
    if (label.length === 0 || label.length > 63 || !DNS_LABEL.test(label)) {
      throw new TypeError("Trusted host contains an invalid DNS label.");
    }
  }

  return { hostname: asciiHostname, localTest: false };
}
