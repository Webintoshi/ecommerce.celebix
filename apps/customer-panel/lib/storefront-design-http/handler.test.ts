import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createDefaultStarterThemeComposition, parseStorefrontDesignDocument, type StorefrontDesignDocument, type TenantContext } from "@celebix/saas-contracts";
import { StorefrontDesignRepositoryError, type StorefrontDesignRepository } from "@celebix/saas-data";

import { createStorefrontDesignHttpHandlers, validateStorefrontDesignWorkspaceReferences } from "./handler.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const TENANT_ADMIN_ORIGIN = "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const TENANT_ADMIN_HOST = "guzide-kuyumcu-4.admin.saas-staging.celebix.site";
const INTERNAL_PROXY_HOST = "customer-panel:3400";
const STORE = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const PLAN = "40000000-0000-4000-8000-000000000001";
const REQUEST = "50000000-0000-4000-8000-000000000001";
const OPERATION = "60000000-0000-4000-8000-000000000001";
const MEDIA = "70000000-0000-4000-8000-000000000001";
const PRODUCT = "71000000-0000-4000-8000-000000000001";
const CATEGORY = "72000000-0000-4000-8000-000000000001";
const PAGE = "73000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-03T09:00:00.000Z");
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x61).toString("base64url")}`;
const TYPOGRAPHY = Object.freeze({
  headingFont: Object.freeze({ family: "Manrope", category: "sans-serif", availableWeights: Object.freeze(["400", "500", "600", "700", "800"] as const), source: "google" as const }),
  bodyFont: Object.freeze({ family: "Manrope", category: "sans-serif", availableWeights: Object.freeze(["400", "500", "600", "700", "800"] as const), source: "google" as const }),
  headingWeight: "700" as const,
  bodyWeight: "400" as const,
  headingSizePx: 40,
  bodySizePx: 16,
});

const DESIGN: StorefrontDesignDocument = Object.freeze({
  schemaVersion: 3,
  brand: Object.freeze({ logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" }),
  typography: TYPOGRAPHY,
  hero: Object.freeze({ enabled: true, slides: Object.freeze([Object.freeze({ headline: "Güzide Kuyumcu", body: "Zamansız tasarımlar", desktopImage: null, mobileImage: null, destination: Object.freeze({ kind: "none" }), enabled: true })]) }),
  promotion: Object.freeze({ headline: "Yeni sezon", body: "", destination: Object.freeze({ kind: "none" }), startsAt: null, endsAt: null, enabled: false }),
  announcement: Object.freeze({ items: Object.freeze(["Ücretsiz kargo"]), icon: "truck", speed: "normal", direction: "left", animation: "continuous", enabled: true }),
  composition: createDefaultStarterThemeComposition(),
});

const PUBLIC = Object.freeze({
  schemaVersion: 2 as const,
  publicationVersion: 1,
  publishedAt: NOW.toISOString(),
  brand: Object.freeze({ logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" as const }),
  hero: Object.freeze({ enabled: true, slides: Object.freeze([Object.freeze({ headline: "Güzide Kuyumcu", body: "Zamansız tasarımlar", desktopImage: null, mobileImage: null, destination: null })]) }),
  promotion: Object.freeze({ headline: "Yeni sezon", body: "", destination: null, startsAt: null, endsAt: null, enabled: false }),
  announcement: DESIGN.announcement,
  typography: TYPOGRAPHY,
});

function tenant(role: TenantContext["membership"]["role"] = "store_owner"): TenantContext {
  return {
    schemaVersion: 1,
    requestId: REQUEST,
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "guzide-owner" },
    store: { id: STORE, slug: "guzide-kuyumcu-4", status: "active" },
    membership: { id: MEMBERSHIP, role, status: "active" },
    entitlements: { schemaVersion: 1, planId: PLAN, planCode: "free_starter", version: 1, status: "active", features: ["content", "media"], limits: { products: 100, staff: 5, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" },
    locale: "tr-TR",
  };
}

function workspace(input: Readonly<{
  draft?: StorefrontDesignDocument;
  media?: readonly any[];
  destinations?: readonly any[];
}> = {}) {
  return { schemaVersion: 3 as const, draftVersion: 1, publishedVersion: 1, draftUpdatedAt: NOW.toISOString(), publishedAt: NOW.toISOString(), draft: input.draft ?? DESIGN, published: PUBLIC, store: { name: "Güzide Kuyumcu", timezone: "Europe/Istanbul" }, media: input.media ?? [], destinations: input.destinations ?? [] };
}

function repository(overrides: Partial<StorefrontDesignRepository> = {}): StorefrontDesignRepository {
  return {
    async getWorkspace() { return workspace(); },
    async saveDraft() { return { draftVersion: 2, draftUpdatedAt: NOW.toISOString(), draft: DESIGN }; },
    async publish() { return { draftVersion: 2, publishedVersion: 2, publishedAt: NOW.toISOString(), published: { ...PUBLIC, publicationVersion: 2 } }; },
    async reserveMedia() { return { id: MEDIA, url: `https://media.saas-staging.celebix.site/stores/${STORE}/design/${MEDIA}.png`, altText: "Güzide hero", mediaType: "image/png", width: 1200, height: 800, objectKey: `stores/${STORE}/design/${MEDIA}.png` }; },
    ...overrides,
  };
}

