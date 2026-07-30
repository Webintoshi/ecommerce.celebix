import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  DONOR_PARITY_ACTIONS,
  HEMENAKU_DONOR_PARITY,
  getDonorParityEntry,
} from "./parity-manifest.ts";

test("maps every donor page to one canonical target decision", () => {
  assert.equal(HEMENAKU_DONOR_PARITY.length, 86);
  assert.deepEqual(getDonorParityEntry("/muhasabe"), {
    donorPath: "/muhasabe", targetPath: "/accounting",
    status: "legacy_rejected", authority: "merchant_admin",
    evidenceTest: "apps/customer-panel/lib/panel-ui/navigation.test.ts#legacy donor spellings stay inert while canonical safe targets remain navigable",
    actionSet: ["legacy_rejected"],
    rejectionRationale: "typo spelling; accounting is the canonical safe target",
  });
  assert.equal(new Set(HEMENAKU_DONOR_PARITY.map(({ donorPath }) => donorPath)).size, 86);
});

test("foundation does not promote provider routes before real sandbox proof", () => {
  assert.equal(HEMENAKU_DONOR_PARITY.length, 86);
  assert.equal(HEMENAKU_DONOR_PARITY.filter(({ status }) => status === "complete").length, 77);
  assert.equal(HEMENAKU_DONOR_PARITY.filter(({ status }) => status === "provider_gated").length, 6);
  assert.equal(HEMENAKU_DONOR_PARITY.filter(({ status }) => status === "legacy_rejected").length, 3);
});

test("every donor route has a final evidenced decision", () => {
  assert.equal(HEMENAKU_DONOR_PARITY.length, 86);
  assert.equal(HEMENAKU_DONOR_PARITY.some(({ status }) => status === "route_depth"), false);
  assert.ok(Object.isFrozen(DONOR_PARITY_ACTIONS));
  assert.equal(new Set(DONOR_PARITY_ACTIONS).size, DONOR_PARITY_ACTIONS.length);
  for (const entry of HEMENAKU_DONOR_PARITY) {
    assert.ok(entry.evidenceTest.length > 0);
    assert.ok(["complete", "provider_gated", "legacy_rejected"].includes(entry.status));
    assert.ok(Object.isFrozen(entry.actionSet), entry.donorPath);
    assert.ok(entry.actionSet.length > 0, entry.donorPath);
    assert.equal(new Set(entry.actionSet).size, entry.actionSet.length, entry.donorPath);
    for (const action of entry.actionSet) {
      assert.ok(DONOR_PARITY_ACTIONS.includes(action), `${entry.donorPath}: ${action}`);
    }
  }
  const usedActions = new Set(HEMENAKU_DONOR_PARITY.flatMap(({ actionSet }) => actionSet));
  assert.deepEqual(DONOR_PARITY_ACTIONS.filter((action) => !usedActions.has(action)), []);
});

test("provider-gated and legacy-rejected rows retain truthful canonical targets", () => {
  for (const entry of HEMENAKU_DONOR_PARITY) {
    if (entry.status === "provider_gated") {
      assert.match(entry.evidenceTest, /merchant-admin-ui[/](?:client|presentation|route-behavior)[.]test|advanced-seo-console[.]test|merchant-admin-console[.]test/);
      assert.equal(entry.actionSet.some((action) => /execute|send|deliver|synchron|index/u.test(action)), false);
      assert.ok(entry.actionSet.includes("prepare_provider_action"), entry.donorPath);
      assert.ok(entry.actionSet.includes("cancel_provider_preparation"), entry.donorPath);
    }
    if (entry.status === "legacy_rejected") {
      assert.match(entry.rejectionRationale ?? "", /canonical safe target/);
      assert.notEqual(entry.donorPath, entry.targetPath);
      assert.deepEqual(entry.actionSet, ["legacy_rejected"]);
    }
  }
});

const ROOT = new URL("../../../../", import.meta.url);
const targetPage = (targetPath: string) => new URL(
  targetPath === "/" ? "apps/customer-panel/app/(panel)/page.tsx" : `apps/customer-panel/app${targetPath}/page.tsx`,
  ROOT,
);

