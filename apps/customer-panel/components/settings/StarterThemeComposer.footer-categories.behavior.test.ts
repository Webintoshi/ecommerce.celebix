import assert from "node:assert/strict";
import test from "node:test";
import React, { type ReactNode } from "react";
import type { CatalogCategory, StarterThemeComposition } from "@celebix/saas-contracts";
import * as composerModel from "../../lib/starter-theme-composer-model.ts";
import { compile, DESIGN, withEditor } from "./design/design-editor-test-utils.ts";

const CATEGORY = "50000000-0000-4000-8000-000000000001";
const SECOND_CATEGORY = "50000000-0000-4000-8000-000000000002";
const categories: readonly CatalogCategory[] = [
  { id: CATEGORY, name: "Kolyeler", slug: "kolyeler", position: 0, depth: 1, status: "active", version: 1, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" },
  { id: SECOND_CATEGORY, name: "Bileklikler", slug: "bileklikler", position: 1, depth: 1, status: "active", version: 1, createdAt: "2026-09-26T00:00:00.000Z", updatedAt: "2026-09-26T00:00:00.000Z" },
];

test("a fresh footer editor can change existing category links and add category links without loading products or assets", async () => withEditor(async ({ container, render, change }) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("footer must not load unrelated assets"); };
  const { StarterThemeComposer } = compile<{ StarterThemeComposer(props: Record<string, unknown>): ReactNode }>(new URL("./StarterThemeComposer.tsx", import.meta.url), {
    "@/lib/catalog-onboarding-ui/client": { catalogOnboardingClient: { listCategories: async () => categories } },
    "@/lib/catalog-ui/client": { catalogApi: { listProducts: async () => { throw new Error("footer must not load products"); } } },
    "@/lib/merchant-admin-ui/client": { merchantAdminApi: { records: async () => [] } },
    "@/lib/starter-theme-composer-model": composerModel,
  });
  let value: StarterThemeComposition = { ...DESIGN.composition, footer: { ...DESIGN.composition.footer, groups: [
    { heading: "Kategoriler", links: [{ kind: "category", categoryId: CATEGORY }] },
    { heading: "Mağaza", links: [{ kind: "system", destination: "/products" }] },
  ] } };
  const writes: StarterThemeComposition[] = [];
  const draw = () => render(React.createElement(StarterThemeComposer, { activePanel: "footer", canManage: true, showPreview: false, value, onChange: (next: StarterThemeComposition) => { value = next; writes.push(next); } }));
  try {
    await draw();
    await React.act(async () => { await Promise.resolve(); await Promise.resolve(); });
    assert.equal(container.querySelector('[role="alert"]'), null);
    assert.equal(writes.length, 0, "opening footer must preserve the design");
    const existingCategory = [...container.querySelectorAll("label")].find(label => label.firstChild?.textContent === "Kategori")?.querySelector("select");
    assert.ok(existingCategory);
    assert.equal(existingCategory.value, CATEGORY);
    assert.deepEqual([...existingCategory.options].map(option => option.textContent), ["Kolyeler", "Bileklikler"]);
    await change(existingCategory, SECOND_CATEGORY);
    await draw();
    assert.deepEqual(value.footer.groups[0]?.links, [{ kind: "category", categoryId: SECOND_CATEGORY }]);
    const types = [...container.querySelectorAll("label")].filter(label => label.firstChild?.textContent === "Bağlantı türü").map(label => label.querySelector("select")!);
    assert.equal(types[1]?.querySelector<HTMLOptionElement>('option[value="category"]')?.disabled, false);
    await change(types[1]!, "category");
    assert.deepEqual(value.footer.groups[1]?.links, [{ kind: "category", categoryId: CATEGORY }]);
    assert.equal(writes.length, 2);
  } finally { globalThis.fetch = previousFetch; }
}));
