import assert from "node:assert/strict";
import test from "node:test";

import type { TenantContext } from "@celebix/saas-contracts";
import type { PostgresPoolLike } from "../postgres/pool.ts";
import {
  PostgresPublicStorefrontContentRepository,
  PostgresStorePolicyAdminRepository,
  StorefrontContentRepositoryError,
} from "./index.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const PRINCIPAL = "44444444-4444-4444-8444-444444444444";
const MEMBERSHIP = "55555555-5555-4555-8555-555555555555";
const PLAN = "66666666-6666-4666-8666-666666666666";
const OPERATION = "70000000-0000-4000-8000-000000000071";
const HOST = "guzide-policy.saas-staging.celebix.site";
const NOW = new Date("2026-07-31T12:00:00.000Z");
const PRODUCT = "71000000-0000-4000-8000-000000000071";
const VARIANT = "72000000-0000-4000-8000-000000000071";

function tenant(): TenantContext {
  return {
    schemaVersion: 1,
    requestId: "private",
    principal: { id: PRINCIPAL, issuer: "https://identity.example.test/oidc", subject: "private" },
    store: { id: STORE, slug: "guzide", status: "active" },
    membership: { id: MEMBERSHIP, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: PLAN,
      planCode: "growth",
      version: 2,
      status: "active",
      features: ["catalog"],
      limits: { products: 100, staff: 5, storageBytes: 1024 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  } as TenantContext;
}

const POLICY = Object.freeze({
  key: "kvkk",
  label: "KVKK",
  route: "/policies/kvkk",
  ordinal: 3,
  status: "published",
  body: "## KVKK\n\nGüncel metin.",
  version: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: NOW.toISOString(),
});

const PRODUCT_PROJECTION = Object.freeze({
  id: PRODUCT,
  slug: "altin-yuzuk",
  title: "Altın Yüzük",
  currency: "TRY",
  status: "active",
  priceCents: 1127100,
  available: true,
  variants: [{ id: VARIANT, title: "14 Ayar", priceCents: 1127100, stockTracking: true, stockQuantity: 1, available: true, attributes: {} }],
  media: [],
});

type Row = Record<string, unknown>;
type Responder = (text: string, values: unknown[]) => Row[] | Promise<Row[]>;

class Client {
  readonly calls: Array<{ text: string; values: unknown[] }> = [];
  readonly releases: unknown[] = [];
  private readonly responder: Responder;
  constructor(responder: Responder = () => []) { this.responder = responder; }
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values });
    const rows = await this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release(value?: unknown) { this.releases.push(value); }
}

class Pool {
  private index = 0;
  private readonly clients: readonly Client[];
  constructor(clients: readonly Client[]) { this.clients = clients; }
  async connect() {
    const client = this.clients[this.index++];
    if (!client) throw new Error("checkout");
    return client;
  }
}

const timeouts = Object.freeze({ poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 });
function publicRepository(pool: Pool) { return new PostgresPublicStorefrontContentRepository({ pool: pool as unknown as PostgresPoolLike, role: "celebix_saas_host_resolver", timeouts }); }
function adminRepository(pool: Pool, audit: string[] = []) { return new PostgresStorePolicyAdminRepository({ pool: pool as unknown as PostgresPoolLike, role: "celebix_saas_app", timeouts, audit: (event) => { audit.push(event.type); } }); }
function call(client: Client, name: string) { const selected = client.calls.find(({ text }) => text.includes(`saas.${name}`)); assert.ok(selected); return selected; }

test("public policy read uses hostname authority and preserves source Markdown only on the server boundary", async () => {
  const reader = new Client((text) => text.includes("public_policy_get") ? [{ outcome: "found", result_payload: { key: "kvkk", label: "KVKK", route: "/policies/kvkk", published: true, body: POLICY.body, updatedAt: NOW.toISOString() } }] : []);
  const result = await publicRepository(new Pool([reader])).getPolicy({ hostname: HOST, now: NOW, key: "kvkk" });
  assert.deepEqual(result, { key: "kvkk", label: "KVKK", route: "/policies/kvkk", published: true, body: POLICY.body, updatedAt: NOW.toISOString() });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(call(reader, "public_policy_get").values, [HOST, NOW, "kvkk"]);
  assert.equal(reader.calls[0]?.text, "BEGIN READ ONLY");
  assert.equal(reader.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_host_resolver"), true);
});

test("public policy index remains exactly seven body-free definitions", async () => {
  const definitions = [
    ["privacy_security", "Gizlilik ve Güvenlik", "/policies/privacy-security"],
    ["distance_sales", "Mesafeli Satış Sözleşmesi", "/policies/distance-sales"],
    ["kvkk", "KVKK", "/policies/kvkk"],
    ["payment_delivery", "Ödeme & Teslimat", "/policies/payment-delivery"],
    ["cookie_usage", "Çerez Kullanımı", "/policies/cookies"],
    ["returns_exchanges", "İade & Değişim", "/policies/returns-exchanges"],
    ["membership", "Üyelik", "/policies/membership"],
  ].map(([key, label, route]) => ({ key, label, route, published: key === "kvkk", updatedAt: NOW.toISOString() }));
  const reader = new Client((text) => text.includes("public_policy_index") ? [{ outcome: "found", result_payload: { items: definitions } }] : []);
  const result = await publicRepository(new Pool([reader])).listPolicies({ hostname: HOST, now: NOW });
  assert.equal(result.length, 7);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.some((page) => "body" in page), false);
});

