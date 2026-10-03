import {
  parseMerchantAdminRecord,
  parseMerchantContentDocument,
  parseSaveMerchantContentRequest,
  type MerchantContentDocument,
  type MerchantContentValues,
} from "@celebix/saas-contracts";

export type RequiredPagesScenario = "loaded" | "readonly" | "loading" | "load-error" | "save-error" | "conflict";
export function requiredPagesScenario(value: string | undefined): RequiredPagesScenario {
  const states: readonly RequiredPagesScenario[] = ["loaded", "readonly", "loading", "load-error", "save-error", "conflict"];
  return states.includes(value as RequiredPagesScenario) ? value as RequiredPagesScenario : "loaded";
}
export const REQUIRED_PAGE_IDS = Object.freeze({
  about: "85000000-0000-4000-8000-000000000001",
  contact: "85000000-0000-4000-8000-000000000002",
  blog: "85000000-0000-4000-8000-000000000003",
  custom: "85000000-0000-4000-8000-000000000004",
});
export const FIXTURE_STORE_ID = "85000000-0000-4000-8000-000000000010";
const NOW = "2026-10-04T12:00:00.000Z";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const digest = (version: number) => `sha256:${String(version % 10).repeat(64)}`;

function seedDocument(key: keyof typeof REQUIRED_PAGE_IDS) {
  const names = { about: "Hakkımızda", contact: "İletişim", blog: "Blog", custom: "Teslimat bilgileri" };
  const slugs = { about: "hakkimizda", contact: "iletisim", blog: "blog", custom: "teslimat-bilgileri" };
  return parseMerchantContentDocument({
    id: REQUIRED_PAGE_IDS[key], kind: "page", name: names[key], slug: slugs[key], locale: "tr",
    body: key === "custom" ? "<p>Siparişleriniz özenle hazırlanır.</p>" : "",
    excerpt: null, seoTitle: null, seoDescription: null,
    published: key === "custom", status: key === "custom" ? "active" : "draft", version: 1,
    publishedAt: key === "custom" ? NOW : null, createdAt: NOW, updatedAt: NOW,
    bodyFormat: "normalized_html", bodyDigest: digest(1), origins: {},
    ...(key === "custom" ? {} : { requiredPageKey: key }),
  });
}

function recordFromDocument(document: MerchantContentDocument) {
  return parseMerchantAdminRecord({
    id: document.id, kind: document.kind, name: document.name, status: document.status,
    version: document.version, createdAt: document.createdAt, updatedAt: document.updatedAt,
    config: { slug: document.slug, locale: document.locale, body: document.body, published: document.published },
    ...(document.requiredPageKey ? { requiredPageKey: document.requiredPageKey } : {}),
  });
}

function historyValues(document: MerchantContentDocument) {
  const { name, slug, locale, body, excerpt, seoTitle, seoDescription, published } = document;
  return { name, slug, locale, body, excerpt, seoTitle, seoDescription, published };
}

