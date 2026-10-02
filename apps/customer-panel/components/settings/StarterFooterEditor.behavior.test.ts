import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { createDefaultStarterThemeComposition, type CatalogCategory, type MerchantAdminRecord, type StarterFooterConfig, type StorefrontDesignDestinationOption } from "@celebix/saas-contracts";
import { compile, withEditor } from "./design/design-editor-test-utils.ts";
import { STARTER_SOCIAL_NETWORK_OPTIONS } from "./starter-footer-social.ts";

type FooterProps = Readonly<{ categories: readonly CatalogCategory[]; collections?: readonly StorefrontDesignDestinationOption[]; disabled: boolean; pages: readonly MerchantAdminRecord[]; value: StarterFooterConfig; update(value: StarterFooterConfig): void }>;
const { StarterFooterEditor } = compile<{ StarterFooterEditor: React.ComponentType<FooterProps> }>(new URL("./StarterFooterEditor.tsx", import.meta.url));
const CATEGORY = "50000000-0000-4000-8000-000000000001", COLLECTION = "50000000-0000-4000-8000-000000000002", PAGE = "50000000-0000-4000-8000-000000000003";
const BASE: StarterFooterConfig = {
  ...createDefaultStarterThemeComposition().footer,
  groups: [{ heading: "Keşfet", links: [{ kind: "category", categoryId: CATEGORY }, { kind: "catalog_collection", resourceId: COLLECTION }, { kind: "page", pageId: PAGE }, { kind: "system", destination: "/favorites" }] }, { heading: "Bilgi", links: [{ kind: "fixed_policy", policyKey: "kvkk" }] }],
  social: [],
};

