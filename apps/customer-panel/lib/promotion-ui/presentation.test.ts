import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DELETE as fixtureDELETE, GET as fixtureGET, PATCH as fixturePATCH, POST as fixturePOST, PUT as fixturePUT } from "../../../../tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/promotions/[[...path]]/route.ts";
import { PROMOTION_ID } from "../../../../tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/mira-promotions/promotions-fixture.ts";
import { PromotionApiClient } from "./client.ts";

const app = new URL("../../", import.meta.url);
const repository = new URL("../../", app);

async function source(path: string) {
  return readFile(new URL(path, app), "utf8");
}

async function fixtureSource(path: string) {
  return readFile(new URL(path, repository), "utf8").catch(() => "");
}

test("promotions use the approved neutral operations palette without legacy blue presentation", async () => {
  const stylesheet = (await source("components/promotions/promotion-studio.module.css")).toLowerCase();

  for (const color of ["#2b2b2b", "#f8f7f5", "#fffdfc", "#e7e2dd", "#fe6100"]) {
    assert.match(stylesheet, new RegExp(color), `missing approved color ${color}`);
  }
  for (const legacyColor of ["#172033", "#25324a", "#243552", "#1d4d92", "#2f5d9f", "#eef4ff"]) {
    assert.doesNotMatch(stylesheet, new RegExp(legacyColor), `legacy presentation color ${legacyColor}`);
  }
  assert.match(stylesheet, /[.]eyebrow\s*\{[^}]*color:\s*#667085/s);
  assert.match(stylesheet, /[.]primarybutton\s*\{[^}]*background:\s*#2b2b2b/s);
});

test("promotion editor collapses at tablet and keeps complete step and choice labels at 390px", async () => {
  const stylesheet = await source("components/promotions/promotion-studio.module.css");

  assert.match(stylesheet, /@media \(max-width:\s*1024px\)[\s\S]*?[.]editorLayout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(stylesheet, /@media \(max-width:\s*760px\)[\s\S]*?[.]steps\s*\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(stylesheet, /@media \(max-width:\s*760px\)[\s\S]*?[.]steps em\s*\{[^}]*display:\s*none/);
  assert.match(stylesheet, /[.]radioLabel,\s*[.]checkLabel\s*\{[^}]*display:\s*grid\s*!important;[^}]*grid-template-columns:\s*1[.]25rem minmax\(0,\s*1fr\)\s*!important/s);
  assert.match(stylesheet, /@media \(max-width:\s*1024px\)[\s\S]*?[.]actionBar\s*\{[^}]*bottom:\s*calc\(5[.]25rem \+ env\(safe-area-inset-bottom,\s*0px\)\)/);
  assert.match(stylesheet, /@media \(max-width:\s*430px\)[\s\S]*?[.]kpis\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(stylesheet, /@media \(max-width:\s*430px\)[\s\S]*?[.]kpis article\s*\{[^}]*padding:\s*12px/);
});

test("promotion list owns the shell topbar and keeps its one primary action graphite in every placement", async () => {
  const [list, stylesheet] = await Promise.all([
    source("components/promotions/PromotionList.tsx"),
    source("components/promotions/promotion-studio.module.css"),
  ]);

  assert.match(list, /PanelPageHeader/);
  assert.match(list, /title="İndirimler ve Kampanyalar"/);
  assert.match(list, /actions=\{canManage \? <div className=\{styles[.]headerPrimary\}>/);
  assert.doesNotMatch(list, /<header className=\{styles[.]pageHeader\}>/);
  assert.match(stylesheet, /[.]headerPrimary a\s*\{[^}]*border-color:\s*#2B2B2B;[^}]*background:\s*#2B2B2B;[^}]*color:\s*#FFFDFC;/s);
});

test("Taslak stays neutral and desktop and mobile use the same promotion status tone", async () => {
  const list = await source("components/promotions/PromotionList.tsx");

  assert.match(list, /const STATUS_TONE:[^=]+=[\s\S]*?draft:\s*"neutral"[\s\S]*?active:\s*"success"[\s\S]*?usage_exhausted:\s*"danger"[\s\S]*?budget_exhausted:\s*"danger"/);
  assert.equal(list.match(/tone=\{statusTone\(item[.]effectiveStatus\)\}/g)?.length, 2);
  assert.doesNotMatch(list, /tone=\{item[.]effectiveStatus[^}]+"warning"\}/);
});

test("Next promotion pages keep reusable fixture exports outside route modules", async () => {
  const fixturePage = await fixtureSource("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/mira-promotions/[view]/page.tsx");
  const wrappers = await Promise.all([
    "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/discounts/page.tsx",
    "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/discounts/new/page.tsx",
    "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/discounts/[promotionId]/page.tsx",
    "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/discounts/[promotionId]/edit/page.tsx",
    "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/discounts/[promotionId]/codes/page.tsx",
    "tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/discounts/[promotionId]/analytics/page.tsx",
  ].map(fixtureSource));

  assert.doesNotMatch(fixturePage, /export (?:type|function) PromotionFixture/);
  assert.match(fixturePage, /from "[.][.]\/PromotionFixtureScreen"/);
  for (const wrapper of wrappers) {
    assert.match(wrapper, /mira-promotions\/PromotionFixtureScreen/);
    assert.doesNotMatch(wrapper, /\[view\]\/page/);
  }
});

test("the browser fixture mounts real promotion views and rejects all mutations", async () => {
  const fixtureScreen = await fixtureSource("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/mira-promotions/PromotionFixtureScreen.tsx");
  const fixtureRoute = await fixtureSource("tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/api/promotions/[[...path]]/route.ts");

  for (const component of ["PromotionStudio", "PromotionCodes", "PromotionAnalytics", "PanelLayoutClient"]) {
    assert.match(fixtureScreen, new RegExp(component));
  }
  assert.match(fixtureScreen, /data-evidence="isolated-promotions-fixture"/);
  assert.match(fixtureRoute, /export async function POST\(\)/);
  assert.match(fixtureRoute, /export async function PATCH\(\)/);
  assert.match(fixtureRoute, /status:\s*409/);
  assert.doesNotMatch(fixtureRoute, /fetch\(|createClient|process[.]env/);

  const client = new PromotionApiClient(async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname.replace(/^\/api\/promotions\/?/, "").split("/").filter(Boolean);
    const context = { params: Promise.resolve({ path }) };
    if (request.method === "POST") return fixturePOST();
    if (request.method === "PATCH") return fixturePATCH();
    if (request.method === "PUT") return fixturePUT();
    if (request.method === "DELETE") return fixtureDELETE();
    return fixtureGET(request, context);
  });

  assert.equal((await client.list({})).items[0]?.id, PROMOTION_ID);
  assert.equal((await client.detail(PROMOTION_ID)).name, "Mira kontrollü kampanya");
  assert.deepEqual(await client.listCodeBatches(PROMOTION_ID), { items: [], nextCursor: null });
  await assert.rejects(client.overview(30), /promotion_unavailable/);
  await assert.rejects(client.analytics(PROMOTION_ID, 30), /promotion_unavailable/);
  for (const response of [await fixturePOST(), await fixturePATCH(), await fixturePUT(), await fixtureDELETE()]) {
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code: "conflict" });
  }
});
