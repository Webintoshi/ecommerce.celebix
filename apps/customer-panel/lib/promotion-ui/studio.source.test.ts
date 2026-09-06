import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = new URL("../../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, app), "utf8"); }

test("PromotionStudio renders exactly twelve template cards, five primary steps, closed advanced settings, help, and a sticky story", async () => {
  const studio = await source("components/promotions/PromotionStudio.tsx");
  const editor = await source("components/promotions/PromotionEditor.tsx");
  const stylesheet = await source("components/promotions/promotion-studio.module.css");
  assert.match(studio, /PROMOTION_TEMPLATES[.]map/);
  assert.match(studio, /PROMOTION_TEMPLATES[.]length === 12/);
  assert.match(editor, /WIZARD_STEPS[.]map/);
  assert.match(editor, /WIZARD_STEPS[.]length === 5/);
  assert.match(editor, /<details open=\{draft[.]advancedOpen\}/);
  for (const step of [0, 1, 2, 3, 4]) assert.match(editor, new RegExp(`draft[.]step === ${step}`));
  assert.match(editor, /Örnek:/);
  assert.match(editor, /className=\{styles[.]sticky\}/);
  assert.match(stylesheet, /[.]sticky\s*\{\s*position:\s*sticky/);
  assert.doesNotMatch(`${studio}\n${editor}`, /evaluator|minor unit|stacking policy|rule tree|reservation/i);
});

test("PromotionList loads truthful server KPI values, has range controls, table/cards, and actionable states", async () => {
  const list = await source("components/promotions/PromotionList.tsx");
  assert.match(list, /\[7, 30, 90\] as const/);
  assert.match(list, /Son \{day\} gün/);
  assert.match(list, /promotionApi[.]overview\(range/);
  assert.match(list, /overview[?][.]activePromotions/);
  assert.match(list, /affectedOrders/);
  assert.match(list, /recoveredRevenueMinor/);
  assert.match(list, /Yeniden dene/);
  assert.match(list, /İlk kampanyayı oluştur/);
  assert.match(list, /<table/);
  assert.match(list, /mobileCards/);
  assert.doesNotMatch(list, /items[.](?:reduce|filter)[(]/);
  assert.doesNotMatch(list, /\b0\b\s*(?:TL|adet|%)/);
  assert.match(list, /load\(appliedQueryRef[.]current, undefined, true\)/);
  assert.match(list, /catch\s*\{\s*setMessage\("Tarih filtresi mağaza saat diliminde geçerli değil[.]"\)/);
});

test("promotion code batches remain usable on narrow screens", async () => {
  const codes = await source("components/promotions/PromotionCodes.tsx");
  const stylesheet = await source("components/promotions/promotion-studio.module.css");
  assert.match(codes, /aria-label="Kupon grupları"/);
  assert.match(codes, /styles[.]mobileCards/);
  assert.match(stylesheet, /@media \(max-width: 760px\)[\s\S]*?[.]batchForm\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("editor exposes every controlled merchant field and only server-backed checks and simulator", async () => {
  const editor = await source("components/promotions/PromotionEditor.tsx");
  for (const field of ["benefit", "selectedTargets", "audience", "startsAt", "endsAt", "totalUsage", "perCustomerUsage", "budgetMinor", "orderMaximumMinor", "combination", "marginPolicy", "progressMessages"]) assert.match(editor, new RegExp(field));
  assert.match(editor, /promotionApi[.]check/);
  assert.match(editor, /PromotionSimulator/);
  assert.match(editor, /publishEligibility/);
  assert.doesNotMatch(editor, /discountTotalMinor\s*[+*/-]|Math\.round.*discount/i);
  assert.match(editor, /specific_variant/);
  assert.match(editor, /Paket içindeki varyant adetleri/);
  assert.match(editor, /item[.]quantity/);
});

test("target picker searches and pages on the server, resolves retained IDs, and never adds unavailable rows", async () => {
  const picker = await source("components/promotions/PromotionTargetPicker.tsx");
  assert.match(picker, /promotionApi[.]targets/);
  assert.match(picker, /promotionApi[.]resolveTargets/);
  assert.match(picker, /AbortController/);
  assert.match(picker, /nextCursor/);
  assert.match(picker, /status !== "active"/);
  assert.match(picker, /Artık kullanılamıyor/);
  assert.match(picker, /generation === requestKey[.]current/);
  assert.match(picker, /reconcileTargetSelections/);
  assert.match(picker, /PromotionTargetPageLoader/);
  assert.match(picker, /setPhase\("ready"\)/);
  assert.match(picker, /setNextCursor\(null\)/);
  assert.match(picker, /phase === "ready" && nextCursor/);
});

test("editor keeps dirty protection through unload, links, cancel and close, and clears only after saved persistence", async () => {
  const editor = await source("components/promotions/PromotionEditor.tsx");
  assert.match(editor, /createDirtyNavigationGuard/);
  assert.match(editor, /bindBeforeUnload/);
  assert.match(editor, /bindApplicationNavigation/);
  assert.match(editor, /guard[.]canLeave/);
  assert.match(editor, /result[.]kind === "saved"/);
  assert.doesNotMatch(editor, /catch[\s\S]{0,160}setSavedSnapshot/);
  assert.match(editor, /disabled=\{effectiveReadOnly \|\| mutating\}/);
  assert.match(editor, /if \(!controller[.]signal[.]aborted && key === liveKey\)/);
  assert.doesNotMatch(editor, /<main\b/);
  assert.match(editor, /className=\{styles[.]editorWorkspace\}/);
  assert.match(editor, /eligibility[.]canPublish && status === "draft"/);
  assert.match(editor, /status === "active" \|\| status === "scheduled"/);
  assert.match(editor, /scheduleInvalid/);
  assert.match(editor, /Bu yerel saat mağazanın saat diliminde mevcut değil/);
  assert.match(editor, /checksController[.]current[?][.]abort\(\); const controller/);
  assert.doesNotMatch(editor, /Number\(value\) \* 100/);
  const simulator = await source("components/promotions/PromotionSimulator.tsx");
  assert.match(simulator, /promotionId, expectedVersion/);
  assert.match(simulator, /Gerçek mağaza kayıtlarıyla deneyin/);
  assert.match(simulator, /kinds=\{\["abandoned_cart"\]\}/);
  assert.doesNotMatch(simulator, /setPaidOrderCount|setUnitPrice|setUnitCost|setCategories|setSegments|setTags/);
});

test("one canonical dynamic route owns view/edit and resolves exactly one legacy record without scans", async () => {
  const [view, edit] = await Promise.all([
    source("app/discounts/[promotionId]/page.tsx"), source("app/discounts/[promotionId]/edit/page.tsx"),
  ]);
  const editor = await source("components/promotions/PromotionEditor.tsx");
  const client = await source("lib/promotion-ui/client.ts");
  assert.match(view, /PromotionStudio mode="view"/);
  assert.match(edit, /PromotionStudio mode="edit"/);
  assert.match(edit, /LegacyPromotionWarning/);
  assert.doesNotMatch(edit, /\/api\/promotions\/legacy|cursor|MerchantRecordEditor/);
  assert.match(editor, /promotionApi[.]resolveLegacy\(promotionId/);
  assert.match(editor, /window[.]location[.]replace\(`\/discounts\/\$\{legacy[.]promotionId\}/);
  assert.match(client, /\/api\/promotions\/legacy\/\$\{legacyRecordId\}/);
  assert.doesNotMatch(`${editor}\n${client}`, /listLegacy|cursor.*legacy/i);
});

test("the Customer Panel test command discovers the promotion UI suite", async () => {
  const manifest = await source("package.json");
  assert.match(manifest, /lib\/promotion-ui\/\*\.test\.ts/);
});

test("promotion pages obtain timezone only through promotions authority", async () => {
  const serverPage = await source("lib/server-promotion-page.ts");
  assert.match(serverPage, /resolveServerPromotionsRuntime/);
  assert.match(serverPage, /promotions[.]timezone/);
  assert.doesNotMatch(serverPage, /MerchantAdmin|general_setting|catalog/);
});
