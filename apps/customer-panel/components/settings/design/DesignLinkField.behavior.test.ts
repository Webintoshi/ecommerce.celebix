import assert from "node:assert/strict";
import test from "node:test";
import React, { type ReactNode } from "react";
import type { BannerDestination } from "@celebix/saas-contracts";
import { compile, withEditor } from "./design-editor-test-utils.ts";

const fields = compile<Record<string, (props: Record<string, unknown>) => ReactNode>>(new URL("./DesignLinkField.tsx", import.meta.url));
const destinations = [
  { kind: "collection", resourceId: "50000000-0000-4000-8000-000000000001", label: "Yaz", path: "/categories/yaz" },
  { kind: "catalog_collection", resourceId: "50000000-0000-4000-8000-000000000002", label: "Yaz", path: "/collections/yaz" },
  { kind: "page", resourceId: "50000000-0000-4000-8000-000000000003", label: "Hakkımızda", path: "/pages/hakkimizda" },
];

test("banner uses named store and resource destinations and retains an unknown saved route", async () => withEditor(async ({container, render, change}) => {
  let value: BannerDestination = { kind: "path", path: "/pages/old-campaign?source=hero" };
  let writes = 0;
  const draw = () => render(React.createElement(fields.DesignBannerLinkField!, { value, destinations, disabled: false, onChange: (next: BannerDestination) => { value = next; writes++; } }));
  await draw();
  const select = () => container.querySelector<HTMLSelectElement>("select")!;
  assert.equal(select().selectedOptions[0]?.textContent, "Mevcut bağlantı");
  assert.equal(writes, 0);
  assert.doesNotMatch(container.textContent ?? "", /\/pages\/|source=|50000000/);
  assert.equal(container.querySelector("input"), null);
  assert.deepEqual(Array.from(container.querySelectorAll("optgroup")).map(item => item.label), ["Mağaza sayfaları", "Kategoriler", "Koleksiyonlar", "Sayfalar"]);
  await change(select(), "path:/products"); await draw();
  assert.deepEqual(value, { kind: "path", path: "/products" });
  assert.equal(select().selectedOptions[0]?.textContent, "Ürünler");
  await change(select(), `catalog_collection:${destinations[1]!.resourceId}`); await draw();
  assert.deepEqual(value, { kind: "catalog_collection", resourceId: destinations[1]!.resourceId });
  await change(select(), "");
  assert.deepEqual(value, { kind: "none" });
}));

test("legacy known path receives a readable label and resource references stay intact in readonly mode", async () => withEditor(async ({container, render}) => {
  let writes = 0;
  await render(React.createElement(fields.DesignPathField!, { value: "/pages/odeme-teslimat", destinations, disabled: true, onChange: () => writes++ }));
  assert.equal(container.querySelector<HTMLSelectElement>("select")?.selectedOptions[0]?.textContent, "Ödeme ve Teslimat");
  assert.equal(container.querySelector<HTMLSelectElement>("select")?.disabled, true);
  assert.doesNotMatch(container.textContent ?? "", /\/pages\//);
  await render(React.createElement(fields.DesignResourceField!, { value: {kind: "product", resourceId: "50000000-0000-4000-8000-000000000099"}, destinations, disabled: true, onChange: () => writes++ }));
  assert.equal(container.querySelector<HTMLSelectElement>("select")?.selectedOptions[0]?.textContent, "Mevcut bağlantı");
  assert.equal(writes, 0);
}));
