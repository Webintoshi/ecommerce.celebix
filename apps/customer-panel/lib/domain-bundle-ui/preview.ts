import { parse } from "tldts";

const HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

export function previewDomainBundle(raw: string): Readonly<{ storefront: string; admin: string }> | null {
  if (typeof raw !== "string" || raw.length < 3 || raw.length > 2_048 || raw !== raw.trim()) return null;
  let hostname = raw;
  if (raw.toLowerCase().startsWith("https://")) {
    const authority = raw.slice("https://".length).split(/[/?#]/u, 1)[0] ?? "";
    if (authority.includes(":")) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) return null;
      hostname = url.hostname;
    } catch { return null; }
  } else {
    try { hostname = new URL(`https://${raw}`).hostname; } catch { return null; }
  }
  hostname = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  hostname = hostname.toLowerCase();
  if (!HOST.test(hostname) || hostname.startsWith("admin.")) return null;
  const selected = parse(hostname, { allowPrivateDomains: false });
  if (!selected.isIcann || selected.isIp || selected.domain === null || selected.publicSuffix === null) return null;
  return Object.freeze({ storefront: hostname, admin: `admin.${selected.domain}` });
}
