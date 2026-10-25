import assert from "node:assert/strict";
import { act } from "react";
import type { Window } from "happy-dom";

/** Controlled geometry for actual dnd-kit sensors in the local happy-dom fixture. */
export function installCatalogSortRects(browser: Window, container: HTMLElement, layout: "grid" | "list" = "grid") {
  const prototype = browser.HTMLElement.prototype;
  const previous = Object.getOwnPropertyDescriptor(prototype, "getBoundingClientRect");
  Object.defineProperty(prototype, "getBoundingClientRect", { configurable: true, value: function (this: HTMLElement) {
    const item = this.closest("[data-sort-id]");
    const items = [...container.querySelectorAll("[data-sort-id]")];
    const index = item ? items.indexOf(item) : -1;
    const left = index >= 0 && layout === "grid" ? (index % 2) * 120 : 0;
    const top = index < 0 ? 0 : (layout === "grid" ? Math.floor(index / 2) : index) * 120;
    const width = index < 0 ? 800 : 100, height = index < 0 ? 800 : 100;
    return { left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON() {} };
  } });
  return () => previous ? Object.defineProperty(prototype, "getBoundingClientRect", previous) : Reflect.deleteProperty(prototype, "getBoundingClientRect");
}

function item(container: HTMLElement, id: string) {
  const found = [...container.querySelectorAll<HTMLElement>("[data-sort-id]")].find(node => node.getAttribute("data-sort-id") === id);
  assert.ok(found, `sortable fixture item exists: ${id}`);
  return found;
}

async function mouse(browser: Window, type: string, x: number, y: number, target?: Element) {
  await act(async () => (target ?? browser.document).dispatchEvent(new browser.MouseEvent(type, {
    bubbles: true, cancelable: true, button: 0, buttons: type === "mouseup" ? 0 : 1, clientX: x, clientY: y,
  }) as never));
}

export async function beginCatalogMouseDrag(browser: Window, container: HTMLElement, sourceId: string) {
  const source = item(container, sourceId);
  const handle = source.querySelector('button[aria-roledescription="Sıralanabilir öğe"]');
  assert.ok(handle, "sortable grip uses the shared handle properties");
  const rect = source.getBoundingClientRect(), x = rect.left + 30, y = rect.top + 30;
  await mouse(browser, "mousedown", x, y, handle);
  await mouse(browser, "mousemove", x + 8, y);
}

export async function hoverCatalogMouseDrag(browser: Window, container: HTMLElement, targetId: string) {
  const rect = item(container, targetId).getBoundingClientRect();
  await mouse(browser, "mousemove", rect.left + 30, rect.top + 30);
}

export async function dropCatalogMouseDrag(browser: Window, container: HTMLElement, targetId: string) {
  const rect = item(container, targetId).getBoundingClientRect();
  await mouse(browser, "mousemove", rect.left + 30, rect.top + 30);
  await mouse(browser, "mouseup", rect.left + 30, rect.top + 30);
}

export async function dragCatalogItem(browser: Window, container: HTMLElement, sourceId: string, targetId: string) {
  await beginCatalogMouseDrag(browser, container, sourceId);
  await dropCatalogMouseDrag(browser, container, targetId);
}

export async function catalogSortKey(browser: Window, code: string, target?: Element) {
  await act(async () => (target ?? browser.document).dispatchEvent(new browser.KeyboardEvent("keydown", {
    bubbles: true, cancelable: true, code, key: code === "Space" ? " " : code,
  }) as never));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1)); });
}