function png(): Buffer {
  const value = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(value);
  value.writeUInt32BE(13, 8);
  value.write("IHDR", 12);
  value.writeUInt32BE(1200, 16);
  value.writeUInt32BE(800, 20);
  return value;
}

function fixture(input: Readonly<{ role?: TenantContext["membership"]["role"]; repository?: StorefrontDesignRepository }> = {}) {
  const calls: Array<Readonly<{ method: string; input?: any }>> = [];
  const design = input.repository ?? repository({
    async getWorkspace(selected) { calls.push({ method: "get", input: selected }); return workspace(); },
    async saveDraft(selected) { calls.push({ method: "save", input: selected }); return { draftVersion: 2, draftUpdatedAt: NOW.toISOString(), draft: DESIGN }; },
    async publish(selected) { calls.push({ method: "publish", input: selected }); return { draftVersion: 1, publishedVersion: 2, publishedAt: NOW.toISOString(), published: { ...PUBLIC, publicationVersion: 2 } }; },
    async reserveMedia(selected) { calls.push({ method: "reserve", input: selected }); return { id: MEDIA, url: `https://media.saas-staging.celebix.site/stores/${STORE}/design/${MEDIA}.png`, altText: "Güzide hero", mediaType: "image/png", width: 1200, height: 800, objectKey: `stores/${STORE}/design/${MEDIA}.png` }; },
  });
  const digest = createHash("sha256").update(png()).digest("hex");
  const storage = {
    publicUrl(objectKey: string) { return `https://media.saas-staging.celebix.site/${objectKey}`; },
    async put(selected: any) { calls.push({ method: "put", input: selected }); },
    async publish(selected: any) { calls.push({ method: "activate", input: selected }); },
    async unpublish() { throw new Error("unexpected"); },
    async head() { calls.push({ method: "head" }); return { kind: "found" as const, byteSize: png().byteLength, mediaType: "image/png" as const, payloadSha256: digest, publication: "pending" as const }; },
    async delete(objectKey: string) { calls.push({ method: "delete", input: objectKey }); },
  };
  const runtime = {
    access: { readiness: { mode: "approved_staging" as const }, panelOrigin: ORIGIN, async resolveCredential() { return { kind: "authenticated" as const, session: {}, tenantContext: tenant(input.role) }; }, async rotateCredential() { throw new Error("unexpected"); }, async revokeCredential() { throw new Error("unexpected"); } },
    repository: design,
    storage,
  };
  return { calls, handlers: createStorefrontDesignHttpHandlers({ async resolveRuntime() { return runtime as never; }, now: () => new Date(NOW), requestId: () => REQUEST, uuid: () => MEDIA }) };
}

function request(path: string, method = "GET", value?: unknown, extraHeaders: HeadersInit = {}): Request {
  const body = value === undefined ? undefined : JSON.stringify(value);
  const headers = new Headers(extraHeaders);
  headers.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`);
  if (method !== "GET" && !headers.has("origin")) headers.set("origin", ORIGIN);
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("content-length", String(Buffer.byteLength(body)));
  }
  return new Request(`http://customer-panel:3400${path}`, { method, headers, body });
}

