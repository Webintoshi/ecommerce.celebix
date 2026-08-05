import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PANEL_NAVIGATION } from "./panel-ui/navigation.ts";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("settings navigation has one appearance destination and no legacy banner siblings", () => {
  const settings = PANEL_NAVIGATION.find(({ key }) => key === "settings");
  assert.deepEqual(settings?.children?.map(({ label, href }) => ({ label, href })), [
    { label: "Genel", href: "/settings/general" },
    { label: "Alan Adı", href: "/settings/domains" },
    { label: "Dil", href: "/settings/language" },
    { label: "Yöneticiler", href: "/settings/administrators" },
    { label: "Ödeme", href: "/settings/payment" },
    { label: "Kargo", href: "/settings/shipping" },
    { label: "Bildirimler", href: "/settings/notifications" },
    { label: "Yapay Zeka", href: "/settings/artificial-intelligence" },
    { label: "Tasarım", href: "/settings/design" },
  ]);
});

test("settings index is a quiet grouped row workspace without decorative card copy", async () => {
  const component = await source("components/merchant-admin/MerchantFamilyOverview.tsx");
  const css = await source("components/merchant-admin/merchant-family-overview.module.css");
  for (const label of ["Mağaza", "Satış ve teslimat", "İletişim ve otomasyon", "Görünüm"]) assert.match(component, new RegExp(`"${label}"`));
  for (const label of ["Genel", "Alan Adı", "Dil", "Yöneticiler", "Ödeme", "Kargo", "Bildirimler", "Yapay Zeka", "Tasarım"]) assert.match(component, new RegExp(`"${label}"`));
  assert.doesNotMatch(component, /Hero Banner|Promosyon Banner|Kayan Duyuru|Vitrin, banner/);
  assert.match(component, /styles[.]settingsGroups/);
  assert.match(component, /styles[.]settingsRow/);
  assert.match(css, /border-bottom:/);
  assert.match(css, /min-height:\s*64px/);
  assert.doesNotMatch(css, /\.settingsRow\s*\{[^}]*box-shadow/s);
});
