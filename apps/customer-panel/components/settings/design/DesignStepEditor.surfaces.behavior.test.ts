import assert from "node:assert/strict";
import test from "node:test";
import React, { type ReactNode } from "react";
import type { StorefrontDesignDocument } from "@celebix/saas-contracts";
import { compile, DESIGN, withEditor } from "./design-editor-test-utils.ts";

const { DesignStepEditor } = compile<{ DesignStepEditor: (props: Record<string, unknown>) => ReactNode }>(new URL("./DesignStepEditor.tsx", import.meta.url), {
  "@/components/settings/StarterThemeComposer": { StarterThemeComposer: ({ activePanel, showAnnouncement }: { activePanel: string; showAnnouncement: boolean }) => React.createElement("section", { "data-composer-panel": activePanel, "data-composer-announcement": String(showAnnouncement), "aria-label": "Theme composer fixture" }, showAnnouncement ? "Composer announcement" : "Header controls") },
  "@/components/settings/StorefrontAssetManager": { StorefrontAssetManager: () => React.createElement("div", { "data-asset-manager": true }) },
});
const props = { step: "navigation", storeName: "Fixture", timezone: "UTC", media: [], assets: [], destinations: [], canManage: true, previewMode: "desktop", onUpload: async () => { throw new Error("unexpected upload"); } };

test("announcement surface renders one focused inspector and uses composition announcement content", async () => withEditor(async ({ container, render }) => {
  const changes: StorefrontDesignDocument[] = [];
  const design = { ...DESIGN, announcement: { ...DESIGN.announcement, items: ["Legacy content"] }, composition: { ...DESIGN.composition, announcement: { ...DESIGN.composition.announcement, enabled: true, items: ["Composition content"] } } };
  await render(React.createElement(DesignStepEditor, { ...props, surface: "announcement", design, onChange: (next: StorefrontDesignDocument) => changes.push(next) }));
  assert.equal(container.querySelectorAll("textarea").length, 1);
  assert.equal(container.querySelector("textarea")?.value, "Composition content");
  assert.equal(container.querySelector('[data-composer-panel]'), null);
  assert.equal(Array.from(container.querySelectorAll("summary")).some(summary => summary.textContent === "Duyuru şeridi"), false);
  assert.deepEqual(changes, []);
}));

test("navigation surface has header controls without a duplicated announcement editor", async () => withEditor(async ({ container, render }) => {
  const changes: StorefrontDesignDocument[] = [];
  await render(React.createElement(DesignStepEditor, { ...props, surface: "navigation", design: DESIGN, onChange: (next: StorefrontDesignDocument) => changes.push(next) }));
  assert.equal(container.querySelectorAll('[data-composer-panel="navigation"]').length, 1);
  assert.equal(container.querySelector('[data-composer-panel]')?.getAttribute("data-composer-announcement"), "false");
  assert.equal(container.querySelector("textarea"), null);
  assert.doesNotMatch(container.textContent ?? "", /Duyuru metni|Duyuru şeridi|Composer announcement/);
  assert.deepEqual(changes, []);
}));

test("legacy navigation step keeps its announcement editor reachable in advanced disclosure", async () => withEditor(async ({ container, render, click, change }) => {
  const changes: StorefrontDesignDocument[] = [];
  await render(React.createElement(DesignStepEditor, { ...props, design: DESIGN, onChange: (next: StorefrontDesignDocument) => changes.push(next) }));
  assert.equal(container.querySelector('[data-composer-panel]')?.getAttribute("data-composer-announcement"), "false");
  const summary = Array.from(container.querySelectorAll("summary")).find(element => element.textContent === "Duyuru şeridi");
  assert.ok(summary);
  const disclosure = summary.parentElement as HTMLDetailsElement;
  assert.equal(disclosure.open, false);
  await click(summary);
  assert.equal(disclosure.open, true);
  const input = disclosure.querySelector<HTMLTextAreaElement>("textarea");
  assert.ok(input);
  await change(input, "Yeni duyuru");
  assert.deepEqual(changes.at(-1)?.composition.announcement.items, ["Yeni duyuru"]);
  assert.deepEqual(changes.at(-1)?.announcement.items, ["Yeni duyuru"]);
}));

test("invalid announcement text blocks Apply while keeping the visible buffer and last valid design", async () => withEditor(async ({ container, render, change }) => {
  const writes: StorefrontDesignDocument[] = [];
  function Editor() {
    const [design, setDesign] = React.useState(DESIGN);
    const [invalid, setInvalid] = React.useState(false);
    return React.createElement(React.Fragment, null,
      React.createElement(DesignStepEditor, { ...props, surface: "announcement", design, onChange: (next: StorefrontDesignDocument) => { writes.push(next); setDesign(next); }, onValidationChange: setInvalid }),
      React.createElement("button", { disabled: invalid, "data-apply": true }, "Uygula"));
  }
  await render(React.createElement(Editor));
  const input = container.querySelector("textarea"); assert.ok(input);
  await change(input, "Geçerli değişiklik");
  assert.deepEqual(writes.at(-1)?.composition.announcement.items, ["Geçerli değişiklik"]);
  await change(input, "");
  assert.equal(input.value, "");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(container.querySelector<HTMLButtonElement>("[data-apply]")?.disabled, true);
  assert.deepEqual(writes.at(-1)?.composition.announcement.items, ["Geçerli değişiklik"]);
  await change(input, "Düzeltilmiş duyuru");
  assert.equal(container.querySelector<HTMLButtonElement>("[data-apply]")?.disabled, false);
  assert.equal(input.getAttribute("aria-invalid"), "false");
  assert.deepEqual(writes.at(-1)?.composition.announcement.items, ["Düzeltilmiş duyuru"]);
  assert.equal(writes.length, 2);
}));

test("an invalid campaign schedule blocks Apply until the date order is corrected", async () => withEditor(async ({ container, render, change }) => {
  const writes: StorefrontDesignDocument[] = [];
  function Editor() {
    const [design, setDesign] = React.useState<StorefrontDesignDocument>({ ...DESIGN, promotion: { ...DESIGN.promotion, startsAt: "2026-09-26T09:00:00.000Z", endsAt: "2026-09-26T15:00:00.000Z" } });
    const [invalid, setInvalid] = React.useState(false);
    return React.createElement(React.Fragment, null,
      React.createElement(DesignStepEditor, { ...props, step: "homepage", design, onChange: (next: StorefrontDesignDocument) => { writes.push(next); setDesign(next); }, onValidationChange: setInvalid }),
      React.createElement("button", { disabled: invalid, "data-apply": true }, "Uygula"));
  }
  await render(React.createElement(Editor));
  const end = container.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]')[1]; assert.ok(end);
  await change(end, "2026-09-26T08:00");
  assert.equal(container.querySelector<HTMLButtonElement>("[data-apply]")?.disabled, true);
  assert.match(container.querySelector('[role="alert"]')?.textContent ?? "", /Bitiş başlangıçtan önce/);
  assert.equal(writes.length, 0);
  await change(end, "2026-09-26T16:00");
  assert.equal(container.querySelector<HTMLButtonElement>("[data-apply]")?.disabled, false);
  assert.equal(container.querySelector('[role="alert"]'), null);
  assert.equal(writes.at(-1)?.promotion.endsAt, "2026-09-26T16:00:00.000Z");
}));
