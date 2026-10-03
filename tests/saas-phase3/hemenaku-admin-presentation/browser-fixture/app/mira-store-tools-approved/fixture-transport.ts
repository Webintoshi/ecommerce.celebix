import { createDefaultContactWidgetConfig, parseContactWidgetConfig, parseMerchantAdminRecord } from "@celebix/saas-contracts";

export type StoreToolsScenario = "loaded" | "readonly" | "conflict" | "error" | "loading" | "load-error";
const NOW = "2026-10-03T12:00:00.000Z";
const ID = "81000000-0000-4000-8000-000000000001";
const CONTACT_PATH = "/api/merchant-admin/records/contact_widget";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function initialRecord() {
  const defaults = createDefaultContactWidgetConfig();
  const values = { whatsapp: "+905551112233", phone: "+905551112234", instagram: "mira_local_qa", contact_page: "/pages/iletisim" };
  const config = parseContactWidgetConfig({
    ...defaults, enabled: true, title: "Size nasıl yardımcı olabiliriz?", greeting: "Sorularınız için buradayız.",
    channels: defaults.channels.map(channel => ({ ...channel, enabled: ["whatsapp", "phone", "instagram"].includes(channel.type), value: values[channel.type as keyof typeof values] ?? "" })),
  });
  return parseMerchantAdminRecord({ id: ID, kind: "contact_widget", name: "İletişim balonu", config, status: "active", version: 3, createdAt: NOW, updatedAt: NOW });
}

/** Every API response and mutation is synthetic, in-memory, and local-origin only. */
export function createStoreToolsFixtureTransport({ state, origin }: { state: StoreToolsScenario; origin: string }) {
  let current = initialRecord();
  let conflictSent = false;
  const calls: { method: string; path: string; blocked: boolean }[] = [];
  const operations = new Map<string, { body: string; result: unknown }>();
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  const record = (kind: "page" | "language_setting") => parseMerchantAdminRecord({
    id: kind === "page" ? "82000000-0000-4000-8000-000000000001" : "83000000-0000-4000-8000-000000000001", kind,
    name: kind === "page" ? "İletişim" : "Mağaza dili", status: "active", version: 1, createdAt: NOW, updatedAt: NOW,
    config: kind === "page" ? { title: "İletişim", slug: "iletisim", locale: "tr-TR", body: "Yerel mağaza iletişim sayfası." } : { defaultLocale: "tr-TR", enabledLocales: "tr-TR, en-US" },
  });
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), origin);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const supported = url.origin === origin && !url.search && ((method === "GET" && [CONTACT_PATH, "/api/merchant-admin/records/page", "/api/merchant-admin/records/language_setting"].includes(url.pathname)) || (method === "POST" && url.pathname === CONTACT_PATH));
    calls.push({ method, path: url.pathname, blocked: !supported });
    if (!supported) return json({ code: "membership_denied" }, 403);
    if (method === "GET") {
      if (url.pathname === CONTACT_PATH) {
        if (state === "loading") return new Promise<Response>(() => {});
        if (state === "load-error") return json({ code: "unavailable" }, 503);
        return json({ items: [clone(current)] });
      }
      return json({ items: [clone(record(url.pathname.endsWith("/page") ? "page" : "language_setting"))] });
    }
    if (state === "readonly") return json({ code: "membership_denied" }, 403);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const operationId = headers.get("idempotency-key");
    const bodyText = typeof init?.body === "string" ? init.body : input instanceof Request ? await input.text() : "";
    let body: Record<string, unknown>;
    try { body = JSON.parse(bodyText); } catch { return json({ code: "invalid_input" }, 400); }
    if (!operationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationId) || Object.keys(body).sort().join(",") !== "config,expectedVersion,name,recordId,status" || body.recordId !== ID || typeof body.name !== "string" || body.status !== "active") return json({ code: "invalid_input" }, 400);
    const replay = operations.get(operationId);
    if (replay) return replay.body === bodyText ? json({ ...(replay.result as object), replayed: true }) : json({ code: "operation_mismatch" }, 409);
    if (state === "conflict" && !conflictSent) {
      conflictSent = true;
      current = parseMerchantAdminRecord({ ...current, version: 5, config: { ...current.config, title: "Güncel destek ekibi" } });
      return json({ code: "version_conflict" }, 409);
    }
    if (state === "error") return json({ code: "unavailable" }, 503);
    if (body.expectedVersion !== current.version) return json({ code: "version_conflict" }, 409);
    try { current = parseMerchantAdminRecord({ ...current, name: body.name, config: parseContactWidgetConfig(body.config), version: current.version + 1 }); }
    catch { return json({ code: "invalid_input" }, 400); }
    const result = { id: current.id, kind: current.kind, status: current.status, version: current.version, updatedAt: current.updatedAt, replayed: false };
    operations.set(operationId, { body: bodyText, result });
    return json(result);
  };
  return { fetch: fetcher, snapshot: () => ({ state, storeSlug: "mira-store-tools-local-qa", liveWrites: false, calls: clone(calls), record: clone(current) }) };
}
