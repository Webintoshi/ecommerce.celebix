import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMerchantAdminRecord } from "../merchant-admin/validation.ts";
import { createDefaultContactWidgetConfig, parseContactWidgetConfig, normalizeContactWidgetChannelValue, resolveContactWidgetHref, contactWidgetAvailability, shouldShowContactWidget, contactWidgetPageType } from "./index.ts";

function active() {
  const config = createDefaultContactWidgetConfig();
  return { ...config, enabled: true, channels: config.channels.map(c => c.type === "whatsapp" ? { ...c, enabled: true, value: "+905347990028" } : c) };
}

test("default and per-channel disable remain off even with a retained destination", () => {
  assert.equal(shouldShowContactWidget(createDefaultContactWidgetConfig(), { pathname: "/", device: "mobile", now: new Date() }), false);
  const config = active();
  assert.equal(resolveContactWidgetHref({ ...config.channels[0]!, enabled: false }, config), null);
  assert.throws(() => parseContactWidgetConfig({ ...config, channels: config.channels.map(c => ({ ...c, enabled: false })) }));
});

test("merchant record output validates the contact configuration rather than trusting stored JSON", () => {
  const record = { id: "11111111-1111-4111-8111-111111111111", kind: "contact_widget", name: "İletişim balonu", config: active(), status: "active", version: 1, createdAt: "2026-10-03T10:00:00.000Z", updatedAt: "2026-10-03T10:00:00.000Z" };
  assert.equal(parseMerchantAdminRecord(record).kind, "contact_widget");
  assert.throws(() => parseMerchantAdminRecord({ ...record, config: { enabled: true } }));
});

test("rejects active empty destinations, unknown keys, duplicate channels and protocol injection", () => {
  const config = active();
  for (const value of ["javascript:alert(1)", "https://attacker.example", "+905347990028\n", "05347990028"]) assert.throws(() => parseContactWidgetConfig({ ...config, channels: [{ ...config.channels[0]!, value }] }));
  assert.throws(() => parseContactWidgetConfig({ ...config, channels: [{ ...config.channels[0]!, value: "" }] }));
  assert.throws(() => parseContactWidgetConfig({ ...config, surprise: true }));
  assert.throws(() => parseContactWidgetConfig({ ...config, channels: [config.channels[0]!, config.channels[0]!] }));
  assert.equal(normalizeContactWidgetChannelValue("whatsapp", "0534 799 00 28"), "+905347990028");
  assert.equal(normalizeContactWidgetChannelValue("instagram", "@lilyum.flora"), "lilyum.flora");
  assert.throws(() => normalizeContactWidgetChannelValue("telegram", "https://evil.example"));
});

test("only canonical product URLs are included in WhatsApp context", () => {
  const config = { ...active(), whatsappMessage: "Merhaba" };
  const channel = config.channels[0]!;
  const href = resolveContactWidgetHref(channel, config, { productTitle: "Yüzük & Altın", productUrl: "https://guzidekuyumcu.com/products/yuzuk" })!;
  assert.equal(new URL(href).searchParams.get("text"), "Merhaba\nYüzük & Altın\nhttps://guzidekuyumcu.com/products/yuzuk");
  for (const productUrl of ["https://guzidekuyumcu.com/account?token=x", "https://guzidekuyumcu.com/products/yuzuk?email=secret", "https://guzidekuyumcu.com/products/yuzuk#secret", "https://user:password@guzidekuyumcu.com/products/yuzuk", "javascript:alert(1)"]) assert.equal(new URL(resolveContactWidgetHref(channel, config, { productTitle: "Özel", productUrl })!).searchParams.get("text"), "Merhaba");
});

