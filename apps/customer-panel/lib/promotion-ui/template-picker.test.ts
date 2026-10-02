import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { compile, input, mounted } from "../mira-final-test-support.ts";
import { PROMOTION_TEMPLATES } from "./model.ts";

const { PromotionTemplatePicker } = compile("components/promotions/PromotionTemplatePicker.tsx");

function templateButtons(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.querySelector("svg[data-promotion-illustration]"));
}

function assertArtwork(button: HTMLButtonElement, id: string) {
  const artwork = button.querySelector("svg[data-promotion-illustration]");
  assert.ok(artwork, `${id} has a native SVG illustration`);
  assert.equal(artwork.getAttribute("data-promotion-illustration"), id);
  assert.equal(artwork.getAttribute("aria-hidden"), "true");
  assert.equal(artwork.getAttribute("focusable"), "false");
  assert.equal(button.querySelector("img"), null, "template illustrations do not load raster images");
}

test("all twelve native template buttons preserve their callback IDs and decorative artwork", async () => {
  const selected: string[] = [];
  await mounted(PromotionTemplatePicker, { templates: PROMOTION_TEMPLATES, onSelect: (id: string) => selected.push(id) }, async (host: HTMLElement, window) => {
    const buttons = templateButtons(host);
    assert.equal(buttons.length, 12);
    assert.equal(host.querySelector('[role="status"]')?.textContent, "12 şablon");
    for (const [index, item] of PROMOTION_TEMPLATES.entries()) {
      const button = buttons[index]!;
      assert.equal(button.type, "button");
      assert.equal(button.tabIndex, 0, "native choices remain keyboard focusable");
      assert.ok(button.textContent?.includes(item.title));
      assertArtwork(button, item.id);
      button.focus();
      assert.equal(window.document.activeElement, button);
      await act(async () => button.click());
    }
    assert.deepEqual(selected, PROMOTION_TEMPLATES.map((item) => item.id));
  });
});

test("Turkish search keeps the matched template artwork and callback identity", async () => {
  const selected: string[] = [];
  await mounted(PromotionTemplatePicker, { templates: PROMOTION_TEMPLATES, onSelect: (id: string) => selected.push(id) }, async (host: HTMLElement, window) => {
    const search = host.querySelector<HTMLInputElement>('input[type="search"]');
    assert.ok(search);
    for (const [query, id] of [
      ["KARGO", "free_shipping"],
      ["HEDİYE", "gift"],
      ["İLK ALIŞVERİŞ", "first_paid_order_percentage"],
    ] as const) {
      await input(window, search, query);
      const buttons = templateButtons(host);
      assert.equal(buttons.length, 1, query);
      assert.equal(host.querySelector('[role="status"]')?.textContent, "1 şablon");
      assertArtwork(buttons[0]!, id);
      await act(async () => buttons[0]!.click());
      assert.equal(selected.at(-1), id);
    }
    const clear = host.querySelector<HTMLButtonElement>('button[aria-label="Aramayı temizle"]');
    assert.ok(clear);
    clear.focus();
    assert.equal(window.document.activeElement, clear);
    await act(async () => clear.click());
    assert.equal(search.value, "");
    assert.equal(window.document.activeElement, search, "toolbar clear returns keyboard focus to the stable search field");
    assert.equal(templateButtons(host).length, 12);
  });
});

test("no-match search offers a clear action that restores every template without selecting one", async () => {
  const selected: string[] = [];
  await mounted(PromotionTemplatePicker, { templates: PROMOTION_TEMPLATES, onSelect: (id: string) => selected.push(id) }, async (host: HTMLElement, window) => {
    const search = host.querySelector<HTMLInputElement>('input[type="search"]');
    assert.ok(search);
    await input(window, search, "eşleşmeyen-şablon-zz");
    assert.equal(templateButtons(host).length, 0);
    assert.equal(host.querySelector('[role="status"]')?.textContent, "0 şablon");
    assert.ok(host.textContent?.includes("Eşleşen şablon yok"));
    const clear = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Aramayı temizle");
    assert.ok(clear, "empty search has its own recovery action");
    clear.focus();
    assert.equal(window.document.activeElement, clear);
    await act(async () => clear.click());
    assert.equal(search.value, "");
    assert.equal(window.document.activeElement, search, "empty-state clear keeps focus on the restored search workflow");
    assert.equal(templateButtons(host).length, 12);
    assert.equal(host.querySelector('[role="status"]')?.textContent, "12 şablon");
    assert.equal(host.textContent?.includes("Eşleşen şablon yok"), false);
    assert.deepEqual(selected, []);
  });
});