test("public search and favorite resolution parse only canonical product projections", async () => {
  const searchReader = new Client((text) => text.includes("public_search_products") ? [{ outcome: "found", result_payload: { items: [PRODUCT_PROJECTION], nextCursor: "2026-07-31T12:00:00.000Z|71000000-0000-4000-8000-000000000071" } }] : []);
  const search = await publicRepository(new Pool([searchReader])).search({ hostname: HOST, now: NOW, query: "altın", limit: 24 });
  assert.equal(search.items[0]?.id, PRODUCT);
  assert.deepEqual(call(searchReader, "public_search_products").values, [HOST, NOW, "altın", 24, null]);

  const resolveReader = new Client((text) => text.includes("public_resolve_product_ids") ? [{ outcome: "found", result_payload: { items: [PRODUCT_PROJECTION] } }] : []);
  const resolved = await publicRepository(new Pool([resolveReader])).resolveProductIds({ hostname: HOST, now: NOW, productIds: [PRODUCT] });
  assert.equal(resolved[0]?.id, PRODUCT);
  assert.deepEqual(call(resolveReader, "public_resolve_product_ids").values, [HOST, NOW, [PRODUCT]]);
});

test("admin policy list uses the complete durable TenantContext tuple", async () => {
  const pages = [
    { ...POLICY, key: "privacy_security", label: "Gizlilik ve Güvenlik", route: "/policies/privacy-security", ordinal: 1, status: "draft", body: "", version: 1 },
    { ...POLICY, key: "distance_sales", label: "Mesafeli Satış Sözleşmesi", route: "/policies/distance-sales", ordinal: 2, status: "draft", body: "", version: 1 },
    POLICY,
    { ...POLICY, key: "payment_delivery", label: "Ödeme & Teslimat", route: "/policies/payment-delivery", ordinal: 4, status: "draft", body: "", version: 1 },
    { ...POLICY, key: "cookie_usage", label: "Çerez Kullanımı", route: "/policies/cookies", ordinal: 5, status: "draft", body: "", version: 1 },
    { ...POLICY, key: "returns_exchanges", label: "İade & Değişim", route: "/policies/returns-exchanges", ordinal: 6, status: "draft", body: "", version: 1 },
    { ...POLICY, key: "membership", label: "Üyelik", route: "/policies/membership", ordinal: 7, status: "draft", body: "", version: 1 },
  ];
  const reader = new Client((text) => text.includes("store_policy_list_admin") ? [{ outcome: "listed", result_payload: { items: pages } }] : []);
  const result = await adminRepository(new Pool([reader])).list({ tenantContext: tenant(), now: NOW });
  assert.equal(result.length, 7);
  assert.deepEqual(call(reader, "store_policy_list_admin").values, [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW]);
  assert.equal(reader.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_app"), true);
});

test("policy save fingerprints exact immutable input and maps finite conflicts", async () => {
  const writer = new Client((text) => text.includes("store_policy_save") ? [{ outcome: "saved", result_payload: POLICY }] : []);
  const result = await adminRepository(new Pool([writer])).save({ tenantContext: tenant(), now: NOW, operationId: OPERATION, key: "kvkk", expectedVersion: 1, body: POLICY.body, status: "published" });
  assert.equal(result.version, 2);
  const sql = call(writer, "store_policy_save");
  assert.deepEqual(sql.values.slice(0, 8), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW, OPERATION]);
  assert.match(String(sql.values[8]), /^[a-f0-9]{64}$/);
  assert.deepEqual(sql.values.slice(9), ["kvkk", 1, POLICY.body, "published"]);

  const conflict = new Client((text) => text.includes("store_policy_save") ? [{ outcome: "version_conflict", result_payload: null }] : []);
  await assert.rejects(adminRepository(new Pool([conflict])).save({ tenantContext: tenant(), now: NOW, operationId: OPERATION, key: "kvkk", expectedVersion: 1, body: POLICY.body, status: "published" }), (error) => error instanceof StorefrontContentRepositoryError && error.code === "version_conflict");
});

