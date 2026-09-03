export type CommerceTouch = Readonly<{ source: string; medium: string; campaign?: string }>;
export type CommerceAttribution = Readonly<{ firstTouch: CommerceTouch; lastTouch: CommerceTouch; referrerHost?: string; landingPathGroup: string; deviceGroup: "desktop" | "mobile" | "tablet" | "unknown" }>;

const DIMENSION = /^[\p{L}\p{N}][\p{L}\p{N} ._+/-]{0,127}$/u;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const PATH = /^\/[a-z0-9/_-]{0,127}$/u;
const HIGH_RISK = /@|(?:https?:\/\/|www\.)|(?:\+?\d[\d ()-]{8,}\d)|(?:\d[ -]?){13,19}|(?:token\s*=)/iu;
const STORAGE_KEY = "celebix_commerce_first_touch_v1";

function invalid(): never { throw new TypeError("commerce_attribution_invalid"); }
function object(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid(); const row = value as Record<string, unknown>, allowed = new Set([...keys, ...optional]); if (keys.some((key) => !Object.hasOwn(row, key)) || Object.keys(row).some((key) => !allowed.has(key))) invalid(); return row; }
function dimension(value: unknown): string { if (typeof value !== "string" || value !== value.trim() || !DIMENSION.test(value) || HIGH_RISK.test(value)) invalid(); return value; }
function touch(value: unknown): CommerceTouch { const row = object(value, ["source", "medium"], ["campaign"]); return Object.freeze({ source: dimension(row.source), medium: dimension(row.medium), ...(Object.hasOwn(row, "campaign") ? { campaign: dimension(row.campaign) } : {}) }); }

export function parseCommerceAttribution(value: unknown): CommerceAttribution {
  const row = object(value, ["firstTouch", "lastTouch", "landingPathGroup", "deviceGroup"], ["referrerHost"]);
  if (typeof row.landingPathGroup !== "string" || !PATH.test(row.landingPathGroup) || !["desktop", "mobile", "tablet", "unknown"].includes(String(row.deviceGroup))) invalid();
  if (Object.hasOwn(row, "referrerHost") && (typeof row.referrerHost !== "string" || !HOSTNAME.test(row.referrerHost) || row.referrerHost !== row.referrerHost.toLowerCase())) invalid();
  const output = Object.freeze({ firstTouch: touch(row.firstTouch), lastTouch: touch(row.lastTouch), ...(Object.hasOwn(row, "referrerHost") ? { referrerHost: row.referrerHost as string } : {}), landingPathGroup: row.landingPathGroup, deviceGroup: row.deviceGroup as CommerceAttribution["deviceGroup"] });
  if (new TextEncoder().encode(JSON.stringify(output)).byteLength > 1024) invalid();
  return output;
}

function safeParameter(url: URL, key: string): string | undefined { const values = url.searchParams.getAll(key); if (values.length !== 1) return undefined; const value = values[0]?.trim(); if (!value) return undefined; try { return dimension(value); } catch { return undefined; } }
function landing(pathname: string): string { const value = pathname.toLowerCase().split("/").filter(Boolean).slice(0, 2).join("/"); const grouped = `/${value}`; return PATH.test(grouped) ? grouped : "/other"; }
function device(userAgent: string): CommerceAttribution["deviceGroup"] { if (/ipad|tablet/iu.test(userAgent)) return "tablet"; if (/mobile|iphone|android/iu.test(userAgent)) return "mobile"; return userAgent ? "desktop" : "unknown"; }

export function readCommerceAttribution(selectedBrowser?: Readonly<{ location: URL; document: Readonly<{ referrer: string }>; navigator: Readonly<{ userAgent: string }>; sessionStorage: Readonly<{ getItem(key: string): string | null; setItem(key: string, value: string): void }> }>): CommerceAttribution {
  try {
    const browser = selectedBrowser ?? window;
    const location = new URL(browser.location.href);
    let referrerHost: string | undefined;
    try { const referrer = new URL(browser.document.referrer); if (referrer.protocol === "https:" && !referrer.username && !referrer.password && !referrer.port && referrer.hostname !== location.hostname) referrerHost = referrer.hostname.toLowerCase(); } catch {}
    const source = safeParameter(location, "utm_source") ?? (referrerHost ? "referral" : "direct");
    const medium = safeParameter(location, "utm_medium") ?? (referrerHost ? "referral" : "none");
    const campaign = safeParameter(location, "utm_campaign");
    const current = touch({ source, medium, ...(campaign ? { campaign } : {}) });
    let first = current;
    try { const stored = browser.sessionStorage.getItem(STORAGE_KEY); if (stored) first = touch(JSON.parse(stored)); else browser.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch {}
    return parseCommerceAttribution({ firstTouch: first, lastTouch: current, ...(referrerHost ? { referrerHost } : {}), landingPathGroup: landing(location.pathname), deviceGroup: device(browser.navigator.userAgent) });
  } catch {
    return Object.freeze({ firstTouch: Object.freeze({ source: "unknown", medium: "unknown" }), lastTouch: Object.freeze({ source: "unknown", medium: "unknown" }), landingPathGroup: "/unknown", deviceGroup: "unknown" });
  }
}
