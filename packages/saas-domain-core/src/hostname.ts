import { isIP } from "node:net";
import { domainToASCII } from "node:url";

import { parse } from "tldts";

import type { NormalizedStorefrontHostname, StorefrontHostnamePolicy } from "./types.ts";

const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function invalid(): never {
  throw new TypeError("storefront_hostname_invalid");
}

function exactHostname(value: unknown): string {
  if (typeof value !== "string" || value.length < 3 || value.length > 253 || value !== value.trim()) invalid();
  const withoutTrailingDot = value.endsWith(".") ? value.slice(0, -1) : value;
  if (
    withoutTrailingDot.length < 3
    || withoutTrailingDot.includes(":")
    || withoutTrailingDot.includes("/")
    || withoutTrailingDot.includes("@")
    || withoutTrailingDot.includes("*")
    || isIP(withoutTrailingDot) !== 0
  ) invalid();
  const ascii = domainToASCII(withoutTrailingDot).toLowerCase();
  if (!HOSTNAME.test(ascii) || ascii.length > 253) invalid();
  return ascii;
}

function storefrontHostname(value: unknown): string {
  if (typeof value !== "string" || value.length < 3 || value.length > 2_048 || value !== value.trim()) invalid();
  if (!value.toLowerCase().startsWith("https://")) return exactHostname(value);
  const authority = value.slice("https://".length).split(/[/?#]/u, 1)[0] ?? "";
  if (authority.includes(":")) invalid();
  let parsed: URL;
  try { parsed = new URL(value); } catch { invalid(); }
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.port !== ""
    || parsed.pathname !== "/"
    || parsed.search !== ""
    || parsed.hash !== ""
  ) invalid();
  return exactHostname(parsed.hostname);
}

export function normalizeManagedAdminHostname(raw: string, selectedPolicy: StorefrontHostnamePolicy): string {
  const hostname = exactHostname(raw);
  const validatedPolicy = policy(selectedPolicy);
  if (!hostname.startsWith("admin.") || validatedPolicy.reservedSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) invalid();
  const parsed = parse(hostname, { allowPrivateDomains: false });
  if (!parsed.isIcann || parsed.isIp || parsed.domain === null || parsed.publicSuffix === null || hostname !== `admin.${parsed.domain}`) invalid();
  return hostname;
}

function policy(value: unknown): StorefrontHostnamePolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== 2 || !Object.hasOwn(descriptors, "reservedSuffixes") || !Object.hasOwn(descriptors, "cnameTarget")) invalid();
  const reserved = descriptors.reservedSuffixes?.value;
  const target = descriptors.cnameTarget?.value;
  if (!Array.isArray(reserved) || reserved.length < 1 || reserved.length > 16 || typeof target !== "string") invalid();
  const normalizedReserved = reserved.map((entry) => {
    if (typeof entry !== "string" || entry !== entry.toLowerCase()) invalid();
    return exactHostname(entry);
  });
  const cnameTarget = exactHostname(target);
  return Object.freeze({ reservedSuffixes: Object.freeze(normalizedReserved), cnameTarget });
}

export function normalizeStorefrontHostname(
  raw: string,
  selectedPolicy: StorefrontHostnamePolicy,
): NormalizedStorefrontHostname {
  const hostname = storefrontHostname(raw);
  const validatedPolicy = policy(selectedPolicy);
  if (hostname.startsWith("admin.")) invalid();
  if (validatedPolicy.reservedSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) invalid();
  const parsed = parse(hostname, { allowPrivateDomains: false });
  if (!parsed.isIcann || parsed.isIp || parsed.domain === null || parsed.publicSuffix === null) invalid();
  const registrableDomain = parsed.domain;
  const apex = hostname === registrableDomain;
  const recordName = apex ? "@" : hostname.slice(0, -(registrableDomain.length + 1));
  if (!recordName || recordName.length > 189) invalid();
  return Object.freeze({ hostname, registrableDomain, recordName, apex });
}

export function deriveManagedAdminHostname(raw: string, selectedPolicy: StorefrontHostnamePolicy): string {
  const normalized = normalizeStorefrontHostname(raw, selectedPolicy);
  return `admin.${normalized.registrableDomain}`;
}

export type { NormalizedStorefrontHostname, StorefrontHostnamePolicy } from "./types.ts";
