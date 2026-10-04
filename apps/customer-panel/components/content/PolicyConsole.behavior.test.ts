import assert from "node:assert/strict";
import test from "node:test";

import { FIXED_STOREFRONT_POLICIES } from "@celebix/saas-contracts";
import { normalizeProductDescriptionRichText } from "@celebix/platform-config/src/product-description-rich-text.ts";
import type { StorePolicyAdminPage, StorePolicyStatus } from "@celebix/saas-data";
import { act, createElement, type ReactNode } from "react";
import type { Window } from "happy-dom";

import { compile, mounted, click } from "../../lib/mira-final-test-support.ts";
import { StorePolicyApiError } from "../../lib/store-policy-ui/client.ts";

const NOW = "2026-09-28T09:00:00.000Z";
type SaveInput = Readonly<{ expectedVersion: number; body: string; status: StorePolicyStatus }>;

function pages(): readonly StorePolicyAdminPage[] {
  return FIXED_STOREFRONT_POLICIES.map((definition, index) => ({
    ...definition, ordinal: index + 1, status: "draft", body: `Sunucudaki ${definition.label} metni`,
    version: 3, createdAt: NOW, updatedAt: NOW,
  }));
}

function policyModule(api: Record<string, unknown>) {
  const BodyField = ({ value, readOnly, onValueChange }: {
    value: string; readOnly?: boolean; onValueChange: (value: string) => void;
  }) => createElement("textarea", {
    "aria-label": "Politika metni", value, readOnly,
    onChange: (event: { target: { value: string } }) => onValueChange(event.target.value),
  });
  const Preview = ({ source }: { source: string }) => createElement("div", { "data-policy-preview": true }, source);
  return compile("components/content/PolicyConsole.tsx", {
    "@celebix/platform-config/src/product-description-rich-text": { normalizeProductDescriptionRichText },
    "@/components/panel/PanelPageShell": {
      PanelPageShell: ({ children }: { children: ReactNode }) => createElement("section", null, children),
      PanelSkeletonBlock: () => createElement("span", { "aria-hidden": true }),
    },
    "@/lib/store-policy-ui/client": { StorePolicyApiError, storePolicyApi: api },
    "@/components/catalog/ProductDescriptionPreview": { ProductDescriptionPreview: Preview },
    "@/components/catalog/ProductDescriptionField": { ProductDescriptionPreview: Preview },
    "./PolicyBodyField": { PolicyBodyField: BodyField },
    "next/dynamic": { __esModule: true, default: () => BodyField },
  });
}

function textField(host: HTMLElement): HTMLTextAreaElement {
  const field = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Politika metni"]');
  assert.ok(field, "The actual console must expose its controlled body editor");
  return field;
}

function saveButton(host: HTMLElement): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === "Kaydet" || node.textContent === "Kaydediliyor…");
  assert.ok(button, "Missing save action");
  return button;
}

function published(host: HTMLElement): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('input[type="checkbox"][name="policy-publication"]');
  assert.ok(input, "Published status must remain available as a native labeled control");
  return input;
}

async function write(window: Window, host: HTMLElement, value: string) {
  await act(async () => {
    const textarea = textField(host);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(textarea, value);
    textarea.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event);
    textarea.dispatchEvent(new window.Event("change", { bubbles: true }) as unknown as Event);
  });
}

