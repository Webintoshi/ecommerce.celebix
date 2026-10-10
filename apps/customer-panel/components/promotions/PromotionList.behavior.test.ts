import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import type { PromotionAdminListItem, PromotionOverviewResult } from "@celebix/saas-contracts";
import * as client from "../../lib/promotion-ui/client.ts";
import * as model from "../../lib/promotion-ui/model.ts";
import { compile, withEditor } from "../settings/design/design-editor-test-utils.ts";

const record = (index = 1, patch: Partial<PromotionAdminListItem> = {}): PromotionAdminListItem => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  version: 7, name: `Kampanya ${index}`, status: "active", effectiveStatus: "active",
  triggerKind: "automatic", benefitKind: "percentage", audienceMode: "everyone", humanMechanic: "%10 indirim",
  startsAt: null, endsAt: null, usage: { used: 3, budgetMinor: 0 }, activeCodeCount: 0,
  financials: [{ currency: "TRY", redemptions: 3, discountMinor: 1000, revenueMinor: 10000 }],
  createdAt: "2026-10-01T00:00:00.000000Z", updatedAt: "2026-10-02T00:00:00.000000Z", ...patch,
});
const overview = (days: 7 | 30 | 90): PromotionOverviewResult => ({
  periodDays: days, activePromotions: 42,
  currencies: [{ currency: "TRY", affectedOrders: 12, discountMinor: 2500, revenueMinor: 50000, recoveredOrders: 2, recoveredRevenueMinor: 10000 }],
});
type Page = { items: readonly PromotionAdminListItem[]; nextCursor: string | null };
type Options = {
  records?: readonly PromotionAdminListItem[]; timezone?: string; canManage?: boolean; canPublish?: boolean; canArchive?: boolean;
  list?: (query: client.ListQuery, attempt: number) => Promise<Page>;
  overview?: (days: 7 | 30 | 90, attempt: number) => Promise<PromotionOverviewResult>;
  lifecycle?: (...args: any[]) => Promise<any>; duplicate?: (...args: any[]) => Promise<any>;
  impact?: (...args: any[]) => Promise<any>; delete?: (...args: any[]) => Promise<any>;
  pendingDeletion?: number; managedSources?: readonly any[];
};

