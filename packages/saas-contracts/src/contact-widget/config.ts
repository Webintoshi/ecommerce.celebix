export const CONTACT_WIDGET_CHANNEL_TYPES = Object.freeze(["whatsapp", "phone", "sms", "email", "instagram", "telegram", "messenger", "maps", "contact_page"] as const);
export const CONTACT_WIDGET_PAGE_TYPES = Object.freeze(["home", "products", "categories", "content", "cart", "search"] as const);
export type ContactWidgetChannelType = typeof CONTACT_WIDGET_CHANNEL_TYPES[number];
export type ContactWidgetPageType = typeof CONTACT_WIDGET_PAGE_TYPES[number];
export type ContactWidgetChannel = Readonly<{ type: ContactWidgetChannelType; enabled: boolean; label: string; value: string }>;
export type ContactWidgetConfig = Readonly<{
  schemaVersion: 1; enabled: boolean; title: string; greeting: string; buttonLabel: string;
  position: "bottom-left" | "bottom-right"; icon: "message" | "headset"; theme: "brand" | "light" | "dark";
  devices: Readonly<{ desktop: boolean; mobile: boolean }>; pages: readonly ContactWidgetPageType[];
  whatsappMessage: string; includeProductLink: boolean;
  hours: Readonly<{ enabled: boolean; timeZone: string; days: readonly number[]; opensAt: string; closesAt: string; outsideBehavior: "message" | "hide"; outsideMessage: string }>;
  channels: readonly ContactWidgetChannel[];
}>;
const LABELS: Record<ContactWidgetChannelType, string> = { whatsapp: "WhatsApp", phone: "Bizi arayın", sms: "SMS gönderin", email: "E-posta", instagram: "Instagram", telegram: "Telegram", messenger: "Messenger", maps: "Yol tarifi", contact_page: "İletişim sayfası" };
export function createDefaultContactWidgetConfig(): ContactWidgetConfig {
  return Object.freeze({ schemaVersion: 1, enabled: false, title: "Size nasıl yardımcı olabiliriz?", greeting: "Sorularınız için bize ulaşın.", buttonLabel: "İletişim", position: "bottom-right", icon: "message", theme: "brand", devices: Object.freeze({ desktop: true, mobile: true }), pages: CONTACT_WIDGET_PAGE_TYPES, whatsappMessage: "Merhaba, bilgi almak istiyorum.", includeProductLink: true,
    hours: Object.freeze({ enabled: false, timeZone: "Europe/Istanbul", days: Object.freeze([1, 2, 3, 4, 5, 6]), opensAt: "09:00", closesAt: "18:00", outsideBehavior: "message", outsideMessage: "Mesai dışındayız. Mesajınızı bırakabilirsiniz." }),
    channels: Object.freeze(CONTACT_WIDGET_CHANNEL_TYPES.map(type => Object.freeze({ type, enabled: false, label: LABELS[type], value: "" }))) });
}
export function invalidContactWidget(): never { throw new Error("contact_widget_contract_invalid"); }
// IANA tzdb links without a region path; Intl also accepts unrelated ICU legacy IDs.
const IANA_SINGLE_SEGMENT_TIME_ZONES = new Set(["CET", "CST6CDT", "Cuba", "EET", "EST", "EST5EDT", "Egypt", "Eire", "GB", "GB-Eire", "GMT", "GMT+0", "GMT-0", "GMT0", "Greenwich", "HST", "Hongkong", "Iceland", "Iran", "Israel", "Jamaica", "Japan", "Kwajalein", "Libya", "MET", "MST", "MST7MDT", "NZ", "NZ-CHAT", "Navajo", "PRC", "PST8PDT", "Poland", "Portugal", "ROC", "ROK", "Singapore", "Turkey", "UCT", "UTC", "Universal", "W-SU", "WET", "Zulu"].map(value => value.toLowerCase()));
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u;
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalidContactWidget();
  const own = Reflect.ownKeys(value), descriptors = Object.getOwnPropertyDescriptors(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key) || !descriptors[key]?.enumerable || !("value" in descriptors[key]!))) invalidContactWidget();
  return value as Record<string, unknown>;
}
function text(value: unknown, min: number, max: number): string {
  if (typeof value !== "string" || value.trim() !== value || Array.from(value).length < min || Array.from(value).length > max || CONTROL.test(value) || SURROGATE.test(value) || /[<>]/u.test(value)) invalidContactWidget();
  return value;
}
function boolean(value: unknown): boolean { if (typeof value !== "boolean") invalidContactWidget(); return value; }
function choice<T extends string>(value: unknown, values: readonly T[]): T { if (!values.includes(value as T)) invalidContactWidget(); return value as T; }
function list<T>(value: unknown, max: number, parser: (entry: unknown) => T): readonly T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) invalidContactWidget();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let i = 0; i < value.length; i++) if (!descriptors[String(i)]?.enumerable || !("value" in descriptors[String(i)]!)) invalidContactWidget();
  return Object.freeze(value.map(parser));
}
export function isValidContactWidgetChannelValue(type: ContactWidgetChannelType, value: string): boolean {
  if (!value || value.trim() !== value || CONTROL.test(value) || SURROGATE.test(value) || /[<>]/u.test(value) || Array.from(value).length > 320) return false;
  switch (type) {
    case "whatsapp": case "phone": case "sms": return /^\+[1-9][0-9]{6,14}$/u.test(value);
    case "email": return value.length <= 254 && /^[A-Za-z0-9!#$%&'*+/=^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/u.test(value) && value.split("@")[0]!.length <= 64;
    case "instagram": return /^(?!\.)(?!.*\.\.)[A-Za-z0-9._]{1,30}(?<!\.)$/u.test(value);
    case "telegram": return /^[A-Za-z][A-Za-z0-9_]{4,31}$/u.test(value);
    case "messenger": return /^[A-Za-z0-9][A-Za-z0-9.]{0,49}$/u.test(value);
    case "maps": return Array.from(value).length >= 3 && !/^\w+:/u.test(value) && !value.startsWith("//");
    case "contact_page": return /^\/pages\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) && value.length <= 107;
  }
}
/** UI helper only: server config values remain canonical and never accept raw URLs. */
export function normalizeContactWidgetChannelValue(type: ContactWidgetChannelType, raw: string): string {
  let value = raw.trim();
  if (!value) return "";
  if (["whatsapp", "phone", "sms"].includes(type) && /^[+0-9 ()-]+$/u.test(value)) {
    const digits = value.replace(/\D/gu, "");
    value = /^0[0-9]{10}$/u.test(digits) ? `+90${digits.slice(1)}` : /^[0-9]{10}$/u.test(digits) ? `+90${digits}` : `+${digits}`;
  } else if (["instagram", "telegram", "messenger"].includes(type)) value = value.replace(/^@/u, "");
  else if (type === "email") { const at = value.lastIndexOf("@"); if (at >= 0) value = value.slice(0, at) + value.slice(at).toLowerCase(); }
  if (!isValidContactWidgetChannelValue(type, value)) invalidContactWidget();
  return value;
}
export function parseContactWidgetConfig(value: unknown): ContactWidgetConfig {
  const r = object(value, ["schemaVersion", "enabled", "title", "greeting", "buttonLabel", "position", "icon", "theme", "devices", "pages", "whatsappMessage", "includeProductLink", "hours", "channels"]);
  if (r.schemaVersion !== 1) invalidContactWidget();
  const d = object(r.devices, ["desktop", "mobile"]), h = object(r.hours, ["enabled", "timeZone", "days", "opensAt", "closesAt", "outsideBehavior", "outsideMessage"]);
  const timeZone = text(h.timeZone, 1, 80);
  if (!/^[A-Za-z][A-Za-z0-9_+/-]*$/u.test(timeZone) || /^(posix\/|right\/|posixrules$|Factory$|localtime$|SystemV\/)/iu.test(timeZone)) invalidContactWidget();
  if (!timeZone.includes("/") && !IANA_SINGLE_SEGMENT_TIME_ZONES.has(timeZone.toLowerCase())) invalidContactWidget();
  try { new Intl.DateTimeFormat("en", { timeZone }).format(new Date(0)); } catch { invalidContactWidget(); }
  const days = list(h.days, 7, entry => { if (!Number.isSafeInteger(entry) || (entry as number) < 0 || (entry as number) > 6) invalidContactWidget(); return entry as number; });
  const opensAt = text(h.opensAt, 5, 5), closesAt = text(h.closesAt, 5, 5);
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/u.test(opensAt) || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/u.test(closesAt) || opensAt === closesAt || new Set(days).size !== days.length || (boolean(h.enabled) && days.length === 0)) invalidContactWidget();
  const hours = Object.freeze({ enabled: boolean(h.enabled), timeZone, days, opensAt, closesAt, outsideBehavior: choice(h.outsideBehavior, ["message", "hide"]), outsideMessage: text(h.outsideMessage, 0, 240) });
  const pages = list(r.pages, 6, entry => choice(entry, CONTACT_WIDGET_PAGE_TYPES));
  if (new Set(pages).size !== pages.length) invalidContactWidget();
  const channels = list(r.channels, 9, entry => { const c = object(entry, ["type", "enabled", "label", "value"]), type = choice(c.type, CONTACT_WIDGET_CHANNEL_TYPES), enabled = boolean(c.enabled), destination = text(c.value, 0, 320); if ((enabled || destination !== "") && !isValidContactWidgetChannelValue(type, destination)) invalidContactWidget(); return Object.freeze({ type, enabled, label: text(c.label, 1, 40), value: destination }); });
  if (new Set(channels.map(c => c.type)).size !== channels.length) invalidContactWidget();
  const devices = Object.freeze({ desktop: boolean(d.desktop), mobile: boolean(d.mobile) }), enabled = boolean(r.enabled);
  if (enabled && (!channels.some(c => c.enabled) || !pages.length || (!devices.desktop && !devices.mobile))) invalidContactWidget();
  return Object.freeze({ schemaVersion: 1, enabled, title: text(r.title, 1, 80), greeting: text(r.greeting, 0, 240), buttonLabel: text(r.buttonLabel, 1, 32), position: choice(r.position, ["bottom-left", "bottom-right"]), icon: choice(r.icon, ["message", "headset"]), theme: choice(r.theme, ["brand", "light", "dark"]), devices, pages, whatsappMessage: text(r.whatsappMessage, 0, 300), includeProductLink: boolean(r.includeProductLink), hours, channels });
}