test("every evidence reference names a real substantive production behavior test", async () => {
  for (const entry of HEMENAKU_DONOR_PARITY) {
    const [file, testName] = entry.evidenceTest.split("#");
    assert.ok(file && file.endsWith(".test.ts"), entry.donorPath);
    assert.notEqual(file, "apps/customer-panel/lib/panel-ui/parity-manifest.test.ts", entry.donorPath);
    assert.ok(testName, entry.donorPath);
    await access(new URL(`../../../../${file}`, import.meta.url));
    const evidence = await readFile(new URL(`../../../../${file}`, import.meta.url), "utf8");
    assert.ok(
      evidence.includes(`test(${JSON.stringify(testName)}`),
      `${entry.donorPath}: missing named test ${testName}`,
    );
    await access(targetPage(entry.targetPath));
  }
});

test("legacy rejections carry an explicit duplicate typo or unsafe rationale", () => {
  const rejected = HEMENAKU_DONOR_PARITY.filter(({ status }) => status === "legacy_rejected");
  assert.deepEqual(rejected.map(({ donorPath, rejectionRationale }) => [donorPath, rejectionRationale]), [
    ["/ayarlar/ana-sayfa-vitrini", "duplicate storefront showcase; collections is the canonical safe target"],
    ["/muhasabe", "typo spelling; accounting is the canonical safe target"],
    ["/pazarlama/lucky-wheel", "duplicate lucky-wheel workflow; discounts is the canonical safe target"],
  ]);
  assert.deepEqual(HEMENAKU_DONOR_PARITY.reduce((counts, entry) => ({ ...counts, [entry.status]: (counts[entry.status] ?? 0) + 1 }), {} as Record<string, number>), { complete: 77, provider_gated: 6, legacy_rejected: 3 });
});

test("AI preference is complete without claiming external generation", () => {
  assert.deepEqual(getDonorParityEntry("/ayarlar/yapay-zeka"), {
    donorPath: "/ayarlar/yapay-zeka", targetPath: "/settings/artificial-intelligence",
    status: "complete", authority: "merchant_admin",
    evidenceTest: "apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts#merchant route matrix invokes every actual page, production console, client, and handler across truth and mutation states",
    actionSet: ["list_records", "read_exact_record", "create_record", "update_record", "archive_record"],
  });
});

test("static merchant hubs claim navigation only while marketing retains durable list authority", () => {
  for (const donorPath of ["/ayarlar", "/ayarlar/tasarim", "/cms"]) {
    assert.deepEqual(
      getDonorParityEntry(donorPath)?.actionSet,
      ["open_supported_destination"],
      donorPath,
    );
  }
  assert.deepEqual(
    getDonorParityEntry("/pazarlama")?.actionSet,
    ["list_records", "open_supported_destination"],
  );
});