async function promotionScreen(run: (screen: any) => Promise<void>, options: Options = {}) {
  const reads: client.ListQuery[] = [], summaries: number[] = [], mutations: any[][] = [], duplicates: any[][] = [], deletions: any[][] = [];
  let pending: number | null = options.pendingDeletion ?? null;
  const api = {
    list: async (query: client.ListQuery) => { reads.push(structuredClone(query)); return options.list ? options.list(query, reads.length) : { items: options.records ?? [record()], nextCursor: null }; },
    overview: async (days: 7 | 30 | 90) => { summaries.push(days); return options.overview ? options.overview(days, summaries.length) : overview(days); },
    lifecycle: async (...args: any[]) => { mutations.push(args); return options.lifecycle ? options.lifecycle(...args) : { kind: "saved", promotion: { id: args[0] } }; },
    duplicate: async (...args: any[]) => { duplicates.push(args); return options.duplicate ? options.duplicate(...args) : { kind: "conflict", message: "Kopya doğrulanamadı." }; },
    deletionImpact: async (id: string) => options.impact ? options.impact(id) : { id, version: 7, name: "Kampanya 1", codeCount: 2, preservedRedemptionCount: 3, pendingReservationCount: 0, linkedTools: [], canDelete: true },
    pendingDeletion: () => pending,
    pendingDeletions: () => pending === null ? [] : [{ id: record().id, version: pending }],
    delete: async (...args: any[]) => { deletions.push(args); try { const result = options.delete ? await options.delete(...args) : { id: args[0], deletedAt: "2026-10-09T20:00:00.000Z", replayed: false }; pending = null; return result; } catch (error) { pending = args[1]; throw error; } },
  };
  const { PromotionList } = compile<any>(new URL("./PromotionList.tsx", import.meta.url), {
    "next/link": { __esModule: true, default: ({ children, ...props }: any) => React.createElement("a", props, children) },
    "@/components/panel/PanelPageShell": {
      PanelPageHeader: ({ actions }: any) => React.createElement("header", null, actions),
      PanelActionButton: ({ primary: _primary, children, ...props }: any) => React.createElement("a", props, children),
      PanelEmptyState: ({ title, description, action }: any) => React.createElement("div", null, React.createElement("h2", null, title), description, action),
      PanelStatusBadge: ({ children }: any) => React.createElement("span", null, children),
      PanelLoadingState: ({ label }: any) => React.createElement("p", { role: "status" }, label),
    },
    "@/lib/promotion-ui/client": client,
    "@/lib/lucky-wheel-ui/client": {createLuckyWheelApi:()=>({managedPromotions:async()=>({items:options.managedSources??[],hasMore:false,nextCursor:null})})},
    "@/lib/promotion-ui/model": model,
    "@/components/settings/design/DesignSettingsDrawer": compile(new URL("../settings/design/DesignSettingsDrawer.tsx", import.meta.url)),
    "./PromotionIllustration": { PromotionIllustration: () => null },
  });
  await withEditor(async context => {
    // Native popover layout is covered by browser QA; HappyDOM only exercises its action controls.
    Object.defineProperty(context.window.HTMLElement.prototype, "hidePopover", { configurable: true, value() {} });
    Object.defineProperties(context.window, {
      confirm: { configurable: true, writable: true, value: () => true },
      prompt: { configurable: true, writable: true, value: () => "YENIKOD" },
    });
    const settle = async () => { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
    const button = (label: string, within: ParentNode = context.container): HTMLButtonElement => {
      const found = Array.from(within.querySelectorAll<HTMLButtonElement>("button")).filter(element => !element.closest("[hidden]")).find(element => element.getAttribute("aria-label") === label || element.textContent?.trim() === label || (label === "Filtreler" && /^Filtreler\d*$/.test(element.textContent?.trim() ?? "")));
      assert.ok(found, `button ${label}`); return found;
    };
    const click = async (label: string, within?: ParentNode) => { await context.click(button(label, within)); await settle(); };
    const field = (label: string): HTMLInputElement | HTMLSelectElement => {
      const labelElement = Array.from(context.container.querySelectorAll("label")).find(element => element.textContent?.trim().startsWith(label));
      const found = labelElement?.querySelector<HTMLInputElement | HTMLSelectElement>("input,select") ?? (labelElement?.htmlFor ? context.container.querySelector<HTMLInputElement | HTMLSelectElement>(`#${labelElement.htmlFor}`) : null);
      assert.ok(found, `field ${label}`); return found;
    };
    const change = async (label: string, value: string) => { await context.change(field(label), value); await settle(); };
    const row = (name: string): HTMLTableRowElement => {
      const found = Array.from(context.container.querySelectorAll<HTMLTableRowElement>("tbody tr")).find(element => element.textContent?.includes(name));
      assert.ok(found, `row ${name}`); return found;
    };
    await context.render(React.createElement(PromotionList, {
      timezone: options.timezone ?? "Europe/Istanbul", canManage: options.canManage ?? true,
      canPublish: options.canPublish ?? true, canArchive: options.canArchive ?? true, api,
    }));
    await settle();
    await run({ ...context, button, click, field, change, row, settle, reads, summaries, mutations, duplicates, deletions });
  });
}

test("quick status filters request the server and preserve other applied filters", async () => {
  const draft = record(1, { name: "İlk sayfadaki taslak", status: "draft", effectiveStatus: "draft" });
  const active = record(2, { name: "Sunucudan gelen aktif" });
  await promotionScreen(async ({ click, change, reads, container, summaries }) => {
    assert.deepEqual(reads, [{}]);
    await click("Aktif");
    assert.deepEqual(reads.at(-1), { effectiveStatuses: ["active"] });
    assert.match(container.textContent, /Sunucudan gelen aktif/);
    assert.doesNotMatch(container.textContent, /İlk sayfadaki taslak/);
    await change("İndirim adı veya kupon kodu ara", "  BAHAR  "); await click("Ara");
    assert.deepEqual(reads.at(-1), { search: "BAHAR", effectiveStatuses: ["active"] });
    await click("Filtreler"); await change("Uygulama", "code"); await change("İndirim türü", "free_shipping"); await click("Filtreleri uygula");
    assert.deepEqual(reads.at(-1), { search: "BAHAR", effectiveStatuses: ["active"], triggerKinds: ["code"], benefitKinds: ["free_shipping"] });
    await click("Tümü");
    assert.deepEqual(reads.at(-1), { search: "BAHAR", triggerKinds: ["code"], benefitKinds: ["free_shipping"] });
    assert.deepEqual(summaries, [30]);
  }, { list: async (_query, attempt) => ({ items: attempt === 1 ? [draft] : [active], nextCursor: null }) });
});

test("failed cursor append retains loaded records and retries the same query without changing overview", async () => {
  const first = Array.from({ length: 25 }, (_, index) => record(index + 1));
  await promotionScreen(async ({ click, reads, summaries, container }) => {
    await click("Aktif");
    await click("Daha fazla göster");
    assert.equal(container.querySelectorAll("tbody tr").length, 25);
    assert.match(container.textContent, /Sonraki indirimler yüklenemedi/);
    await click("Yeniden dene");
    assert.equal(container.querySelectorAll("tbody tr").length, 26);
    assert.deepEqual(reads.slice(-2), [
      { effectiveStatuses: ["active"], cursor: "next-page" },
      { effectiveStatuses: ["active"], cursor: "next-page" },
    ]);
    assert.match(container.textContent, /26 kampanya/);
    assert.deepEqual(summaries, [30]);
    const count = reads.length;
    await click("Son 7 gün"); await click("Son 90 gün");
    assert.deepEqual(summaries, [30, 7, 90]); assert.equal(reads.length, count);
  }, { list: async (query, attempt) => {
    if (query.cursor && attempt === 3) throw Error("page temporarily unavailable");
    return query.cursor ? { items: [record(26)], nextCursor: null } : { items: first, nextCursor: "next-page" };
  } });
});

test("filter cancellation restores applied values and date filters follow the store civil-day boundary", async () => {
  await promotionScreen(async ({ click, change, field, button, reads, container, window }) => {
    await click("Filtreler"); await change("Başlangıç", "2026-11-01"); await click("Filtreleri uygula");
    assert.equal(reads.length, 1); assert.ok(container.querySelector('[role="dialog"]'));
    assert.equal(window.document.activeElement, field("Bitiş"));
    await change("Bitiş", "2026-11-01"); await change("Uygulama", "code"); await click("Filtreleri uygula");
    assert.deepEqual(reads.at(-1), { triggerKinds: ["code"], scheduleFrom: "2026-11-01T04:00:00.000Z", scheduleTo: "2026-11-02T05:00:00.000Z" });
    await click("Filtreler"); await change("Uygulama", "automatic"); await change("Başlangıç", "2026-11-02"); await click("Vazgeç");
    assert.equal(reads.length, 2);
    assert.equal(window.document.activeElement, button("Filtreler"));
    await click("Filtreler"); assert.equal(field("Uygulama").value, "code"); assert.equal(field("Başlangıç").value, "2026-11-01");
    await click("Vazgeç");
  }, { timezone: "America/New_York" });
});

test("manage publish and archive permission flags gate their own actions independently", async () => {
  for (const permitted of ["manage", "publish", "archive"] as const) {
    await promotionScreen(async ({ container }) => {
      const labels = Array.from(container.querySelectorAll("button") as NodeListOf<HTMLButtonElement>).map(element => element.textContent?.trim());
      assert.equal(labels.includes("Çoğalt"), permitted === "manage");
      assert.equal(labels.includes("Duraklat"), permitted === "publish");
      assert.equal(labels.includes("Arşivle"), permitted === "archive");
      assert.equal(labels.includes("Sil"), permitted === "archive");
      assert.equal(Boolean(container.querySelector(`a[href="/discounts/${record().id}/edit"]`)), permitted === "manage");
    }, { canManage: permitted === "manage", canPublish: permitted === "publish", canArchive: permitted === "archive" });
  }
});

test("read-only access retains view analytics and coupon links while omitting mutation actions", async () => {
  await promotionScreen(async ({ container, mutations, duplicates }) => {
    const item = record();
    for (const suffix of ["", "/analytics", "/codes"]) assert.ok(container.querySelector(`a[href="/discounts/${item.id}${suffix}"]`));
    assert.equal(container.querySelector(`a[href="/discounts/${item.id}/edit"]`), null);
    assert.equal(container.querySelector('a[href="/discounts/new"]'), null);
    const labels = Array.from(container.querySelectorAll("button") as NodeListOf<HTMLButtonElement>).map(element => element.textContent?.trim());
    for (const label of ["Çoğalt", "Duraklat", "Devam ettir", "Arşivle", "Sil"]) assert.equal(labels.includes(label), false);
    assert.deepEqual(mutations, []); assert.deepEqual(duplicates, []);
  }, { canManage: false, canPublish: false, canArchive: false });
});

test("direct deletion needs confirmation without an archive step and keeps the applied filter", async () => {
  await promotionScreen(async ({ click, row, container, deletions, mutations, reads, summaries, window, button }) => {
    await click("Aktif"); await click("Sil", row("Kampanya 1"));
    const dialog = container.querySelector('[role="dialog"]'); assert.ok(dialog);
    assert.match(dialog.textContent, /Geçmiş sipariş/); assert.equal(deletions.length, 0);
    await click("Vazgeç", dialog); assert.equal(deletions.length, 0);
    await click("Sil", row("Kampanya 1")); await click("Sil", container.querySelector('[role="dialog"]'));
    assert.deepEqual(deletions, [[record().id, 7]]); assert.deepEqual(mutations, []);
    assert.deepEqual(reads.at(-1), { effectiveStatuses: ["active"] });
    assert.deepEqual(summaries, [30, 30]); assert.match(container.textContent, /İndirim silindi/);
    assert.equal(window.document.activeElement, button("Filtreler"));
  }, { list: async (_query, attempt) => ({ items: attempt > 2 ? [] : [record()], nextCursor: null }) });
});

test("archived discounts can be deleted and enabled tool or payment blockers prevent submission", async () => {
  await promotionScreen(async ({ click, row, container, button, deletions }) => {
    await click("Sil", row("Arşivde"));
    const dialog = container.querySelector('[role="dialog"]');
    assert.match(dialog.textContent, /Yaz popup/); assert.match(dialog.textContent, /2.*ödeme/);
    assert.equal(button("Sil", dialog).disabled, true); assert.equal(deletions.length, 0);
    await click("Vazgeç", dialog); assert.equal(container.querySelector('[role="dialog"]'), null);
  }, { records: [record(1, { name: "Arşivde", status: "archived", effectiveStatus: "archived" })], impact: async id => ({ id, version: 7, name: "Arşivde", codeCount: 2, preservedRedemptionCount: 1, pendingReservationCount: 2, linkedTools: [{ id: record(2).id, kind: "popup", name: "Yaz popup", enabled: true }], canDelete: false }) });
});

test("lost deletion response can be cancelled and resumed with the original version", async () => {
  let attempt = 0;
  await promotionScreen(async ({ click, row, container, deletions }) => {
    await click("Sil", row("Kampanya 1")); await click("Sil", container.querySelector('[role="dialog"]'));
    assert.match(container.textContent, /sonucu doğrulanamadı/);
    await click("Vazgeç", container.querySelector('[role="dialog"]'));
    await click("Sil", row("Kampanya 1")); await click("Silmeyi doğrula", container.querySelector('[role="dialog"]'));
    assert.deepEqual(deletions, [[record().id, 7], [record().id, 7]]);
  }, { delete: async id => { if (++attempt === 1) throw Error("connection lost"); return { id, deletedAt: "2026-10-09T20:00:00.000Z", replayed: true }; } });
});

test("unavailable impact preserves the discount and never enables deletion", async () => {
  await promotionScreen(async ({ click, row, container, button, deletions }) => {
    await click("Sil", row("Kampanya 1"));
    const dialog = container.querySelector('[role="dialog"]'); assert.ok(dialog);
    assert.equal(button("Sil", dialog).disabled, true); assert.equal(deletions.length, 0);
    await click("Vazgeç", dialog); assert.ok(row("Kampanya 1"));
  }, { impact: async () => { throw Error("promotion_unavailable"); } });
});

test("reload recovery remains reachable when the committed deletion no longer appears in the list", async () => {
  await promotionScreen(async ({ click, container, deletions }) => {
    assert.equal(container.querySelectorAll("tbody tr").length, 0);
    await click("Silmeyi doğrula"); await click("Silmeyi doğrula", container.querySelector('[role="dialog"]'));
    assert.deepEqual(deletions, [[record().id, 7]]);
    assert.equal(container.querySelector('[aria-label="Bekleyen silme doğrulamaları"]'), null);
    assert.match(container.textContent, /İndirim silindi/);
  }, { records: [], pendingDeletion: 7, impact: async () => { throw Error("not_found"); } });
});

test("lifecycle actions retain the record version, status semantics and current server filter after conflict", async () => {
  const active = record(1, { name: "Etkin kaydın süresi dolmuş", effectiveStatus: "ended" });
  const paused = record(2, { name: "İleri tarihli duraklatılmış", status: "paused", effectiveStatus: "paused", startsAt: "2099-01-01T00:00:00.000Z", version: 11 });
  await promotionScreen(async ({ click, row, mutations, reads, window }) => {
    await click("Aktif");
    await click("Duraklat", row(active.name));
    assert.deepEqual(mutations[0], [active.id, 7, "pause", "active"]);
    assert.deepEqual(reads.at(-1), { effectiveStatuses: ["active"] });
    await click("Devam ettir", row(paused.name));
    assert.deepEqual(mutations[1], [paused.id, 11, "resume", "scheduled"]);
    window.confirm = () => false; await click("Arşivle", row(active.name)); assert.equal(mutations.length, 2);
    window.confirm = () => true; await click("Arşivle", row(active.name));
    assert.deepEqual(mutations[2], [active.id, 7, "archive", "active"]);
  }, { records: [active, paused], lifecycle: async () => ({ kind: "version_conflict", current: { version: 12 } }) });
});

test("code duplication requires a replacement code and keeps the original expected version", async () => {
  const item = record(1, { name: "Kodlu kampanya", triggerKind: "code", activeCodeCount: 2 });
  await promotionScreen(async ({ click, row, window, duplicates, container }) => {
    window.prompt = () => null; await click("Çoğalt", row(item.name)); assert.equal(duplicates.length, 0);
    window.prompt = () => "   "; await click("Çoğalt", row(item.name)); assert.equal(duplicates.length, 0);
    assert.match(container.textContent, /yeni bir kupon kodu gerekir/);
    window.prompt = () => "BAHAR2027"; await click("Çoğalt", row(item.name));
    assert.deepEqual(duplicates, [[item.id, 7, `${item.name} — Kopya`, ["BAHAR2027"]]]);
  }, { records: [item] });
});

test("overview failure can retry independently while the loaded campaign list stays usable", async () => {
  await promotionScreen(async ({ click, container, reads, summaries }) => {
    assert.match(container.textContent, /Özet yüklenemedi/);
    assert.equal(container.querySelectorAll("tbody tr").length, 1);
    await click("Yeniden dene");
    assert.doesNotMatch(container.textContent, /Özet yüklenemedi/);
    assert.deepEqual(reads, [{}]); assert.deepEqual(summaries, [30, 30]);
  }, { overview: async (days, attempt) => { if (attempt === 1) throw Error("overview unavailable"); return overview(days); } });
});
test('historical deleted wheel rewards show truthful source counts and no ordinary coupon mutation actions',async()=>{await promotionScreen(async({container})=>{const row=container.querySelector('tbody tr')!;assert.match(row.textContent,/Kaynak: Şans Çarkı/);assert.match(row.textContent,/4 dağıtıldı · 2 kullanıldı/);assert.match(row.textContent,/silindi/);assert.ok(!Array.from(row.querySelectorAll('button')).some((b:any)=>['Sil','Arşivle','Çoğalt','Duraklat'].includes(b.textContent?.trim())));assert.equal(row.querySelector('a[href$="/edit"]'),null)},{managedSources:[{promotionId:record().id,campaignId:record(2).id,campaignName:'Önceki çark',issued:4,used:2,deleted:true}]})});
