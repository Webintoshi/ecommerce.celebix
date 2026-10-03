import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "../../../storefront-shared/components/product-variant-media-test-utils.ts";

const config = { schemaVersion: 1, enabled: false, title: "Stok gelince haber ver", buttonLabel: "Bana haber ver" };
const now = "2026-10-03T10:00:00.000Z";
const record = { id: "20700000-0000-4000-8000-000000000001", kind: "restock_alerts", name: "Stok gelince haber ver", status: "active", config, version: 2, createdAt: now, updatedAt: now };
const stats = { awaitingConfirmation: 1, pendingConfirmed: 2, sent: 3, failed: 0, recent: [] };
class ApiError extends Error { constructor(readonly code: string) { super(code); } }
type Options = { canManage?: boolean; records?: () => Promise<any[]>; save?: (...args: any[]) => Promise<any>; statsFetch?: () => Promise<Response> };
async function screen(options: Options, run: (screen: any) => Promise<void>) {
  const reads: string[] = [], writes: any[] = [], transitions: boolean[] = [];
  const load = componentLoader({ "lucide-react": new Proxy({}, { get: () => () => null }), "@/lib/merchant-admin-ui/client": { MerchantAdminApiError: ApiError, merchantAdminApi: {
    records: async (kind: string) => { reads.push(kind); return options.records ? options.records() : [record]; },
    save: async (...args: any[]) => { writes.push(args); return options.save ? options.save(...args) : { id: record.id, status: "active", version: 3, updatedAt: now }; },
  } } });
  const { RestockTool: Tool } = load<any>(new URL("./RestockTool.tsx", import.meta.url));
  await withProductBrowser(async browser => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => options.statsFetch ? options.statsFetch() : Response.json(stats);
    const settle = async () => { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
    try {
      await browser.render(React.createElement(Tool, { canManage: options.canManage ?? true, onOpenChange: (open: boolean) => transitions.push(open) }));
      await settle();
      const submit = async () => { await React.act(async () => { browser.container.querySelector("form")?.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); }); await settle(); };
      await run({ ...browser, reads, writes, transitions, settle, submit, open: () => browser.click('[data-tool-edit="restock_alerts"]') });
    } finally { globalThis.fetch = previousFetch; }
  });
}

test("restock dirty cancel requires a decision and failed Apply preserves inputs and retry key", async () => {
  await screen({ save: async () => { throw Error("network"); } }, async ({ container, click, change, open, submit, writes }) => {
    await open(); await change('[name="restock-title"]', "Değişiklik"); await click("[data-restock-cancel]");
    assert.ok(container.querySelector("dialog[open][data-restock-dialog]"), "dirty input must not disappear on Cancel");
    await click("[data-restock-keep-editing]");
    assert.equal(container.querySelector('[name="restock-title"]').value, "Değişiklik");
    await click("[data-restock-cancel]"); await click("[data-restock-discard]"); await open();
    assert.equal(container.querySelector('[name="restock-title"]').value, config.title);
    await change('[name="restock-title"]', "Yeni başlık"); await submit();
    assert.equal(container.querySelector('[name="restock-title"]').value, "Yeni başlık"); assert.ok(container.querySelector('[role="alert"]'));
    await submit(); assert.equal(writes[0][2], writes[1][2]);
    await change('[name="restock-title"]', "Başka başlık"); await submit(); assert.notEqual(writes[1][2], writes[2][2]);
    assert.equal(writes[0][1].expectedVersion, 2);
  });
});

test("restock Escape protects a dirty draft, restores focus and beforeunload warns until discard", async () => {
  await screen({}, async ({ container, click, change, open, settle, writes, transitions }) => {
    await open(); await change('[name="restock-title"]', "Korunan taslak");
    const input = container.querySelector('[name="restock-title"]'); input.focus();
    await React.act(async () => input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))); await settle();
    assert.ok(container.querySelector("dialog[open][data-restock-dialog]")); await click("[data-restock-keep-editing]");
    assert.equal(window.document.activeElement, input); assert.equal(input.value, "Korunan taslak");
    const unload = new window.Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, true);
    await click("[data-restock-cancel]"); await click("[data-restock-discard]");
    assert.equal(container.querySelector("form"), null); assert.equal(window.document.activeElement, container.querySelector('[data-tool-edit="restock_alerts"]'));
    const safeUnload = new window.Event("beforeunload", { cancelable: true }); window.dispatchEvent(safeUnload); assert.equal(safeUnload.defaultPrevented, false);
    assert.deepEqual(transitions, [true, false]); assert.equal(writes.length, 0);
  });
});

test("restock successful save advances local CAS without reread and later edits use a new key", async () => {
  await screen({}, async ({ change, open, submit, reads, writes, container }) => {
    await open(); await change('[name="restock-title"]', "İlk değişiklik"); await submit();
    assert.equal(container.querySelector("form"), null); assert.equal(reads.length, 1); assert.equal(writes[0][1].expectedVersion, 2);
    await open(); await change('[name="restock-button"]', "Haber ver"); await submit();
    assert.equal(writes[1][1].expectedVersion, 3); assert.notEqual(writes[0][2], writes[1][2]);
    assert.deepEqual(Object.keys(writes[1][1].config).sort(), ["buttonLabel", "enabled", "schemaVersion", "title"]);
  });
});

