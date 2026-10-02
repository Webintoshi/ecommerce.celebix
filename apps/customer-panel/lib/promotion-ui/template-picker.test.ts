import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { compile, mounted } from "../mira-final-test-support.ts";
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
    assert.equal(host.querySelector('[role="status"]'), null);
    assert.equal(host.querySelector('input[type="search"]'), null);
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
