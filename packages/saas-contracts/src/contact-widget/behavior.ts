import { isValidContactWidgetChannelValue, type ContactWidgetChannel, type ContactWidgetConfig, type ContactWidgetPageType } from "./config.ts";
export type ContactWidgetProductContext = Readonly<{ productTitle?: string; productUrl?: string }>;
function productContext(context?: ContactWidgetProductContext): string[] {
  if (!context?.productUrl) return [];
  try {
    const url = new URL(context.productUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !/^\/(products|urun)\/[^/]+$/u.test(url.pathname)) return [];
    const title = context.productTitle?.trim();
    return [...(title && title.length <= 200 && !/[\u0000-\u001f<>]/u.test(title) ? [title] : []), url.href];
  } catch { return []; }
}
export function resolveContactWidgetHref(channel: ContactWidgetChannel, config: ContactWidgetConfig, context?: ContactWidgetProductContext): string | null {
  if (!channel.enabled || !isValidContactWidgetChannelValue(channel.type, channel.value)) return null;
  switch (channel.type) {
    case "whatsapp": { const url = new URL(`https://wa.me/${channel.value.slice(1)}`); const message = [config.whatsappMessage, ...(config.includeProductLink ? productContext(context) : [])].filter(Boolean).join("\n"); if (message) url.searchParams.set("text", message); return url.href; }
    case "phone": return `tel:${channel.value}`;
    case "sms": return `sms:${channel.value}`;
    case "email": { const at = channel.value.lastIndexOf("@"); return `mailto:${encodeURIComponent(channel.value.slice(0, at))}@${channel.value.slice(at + 1)}`; }
    case "instagram": return `https://www.instagram.com/${channel.value}/`;
    case "telegram": return `https://t.me/${channel.value}`;
    case "messenger": return `https://m.me/${channel.value}`;
    case "maps": { const url = new URL("https://www.google.com/maps/search/"); url.searchParams.set("api", "1"); url.searchParams.set("query", channel.value); return url.href; }
    case "contact_page": return channel.value;
  }
}
export function contactWidgetPageType(pathname: string): ContactWidgetPageType | null {
  if (typeof pathname !== "string" || pathname.includes("?") || pathname.includes("#") || pathname.includes("%") || pathname.includes("\\") || pathname.includes("//")) return null;
  const path = pathname !== "/" ? pathname.replace(/\/$/u, "") : pathname;
  if (path === "/") return "home";
  if (path === "/cart") return "cart";
  if (path === "/search") return "search";
  if (/^\/(products|urun|urunler)(?:\/[^/]+)?$/u.test(path)) return "products";
  if (/^\/(categories|kategori|collections|koleksiyon)\/[^/]+$/u.test(path)) return "categories";
  if (/^\/(pages|blog|policies)(?:\/[^/]+)?$/u.test(path)) return "content";
  return null;
}
export function contactWidgetAvailability(config: ContactWidgetConfig, now: Date): "within_hours" | "outside_hours" {
  if (!config.hours.enabled) return "within_hours";
  if (!Number.isFinite(now.getTime())) return "outside_hours";
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: config.hours.timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")), minute = Number(get("hour")) * 60 + Number(get("minute"));
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const start = minutes(config.hours.opensAt), end = minutes(config.hours.closesAt);
    const within = start < end ? config.hours.days.includes(day) && minute >= start && minute < end : (minute >= start && config.hours.days.includes(day)) || (minute < end && config.hours.days.includes((day + 6) % 7));
    return within ? "within_hours" : "outside_hours";
  } catch { return "outside_hours"; }
}
export function shouldShowContactWidget(config: ContactWidgetConfig, input: Readonly<{ pathname: string; device: "desktop" | "mobile"; now: Date }>): boolean {
  const page = contactWidgetPageType(input.pathname);
  return config.enabled && config.devices[input.device] && page !== null && config.pages.includes(page) && config.channels.some(c => c.enabled && isValidContactWidgetChannelValue(c.type, c.value)) && (config.hours.outsideBehavior !== "hide" || contactWidgetAvailability(config, input.now) === "within_hours");
}
