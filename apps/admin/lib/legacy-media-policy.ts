import { BlockList, isIP } from "node:net";
import { extractAdminStoredAssetUrl, isAllowedAdminAssetHost } from "./asset-url";

export const LEGACY_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/avif", "image/gif",
  "image/svg+xml", "image/bmp", "image/x-icon", "image/vnd.microsoft.icon",
]);
const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");
const privateAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) privateAddresses.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20],
] as const) privateAddresses.addSubnet(network, prefix, "ipv6");

export function parseLegacyAssetSource(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const source = new URL(extractAdminStoredAssetUrl(value));
    if (source.protocol !== "https:" || source.port || source.username || source.password || source.hash) return null;
    return isAllowedAdminAssetHost(source.hostname) ? source : null;
  } catch {
    return null;
  }
}

export function isLegacyPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !privateAddresses.check(address, "ipv4");
  return family === 6 && globalIpv6.check(address, "ipv6") && !privateAddresses.check(address, "ipv6");
}

export function legacyImageType(value: string | null | undefined): string | null {
  const type = value?.split(";", 1)[0]?.trim().toLowerCase();
  return type && ALLOWED_TYPES.has(type) ? type : null;
}

export const LEGACY_ASSET_DOCUMENT_POLICY = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox";
