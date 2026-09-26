import { parseMerchantAdminRecord, parseMerchantPaymentMethod, parsePaymentProviderCatalog, parseShippingConnection, parseShippingResource } from "@celebix/saas-contracts";
import { merchantAdminConfig } from "@celebix/saas-data";

// Local browser acceptance records only. No real merchant, credential, provider,
// DNS or delivery call is made by this fixture.
const NOW = "2026-09-26T12:00:00.000Z";
const ID = "76000000-0000-4000-8000-000000000001";
const configs = {
  general_setting: { storeDisplayName: "Tarayıcı Test Mağazası", supportEmail: "destek@example.test", timezone: "Europe/Istanbul", skuPrefix: "TEST" },
  language_setting: { defaultLocale: "tr-TR", enabledLocales: "tr-TR, en-US" },
  notification_setting: { orderNotificationsEnabled: true, notificationEmail: "siparis@example.test", senderLabel: "Tarayıcı Test Mağazası", replyToEmail: "destek@example.test" },
  administrator_invite: { email: "editor@example.test", role: "editor", expiresAt: "2027-09-26T12:00:00.000Z" },
};
type Kind = keyof typeof configs;
const records = new Map(Object.entries(configs).map(([kind, config], index) => [kind, parseMerchantAdminRecord({ id: kind === "administrator_invite" ? ID : `75000000-0000-4000-8000-00000000000${index + 1}`, kind, name: `${kind} · Yerel tarayıcı testi`, config, status: "active", version: 2, createdAt: NOW, updatedAt: NOW })]));

export function getSettingsMerchantFixture(path: string): Response | null {
  const match = /^(records|events)\/(general_setting|language_setting|notification_setting|administrator_invite)(?:\/([^/]+))?$/.exec(path);
  if (!match) return null;
  const selected = records.get(match[2]);
  if (match[1] === "events") return Response.json({ items: [] });
  if (match[3]) return match[3] === selected?.id ? Response.json(selected) : Response.json({ code: "record_not_found" }, { status: 404 });
  return Response.json({ items: selected ? [selected] : [] });
}

export async function postSettingsMerchantFixture(path: string, request: Request): Promise<Response | null> {
  const match = /^records\/(general_setting|language_setting|notification_setting|administrator_invite)$/.exec(path);
  if (!match) return null;
  const kind = match[1] as Kind, selected = records.get(kind), body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !["active", "draft"].includes(body.status)) return Response.json({ code: "invalid_input" }, { status: 400 });
  let config;
  try { config = merchantAdminConfig(kind, body.config); }
  catch { return Response.json({ code: "invalid_input" }, { status: 400 }); }
  // Explicit test trigger for input retention and safe retry; no live writes.
  if (JSON.stringify(config).includes("[kaydetme hatası]")) return Response.json({ code: "unavailable" }, { status: 503 });
  if (body.recordId && (body.recordId !== selected?.id || body.expectedVersion !== selected?.version)) return Response.json({ code: "version_conflict" }, { status: 409 });
  const saved = parseMerchantAdminRecord({ id: selected?.id ?? ID, kind, name: body.name, config, status: body.status, version: (selected?.version ?? 0) + 1, createdAt: selected?.createdAt ?? NOW, updatedAt: NOW });
  records.set(kind, saved);
  return Response.json({ id: saved.id, kind, status: saved.status, version: saved.version, updatedAt: saved.updatedAt, replayed: false });
}

const DOMAIN = { schemaVersion: 1, id: "77000000-0000-4000-8000-000000000001", hostname: "store.browser.test", hostnameType: "custom_domain", status: "active", primary: true, uiStatus: "active", dnsInstructions: [], verifiedAt: NOW, version: 1, createdAt: NOW, updatedAt: NOW };
const ADMIN_DOMAIN = { schemaVersion: 1, id: "77000000-0000-4000-8000-000000000002", hostname: "admin.store.browser.test", kind: "custom_alias", status: "active", primary: true, fallback: false, hostnameStatus: "active", sslStatus: "active", dnsStatus: "ready", originStatus: "ready", uiStatus: "active", dnsInstructions: [], verifiedAt: NOW, lastCheckedAt: NOW, version: 1, createdAt: NOW, updatedAt: NOW };
const CATALOG = parsePaymentProviderCatalog([{ providerCode: "paytr_iframe", familyCode: "paytr", modeCode: "iframe", sourceSlug: "paytr-iframe", label: "PayTR", modeLabel: "iFrame", category: "payment_institution", interactionMode: "iframe", readiness: "planned", executionAuthority: null, support: { threeDSecure: "unknown", installments: "unknown", refund: "unknown", cancel: "unknown", capture: "unknown" }, logoPath: "/payment-providers/paytr.svg", aliases: ["pay tr"], environments: ["test", "live"] }]);
const METHOD = parseMerchantPaymentMethod({ id: "78000000-0000-4000-8000-000000000001", kind: "cash_on_delivery", profileId: null, providerCode: null, label: "Kapıda ödeme · Tarayıcı testi", state: "active", emergencyReason: null, position: 0, config: { instructions: "Yalnızca yerel sunum kaydı." }, version: 1, createdAt: NOW, updatedAt: NOW });
const SHIPPING = {
  connection: parseShippingConnection({ providerCode: "basit_kargo", displayName: "Basit Kargo · Tarayıcı testi", status: "active", credentialVersion: 1, selectedBrandLabel: "Test mağazası", selectedAddressLabel: "Test gönderici adresi", codDeliveredMarksPaid: false, verifiedAt: NOW, version: 1 }),
  resources: [parseShippingResource({ id: "79000000-0000-4000-8000-000000000001", kind: "brand", label: "Test mağazası", active: true, verifiedAt: NOW }), parseShippingResource({ id: "79000000-0000-4000-8000-000000000002", kind: "address", label: "Test gönderici adresi", active: true, verifiedAt: NOW })],
};
let analytics = { candidateInactivityMinutes: 30, abandonedInactivityHours: 24, recoveryLinkHours: 72, automaticRecoveryEnabled: false, maximumMessageAttempts: 2, minimumMessageIntervalHours: 24, trackingPolicy: "anonymous_commerce", version: 1 };
const connection = { provider: "umami", status: "active", configured: true, live: false };

export function getSettingsPresentationFixture(path: string): Response | null {
  if (path === "store-domains") return Response.json({ items: [DOMAIN] });
  if (path === "store-domain-replacements") return Response.json({ items: [] });
  if (path === "admin-domains") return Response.json({ items: [ADMIN_DOMAIN] });
  if (path === "payment-providers/catalog") return Response.json({ items: CATALOG });
  if (path === "payment-methods") return Response.json({ items: [METHOD] });
  if (path === "settings/shipping/connection") return Response.json(SHIPPING);
  if (path === "analytics/settings") return Response.json({ settings: analytics, connection });
  return null;
}

export async function postSettingsPresentationFixture(path: string, request: Request): Promise<Response | null> {
  if (path !== "analytics/settings") return null;
  const body = await request.json().catch(() => null);
  if (!body || body.expectedVersion !== analytics.version) return Response.json({ code: "version_conflict" }, { status: 409 });
  // The maximum valid inactivity value is reserved for the visible failure QA.
  if (body.candidateInactivityMinutes === 360) return Response.json({ code: "unavailable" }, { status: 503 });
  analytics = { ...analytics, ...body, version: analytics.version + 1 };
  delete (analytics as unknown as Record<string, unknown>).expectedVersion;
  return Response.json({ settings: analytics });
}
