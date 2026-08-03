import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { StorefrontDesignDocument, TenantContext } from "@celebix/saas-contracts";
import { StorefrontDesignRepositoryError, type StorefrontDesignRepository } from "@celebix/saas-data";

import { createStorefrontDesignHttpHandlers } from "./handler.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const STORE = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const PLAN = "40000000-0000-4000-8000-000000000001";
const REQUEST = "50000000-0000-4000-8000-000000000001";
const OPERATION = "60000000-0000-4000-8000-000000000001";
const MEDIA = "70000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-03T09:00:00.000Z");
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x61).toString("base64url")}`;

const DESIGN: StorefrontDesignDocument = Object.freeze({
  schemaVersion: 1,
  brand: Object.freeze({ logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" }),
  hero: Object.freeze({ headline: "Güzide Kuyumcu", body: "Zamansız tasarımlar", image: null, destination: Object.freeze({ kind: "none" }), enabled: true }),
  promotion: Object.freeze({ headline: "Yeni sezon", body: "", destination: Object.freeze({ kind: "none" }), startsAt: null, endsAt: null, enabled: false }),
  announcement: Object.freeze({ items: Object.freeze(["Ücretsiz kargo"]), icon: "truck", speed: "normal", direction: "left", animation: "continuous", enabled: true }),
});

const PUBLIC = Object.freeze({
  schemaVersion: 1 as const,
  publicationVersion: 1,
  publishedAt: NOW.toISOString(),
  brand: Object.freeze({ logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" as const }),
  hero: Object.freeze({ headline: "Güzide Kuyumcu", body: "Zamansız tasarımlar", image: null, destination: null, enabled: true }),
  promotion: Object.freeze({ headline: "Yeni sezon", body: "", destination: null, startsAt: null, endsAt: null, enabled: false }),
  announcement: DESIGN.announcement,
});

function tenant(role: TenantContext["membership"]["role"] = "store_owner"): TenantContext {
  return {
    schemaVersion: 1,
    requestId: REQUEST,
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "guzide-owner" },
    store: { id: STORE, slug: "guzide-kuyumcu-4", status: "active" },
    membership: { id: MEMBERSHIP, role, status: "active" },
    entitlements: { schemaVersion: 1, planId: PLAN, planCode: "free_starter", version: 1, status: "active", features: ["storefront", "media"], limits: { products: 100, staff: 5, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" },
    locale: "tr-TR",
  };
}

function workspace() {
  return { schemaVersion: 1 as const, draftVersion: 1, publishedVersion: 1, draftUpdatedAt: NOW.toISOString(), publishedAt: NOW.toISOString(), draft: DESIGN, published: PUBLIC, store: { name: "Güzide Kuyumcu", timezone: "Europe/Istanbul" }, media: [], destinations: [] };
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
  assert.deepEqual(saved.design, DESIGN);
  assert.equal(saved.tenantContext.store.id, STORE);
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
  form.set("file", new File([png()], "guzide-hero.png", { type: "image/png" }));
  form.set("altText", "Güzide hero");
  const response = await selected.handlers.uploadMedia(new Request("http://customer-panel:3400/api/storefront-design/media", { method: "POST", headers: { origin: ORIGIN, cookie: `__Host-celebix_panel=${CREDENTIAL}`, "idempotency-key": OPERATION, "content-length": "1024" }, body: form }));
  assert.equal(response.status, 201);
  const expectedKey = `stores/${STORE}/design/${MEDIA}.png`;
  assert.equal(selected.calls.find((call) => call.method === "put")?.input.objectKey, expectedKey);
  assert.equal(selected.calls.find((call) => call.method === "reserve")?.input.tenantContext.store.id, STORE);
  assert.equal((await response.json()).media.url, `https://media.saas-staging.celebix.site/${expectedKey}`);
});
