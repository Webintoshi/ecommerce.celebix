import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyDesignEdit, beginDesignSave, completeDesignSave, createDesignEditorState } from "./workspace-model.ts";

const NOW = "2026-08-03T09:00:00.000Z";
const DESIGN = { schemaVersion: 1, brand: { logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" }, hero: { headline: "Güzide Kuyumcu", body: "Zamansız tasarımlar", image: null, destination: { kind: "none" }, enabled: true }, promotion: { headline: "Yeni sezon", body: "", destination: { kind: "none" }, startsAt: null, endsAt: null, enabled: false }, announcement: { items: ["Ücretsiz kargo"], icon: "truck", speed: "normal", direction: "left", animation: "continuous", enabled: true } } as const;
const PUBLIC = { schemaVersion: 1, publicationVersion: 1, publishedAt: NOW, brand: DESIGN.brand, hero: { ...DESIGN.hero, destination: null }, promotion: { ...DESIGN.promotion, destination: null }, announcement: DESIGN.announcement } as const;
const WORKSPACE = { schemaVersion: 1, draftVersion: 1, publishedVersion: 1, draftUpdatedAt: NOW, publishedAt: NOW, draft: DESIGN, published: PUBLIC, store: { name: "Güzide Kuyumcu", timezone: "Europe/Istanbul" }, media: [], destinations: [] } as const;

test("editor state never reports a newer local edit as saved by an older request", () => {
  const initial = createDesignEditorState(WORKSPACE);
  const first = applyDesignEdit(initial, { ...DESIGN, hero: { ...DESIGN.hero, headline: "İlk" } });
  const saving = beginDesignSave(first);
  const newer = applyDesignEdit(saving.state, { ...DESIGN, hero: { ...DESIGN.hero, headline: "Daha yeni" } });
  const completed = completeDesignSave(newer, saving.token, { draftVersion: 2, draftUpdatedAt: NOW, draft: saving.token.design });
  assert.equal(completed.status, "dirty");
  assert.equal(completed.draftVersion, 2);
  assert.equal(completed.design.hero.headline, "Daha yeni");
});

test("workspace source exposes six child-friendly sections, truthful save states and one shared preview", async () => {
  const [workspace, inspector, preview, css] = await Promise.all([
    readFile(new URL("./DesignWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("./DesignInspector.tsx", import.meta.url), "utf8"),
    readFile(new URL("./DesignPreview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../design-settings.module.css", import.meta.url), "utf8"),
  ]);
  for (const label of ["Marka", "Renkler", "Yazı", "Ana sayfa", "Promosyon", "Duyuru"]) assert.match(workspace, new RegExp(`"${label}"`));
  for (const state of ["Kaydediliyor", "Taslak kaydedildi", "Yayınlanmamış değişiklik", "Kaydedilemedi"]) assert.match(workspace, new RegExp(state));
  assert.match(workspace, /PanelTopbarBridge/);
  assert.match(workspace, /Masaüstü/);
  assert.match(workspace, /Mobil/);
  assert.match(workspace, /Yayınla/);
  assert.match(preview, /StorefrontDesignRenderer/);
  assert.match(inspector, /Görsel yükle/);
  assert.match(inspector, /showUpload={false}/);
  assert.match(inspector, /Varsayılana dön/);
  assert.match(inspector, /Bağlantı yok/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /\.workspace\s*\{[^}]*grid-template-columns:\s*320px minmax\(0, 1fr\)/s);
  assert.match(css, /\.sectionRail\s*\{[^}]*flex-direction:\s*row/s);
  assert.doesNotMatch(css, /\.sectionRail\s*\{[^}]*border-right:/s);
  assert.doesNotMatch(`${workspace}\n${inspector}\n${preview}`, /localStorage|sessionStorage|x-store-id|tenantContext|dangerouslySetInnerHTML/);
});

test("design page loads durable workspace server-side and legacy appearance pages only redirect", async () => {
  const page = await readFile(new URL("../../../app/settings/design/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireServerPanelAccess\(\)/);
  assert.match(page, /resolveDefaultServerStorefrontDesignRuntime/);
  assert.match(page, /repository[.]getWorkspace/);
  assert.match(page, /<DesignWorkspace/);
  assert.doesNotMatch(page, /storeId=|tenantContext=|localStorage|sessionStorage/);
  for (const [name, section] of [["hero-banner", "hero"], ["promotion-banner", "promotion"], ["marquee", "announcement"]] as const) {
    const legacy = await readFile(new URL(`../../../app/settings/${name}/page.tsx`, import.meta.url), "utf8");
    assert.match(legacy, new RegExp(`redirect\\(\"/settings/design\\?section=${section}\"\\)`));
    assert.doesNotMatch(legacy, /MerchantSingletonWorkspace|MerchantModuleConsole|kind=/);
  }
});