test("unknown commit performs one read-only recovery and never repeats the write", async () => {
  let commits = 0;
  const writer = new Client((text) => {
    if (text.includes("store_policy_save")) return [{ outcome: "saved", result_payload: POLICY }];
    if (text === "COMMIT" && commits++ === 0) throw new Error("wire");
    return [];
  });
  const recovery = new Client((text) => text.includes("store_policy_recover") ? [{ outcome: "operation_replayed", result_payload: POLICY }] : []);
  const audit: string[] = [];
  const result = await adminRepository(new Pool([writer, recovery]), audit).save({ tenantContext: tenant(), now: NOW, operationId: OPERATION, key: "kvkk", expectedVersion: 1, body: POLICY.body, status: "published" });
  assert.equal(result.version, 2);
  assert.equal(writer.calls.filter(({ text }) => text.includes("store_policy_save")).length, 1);
  assert.equal(recovery.calls.filter(({ text }) => text.includes("store_policy_recover")).length, 1);
  assert.equal(recovery.calls[0]?.text, "BEGIN READ ONLY");
  assert.deepEqual(writer.releases, [true]);
  assert.deepEqual(audit, ["store_policy_commit_unknown"]);
});

test("malformed inputs and database projections fail closed", async () => {
  await assert.rejects(publicRepository(new Pool([])).search({ hostname: HOST, now: NOW, query: "x", limit: 49 }), (error) => error instanceof StorefrontContentRepositoryError && error.code === "invalid_input");
  await assert.rejects(publicRepository(new Pool([])).resolveProductIds({ hostname: HOST, now: NOW, productIds: [PRODUCT, PRODUCT] }), (error) => error instanceof StorefrontContentRepositoryError && error.code === "invalid_input");
  const corrupt = new Client((text) => text.includes("public_policy_get") ? [{ outcome: "found", result_payload: { key: "kvkk", label: "KVKK", route: "/policies/kvkk", published: true, body: POLICY.body, storeId: STORE } }] : []);
  await assert.rejects(publicRepository(new Pool([corrupt])).getPolicy({ hostname: HOST, now: NOW, key: "kvkk" }), (error) => error instanceof StorefrontContentRepositoryError && error.code === "unavailable");
});

test("public custom pages use hostname authority and exact safe projection", async () => {
  const page = { id: PRODUCT, slug: "hakkimizda", title: "Hakkımızda", body: "<p>Mağazamız.</p>", updatedAt: NOW.toISOString() };
  const client = new Client((text) => text.includes("public_content_page_get") ? [{ outcome: "found", result_payload: page }] : []);
  const repository = publicRepository(new Pool([client]));
  assert.deepEqual(await repository.getPage({ hostname: HOST, now: NOW, slug: "hakkimizda" }), page);
  assert.deepEqual(client.calls.find((call) => call.text.includes("public_content_page_get"))?.values, [HOST, NOW, "hakkimizda"]);
});

test("public custom pages accept empty bodies projected from optional content", async () => {
  const page = { id: PRODUCT, slug: "empty", title: "Empty", body: "", updatedAt: NOW.toISOString() };
  const client = new Client((text) => text.includes("public_content_page_get") ? [{ outcome: "found", result_payload: page }] : []);
  assert.deepEqual(await publicRepository(new Pool([client])).getPage({ hostname: HOST, now: NOW, slug: "empty" }), page);
});

test("public custom pages reject traversal private fields and unpublished outcomes", async () => {
  const client = new Client((text) => text.includes("public_content_page_get") ? [{ outcome: "not_found", result_payload: null }] : []);
  const repository = publicRepository(new Pool([client]));
  await assert.rejects(repository.getPage({ hostname: HOST, now: NOW, slug: "../hakkimizda" }), (error) => error instanceof StorefrontContentRepositoryError && error.code === "invalid_input");
  await assert.rejects(repository.getPage({ hostname: HOST, now: NOW, slug: "hakkimizda" }), (error) => error instanceof StorefrontContentRepositoryError && error.code === "not_found");
  const hostile = new Client((text) => text.includes("public_content_page_get") ? [{ outcome: "found", result_payload: { id: PRODUCT, slug: "hakkimizda", title: "Page", body: "Text", updatedAt: NOW.toISOString(), storeId: STORE } }] : []);
  await assert.rejects(publicRepository(new Pool([hostile])).getPage({ hostname: HOST, now: NOW, slug: "hakkimizda" }), (error) => error instanceof StorefrontContentRepositoryError && error.code === "unavailable");
});