function controlled(initial: StarterFooterConfig = BASE, disabled = false) {
  let current = initial;
  const changes: StarterFooterConfig[] = [];
  function Editor() {
    const [value, setValue] = React.useState(initial); current = value;
    return React.createElement(StarterFooterEditor, { value, disabled,
      categories: [{ id: CATEGORY, name: "Kolyeler", slug: "kolyeler", position: 0, depth: 0, status: "active", version: 1, createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" }],
      collections: [{ kind: "catalog_collection", resourceId: COLLECTION, label: "Yaz seçkisi", path: "/collections/yaz" }],
      pages: [{ id: PAGE, name: "Hakkımızda", kind: "page", config: { slug: "hakkimizda" }, status: "active", version: 1, createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" }],
      update: next => { changes.push(next); setValue(next); },
    });
  }
  return { Editor, changes, get value() { return current; } };
}
function field<T extends HTMLInputElement | HTMLSelectElement>(container: HTMLElement, label: string): T {
  const match = Array.from(container.querySelectorAll("label")).find(item => item.firstChild?.textContent?.trim() === label);
  assert.ok(match, label); return match.querySelector("input,select")! as T;
}
function addButton(container: HTMLElement) { return Array.from(container.querySelectorAll("button")).find(item => item.textContent?.trim() === "Sosyal profil ekle")!; }

test("social account entry uses human network names and adds all six safe profile kinds without showing addresses", async () => withEditor(async ({ container, render, change, click }) => {
  const editor = controlled(); await render(React.createElement(editor.Editor));
  const network = field<HTMLSelectElement>(container, "Ağ"), account = field<HTMLInputElement>(container, "Hesap adı");
  assert.deepEqual(Array.from(network.options).map(item => item.textContent), STARTER_SOCIAL_NETWORK_OPTIONS.map(item => item.label));
  for (const option of STARTER_SOCIAL_NETWORK_OPTIONS) {
    await change(network, option.value); await change(account, "@magazam"); await click(addButton(container));
    const saved = editor.value.social.find(item => item.network === option.value)!;
    assert.equal(saved.url, `https://www.${option.value}.com/${option.value === "youtube" || option.value === "tiktok" ? "@" : ""}magazam`);
    assert.equal(account.value, ""); assert.doesNotMatch(container.textContent ?? "", /https?:\/\//);
  }
  assert.equal(editor.value.social.length, 6); assert.equal(addButton(container).disabled, true);
  assert.deepEqual(editor.value.groups, BASE.groups);
}));

test("a pasted legacy profile becomes an account label while retaining its exact URL", async () => withEditor(async ({ window, container, render, change, click }) => {
  const editor = controlled(); await render(React.createElement(editor.Editor));
  await change(field<HTMLSelectElement>(container, "Ağ"), "youtube");
  const account = field<HTMLInputElement>(container, "Hesap adı"), url = "https://youtube.com/c/LegacyShop/";
  await change(account, "old-input");
  const clipboard = new window.DataTransfer(); clipboard.setData("text", url);
  const paste = new window.ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard });
  await React.act(async () => { account.dispatchEvent(paste as unknown as Event); });
  assert.equal(paste.defaultPrevented, true); assert.equal(account.value, "LegacyShop");
  assert.doesNotMatch(container.textContent ?? "", /https?:\/\//);
  await click(addButton(container)); assert.deepEqual(editor.value.social, [{ network: "youtube", url }]);
  assert.match(container.textContent ?? "", /YouTubeLegacyShop/);
}));

test("unsafe and mismatched pasted profiles preserve input, report an accessible error and never add a profile", async () => withEditor(async ({ container, render, change, click }) => {
  const editor = controlled(); await render(React.createElement(editor.Editor));
  const account = field<HTMLInputElement>(container, "Hesap adı"); await change(account, "preserved");
  for (const url of ["http://www.instagram.com/shop", "https://www.youtube.com/shop", "https://user:secret@www.instagram.com/shop", "https://www.instagram.com/shop?q=1", "https://www.instagram.com/shop#profile"]) {
    await change(account, url); await click(addButton(container));
    assert.equal(account.value, "preserved"); assert.equal(account.getAttribute("aria-invalid"), "true");
    assert.equal(account.getAttribute("aria-describedby"), container.querySelector('[role="alert"]')?.id);
    assert.equal(editor.changes.length, 0); assert.doesNotMatch(container.textContent ?? "", /https?:\/\//);
  }
  await change(account, "valid"); await click(addButton(container)); assert.equal(editor.value.social[0]?.url, "https://www.instagram.com/valid");
  await change(account, "another"); await click(addButton(container)); assert.equal(editor.value.social.length, 1); assert.match(container.textContent ?? "", /Bu sosyal ağ zaten eklendi/);
}));

test("existing profile URLs survive unrelated footer edits and removal remains available", async () => withEditor(async ({ container, render, change, click }) => {
  const initial: StarterFooterConfig = { ...BASE, social: [{ network: "instagram", url: "https://instagram.com/saved/" }, { network: "youtube", url: "https://www.youtube.com/channel/UC_saved" }] };
  const editor = controlled(initial); await render(React.createElement(editor.Editor));
  assert.match(container.textContent ?? "", /Instagramsaved/); assert.match(container.textContent ?? "", /YouTubeKayıtlı hesap/); assert.doesNotMatch(container.textContent ?? "", /https?:\/\/|UC_saved/);
  await change(field<HTMLSelectElement>(container, "Footer tonu"), "dark");
  await change(field<HTMLInputElement>(container, "Grup başlığı"), "Yeni keşif");
  await change(field<HTMLSelectElement>(container, "Politika"), "privacy_security");
  assert.deepEqual(editor.value.social, initial.social);
  assert.deepEqual(editor.value.groups[0]?.links, initial.groups[0]?.links);
  assert.deepEqual(editor.value.groups[1]?.links, [{ kind: "fixed_policy", policyKey: "privacy_security" }]);
  assert.deepEqual(editor.value.newsletter, initial.newsletter);
  await click(container.querySelector('[aria-label="Instagram profilini kaldır"]')!);
  assert.deepEqual(editor.value.social, [initial.social[1]]);
}));

test("read-only footer social fields block account changes, addition and removal", async () => withEditor(async ({ container, render, change, click }) => {
  const editor = controlled({ ...BASE, social: [{ network: "instagram", url: "https://instagram.com/saved" }] }, true);
  await render(React.createElement(editor.Editor));
  const account = field<HTMLInputElement>(container, "Hesap adı"); assert.equal(account.disabled, true); assert.equal(field<HTMLSelectElement>(container, "Ağ").disabled, true);
  await change(account, "attempt"); await click(addButton(container)); await click(container.querySelector('[aria-label="Instagram profilini kaldır"]')!);
  assert.equal(editor.changes.length, 0); assert.equal(editor.value.social[0]?.url, "https://instagram.com/saved");
}));