/** Synthetic local-origin transport. It never forwards an API request to a server. */
export function createRequiredPagesFixtureTransport({ state, origin }: { state: RequiredPagesScenario; origin: string }) {
  const documents = new Map<string, MerchantContentDocument>();
  // Deliberately unsorted input proves that the production list pins required pages.
  for (const key of ["custom", "blog", "contact", "about"] as const) {
    const document = seedDocument(key);
    documents.set(document.id, document);
  }
  const versions = new Map<string, MerchantContentDocument[]>();
  const operations = new Map<string, { body: string; result: unknown }>();
  const calls: { method: string; path: string; blocked: boolean }[] = [];
  let conflictSent = false;
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  const failure = (code: string, status: number) => json({ code }, status);

  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), origin);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const contentMatch = /^\/api\/merchant-content\/page\/([0-9a-f-]+)(\/versions)?$/.exec(url.pathname);
    const archiveMatch = /^\/api\/merchant-admin\/records\/page\/([0-9a-f-]+)\/archive$/.exec(url.pathname);
    const allowedQuery = contentMatch?.[2] === "/versions" && [...url.searchParams.keys()].every(key => ["limit", "beforeVersion"].includes(key));
    const supported = url.origin === origin && (!url.search || allowedQuery) && (
      method === "GET" && ["/api/merchant-admin/records/page", "/api/merchant-admin/events/page"].includes(url.pathname) ||
      method === "GET" && !!contentMatch ||
      method === "POST" && (url.pathname === "/api/merchant-content/page" || !!archiveMatch)
    );
    calls.push({ method, path: url.pathname, blocked: !supported });
    if (!supported) return failure("membership_denied", 403);

    if (method === "GET") {
      if (url.pathname === "/api/merchant-admin/events/page") return json({ items: [] });
      if (state === "loading") return new Promise<Response>(() => {});
      if (state === "load-error") return failure("unavailable", 503);
      if (url.pathname === "/api/merchant-admin/records/page") return json({ items: [...documents.values()].map(recordFromDocument) });
      const document = documents.get(contentMatch![1]!);
      if (!document) return failure("record_not_found", 404);
      if (contentMatch![2]) {
        const limit = Number(url.searchParams.get("limit") ?? "20");
        const before = url.searchParams.has("beforeVersion") ? Number(url.searchParams.get("beforeVersion")) : Infinity;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || before !== Infinity && (!Number.isSafeInteger(before) || before < 1)) return failure("invalid_input", 400);
        return json({ items: [document, ...(versions.get(document.id) ?? [])].filter(version => version.version < before).slice(0, limit).map(version => ({
          recordId: version.id, kind: "page", version: version.version, values: historyValues(version),
          status: version.status, bodyFormat: version.bodyFormat, origins: version.origins, savedAt: version.updatedAt,
        })) });
      }
      return json(clone(document));
    }

    if (state === "readonly") return failure("membership_denied", 403);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const operationId = headers.get("idempotency-key");
    const bodyText = typeof init?.body === "string" ? init.body : input instanceof Request ? await input.text() : "";
    if (!operationId || !UUID.test(operationId)) return failure("invalid_input", 400);
    const prior = operations.get(operationId);
    if (prior) return prior.body === bodyText ? json({ ...(prior.result as object), replayed: true }) : failure("operation_mismatch", 409);

    if (archiveMatch) {
      const document = documents.get(archiveMatch[1]!);
      if (!document) return failure("record_not_found", 404);
      // Server protection still applies even if a caller bypasses the missing UI action.
      if (document.requiredPageKey) return failure("invalid_transition", 409);
      let command: { expectedVersion?: unknown };
      try { command = JSON.parse(bodyText); } catch { return failure("invalid_input", 400); }
      if (Object.keys(command).join(",") !== "expectedVersion" || command.expectedVersion !== document.version) return failure("version_conflict", 409);
      const archived = parseMerchantContentDocument({ ...document, status: "archived", published: false, version: document.version + 1 });
      documents.set(archived.id, archived);
      const result = { id: archived.id, kind: "page", status: archived.status, version: archived.version, updatedAt: archived.updatedAt, replayed: false };
      operations.set(operationId, { body: bodyText, result });
      return json(result);
    }

    let command;
    try { command = parseSaveMerchantContentRequest(JSON.parse(bodyText)); } catch { return failure("invalid_input", 400); }
    let document = command.recordId ? documents.get(command.recordId) : undefined;
    if (command.recordId && !document) return failure("record_not_found", 404);
    if (!document) {
      if ([...documents.values()].some(value => value.slug === command.values.slug && value.locale === command.values.locale)) return failure("invalid_input", 400);
      document = parseMerchantContentDocument({ ...command.values, id: operationId, kind: "page", bodyFormat: "normalized_html", bodyDigest: digest(1), origins: {}, version: 1, createdAt: NOW, updatedAt: NOW, publishedAt: null });
    }
    if (document.requiredPageKey && (command.values.slug !== document.slug || command.values.locale !== document.locale)) return failure("invalid_input", 400);
    if (state === "save-error") return failure("invalid_input", 400);
    if (state === "conflict" && command.recordId && !conflictSent) {
      conflictSent = true;
      documents.set(document.id, parseMerchantContentDocument({ ...document, version: 2, bodyDigest: digest(2) }));
      return failure("version_conflict", 409);
    }
    if (command.recordId && (command.expectedVersion !== document.version || command.expectedBodyDigest !== document.bodyDigest)) return failure("version_conflict", 409);
    const { status, ...values } = command.values as MerchantContentValues;
    const saved = parseMerchantContentDocument({
      ...document, ...values, status, body: command.bodyAction === "preserve" ? document.body : values.body,
      bodyDigest: command.bodyAction === "preserve" ? document.bodyDigest : digest(command.recordId ? document.version + 1 : 1),
      version: command.recordId ? document.version + 1 : 1, origins: command.origins, publishedAt: values.published ? NOW : null,
    });
    if (command.recordId) versions.set(saved.id, [document, ...(versions.get(saved.id) ?? [])]);
    documents.set(saved.id, saved);
    const result = { document: clone(saved), replayed: false };
    operations.set(operationId, { body: bodyText, result });
    return json(result);
  };

  return { fetch: fetcher, snapshot: () => ({ state, liveWrites: false, calls: clone(calls), documents: clone([...documents.values()]) }) };
}
