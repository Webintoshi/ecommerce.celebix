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

test("grouped merchant and customer taxonomy evidence executes route component client and handler behavior", () => {
  const grouped = HEMENAKU_DONOR_PARITY.filter(({ authority, donorPath, actionSet }) =>
    (authority === "merchant_admin" && actionSet.includes("list_records")) ||
    donorPath === "/musteriler/etiketler" ||
    donorPath === "/musteriler/segmentler",
  );
  assert.ok(grouped.length > 30);
  for (const entry of grouped) {
    assert.match(entry.evidenceTest, /route-behavior[.]test[.]ts#/u, entry.donorPath);
    assert.doesNotMatch(entry.evidenceTest, /client[.]test[.]ts|route files expose only/u, entry.donorPath);
  }
});