async function select(host: HTMLElement, key: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[data-policy-key="${key}"]`);
  assert.ok(button, `Missing policy navigation for ${key}`);
  await act(async () => button.click());
}

async function choosePublished(host: HTMLElement) {
  if (!published(host).checked) await act(async () => published(host).click());
}

async function recover(host: HTMLElement) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => /Güncel sürümü al|Sonucu doğrula|Kaydı kontrol et|Yeniden kontrol et/.test(node.textContent ?? ""));
  assert.ok(button, "A blocked policy must offer a read-only recovery action");
  await act(async () => button.click());
}

test("switching fixed policies keeps each unsaved body and publication choice independently", async () => {
  const initial = pages();
  const { PolicyConsole } = policyModule({ list: async () => initial });
  await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
    assert.equal(textField(host).value, initial[0].body);
    await write(window, host, "Birinci korunacak taslak");
    await choosePublished(host);
    await select(host, "kvkk");
    assert.equal(textField(host).value, initial[2].body);
    await write(window, host, "İkinci korunacak taslak");
    await act(async () => published(host).click());
    await select(host, "privacy_security");
    assert.equal(textField(host).value, "Birinci korunacak taslak");
    assert.equal(published(host).checked, true);
    await select(host, "kvkk");
    assert.equal(textField(host).value, "İkinci korunacak taslak");
    assert.equal(published(host).checked, false);
  });
});

test("save uses the selected canonical version and trims the body before transport", async () => {
  const initial = pages();
  const saves: SaveInput[] = [];
  const { PolicyConsole } = policyModule({
    list: async () => initial,
    save: async (_key: string, input: SaveInput) => { saves.push(input); return { ...initial[0], ...input, version: 4 }; },
  });
  await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
    assert.equal(published(host).checked, true);
    await write(window, host, "  Mağazanın korunacak metni\n\n ");
    await choosePublished(host);
    await click(host, "Kaydet");
    assert.deepEqual(saves, [{ expectedVersion: 3, body: "Mağazanın korunacak metni", status: "published" }]);
    assert.equal(textField(host).value, "Mağazanın korunacak metni");
    assert.equal(saveButton(host).disabled, true);
    await select(host, "kvkk");
    await select(host, "privacy_security");
    assert.equal(textField(host).value, "Mağazanın korunacak metni");
    assert.equal(published(host).checked, true);
  });
});

test("blank published content and bodies above the UTF-8 byte limit never dispatch a save", async () => {
  let saves = 0;
  const { PolicyConsole } = policyModule({ list: async () => pages(), save: async () => { saves++; } });
  await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
    await write(window, host, "  \n ");
    await choosePublished(host);
    assert.equal(saveButton(host).disabled, true);
    await click(host, "Kaydet");
    assert.equal(saves, 0);
    for (const emptyHtml of ["<p></p>", "<p><br></p>", "<p>&nbsp;</p>", "<ul><li><p><br></p></li></ul>"]) {
      await write(window, host, emptyHtml);
      assert.equal(saveButton(host).disabled, true, `${emptyHtml} has no readable published content`);
      await click(host, "Kaydet");
      assert.equal(saves, 0);
      assert.match(host.textContent ?? "", /Yayınlamak için metin ekleyin/);
    }
    await write(window, host, "ü".repeat(50_000));
    assert.equal(saveButton(host).disabled, false, "100,000 UTF-8 bytes is an allowed body");
    await write(window, host, "ü".repeat(50_000) + "a");
    assert.equal(saveButton(host).disabled, true, "One byte beyond the bound must block mutation");
    await click(host, "Kaydet");
    assert.equal(saves, 0);
    assert.ok(host.querySelector('[role="alert"]'), "The oversized body needs visible validation");
  });
});

test("a rejected save preserves the entered body and status across policy switches", async () => {
  const { PolicyConsole } = policyModule({ list: async () => pages(), save: async () => { throw new StorePolicyApiError("unavailable", 503); } });
  await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
    await write(window, host, "Başarısız kayıtta korunacak taslak");
    await choosePublished(host);
    await click(host, "Kaydet");
    assert.equal(textField(host).value, "Başarısız kayıtta korunacak taslak");
    assert.equal(published(host).checked, true);
    assert.ok(host.querySelector('[role="alert"]'));
    await select(host, "kvkk");
    await select(host, "privacy_security");
    assert.equal(textField(host).value, "Başarısız kayıtta korunacak taslak");
    assert.equal(published(host).checked, true);
    assert.equal(saveButton(host).disabled, false);
  });
});

test("successful conflict refresh retains the merchant draft and resaves against the fresh version", async () => {
  const initial = pages();
  const saves: SaveInput[] = [];
  const fresh = { ...initial[0], body: "Başka oturumun metni", version: 4 };
  const { PolicyConsole } = policyModule({
    list: async () => initial,
    get: async () => fresh,
    save: async (_key: string, input: SaveInput) => {
      saves.push(input);
      if (saves.length === 1) throw new StorePolicyApiError("version_conflict", 409);
      return { ...fresh, ...input, version: 5 };
    },
  });
  await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
    await write(window, host, "Çakışmada korunacak taslak");
    await choosePublished(host);
    await click(host, "Kaydet");
    assert.equal(textField(host).value, "Çakışmada korunacak taslak");
    assert.equal(published(host).checked, true);
    assert.ok(host.querySelector('[role="alert"]'));
    await select(host, "kvkk");
    await select(host, "privacy_security");
    await click(host, "Kaydet");
    assert.deepEqual(saves.map(({ expectedVersion }) => expectedVersion), [3, 4]);
    assert.deepEqual(saves[1], { expectedVersion: 4, body: "Çakışmada korunacak taslak", status: "published" });
  });
});

test("failed conflict refresh survives switching away and blocks resave until explicit read recovery", async () => {
  const initial = pages();
  const saves: SaveInput[] = [];
  let reads = 0;
  const { PolicyConsole } = policyModule({
    list: async () => initial,
    get: async () => { if (++reads === 1) throw new StorePolicyApiError("unavailable", 503); return { ...initial[0], version: 4 }; },
    save: async (_key: string, input: SaveInput) => {
      saves.push(input);
      if (saves.length === 1) throw new StorePolicyApiError("version_conflict", 409);
      return { ...initial[0], ...input, version: 5 };
    },
  });
  await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
    await write(window, host, "Yenilemede korunacak taslak");
    await choosePublished(host);
    await click(host, "Kaydet");
    assert.equal(reads, 1);
    assert.equal(saveButton(host).disabled, true);
    await select(host, "kvkk");
    await select(host, "privacy_security");
    assert.equal(textField(host).value, "Yenilemede korunacak taslak");
    assert.equal(published(host).checked, true);
    assert.equal(saveButton(host).disabled, true);
    await click(host, "Kaydet");
    assert.equal(saves.length, 1);
    await recover(host);
    assert.equal(reads, 2);
    assert.equal(saveButton(host).disabled, false);
    assert.equal(textField(host).value, "Yenilemede korunacak taslak");
    await click(host, "Kaydet");
    assert.deepEqual(saves[1], { expectedVersion: 4, body: "Yenilemede korunacak taslak", status: "published" });
  });
});

test("an unknown commit cannot be resubmitted before a canonical read succeeds", async () => {
  const initial = pages();
  let saves = 0;
  let reads = 0;
  const { PolicyConsole } = policyModule({
    list: async () => initial,
    get: async () => { if (++reads === 1) throw new StorePolicyApiError("unavailable", 503); return { ...initial[0], version: 4 }; },
    save: async (_key: string, input: SaveInput) => {
      saves++;
      if (saves === 1) throw new StorePolicyApiError("commit_unknown", 503);
      return { ...initial[0], ...input, version: 5 };
    },
  });
  await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
    await write(window, host, "Sonucu belirsiz kayıtta korunacak taslak");
    await click(host, "Kaydet");
    assert.equal(saveButton(host).disabled, true);
    await select(host, "kvkk");
    await select(host, "privacy_security");
    assert.equal(textField(host).value, "Sonucu belirsiz kayıtta korunacak taslak");
    assert.equal(saveButton(host).disabled, true);
    await click(host, "Kaydet");
    assert.equal(saves, 1);
    // The first recovery may be automatic or explicit. Both must fail closed.
    if (reads === 0) await recover(host);
    assert.equal(reads, 1);
    assert.equal(saveButton(host).disabled, true);
    await recover(host);
    assert.equal(reads, 2);
    assert.equal(saveButton(host).disabled, false);
    assert.equal(textField(host).value, "Sonucu belirsiz kayıtta korunacak taslak");
  });
});

test("recovery of an already-committed body clears pending changes without a second mutation", async () => {
  const initial = pages();
  let saves = 0;
  const draft = "Sunucuda tamamlanmış kayıt";
  const { PolicyConsole } = policyModule({
    list: async () => initial,
    get: async () => ({ ...initial[0], body: draft, status: "published", version: 4 }),
    save: async () => { saves++; throw new StorePolicyApiError("commit_unknown", 503); },
  });
  await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
    await write(window, host, draft);
    await choosePublished(host);
    await click(host, "Kaydet");
    if (host.querySelector('[role="alert"]')) await recover(host);
    assert.equal(textField(host).value, draft);
    assert.equal(published(host).checked, true);
    assert.equal(saveButton(host).disabled, true);
    await click(host, "Kaydet");
    assert.equal(saves, 1);
  });
});

test("pending save locks editing and navigation and ignores duplicate requests until reconciliation", async () => {
  const initial = pages();
  let saves = 0;
  let finish!: (page: StorePolicyAdminPage) => void;
  const pending = new Promise<StorePolicyAdminPage>((resolve) => { finish = resolve; });
  const { PolicyConsole } = policyModule({ list: async () => initial, save: async () => { saves++; return pending; } });
  await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
    await write(window, host, "Bekleyen kayıt taslağı");
    await act(async () => { saveButton(host).click(); saveButton(host).click(); });
    assert.equal(saves, 1);
    assert.equal(textField(host).readOnly, true);
    assert.equal(saveButton(host).disabled, true);
    assert.equal((host.querySelector('button[data-policy-key="kvkk"]') as HTMLButtonElement | null)?.disabled, true);
    await select(host, "kvkk");
    assert.equal(textField(host).value, "Bekleyen kayıt taslağı");
    await act(async () => finish({ ...initial[0], body: "Bekleyen kayıt taslağı", version: 4 }));
    assert.equal(textField(host).readOnly, false);
    assert.equal(saveButton(host).disabled, true);
  });
});

test("pending canonical conflict read keeps draft and selection locked until the read settles", async () => {
  const initial = pages();
  let reads = 0;
  let finish!: (page: StorePolicyAdminPage) => void;
  const pending = new Promise<StorePolicyAdminPage>((resolve) => { finish = resolve; });
  const { PolicyConsole } = policyModule({
    list: async () => initial,
    get: async () => { reads++; return pending; },
    save: async () => { throw new StorePolicyApiError("version_conflict", 409); },
  });
  await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
    await write(window, host, "Bekleyen güncel sürümde korunacak taslak");
    await click(host, "Kaydet");
    assert.equal(reads, 1);
    assert.equal(textField(host).readOnly, true);
    assert.equal(saveButton(host).disabled, true);
    await select(host, "kvkk");
    assert.equal(textField(host).value, "Bekleyen güncel sürümde korunacak taslak");
    await act(async () => finish({ ...initial[0], body: "Başka oturumun metni", version: 4 }));
    assert.equal(textField(host).readOnly, false);
    assert.equal(textField(host).value, "Bekleyen güncel sürümde korunacak taslak");
    assert.equal(saveButton(host).disabled, false);
  });
});

test("list refresh and canonical recovery cannot race while a retained unknown commit is blocked", async () => {
  const initial = pages();
  let lists = 0;
  let reads = 0;
  let finish!: (items: readonly StorePolicyAdminPage[]) => void;
  const pending = new Promise<readonly StorePolicyAdminPage[]>((resolve) => { finish = resolve; });
  const { PolicyConsole } = policyModule({
    list: async () => { lists++; return lists === 1 ? initial : pending; },
    get: async () => { reads++; return { ...initial[0], version: 4 }; },
    save: async () => { throw new StorePolicyApiError("commit_unknown", 503); },
  });
  await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
    await write(window, host, "Liste yenilenirken korunacak metin");
    await click(host, "Kaydet");
    await click(host, "Yenile");
    const recovery = [...host.querySelectorAll("button")].find((node: HTMLButtonElement) => node.textContent === "Sonucu doğrula");
    assert.equal(recovery?.disabled, true);
    await recover(host);
    assert.equal(reads, 0);
    assert.equal(saveButton(host).disabled, true);
    assert.equal(textField(host).readOnly, true);
    await act(async () => finish(initial.map((page) => ({ ...page, version: 4 }))));
    assert.equal(textField(host).value, "Liste yenilenirken korunacak metin");
    assert.equal(saveButton(host).disabled, true);
    await recover(host);
    assert.equal(reads, 1);
    assert.equal(textField(host).value, "Liste yenilenirken korunacak metin");
    assert.equal(saveButton(host).disabled, false);
  });
});

test("read-only members can inspect every fixed policy but cannot save or alter status", async () => {
  let saves = 0;
  const initial = pages();
  const { PolicyConsole } = policyModule({ list: async () => initial, save: async () => { saves++; } });
  await mounted(PolicyConsole, { canManage: false }, async (host) => {
    assert.equal(textField(host).readOnly, true);
    assert.equal([...host.querySelectorAll("button")].some((node) => node.textContent === "Kaydet"), false);
    assert.equal(published(host).closest("fieldset")?.disabled, true);
    await choosePublished(host);
    assert.equal(published(host).checked, false);
    await select(host, "kvkk");
    assert.equal(textField(host).value, initial[2].body);
    assert.equal(textField(host).readOnly, true);
    assert.equal(saves, 0);
  });
});

test("returning to the same opaque scope restores drafts and uses freshly loaded save versions", async () => {
  let canonical = pages();
  const saves: SaveInput[] = [];
  const { PolicyConsole } = policyModule({
    list: async () => canonical,
    save: async (key: string, input: SaveInput) => {
      saves.push(input);
      const saved = { ...canonical.find((page) => page.key === key)!, body: input.body, status: input.status, version: input.expectedVersion + 1 };
      canonical = canonical.map((page) => page.key === key ? saved : page);
      return saved;
    },
  });
  const props = { canManage: true, recoveryScope: "opaque-policy-return-a" };
  await mounted(PolicyConsole, props, async (host, window) => {
    await write(window, host, "Gezinmeden sonra korunacak metin");
    await choosePublished(host);
  });
  await mounted(PolicyConsole, props, async (host) => {
    assert.equal(textField(host).value, "Gezinmeden sonra korunacak metin");
    assert.equal(published(host).checked, true);
    assert.equal(saveButton(host).disabled, false);
    await click(host, "Kaydet");
    assert.equal(saves[0].expectedVersion, 3);
  });
  await mounted(PolicyConsole, props, async (host, window) => {
    assert.equal(textField(host).value, "Gezinmeden sonra korunacak metin");
    assert.equal(saveButton(host).disabled, true, "Confirmed saves cannot reappear as unsaved recovery drafts");
    await write(window, host, "Yeni sürümde ikinci metin");
    await click(host, "Kaydet");
    assert.deepEqual(saves.map((input) => input.expectedVersion), [3, 4]);
  });
});

test("different opaque scopes and read-only mounts never restore another editor's draft", async () => {
  const initial = pages();
  const { PolicyConsole } = policyModule({ list: async () => initial });
  await mounted(PolicyConsole, { canManage: true, recoveryScope: "opaque-policy-isolation-a" }, async (host, window) => {
    await write(window, host, "Yalnız ilk kapsama ait metin");
    await choosePublished(host);
  });
  await mounted(PolicyConsole, { canManage: true, recoveryScope: "opaque-policy-isolation-b" }, async (host) => {
    assert.equal(textField(host).value, initial[0].body);
    assert.equal(published(host).checked, true);
    assert.equal(saveButton(host).disabled, false);
  });
  await mounted(PolicyConsole, { canManage: false, recoveryScope: "opaque-policy-isolation-a" }, async (host) => {
    assert.equal(textField(host).value, initial[0].body);
    assert.equal(textField(host).readOnly, true);
    assert.equal(published(host).checked, false);
  });
  await mounted(PolicyConsole, { canManage: true, recoveryScope: "opaque-policy-isolation-a" }, async (host) => {
    assert.equal(textField(host).value, "Yalnız ilk kapsama ait metin");
    assert.equal(published(host).checked, true);
  });
});

test("a recovered draft with a changed canonical version stays blocked until explicit canonical read", async () => {
  let canonical = pages();
  let reads = 0;
  const saves: SaveInput[] = [];
  const { PolicyConsole } = policyModule({
    list: async () => canonical,
    get: async () => { reads++; return { ...canonical[0], version: 5, body: "Güncel sunucu metni" }; },
    save: async (_key: string, input: SaveInput) => { saves.push(input); return { ...canonical[0], body: input.body, status: input.status, version: 6 }; },
  });
  const props = { canManage: true, recoveryScope: "opaque-policy-changed-canonical" };
  await mounted(PolicyConsole, props, async (host, window) => {
    await write(window, host, "Dönüşte korunacak eski sürüm taslağı");
    await choosePublished(host);
  });
  canonical = canonical.map((page, index) => index === 0 ? { ...page, body: "Başka oturumdaki kayıt", version: 4 } : page);
  await mounted(PolicyConsole, props, async (host) => {
    assert.equal(textField(host).value, "Dönüşte korunacak eski sürüm taslağı");
    assert.equal(published(host).checked, true);
    assert.equal(reads, 0);
    assert.equal(saveButton(host).disabled, true);
    await click(host, "Kaydet");
    assert.equal(saves.length, 0);
    assert.ok(host.querySelector('[role="alert"]'));
    await recover(host);
    assert.equal(reads, 1);
    assert.equal(textField(host).value, "Dönüşte korunacak eski sürüm taslağı");
    assert.equal(saveButton(host).disabled, false);
    await click(host, "Kaydet");
    assert.deepEqual(saves[0], { expectedVersion: 5, body: "Dönüşte korunacak eski sürüm taslağı", status: "published" });
  });
});

test("policy save publishes directly while explicit hiding stays available", async () => {
 const initial = pages(), saves: SaveInput[] = [];
 const { PolicyConsole } = policyModule({ list: async () => initial, save: async (_key: string, input: SaveInput) => { saves.push(input); return { ...initial[0], ...input, version: 4 }; } });
 await mounted(PolicyConsole, { canManage: true }, async (host, window) => {
  assert.equal(published(host).checked, true);
  await write(window, host, "Yeni politika metni");
  await click(host, "Kaydet");
  assert.equal(saves[0].status, "published");
  await act(async () => published(host).click());
  await click(host, "Kaydet");
  assert.equal(saves[1].status, "draft");
 });
});