test("links are derived from channel types, email header injection is rejected", () => {
  const config = active();
  const channel = (type: typeof config.channels[number]["type"], value: string) => ({ type, value, enabled: true, label: "İletişim" });
  assert.equal(resolveContactWidgetHref(channel("phone", "+905347990028"), config), "tel:+905347990028");
  assert.equal(resolveContactWidgetHref(channel("sms", "+905347990028"), config), "sms:+905347990028");
  assert.equal(resolveContactWidgetHref(channel("email", "hello@example.com"), config), "mailto:hello@example.com");
  for (const local of ["a#tag", "a%tag", "a+tag"]) {
    const href = resolveContactWidgetHref(channel("email", `${local}@example.com`), config)!;
    assert.equal(href, `mailto:${encodeURIComponent(local)}@example.com`);
    assert.equal(new URL(href).hash, ""); assert.equal(new URL(href).search, "");
  }
  assert.equal(resolveContactWidgetHref(channel("telegram", "flora_store"), config), "https://t.me/flora_store");
  assert.equal(resolveContactWidgetHref(channel("messenger", "flora.store"), config), "https://m.me/flora.store");
  assert.equal(resolveContactWidgetHref(channel("contact_page", "/pages/iletisim"), config), "/pages/iletisim");
  assert.equal(new URL(resolveContactWidgetHref(channel("maps", "Ordu Altınordu"), config)!).searchParams.get("query"), "Ordu Altınordu");
  assert.equal(resolveContactWidgetHref(channel("email", "hello@example.com?bcc=evil@example.com"), config), null);
  assert.equal(resolveContactWidgetHref(channel("contact_page", "//evil.example"), config), null);
  assert.ok(resolveContactWidgetHref(channel("contact_page", `/pages/${"a".repeat(100)}`), config));
  assert.equal(resolveContactWidgetHref(channel("contact_page", `/pages/${"a".repeat(101)}`), config), null);
});

test("page/device rules always exclude private and payment paths across navigation", () => {
  const config = active();
  for (const pathname of ["/checkout", "/checkout/success", "/odeme/hizli", "/account", "/account/orders/123", "/api/payments", "/cart/recover", "/anything-unknown"]) assert.equal(shouldShowContactWidget(config, { pathname, device: "mobile", now: new Date() }), false, pathname);
  assert.equal(contactWidgetPageType("/categories/yuzuk"), "categories");
  assert.equal(contactWidgetPageType("/urun/yuzuk"), "products");
  assert.equal(shouldShowContactWidget({ ...config, devices: { desktop: true, mobile: false } }, { pathname: "/products/yuzuk", device: "mobile", now: new Date() }), false);
  assert.equal(shouldShowContactWidget({ ...config, pages: ["home"] }, { pathname: "/products/yuzuk", device: "desktop", now: new Date() }), false);
  assert.equal(shouldShowContactWidget(config, { pathname: "/products/yuzuk", device: "desktop", now: new Date() }), true);
});

test("working hours use the selected timezone and the previous day for overnight shifts", () => {
  const config = { ...active(), hours: { ...active().hours, enabled: true, days: [1], opensAt: "22:00", closesAt: "02:00" } };
  assert.equal(contactWidgetAvailability(config, new Date("2026-10-05T20:00:00Z")), "within_hours");
  assert.equal(contactWidgetAvailability(config, new Date("2026-10-05T22:00:00Z")), "within_hours");
  assert.equal(contactWidgetAvailability(config, new Date("2026-10-05T23:00:00Z")), "outside_hours");
  assert.equal(shouldShowContactWidget({ ...config, hours: { ...config.hours, outsideBehavior: "hide" as const } }, { pathname: "/", device: "desktop", now: new Date("2026-10-05T23:00:00Z") }), false);
  assert.throws(() => parseContactWidgetConfig({ ...config, hours: { ...config.hours, timeZone: "Invalid/Zone" } }));
  for (const timeZone of ["+01:00", "-05:30", "SystemV/EST5EDT", "Factory", "posix/Europe/Istanbul", "right/Europe/Istanbul", "localtime", "posixrules"]) assert.throws(() => parseContactWidgetConfig({ ...config, hours: { ...config.hours, timeZone } }), timeZone);
  assert.throws(() => parseContactWidgetConfig({ ...config, hours: { ...config.hours, days: [1, 1] } }));
  assert.throws(() => parseContactWidgetConfig({ ...config, hours: { ...config.hours, closesAt: "22:00" } }));
});


test("working hours accept IANA single-segment aliases and reject ICU-only abbreviations", () => {
  const config = createDefaultContactWidgetConfig();
  for (const timeZone of ["UTC", "utc", "EST5EDT", "GMT+0", "Etc/GMT+1", "US/Eastern"])
    assert.equal(parseContactWidgetConfig({ ...config, hours: { ...config.hours, timeZone } }).hours.timeZone, timeZone);
  for (const timeZone of ["ACT", "AET", "AGT", "ART", "AST", "BET", "BST", "CAT", "CNT", "CST", "CTT", "EAT", "ECT", "IET", "IST", "JST", "MIT", "NET", "NST", "PLT", "PNT", "PRT", "PST", "SST", "VST"])
    assert.throws(() => parseContactWidgetConfig({ ...config, hours: { ...config.hours, timeZone } }), timeZone);
});
