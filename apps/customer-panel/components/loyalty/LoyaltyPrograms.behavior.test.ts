import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compile, mounted, click, input } from "../../lib/mira-final-test-support.ts";
import { createLoyaltyDraft, loyaltyConfigFor } from "./model.ts";
import { LoyaltyRequestError } from "./client.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const config = loyaltyConfigFor(createLoyaltyDraft("spend_discount"), "Europe/Istanbul");
const program = { id: ID, name: "Harcama ödülü", status: "active", version: 1, config, createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z" };
const chrome = {
  "../panel/PanelPageShell": { PanelPageHeader: () => null, PanelStatusBadge: ({ children }: any) => React.createElement("span", null, children) },
  "../panel/PanelInitialDataGate": { PanelInitialDataGate: ({ children }: any) => children },
  "../promotions/PromotionTargetPicker": { PromotionPicker: () => null },
};
function client(extra: Record<string, unknown> = {}) { return { listLoyaltyPrograms: async () => ({ programs: [program] }), pendingLoyaltyOperation: () => null, loyaltyError: () => "Kaydedilemedi. Bilgiler korunuyor.", LoyaltyRequestError, LOYALTY_PENDING_EVENT: "pending-test", ...extra }; }
test("four ready templates preserve distinct goals without adding a membership tier", async () => {
  const { LoyaltyTemplatePicker } = compile("components/loyalty/LoyaltyPrograms.tsx", { ...chrome, "./client": client() });
  const selected: string[] = [];
  await mounted(LoyaltyTemplatePicker, { onSelect: (id: string) => selected.push(id) }, async host => {
    const buttons = [...host.querySelectorAll("button")]; assert.equal(buttons.length, 4);
    for (const button of buttons) await act(async () => button.click());
    assert.deepEqual(selected, ["product_gift", "purchase_gift", "spend_discount", "purchase_shipping"]);
  });
});
test("three-step editor submits an active program directly and preserves the form after a failed save", async () => {
  const writes: Array<{ action: string; payload: any }> = [];
  const { LoyaltyProgramEditor } = compile("components/loyalty/LoyaltyEditor.tsx", { ...chrome, "./client": client({ mutateLoyaltyProgram: async (action: string, payload: any) => { writes.push({ action, payload }); throw new Error("connection"); } }) });
  await mounted(LoyaltyProgramEditor, { timezone: "Europe/Istanbul", canManage: true, canPublish: true }, async (host, window) => {
    await act(async () => [...host.querySelectorAll("button")].find((button: any) => button.textContent.includes("Harcama hedefine ulaş"))!.click());
    await input(window, host.querySelector('input[maxlength="120"]'), "Tekrar alışveriş");
    await click(host, "Devam et"); assert.match(host.textContent, /Kullanım koşulları/);
    await click(host, "Devam et"); assert.match(host.textContent, /Önizleme ve başlatma/); assert.match(host.textContent, /150,00/);
    await act(async () => host.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    assert.equal(writes.length, 1); assert.equal(writes[0].action, "save"); assert.equal(writes[0].payload.name, "Tekrar alışveriş"); assert.equal(writes[0].payload.enabled, true);
    assert.equal(writes[0].payload.config.target, 200000); assert.equal(writes[0].payload.config.reward.amountMinor, 15000);
    assert.match(host.textContent, /Bilgiler korunuyor/); await click(host, "Geri"); await click(host, "Geri"); assert.equal(host.querySelector('input[maxlength="120"]').value, "Tekrar alışveriş");
  });
});
test("read-only access can inspect all conditions and preview without offering a save", async () => {
  let writes = 0;
  const { LoyaltyProgramEditor } = compile("components/loyalty/LoyaltyEditor.tsx", { ...chrome, "./client": client({ mutateLoyaltyProgram: async () => { writes++; } }) });
  await mounted(LoyaltyProgramEditor, { programId: ID, timezone: "Europe/Istanbul", canManage: false, canPublish: false }, async host => {
    assert.equal(host.querySelector("fieldset").disabled, true); await click(host, "Devam et"); await click(host, "Devam et");
    assert.ok(![...host.querySelectorAll("button")].some((button: any) => /kaydet|başlat/i.test(button.textContent))); assert.equal(writes, 0);
  });
});