test("all 48 merchant rows retain their exact route status evidence and action contract", () => {
  const merchantRouteEvidence = "apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts#merchant route matrix invokes every actual page, production console, client, and handler across truth and mutation states";
  const merchantRecordRouteEvidence = "apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts#merchant non-default route matrix invokes nine actual pages and exact create update handlers across success conflict and replay";
  const paymentSettingsEvidence = "apps/customer-panel/lib/routes.test.ts#dedicated payment settings route validates hints and retires generic editors";
  const merchantHubEvidence = "apps/customer-panel/lib/merchant-admin-ui/route-behavior.test.ts#static merchant hubs invoke actual pages and expose only canonical destination links";
  const loginEvidence = "apps/customer-panel/lib/routes.test.ts#login and logout remain fail-closed without approved staging auth authority";
  const legacyEvidence = "apps/customer-panel/lib/panel-ui/navigation.test.ts#legacy donor spellings stay inert while canonical safe targets remain navigable";
  const crud = ["list_records", "read_exact_record", "create_record", "update_record", "archive_record"] as const;
  const provider = [...crud, "prepare_provider_action", "cancel_provider_preparation"] as const;
  const edit = ["read_exact_record", "update_record"] as const;
  const create = ["create_record"] as const;
  const hub = ["open_supported_destination"] as const;
  const expected = [
    ["/ayarlar", "/settings", "complete", merchantHubEvidence, hub],
    ["/ayarlar/bildirimler", "/settings/notifications", "complete", merchantRouteEvidence, crud],
    ["/ayarlar/dil", "/settings/language", "complete", merchantRouteEvidence, crud],
    ["/ayarlar/genel", "/settings/general", "complete", merchantRouteEvidence, crud],
    ["/ayarlar/hero-banner", "/settings/hero-banner", "complete", merchantRouteEvidence, crud],
    ["/ayarlar/kargo", "/settings/shipping", "complete", merchantRouteEvidence, crud],
    ["/ayarlar/marquee", "/settings/marquee", "complete", merchantRouteEvidence, crud],
    ["/ayarlar/odeme", "/settings/payment", "complete", paymentSettingsEvidence, crud],
    ["/ayarlar/odeme/[id]/duzenle", "/settings/payment/[recordId]/edit", "complete", paymentSettingsEvidence, edit],
    ["/ayarlar/odeme/yeni", "/settings/payment/new", "complete", paymentSettingsEvidence, create],
    ["/ayarlar/promosyon-banner", "/settings/promotion-banner", "complete", merchantRouteEvidence, crud],
    ["/ayarlar/tasarim", "/settings/design", "complete", merchantHubEvidence, hub],
    ["/ayarlar/yapay-zeka", "/settings/artificial-intelligence", "complete", merchantRouteEvidence, crud],
    ["/cms", "/content", "complete", merchantHubEvidence, hub],
    ["/cms/blog", "/content/blog", "complete", merchantRouteEvidence, crud],
    ["/cms/blog/[id]", "/content/blog/[recordId]/edit", "complete", merchantRecordRouteEvidence, edit],
    ["/cms/blog/yeni", "/content/blog/new", "complete", merchantRecordRouteEvidence, create],
    ["/cms/politikalar", "/content/policies", "complete", merchantRouteEvidence, crud],
    ["/cms/politikalar/[slug]", "/content/policies/[recordId]/edit", "complete", merchantRecordRouteEvidence, edit],
    ["/cms/sayfalar", "/content/pages", "complete", merchantRouteEvidence, crud],
    ["/cms/sayfalar/[id]", "/content/pages/[recordId]/edit", "complete", merchantRecordRouteEvidence, edit],
    ["/cms/sayfalar/yeni", "/content/pages/new", "complete", merchantRecordRouteEvidence, create],
    ["/indirimler", "/discounts", "complete", merchantRouteEvidence, crud],
    ["/indirimler/[id]/duzenle", "/discounts/[recordId]/edit", "complete", merchantRecordRouteEvidence, edit],
    ["/indirimler/sans-carki", "/discounts/lucky-wheel", "complete", merchantRouteEvidence, crud],
    ["/indirimler/yeni", "/discounts/new", "complete", merchantRecordRouteEvidence, create],
    ["/login", "/login", "complete", loginEvidence, ["view_disabled_auth"]],
    ["/markets", "/marketplaces", "provider_gated", merchantRouteEvidence, provider],
    ["/muhasabe", "/accounting", "legacy_rejected", legacyEvidence, ["legacy_rejected"]],
    ["/muhasebe", "/accounting", "complete", merchantRouteEvidence, crud],
    ["/muhasebe/fatura-entegrasyonu", "/accounting/invoicing-integration", "provider_gated", merchantRouteEvidence, provider],
    ["/pazarlama", "/marketing", "complete", merchantRouteEvidence, ["list_records", "open_supported_destination"]],
    ["/pazarlama/email", "/marketing/email", "provider_gated", merchantRouteEvidence, provider],
    ["/pazarlama/lucky-wheel", "/discounts/lucky-wheel", "legacy_rejected", legacyEvidence, ["legacy_rejected"]],
    ["/pazarlama/phone", "/marketing/phone", "provider_gated", merchantRouteEvidence, provider],
    ["/pazarlama/whatsapp", "/marketing/whatsapp", "provider_gated", merchantRouteEvidence, provider],
    ["/seo-killer", "/seo", "complete", merchantRouteEvidence, crud],
    ["/seo-killer/geo-optimizasyon", "/seo/geo-optimization", "complete", merchantRouteEvidence, crud],
    ["/seo-killer/hizli-index", "/seo/fast-indexing", "provider_gated", merchantRouteEvidence, provider],
    ["/seo-killer/ic-linkleme", "/seo/internal-linking", "complete", merchantRouteEvidence, crud],
    ["/seo-killer/icerikler", "/seo/content", "complete", merchantRouteEvidence, crud],
    ["/seo-killer/kategoriler", "/seo/categories", "complete", merchantRouteEvidence, crud],
    ["/seo-killer/kod-entegrasyonlari", "/seo/code-integrations", "complete", merchantRouteEvidence, crud],
    ["/seo-killer/sayfalar", "/seo/pages", "complete", merchantRouteEvidence, crud],
    ["/seo-killer/sitemap", "/seo/sitemap", "complete", merchantRouteEvidence, crud],
    ["/seo-killer/sosyal-onizleme", "/seo/social-preview", "complete", merchantRouteEvidence, crud],
    ["/seo-killer/urunler", "/seo/products", "complete", merchantRouteEvidence, crud],
    ["/yoneticiler", "/settings/administrators", "complete", merchantRouteEvidence, crud],
  ] as const;
  const merchantRows = HEMENAKU_DONOR_PARITY.filter(({ authority }) => authority === "merchant_admin");
  assert.deepEqual(
    merchantRows.map(({ donorPath, targetPath, status, evidenceTest, actionSet }) => [donorPath, targetPath, status, evidenceTest, actionSet]),
    expected,
  );
  assert.equal(new Set(merchantRows.map(({ donorPath }) => donorPath)).size, 48);
  assert.equal(merchantRows.every(({ evidenceTest }) => [merchantRouteEvidence, merchantRecordRouteEvidence, paymentSettingsEvidence, merchantHubEvidence, loginEvidence, legacyEvidence].includes(evidenceTest)), true);
  assert.equal(merchantRows.some(({ evidenceTest }) => /client[.]test[.]ts|presentation[.]test[.]ts|route files expose only/u.test(evidenceTest)), false);
});