test("restock conflict blocks apply and failed explicit reload preserves draft", async () => {
  let read = 0;
  await screen({ records: async () => { if (++read > 1) throw Error("read failed"); return [record]; }, save: async () => { throw new ApiError("version_conflict"); } }, async ({ open, change, submit, click, container, writes }) => {
    await open(); await change('[name="restock-title"]', "Çakışan taslak"); await submit();
    assert.equal(container.querySelector("[data-restock-apply]").disabled, true); await submit(); assert.equal(writes.length, 1);
    await click("[data-restock-reload]"); await click("[data-restock-keep-editing]"); assert.equal(read, 1);
    await click("[data-restock-reload]"); await click("[data-restock-discard]");
    assert.equal(container.querySelector('[name="restock-title"]').value, "Çakışan taslak");
    assert.match(container.textContent, /Güncel ayarlar yüklenemedi/); assert.equal(container.querySelector("[data-restock-apply]").disabled, true);
  });
});

test("restock readonly can inspect devices and refresh counts without saving", async () => {
  await screen({ canManage: false }, async ({ open, click, container, writes }) => {
    await open(); assert.equal(container.querySelector('[name="restock-title"]').closest('fieldset').disabled, true); assert.equal(container.querySelector("[data-restock-apply]"), null);
    await click('[data-restock-device="mobile"]'); assert.equal(container.querySelector("[data-restock-preview]").getAttribute("data-device"), "mobile");
    assert.equal(container.querySelector("[data-restock-preview] input").disabled, true); assert.equal(container.querySelector("[data-restock-preview] button[data-preview-submit]").disabled, true);
    await click("[data-restock-refresh]"); assert.equal(writes.length, 0); await click("[data-restock-cancel]"); assert.equal(container.querySelector("form"), null);
  });
});

test("restock stats errors have independent retry and do not erase settings", async () => {
  let count = 0;
  await screen({ statsFetch: async () => { if (++count === 1) return new Response(null, { status: 503 }); return Response.json(stats); } }, async ({ container, open, click, settle, writes }) => {
    assert.match(container.textContent, /Bildirim durumları yüklenemedi/); await click("[data-restock-stats-retry]"); await settle();
    assert.match(container.textContent, /Kapalı · 2 stok bekliyor · 3 gönderildi/);
    await open(); assert.equal(container.querySelector('[name="restock-title"]').value, config.title); assert.equal(writes.length, 0);
  });
});

test("restock pending overview read permits navigation and unloading", async () => {
  let resolveRead: (records: any[]) => void = () => {};
  const pendingRead = new Promise<any[]>(resolve => { resolveRead = resolve; });
  await screen({ records: () => pendingRead }, async ({ container, settle, writes }) => {
    assert.equal(container.querySelector('[data-tool-edit="restock_alerts"]'), null);
    const anchor = window.document.createElement("a"); anchor.href = "/settings/general"; anchor.textContent = "Diğer ayarlar"; container.append(anchor);
    const navigate = new window.MouseEvent("click", { bubbles: true, cancelable: true }); anchor.dispatchEvent(navigate);
    assert.equal(navigate.defaultPrevented, false, "initial read must not trap the user on the overview");
    const unload = new window.Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, false);
    resolveRead([record]); await settle(); assert.equal(writes.length, 0);
  });
});

test("restock pending apply blocks duplicate submit, draft edits, cancel and navigation", async () => {
  let rejectSave: (error: Error) => void = () => {};
  const pendingSave = new Promise((_resolve, reject) => { rejectSave = reject; });
  await screen({ save: () => pendingSave }, async ({ open, change, submit, click, container, writes, transitions, settle }) => {
    await open(); await change('[name="restock-title"]', "Korunan gönderim"); await submit();
    assert.equal(writes.length, 1); assert.equal(container.querySelector("[data-restock-apply]").disabled, true);
    assert.equal(container.querySelector('[name="restock-title"]').closest("fieldset").disabled, true);
    await submit(); await change('[name="restock-title"]', "Araya giren değişiklik"); await click("[data-restock-cancel]");
    assert.equal(writes.length, 1); assert.ok(container.querySelector("form")); assert.deepEqual(transitions, [true]);
    const anchor = window.document.createElement("a"); anchor.href = "/settings/general"; container.append(anchor);
    const navigate = new window.MouseEvent("click", { bubbles: true, cancelable: true }); anchor.dispatchEvent(navigate); assert.equal(navigate.defaultPrevented, true);
    const unload = new window.Event("beforeunload", { cancelable: true }); window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, true);
    rejectSave(Error("network")); await settle();
    assert.equal(container.querySelector('[name="restock-title"]').value, "Korunan gönderim");
    assert.equal(writes[0][1].config.title, "Korunan gönderim"); assert.ok(container.querySelector('[role="alert"]'));
  });
});