test("workspace authority comes only from the authenticated persistent session", async () => {
  const selected = fixture();
  const response = await selected.handlers.workspace(request("/api/storefront-design"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.code, "ok");
  assert.equal(body.workspace.store.name, "Güzide Kuyumcu");
  assert.equal(selected.calls[0]?.method, "get");
  assert.equal(selected.calls[0]?.input.tenantContext.store.id, STORE);
  assert.equal(JSON.stringify(body).includes(PRINCIPAL), false);
});

test("draft save parses the exact document and binds the idempotency key and expected version", async () => {
  const selected = fixture();
  const response = await selected.handlers.saveDraft(request("/api/storefront-design/draft", "PATCH", { expectedDraftVersion: 1, design: DESIGN }, { "idempotency-key": OPERATION }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).code, "saved");
  const saved = selected.calls.find((call) => call.method === "save")?.input;
  assert.equal(saved.operationId, OPERATION);
  assert.equal(saved.expectedDraftVersion, 1);
  assert.deepEqual(saved.design, parseStorefrontDesignDocument(DESIGN));
  assert.equal(saved.tenantContext.store.id, STORE);
});

test("draft save rejects missing or cross-store-shaped references before any write", async () => {
  const foreignMedia = "70000000-0000-4000-8000-000000000099";
  const design = {
    ...DESIGN,
    brand: { ...DESIGN.brand, logo: { kind: "media" as const, mediaId: foreignMedia } },
  };
  const selected = fixture();
  const result = await selected.handlers.saveDraft(request(
    "/api/storefront-design/draft",
    "PATCH",
    { expectedDraftVersion: 1, design },
    { "idempotency-key": OPERATION },
  ));
  assert.equal(result.status, 400);
  assert.deepEqual(await result.json(), { code: "invalid_input" });
  assert.equal(selected.calls.filter(({ method }) => method === "save").length, 0);
});

test("workspace reference validation accepts exact authenticated options and an intentionally empty homepage", () => {
  const design: StorefrontDesignDocument = {
    ...DESIGN,
    brand: { ...DESIGN.brand, logo: { kind: "media", mediaId: MEDIA } },
    hero: {
      enabled: true,
      slides: [{ ...DESIGN.hero.slides[0], destination: { kind: "product", resourceId: PRODUCT } }],
    },
    composition: {
      ...createDefaultStarterThemeComposition(),
      navigation: { rootCategoryIds: [CATEGORY] },
      sections: [],
      footer: {
        ...createDefaultStarterThemeComposition().footer,
        groups: [
          { heading: "Mağaza", links: [{ kind: "category", categoryId: CATEGORY }] },
          { heading: "Bilgi", links: [{ kind: "page", pageId: PAGE }] },
        ],
      },
    },
  };
  const authority = workspace({
    draft: design,
    media: [{ id: MEDIA, url: "https://media.example/design.webp", altText: "Logo", mediaType: "image/webp", width: 400, height: 200 }],
    destinations: [
      { kind: "product", resourceId: PRODUCT, label: "Ürün", path: "/products/urun" },
      { kind: "collection", resourceId: CATEGORY, label: "Kategori", path: "/collections/kategori" },
      { kind: "page", resourceId: PAGE, label: "Sayfa", path: "/pages/sayfa" },
    ],
  });
  assert.equal(validateStorefrontDesignWorkspaceReferences(design, authority), true);
  assert.deepEqual(design.composition.sections, []);
});

test("publication revalidates its durable draft and never persists a derived quality score", async () => {
  const invalidDraft: StorefrontDesignDocument = {
    ...DESIGN,
    composition: {
      ...createDefaultStarterThemeComposition(),
      navigation: { rootCategoryIds: [CATEGORY] },
    },
  };
  const calls: string[] = [];
  const selected = fixture({ repository: repository({
    async getWorkspace() { calls.push("get"); return workspace({ draft: invalidDraft }); },
    async publish() { calls.push("publish"); throw new Error("write_must_not_run"); },
  }) });
  const result = await selected.handlers.publish(request(
    "/api/storefront-design/publish",
    "POST",
    { expectedDraftVersion: 1, expectedPublishedVersion: 1 },
    { "idempotency-key": OPERATION },
  ));
  assert.equal(result.status, 400);
  assert.deepEqual(calls, ["get"]);
  assert.equal(JSON.stringify(invalidDraft).includes("qualityScore"), false);
});

test("tenant admin same-origin design mutations persist without trusting another tenant origin", async () => {
  const selected = fixture();
  const accepted = await selected.handlers.saveDraft(request(
    "/api/storefront-design/draft",
    "PATCH",
    { expectedDraftVersion: 1, design: DESIGN },
    { "idempotency-key": OPERATION, origin: TENANT_ADMIN_ORIGIN, host: INTERNAL_PROXY_HOST },
  ));
  assert.equal(accepted.status, 200);
  assert.equal(selected.calls.filter((call) => call.method === "save").length, 1);

  const rejected = await selected.handlers.saveDraft(request(
    "/api/storefront-design/draft",
    "PATCH",
    { expectedDraftVersion: 1, design: DESIGN },
    { "idempotency-key": OPERATION, origin: "https://other-store.admin.saas-staging.celebix.site", host: TENANT_ADMIN_HOST },
  ));
  assert.equal(rejected.status, 403);
  assert.deepEqual(await rejected.json(), { code: "origin_denied" });
  assert.equal(selected.calls.filter((call) => call.method === "save").length, 1);
});

test("publication requires configuration.manage and never trusts browser tenant headers", async () => {
  const denied = fixture({ role: "analyst" });
  const deniedResponse = await denied.handlers.publish(request("/api/storefront-design/publish", "POST", { expectedDraftVersion: 1, expectedPublishedVersion: 1 }, { "idempotency-key": OPERATION }));
  assert.equal(deniedResponse.status, 403);
  assert.equal(denied.calls.length, 0);

  const forged = fixture();
  const forgedResponse = await forged.handlers.publish(request("/api/storefront-design/publish", "POST", { expectedDraftVersion: 1, expectedPublishedVersion: 1 }, { "idempotency-key": OPERATION, "x-store-id": "80000000-0000-4000-8000-000000000001" }));
  assert.equal(forgedResponse.status, 400);
  assert.equal(forged.calls.length, 0);
});

test("mutation origin, missing session, unknown body fields, and stale versions fail closed", async () => {
  const selected = fixture();
  const wrongOrigin = request("/api/storefront-design/draft", "PATCH", { expectedDraftVersion: 1, design: DESIGN }, { "idempotency-key": OPERATION, origin: "https://attacker.example" });
  assert.equal((await selected.handlers.saveDraft(wrongOrigin)).status, 403);
  assert.equal((await selected.handlers.workspace(new Request("http://customer-panel:3400/api/storefront-design"))).status, 401);
  assert.equal((await selected.handlers.saveDraft(request("/api/storefront-design/draft", "PATCH", { expectedDraftVersion: 1, design: DESIGN, storeId: STORE }, { "idempotency-key": OPERATION }))).status, 400);

  const conflict = fixture({ repository: repository({ async publish() { throw new StorefrontDesignRepositoryError("version_conflict"); } }) });
  assert.equal((await conflict.handlers.publish(request("/api/storefront-design/publish", "POST", { expectedDraftVersion: 1, expectedPublishedVersion: 1 }, { "idempotency-key": OPERATION }))).status, 409);
});

test("design media validates image bytes then uses the authenticated tenant object key", async () => {
  const selected = fixture();
  const form = new FormData();
  form.set("file", new File([Uint8Array.from(png())], "guzide-hero.png", { type: "image/png" }));
  form.set("altText", "Güzide hero");
  const response = await selected.handlers.uploadMedia(new Request("http://customer-panel:3400/api/storefront-design/media", { method: "POST", headers: { origin: ORIGIN, cookie: `__Host-celebix_panel=${CREDENTIAL}`, "idempotency-key": OPERATION, "content-length": "1024" }, body: form }));
  assert.equal(response.status, 201);
  const expectedKey = `stores/${STORE}/design/${MEDIA}.png`;
  assert.equal(selected.calls.find((call) => call.method === "put")?.input.objectKey, expectedKey);
  assert.equal(selected.calls.find((call) => call.method === "reserve")?.input.tenantContext.store.id, STORE);
  assert.equal((await response.json()).media.url, `https://media.saas-staging.celebix.site/${expectedKey}`);
});
