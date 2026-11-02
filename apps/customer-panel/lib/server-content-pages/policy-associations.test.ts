import assert from "node:assert/strict";
import test from "node:test";
import type { MerchantAdminRecord, MerchantContentDocument, TenantContext } from "@celebix/saas-contracts";
import type { StorePolicyAdminPage } from "@celebix/saas-data";
import { resolveContentPagePolicyAssociations } from "./policy-associations.ts";

const NOW = new Date("2026-11-02T12:00:00.000Z");
const ID = "71000000-0000-4000-8000-000000000001";
const BODY = "<p>İlk satır<br>İkinci satır</p>";
const tenant = { membership: { role: "store_owner" }, store: { id: "20000000-0000-4000-8000-000000000001" } } as TenantContext;
const page = (change: Partial<MerchantAdminRecord> = {}): MerchantAdminRecord => ({ id: ID, kind: "page", name: "Müşterinin kendi başlığı", config: { slug: "gizlilik", locale: "tr", published: true }, status: "active", version: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...change });
const document = (change: Partial<MerchantContentDocument> = {}): MerchantContentDocument => ({ id: ID, kind: "page", name: "Müşterinin kendi başlığı", slug: "gizlilik", locale: "tr", body: BODY, excerpt: null, seoTitle: null, seoDescription: null, published: true, status: "active", version: 1, publishedAt: NOW.toISOString(), createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), bodyFormat: "legacy", bodyDigest: `sha256:${"a".repeat(64)}`, origins: {}, ...change });
const policy = (change: Partial<StorePolicyAdminPage> = {}): StorePolicyAdminPage => ({ key: "privacy_security", label: "Gizlilik ve Güvenlik", route: "/policies/privacy-security", ordinal: 1, body: BODY, status: "published", version: 2, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...change });

function dependencies(records = [page()], doc = document(), canonical = policy()) {
  const calls: Array<{ method: string; input: unknown }> = [];
  return {
    calls,
    merchantAdmin: { async list(input: unknown) { calls.push({ method: "list", input }); return records; } },
    merchantContent: { async get(input: unknown) { calls.push({ method: "get", input }); return doc; } },
    policies: { async list(input: unknown) { calls.push({ method: "policies", input }); return [canonical]; } },
  };
}

test("legacy duplicate association uses exact saved body and current tenant authority, not name or UUID version", async () => {
  const deps = dependencies();
  const before = JSON.stringify({ record: page(), document: document(), policy: policy() });
  const result = await resolveContentPagePolicyAssociations({ tenantContext: tenant, now: NOW }, deps);
  assert.deepEqual(result, [{ recordId: ID, recordVersion: 1, policyKey: "privacy_security" }]);
  assert.deepEqual(deps.calls.map(({ method }) => method), ["list", "policies", "get"]);
  for (const { input } of deps.calls) assert.equal((input as { tenantContext: TenantContext }).tenantContext, tenant);
  assert.deepEqual(deps.calls[2]!.input, { tenantContext: tenant, now: NOW, kind: "page", recordId: ID });
  assert.equal(JSON.stringify({ record: page(), document: document(), policy: policy() }), before);
  assert.equal(JSON.stringify(result).includes(BODY), false, "merchant body must not enter browser association props");
});

test("custom, edited, stale, unpublished and unrelated documents remain ordinary pages", async () => {
  for (const changed of [
    document({ bodyFormat: "normalized_html" }), document({ body: `${BODY} ` }), document({ body: "" }),
    document({ version: 2 }), document({ id: "71000000-0000-4000-8000-000000000002" }),
    document({ slug: "baska-sayfa" }), document({ locale: "en" }), document({ published: false }),
    document({ status: "draft" }), document({ requiredPageKey: "about" }), document({ kind: "blog_post" }),
  ]) assert.deepEqual(await resolveContentPagePolicyAssociations({ tenantContext: tenant, now: NOW }, dependencies([page()], changed)), []);
  for (const changed of [page({ requiredPageKey: "about" }), page({ status: "archived" }), page({ config: { slug: "gizlilik-hakkinda", locale: "tr", published: true } })]) {
    const deps = dependencies([changed]);
    assert.deepEqual(await resolveContentPagePolicyAssociations({ tenantContext: tenant, now: NOW }, deps), []);
    assert.deepEqual(deps.calls.map(({ method }) => method), ["list"]);
  }
  assert.deepEqual(await resolveContentPagePolicyAssociations({ tenantContext: tenant, now: NOW }, dependencies([page()], document(), policy({ body: "" }))), []);
});

test("optional association reads fail open and candidate reads are bounded", async () => {
  for (const method of ["merchantAdmin", "policies", "merchantContent"] as const) {
    const deps = dependencies();
    const fail = async () => { throw new Error("temporarily unavailable"); };
    if (method === "merchantContent") deps.merchantContent.get = fail;
    else deps[method].list = fail;
    assert.deepEqual(await resolveContentPagePolicyAssociations({ tenantContext: tenant, now: NOW }, deps), []);
  }
  const deps = dependencies(Array.from({ length: 8 }, (_, index) => page({ id: `71000000-0000-4000-8000-${String(index).padStart(12, "0")}` })));
  assert.deepEqual(await resolveContentPagePolicyAssociations({ tenantContext: tenant, now: NOW }, deps), []);
  assert.deepEqual(deps.calls.map(({ method }) => method), ["list"]);
});

test("matching hidden legacy documents can group while a role without content access performs no reads", async () => {
  const hidden = dependencies([page({ status: "draft", config: { slug: "gizlilik", locale: "tr", published: false } })], document({ status: "draft", published: false }), policy({ status: "draft" }));
  assert.equal((await resolveContentPagePolicyAssociations({ tenantContext: tenant, now: NOW }, hidden)).length, 1);
  const denied = dependencies();
  assert.deepEqual(await resolveContentPagePolicyAssociations({ tenantContext: { ...tenant, membership: { ...tenant.membership, role: "cashier" } }, now: NOW }, denied), []);
  assert.equal(denied.calls.length, 0);
});