test("every customer row uses the behavioral evidence family that executes its exact route actions", () => {
  const customerRouteEvidence = "apps/customer-panel/lib/customer-ui/route-behavior.test.ts#customer route matrix invokes actual list detail edit and new pages through real clients and handlers";
  const taxonomyEvidence = "apps/customer-panel/lib/customer-ui/taxonomy-route-behavior.test.ts#customer taxonomy routes invoke actual pages, production consoles, clients, and handlers across truth and mutation states";
  const rows = HEMENAKU_DONOR_PARITY.filter(({ authority }) => authority === "customers");
  assert.equal(rows.length, 6);
  for (const entry of rows) {
    const expected = entry.targetPath === "/customers/tags" || entry.targetPath === "/customers/segments"
      ? taxonomyEvidence
      : customerRouteEvidence;
    assert.equal(entry.evidenceTest, expected, entry.donorPath);
    assert.match(entry.evidenceTest, /route-behavior[.]test[.]ts#/u, entry.donorPath);
    assert.doesNotMatch(entry.evidenceTest, /client[.]test[.]ts|customer-console[.]test[.]ts|route files expose only/u, entry.donorPath);
  }
  assert.deepEqual(rows.map(({ targetPath, actionSet }) => [targetPath, actionSet]), [
    ["/customers", ["list_records", "read_exact_record", "create_record", "export_records"]],
    ["/customers/[customerId]", ["read_exact_record", "update_record", "archive_record", "add_customer_note", "set_customer_tags", "set_customer_segments"]],
    ["/customers/[customerId]/edit", ["read_exact_record", "update_record"]],
    ["/customers/tags", ["list_records", "create_record"]],
    ["/customers/segments", ["list_records", "create_record"]],
    ["/customers/new", ["create_record"]],
  ]);
});