test("V2 public readers pass exact tenant hostname, locale and approved keyset", async () => {
  const record = { id: PRODUCT, kind: "blog_post", slug: "duyuru", locale: "en-US", title: "News", body: "<p>News</p>", bodyFormat: "normalized_html", excerpt: "Summary", seoTitle: "News SEO", seoDescription: "Search summary", publishedAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
  const client = new Client((text) => {
    if (text.includes("public_content_locale_get")) return [{ outcome: "found", result_payload: { defaultLocale: "tr", enabledLocales: ["tr", "en-US"] } }];
    if (text.includes("public_blog_get")) return [{ outcome: "found", result_payload: record }];
    if (text.includes("public_blog_list")) { const { body: _body, ...summary } = record; return [{ outcome: "listed", result_payload: { items: [summary], nextCursor: null } }]; }
    return [];
  });
  const reader = publicRepository(new Pool([client, client, client]));
  assert.deepEqual(await reader.getLocales({ hostname: HOST, now: NOW }), { defaultLocale: "tr", enabledLocales: ["tr", "en-US"] });
  assert.deepEqual(await reader.getBlogPost({ hostname: HOST, now: NOW, slug: "duyuru", locale: "en-US" }), record);
  assert.equal((await reader.listBlogPosts({ hostname: HOST, now: NOW, locale: "en-US", limit: 20 })).items[0]?.slug, "duyuru");
  assert.deepEqual(call(client, "public_blog_get").values, [HOST, NOW, "duyuru", "en-US"]);
  assert.deepEqual(call(client, "public_blog_list").values, [HOST, NOW, "en-US", 20, null]);
});

test("V2 public reader rejects an unknown body format", async () => {
  const client = new Client((text) => text.includes("public_blog_get") ? [{ outcome:"found",result_payload:{ id:PRODUCT,kind:"blog_post",slug:"duyuru",locale:"tr",title:"News",body:"<p>News</p>",bodyFormat:"unsafe",excerpt:null,seoTitle:null,seoDescription:null,publishedAt:null,updatedAt:NOW.toISOString() } }] : []);
  await assert.rejects(publicRepository(new Pool([client])).getBlogPost({hostname:HOST,now:NOW,slug:"duyuru",locale:"tr"}), (error) => error instanceof StorefrontContentRepositoryError && error.code === "unavailable");
});

test("sitemap repository preserves every allowlisted frequency and rejects unknown or absent fields", async () => {
  for (const changeFrequency of ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]) {
    const client = new Client((text) => text.includes("public_content_sitemap_page") ? [{ outcome: "found", result_payload: { items: [{ path: "/pages/about?lang=en-US", updatedAt: NOW.toISOString(), changeFrequency }] } }] : []);
    const entries = await publicRepository(new Pool([client])).getSitemapPage({ hostname: HOST, now: NOW, kind: "content", page: 0 });
    assert.equal(entries[0]?.changeFrequency, changeFrequency);
    assert.deepEqual(call(client, "public_content_sitemap_page").values, [HOST, NOW, "content", 0]);
  }
  for (const entry of [{ path: "/pages/about", updatedAt: NOW.toISOString() }, { path: "/pages/about", updatedAt: NOW.toISOString(), changeFrequency: "daily", privateOrigin: true }, { path: "/pages/about", updatedAt: NOW.toISOString(), changeFrequency: "<xml>" }]) {
    const client = new Client((text) => text.includes("public_content_sitemap_page") ? [{ outcome: "found", result_payload: { items: [entry] } }] : []);
    await assert.rejects(publicRepository(new Pool([client])).getSitemapPage({ hostname: HOST, now: NOW, kind: "content", page: 0 }), (error) => error instanceof StorefrontContentRepositoryError && error.code === "unavailable");
  }
});

test("sitemap index rejects duplicate shards and content locale rejects invalid active settings", async () => {
  const index = new Client((text) => text.includes("public_content_sitemap_index") ? [{ outcome: "found", result_payload: { items: [{ kind: "products", page: 0 }, { kind: "content", page: 0 }] } }] : []);
  assert.deepEqual(await publicRepository(new Pool([index])).getSitemapIndex({ hostname: HOST, now: NOW }), [{ kind: "products", page: 0 }, { kind: "content", page: 0 }]);
  const bad = new Client((text) => text.includes("public_content_locale_get") ? [{ outcome: "found", result_payload: { defaultLocale: "tr", enabledLocales: ["en-US"] } }] : []);
  await assert.rejects(publicRepository(new Pool([bad])).getLocales({ hostname: HOST, now: NOW }), (error) => error instanceof StorefrontContentRepositoryError && error.code === "unavailable");
});
